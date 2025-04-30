
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
import asyncio
import json
import uuid
import time
import logging
import os
import sys

# Import routers
from app.routers import models, inference, websocket, health

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("edge-api")

# Create FastAPI app
app = FastAPI(title="Avianet Vision Edge API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(models.router)
app.include_router(inference.router)
app.include_router(health.router)
app.include_router(websocket.router)

@app.get("/")
async def root():
    return {"message": "Welcome to Avianet Vision Edge API"}
