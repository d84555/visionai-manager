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
import urllib.parse
import re
import signal
import atexit

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

# Keep track of active FFmpeg processes
active_processes = {}

# Function to terminate FFmpeg processes on shutdown
def terminate_processes():
    """Terminate all active FFmpeg processes gracefully on shutdown"""
    logger.info(f"Shutting down {len(active_processes)} active FFmpeg processes...")
    
    for stream_id, process in list(active_processes.items()):
        if process and process.poll() is None:  # Check if process is still running
            try:
                logger.info(f"Sending graceful termination signal to FFmpeg process for stream {stream_id}")
                # Try to send SIGTERM first for graceful shutdown
                process.terminate()
                
                # Give it a moment to terminate gracefully
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    # If still running after timeout, force kill
                    logger.warning(f"FFmpeg process for {stream_id} did not terminate gracefully, sending SIGKILL")
                    process.kill()
                    
                logger.info(f"FFmpeg process for stream {stream_id} terminated")
                
                # Update status file
                status_path = os.path.join(TRANSCODE_DIR, f"stream_{stream_id}", "status.json")
                if os.path.exists(status_path):
                    with open(status_path, "w") as f:
                        json.dump({
                            "status": "stopped",
                            "message": "Stream terminated due to server shutdown"
                        }, f)
            except Exception as e:
                logger.error(f"Error terminating FFmpeg process for stream {stream_id}: {e}")

# Register the shutdown handler
atexit.register(terminate_processes)

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

@router.post("/transcode/rtsp-to-hls", status_code=202)
async def create_hls_stream(
    backgroundTasks: BackgroundTasks,
    rtsp_url: str,
    browser_compatibility: str = "high"
):
    """
    Create an HLS streaming endpoint from an RTSP URL
    """
    # Log the incoming request for debugging
    logger.info(f"Received RTSP-to-HLS request with URL: {rtsp_url.replace('//', '//***:***@') if '//' in rtsp_url else rtsp_url}")
    
    try:
        # Check if the URL is already pointing to our own stream
        internal_stream_pattern = re.compile(r'/transcode/stream/[a-f0-9-]+/index\.m3u8')
        if internal_stream_pattern.search(rtsp_url):
            raise HTTPException(
                status_code=400,
                detail="Cannot create a stream from our own stream URL"
            )
            
        # Properly handle RTSP URLs with special characters in credentials
        # Especially with @ symbols in username or password
        encoded_url = rtsp_url
        
        try:
            # Try to parse the URL using urllib to handle encoding properly
            parsed = urllib.parse.urlparse(rtsp_url)
            
            # Check if it has credentials that need encoding
            if '@' in parsed.netloc:
                logger.info("URL contains authentication, checking if encoding is needed")
                
                netloc_parts = parsed.netloc.split('@')
                if len(netloc_parts) > 1:
                    # Extract credentials and host parts
                    auth = netloc_parts[0]
                    host = '@'.join(netloc_parts[1:])  # In case host contains @ symbols
                    
                    # Further split auth into username and password
                    if ':' in auth:
                        username, password = auth.split(':', 1)  # Split only on first : in case password contains :
                        
                        # Check if username or password contains special chars
                        if ('@' in password) or ('%' not in password and 
                                               any(c in password for c in [' ', '?', '&', '=', '#', '+'])):
                            logger.info("URL contains authentication with special characters, properly encoding it")
                            # Encode username and password
                            encoded_username = urllib.parse.quote(username, safe='')
                            encoded_password = urllib.parse.quote(password, safe='')
                            
                            # Reassemble the URL with encoded credentials
                            new_netloc = f"{encoded_username}:{encoded_password}@{host}"
                            encoded_parsed = parsed._replace(netloc=new_netloc)
                            encoded_url = urllib.parse.urlunparse(encoded_parsed)
                            
                            logger.info(f"Successfully encoded URL with special characters")
        except Exception as e:
            logger.warning(f"Error during URL parsing/encoding, using original URL: {e}")
    
        # Generate unique stream ID
        stream_id = str(uuid.uuid4())
        
        # Create stream directory
        stream_dir = os.path.join(TRANSCODE_DIR, f"stream_{stream_id}")
        os.makedirs(stream_dir, exist_ok=True)
        
        # Set output paths - Always use index.m3u8 for HLS
        output_path = os.path.join(stream_dir, "index.m3u8")
        
        # Create status file
        status_path = os.path.join(stream_dir, "status.json")
        
        # Update status
        transcode_jobs[stream_id] = {
            "status": "processing",
            "input_url": rtsp_url,  # Store original URL for reference
            "output_file": output_path,
            "format": "hls",
            "created_at": time.time()
        }
        
        with open(status_path, "w") as f:
            json.dump({
                "status": "processing",
                "progress": 0
            }, f)
        
        # Start streaming in background
        backgroundTasks.add_task(
            process_stream, stream_id, encoded_url, output_path, "hls", browser_compatibility
        )
        
        # Construct the public URL for the stream - using relative URL
        stream_url_path = f"/transcode/stream/{stream_id}/index.m3u8"
        
        logger.info(f"Stream job created: {stream_id}, URL: {stream_url_path}")
        
        return {
            "stream_id": stream_id, 
            "status": "processing",
            "hls_url": stream_url_path
        }
    
    except Exception as e:
        logger.exception(f"Error creating HLS stream: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error creating HLS stream: {str(e)}"
        )

