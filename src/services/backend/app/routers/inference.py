
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks, Request
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from typing import List, Dict, Any, Optional
import logging
import os
import io
import base64
import json
import time
import uuid
import shutil
import subprocess
from pathlib import Path
import tempfile
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["inference"])
logger = logging.getLogger(__name__)

# Define the missing classes and functions that websocket.py is trying to import
class Detection(BaseModel):
    id: str
    label: str
    class_name: str = ""
    class_id: int = 0
    model: Optional[str] = None
    confidence: float
    x: float = 0.0
    y: float = 0.0
    width: float = 0.0
    height: float = 0.0
    bbox: Optional[Dict[str, float]] = None

class InferenceResult(BaseModel):
    detections: List[Detection]
    inference_time: float
    processed_at: str
    timestamp: str

def get_model_path(model_path: str) -> str:
    """Resolve a model path to its filesystem location."""
    models_dir = os.environ.get("MODELS_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models"))
    
    # Check if the path is already absolute
    if os.path.isabs(model_path) and os.path.exists(model_path):
        return model_path
        
    # Check if the path exists relative to the models directory
    resolved_path = os.path.join(models_dir, os.path.basename(model_path))
    if os.path.exists(resolved_path):
        return resolved_path
        
    # If it's a custom model with prefix in path
    if "/custom_models/" in model_path or "\\custom_models\\" in model_path:
        basename = os.path.basename(model_path)
        custom_models_dir = os.path.join(models_dir, "custom_models")
        os.makedirs(custom_models_dir, exist_ok=True)
        resolved_path = os.path.join(custom_models_dir, basename)
        if os.path.exists(resolved_path):
            return resolved_path
    
    # Fall back to the original path as a last resort
    return model_path

def optimize_pytorch_model(model_path: str) -> str:
    """Placeholder for PyTorch model optimization."""
    # This is a placeholder function that simply returns the original model path
    # In a real implementation, this would optimize the model for inference
    logger.info(f"Optimizing model: {model_path}")
    return model_path

# Simulate YOLO availability
try:
    # Try importing YOLO dependencies
    import torch
    TORCH_AVAILABLE = True
    try:
        from ultralytics import YOLO
        ULTRALYTICS_AVAILABLE = True
    except ImportError:
        ULTRALYTICS_AVAILABLE = False
        YOLO = None
        
    # Check for CUDA
    CUDA_AVAILABLE = torch.cuda.is_available() if TORCH_AVAILABLE else False
    # Check for FP16 support
    FP16_SUPPORTED = CUDA_AVAILABLE and torch.cuda.get_device_capability()[0] >= 7
except ImportError:
    TORCH_AVAILABLE = False
    ULTRALYTICS_AVAILABLE = False
    CUDA_AVAILABLE = False
    FP16_SUPPORTED = False
    YOLO = None

def simulate_detection() -> List[Detection]:
    """Generate simulated detections for testing when no model is available."""
    detections = [
        Detection(
            id=f"sim_{uuid.uuid4()}",
            label="Person",
            class_name="person",
            class_id=0,
            confidence=0.95,
            x=0.5,
            y=0.5,
            width=0.2,
            height=0.4,
            bbox={
                "x1": 0.4,
                "y1": 0.3,
                "x2": 0.6,
                "y2": 0.7,
                "width": 0.2,
                "height": 0.4
            }
        ),
        Detection(
            id=f"sim_{uuid.uuid4()}",
            label="Car",
            class_name="car",
            class_id=2,
            confidence=0.85,
            x=0.7,
            y=0.6,
            width=0.15,
            height=0.1,
            bbox={
                "x1": 0.625,
                "y1": 0.55,
                "x2": 0.775,
                "y2": 0.65,
                "width": 0.15,
                "height": 0.1
            }
        )
    ]
    return detections

def convert_ultralytics_results_to_detections(results, img_width: int, img_height: int, conf_threshold: float = 0.25, model_name: str = "") -> List[Detection]:
    """Convert Ultralytics YOLO results to our Detection format."""
    detections = []
    try:
        # Iterate through results (usually just one item for a single image)
        for i, result in enumerate(results):
            if hasattr(result, 'boxes'):
                boxes = result.boxes
                for j, box in enumerate(boxes):
                    # Get box information
                    conf = float(box.conf[0]) if hasattr(box, 'conf') and len(box.conf) > 0 else 0.0
                    
                    # Skip low confidence detections
                    if conf < conf_threshold:
                        continue
                        
                    # Get coordinates (normalized to 0-1)
                    if hasattr(box, 'xywhn') and box.xywhn is not None:
                        # Already normalized coordinates
                        x, y, w, h = box.xywhn[0].tolist()
                    elif hasattr(box, 'xyxy') and box.xyxy is not None:
                        # Convert xyxy to xywh normalized
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        x = (x1 + x2) / 2 / img_width
                        y = (y1 + y2) / 2 / img_height
                        w = (x2 - x1) / img_width
                        h = (y2 - y1) / img_height
                    else:
                        continue
                    
                    # Get class information
                    cls = int(box.cls[0]) if hasattr(box, 'cls') and box.cls is not None and len(box.cls) > 0 else 0
                    label = result.names[cls] if hasattr(result, 'names') and result.names and cls in result.names else f"class_{cls}"
                    
                    # Calculate bbox in both formats
                    bbox = {
                        "x1": max(0, x - w/2),
                        "y1": max(0, y - h/2),
                        "x2": min(1, x + w/2),
                        "y2": min(1, y + h/2),
                        "width": w,
                        "height": h
                    }
                    
                    # Create detection object
                    detection = Detection(
                        id=f"{model_name}_{i}_{j}_{uuid.uuid4()}",
                        label=label,
                        class_name=label,
                        class_id=cls,
                        model=model_name,
                        confidence=conf,
                        x=x,
                        y=y,
                        width=w,
                        height=h,
                        bbox=bbox
                    )
                    detections.append(detection)
    except Exception as e:
        logger.error(f"Error converting model results to detections: {str(e)}")
        
    return detections

