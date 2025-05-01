
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import logging
from app.routers import websocket, health, inference, models

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
ffmpeg_binary_path = os.environ.get("FFMPEG_BINARY_PATH", "ffmpeg")
os.environ["FFMPEG_BINARY_PATH"] = ffmpeg_binary_path
logger.info(f"Using FFmpeg binary path: {ffmpeg_binary_path}")

# Include routers - make sure models router is included first for proper endpoint resolution
app.include_router(models.router)    # Must be first to handle /models/upload route
app.include_router(websocket.router)
app.include_router(health.router)
app.include_router(inference.router)

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
