
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

@router.post("/models/upload")
async def upload_model(file: UploadFile = File(...), name: str = Form("")):
    """Upload a new AI model via health router for testing"""
    logger.info(f"Health router: Received model upload request for {name}")
    try:
        # Ensure the models directory exists
        os.makedirs(MODELS_DIR, exist_ok=True)
        
        # If no name provided, use the original filename
        if not name:
            name = file.filename
        
        # Use the original file extension
        if file.filename and '.' in file.filename:
            file_extension = file.filename.split('.')[-1]
            # If name doesn't end with the extension, append it
            if not name.endswith(f".{file_extension}"):
                name = f"{name}.{file_extension}"
        
        # Create a safe filename
        safe_filename = name.replace(' ', '_')
        filepath = os.path.join(MODELS_DIR, safe_filename)
        
        logger.info(f"Health router: Saving model to {filepath}")
        
        # Write the file
        with open(filepath, "wb") as f:
            content = await file.read()
            f.write(content)
            
        # Get file stats
        file_stat = os.stat(filepath)
        
        # Generate UUID based on filepath for consistency
        model_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, safe_filename))
        
        # Clean up display name (remove extension)
        display_name = safe_filename
        if '.' in display_name:
            display_name = '.'.join(display_name.split('.')[:-1])
        
        # Replace underscores with spaces for display
        display_name = display_name.replace('_', ' ')
        
        logger.info(f"Health router: Model upload successful: {model_id}")
        
        return {
            "id": model_id,
            "name": name.replace('_', ' ') if name else display_name,
            "path": filepath,
            "uploadDate": datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
            "fileSize": file_stat.st_size
        }
    except Exception as e:
        logger.error(f"Health router: Error uploading model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload model: {str(e)}")