@router.post("/transcode/stream", status_code=202)
async def create_stream(
    backgroundTasks: BackgroundTasks,
    request: Request,
    stream_url: str = Form(...),
    output_format: str = Form("hls"),
    stream_name: str = Form(None),
    browser_compatibility: str = Form("high")
):
    """
    Create a streaming endpoint from an RTSP or other stream URL
    """
    # Log the incoming request for debugging
    logger.info(f"Received stream request with URL: {stream_url}, format: {output_format}")
    
    try:
        # Check if the URL is already pointing to our own stream
        internal_stream_pattern = re.compile(r'/transcode/stream/[a-f0-9-]+/index\.m3u8')
        if internal_stream_pattern.search(stream_url):
            raise HTTPException(
                status_code=400,
                detail="Cannot create a stream from our own stream URL"
            )
            
        # Properly handle RTSP URLs with special characters in credentials
        # Especially with @ symbols in username or password
        encoded_url = stream_url
        
        try:
            # Try to parse the URL using urllib to handle encoding properly
            parsed = urllib.parse.urlparse(stream_url)
            
            # Check if it has credentials that need encoding
            if '@' in parsed.netloc:
                logger.info("URL contains authentication, checking if encoding is needed")
                
                netloc_parts = parsed.netloc.split('@')
                if len(netloc_parts) > 1:
                    # Extract credentials and host parts
                    auth = netloc_parts[0]
                    host = '@'.join(netloc_parts[1:])  # In case host contains @ symbols
                    
                    # Further split auth into username and password
                    if ':' in auth:
                        username, password = auth.split(':', 1)  # Split only on first : in case password contains :
                        
                        # Check if username or password contains special chars
                        if ('@' in password) or ('%' not in password and 
                                               any(c in password for c in [' ', '?', '&', '=', '#', '+'])):
                            logger.info("URL contains authentication with special characters, properly encoding it")
                            # Encode username and password
                            encoded_username = urllib.parse.quote(username, safe='')
                            encoded_password = urllib.parse.quote(password, safe='')
                            
                            # Reassemble the URL with encoded credentials
                            new_netloc = f"{encoded_username}:{encoded_password}@{host}"
                            encoded_parsed = parsed._replace(netloc=new_netloc)
                            encoded_url = urllib.parse.urlunparse(encoded_parsed)
                            
                            logger.info(f"Successfully encoded URL with special characters")
        except Exception as e:
            logger.warning(f"Error during URL parsing/encoding, using original URL: {e}")
    
        # Generate unique stream ID
        stream_id = str(uuid.uuid4())
        
        # Create stream directory
        stream_dir = os.path.join(TRANSCODE_DIR, f"stream_{stream_id}")
        os.makedirs(stream_dir, exist_ok=True)
        
        # Set output paths - Always use index.m3u8 for HLS
        output_path = os.path.join(stream_dir, "index.m3u8")
        
        # Create status file
        status_path = os.path.join(stream_dir, "status.json")
        
        # Update status
        transcode_jobs[stream_id] = {
            "status": "processing",
            "input_url": stream_url,  # Store original URL for reference
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
            process_stream, stream_id, encoded_url, output_path, output_format, browser_compatibility
        )
        
        # Construct the public URL for the stream - using relative URL
        stream_url_path = f"/transcode/stream/{stream_id}/index.m3u8"
        
        logger.info(f"Stream job created: {stream_id}, URL: {stream_url_path}")
        
        return {
            "stream_id": stream_id, 
            "status": "processing",
            "stream_url": stream_url_path
        }
    
    except Exception as e:
        logger.exception(f"Error creating stream: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error creating stream: {str(e)}"
        )

