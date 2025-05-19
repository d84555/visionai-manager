
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import logging
from app.routers import inference, models, websocket, health, transcode, events
import traceback

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

# Set models directory from environment variable or use absolute path for better reliability
models_dir = os.environ.get("MODELS_DIR")
if not models_dir:
    # Use an absolute path if environment variable is not set
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    models_dir = os.path.join(base_dir, "models")
    
# Ensure the models directory exists
os.makedirs(models_dir, exist_ok=True)
os.environ["MODELS_DIR"] = models_dir
logger.info(f"Using models directory: {models_dir}")

# Log current directory and verify models directory exists
logger.info(f"Current working directory: {os.getcwd()}")
logger.info(f"Models directory exists: {os.path.exists(models_dir)}")
logger.info(f"Models directory is absolute: {os.path.isabs(models_dir)}")

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

# Include routers - IMPORTANT: Do not add prefixes to transcode router
app.include_router(inference.router)
app.include_router(models.router, prefix="/models")  # Updated with explicit prefix
app.include_router(websocket.router)
app.include_router(health.router)
app.include_router(transcode.router)  # No prefix, will use routes directly as defined in router
app.include_router(events.router, prefix="/events")  # Add new events router

@app.get("/")
async def root():
    return {"message": "Vision AI API is running. Go to /docs for API documentation."}

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception handler: {exc}", exc_info=True)
    # Make sure we return a JSON response even for errors
    return JSONResponse(
        status_code=500,
        content={
            "message": f"An unexpected error occurred: {str(exc)}",
            "path": request.url.path,
            "method": request.method
        }
    )

# Add a middleware to ensure all responses have Content-Type set to application/json
@app.middleware("http")
async def ensure_json_content_type(request: Request, call_next):
    try:
        # Process the request
        response = await call_next(request)
        
        # Check if this is an API request (not static files, etc.)
        if request.url.path.startswith("/api/"):
            # Set the Content-Type header to application/json
            response.headers["Content-Type"] = "application/json"
            
        return response
    except Exception as e:
        logger.error(f"Error in middleware: {str(e)}")
        logger.error(traceback.format_exc())
        
        # Return a JSON response even for errors
        return JSONResponse(
            status_code=500,
            content={"message": f"An unexpected error occurred: {str(e)}"}
        )
