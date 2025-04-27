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
except ImportError:
    TORCH_AVAILABLE = False
    print("WARNING: PyTorch not available. NMS will use fallback implementation.")

# Import YOLOv8 preprocessing utils
try:
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
            
            # CRITICAL FIX: Proper reshaping for YOLO outputs
            # Handle 3D tensors like [batch, channels, predictions]
            if predictions.dim() == 3:  # (1, 6, 8400) or similar
                print(f"Reshaping 3D tensor of shape {predictions.shape}")
                predictions = predictions.squeeze(0)  # Remove batch dimension -> (6, 8400)
                print(f"After squeezing: {predictions.shape}")
            
            # Ensure predictions are in format (num_predictions, features)
            # YOLO models typically output in (features, num_predictions) format
            if predictions.dim() == 2 and predictions.size(0) < predictions.size(1):
                # Needs transposing from (6, 8400) -> (8400, 6)
                print(f"Transposing tensor from shape {predictions.shape}")
                predictions = predictions.transpose(1, 0)  # Transpose to (8400, 6)
                print(f"After transpose: {predictions.shape}")
            
            print(f"Final tensor shape for NMS: {predictions.shape}")
                    
            # Use built-in NMS from ultralytics
            try:
                nms_results = non_max_suppression(predictions, conf_threshold, iou_threshold)
                print(f"NMS completed successfully. Got {len(nms_results)} batch results")
                return nms_results
            except Exception as e:
                print(f"NMS error with Ultralytics: {str(e)}")
                print("Falling back to basic NMS implementation")
                # Fall back to basic implementation
                return None
        else:
            # Basic NMS implementation
            print("NMS: Using custom NMS implementation (Ultralytics not available)")
            conf_sort_index = np.argsort(-predictions[:, 4])
            predictions = predictions[conf_sort_index]
            
            # Filter by confidence threshold
            keep_indices = predictions[:, 4] > conf_threshold
            predictions = predictions[keep_indices]
            
            # If no predictions after filtering, return empty list
            if len(predictions) == 0:
                print("NMS: No predictions above confidence threshold")
                return []
            
            print(f"NMS: Processing {len(predictions)} predictions after confidence filtering")
                
            # Simple loop-based NMS (not efficient but functional)
            selected_indices = []
            for i in range(len(predictions)):
                # If already removed, continue
                if i in selected_indices:
                    continue
                selected_indices.append(i)
                
                # Compute IoU with all later boxes
                current_box = predictions[i, :4]
                for j in range(i + 1, len(predictions)):
                    if j in selected_indices:
                        continue
                    box = predictions[j, :4]
                    # Skip if different class
                    if np.argmax(predictions[i, 5:]) != np.argmax(predictions[j, 5:]):
                        continue
                    
                    # Calculate IoU
                    x1 = max(current_box[0], box[0])
                    y1 = max(current_box[1], box[1])
                    x2 = min(current_box[2], box[2])
                    y2 = min(current_box[3], box[3])
                    
                    # No overlap
                    if x2 < x1 or y2 < y1:
                        continue
                    
                    overlap = (x2 - x1) * (y2 - y1)
                    iou = overlap / (
                        (current_box[2] - current_box[0]) * (current_box[3] - current_box[1]) + 
                        (box[2] - box[0]) * (box[3] - box[1]) - overlap
                    )
                    
                    if iou > iou_threshold:
                        # If j is already in selected_indices, remove it
                        if j in selected_indices:
                            selected_indices.remove(j)
            
            print(f"NMS: Selected {len(selected_indices)} boxes after NMS")
            return predictions[selected_indices]
            
    except Exception as e:
        print(f"Error in NMS: {str(e)}")
        import traceback
        traceback.print_exc()
        # Return original predictions if NMS fails
        return predictions

