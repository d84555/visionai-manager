
// EdgeAIInference.ts
// This service handles communication with edge devices for AI inference

import { toast } from "sonner";
import SettingsService from './SettingsService';

// Types for inference requests and responses
export interface InferenceRequest {
  imageData: string;
  cameraId: string;
  modelName: string;
  modelPath: string;
  thresholdConfidence: number;
}

export interface InferenceResult {
  detections: BackendDetection[];
  processedAt: 'edge' | 'server';
  inferenceTime: number;
}

// Interface for backend detection format (coming from YOLO model)
export interface BackendDetection {
  label: string;
  confidence: number;
  bbox: number[]; // [x1, y1, x2, y2] normalized coordinates
}

// Frontend detection format (used by the UI components)
export interface Detection {
  id: string;
  class: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

class EdgeAIInferenceService {
  private apiBaseUrl = 'http://localhost:8000/api';

  constructor() {
    console.log("Initializing Edge AI Inference service with API server backend");
  }
  
  // Process an inference request
  async performInference(request: InferenceRequest): Promise<InferenceResult> {
    console.info(`Performing inference for camera ${request.cameraId} with model ${request.modelName} (${request.modelPath})`);
    
    try {
      // Check model file extension for proper format detection
      const isOnnxModel = request.modelPath.toLowerCase().endsWith('.onnx');
      if (!isOnnxModel) {
        console.warn(`Model ${request.modelPath} is not an ONNX model. The backend will fallback to simulation.`);
      }
      
      // Extract just the filename from the path to ensure consistent handling
      const modelPath = request.modelPath.split('/').pop() || request.modelPath;
      
      console.log(`Using model filename: ${modelPath}`);
      
      const response = await fetch(`${this.apiBaseUrl}/inference/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelPath: modelPath,
          threshold: request.thresholdConfidence,
          imageData: request.imageData
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("API error response:", errorData);
        const errorDetail = errorData.detail || `API error: ${response.status}`;
        
        // Handle specific model format errors
        if (errorDetail.includes("Protobuf parsing failed") || errorDetail.includes("not in ONNX format")) {
          toast.error("Incompatible model format", {
            description: "The model must be in ONNX format for inference. Please upload an ONNX model."
          });
        } else if (errorDetail.includes("Model not found")) {
          toast.error("Model file not found", {
            description: "The selected model file was not found on the server. Please upload the model again."
          });
        } else {
          throw new Error(errorDetail);
        }
        
        // Return empty result for error cases
        return {
          detections: [],
          processedAt: 'server',
          inferenceTime: 0
        };
      }
      
      const result = await response.json();
      
      return {
        detections: result.detections,
        processedAt: 'edge', // Always from edge/server
        inferenceTime: result.inferenceTime
      };
    } catch (error) {
      console.error("Inference API error:", error);
      toast.error("API inference failed", {
        description: error instanceof Error ? error.message : "Check if the API server is running"
      });
      
      // Return empty detections as fallback
      return {
        detections: [],
        processedAt: 'server',
        inferenceTime: 0
      };
    }
  }
  
  // Connect to an edge device
  connectToDevice(deviceId: string, ipAddress: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${this.apiBaseUrl}/inference/devices/${deviceId}/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ipAddress })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.detail || `HTTP error: ${response.status}`);
        }
        
        const result = await response.json();
        toast.success(`Connected to edge device ${deviceId}`);
        resolve(true);
      } catch (error) {
        console.error(`Failed to connect to edge device ${deviceId}:`, error);
        toast.error(`Connection to device ${deviceId} failed`);
        reject(error);
      }
    });
  }
  
  // Disconnect from an edge device
  async disconnectFromDevice(deviceId: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/inference/devices/${deviceId}/disconnect`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `HTTP error: ${response.status}`);
      }
      
      toast.success(`Disconnected from device ${deviceId}`);
    } catch (error) {
      console.error(`Failed to disconnect from device ${deviceId}:`, error);
      toast.error(`Disconnection from device ${deviceId} failed`);
    }
  }
  
  // Deploy a model to an edge device
  async deployModel(deviceId: string, modelId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/inference/devices/${deviceId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `HTTP error: ${response.status}`);
      }
      
      const result = await response.json();
      toast.success(`Model ${modelId} deployed successfully to device ${deviceId}`);
      return true;
    } catch (error) {
      console.error(`Failed to deploy model ${modelId} to device ${deviceId}:`, error);
      toast.error(`Model deployment failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  // Remove a model from an edge device
  async removeModel(deviceId: string, modelId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/inference/devices/${deviceId}/models/${modelId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `HTTP error: ${response.status}`);
      }
      
      toast.success(`Model ${modelId} removed successfully from device ${deviceId}`);
      return true;
    } catch (error) {
      console.error(`Failed to remove model ${modelId} from device ${deviceId}:`, error);
      toast.error(`Model removal failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}

// Singleton instance
const EdgeAIInference = new EdgeAIInferenceService();
export default EdgeAIInference;
