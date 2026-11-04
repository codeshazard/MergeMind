import asyncio
from datetime import datetime, timezone
import logging
import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from db import get_db
from models.analysis import AnalysisModel, ContextFile, FileDiff, ScanRequest
from utils.ai import analyze_diff_with_ai
from utils.github import (
    HTTP_TIMEOUT,
    find_callers,
    find_definitions,
    get_file_content,
    get_pr,
    list_pr_files,
    parse_repo_url,
)
from utils.rules import post_process_conflict_decision

logger = logging.getLogger("mergemind.scan")
router = APIRouter(prefix="", tags=["Scan"])


@router.post("/scan", response_model=AnalysisModel)
async def scan_pull_request(
    payload: ScanRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> AnalysisModel:
    """Scan a Pull Request, detect textual/semantic conflicts, and record integrated resolutions."""
    t_start = time.perf_counter()
    owner, repo = parse_repo_url(payload.repo_url)

    # Stage a: GitHub PR metadata & file diff fetching
    t_stage_a_start = time.perf_counter()
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        pr = await get_pr(client, owner, repo, payload.pr_number)
        base_sha = pr.get("base", {}).get("sha", "")
        head_ref = pr.get("head", {}).get("sha") or pr.get("head", {}).get("ref", "")
        mergeable_state: Optional[str] = pr.get("mergeable_state")

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

    t_stage_a = time.perf_counter() - t_stage_a_start
    logger.info(
        "[Timing] Stage a: GitHub PR metadata & diff fetching (%d files) completed in %.3fs",
        len(diff_files),
        t_stage_a,
    )

    # Stage b: Downstream AST / caller and callee discovery parsing
    t_stage_b_start = time.perf_counter()
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        caller_task = find_callers(
            client=client,
            owner=owner,
            repo=repo,
            ref=base_sha,
            changed_files=changed_filenames,
            patches=patches,
        )
        callee_task = find_definitions(
            client=client,
            owner=owner,
            repo=repo,
            ref=base_sha,
            patches=patches,
            exclude_files=changed_filenames,
        )

        callers, callees = await asyncio.gather(caller_task, callee_task)

        # Merge and deduplicate by filename, capped at 8
        seen_context: set = set()
        context_files: List[ContextFile] = []
        for cf in callers + callees:
            if cf.filename not in seen_context:
                seen_context.add(cf.filename)
                context_files.append(cf)
                if len(context_files) >= 8:
                    break

        dirty_file_pairs: List[Dict[str, str]] = []
        if (mergeable_state or "").lower() == "dirty":
            for f in diff_files[:5]:
                try:
                    base_text, _ = await get_file_content(client, owner, repo, f.filename, base_sha)
                    base_truncated = "\n".join(base_text.splitlines()[:300])
                except Exception:
                    base_truncated = ""
                try:
                    head_text, _ = await get_file_content(client, owner, repo, f.filename, head_ref)
                    head_truncated = "\n".join(head_text.splitlines()[:300])
                except Exception:
                    head_truncated = ""
                dirty_file_pairs.append({
                    "filename": f.filename,
                    "base_content": base_truncated,
                    "head_content": head_truncated,
                })

    t_stage_b = time.perf_counter() - t_stage_b_start
    logger.info(
        "[Timing] Stage b: AST caller/callee context discovery (%d files) completed in %.3fs",
        len(context_files),
        t_stage_b,
    )

    # Stage c & d: Gemini API dispatch & response parsing (detailed breakdown inside analyze_diff_with_ai)
    pr_title = pr.get("title", f"PR #{payload.pr_number}")
    ai_result, was_truncated = await analyze_diff_with_ai(
        pr_title=pr_title,
        diff_files=diff_files,
        context_files=context_files,
        mergeable_state=mergeable_state,
        dirty_file_pairs=dirty_file_pairs if dirty_file_pairs else None,
    )

    # Post-process AI conflict decision
    final_conflict_type, final_risk_score, final_explanation, final_resolved_files = post_process_conflict_decision(
        ai_conflict_type=ai_result.conflict_type,
        ai_risk_score=ai_result.risk_score,
        ai_explanation=ai_result.explanation,
        mergeable_state=mergeable_state,
        resolved_files=ai_result.resolved_files,
    )

    # Populate original_content for resolved files from target branch (base_sha)
    if final_resolved_files:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            for rf in final_resolved_files:
                try:
                    orig_text, _ = await get_file_content(client, owner, repo, rf.filename, base_sha)
                    rf.original_content = orig_text if orig_text else None
                except Exception:
                    rf.original_content = None

    # Stage e: MongoDB persistence
    t_stage_e_start = time.perf_counter()
    analysis = AnalysisModel(
        repo_owner=owner,
        repo_name=repo,
        pr_number=payload.pr_number,
        pr_title=pr_title,
        base_branch=pr.get("base", {}).get("ref", "main"),
        compare_branch=pr.get("head", {}).get("ref", ""),
        conflict_type=final_conflict_type,  # type: ignore
        risk_score=final_risk_score,        # type: ignore
        explanation=final_explanation,
        file_diffs=diff_files,
        context_files=context_files,
        resolved_files=final_resolved_files,
        test_assertions=ai_result.test_assertions,
        integration_status="PENDING",
        integration_branch=None,
        github_mergeable_state=mergeable_state,
        truncated=was_truncated,
        created_at=datetime.now(timezone.utc),
    )

    doc_to_insert = analysis.model_dump(by_alias=True, exclude={"id"})
    result = await db["analyses"].insert_one(doc_to_insert)
    analysis.id = str(result.inserted_id)
    t_stage_e = time.perf_counter() - t_stage_e_start
    logger.info("[Timing] Stage e: MongoDB persistence completed in %.3fs", t_stage_e)

    t_total = time.perf_counter() - t_start
    logger.info(
        "[Timing] Full PR scan completed in %.3fs (Stage a: %.2fs, Stage b: %.2fs, Stage e: %.2fs)",
        t_total,
        t_stage_a,
        t_stage_b,
        t_stage_e,
    )

    return analysis
