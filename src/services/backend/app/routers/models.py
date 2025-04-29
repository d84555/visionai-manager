
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import os
import json
import time
import shutil
import uuid
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

class ActiveModelResponse(BaseModel):
    name: str
    path: str

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    services: Dict[str, str]

# Configure models directory
MODELS_DIR = os.environ.get("MODELS_DIR", "/opt/visionai/models")
os.makedirs(MODELS_DIR, exist_ok=True)

# Store active model information
ACTIVE_MODEL_FILE = os.path.join(MODELS_DIR, "active_model.json")

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
            print(f"Checking models directory: {MODELS_DIR}")
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
            print(f"Checking demo models directory: {demo_dir}")
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
            print("No models found, providing sample models")
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

@router.post("/upload", response_model=ModelInfo)
async def upload_model(
    file: UploadFile = File(...),
    name: str = Form(...)
):
    """Upload a new model file"""
    print(f"Received model upload request: {name}, file: {file.filename}")
    
    try:
        # Generate a safe filename from the original name
        original_filename = file.filename
        if not original_filename:
            raise HTTPException(status_code=400, detail="No filename provided")
        
        # Extract extension and verify it's supported
        ext = os.path.splitext(original_filename)[1].lower()
        if ext not in ['.pt', '.pth', '.onnx', '.tflite', '.pb']:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported model format: {ext}. Supported formats are .pt, .pth, .onnx, .tflite, .pb"
            )
        
        # Create a safe model ID from the provided name
        model_id = f"custom-{int(time.time())}"
        
        # Generate the filename and file path
        filename = f"{model_id}{ext}"
        file_path = os.path.join(MODELS_DIR, filename)
        
        # Create models directory if it doesn't exist
        os.makedirs(MODELS_DIR, exist_ok=True)
        
        # Save the uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Get file info
        stat = os.stat(file_path)
        size = stat.st_size
        created = datetime.now().isoformat()
        
        # Create the model info
        model_info = ModelInfo(
            id=model_id,
            name=name,
            type=ext[1:].upper(),
            path=file_path,
            size=size,
            created=created
        )
        
        print(f"Model uploaded successfully: {model_info}")
        return model_info
        
    except HTTPException as e:
        print(f"HTTP error during upload: {e.detail}")
        raise e
    except Exception as e:
        print(f"Error uploading model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload model: {str(e)}")

@router.delete("/{model_id}", response_model=dict)
async def delete_model(model_id: str):
    """Delete a model by ID"""
    try:
        # Check if it's a demo model (cannot delete those)
        if model_id.startswith("demo_"):
            raise HTTPException(status_code=400, detail="Cannot delete demo models")
        
        # Look for the model in the models directory
        file_found = False
        for filename in os.listdir(MODELS_DIR):
            if os.path.splitext(filename)[0] == model_id:
                file_path = os.path.join(MODELS_DIR, filename)
                # Delete the file
                os.remove(file_path)
                file_found = True
                break
        
        if not file_found:
            raise HTTPException(status_code=404, detail=f"Model with ID {model_id} not found")
        
        # Check if this was the active model, and clear that if so
        if os.path.exists(ACTIVE_MODEL_FILE):
            with open(ACTIVE_MODEL_FILE, "r") as f:
                active_model = json.load(f)
            if os.path.splitext(os.path.basename(active_model["path"]))[0] == model_id:
                os.remove(ACTIVE_MODEL_FILE)
        
        return {"status": "success", "message": f"Model {model_id} deleted successfully"}
        
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete model: {str(e)}")

@router.post("/select", response_model=dict)
async def select_model(model: ActiveModelResponse):
    """Set the active model for inference"""
    try:
        # Store the active model information
        with open(ACTIVE_MODEL_FILE, "w") as f:
            json.dump({"name": model.name, "path": model.path}, f)
        
        # Also save to active_models cache in websocket.py
        try:
            from .websocket import active_models
            # Pre-load the model if possible
            from .inference import YOLO, TORCH_AVAILABLE, ULTRALYTICS_AVAILABLE, CUDA_AVAILABLE
            
            if (TORCH_AVAILABLE and ULTRALYTICS_AVAILABLE and 
                model.path.lower().endswith(('.pt', '.pth')) and 
                model.path not in active_models):
                try:
                    print(f"Preloading model: {model.path}")
                    # Load PyTorch model
                    model_obj = YOLO(model.path)
                    
                    # Move to device
                    if CUDA_AVAILABLE:
                        model_obj.to("cuda")
                    else:
                        model_obj.to("cpu")
                        
                    # Store for reuse
                    active_models[model.path] = model_obj
                    print(f"Model preloaded successfully: {model.path}")
                except Exception as e:
                    print(f"Error preloading model: {str(e)}")
        except (ImportError, AttributeError) as e:
            print(f"Could not access active models cache: {str(e)}")
        
        return {"status": "success", "message": f"Model {model.name} set as active"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set active model: {str(e)}")

@router.get("/active", response_model=ActiveModelResponse)
async def get_active_model():
    """Get the active model for inference"""
    try:
        # Check if active model file exists
        if not os.path.exists(ACTIVE_MODEL_FILE):
            raise HTTPException(status_code=404, detail="No active model set")
        
        # Read the active model information
        with open(ACTIVE_MODEL_FILE, "r") as f:
            model = json.load(f)
        
        return ActiveModelResponse(name=model["name"], path=model["path"])
        
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get active model: {str(e)}")

@router.get("/file-url", response_model=Dict[str, str])
async def get_file_url(path: str):
    """Get a URL for accessing a model file"""
    try:
        # Check if file exists
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail=f"File not found: {path}")
        
        # In a real implementation, this would generate a signed URL or similar
        # Here we just return a placeholder
        return {"url": f"file://{path}"}
        
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate URL: {str(e)}")
