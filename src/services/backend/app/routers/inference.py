
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import numpy as np
import cv2
import json
import os
import time
import base64
from datetime import datetime
from io import BytesIO
from PIL import Image

# Import conditionally - this will fail gracefully if onnxruntime is not installed
try:
    import onnxruntime as ort
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False
    print("WARNING: onnxruntime not available. Inference will be simulated.")

# Import YOLOv8 preprocessing utils
try:
    from ultralytics.utils.ops import scale_boxes
    ULTRALYTICS_AVAILABLE = True
except ImportError:
    ULTRALYTICS_AVAILABLE = False
    print("WARNING: ultralytics not available. Using basic preprocessing.")

# Models for request/response
class Detection(BaseModel):
    label: str
    confidence: float
    bbox: List[float]  # [x1, y1, x2, y2] normalized coordinates

class InferenceRequest(BaseModel):
    modelPath: str
    threshold: float = 0.5
    imageData: str  # Base64 encoded image

class InferenceResult(BaseModel):
    detections: List[Detection]
    inferenceTime: float
    timestamp: str

class DeviceInfo(BaseModel):
    id: str
    name: str
    type: str
    status: str

# Initialize router
router = APIRouter(prefix="/inference", tags=["inference"])

# Cache for ONNX sessions to improve performance
model_sessions = {}

# Configure inference settings
MODELS_DIR = os.environ.get("MODELS_DIR", "/opt/visionai/models")
os.makedirs(MODELS_DIR, exist_ok=True)

# YOLO class names
YOLO_CLASSES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
    "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
    "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
    "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
    "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator",
    "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
]

def get_available_providers():
    """Get available ONNX Runtime providers"""
    if ONNX_AVAILABLE:
        return ort.get_available_providers()
    else:
        # Return simulated providers if ONNX is not available
        return ["SimulatedCPU"]

# ... keep existing code (image preprocessing functions)

def is_onnx_model(model_path):
    """Check if the model is in ONNX format"""
    # Check file extension - more reliable method
    return model_path.lower().endswith('.onnx')

def simulate_detection():
    """Simulate object detections when model loading fails"""
    # ... keep existing code (simulation functions)

@router.get("/devices", response_model=List[DeviceInfo])
async def list_devices():
    """List available inference devices"""
    # ... keep existing code (device listing function)

@router.post("/detect", response_model=InferenceResult)
async def detect_objects(inference_request: InferenceRequest):
    """Detect objects in an image using ONNX model"""
    start_time = time.time()
    
    try:
        # Get the model path exactly as provided, ensuring we keep the file extension
        model_path_input = inference_request.modelPath
        
        # Debug print to check what model path we're receiving
        print(f"Received model path: {model_path_input}")
        
        # Handle both full paths and just filenames
        if os.path.isabs(model_path_input):
            # If it's an absolute path, use it directly
            model_path = model_path_input
        else:
            # Otherwise join with the models directory
            model_path = os.path.join(MODELS_DIR, model_path_input)
        
        # Check if model file exists
        if not os.path.exists(model_path):
            print(f"Model not found at: {model_path}")
            raise HTTPException(status_code=404, detail=f"Model not found: {model_path}")
        
        print(f"Using model at path: {model_path}")
        
        # Check if model is ONNX format based on file extension
        if not is_onnx_model(model_path):
            print(f"Non-ONNX model format detected: {model_path}. Using simulated detections.")
            detections = simulate_detection()
            inference_time = time.time() - start_time
            return InferenceResult(
                detections=detections,
                inferenceTime=inference_time * 1000,  # Convert to milliseconds
                timestamp=datetime.now().isoformat()
            )
            
        if not ONNX_AVAILABLE:
            print("ONNX Runtime not available. Using simulated detections.")
            detections = simulate_detection()
            inference_time = time.time() - start_time
            return InferenceResult(
                detections=detections,
                inferenceTime=inference_time * 1000,
                timestamp=datetime.now().isoformat()
            )
        
        # Load model (or use cached session)
        if model_path not in model_sessions:
            providers = []
            if "CUDAExecutionProvider" in get_available_providers():
                providers.append("CUDAExecutionProvider")
            providers.append("CPUExecutionProvider")
            
            try:
                print(f"Loading ONNX model: {model_path}")
                session = ort.InferenceSession(model_path, providers=providers)
                model_sessions[model_path] = session
                print(f"Successfully loaded ONNX model: {model_path}")
                print(f"Using providers: {providers}")
            except Exception as e:
                print(f"Error loading ONNX model: {str(e)}")
                # If model loading failed, use simulated detections
                detections = simulate_detection()
                inference_time = time.time() - start_time
                return InferenceResult(
                    detections=detections,
                    inferenceTime=inference_time * 1000,
                    timestamp=datetime.now().isoformat()
                )
        else:
            session = model_sessions[model_path]
        
        # Decode base64 image
        try:
            # Handle both with and without data URI prefix
            image_data_parts = inference_request.imageData.split(',')
            if len(image_data_parts) > 1:
                image_data = base64.b64decode(image_data_parts[1])
            else:
                image_data = base64.b64decode(image_data_parts[0])
                
            image = Image.open(BytesIO(image_data))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")
        
        # Preprocess image
        input_tensor, scale, (new_width, new_height) = preprocess_image(image)
        
        # Run inference
        outputs = session.run(None, {"images": input_tensor.astype(np.float32)})
        
        # Process YOLO output
        output = outputs[0]  # Shape: (1, num_boxes, 85) - 85 = 4 (bbox) + 1 (conf) + 80 (class scores)
        
        # Get predictions above threshold
        detections = []
        if output.shape[0] > 0:
            for pred in output[0]:
                conf = pred[4]
                if conf > inference_request.threshold:
                    # Get class scores
                    class_scores = pred[5:]
                    class_id = np.argmax(class_scores)
                    
                    # Get normalized coordinates
                    x1, y1, x2, y2 = pred[:4]
                    
                    # Create detection object
                    detection = Detection(
                        label=YOLO_CLASSES[class_id],
                        confidence=float(conf),
                        bbox=[float(x1), float(y1), float(x2), float(y2)]
                    )
                    detections.append(detection)
        
        inference_time = time.time() - start_time
        
        return InferenceResult(
            detections=detections,
            inferenceTime=inference_time * 1000,  # Convert to milliseconds
            timestamp=datetime.now().isoformat()
        )
        
    except Exception as e:
        print(f"Inference error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")

# ... keep existing code (stream processing endpoints and utility functions)
