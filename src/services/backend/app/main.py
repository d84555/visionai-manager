
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import health, models, websocket, inference
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set default models directory and make it accessible as a global variable
# Do this BEFORE creating the app to ensure routers have access to the environment variable
MODELS_DIR = os.environ.get("MODELS_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))
os.environ["MODELS_DIR"] = MODELS_DIR

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
app.include_router(websocket.router)  # Add the WebSocket router
app.include_router(inference.router)  # Add the inference router

@app.get("/")
async def root():
    """Root endpoint to check if API is running"""
    return {"message": "Welcome to AI Vision API"}

# Log application startup
@app.on_event("startup")
async def startup_event():
    logger.info(f"Starting server with models directory: {MODELS_DIR}")
    
    # Create models directory if it doesn't exist
    os.makedirs(MODELS_DIR, exist_ok=True)
    logger.info(f"Models directory exists: {os.path.exists(MODELS_DIR)}")
    
    # List available models
    if os.path.exists(MODELS_DIR):
        model_files = [f for f in os.listdir(MODELS_DIR) if os.path.isfile(os.path.join(MODELS_DIR, f))]
        logger.info(f"Available models: {model_files}")
