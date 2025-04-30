
from fastapi import APIRouter, HTTPException, Response
import os

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
        return {
            "status": "ok", 
            "message": "Models API is available",
            "models_directory": models_dir,
            "models_count": len([f for f in os.listdir(models_dir) if os.path.isfile(os.path.join(models_dir, f))]) if os.path.exists(models_dir) else 0
        }
    else:
        return {
            "status": "warning",
            "message": "Models directory not found",
            "models_directory": models_dir
        }
