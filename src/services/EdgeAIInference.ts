/**
 * Edge AI Inference Service
 * Handles distributed inference across edge devices and central server
 */

// Types for edge inference
export interface EdgeInferenceRequest {
  imageData: string;
  cameraId: string;
  modelName: string;
  thresholdConfidence: number;
}

export interface EdgeInferenceResult {
  detections: Detection[];
  inferenceTime: number;
  deviceId: string;
  processedAt: 'edge' | 'server';
  modelUsed: string;
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

export interface EdgeDevice {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'degraded';
  models: string[];
  cameras: string[];
}

// Mock edge devices registry
const edgeDevicesRegistry: Record<string, EdgeDevice> = {
  'edge-1': {
    id: 'edge-1',
    name: 'Edge Gateway - Office',
    status: 'online',
    models: ['YOLOv11', 'Face Recognition Pro'],
    cameras: ['Front Entrance', 'Reception']
  },
  'edge-2': {
    id: 'edge-2',
    name: 'Edge Node - Warehouse',
    status: 'online',
    models: ['YOLOv11'],
    cameras: ['Warehouse', 'Loading Dock']
  },
  'edge-3': {
    id: 'edge-3',
    name: 'Edge Gateway - Parking',
    status: 'offline',
    models: ['YOLOv11'],
    cameras: ['Parking Lot']
  }
};

// Mapping of cameras to their assigned edge devices
const cameraToEdgeDeviceMap: Record<string, string> = {
  'Front Entrance': 'edge-1',
  'Reception': 'edge-1',
  'Warehouse': 'edge-2',
  'Loading Dock': 'edge-2',
  'Parking Lot': 'edge-3'
};

// Cache for offline mode
let inferenceCache: Record<string, EdgeInferenceResult[]> = {};

/**
 * Determine which edge device should handle this inference
 */
const selectInferenceDevice = (cameraId: string, modelName: string): string | null => {
  const edgeDeviceId = cameraToEdgeDeviceMap[cameraId];
  if (!edgeDeviceId) return null;
  
  const edgeDevice = edgeDevicesRegistry[edgeDeviceId];
  if (!edgeDevice) return null;
  
  // Check if device is online and has the required model
  if (edgeDevice.status === 'online' && edgeDevice.models.includes(modelName)) {
    return edgeDeviceId;
  }
  
  return null;
};

/**
 * Simulate edge inference (in a real system this would make a request to the edge device)
 */
const performEdgeInference = async (
  request: EdgeInferenceRequest, 
  deviceId: string
): Promise<EdgeInferenceResult> => {
  // In a real implementation, this would communicate with the edge device API
  // For simulation, we'll create mock detections
  console.log(`Performing inference on edge device ${deviceId} for camera ${request.cameraId}`);
  
  // Simulate processing time (50-200ms)
  await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));
  
  const mockDetections = generateMockDetections(request.thresholdConfidence);
  
  return {
    detections: mockDetections,
    inferenceTime: 75 + Math.random() * 50, // 75-125ms
    deviceId,
    processedAt: 'edge',
    modelUsed: request.modelName
  };
};

/**
 * Fallback to server inference when edge devices are unavailable
 */
const performServerInference = async (request: EdgeInferenceRequest): Promise<EdgeInferenceResult> => {
  console.log(`Falling back to server inference for camera ${request.cameraId}`);
  
  // Simulate longer processing time (300-500ms)
  await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
  
  const mockDetections = generateMockDetections(request.thresholdConfidence);
  
  return {
    detections: mockDetections,
    inferenceTime: 350 + Math.random() * 150, // 350-500ms
    deviceId: 'server',
    processedAt: 'server',
    modelUsed: request.modelName
  };
};

/**
 * Generate mock detections for simulation purposes
 */
const generateMockDetections = (confidenceThreshold: number): Detection[] => {
  const mockClasses = ['person', 'car', 'truck', 'bicycle', 'motorcycle', 'bus'];
  const detections: Detection[] = [];
  
  const count = Math.floor(Math.random() * 5) + 1;
  
  for (let i = 0; i < count; i++) {
    const classIndex = Math.floor(Math.random() * mockClasses.length);
    const confidence = Math.random() * 0.5 + 0.5; // 0.5-1.0
    
    if (confidence >= confidenceThreshold) {
      const width = 50 + Math.random() * 150;
      const height = 50 + Math.random() * 100;
      const x = Math.random() * (640 - width);
      const y = Math.random() * (360 - height);
      
      detections.push({
        id: `det-${Date.now()}-${i}`,
        class: mockClasses[classIndex],
        confidence,
        x,
        y,
        width,
        height
      });
    }
  }
  
  return detections;
};