def process_stream(stream_id, input_url, output_path, output_format, browser_compatibility="high"):
    """Background task for processing stream"""
    status_path = os.path.join(os.path.dirname(output_path), "status.json")
    stream_dir = os.path.dirname(output_path)
    
    try:
        # Update status file to indicate we're starting
        with open(status_path, "w") as f:
            json.dump({
                "status": "starting",
                "progress": 0
            }, f)
        
        # Build FFmpeg command for HLS streaming with unique filenames
        # Add timestamp to segment names to avoid collisions
        timestamp = int(time.time())
        segment_pattern = f"segment_{timestamp}_%d.ts"
        
        if output_format == "hls":
            # IMPROVED SETTINGS: Use older-version compatible flags and options
            # REMOVED movflags option that was causing errors
            cmd = [
                ffmpeg_binary_path,
                # FFmpeg input options
                "-rtsp_transport", "tcp",           # Use TCP for more stable connections
                "-analyzeduration", "100000000",    # 100 seconds (increased from 20s)
                "-probesize", "100000000",          # 100MB (increased from 20MB)
                "-reorder_queue_size", "100",       # Buffer more packets for reordering
                "-stimeout", "10000000",            # 10 second timeout (microseconds)
                "-fflags", "+genpts+discardcorrupt",# Generate timestamps, discard corrupt
                "-i", input_url,                    # Input stream URL
                
                # Video codec settings - FIXED to remove incompatible options
                "-c:v", "libx264",                  # H.264 video codec
                "-preset", "ultrafast",             # Fastest encoding
                "-tune", "zerolatency",             # Optimize for low latency
                "-profile:v", "baseline",           # Use baseline profile for compatibility
                "-level", "3.0",                    # Compatible level
                "-pix_fmt", "yuv420p",              # Standard pixel format for compatibility
                "-r", "15",                         # Force 15fps to reduce bandwidth
                "-g", "30",                         # GOP size (2 seconds)
                "-keyint_min", "15",                # Minimum GOP size
                "-sc_threshold", "0",               # Disable scene detection
                "-bufsize", "5000k",                # Video buffer size
                "-maxrate", "5000k",                # Maximum bitrate
                
                # Audio codec settings (if audio exists)
                "-c:a", "aac",                      # AAC audio codec
                "-ar", "44100",                     # Audio sample rate
                "-b:a", "64k",                      # Audio bitrate
                
                # HLS specific settings - IMPROVED
                "-f", "hls",                        # HLS format
                "-hls_time", "2",                   # Segment duration
                "-hls_list_size", "10",             # Number of segments to keep in playlist
                "-hls_flags", "delete_segments+append_list+discont_start",  # HLS flags
                "-hls_segment_type", "mpegts",      # Use MPEG-TS format for segments
                "-hls_segment_filename", os.path.join(stream_dir, segment_pattern),  # Use unique segment names
                
                # Error handling and recovery options - IMPROVED
                "-max_muxing_queue_size", "9999",   # Increase queue size
                "-err_detect", "ignore_err",        # Ignore errors
                "-reconnect", "1",                  # Enable reconnections
                "-reconnect_at_eof", "1",
                "-reconnect_streamed", "1",
                "-reconnect_delay_max", "30",       # Max 30 seconds between reconnect attempts
                
                # Output path
                output_path
            ]
            
            # For high browser compatibility, add more conservative settings
            # NOTE: Removed movflags which caused the error in older FFmpeg versions
            if browser_compatibility == "high":
                # Insert these options right after the output codec selection
                cmd[11:11] = [
                    "-vsync", "1",                  # Video sync method - keep this but remove movflags
                ]
        else:
            # For formats other than HLS
            cmd = [
                ffmpeg_binary_path,
                "-analyzeduration", "100000000",    # IMPROVED: 100 seconds
                "-probesize", "100000000",          # IMPROVED: 100MB
                "-rtsp_transport", "tcp",
                "-stimeout", "10000000",
                "-i", input_url,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-tune", "zerolatency",
                "-c:a", "aac",
                "-ar", "44100",
                "-f", output_format,
                "-reconnect", "1",
                "-reconnect_at_eof", "1",
                "-reconnect_streamed", "1",
                "-reconnect_delay_max", "30",
                output_path
            ]
        
        logger.info(f"Running FFmpeg stream command: {' '.join(cmd)}")
        
        # Create a dummy index.m3u8 file to avoid 404 errors while FFmpeg is starting
        with open(output_path, "w") as f:
            f.write("""#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-DISCONTINUITY
#EXT-X-PLAYLIST-TYPE:EVENT
#EXTINF:2.000000,
#EXT-X-DISCONTINUITY
#EXT-X-ENDLIST""")
        
        # Update status to indicate we're about to start FFmpeg
        with open(status_path, "w") as f:
            json.dump({
                "status": "launching",
                "progress": 0
            }, f)
        
        # Run FFmpeg with non-blocking IO
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            # Make process part of a new process group to handle signals properly
            start_new_session=True
        )
        
        # Store process reference for potential termination
        active_processes[stream_id] = process
        
        # Update status to streaming once FFmpeg is running
        with open(status_path, "w") as f:
            json.dump({
                "status": "streaming",
                "progress": 100,
                "pid": process.pid
            }, f)
            
        # KEY CHANGE: Wait a specific amount of time to let FFmpeg generate the first segments
        # This ensures the m3u8 file is properly created before clients try to access it
        logger.info(f"Waiting for initial HLS segments to be generated for stream {stream_id}...")
        time.sleep(3)
        
        # Check if any segments were actually created
        segment_count = len(list(Path(stream_dir).glob("segment_*.ts")))
        if segment_count == 0:
            logger.warning(f"No segments were created after startup delay for stream {stream_id}")
            # Update status to indicate potential issues
            with open(status_path, "w") as f:
                json.dump({
                    "status": "warning",
                    "progress": 100,
                    "pid": process.pid,
                    "message": "Stream started but no segments created yet"
                }, f)
        else:
            logger.info(f"Successfully created {segment_count} initial segments for stream {stream_id}")
            # Update status to confirm segments are available
            with open(status_path, "w") as f:
                json.dump({
                    "status": "streaming",
                    "progress": 100,
                    "pid": process.pid,
                    "segments": segment_count
                }, f)
        
        # Wait for completion or error
        stdout, stderr = process.communicate()
        
        # Remove process from active processes safely
        active_processes.pop(stream_id, None)
        
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
        # Clean up process reference if it exists
        active_processes.pop(stream_id, None)

