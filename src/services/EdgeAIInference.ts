
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
  class?: string;   // Class property for detection type
  confidence: number;
  bbox?: number[];   // [x1, y1, x2, y2] normalized coordinates
  x?: number;       // Absolute x position
  y?: number;       // Absolute y position
  width?: number;   // Width in pixels
  height?: number;  // Height in pixels
}

// Frontend detection format (used by the UI components)
export interface Detection {
  id: string;
  class?: string;
  label?: string;
  confidence: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  bbox?: number[]; // [x1, y1, x2, y2] normalized coordinates
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
      
      // If in simulated mode, we'll simulate detection results
      if (StorageServiceFactory.getMode() === 'simulated' || true) { // Temporarily force simulation for debugging
        console.log("Using simulated inference mode");
        
        // Create simulated detections after a short delay
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Generate timestamp to ensure unique detection IDs
        const timestamp = Date.now();
        
        // Create test detections with the correct format for the expected model input and output sizes
        // The detections now need scaling from 640x640 model space to video display space
        return {
          detections: [
            {
              label: "person",
              class: "person",
              confidence: 0.92,
              bbox: [0.1, 0.2, 0.3, 0.7], // Normalized coordinates in 0-1 range
              // Adding absolute coordinates based on 640x640 model space
              x: 64,  // 0.1 * 640
              y: 128, // 0.2 * 640
              width: 128, // 0.2 * 640
              height: 320 // 0.5 * 640
            },
            {
              label: "car",
              class: "car",
              confidence: 0.87,
              bbox: [0.6, 0.5, 0.9, 0.7], // Normalized coordinates
              // Adding absolute coordinates based on 640x640 model space
              x: 384, // 0.6 * 640
              y: 320, // 0.5 * 640
              width: 192, // 0.3 * 640
              height: 128 // 0.2 * 640
            },
            {
              label: "small_test",
              class: "test",
              confidence: 0.65,
              bbox: [0.05, 0.05, 0.10, 0.15], // Slightly larger for visibility
              // Adding absolute coordinates based on 640x640 model space
              x: 32, // 0.05 * 640
              y: 32, // 0.05 * 640
              width: 32, // 0.05 * 640
              height: 64 // 0.1 * 640
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
      
      // Handle case where detections field is null or missing
      if (!result.detections || !Array.isArray(result.detections)) {
        console.warn("API returned null or invalid detections field. Using empty array instead.");
        result.detections = [];
        
        // Show warning to user about response format issues
        toast.warning("Detection format issue", {
          description: "The model output format may not match what's expected. Check model compatibility."
        });
      }
      
      // Validate each detection's format
      if (result.detections.length > 0) {
        const validDetections = result.detections.filter(detection => {
          // Check if detection has valid format
          const isValid = detection && 
                         typeof detection === 'object' && 
                         typeof detection.label === 'string' && 
                         typeof detection.confidence === 'number' && 
                         Array.isArray(detection.bbox) &&
                         detection.bbox.length === 4;
          
          if (!isValid) {
            console.warn("Invalid detection format received:", detection);
          }
          
          return isValid;
        });
        
        // If we filtered out any invalid detections, show a warning
        if (validDetections.length < result.detections.length) {
          console.warn(`Filtered out ${result.detections.length - validDetections.length} invalid detections`);
          toast.warning("Some detections had invalid format and were filtered out", {
            description: "Check model compatibility with the system"
          });
          
          result.detections = validDetections;
        }
      }
      
      return {
        detections: result.detections || [],  // Ensure we always have an array, even if empty
        processedAt: result.processedAt || 'edge',
        inferenceTime: result.inferenceTime || 0
      };
    } catch (error) {
      console.error("Inference API error:", error);
      toast.error("API inference failed", {
        description: error instanceof Error ? error.message : "Check if the API server is running"
      });
      
      // Fallback to simulated mode when API fails
      StorageServiceFactory.setMode('simulated');
      
      // Return simulated detection results with more visible bboxes and absolute coordinates
      return {
        detections: [
          {
            label: "person",
            class: "person", 
            confidence: 0.92,
            bbox: [0.1, 0.2, 0.3, 0.7],
            x: 64,  // 0.1 * 640
            y: 128, // 0.2 * 640
            width: 128, // 0.2 * 640
            height: 320 // 0.5 * 640
          },
          {
            label: "car",
            class: "car",
            confidence: 0.87,
            bbox: [0.6, 0.5, 0.9, 0.7],
            x: 384, // 0.6 * 640
            y: 320, // 0.5 * 640
            width: 192, // 0.3 * 640
            height: 128 // 0.2 * 640
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
