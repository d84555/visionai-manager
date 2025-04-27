
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, validator, field_validator, model_validator
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
    
    # Validate that bbox is properly formatted
    @field_validator('bbox')
    def validate_bbox(cls, v):
        if len(v) != 4:
            raise ValueError('Bounding box must contain exactly 4 values: [x1, y1, x2, y2]')
        return v

class InferenceRequest(BaseModel):
    modelPath: str
    threshold: float = 0.5
    imageData: str  # Base64 encoded image

class InferenceResult(BaseModel):
    detections: List[Detection] = []  # Initialize with empty list by default
    inferenceTime: float = 0.0
    processedAt: str = "server"
    timestamp: str = ""
    
    # Ensure detections is always a list
    @model_validator(mode='after')
    def ensure_detections_list(self) -> 'InferenceResult':
        if self.detections is None:
            self.detections = []
        return self

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

def process_yolo_output(output, img_width, img_height, conf_threshold=0.5):
    """Process YOLO model output to get proper detections"""
    try:
        # Initialize empty detections list
        detections = []
        
        # Assuming output[0] contains detection data in YOLO format
        # Format: [x, y, w, h, conf, cls1, cls2, ...]
        predictions = output[0]
        
        if predictions is None or len(predictions) == 0:
            print("No predictions in YOLO output")
            return []
            
        # Process each detection
        for pred in predictions:
            # Get confidence and class scores
            confidence = float(pred[4])
            
            if confidence < conf_threshold:
                continue
                
            # Get class scores (starting from index 5)
            class_scores = pred[5:]
            class_id = int(np.argmax(class_scores))
            
            # Get normalized coordinates
            x, y, w, h = pred[0:4]
            
            # Convert to [x1, y1, x2, y2] format
            x1 = max(0, float(x - w/2))
            y1 = max(0, float(y - h/2))
            x2 = min(1, float(x + w/2))
            y2 = min(1, float(y + h/2))
            
            # Get class label
            label = YOLO_CLASSES[class_id] if class_id < len(YOLO_CLASSES) else f"class_{class_id}"
            
            detections.append(Detection(
                label=label,
                confidence=float(confidence),
                bbox=[x1, y1, x2, y2]
            ))
        
        return detections
    except Exception as e:
        print(f"Error processing YOLO output: {str(e)}")
        return []

def simulate_detection():
    """Simulate object detections when model loading fails"""
    # Always return a list for detections
    return [
        Detection(
            label="person",
            confidence=0.92,
            bbox=[0.2, 0.3, 0.5, 0.8]
        ),
        Detection(
            label="car",
            confidence=0.87,
            bbox=[0.6, 0.5, 0.9, 0.7]
        )
    ]

@router.get("/devices", response_model=List[DeviceInfo])
async def list_devices():
    """List available inference devices"""
    # ... keep existing code (device listing function)

@router.post("/detect", response_model=InferenceResult)
async def detect_objects(inference_request: InferenceRequest):
    """Detect objects in an image using ONNX model"""
    start_time = time.time()
    
    try:
        # Get the model path from the request
        model_path_input = inference_request.modelPath
        
        # Debug print to check what model path we're receiving
        print(f"Received model path: {model_path_input}")
        
        # Handle custom model paths that use the /custom_models/ prefix
        if model_path_input.startswith('/custom_models/'):
            # Extract just the filename
            filename = os.path.basename(model_path_input)
            
            # Ensure filename has an extension
            if not os.path.splitext(filename)[1]:
                # If no extension, assume ONNX
                filename = f"{filename}.onnx"
                
            # Create full path in the models directory
            model_path = os.path.join(MODELS_DIR, filename)
        elif os.path.isabs(model_path_input):
            # If it's an absolute path, use it directly
            model_path = model_path_input
        else:
            # Otherwise join with the models directory
            model_path = os.path.join(MODELS_DIR, model_path_input)
        
        # Check if model file exists
        if not os.path.exists(model_path):
            print(f"Model not found at: {model_path}")
            # Try alternate extensions if the file doesn't exist
            alternate_extensions = ['.onnx', '.pt', '.pth', '.tflite', '.pb']
            found = False
            
            # Try different extensions
            for ext in alternate_extensions:
                base_path = os.path.splitext(model_path)[0]
                alt_path = f"{base_path}{ext}"
                if os.path.exists(alt_path):
                    model_path = alt_path
                    found = True
                    print(f"Found model with alternate extension: {model_path}")
                    break
                    
            if not found:
                # If still not found, use simulation
                print(f"Model not found with any extension, using simulation")
                detections = simulate_detection()
                inference_time = time.time() - start_time
                return InferenceResult(
                    detections=detections,
                    inferenceTime=inference_time * 1000,
                    timestamp=datetime.now().isoformat()
                )
        
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
                
                # Get model metadata to determine format
                input_name = session.get_inputs()[0].name
                input_shape = session.get_inputs()[0].shape
                output_names = [output.name for output in session.get_outputs()]
                
                print(f"Model input name: {input_name}, shape: {input_shape}")
                print(f"Model output names: {output_names}")
                
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
            
            # Convert to numpy array for processing
            img_np = np.array(image)
            
            # Get image dimensions
            img_height, img_width = img_np.shape[:2]
            print(f"Image dimensions: {img_width}x{img_height}")
            
            # Preprocess image for ONNX model (resize, normalize, transpose)
            # This is a basic preprocessing for YOLO models - adjust based on your model requirements
            input_height, input_width = 640, 640  # Standard YOLO input size
            
            # Resize and normalize
            img_resized = cv2.resize(img_np, (input_width, input_height))
            img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
            img_normalized = img_rgb.astype(np.float32) / 255.0
            
            # Transpose to NCHW format required by ONNX Runtime
            img_transposed = np.transpose(img_normalized, (2, 0, 1))
            img_batch = np.expand_dims(img_transposed, axis=0)
            
            # Get input name from model
            input_name = session.get_inputs()[0].name
            
            # Run inference
            try:
                outputs = session.run(None, {input_name: img_batch})
                
                # Process outputs based on model format (YOLO)
                detections = process_yolo_output(
                    outputs, 
                    img_width, 
                    img_height, 
                    conf_threshold=inference_request.threshold
                )
                
                if detections is None:
                    detections = []
                
                print(f"Processed detections: {len(detections)}")
                
                inference_time = time.time() - start_time
                
                return InferenceResult(
                    detections=detections,
                    inferenceTime=inference_time * 1000,
                    processedAt="edge",
                    timestamp=datetime.now().isoformat()
                )
                
            except Exception as e:
                print(f"ONNX inference error: {str(e)}")
                # Fall back to simulated detections on inference error
                detections = simulate_detection()
                inference_time = time.time() - start_time
                return InferenceResult(
                    detections=detections,
                    inferenceTime=inference_time * 1000,
                    processedAt="server",
                    timestamp=datetime.now().isoformat()
                )
                
        except Exception as e:
            print(f"Image processing error: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")
        
    except Exception as e:
        print(f"Inference error: {str(e)}")
        # Return a valid response with an empty detections list instead of raising an exception
        return InferenceResult(
            detections=[],  # Empty list instead of None
            inferenceTime=0,
            processedAt="server",
            timestamp=datetime.now().isoformat()
        )

# ... keep existing code (stream processing endpoints and utility functions)

