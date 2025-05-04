
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
    
    # Start FFmpeg process in background with improved HLS parameters
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
        
        # Check for process health every few seconds
        while process.poll() is None:  # While process is still running
            # Read any available output without blocking
            for line in iter(process.stderr.readline, ""):
                if not line:
                    break
                    
                stderr_lines.append(line.strip())
                
                # Check for specific FFmpeg errors in the output
                if "Error" in line:
                    logger.error(f"FFmpeg error for stream {stream_id}: {line}")
                elif "Opening" in line or "Stream mapping" in line:
                    logger.info(f"FFmpeg stream info: {line}")
            
            # Update status file periodically
            status_path = os.path.join(stream_dir, "status.json")
            try:
                # Check if segments are being created
                ts_segments = list(Path(stream_dir).glob("*.ts"))
                segment_count = len(ts_segments)
                
                # Update status.json with segment info and last lines from FFmpeg
                with open(status_path, "w") as f:
                    json.dump({
                        "status": "streaming",
                        "segmentCount": segment_count,
                        "lastUpdated": time.time(),
                        "lastLines": stderr_lines[-5:] if stderr_lines else []
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
                            f.write("#EXT-X-TARGETDURATION:2\n")
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
            
        # Process has exited, get return code
        return_code = process.poll()
        
        # Update status based on return code
        if return_code != 0:
            logger.error(f"FFmpeg process for stream {stream_id} exited with code {return_code}")
            error_output = "\n".join(stderr_lines[-20:])  # Last 20 lines of stderr
            with open(os.path.join(stream_dir, "status.json"), "w") as f:
                json.dump({
                    "status": "failed",
                    "error": f"FFmpeg exited with code {return_code}: {error_output}"
                }, f)
        else:
            logger.info(f"FFmpeg process for stream {stream_id} completed normally")
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
    logger.debug(f"Requested stream file: {stream_id}/{file_name}")
    
    stream_dir = os.path.join(TRANSCODE_DIR, f"stream_{stream_id}")
    file_path = os.path.join(stream_dir, file_name)
    
    if not os.path.exists(file_path):
        if file_name == "index.m3u8":
            logger.warning(f"Stream file not found: {file_path}")
            
            # Check if temporary m3u8 file exists
            temp_m3u8_path = os.path.join(stream_dir, "index.m3u8.tmp")
            if os.path.exists(temp_m3u8_path):
                logger.info(f"Found temporary m3u8 file: {temp_m3u8_path}")
                # If we have a temporary file, return it instead
                with open(temp_m3u8_path, "rb") as f:
                    content = f.read()
                return Response(
                    content=content,
                    media_type="application/vnd.apple.mpegurl"
                )
            
            # Check if any TS segments exist even if index doesn't yet
            ts_segments = list(Path(stream_dir).glob("*.ts"))
            if ts_segments:
                # We have segments but no playlist - this is a temporary state
                # Generate a simple M3U8 playlist on the fly with the existing segments
                segments = [s.name for s in sorted(ts_segments)]
                
                # Create a basic HLS playlist pointing to existing segments
                playlist_content = "#EXTM3U\n"
                playlist_content += "#EXT-X-VERSION:3\n"
                playlist_content += "#EXT-X-TARGETDURATION:2\n"
                playlist_content += "#EXT-X-MEDIA-SEQUENCE:0\n"
                
                for segment in segments:
                    playlist_content += f"#EXTINF:1.0,\n{segment}\n"
                
                logger.info(f"Generated temporary playlist with {len(segments)} segments")
                
                return Response(
                    content=playlist_content,
                    media_type="application/vnd.apple.mpegurl"
                )
            
            # Check status file
            status_path = os.path.join(stream_dir, "status.json")
            if os.path.exists(status_path):
                with open(status_path, "r") as f:
                    try:
                        status = json.load(f)
                        if status.get("status") in ["processing", "initializing", "streaming"]:
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
