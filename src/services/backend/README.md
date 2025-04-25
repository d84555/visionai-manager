
# VisionAI Backend

This is the backend service for the VisionAI project, providing model management and inference capabilities with GPU acceleration.

## Setup

1. Create a Python virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the server:
```bash
cd src/services/backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Environment Variables

- `MODELS_DIR`: Directory to store model files (default: `/opt/visionai/models`)

## API Documentation

Once the server is running, access the API documentation at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Endpoints

### Model Management
- `POST /api/models/upload` - Upload a model file
- `GET /api/models/list` - List available models
- `DELETE /api/models/{model_id}` - Delete a model
- `POST /api/models/select` - Set active model
- `GET /api/models/active` - Get active model
- `GET /api/models/file-url` - Get URL for model file

### Inference
- `POST /api/inference/detect` - Run object detection on image
- `GET /api/inference/devices` - List available inference devices
- `POST /api/inference/stream` - Process video stream
