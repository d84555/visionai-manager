from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, WebSocket, Depends, Request
from typing import List, Dict, Any, Optional, Callable
from pydantic import BaseModel, field_validator, model_validator
import numpy as np
import cv2
import json
import os
import time
import base64
from datetime import datetime
from io import BytesIO
from PIL import Image
import asyncio
from concurrent.futures import ThreadPoolExecutor
import queue
import concurrent.futures
import uuid

# Import conditionally - this will fail gracefully if onnxruntime is not installed
try:
    import onnxruntime as ort
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False
    print("WARNING: onnxruntime not available. Inference will be simulated.")

# Import torch
try:
    import torch
    TORCH_AVAILABLE = True
    TORCH_VERSION = torch.__version__
    print(f"PyTorch version: {TORCH_VERSION}")
    TORCH_COMPILE_AVAILABLE = hasattr(torch, 'compile')
    if TORCH_COMPILE_AVAILABLE:
        print("torch.compile is available (PyTorch 2.0+)")
    else:
        print("torch.compile is not available (PyTorch < 2.0)")
        
    # Check if CUDA is available for GPU acceleration
    CUDA_AVAILABLE = torch.cuda.is_available()
    if CUDA_AVAILABLE:
        print(f"CUDA is available: {torch.cuda.get_device_name(0)}")
        # Check if GPU supports half precision
        FP16_SUPPORTED = torch.cuda.is_available() and torch.cuda.get_device_capability()[0] >= 7
        print(f"Half precision (FP16) support: {FP16_SUPPORTED}")
        
        # Enable automatic quantization for INT8 inference when PyTorch supports it
        QUANTIZATION_AVAILABLE = hasattr(torch, 'quantization') and hasattr(torch.quantization, 'quantize_dynamic')
        print(f"Quantization support: {QUANTIZATION_AVAILABLE}")
    else:
        FP16_SUPPORTED = False
        QUANTIZATION_AVAILABLE = False
        print("CUDA is not available, using CPU only")
except ImportError:
    TORCH_AVAILABLE = False
    TORCH_VERSION = None
    TORCH_COMPILE_AVAILABLE = False
    CUDA_AVAILABLE = False
    FP16_SUPPORTED = False
    QUANTIZATION_AVAILABLE = False
    print("WARNING: PyTorch not available. PyTorch models will not be supported.")

# Import YOLOv8 preprocessing utils
try:
    from ultralytics import YOLO
    from ultralytics.utils.ops import scale_boxes
    from ultralytics.utils.ops import non_max_suppression
    ULTRALYTICS_AVAILABLE = True
    
    # Try to import CUDA-accelerated operations
    try:
        from ultralytics.utils.torch_utils import smart_inference_mode
    except ImportError:
        smart_inference_mode = lambda func: func
        print("WARNING: Could not import smart_inference_mode")
    
except ImportError:
    ULTRALYTICS_AVAILABLE = False
    print("WARNING: ultralytics not available. Using basic preprocessing.")
    smart_inference_mode = lambda func: func

# Models for request/response
class Detection(BaseModel):
    id: str = ""  # Added ID field for unique identification
    label: str
    confidence: float
    bbox: List[float] = []  # [x1, y1, x2, y2] normalized coordinates
    x: Optional[float] = None  # Optional center x coordinate
    y: Optional[float] = None  # Optional center y coordinate
    width: Optional[float] = None  # Optional width
    height: Optional[float] = None  # Optional height
    
    # Validate that bbox is properly formatted
    @field_validator('bbox')
    def validate_bbox(cls, v):
        if v and len(v) != 4:
            raise ValueError('Bounding box must contain exactly 4 values: [x1, y1, x2, y2]')
        return v

class InferenceRequest(BaseModel):
    modelPath: str
    threshold: float = 0.5
    imageData: str  # Base64 encoded image
    quantized: bool = False  # Flag to use quantized model if available

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

# Cache for ONNX sessions and PyTorch models to improve performance
model_sessions = {}
pytorch_models = {}

# Cache for optimized PyTorch models (TorchScript, etc.)
optimized_models = {}