@router.delete("/transcode/stream/{stream_id}", status_code=202)
async def stop_stream(stream_id: str):
    """
    Stop an active stream
    """
    stream_dir = os.path.join(TRANSCODE_DIR, f"stream_{stream_id}")
    status_path = os.path.join(stream_dir, "status.json")
    
    if not os.path.exists(status_path):
        raise HTTPException(status_code=404, detail="Stream not found")
    
    try:
        # Check if we have an active process for this stream
        if stream_id in active_processes:
            process = active_processes[stream_id]
            
            # Terminate the process if it's still running
            if process and process.poll() is None:
                logger.info(f"Terminating FFmpeg process for stream {stream_id}")
                process.terminate()
                
                try:
                    # Wait for termination
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    # Force kill if not responding to terminate
                    logger.warning(f"FFmpeg process for stream {stream_id} not responding to SIGTERM, sending SIGKILL")
                    process.kill()
                
                # Remove from active processes (safely)
                active_processes.pop(stream_id, None)
            
            # Update status file
            with open(status_path, "w") as f:
                json.dump({
                    "status": "stopped",
                    "message": "Stream manually stopped"
                }, f)
            
            return {"status": "stopped", "stream_id": stream_id}
        else:
            # Process might have already completed - this is not an error case
            logger.info(f"No active FFmpeg process found for stream {stream_id}")
            
            # Update status file anyway
            with open(status_path, "w") as f:
                json.dump({
                    "status": "stopped",
                    "message": "Stream already stopped or completed"
                }, f)
            
            return {"status": "stopped", "stream_id": stream_id}
    
    except Exception as e:
        logger.exception(f"Error stopping stream {stream_id}")
        # Make this more robust by safely removing the process reference
        active_processes.pop(stream_id, None)
        
        # We'll still return a 202 status but include the error in the response
        return {
            "status": "error",
            "stream_id": stream_id, 
            "message": f"Error while stopping stream: {str(e)}"
        }

