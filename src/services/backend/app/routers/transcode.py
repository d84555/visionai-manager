
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
from urllib.parse import urlparse

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
def validate_stream_url(url: str) -> dict:
    """
    Validate that the stream URL is accessible and return detailed information
    """
    result = {
        "accessible": False,
        "is_m3u8_format": False,
        "is_rtsp_stream": False,
        "content_type": None,
        "error": None,
        "content_preview": None
    }
    
    try:
        logger.info(f"Validating stream URL: {url}")
        
        # Check URL format
        parsed_url = urlparse(url)
        if not parsed_url.scheme or not parsed_url.netloc:
            result["error"] = "Invalid URL format"
            return result
            
        # Set up request headers
        headers = {
            'User-Agent': 'VisionAI-StreamValidator/1.0',
            'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*'
        }
        
        # Detect RTSP streams first
        if url.lower().startswith(('rtsp://', 'rtsps://', 'rtmp://')):
            logger.info(f"Detected RTSP/RTMP stream: {url}")
            result["is_rtsp_stream"] = True
            result["accessible"] = True  # Assume RTSP is accessible, we'll check when we try to process it
            return result
            
        # For HTTP streams, attempt a HEAD request first
        logger.info(f"Attempting HEAD request to: {url}")
        try:
            head_response = requests.head(url, timeout=10, headers=headers, allow_redirects=True)
            logger.info(f"HEAD request status: {head_response.status_code}")
            
            result["content_type"] = head_response.headers.get('Content-Type')
            if 'mpegurl' in (result["content_type"] or '').lower():
                result["is_m3u8_format"] = True
                
            # If we get a success response from HEAD, the URL is accessible
            result["accessible"] = head_response.status_code < 400
                
            if not result["accessible"]:
                result["error"] = f"HTTP status {head_response.status_code}"
                return result
        except Exception as e:
            logger.warning(f"HEAD request failed: {str(e)}")
            # Fall through to GET request
        
        # For potential HLS streams, we should verify content with GET
        logger.info(f"Attempting GET request to: {url}")
        try:
            get_response = requests.get(
                url, 
                timeout=10, 
                headers=headers, 
                stream=True,
                allow_redirects=True
            )
            
            logger.info(f"GET status: {get_response.status_code}, content-type: {get_response.headers.get('Content-Type')}")
            
            # Update result with GET response info
            result["accessible"] = get_response.status_code < 400
            result["content_type"] = get_response.headers.get('Content-Type') or result["content_type"]
            
            if not result["accessible"]:
                result["error"] = f"HTTP status {get_response.status_code}"
                return result
            
            # Check if this appears to be an M3U8 file
            is_m3u8_url = url.lower().endswith('.m3u8') or '.m3u8' in url.lower()
            is_m3u8_content_type = 'mpegurl' in (result["content_type"] or '').lower()
            
            # For potential HLS streams, check content
            if is_m3u8_url or is_m3u8_content_type:
                # Only read the first chunk to verify content
                content = next(get_response.iter_content(chunk_size=2048), b'')
                if content:
                    content_text = content.decode('utf-8', errors='ignore')
                    result["content_preview"] = content_text[:200]
                    result["is_m3u8_format"] = '#EXTM3U' in content_text
                    
                    if result["is_m3u8_format"]:
                        logger.info("Validated M3U8 format (contains #EXTM3U)")
                    else:
                        logger.warning("URL ends with .m3u8 but content doesn't contain #EXTM3U")
            
            get_response.close()
            
        except Exception as e:
            logger.error(f"GET request failed: {str(e)}")
            result["error"] = str(e)
            result["accessible"] = False
            
        return result
            
    except Exception as e:
        logger.error(f"Error validating stream URL: {str(e)}")
        result["error"] = str(e)
        return result

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
    
    # Enhanced stream URL validation with detailed logging
    validation_result = validate_stream_url(stream_url)
    logger.info(f"Stream URL validation result: {validation_result}")
    
    # If URL is an HLS stream already, don't process it
    if validation_result["is_m3u8_format"] and validation_result["accessible"]:
        logger.info(f"Direct HLS URL detected and accessible: {stream_url}")
        return {
            "stream_id": "direct_hls",
            "status": "ready",
            "stream_url": stream_url,
            "message": "Direct HLS URL, no processing needed"
        }
    
    # If the URL isn't accessible, fail with helpful error
    if not validation_result["accessible"] and not validation_result["is_rtsp_stream"]:
        logger.error(f"Stream URL validation failed: {validation_result['error']}")
        raise HTTPException(
            status_code=400, 
            detail=f"Stream URL is not accessible: {validation_result['error']}"
        )
    
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
    
    # Start streaming in background with more robust command based on stream type
    backgroundTasks.add_task(
        process_stream, stream_id, stream_url, output_path, output_format, validation_result
    )
    
    # Construct the public URL for the stream - using relative URL
    stream_url_path = f"/transcode/stream/{stream_id}/index.m3u8"
    
    logger.info(f"Stream job created: {stream_id}, URL: {stream_url_path}")
    
    return {
        "stream_id": stream_id, 
        "status": "processing",
        "stream_url": stream_url_path
    }

