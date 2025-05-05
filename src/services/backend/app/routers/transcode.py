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
from typing import Optional, List, Dict, Any
import glob  # Add glob import for better file checking

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

# Check for GStreamer installation
try:
    # Import GStreamer Python bindings
    import gi
    gi.require_version('Gst', '1.0')
    from gi.repository import Gst, GLib
    gstreamer_available = True
    logger.info("GStreamer Python bindings available")
except (ImportError, ValueError):
    gstreamer_available = False
    logger.warning("GStreamer Python bindings not available, falling back to command-line approach")

# Try to find gst-launch-1.0 binary
gst_launch_path = os.environ.get("GSTREAMER_PATH", None)
if not gst_launch_path or not os.path.exists(gst_launch_path):
    for path in ["/usr/bin/gst-launch-1.0", "/usr/local/bin/gst-launch-1.0", "/opt/homebrew/bin/gst-launch-1.0"]:
        if os.path.exists(path):
            gst_launch_path = path
            logger.info(f"Found gst-launch-1.0 at: {gst_launch_path}")
            break

if not gst_launch_path:
    logger.warning("gst-launch-1.0 binary not found, will attempt to use 'gst-launch-1.0' from PATH")
    gst_launch_path = "gst-launch-1.0"

# Create temp directory for transcoding jobs
TRANSCODE_DIR = os.path.join(tempfile.gettempdir(), "transcode_jobs")
os.makedirs(TRANSCODE_DIR, exist_ok=True)
logger.info(f"Using transcode directory: {TRANSCODE_DIR}")

# Keep track of transcoding jobs
transcode_jobs = {}

