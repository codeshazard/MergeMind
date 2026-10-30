from typing import Any, Dict, List
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from db import get_db
from models.analysis import IntegrateRequest
from utils.github import commit_file, create_ref, get_github_headers

router = APIRouter(prefix="", tags=["Integrate"])


class IntegrateResponse(BaseModel):
    success: bool
    branch: str
    commit_sha: str
    files_committed: List[str]


@router.post("/integrate", response_model=IntegrateResponse)
async def integrate_resolution(
    payload: IntegrateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> IntegrateResponse:
    """Create an integration branch on GitHub and commit all clean resolved files."""
    if not ObjectId.is_valid(payload.analysis_id):
        raise HTTPException(status_code=400, detail="Invalid analysis ID format")

    analysis_doc = await db["analyses"].find_one({"_id": ObjectId(payload.analysis_id)})
    if not analysis_doc:
        raise HTTPException(status_code=404, detail="Analysis record not found")

    if analysis_doc.get("integration_status") == "BRANCH_CREATED":
        existing_branch = analysis_doc.get("integration_branch", "")
        raise HTTPException(
            status_code=409,
            detail=f"Integration branch already created for this analysis: {existing_branch}",
        )

    owner: str = analysis_doc["repo_owner"]
    repo: str = analysis_doc["repo_name"]
    base_branch: str = analysis_doc["base_branch"]
    pr_number: int = analysis_doc["pr_number"]
    conflict_type: str = analysis_doc["conflict_type"]
    resolved_files: List[Dict[str, Any]] = analysis_doc.get("resolved_files", [])

    if not resolved_files:
        raise HTTPException(status_code=400, detail="No resolved files found in analysis to commit")

    async with httpx.AsyncClient(timeout=60.0) as client:
        # 1. Fetch latest commit SHA of base branch
        base_ref_url = f"https://api.github.com/repos/{owner}/{repo}/git/ref/heads/{base_branch}"
        headers = get_github_headers()
        base_resp = await client.get(base_ref_url, headers=headers)
        if base_resp.is_error:
            raise HTTPException(
                status_code=base_resp.status_code,
                detail=f"Failed to fetch base branch ref '{base_branch}': {base_resp.text}",
            )

        base_data = base_resp.json()
        base_sha = base_data.get("object", {}).get("sha")
        if not base_sha:
            raise HTTPException(status_code=500, detail="Failed to retrieve latest commit SHA for base branch")

        # 2. Create integration branch (mergemind/patch-pr-{pr_number})
        base_branch_name = f"mergemind/patch-pr-{pr_number}"
        created_branch = await create_ref(client, owner, repo, base_branch_name, base_sha)

        # 3. Commit each resolved file to the new branch
        last_commit_sha = ""
        committed_filenames: List[str] = []

        commit_message = f"MergeMind: resolve PR #{pr_number} ({conflict_type})"

        for rf in resolved_files:
            fname = rf.get("filename")
            content = rf.get("content", "")
            if not fname:
                continue

            last_commit_sha = await commit_file(
                client=client,
                owner=owner,
                repo=repo,
                branch=created_branch,
                path=fname,
                content=content,
                commit_message=commit_message,
            )
            committed_filenames.append(fname)

    # 4. Update MongoDB status
    await db["analyses"].update_one(
        {"_id": ObjectId(payload.analysis_id)},
        {
            "$set": {
                "integration_status": "BRANCH_CREATED",
                "integration_branch": created_branch,
            }
        },
    )

    return IntegrateResponse(
        success=True,
        branch=created_branch,
        commit_sha=last_commit_sha,
        files_committed=committed_filenames,
    )