def process_stream(stream_id, input_url, output_path, output_format, validation_result):
    """Background task for processing stream with enhanced error handling"""
    status_path = os.path.join(os.path.dirname(output_path), "status.json")
    
    try:
        is_rtsp = input_url.lower().startswith(('rtsp://', 'rtsps://', 'rtmp://'))
        is_http = input_url.lower().startswith(('http://', 'https://'))
        
        # Update status to show what type of stream we're processing
        with open(status_path, "w") as f:
            json.dump({
                "status": "preparing",
                "stream_type": "rtsp" if is_rtsp else "http",
                "progress": 5
            }, f)
        
        # Build FFmpeg command based on stream type
        if output_format == "hls":
            # More robust FFmpeg command for HLS streaming
            common_args = [
                ffmpeg_binary_path,
                "-loglevel", "info",       # For detailed logging
                "-reconnect", "1",         # Enable reconnection
                "-reconnect_at_eof", "1",  # Reconnect at EOF
                "-reconnect_streamed", "1",# Reconnect if stream ends
                "-reconnect_delay_max", "10", # Max delay between reconnection attempts
            ]
            
            # Add specific input options based on stream type
            input_args = []
            if is_rtsp:
                input_args = [
                    "-rtsp_transport", "tcp", # Use TCP for RTSP (more reliable)
                    "-i", input_url
                ]
            else:
                input_args = ["-i", input_url]
                
            # Output options for HLS - tuned for compatibility and low latency
            output_args = [
                "-c:v", "libx264",         # Use H.264 for video
                "-preset", "ultrafast",    # Fastest encoding
                "-tune", "zerolatency",    # Optimize for low latency
                "-c:a", "aac",             # Use AAC for audio
                "-strict", "experimental", # Allow experimental codecs
                "-f", "hls",               # Output format: HLS
                "-hls_time", "2",          # 2-second segments
                "-hls_list_size", "10",    # Keep 10 segments in playlist
                "-hls_wrap", "10",         # Wrap around after 10 segments
                "-hls_flags", "delete_segments", # Delete old segments
                output_path
            ]
            
            cmd = common_args + input_args + output_args
        else:
            # Command for other formats
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
        
        # Run FFmpeg with real-time output capture for better monitoring
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
                
                # Look for specific error patterns
                if "Connection refused" in line:
                    logger.error(f"FFmpeg connection refused for {input_url}")
                    with open(status_path, "w") as f:
                        json.dump({
                            "status": "failed",
                            "error": "Connection refused by remote host"
                        }, f)
                    # Terminate the process
                    process.terminate()
                    return
                elif "403 Forbidden" in line:
                    logger.error(f"FFmpeg access forbidden for {input_url}")
                    with open(status_path, "w") as f:
                        json.dump({
                            "status": "failed",
                            "error": "Access forbidden (HTTP 403)"
                        }, f)
                    # Terminate the process
                    process.terminate()
                    return
                elif "404 Not Found" in line:
                    logger.error(f"FFmpeg resource not found for {input_url}")
                    with open(status_path, "w") as f:
                        json.dump({
                            "status": "failed",
                            "error": "Resource not found (HTTP 404)"
                        }, f)
                    # Terminate the process
                    process.terminate()
                    return
                    
                # Check for segment creation
                elif "Opening" in line and ".ts" in line:
                    logger.info(f"FFmpeg created HLS segment for {stream_id}")
                    with open(status_path, "w") as f:
                        json.dump({
                            "status": "streaming",
                            "pid": process.pid,
                            "progress": 75,
                            "message": "HLS segments being created"
                        }, f)
        
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
    Serve HLS stream files with enhanced logging and CORS handling
    """
    logger.info(f"Requested stream file: {stream_id}/{file_name}")
    
    # Special case for direct HLS streaming
    if stream_id == "direct_hls":
        raise HTTPException(status_code=404, detail="Direct HLS streams must be accessed at their source URL")
    
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
    
    # Add CORS headers to allow direct access
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept",
        "Cache-Control": "no-cache, no-store, must-revalidate"
    }
    
    return StreamingResponse(
        open(file_path, "rb"),
        media_type=content_type,
        headers=headers
    )

# Add a diagnostic endpoint to check stream accessibility
@router.get("/transcode/check_stream")
async def check_stream_url(url: str):
    """
    Check if a stream URL is accessible with detailed diagnostics
    """
    logger.info(f"Checking stream URL accessibility: {url}")
    
    # Use the enhanced validation function
    result = validate_stream_url(url)
    
    # Return raw validation result
    return result

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
