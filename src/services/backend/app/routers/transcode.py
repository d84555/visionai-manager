
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Response, Request
from fastapi.responses import StreamingResponse
import os
import uuid
import subprocess
import tempfile
import logging
import shutil
import time
import json
from pathlib import Path
import re

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

def is_rtsp_url(url):
    """Check if URL is RTSP protocol"""
    return url.lower().startswith("rtsp://")

def wait_for_file_creation(file_path, timeout=30, check_interval=1):
    """Wait for a file to be created with timeout"""
    start_time = time.time()
    while time.time() - start_time < timeout:
        if os.path.exists(file_path):
            return True
        # Also check for temporary files that indicate the process is working
        temp_files = list(Path(os.path.dirname(file_path)).glob("*.ts")) + \
                    list(Path(os.path.dirname(file_path)).glob("*.m3u8.tmp"))
        if temp_files:
            logger.info(f"Found temporary segment files: {temp_files}")
            return True
        time.sleep(check_interval)
        logger.info(f"Waiting for stream file creation: {file_path}")
    return False

def process_stream(stream_id, input_url, output_path, output_format):
    """Background task for processing stream"""
    stream_dir = os.path.dirname(output_path)
    status_path = os.path.join(stream_dir, "status.json")
    
    try:
        # Check if this is an RTSP stream
        is_rtsp = is_rtsp_url(input_url)
        logger.info(f"Stream type detection: RTSP={is_rtsp}")
        
        # Build FFmpeg command for HLS streaming
        if output_format == "hls":
            if is_rtsp:
                # Enhanced RTSP-specific command with TCP transport
                cmd = [
                    ffmpeg_binary_path,
                    # Force RTSP over TCP - critical for many IP cameras
                    "-rtsp_transport", "tcp",
                    # Add extra input options for RTSP
                    "-i", input_url,
                    # Use hardware-friendly codec settings
                    "-c:v", "libx264",
                    "-preset", "ultrafast",
                    "-tune", "zerolatency",
                    "-profile:v", "baseline",
                    "-level", "3.0",
                    "-pix_fmt", "yuv420p",
                    # Control bitrate for better stability
                    "-b:v", "1500k",
                    # Audio settings (if present)
                    "-c:a", "aac",
                    "-strict", "experimental",
                    "-ac", "2",
                    # HLS specific flags with improved options
                    "-f", "hls",
                    "-hls_time", "2",
                    "-hls_list_size", "10",
                    "-hls_flags", "delete_segments+append_list+discont_start+temp_file",
                    "-hls_segment_filename", f"{stream_dir}/segment_%03d.ts",
                    "-hls_playlist_type", "event",
                    # Output path
                    output_path
                ]
            else:
                # Standard non-RTSP command
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
                    "-hls_flags", "delete_segments",
                    output_path
                ]
        else:
            # For other formats (mp4, webm, etc.)
            cmd = [
                ffmpeg_binary_path,
                # Add TCP for RTSP
                *(["-rtsp_transport", "tcp"] if is_rtsp else []),
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
        
        # Run FFmpeg with pipe for stderr so we can capture output
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            bufsize=1  # Line buffered
        )
        
        # Update status to streaming
        with open(status_path, "w") as f:
            json.dump({
                "status": "streaming",
                "progress": 0,
                "message": "Starting stream..."
            }, f)
        
        # Wait for the first segment file to appear (indicates stream is working)
        file_created = wait_for_file_creation(output_path, timeout=15)
        
        if not file_created:
            logger.warning(f"No HLS files created after timeout for {stream_id}")
            # Don't fail yet - FFmpeg might still be working
        
        # Start reading stderr in a non-blocking way
        error_log = []
        
        # Check if we have at least one HLS segment after a reasonable time
        if output_format == "hls":
            time.sleep(5)  # Give some time for at least one segment
            segment_count = len(list(Path(stream_dir).glob("*.ts")))
            logger.info(f"After initial wait, found {segment_count} TS segments")
            
            if segment_count == 0:
                # No segments created after 5 seconds - something's wrong
                # Capture any error output
                stderr = process.stderr.read()
                error_log.append(stderr)
                
                logger.error(f"No segments created for stream {stream_id}. FFmpeg stderr: {stderr}")
                
                # Try to terminate the process
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                
                # Update status
                with open(status_path, "w") as f:
                    json.dump({
                        "status": "failed",
                        "error": "No HLS segments created. Stream may be unreachable or in wrong format."
                    }, f)
                return
        
        # Update status to reflect working stream
        with open(status_path, "w") as f:
            json.dump({
                "status": "streaming",
                "progress": 100
            }, f)
        
        # This will collect output but not block
        def read_stderr():
            for line in iter(process.stderr.readline, ""):
                if line:
                    error_log.append(line)
                    # Look for critical errors that might indicate stream failure
                    if "Error" in line or "Invalid data" in line or "not found" in line:
                        logger.error(f"FFmpeg error: {line.strip()}")
                else:
                    break
        
        import threading
        stderr_thread = threading.Thread(target=read_stderr)
        stderr_thread.daemon = True
        stderr_thread.start()
        
        # Monitor process but don't wait indefinitely
        try:
            exit_code = process.wait(timeout=3600)  # 1 hour timeout
            logger.info(f"Stream process exited with code {exit_code} for job {stream_id}")
            
            if exit_code != 0:
                logger.error(f"Stream failed with exit code {exit_code}")
                errors = "\n".join(error_log[-20:])  # Last 20 error lines
                with open(status_path, "w") as f:
                    json.dump({
                        "status": "failed",
                        "error": f"FFmpeg exited with code {exit_code}. Errors: {errors}"
                    }, f)
        except subprocess.TimeoutExpired:
            logger.info(f"Stream process {stream_id} still running after timeout")
            # Process is still running, which is fine for a stream
    
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
        # Check if any segment files exist
        segment_files = list(Path(stream_dir).glob("*.ts"))
        manifest_file = Path(os.path.join(stream_dir, "index.m3u8"))
        
        if segment_files:
            logger.info(f"Found {len(segment_files)} segment files, but requested file missing")
        elif manifest_file.exists():
            logger.info(f"Manifest exists but requested file missing")
        else:
            logger.error(f"No stream files found in directory: {stream_dir}")
            
        raise HTTPException(status_code=404, detail="Stream file not found")
    
    # Determine content type
    content_type = "application/vnd.apple.mpegurl"
    if file_name.endswith(".ts"):
        content_type = "video/mp2t"
    
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
