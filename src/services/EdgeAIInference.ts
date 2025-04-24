
// EdgeAIInference.ts
// This service handles communication with edge devices for AI inference

import { toast } from "sonner";

// Types for inference requests and responses
export interface InferenceRequest {
  imageData: string;
  cameraId: string;
  modelName: string;
  thresholdConfidence: number;
}

export interface InferenceResult {
  detections: Detection[];
  processedAt: 'edge' | 'server';
  inferenceTime: number;
}

export interface Detection {
  id: string;
  class: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// YOLO model class labels
const yoloClassLabels = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
  "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
  "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", 
  "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee", 
  "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", 
  "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", 
  "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", 
  "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", 
  "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", 
  "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", 
  "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", 
  "toothbrush"
];

// Special detection regions with predetermined labels and confidence
// These simulate consistent detections for demo videos
const predefinedDetections: Record<string, Detection[]> = {
  "BigBuckBunny": [
    {
      id: "det-1",
      class: "person",
      confidence: 0.89,
      x: 100,
      y: 80,
      width: 120,
      height: 240
    }
  ],
  "ElephantsDream": [
    {
      id: "det-2",
      class: "car",
      confidence: 0.78,
      x: 400,
      y: 100,
      width: 180,
      height: 100
    },
    {
      id: "det-3",
      class: "truck",
      confidence: 0.84,
      x: 100,
      y: 200,
      width: 220,
      height: 120
    }
  ],
  "ForBiggerBlazes": [
    {
      id: "det-4",
      class: "person",
      confidence: 0.92,
      x: 150,
      y: 50,
      width: 100,
      height: 200
    },
    {
      id: "det-5",
      class: "chair",
      confidence: 0.76,
      x: 350,
      y: 150,
      width: 80,
      height: 120
    }
  ]
};

class EdgeAIInferenceService {
  private deviceConnections: Map<string, WebSocket | null> = new Map();
  
