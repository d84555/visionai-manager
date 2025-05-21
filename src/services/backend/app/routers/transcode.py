
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
import requests

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

# Improved stream URL validation
def validate_stream_url(url: str) -> bool:
    """
    Validate that the stream URL is accessible
    """
    try:
        logger.info(f"Validating stream URL: {url}")
        
        # First check if the URL is reachable with a HEAD request
        headers = {
            'User-Agent': 'VisionAI-StreamValidator/1.0',
        }
        
        response = requests.head(url, timeout=5, headers=headers)
        logger.info(f"HEAD request status: {response.status_code}")
        
        # For HLS streams, we should actually test with a GET to verify content
        if url.endswith('.m3u8') or '.m3u8' in url:
            logger.info(f"Detected HLS stream, performing GET request to validate: {url}")
            response = requests.get(url, timeout=5, headers=headers, stream=True)
            # Read just the first chunk to verify it's accessible
            content_start = next(response.iter_content(chunk_size=1024), None)
            
            if content_start:
                logger.info(f"Successfully fetched start of HLS stream: {len(content_start)} bytes")
                # Check if content looks like an M3U8 file
                if b'#EXTM3U' in content_start:
                    logger.info("Validated HLS content format (contains #EXTM3U)")
                else:
                    logger.warning("Content doesn't look like a valid HLS stream (missing #EXTM3U)")
            else:
                logger.warning("Empty content returned from HLS stream URL")
            
            response.close()
        
        return response.status_code < 400
    except Exception as e:
        logger.error(f"Error validating stream URL: {str(e)}")
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
    
    # Validate the stream URL first
    if not validate_stream_url(stream_url):
        logger.error(f"Stream URL validation failed: {stream_url}")
        raise HTTPException(status_code=400, detail="Stream URL is not accessible or invalid")
    else:
        logger.info(f"Stream URL validated successfully: {stream_url}")
    
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
    
    # Start streaming in background
    backgroundTasks.add_task(
        process_stream, stream_id, stream_url, output_path, output_format
    )
    
    # Construct the public URL for the stream - using relative URL
    stream_url_path = f"/transcode/stream/{stream_id}/index.m3u8"
    
    logger.info(f"Stream job created: {stream_id}, URL: {stream_url_path}")
    
    return {
        "stream_id": stream_id, 
        "status": "processing",
        "stream_url": stream_url_path
    }

def process_stream(stream_id, input_url, output_path, output_format):
    """Background task for processing stream"""
    status_path = os.path.join(os.path.dirname(output_path), "status.json")
    
    try:
        # Build FFmpeg command for HLS streaming
        if output_format == "hls":
            # Use more verbose FFmpeg options for better debug info
            cmd = [
                ffmpeg_binary_path,
                "-loglevel", "info",      # More detailed logging
                "-reconnect", "1",        # Enable reconnection
                "-reconnect_at_eof", "1", # Reconnect at EOF
                "-reconnect_streamed", "1", # Reconnect if stream ends
                "-reconnect_delay_max", "10", # Max delay between reconnection attempts
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
                "-hls_flags", "delete_segments",
                output_path
            ]
        else:
            # For other formats (mp4, webm, etc.)
            cmd = [
                ffmpeg_binary_path,
                "-loglevel", "info",
                "-reconnect", "1",
                "-reconnect_at_eof", "1",
                "-reconnect_streamed", "1",
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
        
        # Update status to show we're about to start FFmpeg
        with open(status_path, "w") as f:
            json.dump({
                "status": "starting_ffmpeg",
                "command": ' '.join(cmd),
                "progress": 10
            }, f)
        
        # Run FFmpeg
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            bufsize=1  # Line buffered for real-time output
        )
        
        # Update status to show FFmpeg is running
        with open(status_path, "w") as f:
            json.dump({
                "status": "streaming",
                "pid": process.pid,
                "progress": 50
            }, f)
            
        # Log FFmpeg output in real-time for debugging
        for line in process.stderr:
            if line.strip():
                logger.info(f"FFmpeg output [{stream_id}]: {line.strip()}")
        
        # This will block until the stream is terminated
        stdout, stderr = process.communicate()
        
        # Check result
        if process.returncode == 0:
            logger.info(f"Stream completed successfully for job {stream_id}")
        else:
            logger.error(f"Stream failed for job {stream_id}: {stderr}")
            with open(status_path, "w") as f:
                json.dump({
                    "status": "failed",
                    "error": stderr
                }, f)
    
    except Exception as e:
        logger.exception(f"Error during stream job {stream_id}")
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
        raise HTTPException(status_code=404, detail="Stream file not found")
    
    # Determine content type
    content_type = "application/vnd.apple.mpegurl"
    if file_name.endswith(".ts"):
        content_type = "video/mp2t"
    
    # Log that we're serving the file
    logger.info(f"Serving stream file: {file_path} with content type {content_type}")
    
    return StreamingResponse(
        open(file_path, "rb"),
        media_type=content_type
    )

# Add a diagnostic endpoint to check stream accessibility
@router.get("/transcode/check_stream")
async def check_stream_url(url: str):
    """
    Check if a stream URL is accessible
    """
    logger.info(f"Checking stream URL accessibility: {url}")
    
    try:
        # Try to fetch headers first
        headers = {
            'User-Agent': 'VisionAI-StreamValidator/1.0',
        }
        
        head_response = requests.head(url, timeout=5, headers=headers)
        logger.info(f"HEAD request status: {head_response.status_code}")
        
        # Then try to fetch content
        get_response = requests.get(url, timeout=5, headers=headers, stream=True)
        
        is_m3u8 = False
        content_preview = ""
        
        # For HLS streams, check the content
        if url.endswith('.m3u8') or '.m3u8' in url:
            content_start = next(get_response.iter_content(chunk_size=1024), None)
            if content_start:
                content_preview = content_start.decode('utf-8', errors='ignore')[:100]
                is_m3u8 = b'#EXTM3U' in content_start
        
        get_response.close()
        
        return {
            "accessible": True,
            "head_status": head_response.status_code,
            "get_status": get_response.status_code,
            "is_m3u8_format": is_m3u8,
            "content_type": get_response.headers.get('Content-Type', 'unknown'),
            "content_preview": content_preview
        }
    except Exception as e:
        logger.error(f"Error checking stream URL: {str(e)}")
        return {
            "accessible": False,
            "error": str(e)
        }

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
