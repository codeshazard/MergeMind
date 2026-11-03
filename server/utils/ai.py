import asyncio
import logging
import time
import traceback
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from config import GEMINI_API_KEY, GEMINI_MODEL
from models.analysis import AIResult, ContextFile, FileDiff

logger = logging.getLogger("mergemind.ai")

client = genai.Client(api_key=GEMINI_API_KEY)

SYSTEM_PROMPT = """You are an expert Git integration engineer and semantic code reviewer.
Analyze the provided Git diff patches from a Pull Request.

Your job:
1. Determine if changes contain:
   - "TEXTUAL": Traditional Git line collisions or conflict markers.
   - "SEMANTIC": Independent, clean textual changes that break downstream assumptions (e.g., function parameter count/type changes, altered return structures, broken invariants).
   - "NONE": Clean, fully compatible changes.
2. Formulate a plain-English explanation of the underlying problem. When conflict_type is TEXTUAL or SEMANTIC, ensure the explanation explicitly states what assumption the resolution makes (e.g., which value, default parameter, or behavior was kept and why) in an 'Assumption to confirm:' section.
3. Negative-Case Guard: If no changed identifier is used by any provided context file and no merge conflict exists, return NONE and LOW. Do not invent problems. If unsure, say so in the explanation and use MEDIUM at most.
4. You are also given full contents of files NOT in the PR that call or import changed code. A change is SEMANTIC if it alters return-value meaning, parameters, or invariants that those files rely on, even if the PR's own tests would pass. Name the affected caller files and explain the reasoning in `explanation`. `resolved_files` must contain a complete, valid version of every file that needs to change, including caller files.
5. Also check the reverse direction: new code in this PR may CALL functions defined elsewhere whose behavior or return semantics differ from what the new code assumes (for example a function that now applies a discount, a tax, or a unit conversion). Flag as SEMANTIC and name both files.
6. Output 2 to 4 LLM-evaluated test verification checks indicating that the integration maintains integrity (these are synthesized indicative checks, not executed in runtime sandbox).

Output MUST strictly follow the JSON schema."""


def build_user_prompt(
    pr_title: str,
    diff_files: List[FileDiff],
    context_files: List[ContextFile],
    mergeable_state: Optional[str] = None,
    dirty_file_pairs: Optional[List[Dict[str, str]]] = None,
) -> Tuple[str, bool]:
    """
    Construct user prompt for Gemini, capping prompt size at 40,000 characters.
    Returns (prompt_text, was_truncated).
    """
    lines = [
        f"PR Title: {pr_title}",
        f"GitHub Mergeable State: {mergeable_state or 'unknown'}",
    ]
    was_truncated = False
    current_length = sum(len(line) for line in lines)
    max_total_chars = 40000

    # 1. Modified files in PR diffs
    lines.append("\n## MODIFIED FILES IN PR (Diff Patches):")
    for f in diff_files:
        if not f.patch:
            continue
        patch_text = f.patch
        if len(patch_text) > 6000:
            patch_text = patch_text[:6000] + "\n[...NOTE: Patch truncated at 6000 chars...]"
            was_truncated = True

        file_section = f"\nFile: {f.filename} (Status: {f.status})\n```diff\n{patch_text}\n```\n"
        if current_length + len(file_section) > max_total_chars:
            lines.append("\n[...NOTE: Remaining diff patches truncated due to total size limits...]")
            was_truncated = True
            break
        lines.append(file_section)
        current_length += len(file_section)

    # 2. Dirty PR file pairs (Base vs Head) if merge conflicts exist
    if dirty_file_pairs:
        lines.append("\n## DIRTY PR FULL FILE PAIRS (Base Branch vs Head Branch):")
        for pair in dirty_file_pairs:
            filename = pair.get("filename", "")
            base_content = pair.get("base_content", "")
            head_content = pair.get("head_content", "")
            pair_section = (
                f"\n### File: {filename}\n"
                f"Base Branch Version:\n```\n{base_content}\n```\n"
                f"Head Branch Version:\n```\n{head_content}\n```\n"
            )
            if current_length + len(pair_section) > max_total_chars:
                lines.append("\n[...NOTE: Additional base/head file pairs truncated due to size limits...]")
                was_truncated = True
                break
            lines.append(pair_section)
            current_length += len(pair_section)

    # 3. Context files (Callers and Callees)
    if context_files:
        lines.append("\n## RELEVANT EXTERNAL CONTEXT FILES (Callers and Callees outside PR):")
        for cf in context_files:
            cf_content = cf.content or "(content omitted)"
            cf_section = f"\nFile: {cf.filename}\nReason: {cf.reason}\n```\n{cf_content}\n```\n"
            if current_length + len(cf_section) > max_total_chars:
                lines.append("\n[...NOTE: Additional context files truncated due to size limits...]")
                was_truncated = True
                break
            lines.append(cf_section)
            current_length += len(cf_section)

    if was_truncated:
        lines.append("\nNOTICE: Some inputs were truncated to fit context limits.")

    return "\n".join(lines), was_truncated


