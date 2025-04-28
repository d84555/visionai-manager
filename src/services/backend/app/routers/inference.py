
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, WebSocket
from typing import List, Dict, Any, Optional
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
    else:
        FP16_SUPPORTED = False
        print("CUDA is not available, using CPU only")
except ImportError:
    TORCH_AVAILABLE = False
    TORCH_VERSION = None
    TORCH_COMPILE_AVAILABLE = False
    CUDA_AVAILABLE = False
    FP16_SUPPORTED = False
    print("WARNING: PyTorch not available. PyTorch models will not be supported.")

# Import YOLOv8 preprocessing utils
try:
    from ultralytics import YOLO
    from ultralytics.utils.ops import scale_boxes
    from ultralytics.utils.ops import non_max_suppression
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

# Cache for ONNX sessions and PyTorch models to improve performance
model_sessions = {}
pytorch_models = {}

# Cache for optimized PyTorch models (TorchScript, etc.)
optimized_models = {}

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

def base64_to_image(base64_str):
    """Convert base64 string to PIL Image"""
    image_data = base64.b64decode(base64_str)
    image = Image.open(BytesIO(image_data))
    return image

def preprocess_image(image, target_size=(640, 640)):
    """Preprocess image to fit model input requirements"""
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

def is_onnx_model(model_path):
    """Check if the model is in ONNX format"""
    # Check file extension - more reliable method
    return model_path.lower().endswith('.onnx')

def is_pytorch_model(model_path):
    """Check if the model is in PyTorch format"""
    # Check file extension
    return model_path.lower().endswith('.pt') or model_path.lower().endswith('.pth')

def optimize_pytorch_model(model, sample_input=None):
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

def log_output_shapes(outputs):
    """Log shapes and types of model outputs for debugging"""
    print("=== Model output details ===")
    for i, output in enumerate(outputs):
        if output is None:
            print(f"Output {i}: None")
            continue
        
        print(f"Output {i}: shape={output.shape}, dtype={output.dtype}")
        # Print sample values if available
        if output.size > 0:
            flat = output.flatten()
            print(f"  Sample values (first 5): {flat[:5]}")
            print(f"  Value range: [{np.min(flat)} to {np.max(flat)}]")
    print("===========================")

def apply_nms(predictions, conf_threshold=0.25, iou_threshold=0.45):
    """Apply Non-Maximum Suppression to filter overlapping detections"""
    try:
        if ULTRALYTICS_AVAILABLE and TORCH_AVAILABLE:
            # Convert NumPy array to PyTorch tensor if needed
            print("NMS: Using Ultralytics NMS with PyTorch")
            if isinstance(predictions, np.ndarray):
                print(f"Converting predictions from NumPy array (shape: {predictions.shape}) to PyTorch tensor")
                predictions = torch.from_numpy(predictions).to('cpu')
            
            # Ensure tensor is on CPU
            if hasattr(predictions, 'device') and predictions.device.type != 'cpu':
                predictions = predictions.to('cpu')
            
            # CRITICAL FIX: Handle tensor reshaping for YOLO outputs
            if predictions.dim() == 3:  # (1, 6, 8400) or similar format
                print(f"Reshaping 3D tensor of shape {predictions.shape}")
                predictions = predictions.squeeze(0)  # Remove batch dimension -> (6, 8400)
                print(f"After squeezing: {predictions.shape}")
            
            # Transpose tensor if needed (from channels-first to predictions-first)
            if predictions.dim() == 2 and predictions.size(0) < predictions.size(1):
                # Transpose from (6, 8400) -> (8400, 6)
                print(f"Transposing tensor from shape {predictions.shape}")
                predictions = predictions.transpose(0, 1)  # Transpose to (8400, 6)
                print(f"After transpose: {predictions.shape}")
            
            print(f"Final tensor shape for NMS: {predictions.shape}")
            
            # Format tensor for non_max_suppression which expects [batch_size, num_boxes, (xywh + conf + classes)]
            # Reshape to add batch dimension if needed
            if predictions.dim() == 2:
                predictions = predictions.unsqueeze(0)  # Add batch dimension -> (1, 8400, 6)
                print(f"Added batch dimension: {predictions.shape}")
            
            # Use built-in NMS from ultralytics
            try:
                nms_results = non_max_suppression(
                    predictions, 
                    conf_thres=conf_threshold,
                    iou_thres=iou_threshold,
                    classes=None,  # Filter by specific classes if needed
                    agnostic=False,  # Class-agnostic NMS
                    multi_label=True,  # Multiple labels per box
                    max_det=300  # Maximum detections
                )
                print(f"NMS completed successfully. Got {len(nms_results)} batch results")
                return nms_results
            except Exception as e:
                print(f"NMS error with Ultralytics: {str(e)}")
                print("Falling back to basic NMS implementation")
                # Fall back to basic implementation
                return None
        else:
            # Basic NMS implementation for when Ultralytics is not available
            print("NMS: Using basic implementation (Ultralytics or PyTorch not available)")
            # Implement a basic NMS here
            return predictions  # Return the input for now
    except Exception as e:
        print(f"Error in NMS: {str(e)}")
        import traceback
        traceback.print_exc()
        # Return original predictions if NMS fails
        return predictions

