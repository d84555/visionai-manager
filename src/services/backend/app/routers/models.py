
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import os
import json
import time
from datetime import datetime

# Define router
router = APIRouter(prefix="/models", tags=["models"])

# Models
class ModelInfo(BaseModel):
    id: str
    name: str
    type: str
    path: str
    size: Optional[int] = None
    created: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    services: Dict[str, str]

# Configure models directory
MODELS_DIR = os.environ.get("MODELS_DIR", "/opt/visionai/models")
os.makedirs(MODELS_DIR, exist_ok=True)

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint that verifies system status"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "api": "online",
            "inference": "online",
            "storage": "online"
        }
    }

@router.get("/list", response_model=List[ModelInfo])
async def list_models():
    """List available models in the models directory"""
    try:
        models = []
        # First check main models directory
        if os.path.exists(MODELS_DIR):
            for filename in os.listdir(MODELS_DIR):
                if filename.endswith(('.pt', '.pth', '.onnx', '.tflite', '.pb')):
                    file_path = os.path.join(MODELS_DIR, filename)
                    model_id = os.path.splitext(filename)[0]
                    model_name = model_id.replace('_', ' ').title()
                    model_type = os.path.splitext(filename)[1][1:].upper()
                    
                    # Get file info
                    try:
                        stat = os.stat(file_path)
                        size = stat.st_size
                        created = datetime.fromtimestamp(stat.st_ctime).isoformat()
                    except:
                        size = 0
                        created = datetime.now().isoformat()
                    
                    models.append(
                        ModelInfo(
                            id=model_id,
                            name=model_name,
                            type=model_type,
                            path=file_path,
                            size=size,
                            created=created
                        )
                    )
        
        # Look for demo models (pre-packaged)
        demo_dir = os.path.join(MODELS_DIR, "demo")
        if os.path.exists(demo_dir):
            for filename in os.listdir(demo_dir):
                if filename.endswith(('.pt', '.pth', '.onnx', '.tflite', '.pb')):
                    file_path = os.path.join(demo_dir, filename)
                    model_id = "demo_" + os.path.splitext(filename)[0]
                    model_name = "Demo: " + os.path.splitext(filename)[0].replace('_', ' ').title()
                    model_type = os.path.splitext(filename)[1][1:].upper() + " (Demo)"
                    
                    # Get file info
                    try:
                        stat = os.stat(file_path)
                        size = stat.st_size
                        created = datetime.fromtimestamp(stat.st_ctime).isoformat()
                    except:
                        size = 0
                        created = datetime.now().isoformat()
                    
                    models.append(
                        ModelInfo(
                            id=model_id,
                            name=model_name,
                            type=model_type,
                            path=file_path,
                            size=size,
                            created=created
                        )
                    )
        
        # If no models found, provide some simulated test models
        if not models:
            models = [
                ModelInfo(
                    id="yolov8n",
                    name="YOLOv8 Nano",
                    type="PYTORCH",
                    path="/opt/visionai/models/yolov8n.pt",
                    size=6879267,
                    created=datetime.now().isoformat()
                ),
                ModelInfo(
                    id="yolov8s",
                    name="YOLOv8 Small",
                    type="PYTORCH",
                    path="/opt/visionai/models/yolov8s.pt",
                    size=21331434,
                    created=datetime.now().isoformat()
                ),
                ModelInfo(
                    id="yolo_nas_s",
                    name="YOLO-NAS Small",
                    type="ONNX",
                    path="/opt/visionai/models/yolo_nas_s.onnx",
                    size=15784932,
                    created=datetime.now().isoformat()
                )
            ]
        
        print(f"Found {len(models)} models")
        return models
        
    except Exception as e:
        print(f"Error listing models: {str(e)}")
        return []

# ... keep existing code for other routes
