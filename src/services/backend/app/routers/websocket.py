
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
import traceback
import os

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

# Import models and detection functions
from .inference import InferenceResult, Detection, optimize_pytorch_model, get_model_path
from .inference import YOLO, TORCH_AVAILABLE, ULTRALYTICS_AVAILABLE, CUDA_AVAILABLE, FP16_SUPPORTED
from .inference import simulate_detection, convert_ultralytics_results_to_detections

# Initialize router
router = APIRouter(prefix="/ws", tags=["websocket"])

# Cache for active models to avoid reloading
active_models = {}
connected_clients = {}

# Get the models directory from environment variable or use default
MODELS_DIR = os.environ.get("MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models"))
print(f"WebSocket module using models directory: {MODELS_DIR}")

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
        
        print(f"[DEBUG] Processing frame with {len(model_paths)} models: {model_paths}")
        
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
        try:
            original_image = Image.open(BytesIO(image_data))
            img_width, img_height = original_image.size
            print(f"[DEBUG] Successfully decoded image with dimensions {img_width}x{img_height}")
        except Exception as e:
            print(f"[ERROR] Failed to decode image: {str(e)}")
            await websocket.send_json({
                "error": f"Failed to decode image: {str(e)}",
                "timestamp": datetime.now().isoformat()
            })
            return
        
        # Combined detections from all models
        all_detections = []
        models_loaded = 0
        inference_times = []
        model_results = {}
        
        # List to collect all model processing tasks
        model_tasks = []
        
        # Process each model in parallel using asyncio tasks
        for model_path in model_paths:
            print(f"[DEBUG] Creating task for model: {model_path}")
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
        print(f"[DEBUG] Gathered results from {len(results)} model tasks")
        
        # Process results from all models
        for result in results:
            if result is not None:
                model_path, model_detections, model_inference_time, model_name = result
                print(f"[DEBUG] Model {model_name} returned {len(model_detections)} detections")
                
                if model_detections:
                    # Store model-specific results
                    model_results[model_name] = model_detections
                    
                    # Add to combined list with model name as prefix
                    for detection in model_detections:
                        # Ensure each detection has a unique ID
                        detection.id = f"{model_name}_{id(detection)}"
                        # Ensure detection has the model name for frontend identification
                        detection.model = model_name
                        all_detections.append(detection)
                    
                    # Track model performance
                    inference_times.append(model_inference_time)
                    models_loaded += 1
            else:
                print(f"[WARNING] Model task returned None")
        
        # If no models could be loaded, use simulation as fallback
        if not models_loaded and not all_detections:
            print("[DEBUG] No models could be loaded, falling back to simulation")
            all_detections = simulate_detection()
            
        # Calculate total inference time
        total_inference_time = (time.time() - start_time) * 1000
        
        print(f"[DEBUG] Total detections: {len(all_detections)}")
        print(f"[DEBUG] Model results: {model_results.keys()}")
        
        # Check if detections are properly formatted
        if all_detections:
            sample_detection = all_detections[0]
            print(f"[DEBUG] Sample detection: {sample_detection}")
            
        # Convert detections to dictionary representation
        detection_dicts = []
        for detection in all_detections:
            try:
                # Ensure detection has all required fields
                det_dict = detection.dict()
                # Add bbox format required by frontend if not present
                if not det_dict.get('bbox') and all(k in det_dict for k in ['x', 'y', 'width', 'height']):
                    # Convert center format to bbox format
                    x, y, w, h = det_dict['x'], det_dict['y'], det_dict['width'], det_dict['height']
                    det_dict['bbox'] = {
                        'x1': max(0, x - w/2),
                        'y1': max(0, y - h/2),
                        'x2': min(1, x + w/2),
                        'y2': min(1, y + h/2),
                        'width': w,
                        'height': h
                    }
                detection_dicts.append(det_dict)
            except Exception as e:
                print(f"[ERROR] Failed to convert detection to dict: {str(e)}")
        
        # Prepare model-specific results
        model_results_dict = {}
        for model_name, detections in model_results.items():
            try:
                model_results_dict[model_name] = [d.dict() for d in detections]
            except Exception as e:
                print(f"[ERROR] Failed to convert model results to dict: {str(e)}")
                model_results_dict[model_name] = []
        
        # Prepare result dictionary for client
        result_dict = {
            "detections": detection_dicts,
            "modelResults": model_results_dict,
            "inferenceTime": total_inference_time,
            "modelInferenceTimes": inference_times,
            "modelsLoaded": models_loaded,
            "processedAt": "edge" if models_loaded > 0 else "simulation",
            "timestamp": datetime.now().isoformat(),
            "clientId": client_id,
            "modelPaths": model_paths
        }
        
        # Print detailed information about what we're sending back
        print(f"[DEBUG] Sending response with {len(detection_dicts)} detections")
        print(f"[DEBUG] Model results keys: {list(model_results_dict.keys())}")
        for model_name, model_dets in model_results_dict.items():
            print(f"[DEBUG] Model {model_name} has {len(model_dets)} detections")
        
        # Send the combined results back to client
        await websocket.send_json(result_dict)
        print(f"[DEBUG] Response sent successfully")
            
    except Exception as e:
        print(f"[ERROR] Error processing frame: {str(e)}")
        traceback.print_exc()
        await websocket.send_json({
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        })

