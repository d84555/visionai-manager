
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import health, models
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="AI Vision API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Include routers
app.include_router(health.router)
app.include_router(models.router)

@app.get("/")
async def root():
    """Root endpoint to check if API is running"""
    return {"message": "Welcome to AI Vision API"}

# Log application startup
@app.on_event("startup")
async def startup_event():
    models_dir = os.environ.get("MODELS_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))
    logger.info(f"Starting server with models directory: {models_dir}")
    
    # Create models directory if it doesn't exist
    os.makedirs(models_dir, exist_ok=True)
    logger.info(f"Models directory exists: {os.path.exists(models_dir)}")
    
    # List available models
    if os.path.exists(models_dir):
        model_files = [f for f in os.listdir(models_dir) if os.path.isfile(os.path.join(models_dir, f))]
        logger.info(f"Available models: {model_files}")
