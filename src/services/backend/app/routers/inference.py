
from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel
import random
import os
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Form

# Configure logging
logger = logging.getLogger(__name__)

# Create API router
router = APIRouter(prefix="/inference", tags=["inference"])

# Constants for feature availability
TORCH_AVAILABLE = False
CUDA_AVAILABLE = False
FP16_SUPPORTED = False
ULTRALYTICS_AVAILABLE = False

# Try importing PyTorch
try:
    import torch
    TORCH_AVAILABLE = True
    CUDA_AVAILABLE = torch.cuda.is_available()
    # Check if FP16 (half precision) is supported
    if CUDA_AVAILABLE:
        FP16_SUPPORTED = torch.cuda.get_device_capability()[0] >= 7
    
    # Try importing ultralytics (YOLO)
    try:
        from ultralytics import YOLO
        ULTRALYTICS_AVAILABLE = True
    except ImportError:
        logger.warning("Ultralytics (YOLO) not available. Install with 'pip install ultralytics'")
        
except ImportError:
    logger.warning("PyTorch not available. Install with 'pip install torch' for hardware acceleration")

# Get the models directory from environment variable or use default
MODELS_DIR = os.environ.get("MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models"))
logger.info(f"Inference module using models directory: {MODELS_DIR}")

# Detection class for consistent format
class Detection(BaseModel):
    id: Optional[str] = None
    x: float  # center x (normalized 0-1) 
    y: float  # center y (normalized 0-1)
    width: float  # width (normalized 0-1)
    height: float  # height (normalized 0-1)
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    label: str
    confidence: float
    model: Optional[str] = None
    bbox: Optional[Dict[str, float]] = None
    
    class Config:
        arbitrary_types_allowed = True

class InferenceResult(BaseModel):
    detections: List[Detection]
    model_name: Optional[str] = None
    inference_time: float
    image_width: int
    image_height: int
    
    class Config:
        arbitrary_types_allowed = True

def simulate_detection() -> List[Detection]:
    """Generate simulated detections for testing"""
    # ... keep existing code (simulation function content)
    classes = ["person", "car", "bicycle", "motorcycle", "truck", "bus", "traffic light", "stop sign"]
    
    # Generate a random number of detections (1-5)
    num_detections = random.randint(1, 5)
    detections = []
    
    for i in range(num_detections):
        # Generate random coordinates (normalized 0-1)
        x = random.uniform(0.1, 0.9)
        y = random.uniform(0.1, 0.9)
        # Generate random width and height
        width = random.uniform(0.05, 0.2)
        height = random.uniform(0.05, 0.4)
        
        # Create detection
        detection = Detection(
            id=f"sim_{i}",
            x=x,
            y=y,
            width=width,
            height=height,
            class_id=i,
            class_name=random.choice(classes),
            label=random.choice(classes),
            confidence=random.uniform(0.5, 0.95),
            model="simulation",
            bbox={
                "x1": max(0, x - width/2),
                "y1": max(0, y - height/2),
                "x2": min(1, x + width/2),
                "y2": min(1, y + height/2),
                "width": width,
                "height": height
            }
        )
        detections.append(detection)
    
    return detections

def get_model_path(model_path: str) -> str:
    """Get the full path to a model file, handling both absolute and relative paths"""
    # If path already starts with the models directory or is an absolute path, return as is
    if model_path.startswith(MODELS_DIR) or os.path.isabs(model_path):
        return model_path
        
    # If path starts with /models/, replace with actual models directory
    if model_path.startswith('/models/'):
        base_name = os.path.basename(model_path)
        return os.path.join(MODELS_DIR, base_name)
        
    # Otherwise, assume it's a relative path from the models directory
    return os.path.join(MODELS_DIR, model_path)

def optimize_pytorch_model(model_path: str) -> str:
    """Optimize a PyTorch model (e.g., convert to ONNX) if needed"""
    # For now, just return the original path
    # In a real implementation, this would convert to ONNX or optimize the model
    return model_path

def convert_ultralytics_results_to_detections(
    results: Any, 
    img_width: int, 
    img_height: int,
    conf_threshold: float = 0.5,
    model_name: str = "unknown"
) -> List[Detection]:
    """Convert Ultralytics YOLO results to our Detection format"""
    # ... keep existing code (conversion function content)
    detections = []
    
    try:
        if not results:
            logger.warning("No results to convert")
            return []
            
        # Process each result (usually just one for a single image)
        for i, result in enumerate(results):
            if hasattr(result, 'boxes'):
                # Get bounding boxes
                boxes = result.boxes
                logger.info(f"Processing {len(boxes)} detections")
                
                # Extract boxes and classes
                for j, box in enumerate(boxes):
                    try:
                        # Get coordinates (normalized xywh format)
                        x, y, w, h = box.xywhn[0].tolist()
                        
                        # Get confidence and class
                        conf = float(box.conf[0])
                        cls = int(box.cls[0]) if box.cls.numel() > 0 else 0
                        
                        # Skip low confidence detections
                        if conf < conf_threshold:
                            continue
                            
                        # Get class name if available
                        class_name = result.names.get(cls, f"class_{cls}") if hasattr(result, 'names') else f"class_{cls}"
                        
                        # Create detection
                        detection = Detection(
                            id=f"{model_name}_{i}_{j}",
                            x=x,
                            y=y,
                            width=w,
                            height=h,
                            class_id=cls,
                            class_name=class_name,
                            label=class_name,
                            confidence=conf,
                            model=model_name,
                            bbox={
                                "x1": max(0, x - w/2),
                                "y1": max(0, y - h/2),
                                "x2": min(1, x + w/2),
                                "y2": min(1, y + h/2),
                                "width": w,
                                "height": h
                            }
                        )
                        detections.append(detection)
                        
                    except Exception as e:
                        logger.error(f"Error processing detection {j}: {str(e)}")
            
            else:
                logger.warning("Result has no boxes attribute")
                
    except Exception as e:
        logger.error(f"Error converting results: {str(e)}")
        import traceback
        traceback.print_exc()
    
    return detections

# Add some basic HTTP endpoints for model information
@router.get("/models")
async def list_models():
    """List all available models"""
    try:
        if os.path.exists(MODELS_DIR):
            model_files = [f for f in os.listdir(MODELS_DIR) 
                          if os.path.isfile(os.path.join(MODELS_DIR, f)) and 
                          f.lower().endswith(('.pt', '.pth', '.onnx'))]
            return {
                "models": model_files,
                "models_dir": MODELS_DIR,
                "torch_available": TORCH_AVAILABLE,
                "cuda_available": CUDA_AVAILABLE,
                "fp16_supported": FP16_SUPPORTED,
                "ultralytics_available": ULTRALYTICS_AVAILABLE
            }
        else:
            return {"error": f"Models directory {MODELS_DIR} does not exist"}
    except Exception as e:
        logger.error(f"Error listing models: {str(e)}")
        return {"error": str(e)}

@router.get("/status")
async def inference_status():
    """Check inference service status"""
    return {
        "status": "running",
        "torch_available": TORCH_AVAILABLE,
        "cuda_available": CUDA_AVAILABLE,
        "fp16_supported": FP16_SUPPORTED,
        "ultralytics_available": ULTRALYTICS_AVAILABLE,
        "models_dir": MODELS_DIR
    }
