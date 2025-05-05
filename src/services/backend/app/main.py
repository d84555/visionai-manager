
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import logging
from app.routers import inference, models, websocket, health, transcode

# Configure logging with more detailed configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # Output to standard output/console
    ]
)

# Get logger
logger = logging.getLogger(__name__)

# Increase logging level for GStreamer-related logs
logging.getLogger('gi.repository').setLevel(logging.INFO)

# Create FastAPI app
app = FastAPI(title="Vision AI API", description="Computer Vision AI API for object detection and video analysis")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set models directory from environment variable or use default
models_dir = os.environ.get("MODELS_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))
os.makedirs(models_dir, exist_ok=True)
os.environ["MODELS_DIR"] = models_dir
logger.info(f"Using models directory: {models_dir}")

# Set FFmpeg binary path from environment variable or use default
# Using a more reliable default path that's common on many Linux systems
ffmpeg_binary_path = os.environ.get("FFMPEG_BINARY_PATH", "/usr/bin/ffmpeg")
if not os.path.exists(ffmpeg_binary_path):
    # Try alternate common paths
    common_paths = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg"]
    for path in common_paths:
        if os.path.exists(path):
            ffmpeg_binary_path = path
            logger.info(f"Found FFmpeg at {ffmpeg_binary_path}")
            break
    else:
        logger.warning(f"FFmpeg binary not found at common paths, falling back to system path")
        ffmpeg_binary_path = "ffmpeg"  # Fall back to system path if not found

os.environ["FFMPEG_BINARY_PATH"] = ffmpeg_binary_path
logger.info(f"Using FFmpeg binary path: {ffmpeg_binary_path}")

# Look for GStreamer command line tool
gstreamer_path = os.environ.get("GSTREAMER_PATH", "/usr/bin/gst-launch-1.0")
if not os.path.exists(gstreamer_path):
    # Try alternate common paths
    common_paths = [
        "/usr/bin/gst-launch-1.0", 
        "/usr/local/bin/gst-launch-1.0", 
        "/opt/local/bin/gst-launch-1.0", 
        "/opt/homebrew/bin/gst-launch-1.0"
    ]
    for path in common_paths:
        if os.path.exists(path):
            gstreamer_path = path
            logger.info(f"Found GStreamer at {gstreamer_path}")
            break
    else:
        logger.warning(f"GStreamer binary not found at common paths, will try to use system path")
        gstreamer_path = "gst-launch-1.0"  # Fall back to system path if not found

os.environ["GSTREAMER_PATH"] = gstreamer_path
logger.info(f"Using GStreamer binary path: {gstreamer_path}")

# Include routers - IMPORTANT: Do not add prefixes to transcode router
app.include_router(inference.router)
app.include_router(models.router)    
app.include_router(websocket.router)
app.include_router(health.router)
app.include_router(transcode.router)  # No prefix, will use routes directly as defined in router

@app.get("/")
async def root():
    return {"message": "Vision AI API is running. Go to /docs for API documentation."}

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception handler: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"message": f"An unexpected error occurred: {str(exc)}"}
    )
