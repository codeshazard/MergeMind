from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class FileDiff(BaseModel):
    filename: str
    status: str
    patch: Optional[str] = None


class ContextFile(BaseModel):
    filename: str
    reason: str
    content: Optional[str] = None


class TestAssertion(BaseModel):
    assertion: str
    status: Literal["PASS", "FAIL"] = "PASS"
    # LLM-evaluated: indicative checks synthesized by Gemini, not executed in runtime sandbox


class ResolvedFile(BaseModel):
    filename: str
    content: str


class AIResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    conflict_type: Literal["NONE", "TEXTUAL", "SEMANTIC"]
    risk_score: Literal["LOW", "MEDIUM", "HIGH"]
    explanation: str
    resolved_files: List[ResolvedFile]
    test_assertions: List[TestAssertion]


class AnalysisModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(default=None, alias="_id")
    repo_owner: str
    repo_name: str
    pr_number: int
    pr_title: str
    base_branch: str
    compare_branch: str
    conflict_type: Literal["NONE", "TEXTUAL", "SEMANTIC"]
    risk_score: Literal["LOW", "MEDIUM", "HIGH"]
    explanation: str
    file_diffs: List[FileDiff]
    context_files: List[ContextFile] = Field(default_factory=list)
    resolved_files: List[ResolvedFile]
    test_assertions: List[TestAssertion]
    integration_status: Literal["PENDING", "BRANCH_CREATED", "REJECTED"] = "PENDING"
    integration_branch: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ScanRequest(BaseModel):
    repo_url: str
    pr_number: int


class IntegrateRequest(BaseModel):
    analysis_id: str


def serialize_mongo_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Helper converting MongoDB ObjectId into string and ensuring id/_id consistency."""
    if not doc:
        return None
    d = dict(doc)
    if "_id" in d and d["_id"] is not None:
        str_id = str(d["_id"])
        d["_id"] = str_id
        d["id"] = str_id
    return d