# Initialize GStreamer if available
if gstreamer_available:
    try:
        Gst.init(None)
        logger.info("GStreamer initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize GStreamer: {e}")
        gstreamer_available = False

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
    job_id = str(uuid.uuid4())
    input_path = os.path.join(TRANSCODE_DIR, f"input_{job_id}_{file.filename}")
    output_path = os.path.join(TRANSCODE_DIR, f"output_{job_id}.{outputFormat}")
    
    try:
        # Save the uploaded file
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        
        # Start transcoding in the background
        backgroundTasks.add_task(
            transcode_file, job_id, input_path, output_path, outputFormat, quality, preset
        )
        
        # Update job status
        transcode_jobs[job_id] = {"status": "processing", "input_file": file.filename, "output_file": f"output_{job_id}.{outputFormat}"}
        
        return {"job_id": job_id, "status": "processing"}
    except Exception as e:
        logger.error(f"Error during file upload and transcoding: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await file.close()

def transcode_file(job_id, input_path, output_path, output_format, quality, preset):
    """Background task for transcoding video"""
    try:
        # Construct FFmpeg command
        cmd = [
            ffmpeg_binary_path,
            "-y",  # Overwrite output file if it exists
            "-i", input_path,
            "-c:v", "libx264",  # Video codec
            "-preset", preset,  # Preset (affects speed and quality)
            "-crf", "23",  # Constant Rate Factor (adjust for quality)
            "-c:a", "aac",  # Audio codec
            "-strict", "experimental",  # Allow experimental AAC encoder
            output_path
        ]
        
        logger.info(f"Starting FFmpeg process: {' '.join(cmd)}")
        
        # Execute FFmpeg command
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        logger.info(f"FFmpeg process completed successfully for job {job_id}")
        transcode_jobs[job_id]["status"] = "completed"
        
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg process failed with error: {e.stderr}")
        transcode_jobs[job_id]["status"] = "failed"
        transcode_jobs[job_id]["error"] = e.stderr
    except Exception as e:
        logger.error(f"An unexpected error occurred during transcoding: {e}")
        transcode_jobs[job_id]["status"] = "failed"
        transcode_jobs[job_id]["error"] = str(e)

@router.get("/transcode/{job_id}/status")
async def get_job_status(job_id: str):
    """
    Get the status of a transcoding job
    """
    if job_id not in transcode_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return transcode_jobs[job_id]

@router.get("/transcode/{job_id}/download")
async def download_transcoded_file(job_id: str):
    """
    Download the transcoded file
    """
    if job_id not in transcode_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = transcode_jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job not completed")
    
    output_path = os.path.join(TRANSCODE_DIR, job["output_file"])
    
    if not os.path.exists(output_path):
        raise HTTPException(status_code=500, detail="Transcoded file not found")
    
    def file_iterator(file_path):
        with open(file_path, "rb") as f:
            yield from f
    
    return StreamingResponse(file_iterator(output_path), media_type="video/mp4", 
                                 headers={"Content-Disposition": f"attachment;filename={job['output_file']}"})

async def wait_for_hls_files(stream_dir: str, max_wait_time: int = 20) -> bool:
    """
    Wait for HLS files to be created before returning success
    Checks for any of: index.m3u8, index.m3u8.tmp, or any .ts segment files
    Returns True if any of these files were created within the timeout period
    """
    start_time = time.time()
    
    logger.info(f"Waiting for HLS files in {stream_dir}")
    
    # Log initial directory state
    try:
        initial_files = os.listdir(stream_dir)
        logger.info(f"Initial directory contents: {initial_files}")
    except Exception as e:
        logger.error(f"Error listing directory contents: {e}")
    
    check_count = 0
    while time.time() - start_time < max_wait_time:
        check_count += 1
        
        # Every few checks, log directory contents to help troubleshoot
        if check_count % 3 == 0:
            try:
                current_files = os.listdir(stream_dir)
                logger.info(f"Current directory contents after {int(time.time() - start_time)}s: {current_files}")
            except Exception as e:
                logger.error(f"Error listing directory contents: {e}")
        
        # Check for any .ts segments first (most reliable indicator)
        ts_segments = list(Path(stream_dir).glob("*.ts"))
        if ts_segments:
            logger.info(f"✅ HLS segment files created: {[s.name for s in ts_segments[:3]]}...")
            
            # If we have segments but no m3u8, generate one on-the-fly
            index_file = os.path.join(stream_dir, "index.m3u8")
            if not os.path.exists(index_file) and len(ts_segments) > 0:
                logger.info("Found segments but no playlist - generating temporary m3u8 file")
                try:
                    # Create a basic HLS playlist with the segments we have
                    segments = sorted([s.name for s in ts_segments])
                    with open(index_file, "w") as f:
                        f.write("#EXTM3U\n")
                        f.write("#EXT-X-VERSION:3\n")
                        f.write("#EXT-X-TARGETDURATION:2\n")
                        f.write("#EXT-X-MEDIA-SEQUENCE:0\n")
                        for segment in segments:
                            f.write("#EXTINF:2.0,\n")
                            f.write(f"{segment}\n")
                    logger.info(f"✅ Generated temporary m3u8 file with {len(segments)} segments")
                except Exception as e:
                    logger.error(f"Error generating temporary m3u8 file: {e}")
            
            return True
        
        # Check for .m3u8 file
        index_file = os.path.join(stream_dir, "index.m3u8")
        if os.path.exists(index_file):
            logger.info(f"✅ HLS index file created at {index_file}")
            return True
        
        # Check for .m3u8.tmp file
        tmp_index_file = os.path.join(stream_dir, "index.m3u8.tmp")
        if os.path.exists(tmp_index_file):
            logger.info(f"✅ HLS temporary index file created at {tmp_index_file}")
            # Try to copy .tmp to .m3u8 to help browsers
            try:
                with open(tmp_index_file, "rb") as src, open(index_file, "wb") as dst:
                    dst.write(src.read())
                logger.info("✅ Copied m3u8.tmp to m3u8 to help browser playback")
            except Exception as e:
                logger.error(f"Error copying m3u8.tmp to m3u8: {e}")
            return True
        
        # Short sleep before checking again (using a shorter interval)
        await asyncio.sleep(0.3)
    
    # One final directory listing to debug timeout cases
    try:
        final_files = os.listdir(stream_dir)
        logger.error(f"❌ Timeout waiting for HLS files. Final directory contents: {final_files}")
    except Exception as e:
        logger.error(f"Error listing directory on timeout: {e}")
    
    logger.error(f"❌ Timeout waiting for HLS files in {stream_dir}")
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
    
    # Test write access to the directory
    test_file_path = os.path.join(stream_dir, "write_test.txt")
    try:
        with open(test_file_path, "w") as f:
            f.write("Testing write access")
        os.unlink(test_file_path)
        logger.info(f"Write access test successful for {stream_dir}")
    except Exception as e:
        logger.error(f"Write access test failed for {stream_dir}: {e}")
        raise HTTPException(status_code=500, detail=f"No write access to stream directory: {e}")
    
    # Set output paths - Use index.m3u8 instead of stream.m3u8
    if output_format == "hls":
        output_path = os.path.join(stream_dir, "index.m3u8")
    else:
        output_path = os.path.join(stream_dir, f"stream.{output_format}")
    
    # Create status file
    status_path = os.path.join(stream_dir, "status.json")
    
    # Update status
    transcode_jobs[stream_id] = {
        "status": "initializing",
        "input_url": stream_url,
        "output_file": output_path,
        "format": output_format,
        "created_at": time.time()
    }
    
    with open(status_path, "w") as f:
        json.dump({
            "status": "initializing",
            "progress": 0
        }, f)
    
    # Start streaming process in background based on URL type and available tools
    if stream_url.lower().startswith(("rtsp://", "rtsps://")):
        # Use GStreamer for RTSP streams when available
        if gst_launch_path or gstreamer_available:
            logger.info("Using GStreamer for RTSP stream processing")
            process = await start_gstreamer_stream_process(stream_id, stream_url, output_path, stream_dir)
        else:
            # Fall back to FFmpeg if GStreamer is not available
            logger.info("GStreamer not available, falling back to FFmpeg for RTSP stream")
            process = await start_stream_process(stream_id, stream_url, output_path, output_format)
    else:
        # Use FFmpeg for non-RTSP streams
        logger.info("Using FFmpeg for non-RTSP stream processing")
        process = await start_stream_process(stream_id, stream_url, output_path, output_format)
    
    if process is None:
        raise HTTPException(status_code=500, detail="Failed to start streaming process")
    
    # Construct the public URL for the stream - using relative URL
    stream_url_path = f"/transcode/stream/{stream_id}/index.m3u8"
    
    # Wait for initial HLS files to be created (with timeout)
    logger.info(f"Waiting for initial HLS files for stream {stream_id}...")
    file_creation_successful = await wait_for_hls_files(stream_dir)
    
    # Start background monitoring task
    backgroundTasks.add_task(
        monitor_stream_process, stream_id, process, stream_dir
    )
    
    logger.info(f"Stream job created: {stream_id}, URL: {stream_url_path}, files created: {file_creation_successful}")
    
    # Return immediately with status and URL
    return {
        "stream_id": stream_id, 
        "status": "streaming" if file_creation_successful else "initializing",
        "stream_url": stream_url_path
    }

async def start_gstreamer_stream_process(stream_id: str, input_url: str, output_path: str, stream_dir: str) -> Optional[subprocess.Popen]:
    """Start GStreamer process for RTSP streaming and return process object"""
    try:
        # Get base filename and path
        playlist_location = os.path.join(stream_dir, "index.m3u8")
        segment_location = os.path.join(stream_dir, "segment_%05d.ts")
        
        # Log RTSP URL (with sensitive parts redacted)
        safe_url = input_url
        if '@' in input_url:
            # Redact username and password for logging
            parts = input_url.split('@')
            protocol_auth = parts[0].split('://')
            safe_url = f"{protocol_auth[0]}://***:***@{parts[1]}"
        
        logger.info(f"Starting GStreamer process for RTSP stream: {safe_url} with TCP transport")
        
        # Build GStreamer command line
        if gst_launch_path:
            # Using gst-launch-1.0 CLI (more compatible approach)
            # Updated GStreamer pipeline with TCP protocol explicitly set
            cmd = [
                gst_launch_path,
                "-e",  # Handle EOS gracefully
                "--gst-debug=3",  # Enable more detailed logging
                "rtspsrc",
                f"location={input_url}",
                "protocols=tcp",  # Force TCP transport for RTSP - ADDED THIS LINE
                "latency=0",
                "is-live=true",
                "drop-on-latency=true",
                "buffer-mode=auto",
                "!",
                "rtph264depay",
                "!",
                "h264parse",
                "!",
                "queue",
                "max-size-buffers=4096",
                "!",
                "mpegtsmux",
                "!",
                "hlssink",
                f"playlist-location={playlist_location}",
                f"location={segment_location}",
                "target-duration=1",
                "playlist-length=5",
                "max-files=10", 
                "sync=false"
            ]
            
            # Log the full command for debugging (with sensitive parts redacted)
            cmd_log = list(cmd)
            for i, part in enumerate(cmd_log):
                if input_url in str(part):
                    cmd_log[i] = part.replace(input_url, safe_url)
            
            full_cmd = ' '.join(cmd_log)
            logger.info(f"Starting GStreamer CLI process with command: {full_cmd}")
            
            # Create process with proper environment
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
                bufsize=1,     # Line buffering
                cwd=stream_dir,  # Set working directory to stream folder
            )
            
            # Log the process ID for debugging
            logger.info(f"GStreamer process started with PID: {process.pid}")
            
            # Try alternative pipeline if the first one doesn't produce segments within 5 seconds
            timer = asyncio.create_task(check_for_segments_or_retry(process, stream_id, input_url, stream_dir))
        else:
            # Using GStreamer Python bindings
            logger.info("Using GStreamer Python bindings to create pipeline")
            # Construct the GStreamer pipeline string (for Python bindings) with TCP protocol
            pipeline_str = (
                f'rtspsrc location={input_url} protocols=tcp latency=0 is-live=true drop-on-latency=true ! '  # Added protocols=tcp
                f'rtph264depay ! h264parse ! queue max-size-buffers=4096 ! mpegtsmux ! '
                f'hlssink playlist-location="{playlist_location}" location="{segment_location}" '
                f'target-duration=1 max-files=10 playlist-length=5 sync=false'
            )
            
            # Log the pipeline string (with sensitive parts redacted)
            safe_pipeline = pipeline_str
            if '@' in pipeline_str:
                url_parts = input_url.split('@')
                protocol_auth = url_parts[0].split('://')
                safe_url = f"{protocol_auth[0]}://***:***@{url_parts[1]}"
                safe_pipeline = pipeline_str.replace(input_url, safe_url)
            
            logger.info(f"Creating GStreamer pipeline: {safe_pipeline}")
            
            # Create GStreamer pipeline using Python bindings
            pipeline = Gst.parse_launch(pipeline_str)
            if not pipeline:
                raise Exception("Could not create GStreamer pipeline")
            
            # Start the pipeline
            pipeline.set_state(Gst.State.PLAYING)
            logger.info("GStreamer pipeline started")
            
            # Store the pipeline in the jobs dict for later cleanup
            transcode_jobs[stream_id]["gst_pipeline"] = pipeline
            
            # Create a dummy process object to be compatible with the monitoring code
            class DummyProcess:
                def __init__(self):
                    self.pid = 0
                    self.returncode = None
                
                def poll(self):
                    # Check if pipeline is still running (to be compatible with existing code)
                    state = pipeline.get_state(0)
                    if state[1] == Gst.State.PLAYING:
                        return None  # Still running
                    return 0  # Stopped
            
            process = DummyProcess()
        
        # Update status file
        status_path = os.path.join(stream_dir, "status.json")
        with open(status_path, "w") as f:
            json.dump({
                "status": "streaming",
                "progress": 0,
                "pid": process.pid if hasattr(process, "pid") else 0,
                "command": "GStreamer pipeline" if not gst_launch_path else ' '.join(cmd_log),
                "transport": "TCP"  # Added to indicate we're using TCP transport
            }, f)
        
        # Store process in jobs dictionary
        transcode_jobs[stream_id]["process"] = process
        transcode_jobs[stream_id]["status"] = "streaming"
        transcode_jobs[stream_id]["using_gstreamer"] = True
        
        return process
    except Exception as e:
        logger.exception(f"Error starting GStreamer process for stream {stream_id}")
        status_path = os.path.join(stream_dir, "status.json")
        with open(status_path, "w") as f:
            json.dump({
                "status": "failed",
                "error": str(e)
            }, f)
        return None

