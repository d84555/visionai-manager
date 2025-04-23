
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

// Camera interface
export interface Camera {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  protocol: 'RTSP' | 'HTTP' | 'ONVIF';
  brand: string;
  streamType: 'main' | 'sub' | 'third';
  channelNumber: number;
  username: string;
  password: string;
  customStreamUrl?: string;
  isOnline?: boolean;
  lastChecked?: Date;
}

// Storage key for localStorage
const CAMERAS_STORAGE_KEY = 'avianet-vision-cameras';

// Get all cameras from storage
export const getAllCameras = (): Camera[] => {
  try {
    const storedCameras = localStorage.getItem(CAMERAS_STORAGE_KEY);
    return storedCameras ? JSON.parse(storedCameras) : [];
  } catch (error) {
    console.error('Failed to load cameras from storage:', error);
    return [];
  }
};

// Save all cameras to storage
export const saveAllCameras = (cameras: Camera[]): void => {
  try {
    localStorage.setItem(CAMERAS_STORAGE_KEY, JSON.stringify(cameras));
  } catch (error) {
    console.error('Failed to save cameras to storage:', error);
    toast.error('Failed to save cameras');
  }
};

// Add a new camera
export const addCamera = (camera: Omit<Camera, 'id'>): Camera => {
  const cameras = getAllCameras();
  
  // Create new camera with ID
  const newCamera: Camera = {
    id: uuidv4(),
    ...camera,
    isOnline: false,
    lastChecked: new Date()
  };
  
  // Add to cameras list
  cameras.push(newCamera);
  
  // Save to storage
  saveAllCameras(cameras);
  toast.success(`Camera '${newCamera.name}' added successfully`);
  
  return newCamera;
};

// Update an existing camera
export const updateCamera = (camera: Camera): Camera => {
  const cameras = getAllCameras();
  const index = cameras.findIndex(c => c.id === camera.id);
  
  if (index === -1) {
    throw new Error(`Camera with ID ${camera.id} not found`);
  }
  
  // Update camera
  cameras[index] = camera;
  
  // Save to storage
  saveAllCameras(cameras);
  toast.success(`Camera '${camera.name}' updated successfully`);
  
  return camera;
};

// Delete a camera
export const deleteCamera = (cameraId: string): void => {
  const cameras = getAllCameras();
  const cameraToDelete = cameras.find(c => c.id === cameraId);
  
  if (!cameraToDelete) {
    toast.error('Camera not found');
    return;
  }
  
  // Filter out the camera
  const updatedCameras = cameras.filter(c => c.id !== cameraId);
  
  // Save to storage
  saveAllCameras(updatedCameras);
  toast.success(`Camera '${cameraToDelete.name}' deleted successfully`);
};

// Test camera connection
export const testCameraConnection = async (camera: Camera | Omit<Camera, 'id'>): Promise<boolean> => {
  try {
    // In a real application, you would implement actual connection testing here
    // For now, we'll simulate a connection test with a random result
    const isSuccessful = Math.random() > 0.3; // 70% chance of success

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return isSuccessful;
  } catch (error) {
    console.error('Camera connection test failed:', error);
    return false;
  }
};

// Build stream URL based on camera configuration
export const buildStreamUrl = (camera: Camera): string => {
  if (camera.customStreamUrl) {
    return camera.customStreamUrl;
  }
  
  let url = '';
  
  switch (camera.protocol) {
    case 'RTSP':
      url = `rtsp://${camera.username ? `${camera.username}:${camera.password}@` : ''}${camera.ipAddress}:${camera.port}`;
      
      // Add brand-specific paths
      switch (camera.brand.toLowerCase()) {
        case 'hikvision':
          url += `/Streaming/Channels/${camera.channelNumber}${camera.streamType === 'main' ? '01' : camera.streamType === 'sub' ? '02' : '03'}`;
          break;
        case 'dahua':
          url += `/cam/realmonitor?channel=${camera.channelNumber}&subtype=${camera.streamType === 'main' ? '0' : camera.streamType === 'sub' ? '1' : '2'}`;
          break;
        case 'axis':
          url += `/axis-media/media.amp?videocodec=h264&resolution=1280x720`;
          break;
        default:
          // Generic ONVIF path
          url += `/live/${camera.channelNumber}/${camera.streamType}`;
      }
      break;
      
    case 'HTTP':
      url = `http://${camera.username ? `${camera.username}:${camera.password}@` : ''}${camera.ipAddress}:${camera.port}`;
      
      // Add brand-specific paths
      switch (camera.brand.toLowerCase()) {
        case 'hikvision':
          url += `/ISAPI/Streaming/channels/${camera.channelNumber}${camera.streamType === 'main' ? '01' : camera.streamType === 'sub' ? '02' : '03'}/http`;
          break;
        case 'dahua':
          url += `/cgi-bin/snapshot.cgi?channel=${camera.channelNumber}`;
          break;
        case 'axis':
          url += `/axis-cgi/mjpg/video.cgi`;
          break;
        default:
          url += `/video`;
      }
      break;
      
    case 'ONVIF':
      // ONVIF discovery would be implemented here in a real application
      url = `http://${camera.username ? `${camera.username}:${camera.password}@` : ''}${camera.ipAddress}:${camera.port}/onvif/device_service`;
      break;
  }
  
  return url;
};

// Get a playable URL for the browser (for demo purposes)
export const getPlayableStreamUrl = (camera: Camera): string => {
  // In a real application with proper backend, we would transcode RTSP streams to HLS/DASH
  // For this demo, we'll use sample videos based on camera ID to simulate different streams
  const sampleVideos = [
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4'
  ];
  
  // Use the first character of the camera ID as an index
  const charCode = camera.id.charCodeAt(0);
  const index = charCode % sampleVideos.length;
  
  return sampleVideos[index];
};

// Update camera online status
export const updateCameraStatus = (cameraId: string, isOnline: boolean): void => {
  const cameras = getAllCameras();
  const index = cameras.findIndex(c => c.id === cameraId);
  
  if (index !== -1) {
    cameras[index].isOnline = isOnline;
    cameras[index].lastChecked = new Date();
    saveAllCameras(cameras);
  }
};

// Refresh status of all cameras
export const refreshAllCameraStatuses = async (): Promise<void> => {
  const cameras = getAllCameras();
  
  for (const camera of cameras) {
    // In a real app, you would test the actual connection
    const isOnline = await testCameraConnection(camera);
    camera.isOnline = isOnline;
    camera.lastChecked = new Date();
  }
  
  saveAllCameras(cameras);
  toast.success('Camera statuses refreshed');
};

const CameraService = {
  getAllCameras,
  saveAllCameras,
  addCamera,
  updateCamera,
  deleteCamera,
  testCameraConnection,
  buildStreamUrl,
  getPlayableStreamUrl,
  updateCameraStatus,
  refreshAllCameraStatuses
};

export default CameraService;
