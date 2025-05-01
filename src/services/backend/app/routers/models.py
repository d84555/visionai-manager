from fastapi import APIRouter, File, UploadFile, HTTPException, Form, Query
from fastapi.responses import JSONResponse
from typing import List, Dict, Any, Optional
import os
import uuid
from datetime import datetime
import json
from pydantic import BaseModel
from pathlib import Path
import logging

# Configure logging
logger = logging.getLogger(__name__)

# Models directory - adjust as needed for your deployment
MODELS_DIR = os.environ.get("MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models"))
ACTIVE_MODELS_FILE = os.path.join(MODELS_DIR, "active_models.json")

# Create models directory if it doesn't exist
os.makedirs(MODELS_DIR, exist_ok=True)

# Create Router
router = APIRouter(prefix="/models", tags=["models"])

# Log the router setup for debugging
logger.info(f"Models router initialized with prefix /models and models directory: {MODELS_DIR}")

class ModelRequest(BaseModel):
    name: str
    path: str

class ModelListResponse(BaseModel):
    id: str
    name: str
    path: str
    uploadDate: Optional[str] = None
    fileSize: Optional[int] = None

class MultipleModelsRequest(BaseModel):
    models: List[ModelRequest]

def get_models() -> List[Dict[str, Any]]:
    """Get list of available models"""
    models = []
    
    try:
        # Check if directory exists
        if not os.path.exists(MODELS_DIR):
            print(f"Creating models directory: {MODELS_DIR}")
            os.makedirs(MODELS_DIR, exist_ok=True)
            return []
        
        # Scan models directory
        for filename in os.listdir(MODELS_DIR):
            filepath = os.path.join(MODELS_DIR, filename)
            
            # Skip directories and non-model files
            if os.path.isdir(filepath):
                continue
            
            if any(filename.lower().endswith(ext) for ext in ['.pt', '.pth', '.onnx', '.tflite', '.pb']):
                # Get file stats
                file_stat = os.stat(filepath)
                
                # Format model data
                model_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, filename))
                
                # Clean up display name (remove extension)
                name_parts = filename.split('.')
                if len(name_parts) > 1:
                    display_name = '.'.join(name_parts[:-1])
                else:
                    display_name = filename
                    
                # Replace underscores/dashes with spaces for display
                display_name = display_name.replace('_', ' ').replace('-', ' ')
                
                model_info = {
                    "id": model_id,
                    "name": display_name,
                    "path": filepath,
                    "uploadDate": datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
                    "fileSize": file_stat.st_size
                }
                models.append(model_info)
    except Exception as e:
        print(f"Error scanning models directory: {str(e)}")
        
    print(f"Found {len(models)} models")
    return models

@router.get("/list")
async def list_models() -> List[Dict[str, Any]]:
    """List all available models"""
    logger.info("Models router: Received request to list models")
    return get_models()

@router.post("/upload")
async def upload_model(file: UploadFile = File(...), name: str = Form("")):
    """Upload a new AI model"""
    try:
        logger.info(f"Models router: Received model upload request for {name or file.filename}")
        
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
        
        logger.info(f"Models router: Saving model to {filepath}")
        
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
        
        logger.info(f"Models router: Model upload successful: {model_id}")
        
        return {
            "id": model_id,
            "name": name.replace('_', ' ') if name else display_name,
            "path": filepath,
            "uploadDate": datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
            "fileSize": file_stat.st_size
        }
    except Exception as e:
        logger.error(f"Models router: Error uploading model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload model: {str(e)}")

@router.delete("/{model_id}")
async def delete_model(model_id: str):
    """Delete a model by its ID"""
    try:
        models = get_models()
        
        # Find the model with the given ID
        model_to_delete = next((model for model in models if model["id"] == model_id), None)
        
        if not model_to_delete:
            raise HTTPException(status_code=404, detail="Model not found")
            
        # Delete the file
        filepath = model_to_delete["path"]
        if os.path.exists(filepath):
            # Check active models before deleting
            active_models = []
            if os.path.exists(ACTIVE_MODELS_FILE):
                try:
                    with open(ACTIVE_MODELS_FILE, 'r') as f:
                        active_models = json.load(f)
                except Exception as e:
                    print(f"Error reading active models: {str(e)}")
                    active_models = []
            
            # Check if the model is active
            is_active = any(m.get('path', '') == filepath for m in active_models)
            
            # Now delete the file
            os.remove(filepath)
            
            # Update active models if needed
            if is_active:
                new_active_models = [m for m in active_models if m.get('path', '') != filepath]
                with open(ACTIVE_MODELS_FILE, 'w') as f:
                    json.dump(new_active_models, f)
                
            return {"message": f"Model {model_id} deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Model file not found")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete model: {str(e)}")

@router.post("/select")
async def select_model(model: ModelRequest):
    """Select a model as the active one"""
    try:
        # Save as a list with a single model for consistency
        with open(ACTIVE_MODELS_FILE, 'w') as f:
            json.dump([{"name": model.name, "path": model.path}], f)
        
        return {"message": "Active model set successfully"}
    except Exception as e:
        print(f"Error setting active model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to set active model: {str(e)}")

@router.post("/select-multiple")
async def select_multiple_models(request: MultipleModelsRequest):
    """Select multiple models for active use"""
    try:
        # Save the list of models
        with open(ACTIVE_MODELS_FILE, 'w') as f:
            models_list = [{"name": model.name, "path": model.path} for model in request.models]
            json.dump(models_list, f)
        
        return {"message": f"Set {len(request.models)} active models successfully"}
    except Exception as e:
        print(f"Error setting active models: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to set active models: {str(e)}")

@router.get("/active")
async def get_active_model():
    """Get the currently active model"""
    try:
        if not os.path.exists(ACTIVE_MODELS_FILE):
            raise HTTPException(status_code=404, detail="No active model set")
            
        with open(ACTIVE_MODELS_FILE, 'r') as f:
            active_models = json.load(f)
            
        # Return the first model for backwards compatibility
        if active_models and len(active_models) > 0:
            return active_models[0]
        else:
            raise HTTPException(status_code=404, detail="No active model set")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No active model set")
    except Exception as e:
        print(f"Error getting active model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get active model: {str(e)}")

@router.get("/active-multiple")
async def get_active_models():
    """Get all currently active models"""
    try:
        if not os.path.exists(ACTIVE_MODELS_FILE):
            return []
            
        with open(ACTIVE_MODELS_FILE, 'r') as f:
            active_models = json.load(f)
            
        return active_models
    except FileNotFoundError:
        return []
    except Exception as e:
        print(f"Error getting active models: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get active models: {str(e)}")

@router.get("/file-url")
async def get_model_file_url(path: str = Query(...)):
    """Get URL for accessing a model file"""
    try:
        # Check if file exists
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Model file not found")
            
        # In production, this would return a proper URL
        # For now we just return the path which can be used locally
        return {"url": path}
    except Exception as e:
        print(f"Error getting model file URL: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get model file URL: {str(e)}")