async def check_for_segments_or_retry(process, stream_id, input_url, stream_dir, timeout=5):
    """Check for segment files, and if none exist after timeout, try alternative pipeline"""
    try:
        # Wait for a few seconds to see if segments are created
        for i in range(timeout * 2):
            await asyncio.sleep(0.5)
            
            # Check for .ts files
            ts_files = list(Path(stream_dir).glob("*.ts"))
            if ts_files:
                logger.info(f"✅ GStreamer segments created successfully: {[f.name for f in ts_files[:3]]}")
                return
            
            # Check if process is still running
            if process.poll() is not None:
                logger.error("❌ GStreamer process has exited prematurely")
                break
        
        # If we get here, no segments were created and/or process exited
        logger.warning(f"No segments produced after {timeout}s, trying alternative GStreamer pipeline")
        
        # Try to terminate the first process if still running
        if process.poll() is None:
            try:
                process.terminate()
                await asyncio.sleep(1)
                if process.poll() is None:
                    process.kill()
            except Exception as e:
                logger.error(f"Error terminating GStreamer process: {e}")
        
        # Create alternative pipeline with decodebin
        playlist_location = os.path.join(stream_dir, "index.m3u8")
        segment_location = os.path.join(stream_dir, "segment_%05d.ts")
        
        # Redact sensitive parts of URL for logging
        safe_url = input_url
        if '@' in input_url:
            url_parts = input_url.split('@')
            protocol_auth = url_parts[0].split('://')
            safe_url = f"{protocol_auth[0]}://***:***@{url_parts[1]}"
        
        # The alternative pipeline uses decodebin + videoconvert + x264enc to handle more stream types
        # Also explicitly setting protocols=tcp
        cmd = [
            gst_launch_path,
            "-e",
            "--gst-debug=3",
            "rtspsrc", 
            f"location={input_url}", 
            "protocols=tcp",  # Force TCP transport - ADDED THIS LINE
            "latency=0", 
            "is-live=true", 
            "drop-on-latency=true",
            "buffer-mode=auto",
            "!",
            "decodebin",
            "name=dec",
            "dec.",
            "!",
            "queue",
            "!",
            "videoconvert",
            "!",
            "x264enc",
            "tune=zerolatency",
            "speed-preset=ultrafast",
            "!",
            "mpegtsmux",
            "!",
            "hlssink",
            f"playlist-location={playlist_location}",
            f"location={segment_location}",
            "target-duration=1",
            "playlist-length=5",
            "max-files=10",
            "sync=false"
        ]
        
        # Create a safe version of the command for logging
        cmd_log = list(cmd)
        for i, part in enumerate(cmd_log):
            if input_url in str(part):
                cmd_log[i] = part.replace(input_url, safe_url)
                
        logger.info(f"Starting alternative GStreamer pipeline: {' '.join(cmd_log)}")
        
        alt_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            bufsize=1,
            cwd=stream_dir
        )
        
        # Update the process reference in the jobs dictionary
        if stream_id in transcode_jobs:
            transcode_jobs[stream_id]["process"] = alt_process
            transcode_jobs[stream_id]["command"] = ' '.join(cmd_log)
            transcode_jobs[stream_id]["transport"] = "TCP"  # Added to indicate we're using TCP transport
        
        # Update status.json with new command
        status_path = os.path.join(stream_dir, "status.json")
        try:
            with open(status_path, "r") as f:
                status = json.load(f)
            status["command"] = ' '.join(cmd_log)
            status["pid"] = alt_process.pid
            status["transport"] = "TCP"  # Added to indicate we're using TCP transport
            with open(status_path, "w") as f:
                json.dump(status, f)
        except Exception as e:
            logger.error(f"Error updating status file: {e}")
        
        logger.info(f"Alternative GStreamer pipeline started with PID: {alt_process.pid}")
    
    except Exception as e:
        logger.exception(f"Error in check_for_segments_or_retry: {e}")

