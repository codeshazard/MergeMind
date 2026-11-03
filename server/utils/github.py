import asyncio
import base64
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from fastapi import HTTPException
import httpx

from config import GITHUB_TOKEN
from models.analysis import ContextFile
from utils.rules import (
    check_file_caller,
    extract_called_identifiers,
    extract_changed_identifiers,
    extract_module_names,
    matches_definition,
)

# Standard HTTP client timeout configuration
HTTP_TIMEOUT = httpx.Timeout(20.0, connect=5.0)

SOURCE_EXTS = (".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py")
SKIP_SUBSTRINGS = (
    "node_modules/", "dist/", "build/", ".git/", ".venv/", "venv/",
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
)


def get_github_headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def parse_repo_url(url: str) -> Tuple[str, str]:
    """Parse GitHub repository URL into (owner, repo). Accepts trailing slash and .git."""
    cleaned = url.strip()
    match = re.match(r"^(?:https?://)?(?:www\.)?github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$", cleaned)
    if not match:
        raise HTTPException(
            status_code=422,
            detail="Invalid GitHub repository URL. Expected format: https://github.com/owner/repo",
        )
    owner, repo = match.group(1), match.group(2)
    return owner, repo


def _handle_github_error(response: httpx.Response) -> None:
    if response.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail="PR or repo not found, or token lacks access",
        )
    if response.status_code in (403, 429):
        raise HTTPException(
            status_code=429,
            detail="GitHub API rate limit exceeded or access forbidden. Check token permissions.",
        )
    if response.is_error:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"GitHub API error: {response.text}",
        )


async def get_pr(client: httpx.AsyncClient, owner: str, repo: str, pull_number: int) -> Dict[str, Any]:
    """
    Fetch PR details. If GitHub has not computed 'mergeable' yet (null),
    retry up to 3 times with a 1-second delay.
    """
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}"
    data: Dict[str, Any] = {}

    for attempt in range(4):  # initial call + up to 3 retries
        resp = await client.get(url, headers=get_github_headers(), timeout=HTTP_TIMEOUT)
        _handle_github_error(resp)
        data = resp.json()
        if data.get("mergeable") is not None or attempt == 3:
            break
        await asyncio.sleep(1.0)

    return data


async def list_pr_files(
    client: httpx.AsyncClient, owner: str, repo: str, pull_number: int
) -> List[Dict[str, Any]]:
    """List files changed in PR, capped at 30 files."""
    files: List[Dict[str, Any]] = []
    page = 1
    per_page = 30
    while len(files) < 30:
        url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}/files"
        resp = await client.get(
            url,
            headers=get_github_headers(),
            params={"page": page, "per_page": per_page},
            timeout=HTTP_TIMEOUT,
        )
        _handle_github_error(resp)
        page_files = resp.json()
        if not page_files:
            break
        files.extend(page_files)
        if len(page_files) < per_page or len(files) >= 30:
            break
        page += 1
    return files[:30]


async def get_file_content(
    client: httpx.AsyncClient, owner: str, repo: str, path: str, ref: str
) -> Tuple[str, str]:
    """Fetch file content from GitHub repository at a specific ref. Returns (text, sha)."""
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    resp = await client.get(url, headers=get_github_headers(), params={"ref": ref}, timeout=HTTP_TIMEOUT)
    if resp.status_code == 404:
        return "", ""
    _handle_github_error(resp)
    data = resp.json()
    sha = data.get("sha", "")
    content_b64 = data.get("content", "")
    try:
        text = base64.b64decode(content_b64).decode("utf-8", errors="replace")
    except Exception:
        text = ""
    return text, sha


async def get_repo_tree(
    client: httpx.AsyncClient, owner: str, repo: str, ref: str
) -> List[Dict[str, Any]]:
    """Fetch recursive git tree at ref."""
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{ref}"
    resp = await client.get(
        url,
        headers=get_github_headers(),
        params={"recursive": "1"},
        timeout=HTTP_TIMEOUT,
    )
    _handle_github_error(resp)
    data = resp.json()
    return data.get("tree", [])


