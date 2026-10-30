from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from db import get_db
from models.analysis import AnalysisModel, FileDiff, ScanRequest, serialize_mongo_doc
from utils.ai import analyze_diff_with_ai
from utils.github import find_callers, get_pr, list_pr_files, parse_repo_url

router = APIRouter(prefix="", tags=["Scan"])


@router.post("/scan", response_model=AnalysisModel)
async def scan_pull_request(
    payload: ScanRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> AnalysisModel:
    """Scan a Pull Request, detect textual/semantic conflicts, and record integrated resolutions."""
    owner, repo = parse_repo_url(payload.repo_url)

    async with httpx.AsyncClient(timeout=60.0) as client:
        # 1. Fetch PR details
        pr = await get_pr(client, owner, repo, payload.pr_number)

        # 2. Fetch modified PR files
        raw_files = await list_pr_files(client, owner, repo, payload.pr_number)

        diff_files: List[FileDiff] = []
        changed_filenames: List[str] = []
        patches: List[str] = []

        for rf in raw_files:
            filename = rf.get("filename", "")
            status = rf.get("status", "modified")
            patch = rf.get("patch")
            diff_files.append(FileDiff(filename=filename, status=status, patch=patch))
            changed_filenames.append(filename)
            if patch:
                patches.append(patch)

        # 3. Caller-context identification on the base branch
        base_sha = pr.get("base", {}).get("sha", "")
        context_files = await find_callers(
            client=client,
            owner=owner,
            repo=repo,
            ref=base_sha,
            changed_files=changed_filenames,
            patches=patches,
        )

    # 4. Analyze diffs + context via Gemini LLM
    pr_title = pr.get("title", f"PR #{payload.pr_number}")
    ai_result = await analyze_diff_with_ai(pr_title, diff_files, context_files)

    # 5. Build and persist Analysis document
    analysis = AnalysisModel(
        repo_owner=owner,
        repo_name=repo,
        pr_number=payload.pr_number,
        pr_title=pr_title,
        base_branch=pr.get("base", {}).get("ref", "main"),
        compare_branch=pr.get("head", {}).get("ref", ""),
        conflict_type=ai_result.conflict_type,
        risk_score=ai_result.risk_score,
        explanation=ai_result.explanation,
        file_diffs=diff_files,
        context_files=context_files,
        resolved_files=ai_result.resolved_files,
        test_assertions=ai_result.test_assertions,
        integration_status="PENDING",
        integration_branch=None,
        created_at=datetime.now(timezone.utc),
    )

    doc_to_insert = analysis.model_dump(by_alias=True, exclude={"id"})
    result = await db["analyses"].insert_one(doc_to_insert)
    analysis.id = str(result.inserted_id)

    return analysis
