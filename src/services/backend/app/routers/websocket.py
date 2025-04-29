
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List, Any, Optional
import json
import base64
import time
from io import BytesIO
from PIL import Image
import asyncio
from pydantic import BaseModel
from datetime import datetime

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

# Import models and detection functions
from .inference import InferenceResult, Detection, optimize_pytorch_model
from .inference import YOLO, TORCH_AVAILABLE, ULTRALYTICS_AVAILABLE, CUDA_AVAILABLE, FP16_SUPPORTED
from .inference import simulate_detection, convert_ultralytics_results_to_detections

# Initialize router
router = APIRouter(prefix="/ws", tags=["websocket"])

# Cache for active models to avoid reloading
active_models = {}
connected_clients = {}

class VideoFrame(BaseModel):
    modelPaths: List[str]
    threshold: float = 0.5
    imageData: str
    clientId: str

async def process_frame(websocket: WebSocket, frame_data: Dict[str, Any]):
    """Process a single video frame from websocket"""
    start_time = time.time()
    
    try:
        # Get model paths and client ID
        model_paths = frame_data.get("modelPaths", [])
        if isinstance(model_paths, str):
            model_paths = [model_paths]  # Convert single path to list for backwards compatibility
            
        client_id = frame_data.get("clientId", "unknown")
        threshold = float(frame_data.get("threshold", 0.5))
        
        # If no models specified, return empty results
        if not model_paths:
            await websocket.send_json({
                "detections": [],
                "inferenceTime": 0,
                "processedAt": "none",
                "timestamp": datetime.now().isoformat(),
                "message": "No models specified for inference"
            })
            return
        
        # Process image data
        image_data_parts = frame_data.get("imageData", "").split(',')
        if len(image_data_parts) > 1:
            image_data = base64.b64decode(image_data_parts[1])
        else:
            image_data = base64.b64decode(image_data_parts[0])
        
        image = Image.open(BytesIO(image_data))
        img_width, img_height = image.size
        
        # Combined detections from all models
        all_detections = []
        models_loaded = 0
        inference_times = []
        model_results = {}
        
        # Process each model
        for model_path in model_paths:
            model_start_time = time.time()
            model_name = model_path.split('/')[-1]
            
            # Get or load model
            if model_path in active_models:
                model = active_models[model_path]
                print(f"Using cached model: {model_path}")
            elif TORCH_AVAILABLE and ULTRALYTICS_AVAILABLE and model_path.lower().endswith(('.pt', '.pth')):
                try:
                    print(f"Loading PyTorch model: {model_path}")
                    # Load PyTorch model
                    model = YOLO(model_path)
                    
                    # Move to device
                    if CUDA_AVAILABLE:
                        model.to("cuda")
                    else:
                        model.to("cpu")
                        
                    # Store for reuse
                    active_models[model_path] = model
                    print(f"Model loaded and cached: {model_path}")
                    models_loaded += 1
                except Exception as e:
                    print(f"Error loading model {model_path}: {str(e)}")
                    continue
            else:
                # Skip unsupported models
                print(f"Unsupported model format or model not found: {model_path}")
                continue
                
            # Run inference
            try:
                # Set up inference parameters
                inference_params = {
                    "source": image,
                    "conf": threshold,
                    "verbose": False,
                }
                
                # Add half precision if supported
                if FP16_SUPPORTED and CUDA_AVAILABLE:
                    inference_params["half"] = True
                
                # Conduct inference
                results = model.predict(**inference_params)
                
                # Convert results to our detection format
                model_detections = convert_ultralytics_results_to_detections(
                    results,
                    img_width=img_width,
                    img_height=img_height,
                    conf_threshold=threshold,
                    model_name=model_name  # Add model name to detections
                )
                
                # Store model-specific results
                model_results[model_name] = model_detections
                
                # Add detections to combined list with model name as prefix
                for detection in model_detections:
                    detection.label = f"{model_name.split('.')[0]}: {detection.label}"
                    all_detections.append(detection)
                
                # Track inference time for this model
                model_inference_time = (time.time() - model_start_time) * 1000
                inference_times.append(model_inference_time)
                
            except Exception as e:
                print(f"Error during inference with model {model_path}: {str(e)}")
                continue
        
        # Calculate total inference time
        total_inference_time = (time.time() - start_time) * 1000
        
        # If we couldn't load any models, use simulation as fallback
        if not models_loaded and not all_detections:
            print("No models could be loaded, falling back to simulation")
            all_detections = simulate_detection()
            
        # Send combined results back to client
        await websocket.send_json({
            "detections": [d.dict() for d in all_detections],
            "modelResults": {name: [d.dict() for d in detections] for name, detections in model_results.items()},
            "inferenceTime": total_inference_time,
            "modelInferenceTimes": inference_times,
            "modelsLoaded": models_loaded,
            "processedAt": "edge" if models_loaded > 0 else "simulation",
            "timestamp": datetime.now().isoformat(),
            "clientId": client_id,
            "modelPaths": model_paths
        })
            
    except Exception as e:
        print(f"Error processing frame: {str(e)}")
        await websocket.send_json({
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        })

# Clear model cache periodically to free memory
async def clear_unused_models():
    """Periodically clear models that haven't been used recently"""
    while True:
        await asyncio.sleep(3600)  # Check every hour
        if len(active_models) > 3:  # Keep at most 3 models in memory
            # For now we'll just log this - in production you'd implement a full LRU cache
            print(f"Would clear some models from cache, currently have {len(active_models)} models")

@router.websocket("/inference")
async def websocket_inference(websocket: WebSocket):
    await websocket.accept()
    client_id = f"client-{time.time()}"
    connected_clients[client_id] = websocket
    
    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "status": "connected",
            "clientId": client_id,
            "timestamp": datetime.now().isoformat()
        })
        
        # Start background task for cache management
        asyncio.create_task(clear_unused_models())
        
        while True:
            # Receive frame data
            frame_data = await websocket.receive_json()
            
            # Add client ID if not present
            if "clientId" not in frame_data:
                frame_data["clientId"] = client_id
                
            # Process frame asynchronously
            asyncio.create_task(process_frame(websocket, frame_data))
            
    except WebSocketDisconnect:
        if client_id in connected_clients:
            del connected_clients[client_id]
        print(f"Client disconnected: {client_id}")
    except Exception as e:
        print(f"WebSocket error: {str(e)}")
        if client_id in connected_clients:
            del connected_clients[client_id]