  // Connect to an edge device using WebSocket
  connectToDevice(deviceId: string, ipAddress: string, authToken?: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        // For simulation purposes, we'll just log this and simulate success
        console.log(`Connecting to edge device ${deviceId} at ${ipAddress}`);
        
        // In a real implementation, we would establish a WebSocket connection:
        // const wsUrl = `ws://${ipAddress}/inference`;
        // const ws = new WebSocket(wsUrl);
        
        // Simulate successful connection
        setTimeout(() => {
          this.deviceConnections.set(deviceId, null); // In real impl, store the WebSocket object
          resolve(true);
        }, 1000);
      } catch (error) {
        console.error(`Failed to connect to edge device ${deviceId}:`, error);
        reject(error);
      }
    });
  }
  
  // Disconnect from an edge device
  disconnectFromDevice(deviceId: string): void {
    const connection = this.deviceConnections.get(deviceId);
    if (connection) {
      // In a real implementation, close the WebSocket:
      // connection.close();
      console.log(`Disconnected from edge device ${deviceId}`);
    }
    this.deviceConnections.delete(deviceId);
  }
  
  // Process an inference request
  async performInference(request: InferenceRequest): Promise<InferenceResult> {
    // Check if we're connected to a device for this camera
    console.info(`Performing inference for camera ${request.cameraId} with model ${request.modelName}`);
    
    // Check if this is a demo video and has predefined detections
    const demoDetections = this.getDemoVideoDetections(request.cameraId);
    if (demoDetections) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            detections: demoDetections,
            processedAt: 'edge',
            inferenceTime: 25 + Math.random() * 30 // 25-55ms
          });
        }, 300);
      });
    }
    
    // For simulation purposes, return a more realistic detection after a delay
    return new Promise((resolve) => {
      setTimeout(() => {
        // Generate between 1-3 detections from the actual YOLO class labels
        const detections = this.generateRealisticDetections(request.modelName);
        
        // Simulate edge processing success with 70% probability
        const isEdgeProcessed = Math.random() < 0.7;
        
        resolve({
          detections,
          processedAt: isEdgeProcessed ? 'edge' : 'server',
          inferenceTime: isEdgeProcessed ? 20 + Math.random() * 50 : 100 + Math.random() * 150
        });
      }, 500);
    });
  }
  
  // Generate realistic detections based on the model
  private generateRealisticDetections(modelName: string): Detection[] {
    const detections: Detection[] = [];
    
    // Determine how many objects to detect (1-3 for realism)
    const numDetections = 1 + Math.floor(Math.random() * 3);
    
    // Generate detections with reasonable parameters
    for (let i = 0; i < numDetections; i++) {
      // Select class label from YOLO classes
      const classIndex = Math.floor(Math.random() * yoloClassLabels.length);
      const className = yoloClassLabels[classIndex];
      
      // Higher confidence for person, car, truck which are common
      let confidence = 0.5 + Math.random() * 0.4; // Base confidence 0.5-0.9
      if (className === "person" || className === "car" || className === "truck") {
        confidence = Math.min(confidence + 0.1, 0.95); // Boost common objects
      }
      
      // Reasonable object sizes relative to frame
      const width = (className === "person" ? 0.1 : 0.15) * 640 + Math.random() * 80;
      const height = (className === "person" ? 0.25 : 0.15) * 360 + Math.random() * 60;
      
      // Position objects in realistic areas of the frame
      // For example, people are usually on the lower half of the frame
      let x, y;
      if (className === "person") {
        x = Math.random() * (640 - width);
        y = 120 + Math.random() * (240 - height); // Lower half
      } else if (className === "car" || className === "truck") {
        x = Math.random() * (640 - width);
        y = 180 + Math.random() * (180 - height); // Road level
      } else {
        x = Math.random() * (640 - width);
        y = Math.random() * (360 - height);
      }
      
      detections.push({
        id: `det-${Date.now()}-${i}`,
        class: className,
        confidence,
        x,
        y,
        width,
        height
      });
    }
    
    return detections;
  }
  
  // Get predefined detections for demo videos
  private getDemoVideoDetections(cameraId: string): Detection[] | null {
    // Check if this is one of our demo videos
    if (cameraId.includes('Demo Camera 1') || cameraId.includes('BigBuckBunny')) {
      return predefinedDetections.BigBuckBunny.map(detection => ({
        ...detection,
        id: `det-${Date.now()}-${detection.id}`
      }));
    } else if (cameraId.includes('Demo Camera 2') || cameraId.includes('ElephantsDream')) {
      return predefinedDetections.ElephantsDream.map(detection => ({
        ...detection,
        id: `det-${Date.now()}-${detection.id}`
      }));
    } else if (cameraId.includes('Demo Camera 3') || cameraId.includes('ForBiggerBlazes')) {
      return predefinedDetections.ForBiggerBlazes.map(detection => ({
        ...detection,
        id: `det-${Date.now()}-${detection.id}`
      }));
    }
    
    return null;
  }
  
  // Deploy a model to an edge device
  deployModel(deviceId: string, modelId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // For simulation purposes
      console.log(`Deploying model ${modelId} to edge device ${deviceId}`);
      
      // Simulate deployment time
      setTimeout(() => {
        // 90% chance of success
        if (Math.random() < 0.9) {
          toast.success(`Model ${modelId} deployed successfully`);
          resolve(true);
        } else {
          const error = new Error(`Failed to deploy model ${modelId}`);
          toast.error(`Deployment failed: ${error.message}`);
          reject(error);
        }
      }, 2000);
    });
  }
  
  // Remove a model from an edge device
  removeModel(deviceId: string, modelId: string): Promise<boolean> {
    return new Promise((resolve) => {
      // For simulation purposes
      console.log(`Removing model ${modelId} from edge device ${deviceId}`);
      
      // Simulate operation time
      setTimeout(() => {
        toast.success(`Model ${modelId} removed successfully`);
        resolve(true);
      }, 1000);
    });
  }
}

// Singleton instance
const EdgeAIInference = new EdgeAIInferenceService();
export default EdgeAIInference;
