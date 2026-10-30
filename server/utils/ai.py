import asyncio
import logging
from typing import List, Optional
from fastapi import HTTPException
from google import genai
from google.genai import types

from config import GEMINI_API_KEY, GEMINI_MODEL
from models.analysis import AIResult, ContextFile, FileDiff

logger = logging.getLogger(__name__)

client = genai.Client(api_key=GEMINI_API_KEY)

SYSTEM_PROMPT = """You are an expert Git integration engineer and semantic code reviewer.
Analyze the provided Git diff patches from a Pull Request.

Your job:
1. Determine if changes contain:
   - "TEXTUAL": Traditional Git line collisions or conflict markers.
   - "SEMANTIC": Independent, clean textual changes that break downstream assumptions (e.g., function parameter count/type changes, altered return structures, broken invariants).
   - "NONE": Clean, fully compatible changes.
2. Formulate a plain-English explanation of the underlying problem.
3. You are also given full contents of files NOT in the PR that call or import changed code. A change is SEMANTIC if it alters return-value meaning, parameters, or invariants that those files rely on, even if the PR's own tests would pass. Name the affected caller files and explain the reasoning in `explanation`. `resolved_files` must contain a complete, valid version of every file that needs to change, including caller files.
4. Output 2 to 4 LLM-evaluated test verification checks indicating that the integration maintains integrity (these are synthesized indicative checks, not executed in runtime sandbox).

Output MUST strictly follow the JSON schema."""


def build_user_prompt(
    pr_title: str, diff_files: List[FileDiff], context_files: List[ContextFile]
) -> str:
    lines = [f"PR Title: {pr_title}", "\n## MODIFIED FILES IN PR:"]
    was_truncated = False
    current_length = 0
    max_total_chars = 40000

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

    if context_files:
        lines.append("\n## CALLER CONTEXT FILES (Outside PR referencing changed code):")
        for cf in context_files:
            cf_content = cf.content or "(content omitted)"
            cf_section = f"\nFile: {cf.filename}\nReason: {cf.reason}\n```\n{cf_content}\n```\n"
            if current_length + len(cf_section) > max_total_chars:
                lines.append("\n[...NOTE: Additional caller context files truncated due to size limits...]")
                was_truncated = True
                break
            lines.append(cf_section)
            current_length += len(cf_section)

    if was_truncated:
        lines.append("\nNOTICE: Some inputs were truncated to fit context limits.")

    return "\n".join(lines)


async def analyze_diff_with_ai(
    pr_title: str, diff_files: List[FileDiff], context_files: List[ContextFile]
) -> AIResult:
    """Analyze Pull Request diffs and external caller context using Google Gemini structured output."""
    prompt = build_user_prompt(pr_title, diff_files, context_files)

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=AIResult,
        temperature=0.2,
    )

    last_error: Optional[Exception] = None

    for attempt in range(3):
        if attempt > 0:
            await asyncio.sleep(2 * attempt)
        try:
            response = await client.aio.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=config,
            )
            raw_text = response.text or ""
            return AIResult.model_validate_json(raw_text)
        except Exception as e:
            logger.warning("Gemini generation attempt %d failed: %s", attempt + 1, e)
            last_error = e

    raise HTTPException(
        status_code=502,
        detail=f"Gemini AI analysis failed to produce valid schema after retry: {last_error}",
    )
