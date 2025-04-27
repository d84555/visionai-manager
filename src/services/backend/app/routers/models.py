
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import List, Optional
import os
import shutil
import uuid
from datetime import datetime
import json

from app.models.model_info import ModelInfo, ActiveModel

router = APIRouter(prefix="/models", tags=["models"])

# Configure model storage directory
MODELS_DIR = os.environ.get("MODELS_DIR", "/opt/visionai/models")
os.makedirs(MODELS_DIR, exist_ok=True)

# Path to store active model information
ACTIVE_MODEL_PATH = os.path.join(MODELS_DIR, "active_model.json")

# Load or initialize models database
MODELS_DB_PATH = os.path.join(MODELS_DIR, "models_db.json")

def load_models_db() -> List[ModelInfo]:
    if os.path.exists(MODELS_DB_PATH):
        with open(MODELS_DB_PATH, "r") as f:
            models_data = json.load(f)
            return [ModelInfo(**model) for model in models_data]
    return []

def save_models_db(models: List[ModelInfo]):
    with open(MODELS_DB_PATH, "w") as f:
        json.dump([model.dict() for model in models], f, indent=2)

@router.post("/upload", response_model=ModelInfo)
async def upload_model(file: UploadFile = File(...), name: str = Form(...)):
    """Upload a model file"""
    model_id = f"custom-{uuid.uuid4()}"
    
    # Get original file name and extension
    file_name = file.filename
    if not file_name:
        file_name = f"{name.lower().replace(' ', '_')}.onnx"
    
    # Preserve the original file extension
    original_extension = os.path.splitext(file_name)[1].lower()
    if not original_extension:
        # Default to ONNX if no extension
        file_name = f"{file_name}.onnx"
    
    # Ensure unique filename to prevent overwriting
    base_name = os.path.splitext(file_name)[0]
    extension = os.path.splitext(file_name)[1]
    counter = 1
    while os.path.exists(os.path.join(MODELS_DIR, file_name)):
        file_name = f"{base_name}_{counter}{extension}"
        counter += 1
    
    model_path = os.path.join(MODELS_DIR, file_name)
    
    # Save uploaded file
    with open(model_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Get file size in MB
    file_size = os.path.getsize(model_path) / (1024 * 1024)
    
    # Check if it's an ONNX model based on extension
    is_onnx = file_name.lower().endswith('.onnx')
    
    print(f"Uploaded model: {file_name}, Is ONNX: {is_onnx}")
    
    # Create model info - store the filename with extension for consistent path handling
    model_info = ModelInfo(
        id=model_id,
        name=name,
        path=file_name,  # Store just the filename with extension
        type="Object Detection",
        size=f"{file_size:.1f} MB",
        uploadedAt=datetime.now().isoformat(),
        cameras=["All Cameras"],
        localFilePath=model_path
    )
    
    # Update models database
    models = load_models_db()
    models.append(model_info)
    save_models_db(models)
    
    return model_info

@router.get("/list", response_model=List[ModelInfo])
async def list_models():
    """List all available models"""
    models = load_models_db()
    # Log model paths to help diagnose issues
    for model in models:
        print(f"Available model: name={model.name}, path={model.path}")
    return models

@router.delete("/{model_id}")
async def delete_model(model_id: str):
    """Delete a model by ID"""
    models = load_models_db()
    
    # Find the model to delete
    model_to_delete = None
    for model in models:
        if model.id == model_id:
            model_to_delete = model
            break
    
    if not model_to_delete:
        raise HTTPException(status_code=404, detail=f"Model with ID {model_id} not found")
    
    # Remove the physical file if it exists
    if model_to_delete.localFilePath and os.path.exists(model_to_delete.localFilePath):
        os.remove(model_to_delete.localFilePath)
    
    # Update the database
    updated_models = [model for model in models if model.id != model_id]
    save_models_db(updated_models)
    
    return {"message": f"Model {model_id} deleted successfully"}

@router.post("/select")
async def set_active_model(active_model: ActiveModel):
    """Set the active model"""
    # Use the exact model path provided, don't modify it
    print(f"Setting active model: {active_model.name}, path={active_model.path}")
    
    with open(ACTIVE_MODEL_PATH, "w") as f:
        json.dump({
            "name": active_model.name,
            "path": active_model.path
        }, f, indent=2)
    return {"message": f"Model {active_model.name} set as active"}

@router.get("/active", response_model=Optional[ActiveModel])
async def get_active_model():
    """Get the currently active model"""
    if not os.path.exists(ACTIVE_MODEL_PATH):
        return None
    
    with open(ACTIVE_MODEL_PATH, "r") as f:
        active_model = ActiveModel(**json.load(f))
        print(f"Retrieved active model: {active_model.name}, path={active_model.path}")
        return active_model

@router.get("/file-url")
async def get_model_file_url(path: str):
    """Get the URL for a model file"""
    # In a production environment, this could generate a pre-signed URL or serve the file directly
    # For now, we'll just return a placeholder
    models = load_models_db()
    
    for model in models:
        if model.path == path and model.localFilePath:
            return {"url": f"/static/models/{os.path.basename(model.localFilePath)}"}
    
    raise HTTPException(status_code=404, detail="Model file not found")