# Create a transcoded videos directory if it doesn't exist
temp_dir = Path(tempfile.gettempdir()) / "avianet_transcoded"
os.makedirs(temp_dir, exist_ok=True)
logger.info(f"Using temporary directory for transcoded videos: {temp_dir}")

# Track transcoding jobs
active_jobs = {}

@router.post("/transcode")
async def transcode_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    outputFormat: str = Form("mp4")
):
    """Transcode an uploaded video file to a specified format using FFmpeg."""
    try:
        # Generate a unique job ID
        job_id = str(uuid.uuid4())
        
        # Save the uploaded file temporarily
        temp_input_path = os.path.join(temp_dir, f"input_{job_id}")
        with open(temp_input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Define output path
        output_filename = f"transcoded_{job_id}.{outputFormat}"
        temp_output_path = os.path.join(temp_dir, output_filename)
        
        # Get FFmpeg binary path from environment variable or use default
        ffmpeg_binary = os.environ.get("FFMPEG_BINARY_PATH", "ffmpeg")
        
        # Build FFmpeg command
        command = [
            ffmpeg_binary,
            "-i", temp_input_path,
            "-c:v", "libx264",
            "-preset", "fast",
            "-c:a", "aac",
            "-movflags", "+faststart",
            temp_output_path
        ]
        
        # Execute FFmpeg command
        logger.info(f"Starting transcoding job {job_id}: {' '.join(command)}")
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # Track the job
        active_jobs[job_id] = {
            "input_file": temp_input_path,
            "output_file": temp_output_path,
            "status": "processing",
            "process": process
        }
        
        # Return job information
        return {
            "job_id": job_id,
            "status": "processing",
            "message": "Transcoding started",
            "output_format": outputFormat
        }
        
    except Exception as e:
        logger.error(f"Transcoding error: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Transcoding failed: {str(e)}"}
        )

@router.post("/inference")
async def inference(request: Request):
    """
    Process an image for object detection
    """
    try:
        # Parse the JSON request
        data = await request.json()
        
        # Extract model paths and image data
        model_paths = data.get("modelPaths", [])
        threshold = float(data.get("threshold", 0.5))
        image_data = data.get("imageData", "")
        
        # Decode base64 image
        if image_data:
            image_parts = image_data.split(",")
            if len(image_parts) > 1:
                image_bytes = base64.b64decode(image_parts[1])
            else:
                image_bytes = base64.b64decode(image_parts[0])
                
            # Convert to PIL Image for processing
            try:
                from PIL import Image
                image = Image.open(io.BytesIO(image_bytes))
                width, height = image.size
            except Exception as e:
                return JSONResponse(
                    status_code=400,
                    content={"error": f"Invalid image data: {str(e)}"}
                )
                
            # Process with models if available
            if TORCH_AVAILABLE and ULTRALYTICS_AVAILABLE and model_paths:
                all_detections = []
                
                # Process each model
                for model_path in model_paths:
                    try:
                        # Get the actual model path
                        resolved_path = get_model_path(model_path)
                        model_name = os.path.basename(resolved_path).split('.')[0]
                        
                        # Load model
                        model = YOLO(resolved_path)
                        
                        # Run inference
                        start_time = time.time()
                        results = model.predict(source=image, conf=threshold, verbose=False)
                        inference_time = (time.time() - start_time) * 1000
                        
                        # Convert to our format
                        detections = convert_ultralytics_results_to_detections(
                            results, width, height, threshold, model_name
                        )
                        all_detections.extend(detections)
                        
                    except Exception as e:
                        logger.error(f"Model inference error with {model_path}: {str(e)}")
                        continue
                        
                # Create result
                result = InferenceResult(
                    detections=all_detections,
                    inference_time=inference_time,
                    processed_at="edge",
                    timestamp=time.strftime("%Y-%m-%d %H:%M:%S")
                )
                
                # Return results
                return JSONResponse(content=result.dict())
            else:
                # Fallback to simulation
                sim_detections = simulate_detection()
                result = InferenceResult(
                    detections=sim_detections,
                    inference_time=10.0,
                    processed_at="simulation",
                    timestamp=time.strftime("%Y-%m-%d %H:%M:%S")
                )
                return JSONResponse(content=result.dict())
        else:
            return JSONResponse(
                status_code=400,
                content={"error": "No image data provided"}
            )
                
    except Exception as e:
        logger.error(f"Inference endpoint error: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Inference failed: {str(e)}"}
        )