/**
 * Store results in cache for offline operation
 */
const cacheInferenceResult = (cameraId: string, result: EdgeInferenceResult) => {
  if (!inferenceCache[cameraId]) {
    inferenceCache[cameraId] = [];
  }
  
  // Keep last 100 inferences per camera
  inferenceCache[cameraId].push(result);
  if (inferenceCache[cameraId].length > 100) {
    inferenceCache[cameraId].shift();
  }
};

/**
 * Retrieve cached results if available
 */
const getCachedInferenceResults = (cameraId: string): EdgeInferenceResult[] => {
  return inferenceCache[cameraId] || [];
};

/**
 * Main inference function that distributes work to appropriate device
 */
export const performInference = async (
  request: EdgeInferenceRequest
): Promise<EdgeInferenceResult> => {
  // Determine where to run inference
  const edgeDeviceId = selectInferenceDevice(request.cameraId, request.modelName);
  
  let result: EdgeInferenceResult;
  
  if (edgeDeviceId) {
    // Perform edge inference
    try {
      result = await performEdgeInference(request, edgeDeviceId);
    } catch (error) {
      console.error('Edge inference failed, falling back to server:', error);
      result = await performServerInference(request);
    }
  } else {
    // Fall back to server inference
    result = await performServerInference(request);
  }
  
  // Cache result for offline operation
  cacheInferenceResult(request.cameraId, result);
  
  return result;
};

/**
 * Update edge device status
 */
export const updateEdgeDeviceStatus = (
  deviceId: string, 
  status: 'online' | 'offline' | 'degraded'
): void => {
  if (edgeDevicesRegistry[deviceId]) {
    edgeDevicesRegistry[deviceId].status = status;
  }
};

/**
 * Get all registered edge devices
 */
export const getEdgeDevices = (): EdgeDevice[] => {
  return Object.values(edgeDevicesRegistry);
};

/**
 * Register a new edge device
 */
export const registerEdgeDevice = (device: EdgeDevice): void => {
  edgeDevicesRegistry[device.id] = device;
};

/**
 * Assign camera to edge device
 */
export const assignCameraToEdgeDevice = (cameraId: string, deviceId: string): void => {
  if (edgeDevicesRegistry[deviceId]) {
    // Remove camera from any other device first
    Object.values(edgeDevicesRegistry).forEach(device => {
      if (device.id !== deviceId) {
        device.cameras = device.cameras.filter(c => c !== cameraId);
      }
    });
    
    // Add to new device if not already there
    if (!edgeDevicesRegistry[deviceId].cameras.includes(cameraId)) {
      edgeDevicesRegistry[deviceId].cameras.push(cameraId);
    }
    
    // Update mapping
    cameraToEdgeDeviceMap[cameraId] = deviceId;
  }
};

/**
 * Deploy model to edge device
 */
export const deployModelToEdgeDevice = (modelName: string, deviceId: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!edgeDevicesRegistry[deviceId]) {
      reject(new Error(`Edge device ${deviceId} not found`));
      return;
    }
    
    if (edgeDevicesRegistry[deviceId].status !== 'online') {
      reject(new Error(`Edge device ${deviceId} is not online`));
      return;
    }
    
    // Simulate deployment time
    setTimeout(() => {
      if (!edgeDevicesRegistry[deviceId].models.includes(modelName)) {
        edgeDevicesRegistry[deviceId].models.push(modelName);
      }
      resolve();
    }, 3000);
  });
};

/**
 * Remove model from edge device
 */
export const removeModelFromEdgeDevice = (modelName: string, deviceId: string): Promise<void> => {
  return new Promise((resolve) => {
    if (edgeDevicesRegistry[deviceId]) {
      edgeDevicesRegistry[deviceId].models = edgeDevicesRegistry[deviceId].models.filter(
        m => m !== modelName
      );
    }
    resolve();
  });
};

// Export the service
const EdgeAIInference = {
  performInference,
  updateEdgeDeviceStatus,
  getEdgeDevices,
  registerEdgeDevice,
  assignCameraToEdgeDevice,
  deployModelToEdgeDevice,
  removeModelFromEdgeDevice,
  getCachedInferenceResults
};

export default EdgeAIInference;
