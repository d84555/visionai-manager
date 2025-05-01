
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
async def upload_model(
    file: UploadFile = File(...),
    name: str = Form(...),
    enablePyTorchSupport: Optional[bool] = Form(False),
    convertToOnnx: Optional[bool] = Form(False)
):
    """
    Upload a model file (ONNX or PyTorch format)
    """
    try:
        # Create models directory if it doesn't exist
        os.makedirs(MODELS_DIR, exist_ok=True)
        
        # Generate unique ID for the model
        model_id = str(uuid.uuid4())
        
        # Get original file extension
        file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
        if file_ext.lower() not in [".onnx", ".pt", ".pth"]:
            raise HTTPException(status_code=400, detail="Unsupported model format. Only .onnx, .pt, or .pth files are accepted.")

        # Create the file path
        safe_name = name.replace(" ", "_").lower()
        filename = f"{safe_name}_{model_id}{file_ext}"
        file_path = os.path.join(MODELS_DIR, filename)
        
        # Save the file
        logger.info(f"Saving model file to {file_path}")
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Get file size
        file_size = os.path.getsize(file_path)
        
        # Return response
        return {
            "id": model_id,
            "name": name,
            "path": file_path,
            "fileSize": file_size,
            "uploadDate": datetime.now().isoformat(),
            "enablePyTorchSupport": enablePyTorchSupport,
            "convertToOnnx": convertToOnnx
        }
    except Exception as e:
        logger.error(f"Error uploading model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload model: {str(e)}")
