
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import sys
import time
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Import routers
from app.routers import models, inference, websocket

# Create thread pool for concurrent processing
# Adjust max_workers based on CPU cores and available memory
inference_executor = ThreadPoolExecutor(max_workers=4)

# Create FastAPI app
app = FastAPI(
    title="VisionAI Edge API",
    description="API for Edge Computing and Vision AI Model Management",
    version="1.0.0",
)

# Add CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Make executor available to routes
app.state.inference_executor = inference_executor

# Include routers
app.include_router(models.router)
app.include_router(inference.router)
app.include_router(websocket.router)

# Root endpoint
@app.get("/", tags=["status"])
async def root():
    return {
        "status": "online",
        "version": "1.0.0",
        "uptime": time.time(),
        "endpoints": [
            "/models - Model management",
            "/inference - Vision inference",
            "/ws - WebSocket API for real-time inference",
        ]
    }

# Health check endpoint
@app.get("/health", tags=["status"])
async def health():
    return {"status": "healthy"}

# Debug endpoint to list available routes
@app.get("/routes", tags=["status"])
async def list_routes():
    routes = []
    for route in app.routes:
        routes.append({
            "path": route.path,
            "name": route.name,
            "methods": list(route.methods) if hasattr(route, "methods") else None
        })
    return {"routes": routes}

# System info endpoint
@app.get("/system/info", tags=["status"])
async def system_info():
    import platform
    import psutil
    import torch
    
    system_data = {
        "os": platform.system(),
        "platform": platform.platform(),
        "cpu_cores": psutil.cpu_count(logical=True),
        "physical_cores": psutil.cpu_count(logical=False),
        "memory_total": psutil.virtual_memory().total,
        "memory_available": psutil.virtual_memory().available,
        "gpu_info": {}
    }
    
    # Add GPU info if available
    try:
        if torch.cuda.is_available():
            system_data["gpu_info"] = {
                "gpu_name": torch.cuda.get_device_name(0),
                "gpu_count": torch.cuda.device_count(),
                "cuda_version": torch.version.cuda,
                "fp16_supported": torch.cuda.get_device_capability()[0] >= 7,
                "memory_allocated": torch.cuda.memory_allocated(0),
                "memory_reserved": torch.cuda.memory_reserved(0),
                "max_memory": torch.cuda.get_device_properties(0).total_memory
            }
    except Exception as e:
        system_data["gpu_info"]["error"] = str(e)
    
    return system_data

# If running as a script, start Uvicorn server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

@app.on_event("shutdown")
async def shutdown_event():
    # Clean up resources
    inference_executor.shutdown(wait=True)