@router.get("/transcode/stream/{stream_id}/{file_name}")
async def get_stream_file(stream_id: str, file_name: str):
    """
    Serve HLS stream files
    """
    logger.info(f"Requested stream file: {stream_id}/{file_name}")
    
    stream_dir = os.path.join(TRANSCODE_DIR, f"stream_{stream_id}")
    file_path = os.path.join(stream_dir, file_name)
    
    # First check for the status file 
    status_path = os.path.join(stream_dir, "status.json")
    if os.path.exists(status_path):
        with open(status_path, "r") as f:
            try:
                status = json.load(f)
                # If stream is in starting or launching state, return a wait message
                if status.get("status") in ["starting", "launching"] and file_name == "index.m3u8":
                    # Return a minimal HLS playlist that indicates stream is starting
                    wait_playlist = """#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-DISCONTINUITY
#EXT-X-PLAYLIST-TYPE:EVENT
#EXTINF:10.0,
#EXT-X-DISCONTINUITY
#EXT-X-ENDLIST"""
                    return Response(
                        content=wait_playlist,
                        media_type="application/vnd.apple.mpegurl"
                    )
            except json.JSONDecodeError:
                pass
    
    # Check if file exists
    if not os.path.exists(file_path):
        if file_name.endswith(".ts"):
            logger.warning(f"Stream segment not found: {file_path}, returning 404")
            raise HTTPException(status_code=404, detail="Stream segment not found")
        elif file_name == "index.m3u8":
            # For the main playlist, if it doesn't exist, check if the stream is still initializing
            if os.path.exists(stream_dir) and os.path.exists(status_path):
                try:
                    with open(status_path, "r") as f:
                        status = json.load(f)
                    if status.get("status") in ["processing", "starting", "launching"]:
                        # Return a temporary playlist that indicates stream is starting
                        wait_playlist = """#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-DISCONTINUITY
#EXT-X-PLAYLIST-TYPE:EVENT
#EXTINF:10.0,
#EXT-X-DISCONTINUITY
#EXT-X-ENDLIST"""
                        return Response(
                            content=wait_playlist,
                            media_type="application/vnd.apple.mpegurl"
                        )
                except Exception as e:
                    logger.error(f"Error reading status file: {e}")
            
            logger.error(f"Stream index file not found: {file_path}")
            raise HTTPException(status_code=404, detail="Stream file not found")
    
    # Determine content type
    content_type = "application/vnd.apple.mpegurl"
    if file_name.endswith(".ts"):
        content_type = "video/mp2t"
    
    # Return the file content
    return StreamingResponse(
        open(file_path, "rb"),
        media_type=content_type
    )

