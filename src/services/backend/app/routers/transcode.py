
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Response, Request
from fastapi.responses import StreamingResponse
import os
import uuid
import subprocess
import tempfile
import logging
import shutil
from pathlib import Path
import time
import json
import asyncio
from typing import Optional

# Define the router with no prefix but explicitly setting the correct tags
router = APIRouter(
    tags=["transcode"],
    responses={404: {"description": "Not found"}},
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get FFmpeg binary path from environment variable
ffmpeg_binary_path = os.environ.get("FFMPEG_BINARY_PATH", "/usr/bin/ffmpeg")
logger.info(f"Transcode module using FFmpeg binary from: {ffmpeg_binary_path}")

# Create temp directory for transcoding jobs
TRANSCODE_DIR = os.path.join(tempfile.gettempdir(), "transcode_jobs")
os.makedirs(TRANSCODE_DIR, exist_ok=True)
logger.info(f"Using transcode directory: {TRANSCODE_DIR}")

# Keep track of transcoding jobs
transcode_jobs = {}

@router.post("/transcode", status_code=202)
async def transcode_video(
    backgroundTasks: BackgroundTasks,
    file: UploadFile = File(...),
    outputFormat: str = Form("mp4"),
    quality: str = Form("medium"),
    preset: str = Form("fast")
):
    """
    Upload and transcode a video file
    """
    # Generate unique job ID
    job_id = str(uuid.uuid4())
    
    # Create job directory
    job_dir = os.path.join(TRANSCODE_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    
    # Save input file
    input_path = os.path.join(job_dir, file.filename)
    output_path = os.path.join(job_dir, f"output.{outputFormat}")
    
    # Create status file
    status_path = os.path.join(job_dir, "status.json")
    
    # Save the uploaded file
    logger.info(f"Saving uploaded file to {input_path}")
    with open(input_path, "wb") as buffer:
        # Read file in chunks to handle large files
        shutil.copyfileobj(file.file, buffer)
    
    # Update status
    transcode_jobs[job_id] = {
        "status": "queued",
        "input_file": input_path,
        "output_file": output_path,
        "format": outputFormat,
        "created_at": time.time()
    }
    
    with open(status_path, "w") as f:
        json.dump({
            "status": "queued",
            "progress": 0
        }, f)
    
    # Start transcoding in background
    backgroundTasks.add_task(
        transcode_file, job_id, input_path, output_path, outputFormat, quality, preset
    )
    
    return {"job_id": job_id, "status": "queued"}

def transcode_file(job_id, input_path, output_path, output_format, quality, preset):
    """Background task for transcoding video"""
    status_path = os.path.join(os.path.dirname(output_path), "status.json")
    
    try:
        # Update status
        transcode_jobs[job_id]["status"] = "processing"
        with open(status_path, "w") as f:
            json.dump({
                "status": "processing",
                "progress": 0
            }, f)
        
        # Set quality parameters based on quality setting
        crf = "23"  # Default medium quality
        if quality == "high":
            crf = "18"
        elif quality == "low":
            crf = "28"
        
        # Build FFmpeg command
        cmd = [
            ffmpeg_binary_path,
            "-i", input_path,
            "-c:v", "libx264",
            "-preset", preset,
            "-crf", crf,
            "-c:a", "aac",
            "-strict", "experimental",
            output_path
        ]
        
        logger.info(f"Running FFmpeg command: {' '.join(cmd)}")
        
        # Run FFmpeg
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        
        # Wait for completion
        stdout, stderr = process.communicate()
        
        # Check if successful
        if process.returncode == 0:
            logger.info(f"Transcoding completed successfully for job {job_id}")
            transcode_jobs[job_id]["status"] = "completed"
            with open(status_path, "w") as f:
                json.dump({
                    "status": "completed",
                    "progress": 100
                }, f)
        else:
            logger.error(f"Transcoding failed for job {job_id}: {stderr}")
            transcode_jobs[job_id]["status"] = "failed"
            transcode_jobs[job_id]["error"] = stderr
            with open(status_path, "w") as f:
                json.dump({
                    "status": "failed",
                    "error": stderr
                }, f)
    
    except Exception as e:
        logger.exception(f"Error during transcoding job {job_id}")
        transcode_jobs[job_id]["status"] = "failed"
        transcode_jobs[job_id]["error"] = str(e)
        with open(status_path, "w") as f:
            json.dump({
                "status": "failed",
                "error": str(e)
            }, f)

@router.get("/transcode/{job_id}/status")
async def get_job_status(job_id: str):
    """
    Get the status of a transcoding job
    """
    status_path = os.path.join(TRANSCODE_DIR, job_id, "status.json")
    
    if not os.path.exists(status_path):
        raise HTTPException(status_code=404, detail="Job not found")
    
    with open(status_path, "r") as f:
        status = json.load(f)
    
    return status

@router.get("/transcode/{job_id}/download")
async def download_transcoded_file(job_id: str):
    """
    Download the transcoded file
    """
    job_dir = os.path.join(TRANSCODE_DIR, job_id)
    output_files = list(Path(job_dir).glob("output.*"))
    
    if not output_files:
        raise HTTPException(status_code=404, detail="Output file not found")
    
    output_path = str(output_files[0])
    
    # Check if the file exists and job is completed
    status_path = os.path.join(job_dir, "status.json")
    if not os.path.exists(output_path) or not os.path.exists(status_path):
        raise HTTPException(status_code=404, detail="Output file not found")
    
    with open(status_path, "r") as f:
        status = json.load(f)
    
    if status.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Transcoding job not completed")
    
    # Determine file mime type
    file_format = os.path.splitext(output_path)[1][1:]
    mime_type = f"video/{file_format}"
    
    def file_iterator(file_path, chunk_size=8192):
        with open(file_path, "rb") as f:
            while chunk := f.read(chunk_size):
                yield chunk
    
    return StreamingResponse(
        file_iterator(output_path),
        media_type=mime_type,
        headers={"Content-Disposition": f"attachment; filename=transcoded.{file_format}"}
    )

async def wait_for_hls_files(stream_dir: str, max_wait_time: int = 15) -> bool:
    """
    Wait for HLS files to be created before returning success
    Returns True if files were created within the timeout period
    """
    index_path = os.path.join(stream_dir, "index.m3u8")
    start_time = time.time()
    
    while time.time() - start_time < max_wait_time:
        if os.path.exists(index_path):
            # Also check if at least one .ts segment exists
            ts_segments = list(Path(stream_dir).glob("*.ts"))
            if ts_segments:
                logger.info(f"HLS files created successfully in {stream_dir}")
                return True
        
        # Short sleep before checking again
        await asyncio.sleep(0.5)
    
    logger.error(f"Timeout waiting for HLS files in {stream_dir}")
    return False

@router.post("/transcode/stream", status_code=202)
async def create_stream(
    backgroundTasks: BackgroundTasks,
    request: Request,
    stream_url: str = Form(...),
    output_format: str = Form("hls"),
    stream_name: str = Form(None)
):
    """
    Create a streaming endpoint from an RTSP or other stream URL
    """
    # Log the incoming request for debugging
    logger.info(f"Received stream request with URL: {stream_url}, format: {output_format}")
    
    # Generate unique stream ID
    stream_id = str(uuid.uuid4())
    
    # Create stream directory
    stream_dir = os.path.join(TRANSCODE_DIR, f"stream_{stream_id}")
    os.makedirs(stream_dir, exist_ok=True)
    
    # Set output paths - Use index.m3u8 instead of stream.m3u8 to match frontend expectations
    if output_format == "hls":
        output_path = os.path.join(stream_dir, "index.m3u8")
    else:
        output_path = os.path.join(stream_dir, f"stream.{output_format}")
    
    # Create status file
    status_path = os.path.join(stream_dir, "status.json")
    
    # Update status
    transcode_jobs[stream_id] = {
        "status": "processing",
        "input_url": stream_url,
        "output_file": output_path,
        "format": output_format,
        "created_at": time.time()
    }
    
    with open(status_path, "w") as f:
        json.dump({
            "status": "processing",
            "progress": 0
        }, f)
    
    # Start FFmpeg process in background
    process = await start_stream_process(stream_id, stream_url, output_path, output_format)
    
    if process is None:
        raise HTTPException(status_code=500, detail="Failed to start streaming process")
    
    # Wait for initial HLS files to be created (with timeout)
    file_creation_successful = await wait_for_hls_files(stream_dir)
    
    # Construct the public URL for the stream - using relative URL
    stream_url_path = f"/transcode/stream/{stream_id}/index.m3u8"
    
    # Start background monitoring task
    backgroundTasks.add_task(
        monitor_stream_process, stream_id, process, stream_dir
    )
    
    logger.info(f"Stream job created: {stream_id}, URL: {stream_url_path}")
    
    # Return immediately with status and URL
    return {
        "stream_id": stream_id, 
        "status": "streaming" if file_creation_successful else "initializing",
        "stream_url": stream_url_path
    }

async def start_stream_process(stream_id: str, input_url: str, output_path: str, output_format: str) -> Optional[subprocess.Popen]:
    """Start FFmpeg process for streaming and return process object"""
    try:
        # Build FFmpeg command for HLS streaming with improved options
        if output_format == "hls":
            cmd = [
                ffmpeg_binary_path,
                "-i", input_url,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-tune", "zerolatency",
                "-c:a", "aac",
                "-strict", "experimental",
                "-f", "hls",
                "-hls_time", "2",
                "-hls_list_size", "10",
                "-hls_wrap", "10",
                "-hls_flags", "delete_segments+append_list",
                "-hls_segment_type", "mpegts",
                "-start_number", "0",
                "-hls_segment_filename", f"{os.path.dirname(output_path)}/segment_%03d.ts",
                output_path
            ]
        else:
            # For other formats (mp4, webm, etc.)
            cmd = [
                ffmpeg_binary_path,
                "-i", input_url,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-tune", "zerolatency",
                "-c:a", "aac",
                "-strict", "experimental",
                "-f", output_format,
                output_path
            ]
        
        logger.info(f"Running FFmpeg stream command: {' '.join(cmd)}")
        
        # Run FFmpeg in non-blocking mode
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        
        # Update status file
        status_path = os.path.join(os.path.dirname(output_path), "status.json")
        with open(status_path, "w") as f:
            json.dump({
                "status": "streaming",
                "progress": 100,
                "pid": process.pid
            }, f)
        
        # Store process in jobs dictionary
        transcode_jobs[stream_id]["process"] = process
        transcode_jobs[stream_id]["status"] = "streaming"
        
        return process
    except Exception as e:
        logger.exception(f"Error starting FFmpeg process for stream {stream_id}")
        status_path = os.path.join(os.path.dirname(output_path), "status.json")
        with open(status_path, "w") as f:
            json.dump({
                "status": "failed",
                "error": str(e)
            }, f)
        return None

async def monitor_stream_process(stream_id: str, process: subprocess.Popen, stream_dir: str):
    """Monitor FFmpeg process and handle errors"""
    try:
        # Read stderr in a non-blocking way to monitor the process
        # This runs in a background task
        stderr_lines = []
        for line in iter(process.stderr.readline, ""):
            if not line:
                break
            stderr_lines.append(line.strip())
            # Check for specific FFmpeg errors in the output
            if "Error" in line:
                logger.error(f"FFmpeg error for stream {stream_id}: {line}")
        
        # Wait for process to complete (should only happen if stream ends or errors)
        return_code = process.wait()
        
        # Update status based on return code
        status_path = os.path.join(stream_dir, "status.json")
        if return_code != 0:
            logger.error(f"FFmpeg process for stream {stream_id} exited with code {return_code}")
            error_output = "\n".join(stderr_lines[-20:])  # Last 20 lines of stderr
            with open(status_path, "w") as f:
                json.dump({
                    "status": "failed",
                    "error": f"FFmpeg exited with code {return_code}: {error_output}"
                }, f)
        else:
            logger.info(f"FFmpeg process for stream {stream_id} completed normally")
            with open(status_path, "w") as f:
                json.dump({
                    "status": "completed"
                }, f)
    
    except Exception as e:
        logger.exception(f"Error monitoring stream {stream_id}")
        status_path = os.path.join(stream_dir, "status.json")
        with open(status_path, "w") as f:
            json.dump({
                "status": "failed",
                "error": str(e)
            }, f)

@router.get("/transcode/stream/{stream_id}/{file_name}")
async def get_stream_file(stream_id: str, file_name: str):
    """
    Serve HLS stream files
    """
    logger.info(f"Requested stream file: {stream_id}/{file_name}")
    
    stream_dir = os.path.join(TRANSCODE_DIR, f"stream_{stream_id}")
    file_path = os.path.join(stream_dir, file_name)
    
    if not os.path.exists(file_path):
        logger.error(f"Stream file not found: {file_path}")
        
        # Special handling for index.m3u8 - if it doesn't exist yet, check if we're still initializing
        if file_name == "index.m3u8":
            status_path = os.path.join(stream_dir, "status.json")
            if os.path.exists(status_path):
                with open(status_path, "r") as f:
                    try:
                        status = json.load(f)
                        if status.get("status") == "processing" or status.get("status") == "initializing":
                            # Still initializing, return a 202 Accepted to tell the client to retry
                            return Response(
                                content="Stream initializing, please retry",
                                status_code=202,
                                media_type="text/plain"
                            )
                    except json.JSONDecodeError:
                        pass
        
        # If not initializing or not the index file, return 404
        raise HTTPException(status_code=404, detail="Stream file not found")
    
    # Determine content type
    content_type = "application/vnd.apple.mpegurl"
    if file_name.endswith(".ts"):
        content_type = "video/mp2t"
    
    # For m3u8 files, make sure we return the latest version
    if file_name.endswith(".m3u8"):
        # Read the file and return it directly to ensure we have the most recent version
        with open(file_path, "rb") as f:
            content = f.read()
        
        return Response(
            content=content,
            media_type=content_type
        )
    
    # For ts segments, stream the response
    return StreamingResponse(
        open(file_path, "rb"),
        media_type=content_type
    )

# Cleanup old jobs periodically (could be implemented as a background task)
def cleanup_old_jobs():
    """Clean up old transcoding jobs"""
    current_time = time.time()
    for job_id, job in list(transcode_jobs.items()):
        # If job is older than 1 hour and completed or failed
        if (current_time - job.get("created_at", current_time)) > 3600 and \
           job.get("status") in ["completed", "failed"]:
            job_dir = os.path.join(TRANSCODE_DIR, job_id)
            if os.path.exists(job_dir):
                shutil.rmtree(job_dir)
            del transcode_jobs[job_id]
