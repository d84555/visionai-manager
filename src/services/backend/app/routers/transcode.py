
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
gst_launch_path = None
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
    # ... keep existing code (for FFmpeg-based file transcoding)

@router.get("/transcode/{job_id}/status")
async def get_job_status(job_id: str):
    """
    Get the status of a transcoding job
    """
    # ... keep existing code (job status retrieval)

@router.get("/transcode/{job_id}/download")
async def download_transcoded_file(job_id: str):
    """
    Download the transcoded file
    """
    # ... keep existing code (file download functionality)

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
        
        # Build GStreamer command line
        if gst_launch_path:
            # Using gst-launch-1.0 CLI (more compatible approach)
            cmd = [
                gst_launch_path,
                "-e",  # Handle EOS gracefully
                "rtspsrc",
                f"location={input_url}",
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
                "max-files=10",
                "playlist-length=5",
                "sync=false"
            ]
            
            logger.info(f"Starting GStreamer CLI process with command: {' '.join(cmd)}")
            
            # Create process with proper environment
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
                bufsize=1,     # Line buffering
                cwd=stream_dir,  # Set working directory to stream folder
            )
        else:
            # Using GStreamer Python bindings
            logger.info("Using GStreamer Python bindings to create pipeline")
            # Construct the GStreamer pipeline string (for Python bindings)
            pipeline_str = (
                f'rtspsrc location={input_url} latency=0 is-live=true drop-on-latency=true ! '
                f'rtph264depay ! h264parse ! queue max-size-buffers=4096 ! mpegtsmux ! '
                f'hlssink playlist-location="{playlist_location}" location="{segment_location}" '
                f'target-duration=1 max-files=10 playlist-length=5 sync=false'
            )
            
            logger.info(f"Creating GStreamer pipeline: {pipeline_str}")
            
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
                "command": "GStreamer pipeline" if not gst_launch_path else ' '.join(cmd)
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

async def start_stream_process(stream_id: str, input_url: str, output_path: str, output_format: str) -> Optional[subprocess.Popen]:
    """Start FFmpeg process for streaming and return process object"""
    try:
        # Build FFmpeg command for HLS streaming with improved options
        if output_format == "hls":
            # Enhanced command with parameters for reliable real-time HLS streaming
            cmd = [
                ffmpeg_binary_path,
                # Input options for low latency and RTSP stability
                "-fflags", "nobuffer",
                "-rtsp_transport", "tcp",      # Force TCP for RTSP streams
                "-timeout", "1000000",         # Increase timeout for RTSP
                "-analyzeduration", "1000000", # Reduced from default
                "-probesize", "32768",         # Reduced from default
                "-i", input_url,
                
                # Video encoding options
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-tune", "zerolatency",
                "-force_key_frames", "expr:gte(t,n_forced*1)", # Force keyframes every 1 second
                
                # Audio mapping and encoding (conditionally)
                "-listen", "1",                # Enable HTTP server mode
                "-movflags", "isml+frag_keyframe", # Optimize for low latency
                
                # HLS specific options
                "-f", "hls",
                "-hls_time", "1",               # 1-second segments (reduced from 2s for faster startup)
                "-hls_list_size", "6",          # Keep 6 segments in playlist
                "-hls_flags", "delete_segments+append_list+discont_start+temp_file", # Added temp_file
                "-hls_segment_type", "mpegts",
                "-hls_allow_cache", "0",        # Disable caching
                "-flush_packets", "1",          # Flush packets immediately
                "-method", "PUT",               # Use PUT for writing segments
                
                # Output file paths
                "-hls_segment_filename", f"{os.path.dirname(output_path)}/segment_%03d.ts",
                output_path
            ]
            
            # Check if RTSP URL is likely to have audio (common absence in security cameras)
            if not input_url.lower().startswith("rtsp://") or "audio" in input_url.lower():
                # Only add audio encoding if likely to have audio
                audio_options = [
                    "-c:a", "aac",
                    "-ac", "2",                     # 2 audio channels
                    "-ar", "44100",                 # Audio sample rate
                    "-strict", "experimental"
                ]
                # Insert audio options before the -f hls
                insert_idx = cmd.index("-f")
                cmd[insert_idx:insert_idx] = audio_options
            else:
                # If RTSP without audio indication, add option to disable audio
                cmd.insert(cmd.index("-i") + 2, "-an")
                logger.info("Disabling audio for RTSP stream (likely security camera)")
        else:
            # For other formats (mp4, webm, etc.)
            cmd = [
                ffmpeg_binary_path,
                "-rtsp_transport", "tcp",      # Force TCP for RTSP streams
                "-timeout", "1000000",         # Increase timeout 
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
        
        # Run FFmpeg in non-blocking mode with proper buffering settings and expanded debug logging
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            bufsize=1,     # Line buffering
            cwd=os.path.dirname(output_path),  # Set working directory to stream folder
        )
        
        # Update status file
        status_path = os.path.join(os.path.dirname(output_path), "status.json")
        with open(status_path, "w") as f:
            json.dump({
                "status": "streaming",
                "progress": 0,
                "pid": process.pid,
                "command": ' '.join(cmd)  # Store the command for debugging
            }, f)
        
        # Store process in jobs dictionary
        transcode_jobs[stream_id]["process"] = process
        transcode_jobs[stream_id]["status"] = "streaming"
        transcode_jobs[stream_id]["using_gstreamer"] = False
        
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
                    elif "Opening" in line or "Stream mapping" in line:
                        logger.info(f"Stream info: {line}")
            
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
            pipeline = transcode_jobs[stream_id]["gst_pipeline"]
            if hasattr(pipeline, "set_state"):
                try:
                    pipeline.set_state(Gst.State.NULL)
                    logger.info(f"GStreamer pipeline for stream {stream_id} stopped")
                except Exception as e:
                    logger.error(f"Error stopping GStreamer pipeline: {e}")
        
        # Update status based on return code
        if return_code != 0:
            logger.error(f"Stream process for {stream_id} exited with code {return_code}")
            error_output = "\n".join(stderr_lines[-20:])  # Last 20 lines of stderr
            with open(os.path.join(stream_dir, "status.json"), "w") as f:
                json.dump({
                    "status": "failed",
                    "error": f"Process exited with code {return_code}: {error_output}"
                }, f)
        else:
            logger.info(f"Stream process for {stream_id} completed normally")
            with open(os.path.join(stream_dir, "status.json"), "w") as f:
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
    # ... keep existing code (for serving stream files)

# Cleanup old jobs periodically (could be implemented as a background task)
def cleanup_old_jobs():
    """Clean up old transcoding jobs"""
    # ... keep existing code (for job cleanup)