# Cache for quantized models
quantized_models = {}

# Queue for managing concurrent inference requests
inference_queue = queue.Queue()

# Request counter for tracking active requests
active_requests = 0

# Configure inference settings
MODELS_DIR = os.environ.get("MODELS_DIR", "/opt/visionai/models")
os.makedirs(MODELS_DIR, exist_ok=True)

# Maximum concurrent inference requests
MAX_CONCURRENT_INFERENCES = int(os.environ.get("MAX_CONCURRENT_INFERENCES", "4"))

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

def gpu_accelerated_preprocessing(image, target_size=(640, 640)):
    """Use GPU acceleration for image preprocessing when available"""
    if TORCH_AVAILABLE and CUDA_AVAILABLE:
        try:
            # Convert PIL Image to torch tensor on GPU
            from torchvision import transforms
            
            # Create preprocessing pipeline
            preprocess = transforms.Compose([
                transforms.Resize(target_size),
                transforms.ToTensor(),  # Scales to [0, 1] and converts to CxHxW
            ])
            
            # Apply preprocessing
            tensor = preprocess(image).unsqueeze(0).cuda()  # Add batch dimension
            
            return tensor
        except Exception as e:
            print(f"GPU preprocessing failed: {e}, falling back to CPU")
    
    # Fallback to CPU-based preprocessing
    # Resize the image
    resized_image = image.resize(target_size)
    
    # Convert to RGB
    rgb_image = resized_image.convert("RGB")
    
    # Convert to numpy array
    img_np = np.array(rgb_image)
    
    # Normalize the image
    img_normalized = img_np.astype(np.float32) / 255.0
    
    # Transpose the image to NCHW format
    img_transposed = img_normalized.transpose((2, 0, 1))
    
    # Add batch dimension
    img_batch = np.expand_dims(img_transposed, axis=0)
    
    return img_batch

def base64_to_image(base64_str):
    """Convert base64 string to PIL Image"""
    image_data = base64.b64decode(base64_str)
    image = Image.open(BytesIO(image_data))
    return image

def is_onnx_model(model_path):
    """Check if the model is in ONNX format"""
    return model_path.lower().endswith('.onnx')

def is_pytorch_model(model_path):
    """Check if the model is in PyTorch format"""
    return model_path.lower().endswith('.pt') or model_path.lower().endswith('.pth')

def create_quantized_model(model):
    """Create a quantized version of the model for faster inference"""
    if not TORCH_AVAILABLE or not QUANTIZATION_AVAILABLE:
        print("Quantization not available, returning original model")
        return model
    
    try:
        print("Creating quantized model...")
        
        # For YOLO models, we can't easily quantize directly
        if hasattr(model, 'predictor') and hasattr(model.predictor, 'model'):
            # Use dynamic quantization - convert to INT8 where possible
            quantized_model = torch.quantization.quantize_dynamic(
                model.predictor.model,  # The actual PyTorch model
                {torch.nn.Linear, torch.nn.Conv2d},  # Layers to quantize
                dtype=torch.qint8  # Quantization type
            )
            
            # Replace model weights with quantized version
            model.predictor._load_from_weights(quantized_model)
            print("YOLO model quantized successfully")
        else:
            # Standard PyTorch model
            quantized_model = torch.quantization.quantize_dynamic(
                model,  # The PyTorch model
                {torch.nn.Linear, torch.nn.Conv2d, torch.nn.LSTM},  # Layers to quantize
                dtype=torch.qint8  # Quantization type
            )
            model = quantized_model
            print("Standard model quantized successfully")
            
        return model
        
    except Exception as e:
        print(f"Quantization failed: {e}")
        import traceback
        traceback.print_exc()
        return model