async def start_stream_process(stream_id: str, input_url: str, output_path: str, output_format: str) -> Optional[subprocess.Popen]:
    """Start FFmpeg process for streaming and return process object"""
    try:
        cmd = [
            ffmpeg_binary_path,
            "-y",  # Overwrite output file if it exists
            "-i", input_url,
            "-c", "copy",  # Copy all streams without re-encoding
            "-f", output_format,  # Output format
            output_path
        ]
        
        logger.info(f"Starting FFmpeg process: {' '.join(cmd)}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        
        transcode_jobs[stream_id]["process"] = process
        transcode_jobs[stream_id]["status"] = "streaming"
        
        return process
    except Exception as e:
        logger.exception(f"Error starting FFmpeg process for stream {stream_id}")
        return None

async def monitor_stream_process(stream_id: str, process: subprocess.Popen, stream_dir: str):
    """Monitor streaming process and handle errors"""
    try:
        # Check if this is a GStreamer pipeline that needs special handling
        is_gstreamer = transcode_jobs.get(stream_id, {}).get("using_gstreamer", False)
        
        # Read stderr in a non-blocking way to monitor the process
        stderr_lines = []
        
        # Check for process health every few seconds
        while process.poll() is None:  # While process is still running
            # Read any available output without blocking
            if hasattr(process, 'stderr') and process.stderr:
                for line in iter(process.stderr.readline, ""):
                    if not line:
                        break
                        
                    stderr_lines.append(line.strip())
                    
                    # Log important FFmpeg/GStreamer messages
                    if "Error" in line or "WARNING" in line:
                        logger.error(f"Stream error for {stream_id}: {line}")
                    elif "Opening" in line or "Stream mapping" in line or "rtspsrc" in line:
                        logger.info(f"Stream info: {line}")
            
            # Read any available stdout for GStreamer debug info
            if hasattr(process, 'stdout') and process.stdout:
                for line in iter(process.stdout.readline, ""):
                    if not line:
                        break
                    
                    if "hlssink" in line:
                        logger.info(f"GStreamer hlssink: {line}")
            
            # Update status file periodically
            status_path = os.path.join(stream_dir, "status.json")
            try:
                # Check if segments are being created
                ts_segments = list(Path(stream_dir).glob("*.ts"))
                segment_count = len(ts_segments)
                
                # Update status.json with segment info and last lines from output
                with open(status_path, "w") as f:
                    json.dump({
                        "status": "streaming",
                        "segmentCount": segment_count,
                        "lastUpdated": time.time(),
                        "lastLines": stderr_lines[-5:] if stderr_lines else [],
                        "engine": "gstreamer" if is_gstreamer else "ffmpeg"
                    }, f)
                
                # If we have segments but no m3u8, generate one
                index_file = os.path.join(stream_dir, "index.m3u8")
                tmp_index_file = os.path.join(stream_dir, "index.m3u8.tmp")
                
                if segment_count > 0 and not os.path.exists(index_file) and not os.path.exists(tmp_index_file):
                    logger.info(f"Found {segment_count} segments but no playlist - generating temporary m3u8")
                    try:
                        # Create a basic HLS playlist with the segments we have
                        segments = sorted([s.name for s in ts_segments])
                        with open(index_file, "w") as f:
                            f.write("#EXTM3U\n")
                            f.write("#EXT-X-VERSION:3\n")
                            f.write("#EXT-X-TARGETDURATION:1\n")
                            f.write("#EXT-X-MEDIA-SEQUENCE:0\n")
                            for segment in segments:
                                f.write("#EXTINF:1.0,\n")
                                f.write(f"{segment}\n")
                        logger.info(f"Generated temporary m3u8 file with {len(segments)} segments")
                    except Exception as e:
                        logger.error(f"Error generating temporary m3u8: {e}")
                
            except Exception as e:
                logger.warning(f"Error updating status file: {e}")
                
            await asyncio.sleep(3)  # Check every 3 seconds
        
        # Process has exited, handle cleanup
        return_code = process.poll()
        
        # Special handling for GStreamer pipelines
        if is_gstreamer and "gst_pipeline" in transcode_jobs.get(stream_id, {}):
            pipeline = transcode_jobs[