async def find_callers(
    client: httpx.AsyncClient,
    owner: str,
    repo: str,
    ref: str,
    changed_files: List[str],
    patches: List[str],
) -> List[ContextFile]:
    """
    Find source files outside the PR that reference changed identifiers or import changed modules.
    Supports JS, TS, JSX, TSX, MJS, CJS, and Python.
    """
    identifiers = extract_changed_identifiers(patches)
    module_names = extract_module_names(changed_files)

    if not identifiers and not module_names:
        return []

    try:
        tree = await get_repo_tree(client, owner, repo, ref)
    except Exception:
        return []

    changed_set = set(changed_files)
    candidates: List[str] = []

    for item in tree:
        if item.get("type") != "blob":
            continue
        path: str = item.get("path", "")
        if path in changed_set:
            continue
        if any(skip in path for skip in SKIP_SUBSTRINGS):
            continue
        if path.lower().endswith(SOURCE_EXTS):
            candidates.append(path)
            if len(candidates) >= 60:
                break

    if not candidates:
        return []

    semaphore = asyncio.Semaphore(8)
    context_results: List[ContextFile] = []

    async def check_candidate(candidate_path: str) -> Optional[ContextFile]:
        async with semaphore:
            try:
                content, _ = await get_file_content(client, owner, repo, candidate_path, ref)
            except Exception:
                return None

            reason = check_file_caller(content, identifiers, module_names)
            if reason:
                lines = content.splitlines()[:200]
                truncated = "\n".join(lines)
                return ContextFile(
                    filename=candidate_path,
                    reason=reason,
                    content=truncated,
                )
            return None

    tasks = [check_candidate(path) for path in candidates]
    matches = await asyncio.gather(*tasks, return_exceptions=True)

    for res in matches:
        if isinstance(res, ContextFile):
            context_results.append(res)
            if len(context_results) >= 5:
                break

    return context_results[:5]


async def find_definitions(
    client: httpx.AsyncClient,
    owner: str,
    repo: str,
    ref: str,
    patches: List[str],
    exclude_files: List[str],
) -> List[ContextFile]:
    """
    Find source files outside the PR that define functions/classes/constants called by added code (callees).
    Returns at most 3 files, 200 lines each.
    """
    called_names = extract_called_identifiers(patches)
    if not called_names:
        return []

    try:
        tree = await get_repo_tree(client, owner, repo, ref)
    except Exception:
        return []

    excluded_set = set(exclude_files)
    candidates: List[str] = []

    for item in tree:
        if item.get("type") != "blob":
            continue
        path: str = item.get("path", "")
        if path in excluded_set:
            continue
        if any(skip in path for skip in SKIP_SUBSTRINGS):
            continue
        if path.lower().endswith(SOURCE_EXTS):
            candidates.append(path)
            if len(candidates) >= 60:
                break

    if not candidates:
        return []

    semaphore = asyncio.Semaphore(8)
    results: List[ContextFile] = []

    async def check_definition_candidate(candidate_path: str) -> Optional[ContextFile]:
        async with semaphore:
            try:
                content, _ = await get_file_content(client, owner, repo, candidate_path, ref)
            except Exception:
                return None

            for name in called_names:
                if matches_definition(content, name):
                    lines = content.splitlines()[:200]
                    truncated = "\n".join(lines)
                    return ContextFile(
                        filename=candidate_path,
                        reason=f"defines {name}, called by new code in this PR",
                        content=truncated,
                    )
            return None

    tasks = [check_definition_candidate(path) for path in candidates]
    matches = await asyncio.gather(*tasks, return_exceptions=True)

    for res in matches:
        if isinstance(res, ContextFile):
            results.append(res)
            if len(results) >= 3:
                break

    return results[:3]


async def create_ref(
    client: httpx.AsyncClient, owner: str, repo: str, branch_name: str, sha: str
) -> str:
    """Create a new git reference. If 422 already exists, appends numeric suffix."""
    url = f"https://api.github.com/repos/{owner}/{repo}/git/refs"
    headers = get_github_headers()

    target_branch = branch_name
    suffix = 1

    for _ in range(10):
        ref_payload = {"ref": f"refs/heads/{target_branch}", "sha": sha}
        resp = await client.post(url, headers=headers, json=ref_payload, timeout=HTTP_TIMEOUT)
        if resp.status_code in (200, 201):
            return target_branch
        if resp.status_code == 422:
            target_branch = f"{branch_name}-{suffix}"
            suffix += 1
            continue
        _handle_github_error(resp)

    raise HTTPException(status_code=422, detail=f"Failed to create branch {branch_name} after multiple attempts.")


async def commit_file(
    client: httpx.AsyncClient,
    owner: str,
    repo: str,
    branch: str,
    path: str,
    content: str,
    commit_message: str,
) -> str:
    """Commit a single file to a specific branch via GitHub Contents API. Returns commit SHA."""
    headers = get_github_headers()
    contents_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"

    existing_sha: Optional[str] = None
    check_resp = await client.get(contents_url, headers=headers, params={"ref": branch}, timeout=HTTP_TIMEOUT)
    if check_resp.status_code == 200:
        existing_sha = check_resp.json().get("sha")

    encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")
    payload: Dict[str, Any] = {
        "message": commit_message,
        "content": encoded_content,
        "branch": branch,
    }
    if existing_sha:
        payload["sha"] = existing_sha

    put_resp = await client.put(contents_url, headers=headers, json=payload, timeout=HTTP_TIMEOUT)
    _handle_github_error(put_resp)
    data = put_resp.json()
    return data.get("commit", {}).get("sha", "")
