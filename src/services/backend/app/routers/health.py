
from fastapi import APIRouter, HTTPException, Response, File, UploadFile, Form
import os
import shutil
from pathlib import Path
import uuid
from datetime import datetime

router = APIRouter(prefix="/health", tags=["health"])

@router.get("")
async def health_check():
    """Check if the API is running and return a 200 OK response"""
    return {"status": "ok", "message": "API is running"}

@router.get("/models")
async def models_health_check():
    """Check if the models API is running and return a 200 OK response"""
    # Check if models directory exists
    models_dir = os.environ.get("MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models"))
    
    # Return status based on directory existence
    if os.path.exists(models_dir):
        # Make sure we return models as an array for consistency with the frontend expectations
        models = [f for f in os.listdir(models_dir) if os.path.isfile(os.path.join(models_dir, f))] if os.path.exists(models_dir) else []
        
        return {
            "status": "ok", 
            "message": "Models API is available",
            "models_directory": models_dir,
            "models_count": len(models),
            "models": models  # Return models as an array
        }
    else:
        return {
            "status": "warning",
            "message": "Models directory not found",
            "models_directory": models_dir,
            "models": []  # Return empty array for consistency
        }

@router.post("/models/upload")
async def upload_model(file: UploadFile = File(...), name: str = Form(...)):
    """Upload a model file to the server"""
    try:
        # Create models directory if it doesn't exist
        models_dir = os.environ.get("MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models"))
        os.makedirs(models_dir, exist_ok=True)
        
        # Generate a safe filename
        original_name = file.filename or "model"
        file_extension = Path(original_name).suffix
        safe_name = f"{name.replace(' ', '_')}_{uuid.uuid4().hex[:8]}{file_extension}"
        file_path = os.path.join(models_dir, safe_name)
        
        # Save the uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Get file stats
        file_stat = os.stat(file_path)
        
        # Return model info
        return {
            "id": f"uploaded-{uuid.uuid4()}",
            "name": name,
            "path": file_path,
            "fileSize": file_stat.st_size,
            "uploadDate": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload model: {str(e)}")