async def analyze_diff_with_ai(
    pr_title: str,
    diff_files: List[FileDiff],
    context_files: List[ContextFile],
    mergeable_state: Optional[str] = None,
    dirty_file_pairs: Optional[List[Dict[str, str]]] = None,
) -> Tuple[AIResult, bool]:
    """
    Analyze Pull Request diffs, caller/callee context, and dirty file pairs using Google Gemini.
    Returns (AIResult, was_truncated).
    """
    t_serialize_start = time.perf_counter()
    prompt, was_truncated = build_user_prompt(
        pr_title=pr_title,
        diff_files=diff_files,
        context_files=context_files,
        mergeable_state=mergeable_state,
        dirty_file_pairs=dirty_file_pairs,
    )

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=AIResult,
        temperature=0.2,
    )
    t_serialize = time.perf_counter() - t_serialize_start
    logger.info(
        "[Timing] Stage c.1: Gemini payload serialization completed in %.4fs (prompt length: %d chars)",
        t_serialize,
        len(prompt),
    )

    last_error: Optional[Exception] = None
    last_traceback: str = ""

    for attempt in range(2):  # 1 initial + 1 retry
        if attempt > 0:
            delay = 2 ** attempt
            logger.warning("[Retry] Retrying Gemini API call (attempt %d/2) in %d seconds...", attempt + 1, delay)
            await asyncio.sleep(delay)

        try:
            logger.info(
                "[Timing] Stage c.2: Dispatching async SDK call to Gemini model '%s' (attempt %d/2)...",
                GEMINI_MODEL,
                attempt + 1,
            )
            t_dispatch_start = time.perf_counter()
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=prompt,
                    config=config,
                ),
                timeout=60.0,
            )
            t_dispatch = time.perf_counter() - t_dispatch_start
            logger.info("[Timing] Stage c.2: Gemini SDK network dispatch completed in %.3fs", t_dispatch)

            # Stage d: Gemini response parsing & Pydantic schema validation
            t_parse_start = time.perf_counter()
            raw_text = response.text or ""
            parsed = AIResult.model_validate_json(raw_text)
            t_parse = time.perf_counter() - t_parse_start
            logger.info(
                "[Timing] Stage d: Gemini response parsing & Pydantic validation completed in %.3fs",
                t_parse,
            )
            return parsed, was_truncated

        except asyncio.TimeoutError as e:
            t_elapsed = time.perf_counter() - t_dispatch_start
            last_traceback = traceback.format_exc()
            logger.error(
                "[Diagnostic Catch Block] Attempt %d timed out after %.2fs. Raw Exception: %s: %s\n%s",
                attempt + 1,
                t_elapsed,
                type(e).__name__,
                str(e),
                last_traceback,
            )
            last_error = e

        except (genai_errors.APIError, Exception) as e:
            t_elapsed = time.perf_counter() - t_dispatch_start
            last_traceback = traceback.format_exc()
            logger.error(
                "[Diagnostic Catch Block] Attempt %d failed after %.2fs. Raw Exception: %s: %s\n%s",
                attempt + 1,
                t_elapsed,
                type(e).__name__,
                str(e),
                last_traceback,
            )
            last_error = e

    err_str = str(last_error) if last_error else "unknown error"
    err_type = type(last_error).__name__ if last_error else "UnknownError"

    logger.critical(
        "[Diagnostic Final Catch] All Gemini attempts exhausted. Underlying Raw Error: %s: %s\nTraceback:\n%s",
        err_type,
        err_str,
        last_traceback,
    )

    if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
        raise HTTPException(
            status_code=503,
            detail=f"AI service rate limit exceeded (429 RESOURCE_EXHAUSTED): {err_str}",
        )
    if isinstance(last_error, asyncio.TimeoutError):
        raise HTTPException(
            status_code=502,
            detail=f"AI service request timed out after 60s. Underlying model '{GEMINI_MODEL}' did not respond.",
        )
    if "503" in err_str or "UNAVAILABLE" in err_str:
        raise HTTPException(
            status_code=503,
            detail=f"AI service temporarily unavailable (503 UNAVAILABLE): {err_str}",
        )

    raise HTTPException(
        status_code=502,
        detail=f"Gemini AI analysis failed ({err_type}): {err_str}",
    )
