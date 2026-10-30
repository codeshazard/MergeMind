from typing import List
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from db import get_db

router = APIRouter(prefix="", tags=["Dashboard"])


class BreakdownItem(BaseModel):
    name: str
    value: int


class DashboardStatsResponse(BaseModel):
    total_monitored: int
    semantic_caught: int
    conflict_breakdown: List[BreakdownItem]
    risk_breakdown: List[BreakdownItem]


@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> DashboardStatsResponse:
    """Aggregate stats across all analyses for the dashboard metrics."""
    total_monitored = await db["analyses"].count_documents({})
    semantic_caught = await db["analyses"].count_documents({"conflict_type": "SEMANTIC"})

    # Conflict breakdown aggregation
    conflict_pipeline = [
        {"$group": {"_id": "$conflict_type", "count": {"$sum": 1}}}
    ]
    conflict_counts = {doc["_id"]: doc["count"] async for doc in db["analyses"].aggregate(conflict_pipeline)}

    conflict_breakdown = [
        BreakdownItem(name="Textual", value=conflict_counts.get("TEXTUAL", 0)),
        BreakdownItem(name="Semantic", value=conflict_counts.get("SEMANTIC", 0)),
        BreakdownItem(name="None", value=conflict_counts.get("NONE", 0)),
    ]

    # Risk breakdown aggregation
    risk_pipeline = [
        {"$group": {"_id": "$risk_score", "count": {"$sum": 1}}}
    ]
    risk_counts = {doc["_id"]: doc["count"] async for doc in db["analyses"].aggregate(risk_pipeline)}

    risk_breakdown = [
        BreakdownItem(name="High", value=risk_counts.get("HIGH", 0)),
        BreakdownItem(name="Medium", value=risk_counts.get("MEDIUM", 0)),
        BreakdownItem(name="Low", value=risk_counts.get("LOW", 0)),
    ]

    return DashboardStatsResponse(
        total_monitored=total_monitored,
        semantic_caught=semantic_caught,
        conflict_breakdown=conflict_breakdown,
        risk_breakdown=risk_breakdown,
    )
