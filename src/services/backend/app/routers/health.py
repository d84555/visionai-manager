from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, List, Optional
import os
import uuid
import shutil
import logging
from datetime import datetime

router = APIRouter(
    prefix="/health",
    tags=["health"]
)

# Configure logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Models directory - use environment variable or default location
MODELS_DIR = os.environ.get("MODELS_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "../models"))

@router.get("")
async def health_check():
    """Simple health check endpoint"""
    return {"status": "ok", "message": "AI Vision API is running"}