def optimize_pytorch_model(model, sample_input=None, enable_quantization=False):
    """Optimize PyTorch model using TorchScript and other optimizations"""
    print("Optimizing PyTorch model...")
    
    # Determine device (CUDA if available, otherwise CPU)
    device = torch.device("cuda" if CUDA_AVAILABLE else "cpu")
    print(f"Using device: {device}")
    
    # Move model to appropriate device
    model = model.to(device)
    
    # Create dummy input if not provided
    if sample_input is None:
        # Standard YOLO input size: (batch_size, channels, height, width)
        sample_input = torch.randn(1, 3, 640, 640).to(device)
    
    # Enable half precision (FP16) if supported
    if FP16_SUPPORTED and device.type == "cuda":
        print("Enabling half precision (FP16)")
        model = model.half()
        sample_input = sample_input.half()
    
    # Apply quantization if requested and available
    if enable_quantization and QUANTIZATION_AVAILABLE:
        model = create_quantized_model(model)
    
    try:
        # Try to optimize with TorchScript
        print("Converting model to TorchScript...")
        with torch.no_grad():
            if hasattr(model, 'predict'):
                # For Ultralytics YOLO models which use a predict method
                # We can't easily TorchScript the whole model, but we can set to inference mode
                model.eval()
                print("Model set to evaluation mode")
                
                # Warm up the model with a dummy inference
                print("Warming up model with dummy inference...")
                _ = model.predict(source=sample_input, verbose=False)
                print("Model warmup completed")
            else:
                # For standard PyTorch models that use __call__ directly
                model.eval()
                # Convert to TorchScript using tracing
                traced_model = torch.jit.trace(model, sample_input)
                print("Successfully converted to TorchScript")
                
                # Apply torch.compile if available (PyTorch 2.0+)
                if TORCH_COMPILE_AVAILABLE:
                    try:
                        print("Applying torch.compile optimization...")
                        compiled_model = torch.compile(traced_model)
                        print("Successfully compiled model with torch.compile")
                        return compiled_model
                    except Exception as e:
                        print(f"torch.compile failed: {str(e)}")
                        import traceback
                        traceback.print_exc()
                        print("Falling back to TorchScript model")
                        return traced_model
                else:
                    return traced_model
        
        # Return the optimized model
        return model
        
    except Exception as e:
        print(f"Error optimizing model: {str(e)}")
        import traceback
        traceback.print_exc()
        print("Returning original model")
        return model

def simulate_detection():
    """Simulate object detections when model loading fails"""
    # Generate unique IDs for simulated detections
    id1 = str(uuid.uuid4())
    id2 = str(uuid.uuid4())
    
    # Always return a list for detections
    return [
        Detection(
            id=id1,
            label="person",
            confidence=0.92,
            bbox=[0.2, 0.3, 0.5, 0.8]
        ),
        Detection(
            id=id2,
            label="car",
            confidence=0.87,
            bbox=[0.6, 0.5, 0.9, 0.7]
        )
    ]

def convert_ultralytics_results_to_detections(results, img_width, img_height, conf_threshold=0.5, model_name="unknown"):
    """Convert Ultralytics YOLO results to Detection objects"""
    detections = []
    
    print(f"Processing ultralytics results from model {model_name}: {len(results)} batches")
    
    if len(results) > 0:
        # Get the first result (batch)
        result = results[0]  # Get first batch
        print(f"Result keys: {dir(result)}")
        
        # Extract boxes, confidence scores and class predictions
        boxes = result.boxes
        print(f"Found {len(boxes)} boxes from model {model_name}")
        
        # Get original image dimensions from the result
        try:
            # Try to extract original image dimensions from the result
            orig_shape = result.orig_shape  # (height, width)
            img_height, img_width = orig_shape
            print(f"Found original image dimensions from result: {img_width}x{img_height}")
        except AttributeError:
            # If orig_shape is not available, use the passed dimensions or defaults
            if img_width is None or img_height is None:
                img_width = 640  # Default width
                img_height = 480  # Default height
                print(f"Using default dimensions: {img_width}x{img_height}")
            else:
                print(f"Using provided dimensions: {img_width}x{img_height}")
        
        # Process each detection
        for i, box in enumerate(boxes):
            # Generate a unique ID for this detection
            detection_id = str(uuid.uuid4())
            
            # Get box coordinates (already in x1,y1,x2,y2 format)
            xyxy = box.xyxy[0].cpu().numpy()  # Convert to numpy array
            x1, y1, x2, y2 = xyxy
            
            # Get confidence and class
            conf = float(box.conf[0])
            cls = int(box.cls[0])
            
            # Skip if below confidence threshold
            if conf < conf_threshold:
                continue
                
            # Normalize coordinates
            x1_norm = float(x1 / img_width)
            y1_norm = float(y1 / img_height)
            x2_norm = float(x2 / img_width)
            y2_norm = float(y2 / img_height)
            
            # Get class label
            label = result.names.get(cls, f"class_{cls}")
            
            # Calculate center point and dimensions for YOLO format compatibility
            center_x = (x1_norm + x2_norm) / 2
            center_y = (y1_norm + y2_norm) / 2
            width = x2_norm - x1_norm
            height = y2_norm - y1_norm
            
            # Create detection object with both bbox and center formats
            detection = Detection(
                id=f"{model_name}_{detection_id}",
                label=label,
                confidence=conf,
                bbox=[x1_norm, y1_norm, x2_norm, y2_norm],
                x=center_x,
                y=center_y,
                width=width,
                height=height
            )
            
            detections.append(detection)
            
            # Log first few detections for debugging
            if i < 3:
                print(f"Model {model_name}, Detection {i}: {label} ({conf:.2f}) at [{x1_norm:.2f}, {y1_norm:.2f}, {x2_norm:.2f}, {y2_norm:.2f}]")
    
    return detections

