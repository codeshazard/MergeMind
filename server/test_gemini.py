import asyncio
import os
import sys
import time
import traceback
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

from google import genai
from google.genai import types
from google.genai import errors as genai_errors
from models.analysis import AIResult

API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

print(f"=== MergeMind Gemini Smoke Test ===")
print(f"Loaded Model : {MODEL_NAME}")
print(f"API Key      : {API_KEY[:6]}...{API_KEY[-4:] if API_KEY else 'NONE'} (Length: {len(API_KEY) if API_KEY else 0})")


async def run_smoke_test():
    client = genai.Client(api_key=API_KEY)

    # 1. Plain text ping
    print("\n--- 1. Plain Text 'ping' Test ---")
    start = time.perf_counter()
    try:
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=MODEL_NAME,
                contents="ping",
            ),
            timeout=30.0,
        )
        elapsed = time.perf_counter() - start
        print(f"[OK] Response received in {elapsed:.3f}s: {response.text.strip()[:60]}")
    except Exception as e:
        elapsed = time.perf_counter() - start
        print(f"[FAIL] Call failed after {elapsed:.3f}s")
        print(f"Type: {type(e).__name__} ({type(e)})")
        print(f"Message: {e}")
        print("\nFull Traceback:")
        traceback.print_exc()
        return

    # 2. Structured JSON schema test
    print("\n--- 2. Structured JSON Schema Test (AIResult) ---")
    config = types.GenerateContentConfig(
        system_instruction="You are an expert Git integration engineer. Output strictly in JSON adhering to schema.",
        response_mime_type="application/json",
        response_schema=AIResult,
        temperature=0.2,
    )
    start = time.perf_counter()
    try:
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=MODEL_NAME,
                contents="PR modifies function signature from foo() to foo(bar). Caller in caller.py calls foo().",
                config=config,
            ),
            timeout=30.0,
        )
        elapsed = time.perf_counter() - start
        print(f"[OK] Structured response received in {elapsed:.3f}s")
        print(f"Raw Output:\n{response.text}")
        validated = AIResult.model_validate_json(response.text)
        print(f"\n[Validation] Conflict Type: {validated.conflict_type}")
        print(f"[Validation] Risk Score   : {validated.risk_score}")
        print(f"[Validation] Explanation  : {validated.explanation[:80]}...")
        print(f"[Validation] Assertions   : {len(validated.test_assertions)} synthesized")
    except Exception as e:
        elapsed = time.perf_counter() - start
        print(f"[FAIL] Structured call failed after {elapsed:.3f}s")
        print(f"Type: {type(e).__name__} ({type(e)})")
        print(f"Message: {e}")
        print("\nFull Traceback:")
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(run_smoke_test())