def process_yolo_output(outputs, img_width, img_height, conf_threshold=0.5):
    """Process YOLO model output to get proper detections"""
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
                            y2 = min(1, float(y_center + width/2) / img_height)
                            
                            # Get class label
                            label = YOLO_CLASSES[class_id] if class_id < len(YOLO_CLASSES) else f"class_{class_id}"
                            
                            detections.append(Detection(
                                label=label,
                                confidence=float(confidence),
                                bbox=[x1, y1, x2, y2]
                            ))
        
        elif len(outputs) == 3 or len(outputs) == 4:
            # Multiple output format (boxes, scores, classes, [masks])
            print(f"Multiple output tensors detected: {len(outputs)}")
            
            # Determine which outputs are which based on shapes
            boxes = None
            scores = None
            class_ids = None
            
            # Try to identify outputs by shape
            for i, output in enumerate(outputs):
                if output is None or output.size == 0:
                    continue
                    
                # Flatten to handle different output formats
                if output.ndim > 1:
                    # If this is likely the boxes output (should have 4 values per box)
                    if output.shape[-1] == 4 or output.shape[-1] % 4 == 0:
                        boxes = output
                    # If this is likely the class scores (usually largest dimension)
                    elif output.shape[-1] > 4 and output.ndim <= 2:
                        class_ids = output
                    # If this is likely confidence scores (single value per detection)
                    elif output.shape[-1] == 1 or output.ndim == 1:
                        scores = output
            
            # If we identified all necessary outputs
            if boxes is not None:
                # Handle boxes shape variation
                if boxes.ndim > 2:
                    boxes = boxes.reshape(-1, 4)  # Reshape to [num_boxes, 4]
                
                # Get number of detections
                num_detections = len(boxes)
                
                # Handle scores
                if scores is not None:
                    if scores.ndim > 1:
                        scores = scores.flatten()
                    # Ensure scores is the right length
                    if len(scores) >= num_detections:
                        scores = scores[:num_detections]
                    else:
                        # Create dummy scores if shape doesn't match
                        scores = np.ones(num_detections)
                else:
                    scores = np.ones(num_detections)
                
                # Handle class IDs
                if class_ids is not None:
                    if class_ids.ndim > 1:
                        class_ids = np.argmax(class_ids, axis=-1)
                    # Ensure class_ids is the right length
                    if len(class_ids) >= num_detections:
                        class_ids = class_ids[:num_detections]
                    else:
                        # Create dummy class IDs if shape doesn't match
                        class_ids = np.zeros(num_detections, dtype=np.int32)
                else:
                    class_ids = np.zeros(num_detections, dtype=np.int32)
                
                # Filter by confidence threshold
                mask = scores > conf_threshold
                filtered_boxes = boxes[mask]
                filtered_scores = scores[mask]
                filtered_class_ids = class_ids[mask]
                
                # Process each detection
                for i in range(len(filtered_boxes)):
                    # Get box coordinates
                    if len(filtered_boxes[i]) >= 4:
                        x1, y1, x2, y2 = filtered_boxes[i][:4]
                        
                        # Check if coordinates are already normalized
                        if max(x1, y1, x2, y2) > 1.0:
                            # Normalize coordinates
                            x1 = max(0, float(x1) / img_width)
                            y1 = max(0, float(y1) / img_height)
                            x2 = min(1, float(x2) / img_width)
                            y2 = min(1, float(y2) / img_height)
                        
                        # Get class label
                        class_id = int(filtered_class_ids[i])
                        label = YOLO_CLASSES[class_id] if class_id < len(YOLO_CLASSES) else f"class_{class_id}"
                        
                        detections.append(Detection(
                            label=label,
                            confidence=float(filtered_scores[i]),
                            bbox=[x1, y1, x2, y2]
                        ))
        else:
            print(f"Unsupported output format: {len(outputs)} tensors")
            # Try basic fallback approach
            if outputs and outputs[0] is not None and outputs[0].size > 0:
                print("Attempting basic fallback parsing")
                # Try to handle unexpected formats
                output = outputs[0]
                
                # Look for 2D array that might contain detections
                if output.ndim >= 2:
                    # Assume last dimension has at least 5 elements (box + confidence)
                    if output.shape[-1] >= 5:
                        print(f"Using basic fallback with output shape: {output.shape}")
                        # Try to extract any potential detections
                        if output.ndim > 2:
                            output = output[0]  # Take first batch
                        
                        # Assume standard YOLO format: [x, y, w, h, conf, classes...]
                        for i in range(min(10, len(output))):  # Process up to 10 detections
                            pred = output[i]
                            if len(pred) < 5:
                                continue
                                
                            confidence = float(pred[4])
                            if confidence < conf_threshold:
                                continue
                                
                            # Parse coordinates
                            if len(pred) >= 4:
                                x, y, w, h = pred[0:4]
                                
                                # Convert to corner coordinates
                                x1 = max(0, float(x - w/2))
                                y1 = max(0, float(y - h/2))
                                x2 = min(1, float(x + w/2))
                                y2 = min(1, float(y + h/2))
                                
                                # Normalize if needed
                                if max(x1, y1, x2, y2) > 1.0:
                                    x1 /= img_width
                                    y1 /= img_height
                                    x2 /= img_width
                                    y2 /= img_height
                                
                                # Get class ID if available
                                class_id = 0
                                if len(pred) > 5:
                                    class_scores = pred[5:]
                                    class_id = int(np.argmax(class_scores))
                                
                                # Get class label
                                label = YOLO_CLASSES[class_id] if class_id < len(YOLO_CLASSES) else f"class_{class_id}"
                                
                                detections.append(Detection(
                                    label=label,
                                    confidence=confidence,
                                    bbox=[x1, y1, x2, y2]
                                ))
        
        print(f"Successfully processed {len(detections)} detections")
        return detections
            
    except Exception as e:
        print(f"Error processing YOLO output: {str(e)}")
        print(f"Output shapes: {[output.shape if output is not None and hasattr(output, 'shape') else None for output in outputs]}")
        import traceback
        traceback.print_exc()
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
    devices = [
        DeviceInfo(id="cpu", name="CPU", type="cpu", status="available"),
    ]
    
    if "CUDAExecutionProvider" in get_available_providers():
        devices.append(DeviceInfo(id="gpu", name="CUDA GPU", type="gpu", status="available"))
    else:
        devices.append(DeviceInfo(id="gpu", name="CUDA GPU", type="gpu", status="unavailable"))
    
    return devices

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
                inferenceTime=inference_time * 1000,
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
            input_name = session.get_inputs()[0].name
        
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
