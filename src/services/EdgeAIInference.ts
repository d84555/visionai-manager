
// EdgeAIInference.ts
// This service handles communication with edge devices for AI inference

import { toast } from "sonner";
import SettingsService from './SettingsService';
import StorageServiceFactory from './storage/StorageServiceFactory';

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
    console.info(`Performing inference for camera ${request.cameraId} with model ${request.modelName}`);
    
    try {
      // Ensure the model path has the correct extension
      let modelPath = request.modelPath;
      
      // Handle default case where path might be missing extension or have wrong extension
      if (modelPath.includes('/custom_models/')) {
        // If it's a custom model and doesn't end with .onnx (used for simulation)
        if (!modelPath.toLowerCase().endsWith('.onnx')) {
          // Check if we're actually using a .onnx model by checking the name
          if (request.modelName.toLowerCase().includes('onnx')) {
            // Fix the path to use .onnx extension
            modelPath = modelPath.replace(/\.[^/.]+$/, '.onnx');
          }
          
          // If path still doesn't have extension, add .onnx
          if (!modelPath.includes('.')) {
            modelPath = `${modelPath}.onnx`;
          }
        }
      }
      
      // Check model file extension for proper format detection
      const isOnnxModel = modelPath.toLowerCase().endsWith('.onnx');
      
      // Log the model path to help with debugging
      console.log(`Using model path: ${modelPath}, ONNX: ${isOnnxModel}`);
      
      if (!isOnnxModel) {
        console.warn(`Model ${modelPath} is not an ONNX model. The backend will fallback to simulation.`);
      }
      
      // If in simulated mode, we'll simulate detection results
      if (StorageServiceFactory.getMode() === 'simulated') {
        console.log("Using simulated inference mode");
        
        // Create simulated detections after a short delay
        await new Promise(resolve => setTimeout(resolve, 200));
        
        return {
          detections: [
            {
              label: "person",
              confidence: 0.92,
              bbox: [0.2, 0.3, 0.5, 0.8]
            },
            {
              label: "car",
              confidence: 0.87,
              bbox: [0.6, 0.5, 0.9, 0.7]
            }
          ],
          processedAt: 'server',
          inferenceTime: 150
        };
      }
      
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
          
          // When model not found, fall back to simulated mode
          StorageServiceFactory.setMode('simulated');
          return this.performInference(request);
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
      
      // Fallback to simulated mode when API fails
      StorageServiceFactory.setMode('simulated');
      
      // Return simulated detection results
      return {
        detections: [
          {
            label: "person",
            confidence: 0.92,
            bbox: [0.2, 0.3, 0.5, 0.8]
          },
          {
            label: "car",
            confidence: 0.87,
            bbox: [0.6, 0.5, 0.9, 0.7]
          }
        ],
        processedAt: 'server',
        inferenceTime: 120
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