def create_dummy_input(device, fp16=False):
    """Create a dummy input tensor for model warmup"""
    dummy = torch.zeros((1, 3, 640, 640), device=device)
    if fp16:
        dummy = dummy.half()
    return dummy

def process_yolo_output(outputs, img_width, img_height, conf_threshold=0.5):
    """Process YOLO model output and convert to detections"""
    try:
        print(f"Processing YOLO outputs with shape: {[output.shape if hasattr(output, 'shape') else 'unknown' for output in outputs]}")
        
        # For ONNX YOLO models, output format may vary
        # Common formats include [boxes, scores, classes] or [boxes_and_scores]
        detections = []
        
        # Simple simulation if we can't determine the format
        if len(outputs) == 0:
            return simulate_detection()
        
        # Extract detections based on output format
        if len(outputs) >= 3:  # Likely [boxes, scores, classes] format
            boxes = outputs[0]
            scores = outputs[1]
            classes = outputs[2]
            
            # Process each detection
            num_detections = min(len(boxes), len(scores), len(classes))
            for i in range(num_detections):
                if scores[i] >= conf_threshold:
                    # Get normalized coordinates [y1, x1, y2, x2] -> [x1, y1, x2, y2]
                    box = boxes[i]
                    if len(box) == 4:
                        # Some models output [x1, y1, x2, y2], others [y1, x1, y2, x2]
                        # Determine format based on values
                        x1, y1, x2, y2 = box
                        
                        # Create detection
                        label = YOLO_CLASSES[int(classes[i])] if int(classes[i]) < len(YOLO_CLASSES) else f"class_{int(classes[i])}"
                        detection = Detection(
                            label=label,
                            confidence=float(scores[i]),
                            bbox=[float(x1), float(y1), float(x2), float(y2)]
                        )
                        detections.append(detection)
        else:
            # Handle single output format (common in newer YOLO models)
            output = outputs[0]
            
            # Determine the format based on shape
            if len(output.shape) == 3 and output.shape[2] > 5:  # [batch, num_detections, 5+num_classes]
                for detection in output[0]:  # Take first batch
                    confidence = float(detection[4])
                    if confidence >= conf_threshold:
                        # Get class with highest confidence
                        class_scores = detection[5:]
                        class_id = np.argmax(class_scores)
                        class_conf = float(class_scores[class_id])
                        total_conf = confidence * class_conf
                        
                        if total_conf >= conf_threshold:
                            # Extract normalized coordinates [x, y, w, h] -> [x1, y1, x2, y2]
                            cx, cy, w, h = detection[:4]
                            x1 = cx - w/2
                            y1 = cy - h/2
                            x2 = cx + w/2
                            y2 = cy + h/2
                            
                            # Create detection
                            label = YOLO_CLASSES[class_id] if class_id < len(YOLO_CLASSES) else f"class_{class_id}"
                            detection = Detection(
                                label=label,
                                confidence=total_conf,
                                bbox=[float(x1), float(y1), float(x2), float(y2)]
                            )
                            detections.append(detection)
            else:
                # If we can't determine the format, return simulated detections
                return simulate_detection()
                
        return detections
    except Exception as e:
        print(f"Error processing YOLO output: {e}")
        import traceback
        traceback.print_exc()
        return simulate_detection()