@router.post("/transcode")
async def transcode_video(file: UploadFile = File(...)):
    """
    Transcode a video file to browser-compatible format
    """
    # Generate a unique job ID
    job_id = str(uuid.uuid4())
    job_dir = os.path.join(TRANSCODE_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    
    # Save uploaded file
    file_path = os.path.join(job_dir, f"input{os.path.splitext(file.filename)[1]}")
    
    try:
        # Save the uploaded file
        logger.info(f"Saving uploaded file to {file_path}")
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Set output path
        output_path = os.path.join(job_dir, f"output.mp4")
        
        # Create status file
        status_path = os.path.join(job_dir, "status.json")
        with open(status_path, "w") as f:
            json.dump({
                "status": "processing",
                "progress": 0
            }, f)
        
        # Update job status
        transcode_jobs[job_id] = {
            "status": "processing",
            "input_file": file_path,
            "output_file": output_path,
            "created_at": time.time()
        }
        
        # Build FFmpeg command for transcoding to browser-compatible MP4
        # For older FFmpeg versions (< 4.4), don't use movflags
        supports_movflags = os.environ.get("FFMPEG_SUPPORTS_MOVFLAGS", "0") == "1"
        
        if supports_movflags:
            cmd = [
                ffmpeg_binary_path,
                "-i", file_path,
                "-c:v", "libx264",
                "-preset", "fast",
                "-profile:v", "baseline",
                "-level", "3.0",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
                "-y",
                output_path
            ]
        else:
            cmd = [
                ffmpeg_binary_path,
                "-i", file_path,
                "-c:v", "libx264",
                "-preset", "fast",
                "-profile:v", "baseline",
                "-level", "3.0",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "128k",
                "-y",
                output_path
            ]
        
        logger.info(f"Running FFmpeg transcode command: {' '.join(cmd)}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        
        stdout, stderr = process.communicate()
        
        if process.returncode == 0:
            logger.info(f"Transcoding completed successfully for job {job_id}")
            # Update status
            with open(status_path, "w") as f:
                json.dump({
                    "status": "completed",
                    "progress": 100
                }, f)
            
            transcode_jobs[job_id]["status"] = "completed"
            
            # Return success with output URL
            output_url = f"/transcode/{job_id}/download"
            return {"status": "completed", "output_url": output_url}
        else:
            logger.error(f"Transcoding failed for job {job_id}: {stderr}")
            with open(status_path, "w") as f:
                json.dump({
                    "status": "failed",
                    "error": stderr
                }, f)
            
            transcode_jobs[job_id]["status"] = "failed"
            
            # Return error
            raise HTTPException(status_code=500, detail=f"Transcoding failed: {stderr}")
    
    except Exception as e:
        logger.exception(f"Error during transcoding job {job_id}")
        # Update status
        status_path = os.path.join(job_dir, "status.json")
        with open(status_path, "w") as f:
            json.dump({
                "status": "failed",
                "error": str(e)
            }, f)
        
        raise HTTPException(status_code=500, detail=f"Error during transcoding: {str(e)}")

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
