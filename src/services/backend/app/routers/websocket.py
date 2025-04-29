
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
import copy

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
        
        # Open the image once
        original_image = Image.open(BytesIO(image_data))
        img_width, img_height = original_image.size
        
        print(f"Processing image with dimensions {img_width}x{img_height} for {len(model_paths)} models")
        
        # Combined detections from all models
        all_detections = []
        models_loaded = 0
        inference_times = []
        model_results = {}
        
        # List to collect all model processing tasks
        model_tasks = []
        
        # Process each model in parallel using asyncio tasks
        for model_path in model_paths:
            # Create a task for each model's inference
            task = asyncio.create_task(
                process_single_model(
                    model_path=model_path,
                    original_image=original_image,
                    img_width=img_width,
                    img_height=img_height,
                    threshold=threshold
                )
            )
            model_tasks.append(task)
        
        # Wait for all model inference tasks to complete
        results = await asyncio.gather(*model_tasks)
        
        # Process results from all models
        for result in results:
            if result is not None:
                model_path, model_detections, model_inference_time, model_name = result
                
                if model_detections:
                    # Store model-specific results
                    model_results[model_name] = model_detections
                    
                    # Add to combined list with model name as prefix
                    for detection in model_detections:
                        # Ensure each detection has a unique ID
                        detection.id = f"{model_name}_{id(detection)}"
                        all_detections.append(detection)
                    
                    # Track model performance
                    inference_times.append(model_inference_time)
                    models_loaded += 1
        
        # If no models could be loaded, use simulation as fallback
        if not models_loaded and not all_detections:
            print("No models could be loaded, falling back to simulation")
            all_detections = simulate_detection()
            
        # Calculate total inference time
        total_inference_time = (time.time() - start_time) * 1000
        
        # Prepare result dictionary for client
        result_dict = {
            "detections": [d.dict() for d in all_detections],
            "modelResults": {name: [d.dict() for d in detections] for name, detections in model_results.items()},
            "inferenceTime": total_inference_time,
            "modelInferenceTimes": inference_times,
            "modelsLoaded": models_loaded,
            "processedAt": "edge" if models_loaded > 0 else "simulation",
            "timestamp": datetime.now().isoformat(),
            "clientId": client_id,
            "modelPaths": model_paths
        }
        
        # Send the combined results back to client
        await websocket.send_json(result_dict)
            
    except Exception as e:
        print(f"Error processing frame: {str(e)}")
        import traceback
        traceback.print_exc()
        await websocket.send_json({
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        })

async def process_single_model(model_path: str, original_image: Image.Image, img_width: int, img_height: int, threshold: float):
    """Process a single model independently to avoid shared buffer issues"""
    start_time = time.time()
    model_name = model_path.split('/')[-1].split('.')[0]  # Get model name without extension
    
    try:
        # Create a deep copy of the image to avoid shared buffer issues
        image = copy.deepcopy(original_image)
        
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
            except Exception as e:
                print(f"Error loading model {model_path}: {str(e)}")
                return None
        else:
            # Skip unsupported models
            print(f"Unsupported model format or model not found: {model_path}")
            return None
                
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
            
            # Calculate inference time for this model
            model_inference_time = (time.time() - start_time) * 1000
            print(f"Model {model_name} processed in {model_inference_time:.2f}ms with {len(model_detections)} detections")
            
            return model_path, model_detections, model_inference_time, model_name
            
        except Exception as e:
            print(f"Error during inference with model {model_path}: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
            
    except Exception as e:
        print(f"Error processing model {model_path}: {str(e)}")
        return None

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

