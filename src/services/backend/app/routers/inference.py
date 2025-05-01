
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

router = APIRouter(prefix="/api", tags=["inference"])
logger = logging.getLogger(__name__)

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
    # Generate a unique ID for this transcoding job
    job_id = str(uuid.uuid4())
    
    # Save the uploaded file to a temporary location
    temp_input_path = temp_dir / f"input_{job_id}_{file.filename}"
    with open(temp_input_path, "wb") as temp_file:
        shutil.copyfileobj(file.file, temp_file)
    
    # Define the output path
    output_extension = outputFormat.lower()
    if output_extension not in ["mp4", "webm", "hls"]:
        output_extension = "mp4"  # Default to MP4
        
    temp_output_path = temp_dir / f"output_{job_id}.{output_extension}"
    
    # Set the encoding parameters based on format
    if output_extension == "mp4":
        ffmpeg_cmd = [
            "ffmpeg", 
            "-i", str(temp_input_path),
            "-c:v", "libx264", 
            "-preset", "fast", 
            "-c:a", "aac", 
            "-movflags", "+faststart",
            str(temp_output_path)
        ]
    elif output_extension == "webm":
        ffmpeg_cmd = [
            "ffmpeg", 
            "-i", str(temp_input_path),
            "-c:v", "libvpx", 
            "-crf", "10", 
            "-b:v", "1M",
            "-c:a", "libvorbis", 
            str(temp_output_path)
        ]
    elif output_extension == "hls":
        # For HLS, we need to create segments
        temp_output_path = temp_dir / f"output_{job_id}"
        os.makedirs(temp_output_path, exist_ok=True)
        master_playlist = temp_output_path / "master.m3u8"
        
        ffmpeg_cmd = [
            "ffmpeg", 
            "-i", str(temp_input_path),
            "-c:v", "libx264", 
            "-preset", "fast",
            "-c:a", "aac", 
            "-f", "hls",
            "-hls_time", "4",
            "-hls_playlist_type", "vod",
            "-hls_segment_filename", f"{temp_output_path}/segment_%03d.ts",
            str(master_playlist)
        ]
    
    # Start the transcoding process
    try:
        logger.info(f"Starting transcoding job {job_id} for file {file.filename}")
        logger.info(f"Running command: {' '.join(ffmpeg_cmd)}")
        
        # The command below is commented out in the simulation version
        # In a real backend, this would execute the FFmpeg command
        # process = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        # stdout, stderr = process.communicate()
        
        # For simulation, we'll just pretend it worked
        # In a real implementation, check the return code of the process
        
        # Simulate delay
        time.sleep(2)
        
        logger.info(f"Transcoding completed for job {job_id}")
        
        # Track the job
        active_jobs[job_id] = {
            "status": "completed",
            "input_file": str(temp_input_path),
            "output_file": str(temp_output_path),
            "format": output_extension,
            "created_at": time.time()
        }
        
        # For simulation, create a dummy file
        with open(temp_output_path, "wb") as f:
            # Just write some bytes to simulate a video file
            f.write(b"This is a simulated video file")
        
        # Return the transcoded file
        return FileResponse(
            path=temp_output_path,
            media_type=f"video/{output_extension}",
            filename=f"{os.path.splitext(file.filename)[0]}.{output_extension}"
        )
        
    except Exception as e:
        logger.error(f"Error during transcoding: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Transcoding failed: {str(e)}")
    finally:
        # Clean up in background
        background_tasks.add_task(cleanup_temp_files, job_id, str(temp_input_path), str(temp_output_path))

def cleanup_temp_files(job_id: str, input_path: str, output_path: str):
    """Clean up temporary files after they've been served."""
    # Wait a bit to ensure the file has been served
    time.sleep(300)  # 5 minutes
    
    try:
        if os.path.exists(input_path):
            os.remove(input_path)
            logger.info(f"Removed temporary input file: {input_path}")
            
        if os.path.exists(output_path):
            if os.path.isdir(output_path):
                shutil.rmtree(output_path)
            else:
                os.remove(output_path)
            logger.info(f"Removed temporary output file: {output_path}")
            
        # Remove the job from tracking
        if job_id in active_jobs:
            del active_jobs[job_id]
    except Exception as e:
        logger.error(f"Error cleaning up temporary files: {str(e)}")

# Example endpoint for streaming inference
@router.post("/inference")
async def inference(request: Request):
    """
    Process an image for object detection
    """
    try:
        data = await request.json()
        
        # Simulate processing delay
        time.sleep(0.2)
        
        # Return simulated detections
        return {
            "status": "success",
            "detections": [
                {
                    "id": "det1",
                    "label": "Person",
                    "confidence": 0.95,
                    "bbox": {"x1": 100, "y1": 200, "x2": 300, "y2": 400, "width": 200, "height": 200}
                },
                {
                    "id": "det2",
                    "label": "Car",
                    "confidence": 0.85,
                    "bbox": {"x1": 450, "y1": 300, "x2": 550, "y2": 350, "width": 100, "height": 50}
                }
            ],
            "inferenceTime": 120,
            "processedAt": "edge"
        }
    except Exception as e:
        logger.error(f"Inference error: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": f"Inference failed: {str(e)}"}
        )

# Add more inference-related endpoints as needed