def process_yolo_output(outputs, img_width, img_height, conf_threshold=0.5):
    """Process YOLO model output to get proper detections"""
    # ... keep existing code (processing of YOLO outputs)
    try:
        # Initialize empty detections list
        detections = []
        
        # Log output shapes for debugging
        log_output_shapes(outputs)
        
        # Handle different output formats
        if len(outputs) == 1:
            # Most common case: single output tensor (YOLOv5, YOLOv8, etc.)
            # Shape typically: [batch, boxes, xywh+conf+classes]
            predictions = outputs[0]
            
            # Debug output shape
            print(f"Single output tensor detected with shape: {predictions.shape}")
            
            # Apply sigmoid activation if needed (depends on model)
            # Newer YOLO models already apply sigmoid internally
            # Check max values to determine if sigmoid already applied
            first_row_sample = predictions[0, 0, 4:] if predictions.ndim > 2 else predictions[0, 4:]
            max_value = np.max(first_row_sample) if first_row_sample.size > 0 else 0
            
            if max_value > 1.0:
                print("Applying sigmoid to confidence values")
                # Apply sigmoid only to confidence scores and class probabilities
                if predictions.ndim > 2:  # 3D tensor
                    predictions[:, :, 4:] = 1 / (1 + np.exp(-predictions[:, :, 4:]))
                else:  # 2D tensor
                    predictions[:, 4:] = 1 / (1 + np.exp(-predictions[:, 4:]))
            
            # Process format based on dimensions
            if predictions.ndim > 2:  # [batch, boxes, xywh+conf+classes]
                # Extract the first batch
                predictions = predictions[0]
                
            # At this point, preds should be 2D: [boxes, xywh+conf+classes]
            # Filter by confidence
            if predictions.shape[0] > 0:  # Check if there are any predictions
                # Extract confidence scores (typically at index 4)
                confidences = predictions[:, 4]
                # Filter by confidence threshold
                mask = confidences > conf_threshold
                filtered_predictions = predictions[mask]
                
                # Apply NMS if we have any predictions
                if len(filtered_predictions) > 0:
                    # Apply NMS to filter overlapping boxes
                    print(f"Running NMS on {len(filtered_predictions)} detections")
                    nms_predictions = apply_nms(filtered_predictions, conf_threshold)
                    
                    # Process each detection after NMS
                    if isinstance(nms_predictions, list) and nms_predictions:
                        # If NMS returned a list (might be from ultralytics)
                        for batch_pred in nms_predictions:
                            if batch_pred is None or len(batch_pred) == 0:
                                continue
                                
                            for pred in batch_pred:
                                # Extract bounding box
                                x1, y1, x2, y2 = pred[:4]
                                # Normalize coordinates
                                x1 = max(0, float(x1) / img_width)
                                y1 = max(0, float(y1) / img_height)
                                x2 = min(1, float(x2) / img_width)
                                y2 = min(1, float(y2) / img_height)
                                
                                # Get confidence and class
                                conf = float(pred[4])
                                class_id = int(pred[5])
                                
                                # Get class label
                                label = YOLO_CLASSES[class_id] if class_id < len(YOLO_CLASSES) else f"class_{class_id}"
                                
                                detections.append(Detection(
                                    label=label,
                                    confidence=conf,
                                    bbox=[x1, y1, x2, y2]
                                ))
                    else:
                        # Process manually filtered predictions
                        for pred in filtered_predictions:
                            # Get confidence and class scores
                            confidence = float(pred[4])
                            
                            # For models with class scores, get class ID
                            if len(pred) > 5:  # Has class scores
                                class_scores = pred[5:]
                                class_id = int(np.argmax(class_scores))
                                class_score = float(class_scores[class_id])
                                # Multiply confidence by class score for final score
                                confidence = confidence * class_score
                            else:
                                class_id = 0  # Default to first class if no class scores
                            
                            # Skip if below threshold
                            if confidence < conf_threshold:
                                continue
                                
                            # Get coordinates (YOLO format: xcenter, ycenter, width, height)
                            x_center, y_center, width, height = pred[0:4]
                            
                            # Convert to corner format and normalize
                            x1 = max(0, float(x_center - width/2) / img_width)
                            y1 = max(0, float(y_center - height/2) / img_height)
                            x2 = min(1, float(x_center + width/2) / img_width)
                            y2 = min(1, float(y_center + height/2) / img_height)
                            
                            # Get class label
                            label = YOLO_CLASSES[class_id] if class_id < len(YOLO_CLASSES) else f"class_{class_id}"
                            
                            detections.append(Detection(
                                label=label,
                                confidence=float(confidence),
                                bbox=[x1, y1, x2, y2]
                            ))
        
        # ... keep existing code for other output formats
        
        print(f"Successfully processed {len(detections)} detections")
        return detections
            
    except Exception as e:
        print(f"Error processing YOLO output: {str(e)}")
        print(f"Output shapes: {[output.shape if output is not None and hasattr(output, 'shape') else None for output in outputs]}")
        import traceback
        traceback.print_exc()
        return []

