import asyncio
import base64
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from fastapi import HTTPException
import httpx

from config import GITHUB_TOKEN
from models.analysis import ContextFile


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
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}"
    resp = await client.get(url, headers=get_github_headers())
    _handle_github_error(resp)
    return resp.json()


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
    resp = await client.get(url, headers=get_github_headers(), params={"ref": ref})
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
    resp = await client.get(url, headers=get_github_headers(), params={"recursive": "1"})
    _handle_github_error(resp)
    data = resp.json()
    return data.get("tree", [])


def extract_changed_identifiers(patches: List[str]) -> Set[str]:
    """Extract modified function, class, and variable identifiers from diff patches."""
    identifiers: Set[str] = set()
    keywords = {
        "if", "else", "elif", "for", "while", "try", "except", "finally", "with",
        "return", "yield", "pass", "break", "continue", "import", "from", "as",
        "def", "class", "async", "await", "function", "const", "let", "var", "export",
        "default", "interface", "type", "true", "false", "null", "undefined", "none",
        "self", "this", "new", "throw", "catch", "case", "switch", "match", "test",
    }

    # Patterns for added/removed lines
    js_patterns = [
        re.compile(r"(?:export\s+)?(?:default\s+)?function\s+([A-Za-z0-9_$]+)"),
        re.compile(r"(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*="),
        re.compile(r"(?:export\s+)?class\s+([A-Za-z0-9_$]+)"),
    ]
    py_patterns = [
        re.compile(r"(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\("),
        re.compile(r"class\s+([A-Za-z0-9_]+)\s*[:\(]"),
    ]

    for patch in patches:
        if not patch:
            continue
        for line in patch.splitlines():
            # Check added or removed lines only (skip diff headers +++ and ---)
            if not ((line.startswith("+") and not line.startswith("+++")) or (line.startswith("-") and not line.startswith("---"))):
                continue
            code_line = line[1:].strip()
            for pattern in js_patterns + py_patterns:
                for match in pattern.finditer(code_line):
                    ident = match.group(1).strip()
                    if ident and len(ident) > 2 and ident.lower() not in keywords:
                        identifiers.add(ident)

    return identifiers


async def find_callers(
    client: httpx.AsyncClient,
    owner: str,
    repo: str,
    ref: str,
    changed_files: List[str],
    patches: List[str],
) -> List[ContextFile]:
    """Find source files outside the PR that reference changed identifiers."""
    identifiers = extract_changed_identifiers(patches)
    if not identifiers:
        return []

    try:
        tree = await get_repo_tree(client, owner, repo, ref)
    except Exception:
        return []

    source_exts = (".js", ".jsx", ".ts", ".tsx", ".py")
    skip_substrings = (
        "node_modules/", "dist/", "build/", ".git/", ".venv/", "venv/",
        "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    )

    changed_set = set(changed_files)
    candidates: List[str] = []

    for item in tree:
        if item.get("type") != "blob":
            continue
        path: str = item.get("path", "")
        if path in changed_set:
            continue
        if any(skip in path for skip in skip_substrings):
            continue
        if path.lower().endswith(source_exts):
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

            for ident in identifiers:
                # Word-boundary check
                pattern = rf"\b{re.escape(ident)}\b"
                if re.search(pattern, content):
                    lines = content.splitlines()[:200]
                    truncated = "\n".join(lines)
                    return ContextFile(
                        filename=candidate_path,
                        reason=f"references '{ident}'",
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
        resp = await client.post(url, headers=headers, json=ref_payload)
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

    # Check for existing sha on the target branch
    existing_sha: Optional[str] = None
    check_resp = await client.get(contents_url, headers=headers, params={"ref": branch})
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

    put_resp = await client.put(contents_url, headers=headers, json=payload)
    _handle_github_error(put_resp)
    data = put_resp.json()
    return data.get("commit", {}).get("sha", "")
