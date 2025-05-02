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
        
        # Store process reference for potential termination
        active_processes[job_id] = process
        
        # Wait for completion
        stdout, stderr = process.communicate()
        
        # Remove process from active processes
        if job_id in active_processes:
            del active_processes[job_id]
        
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
            process_stream, stream_id, encoded_url, output_path, output_format
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

def process_stream(stream_id, input_url, output_path, output_format):
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
            cmd = [
                ffmpeg_binary_path,
                # FFmpeg input options
                "-analyzeduration", "20000000",     # 20 seconds
                "-probesize", "20000000",           # 20MB 
                "-rtsp_transport", "tcp",           # Use TCP for more stable connections
                "-stimeout", "10000000",            # 10 second timeout (microseconds)
                "-i", input_url,                    # Input stream URL
                
                # Video codec settings
                "-c:v", "libx264",                  # H.264 video codec
                "-preset", "ultrafast",             # Fastest encoding
                "-tune", "zerolatency",             # Optimize for low latency
                "-r", "15",                         # Force 15fps to reduce bandwidth
                "-g", "30",                         # GOP size (2 seconds)
                "-keyint_min", "15",                # Minimum GOP size
                "-sc_threshold", "0",               # Disable scene detection
                
                # Audio codec settings (if audio exists)
                "-c:a", "aac",                      # AAC audio codec
                "-ar", "44100",                     # Audio sample rate
                "-b:a", "64k",                      # Audio bitrate
                
                # HLS specific settings
                "-f", "hls",                        # HLS format
                "-hls_time", "2",                   # Segment duration
                "-hls_list_size", "10",             # Number of segments to keep in playlist
                "-hls_flags", "delete_segments+append_list+discont_start",  # HLS flags
                "-hls_segment_type", "mpegts",      # Use MPEG-TS format for segments
                "-hls_segment_filename", os.path.join(stream_dir, segment_pattern),  # Use unique segment names
                
                # Error handling and recovery options
                "-max_muxing_queue_size", "9999",   # Increase queue size
                "-fflags", "+genpts+discardcorrupt",# Generate timestamps, discard corrupt
                "-err_detect", "ignore_err",        # Ignore errors
                "-reconnect", "1",                  # Enable reconnections
                "-reconnect_at_eof", "1",
                "-reconnect_streamed", "1",
                "-reconnect_delay_max", "30",       # Max 30 seconds between reconnect attempts
                
                # Output path
                output_path
            ]
        else:
            # For formats other than HLS
            cmd = [
                ffmpeg_binary_path,
                "-analyzeduration", "20000000",
                "-probesize", "20000000",
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
        
        # Wait for completion or error
        stdout, stderr = process.communicate()
        
        # Remove process from active processes
        if stream_id in active_processes:
            del active_processes[stream_id]
        
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
            if process.poll() is None:
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
        # We'll still return a 202 status but include the error in the response
        # This avoids the 500 Internal Server Error
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