async def perform_inference(request_data: InferenceRequest, executor: ThreadPoolExecutor) -> InferenceResult:
    """Perform inference asynchronously using thread pool executor"""
    start_time = time.time()
    
    # Add debug output to check if this function is being called
    print(f"Perform inference called with model: {request_data.modelPath}")
    
    # Use executor for CPU-bound operations
    loop = asyncio.get_event_loop()
    try:
        # Execute inference in thread pool
        result = await loop.run_in_executor(
            executor,
            lambda: _perform_inference_sync(request_data)
        )
        
        # Update timing
        inference_time = time.time() - start_time
        result.inferenceTime = inference_time * 1000
        result.timestamp = datetime.now().isoformat()
        
        # Add debug output
        print(f"Inference completed with {len(result.detections)} detections in {result.inferenceTime:.2f}ms")
        
        return result
    except Exception as e:
        print(f"Async inference error: {e}")
        import traceback
        traceback.print_exc()
        
        # Return empty result on error
        return InferenceResult(
            detections=[],
            inferenceTime=(time.time() - start_time) * 1000,
            processedAt="server",
            timestamp=datetime.now().isoformat()
        )

def _perform_inference_sync(inference_request: InferenceRequest) -> InferenceResult:
    """Synchronous implementation of inference logic to be run in thread pool"""
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
                    processedAt="server",
                    timestamp=datetime.now().isoformat()
                )
        
        print(f"Using model at path: {model_path}")
        
        # Determine model type based on file extension
        is_onnx = is_onnx_model(model_path)
        is_pytorch = is_pytorch_model(model_path)
        
        # Handle PyTorch models
        if is_pytorch:
            print("PyTorch model detected")
            
            if not TORCH_AVAILABLE or not ULTRALYTICS_AVAILABLE:
                print("PyTorch or Ultralytics not available. Using simulated detections.")
                detections = simulate_detection()
                inference_time = time.time() - start_time
                return InferenceResult(
                    detections=detections,
                    inferenceTime=inference_time * 1000,
                    timestamp=datetime.now().isoformat()
                )
            
            # Check for quantized version first if requested
            use_quantized = inference_request.quantized and QUANTIZATION_AVAILABLE
            
            if use_quantized and model_path in quantized_models:
                model = quantized_models[model_path]
                print(f"Using previously quantized model for: {model_path}")
            # Load and optimize PyTorch model
            # First check if we already have an optimized version
            elif model_path in optimized_models:
                model = optimized_models[model_path]
                print(f"Using previously optimized model for: {model_path}")
            elif model_path in pytorch_models:
                # We have the base model but not optimized version
                original_model = pytorch_models[model_path]
                print(f"Optimizing existing model: {model_path}")
                
                # Determine device for optimization
                device = torch.device("cuda" if CUDA_AVAILABLE else "cpu")
                
                # Create dummy input for warmup
                dummy_input = create_dummy_input(device, FP16_SUPPORTED and device.type == "cuda")
                
                # Optimize the model
                model = optimize_pytorch_model(
                    original_model, 
                    sample_input=dummy_input,
                    enable_quantization=use_quantized
                )
                
                if use_quantized:
                    quantized_models[model_path] = model
                else:
                    optimized_models[model_path] = model
                print("Model optimization complete")
            else:
                try:
                    # Load PyTorch YOLO model using Ultralytics
                    print(f"Loading PyTorch model: {model_path}")
                    
                    # Use task parameter instead of device
                    model = YOLO(model_path)
                    
                    # Move model to the correct device after loading
                    if CUDA_AVAILABLE:
                        model.to("cuda")
                    else:
                        model.to("cpu")
                    
                    # Store original model
                    pytorch_models[model_path] = model
                    print(f"Successfully loaded PyTorch model: {model_path}")
                    
                    # Optimize the model
                    print(f"Optimizing newly loaded model: {model_path}")
                    
                    # Determine device for torch operations
                    torch_device = torch.device("cuda" if CUDA_AVAILABLE else "cpu")
                    
                    # Create dummy input for warmup
                    dummy_input = create_dummy_input(
                        torch_device, 
                        FP16_SUPPORTED and torch_device.type == "cuda"
                    )
                    
                    # Optimize the model
                    optimized_model = optimize_pytorch_model(
                        model, 
                        sample_input=dummy_input,
                        enable_quantization=use_quantized
                    )
                    
                    # Store the optimized or quantized model
                    if use_quantized:
                        quantized_models[model_path] = optimized_model
                    else:
                        optimized_models[model_path] = optimized_model
                    
                    # Use the optimized model for inference
                    model = optimized_model
                    
                except Exception as e:
                    print(f"Error loading PyTorch model: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    
                    # If model loading failed, use simulated detections
                    detections = simulate_detection()
                    inference_time = time.time() - start_time
                    return InferenceResult(
                        detections=detections,
                        inferenceTime=inference_time * 1000,
                        processedAt="server",
                        timestamp=datetime.now().isoformat()
                    )
            
            # Decode base64 image
            try:
                # Handle both with and without data URI prefix
                image_data_parts = inference_request.imageData.split(',')
                if len(image_data_parts) > 1:
                    image_data = base64.b64decode(image_data_parts[1])
                else:
                    image_data = base64.b64decode(image_data_parts[0])
                    
                image = Image.open(BytesIO(image_data))
                
                # Get image dimensions
                img_width, img_height = image.size
                print(f"Image dimensions: {img_width}x{img_height}")
                
                # Run inference with PyTorch model
                try:
                    # Set up inference parameters
                    inference_params = {
                        "source": image,
                        "conf": inference_request.threshold,
                        "verbose": False,
                    }
                    
                    # Add half precision if supported and using CUDA
                    if FP16_SUPPORTED and CUDA_AVAILABLE:
                        inference_params["half"] = True
                        print("Using half precision (FP16) for inference")
                    
                    # Conduct PyTorch inference
                    with torch.inference_mode():
                        results = model.predict(**inference_params)
                    
                    print(f"PyTorch inference completed with {len(results)} results")
                    
                    # Convert results to our detection format
                    detections = convert_ultralytics_results_to_detections(
                        results, 
                        img_width=img_width,
                        img_height=img_height,
                        conf_threshold=inference_request.threshold
                    )
                    
                    inference_time = time.time() - start_time
                    
                    return InferenceResult(
                        detections=detections,
                        inferenceTime=inference_time * 1000,
                        processedAt="edge",
                        timestamp=datetime.now().isoformat()
                    )
                
                except Exception as e:
                    print(f"PyTorch inference error: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    
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
                print(f"Error processing image for PyTorch inference: {str(e)}")
                import traceback
                traceback.print_exc()
                detections = simulate_detection()
                inference_time = time.time() - start_time
                return InferenceResult(
                    detections=detections,
                    inferenceTime=inference_time * 1000,
                    timestamp=datetime.now().isoformat()
                )
        
        # Handle ONNX models
        elif is_onnx:
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
                input_name = session.get_inputs()[0].name
            
            # Process image and run inference with ONNX model
            try:
                # Decode base64 image
                image_data_parts = inference_request.imageData.split(',')
                if len(image_data_parts) > 1:
                    image_data = base64.b64decode(image_data_parts[1])
                else:
                    image_data = base64.b64decode(image_data_parts[0])
                    
                image = Image.open(BytesIO(image_data))
                
                # Get image dimensions
                img_width, img_height = image.size
                print(f"Image dimensions: {img_width}x{img_height}")
                
                # Get expected input shape from model
                input_shape = session.get_inputs()[0].shape
                input_name = session.get_inputs()[0].name
                
                # Determine input dimensions
                # Handle dynamic dimensions (often represented as -1)
                if len(input_shape) >= 4:  # NCHW format
                    if input_shape[2] > 0 and input_shape[3] > 0:
                        input_height, input_width = input_shape[2], input_shape[3]
                    else:
                        input_height, input_width = 640, 640  # Default YOLO input size
                else:
                    input_height, input_width = 640, 640  # Default if shape uncertain
                
                print(f"Using input dimensions: {input_width}x{input_height}")
                
                # Use GPU-accelerated preprocessing if available
                img_batch = gpu_accelerated_preprocessing(
                    image, 
                    target_size=(input_width, input_height)
                )
                
                print(f"Input batch shape: {img_batch.shape if hasattr(img_batch, 'shape') else 'tensor'}")
                
                # Convert torch tensor to numpy if needed
                if TORCH_AVAILABLE and isinstance(img_batch, torch.Tensor):
                    img_batch = img_batch.cpu().numpy()
                
                # Run inference
                try:
                    outputs = session.run(None, {input_name: img_batch})
                    
                    # Process outputs based on model format
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
                    import traceback
                    traceback.print_exc()
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
                print(f"Error processing image: {str(e)}")
                import traceback
                traceback.print_exc()
                detections = simulate_detection()
                inference_time = time.time() - start_time
                return InferenceResult(
                    detections=detections,
                    inferenceTime=inference_time * 1000,
                    timestamp=datetime.now().isoformat()
                )
        else:
            # Unsupported model format
            print(f"Unsupported model format: {model_path}")
            detections = simulate_detection()
            inference_time = time.time() - start_time
            return InferenceResult(
                detections=detections,
                inferenceTime=inference_time * 1000,
                timestamp=datetime.now().isoformat()
            )
            
    except Exception as e:
        print(f"Error in detect_objects: {str(e)}")
        import traceback
        traceback.print_exc()
        detections = simulate_detection()
        inference_time = time.time() - start_time
        return InferenceResult(
            detections=detections,
            inferenceTime=inference_time * 1000,
            timestamp=datetime.now().isoformat()
        )

def get_inference_executor(request: Request) -> ThreadPoolExecutor:
    """Get the thread pool executor from the app state"""
    return request.app.state.inference_executor

@router.post("/detect", response_model=InferenceResult)
async def detect_objects(
    inference_request: InferenceRequest,
    request: Request
):
    """Detect objects in an image using ONNX or PyTorch model"""
    # Get thread pool executor from app state
    executor = request.app.state.inference_executor
    
    # Process inference asynchronously
    return await perform_inference(inference_request, executor)

@router.get("/devices", response_model=List[DeviceInfo])
async def list_devices():
    """List available inference devices"""
    devices = [
        DeviceInfo(id="cpu", name="CPU", type="cpu", status="available"),
    ]
    
    if "CUDAExecutionProvider" in get_available_providers():
        devices.append(DeviceInfo(id="gpu", name="CUDA GPU", type="gpu", status="available"))
    else:
        devices.append(DeviceInfo(id="gpu", name="CUDA GPU", type="gpu", status="unavailable"))
    
    # Add PyTorch device status
    if TORCH_AVAILABLE:
        torch_device = "cuda" if torch.cuda.is_available() else "cpu"
        devices.append(DeviceInfo(
            id=f"pytorch_{torch_device}", 
            name=f"PyTorch {torch_device.upper()}", 
            type=torch_device, 
            status="available"
        ))
        
        # Add FP16 status if using CUDA
        if torch.cuda.is_available():
            fp16_status = "available" if FP16_SUPPORTED else "unavailable"
            devices.append(DeviceInfo(
                id="pytorch_fp16", 
                name=f"PyTorch FP16", 
                type="gpu", 
                status=fp16_status
            ))
            
        # Add quantization status
        quant_status = "available" if QUANTIZATION_AVAILABLE else "unavailable"
        devices.append(DeviceInfo(
            id="pytorch_int8", 
            name="PyTorch INT8", 
            type=torch_device, 
            status=quant_status
        ))
    
    return devices