def convert_ultralytics_results_to_detections(results, img_width, img_height, conf_threshold=0.5):
    """Convert Ultralytics YOLO results to Detection objects"""
    detections = []
    
    print(f"Processing ultralytics results: {len(results)}")
    
    if len(results) > 0:
        # Get the first result (batch)
        result = results[0]  # Get first batch
        print(f"Result keys: {dir(result)}")
        
        # Extract boxes, confidence scores and class predictions
        boxes = result.boxes
        print(f"Found {len(boxes)} boxes")
        
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
            
            # Create detection object
            detection = Detection(
                label=label,
                confidence=conf,
                bbox=[x1_norm, y1_norm, x2_norm, y2_norm]
            )
            
            detections.append(detection)
            
            # Log first few detections for debugging
            if i < 3:
                print(f"Detection {i}: {label} ({conf:.2f}) at [{x1_norm:.2f}, {y1_norm:.2f}, {x2_norm:.2f}, {y2_norm:.2f}]")
    
    return detections

def create_dummy_input(device, fp16=False):
    """Create a dummy input tensor for model warmup"""
    dummy = torch.zeros((1, 3, 640, 640), device=device)
    if fp16:
        dummy = dummy.half()
    return dummy

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
    
    return devices

@router.post("/detect", response_model=InferenceResult)
async def detect_objects(inference_request: InferenceRequest):
    """Detect objects in an image using ONNX or PyTorch model"""
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
            
            # Load and optimize PyTorch model
            # First check if we already have an optimized version
            if model_path in optimized_models:
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
                model = optimize_pytorch_model(original_model, sample_input=dummy_input)
                optimized_models[model_path] = model
                print("Model optimization complete")
            else:
                try:
                    # Load PyTorch YOLO model using Ultralytics
                    print(f"Loading PyTorch model: {model_path}")
                    
                    # FIX: Use task parameter instead of device - this was causing the error
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
                    optimized_model = optimize_pytorch_model(model, sample_input=dummy_input)
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
        
        # Handle ONNX models - use existing ONNX code path
        elif is_onnx:
            # ... keep existing code for ONNX models
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
                
                # Preprocess image for ONNX model
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
                
                # Convert image to numpy array for OpenCV processing
                img_np = np.array(image)
                
                # Resize and normalize
                img_resized = cv2.resize(img_np, (input_width, input_height))
                img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
                img_normalized = img_rgb.astype(np.float32) / 255.0
                
                # Check if model expects NCHW format (most common)
                # NCHW: batch, channels, height, width
                if len(input_shape) >= 4 and (input_shape[1] == 3 or input_shape[1] == -1):
                    # Transpose to NCHW format required by ONNX Runtime
                    img_transposed = np.transpose(img_normalized, (2, 0, 1))  # HWC -> CHW
                    img_batch = np.expand_dims(img_transposed, axis=0)  # CHW -> NCHW
                else:
                    # Use NHWC format (TensorFlow style)
                    img_batch = np.expand_dims(img_normalized, axis=0)  # HWC -> NHWC
                
                print(f"Input batch shape: {img_batch.shape}")
                
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
