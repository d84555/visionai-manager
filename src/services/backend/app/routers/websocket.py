from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List, Any
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
# Fix import to include only functions that exist in inference.py
from .inference import InferenceResult, Detection, optimize_pytorch_model
from .inference import YOLO, TORCH_AVAILABLE, ULTRALYTICS_AVAILABLE, CUDA_AVAILABLE, FP16_SUPPORTED
from .inference import simulate_detection, convert_ultralytics_results_to_detections

# Initialize router
router = APIRouter(prefix="/ws", tags=["websocket"])

# Cache for active models to avoid reloading
active_models = {}
connected_clients = {}

class VideoFrame(BaseModel):
    modelPath: str
    threshold: float = 0.5
    imageData: str
    clientId: str

async def process_frame(websocket: WebSocket, frame_data: Dict[str, Any]):
    """Process a single video frame from websocket"""
    start_time = time.time()
    
    try:
        # Get model path and client ID
        model_path = frame_data.get("modelPath", "")
        client_id = frame_data.get("clientId", "unknown")
        threshold = float(frame_data.get("threshold", 0.5))
        
        # Process image data
        image_data_parts = frame_data.get("imageData", "").split(',')
        if len(image_data_parts) > 1:
            image_data = base64.b64decode(image_data_parts[1])
        else:
            image_data = base64.b64decode(image_data_parts[0])
        
        image = Image.open(BytesIO(image_data))
        img_width, img_height = image.size
        
        # Get or load model
        if model_path in active_models:
            model = active_models[model_path]
        elif TORCH_AVAILABLE and ULTRALYTICS_AVAILABLE and model_path.lower().endswith(('.pt', '.pth')):
            try:
                # Load PyTorch model
                model = YOLO(model_path)
                
                # Move to device
                if CUDA_AVAILABLE:
                    model.to("cuda")
                else:
                    model.to("cpu")
                    
                # Store for reuse
                active_models[model_path] = model
            except Exception as e:
                print(f"Error loading model: {str(e)}")
                # Fallback to simulation
                detections = simulate_detection()
                inference_time = (time.time() - start_time) * 1000
                
                await websocket.send_json({
                    "detections": [d.dict() for d in detections],
                    "inferenceTime": inference_time,
                    "processedAt": "server",
                    "timestamp": datetime.now().isoformat()
                })
                return
        else:
            # Unsupported model or no model provided
            detections = simulate_detection()
            inference_time = (time.time() - start_time) * 1000
            
            await websocket.send_json({
                "detections": [d.dict() for d in detections],
                "inferenceTime": inference_time,
                "processedAt": "server",
                "timestamp": datetime.now().isoformat()
            })
            return
            
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
            detections = convert_ultralytics_results_to_detections(
                results,
                img_width=img_width,
                img_height=img_height,
                conf_threshold=threshold
            )
            
            inference_time = (time.time() - start_time) * 1000
            
            # Send results back to client
            await websocket.send_json({
                "detections": [d.dict() for d in detections],
                "inferenceTime": inference_time,
                "processedAt": "edge",
                "timestamp": datetime.now().isoformat(),
                "clientId": client_id
            })
            
        except Exception as e:
            print(f"Error during inference: {str(e)}")
            # Send error to client
            await websocket.send_json({
                "error": str(e),
                "timestamp": datetime.now().isoformat(),
                "clientId": client_id
            })
            
    except Exception as e:
        print(f"Error processing frame: {str(e)}")
        await websocket.send_json({
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        })

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
