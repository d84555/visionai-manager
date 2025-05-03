
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import logging
import subprocess
from app.routers import inference, models, websocket, health, transcode

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

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
# Try to detect FFmpeg location using 'which' command first
try:
    ffmpeg_binary_path = subprocess.check_output(['which', 'ffmpeg']).decode().strip()
    logger.info(f"FFmpeg detected at: {ffmpeg_binary_path}")
except (subprocess.SubprocessError, FileNotFoundError):
    # If 'which' fails, try common paths
    ffmpeg_binary_path = os.environ.get("FFMPEG_BINARY_PATH", "/usr/bin/ffmpeg")
    common_paths = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg"]
    
    if not os.path.exists(ffmpeg_binary_path):
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

# Test FFmpeg version to identify available options
try:
    version_output = subprocess.check_output([ffmpeg_binary_path, '-version']).decode()
    logger.info(f"FFmpeg version info: {version_output.splitlines()[0]}")
    
    # Check if version supports movflags (requires FFmpeg 4.4+)
    version_line = version_output.splitlines()[0]
    supports_movflags = True  # Default assumption
    
    if "ffmpeg version" in version_line:
        try:
            version_str = version_line.split('ffmpeg version')[1].strip().split(' ')[0]
            major_version = int(version_str.split('.')[0])
            if major_version < 4:
                supports_movflags = False
                logger.warning(f"FFmpeg version {version_str} may not fully support all options")
        except (IndexError, ValueError):
            logger.warning("Could not parse FFmpeg version, proceeding with caution")
    
    os.environ["FFMPEG_SUPPORTS_MOVFLAGS"] = "1" if supports_movflags else "0"
    
except Exception as e:
    logger.error(f"Error testing FFmpeg installation: {e}")
    logger.warning("Transcoding functionality may not work correctly!")
    os.environ["FFMPEG_SUPPORTS_MOVFLAGS"] = "0"  # Assume no support on error

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
