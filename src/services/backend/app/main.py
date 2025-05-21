
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import (
    health, 
    models, 
    inference, 
    transcode, 
    events, 
    websocket,
    database
)

app = FastAPI(title="AVIANET Vision API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Set to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["health"])
app.include_router(models.router, tags=["models"])
app.include_router(inference.router, tags=["inference"])
app.include_router(transcode.router, tags=["transcode"])
app.include_router(events.router, tags=["events"])
app.include_router(websocket.router, tags=["websocket"])
app.include_router(database.router, tags=["database"])  # Add the database router

@app.get("/")
async def root():
    return {
        "message": "AVIANET Vision API",
        "version": "1.0.0",
        "status": "running"
    }
