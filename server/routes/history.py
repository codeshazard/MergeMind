from typing import List
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from db import get_db
from models.analysis import AnalysisModel, serialize_mongo_doc

router = APIRouter(prefix="", tags=["History"])


@router.get("/history", response_model=List[AnalysisModel])
async def get_history(
    limit: int = Query(10, ge=1, le=50, description="Max number of items to return"),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> List[AnalysisModel]:
    """Retrieve recent analyses sorted by created_at descending."""
    cursor = db["analyses"].find().sort("created_at", -1).limit(limit)
    analyses: List[AnalysisModel] = []
    async for doc in cursor:
        serialized = serialize_mongo_doc(doc)
        if serialized:
            analyses.append(AnalysisModel.model_validate(serialized))
    return analyses


@router.get("/analysis/{id}", response_model=AnalysisModel)
async def get_analysis_by_id(
    id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> AnalysisModel:
    """Retrieve full details of a specific scan."""
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid analysis ID format")

    doc = await db["analyses"].find_one({"_id": ObjectId(id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")

    serialized = serialize_mongo_doc(doc)
    return AnalysisModel.model_validate(serialized)