async def process_single_model(model_path: str, original_image: Image.Image, img_width: int, img_height: int, threshold: float):
    """Process a single model independently to avoid shared buffer issues"""
    start_time = time.time()
    model_name = os.path.basename(model_path).split('.')[0]  # Get model name without extension
    
    try:
        print(f"[DEBUG] Processing model: {model_path} (name: {model_name})")
        
        # Resolve the model path to the actual filesystem path
        resolved_model_path = get_model_path(model_path)
        print(f"[DEBUG] Resolved model path: {resolved_model_path}")
        
        # Check if model file exists
        if not os.path.exists(resolved_model_path):
            print(f"[ERROR] Model file does not exist: {resolved_model_path}")
            print(f"[DEBUG] Models directory contents: {os.listdir(MODELS_DIR) if os.path.exists(MODELS_DIR) else 'directory not found'}")
            return None
            
        # Create a deep copy of the image to avoid shared buffer issues
        image = copy.deepcopy(original_image)
        
        # Get or load model
        if resolved_model_path in active_models:
            model = active_models[resolved_model_path]
            print(f"[DEBUG] Using cached model: {resolved_model_path}")
        elif TORCH_AVAILABLE and ULTRALYTICS_AVAILABLE and resolved_model_path.lower().endswith(('.pt', '.pth')):
            try:
                print(f"[DEBUG] Loading PyTorch model: {resolved_model_path}")
                # Load PyTorch model
                model = YOLO(resolved_model_path)
                
                # Move to device
                if CUDA_AVAILABLE:
                    model.to("cuda")
                    print(f"[DEBUG] Model moved to CUDA")
                else:
                    model.to("cpu")
                    print(f"[DEBUG] Model using CPU")
                    
                # Store for reuse
                active_models[resolved_model_path] = model
                print(f"[DEBUG] Model loaded and cached: {resolved_model_path}")
            except Exception as e:
                print(f"[ERROR] Error loading model {resolved_model_path}: {str(e)}")
                traceback.print_exc()
                return None
        else:
            # Skip unsupported models
            print(f"[WARNING] Unsupported model format or model not found: {resolved_model_path}")
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
                print(f"[DEBUG] Using half precision (FP16)")
            
            # Conduct inference
            print(f"[DEBUG] Running inference with model {model_name}")
            results = model.predict(**inference_params)
            print(f"[DEBUG] Inference complete for {model_name}, converting results")
            
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
            print(f"[DEBUG] Model {model_name} processed in {model_inference_time:.2f}ms with {len(model_detections)} detections")
            
            # Print a sample detection if available
            if model_detections:
                print(f"[DEBUG] Sample detection from {model_name}: {model_detections[0]}")
                for i, det in enumerate(model_detections[:3]):  # Print first 3 detections
                    print(f"[DEBUG] Detection {i}: class={det.class_name}, label={det.label}, confidence={det.confidence:.2f}, bbox={det.bbox}")
            else:
                print(f"[DEBUG] No detections found for model {model_name}")
            
            return model_path, model_detections, model_inference_time, model_name
            
        except Exception as e:
            print(f"[ERROR] Error during inference with model {model_path}: {str(e)}")
            traceback.print_exc()
            return None
            
    except Exception as e:
        print(f"[ERROR] Error processing model {model_path}: {str(e)}")
        traceback.print_exc()
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
    # Remove authentication checks and accept all connections
    await websocket.accept()
    client_id = f"client-{time.time()}"
    connected_clients[client_id] = websocket
    
    try:
        print(f"[INFO] New WebSocket client connected: {client_id}")
        # Send initial connection confirmation
        await websocket.send_json({
            "status": "connected",
            "clientId": client_id,
            "timestamp": datetime.now().isoformat(),
            "modelsDir": MODELS_DIR,
            "availableModels": os.listdir(MODELS_DIR) if os.path.exists(MODELS_DIR) else []
        })
        
        # Start background task for cache management
        asyncio.create_task(clear_unused_models())
        
        while True:
            # Receive frame data
            print(f"[DEBUG] Waiting for message from client {client_id}")
            frame_data = await websocket.receive_json()
            print(f"[DEBUG] Received message from client {client_id}")
            
            # Add client ID if not present
            if "clientId" not in frame_data:
                frame_data["clientId"] = client_id
                
            # Process frame asynchronously
            asyncio.create_task(process_frame(websocket, frame_data))
            
    except WebSocketDisconnect:
        print(f"[INFO] Client disconnected: {client_id}")
        if client_id in connected_clients:
            del connected_clients[client_id]
    except Exception as e:
        print(f"[ERROR] WebSocket error: {str(e)}")
        traceback.print_exc()
        if client_id in connected_clients:
            del connected_clients[client_id]
