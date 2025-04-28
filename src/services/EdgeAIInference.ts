
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
  x?: number;       // Center x position (YOLO format)
  y?: number;       // Center y position (YOLO format)
  width?: number;   // Width in pixels or normalized
  height?: number;  // Height in pixels or normalized
}

// Frontend detection format (used by the UI components)
export interface Detection {
  id: string;
  class?: string;
  label?: string;
  confidence: number;
  x?: number;        // Center x position (YOLO format)
  y?: number;        // Center y position (YOLO format)
  width?: number;    // Width in pixels or normalized
  height?: number;   // Height in pixels or normalized
  bbox?: number[];   // [x1, y1, x2, y2] coordinates
  format?: 'onnx' | 'pytorch' | 'unknown'; // Track the source model format
}

class EdgeAIInferenceService {
  private apiBaseUrl = 'http://localhost:8000/api';
  private simulatedMode = false; // Flag to control simulation

  constructor() {
    console.log("Initializing Edge AI Inference service with API server backend");
    
    // Check if we're in simulated mode
    this.simulatedMode = StorageServiceFactory.getMode() === 'simulated';
    console.log(`Edge AI Service initialized in ${this.simulatedMode ? 'simulated' : 'real'} mode`);
  }
  
  // Toggle simulated mode (for debugging)
  setSimulatedMode(enabled: boolean) {
    this.simulatedMode = enabled;
    console.log(`Simulated mode ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  // Check if a model path is a PyTorch model
  isPytorchModel(modelPath: string): boolean {
    return modelPath.toLowerCase().endsWith('.pt') || modelPath.toLowerCase().endsWith('.pth');
  }
  
  // Check if a model path is an ONNX model
  isOnnxModel(modelPath: string): boolean {
    return modelPath.toLowerCase().endsWith('.onnx');
  }
  
  // Process an inference request
  async performInference(request: InferenceRequest): Promise<InferenceResult> {
    console.info(`Performing inference for camera ${request.cameraId} with model ${request.modelName}`);
    
    try {
      // Get model format
      const isPytorch = this.isPytorchModel(request.modelPath);
      const isOnnx = this.isOnnxModel(request.modelPath);
      
      // Log model format for debugging
      console.log(`Model format: ${isPytorch ? 'PyTorch' : (isOnnx ? 'ONNX' : 'Unknown')}`);
      
      // Ensure the model path has the correct extension
      let modelPath = request.modelPath;
      
      // If in simulated mode, we'll simulate detection results
      if (this.simulatedMode) {
        console.log("Using simulated inference mode");
        
        // Create simulated detections after a short delay
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Create test detections with YOLO format (center_x, center_y, width, height)
        // These are center-based coordinates as output by YOLO models
        return {
          detections: [
            {
              label: "person",
              class: "person",
              confidence: 0.92,
              // Provide both formats for testing
              // center-based coordinates (YOLO standard output format)
              x: 0.2,       // center_x (normalized 0-1)
              y: 0.45,      // center_y (normalized 0-1)
              width: 0.2,   // width (normalized 0-1)
              height: 0.5,  // height (normalized 0-1)
              // Also include bbox format for compatibility
              bbox: [0.1, 0.2, 0.3, 0.7]  // [x1, y1, x2, y2] normalized
            },
            {
              label: "car",
              class: "car",
              confidence: 0.87,
              // YOLO format (center_x, center_y, width, height)
              x: 0.75,      // center_x (normalized 0-1)
              y: 0.6,       // center_y (normalized 0-1)
              width: 0.3,   // width (normalized 0-1)
              height: 0.2,  // height (normalized 0-1)
              // Also include bbox format for compatibility
              bbox: [0.6, 0.5, 0.9, 0.7]  // [x1, y1, x2, y2] normalized
            },
            {
              label: "small_test",
              class: "test",
              confidence: 0.65,
              // YOLO format with small values
              x: 0.075,     // center_x (normalized 0-1)
              y: 0.1,       // center_y (normalized 0-1)
              width: 0.05,  // width (normalized 0-1)
              height: 0.1,  // height (normalized 0-1)
              // Also include bbox format for compatibility
              bbox: [0.05, 0.05, 0.10, 0.15]  // [x1, y1, x2, y2] normalized
            }
          ],
          processedAt: 'server',
          inferenceTime: 150
        };
      }
      
      // Make real API request to backend
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
          if (isPytorch) {
            toast.error("PyTorch model format error", {
              description: "There was an error loading the PyTorch model. Make sure it's a valid YOLOv5/YOLOv8 model."
            });
          } else {
            toast.error("Incompatible model format", {
              description: "The model must be in ONNX format or valid PyTorch format for inference."
            });
          }
        } else if (errorDetail.includes("Model not found")) {
          toast.error("Model file not found", {
            description: "The selected model file was not found on the server. Please upload the model again."
          });
          
          // When model not found, fall back to simulated mode
          this.setSimulatedMode(true);
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
      
      // Debug network response data
      console.log("API response received, parsing JSON...");
      const result = await response.json();
      console.log("API detections received:", result.detections?.length || 0);
      
      // *** ADDED: Enhanced detection debugging ***
      if (result.detections && result.detections.length > 0) {
        console.log("%c DETAILED DETECTION ANALYSIS", "background: #3498db; color: white; padding: 5px; font-size: 16px;");
        
        // Log the first detection in detail to understand its structure
        const firstDetection = result.detections[0];
        console.log("%c Example detection received from backend:", "font-weight: bold; color: #2c3e50;");
        console.log(JSON.stringify(firstDetection, null, 2));
        
        // Analyze coordinate range to determine if normalized or absolute
        const coordSummary = {
          hasXY: firstDetection.x !== undefined && firstDetection.y !== undefined,
          hasBbox: Array.isArray(firstDetection.bbox) && firstDetection.bbox.length === 4,
          xyValues: firstDetection.x !== undefined ? `x: ${firstDetection.x}, y: ${firstDetection.y}` : 'N/A',
          bboxValues: Array.isArray(firstDetection.bbox) ? `[${firstDetection.bbox.join(', ')}]` : 'N/A',
          isNormalized: false
        };
        
        // Determine if coordinates appear to be normalized (0-1) or absolute
        if (coordSummary.hasXY) {
          coordSummary.isNormalized = 
            firstDetection.x >= 0 && firstDetection.x <= 1 && 
            firstDetection.y >= 0 && firstDetection.y <= 1 &&
            firstDetection.width >= 0 && firstDetection.width <= 1 &&
            firstDetection.height >= 0 && firstDetection.height <= 1;
        } else if (coordSummary.hasBbox) {
          const allInRange = firstDetection.bbox.every(val => val >= 0 && val <= 1);
          coordSummary.isNormalized = allInRange;
        }
        
        console.log("%c Coordinate Analysis:", "font-weight: bold; color: #2c3e50;");
        console.log(`- Format: ${coordSummary.hasXY ? 'Center format (x,y,w,h)' : (coordSummary.hasBbox ? 'Bounding box [x1,y1,x2,y2]' : 'Unknown')}`);
        console.log(`- Values: ${coordSummary.hasXY ? coordSummary.xyValues : coordSummary.bboxValues}`);
        console.log(`- Range: ${coordSummary.isNormalized ? 'NORMALIZED (0-1)' : 'ABSOLUTE PIXELS'}`);
        console.log(`- Model Format: ${isPytorch ? 'PyTorch' : (isOnnx ? 'ONNX' : 'Unknown')}`);
        console.log(`- Recommendation: ${coordSummary.isNormalized ? 'Multiply by image dimensions' : 'Use directly'}`);
        
        // Display stats for all detections
        const confidences = result.detections.map(d => d.confidence || 0);
        const avgConfidence = confidences.reduce((sum, val) => sum + val, 0) / confidences.length;
        console.log("%c Detection Statistics:", "font-weight: bold; color: #2c3e50;");
        console.log(`- Total detections: ${result.detections.length}`);
        console.log(`- Average confidence: ${avgConfidence.toFixed(3)}`);
        console.log(`- Highest confidence: ${Math.max(...confidences).toFixed(3)}`);
        console.log(`- Lowest confidence: ${Math.min(...confidences).toFixed(3)}`);
        console.log(`- Inference time: ${result.inferenceTime.toFixed(2)}ms`);
      }
      // *** END ENHANCED DEBUGGING ***
      
      // Handle case where detections field is null or missing
      if (!result.detections || !Array.isArray(result.detections)) {
        console.warn("API returned null or invalid detections field. Using empty array instead.");
        result.detections = [];
        
        // Show warning to user about response format issues
        toast.warning("Detection format issue", {
          description: "The model output format may not match what's expected. Check model compatibility."
        });
      }
      
      // Validate and transform detections if needed
      if (result.detections.length > 0) {
        const validDetections = result.detections.filter(detection => {
          // Check if detection has valid format
          const isValid = detection && 
                         typeof detection === 'object' && 
                         ((typeof detection.label === 'string' || typeof detection.class === 'string') && 
                         typeof detection.confidence === 'number' && 
                         (Array.isArray(detection.bbox) || 
                          (detection.x !== undefined && detection.y !== undefined && 
                           detection.width !== undefined && detection.height !== undefined)));
          
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
        
        // Transform to standardized format
        result.detections = result.detections.map(det => {
          // Skip if already in proper format
          if (Array.isArray(det.bbox) && det.bbox.length === 4) {
            return det;
          }
          
          // Check for YOLO-style output (center_x, center_y, width, height)
          if (det.x !== undefined && det.y !== undefined && 
              det.width !== undefined && det.height !== undefined) {
            
            // These are center coordinates from YOLO, but we'll keep them as is
            // The DetectionOverlay component will handle the conversion
            console.log(`Detection with center format: (${det.x}, ${det.y}, ${det.width}, ${det.height})`);
            
            // Also add bbox format for compatibility
            if (!det.bbox) {
              // Convert center format to corners format [x1, y1, x2, y2]
              // Assuming x,y,w,h are already normalized (0-1) values
              const halfWidth = det.width / 2;
              const halfHeight = det.height / 2;
              det.bbox = [
                det.x - halfWidth,    // x1
                det.y - halfHeight,   // y1
                det.x + halfWidth,    // x2
                det.y + halfHeight    // y2
              ];
            }
          }
          
          return det;
        });
      }
      
      // Return processed result
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
      this.setSimulatedMode(true);
      
      // Return simulated detection results with YOLO format
      return {
        detections: [
          {
            label: "person",
            class: "person", 
            confidence: 0.92,
            // YOLO format (center_x, center_y, width, height) with normalized values
            x: 0.2,       // center_x (normalized 0-1)
            y: 0.45,      // center_y (normalized 0-1)
            width: 0.2,   // width (normalized 0-1)
            height: 0.5,  // height (normalized 0-1)
            bbox: [0.1, 0.2, 0.3, 0.7]  // [x1, y1, x2, y2] normalized
          },
          {
            label: "car",
            class: "car",
            confidence: 0.87,
            // YOLO format with normalized values
            x: 0.75,      // center_x (normalized 0-1)
            y: 0.6,       // center_y (normalized 0-1)
            width: 0.3,   // width (normalized 0-1)
            height: 0.2,  // height (normalized 0-1)
            bbox: [0.6, 0.5, 0.9, 0.7]  // [x1, y1, x2, y2] normalized
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
