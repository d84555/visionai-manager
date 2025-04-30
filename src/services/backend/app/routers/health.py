
from fastapi import APIRouter, HTTPException, Response
import os

router = APIRouter(prefix="/health", tags=["health"])

@router.get("")
async def health_check():
    """Check if the API is running and return a 200 OK response"""
    return {"status": "ok", "message": "API is running"}
