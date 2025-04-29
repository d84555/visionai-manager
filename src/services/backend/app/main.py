
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import sys
import time

# Import routers
from app.routers import models, inference, websocket

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

# If running as a script, start Uvicorn server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
