/**
 * Service for managing IP cameras in Avianet Vision
 * Provides functionality to add, edit, delete and manage camera connections
 */

// We'll use local storage as our "database" since we don't have a backend database connection
// In a real implementation, this would be replaced with API calls to your backend
const CAMERAS_STORAGE_KEY = 'avianet-vision-cameras';

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
  // Status properties
  isOnline: boolean;
  lastChecked: Date;
}

export interface CameraFormData extends Partial<Omit<Camera, 'id' | 'isOnline' | 'lastChecked'>> {
  id?: string;
}

/**
 * Get all cameras from storage
 */
const getAllCameras = (): Camera[] => {
  try {
    const storedCameras = localStorage.getItem(CAMERAS_STORAGE_KEY);
    if (storedCameras) {
      return JSON.parse(storedCameras);
    }
  } catch (error) {
    console.error('Failed to load cameras from storage:', error);
  }
  
  return [];
};

/**
 * Get a single camera by ID
 */
const getCameraById = (id: string): Camera | undefined => {
  const cameras = getAllCameras();
  return cameras.find(camera => camera.id === id);
};

/**
 * Add a new camera
 */
const addCamera = (camera: Omit<Camera, 'id' | 'isOnline' | 'lastChecked'>): Camera => {
  const cameras = getAllCameras();
  
  const newCamera: Camera = {
    ...camera,
    id: Date.now().toString(),
    isOnline: false,
    lastChecked: new Date()
  };
  
  cameras.push(newCamera);
  saveCameras(cameras);
  
  return newCamera;
};

/**
 * Update an existing camera
 */
const updateCamera = (camera: Camera): Camera => {
  const cameras = getAllCameras();
  const index = cameras.findIndex(c => c.id === camera.id);
  
  if (index !== -1) {
    cameras[index] = {
      ...cameras[index],
      ...camera
    };
    
    saveCameras(cameras);
    return cameras[index];
  }
  
  throw new Error(`Camera with id ${camera.id} not found`);
};

/**
 * Delete a camera by ID
 */
const deleteCamera = (id: string): boolean => {
  const cameras = getAllCameras();
  const filteredCameras = cameras.filter(camera => camera.id !== id);
  
  if (filteredCameras.length < cameras.length) {
    saveCameras(filteredCameras);
    return true;
  }
  
  return false;
};

/**
 * Save cameras array to storage
 */
const saveCameras = (cameras: Camera[]): void => {
  try {
    localStorage.setItem(CAMERAS_STORAGE_KEY, JSON.stringify(cameras));
  } catch (error) {
    console.error('Failed to save cameras to storage:', error);
  }
};

/**
 * Get a playable stream URL for the camera
 * In a real implementation, this would construct the correct URL format based on brand or return a proxy URL
 */
const getPlayableStreamUrl = (camera: Camera): string => {
  // For demo purposes, return a sample video if this is a demo camera
  if (camera.name.includes('Demo')) {
    if (camera.name.includes('1')) {
      return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    } else if (camera.name.includes('2')) {
      return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4';
    } else {
      return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    }
  }
  
  // If a custom stream URL is provided, use that
  if (camera.customStreamUrl) {
    return camera.customStreamUrl;
  }
  
  // In a real application, you would construct the URL based on camera type/brand
  switch (camera.protocol) {
    case 'RTSP':
      // For demo purposes, we'll return a sample video since browsers can't play RTSP directly
      // In a real app, you'd convert this to HLS or WebRTC using a streaming server
      return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    
    case 'HTTP':
      // Simulate an HTTP camera with sample videos
      return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4';
    
    case 'ONVIF':
      // Simulate an ONVIF camera with sample videos
      return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4';
      
    default:
      return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
  }
};

/**
 * Check camera connection status
 * In a real implementation, this would try to connect to the camera and update the status
 */
const checkCameraStatus = async (id: string): Promise<boolean> => {
  const camera = getCameraById(id);
  if (!camera) {
    return false;
  }
  
  // Simulate a random connection result
  const isOnline = Math.random() > 0.3; // 70% chance of being online
  
  // Update the camera status
  updateCamera(id, { 
    isOnline, 
    lastChecked: new Date() 
  });
  
  return isOnline;
};

/**
 * Refresh status of all cameras
 */
const refreshAllCameraStatuses = async (): Promise<void> => {
  const cameras = getAllCameras();
  
  // For demo purposes, we'll resolve after a short delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Update each camera with a random status
  cameras.forEach(camera => {
    const isOnline = Math.random() > 0.3; // 70% chance of being online
    updateCamera(camera.id, { 
      isOnline, 
      lastChecked: new Date() 
    });
  });
};

/**
 * Get sample cameras for demo
 */
const createSampleCameras = (): void => {
  const existingCameras = getAllCameras();
  
  // Only add sample cameras if none exist
  if (existingCameras.length === 0) {
    const demoCamera1: Omit<Camera, 'id' | 'isOnline' | 'lastChecked'> = {
      name: 'Demo Camera 1',
      ipAddress: '192.168.1.100',
      port: 554,
      protocol: 'RTSP',
      brand: 'Hikvision',
      streamType: 'main',
      channelNumber: 1,
      username: 'admin',
      password: 'password',
      customStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
    };
    
    const demoCamera2: Omit<Camera, 'id' | 'isOnline' | 'lastChecked'> = {
      name: 'Demo Camera 2',
      ipAddress: '192.168.1.101',
      port: 80,
      protocol: 'HTTP',
      brand: 'Dahua',
      streamType: 'sub',
      channelNumber: 1,
      username: 'admin',
      password: 'password',
      customStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'
    };
    
    const demoCamera3: Omit<Camera, 'id' | 'isOnline' | 'lastChecked'> = {
      name: 'Demo Camera 3',
      ipAddress: '192.168.1.102',
      port: 554,
      protocol: 'ONVIF',
      brand: 'Axis',
      streamType: 'main',
      channelNumber: 1,
      username: 'admin',
      password: 'password',
      customStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
    };
    
    // Add the demo cameras
    addCamera(demoCamera1);
    addCamera(demoCamera2);
    addCamera(demoCamera3);
  }
};

// Create sample cameras when the module is imported
createSampleCameras();

/**
 * Test camera connection
 * In a real implementation, this would try to connect to the camera and return success/failure
 */
const testCameraConnection = async (camera: Partial<Camera>): Promise<boolean> => {
  // Simulate a network request with a delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // For demo purposes, return a random result
  // In a real app, this would actually test the connection to the camera
  return Math.random() > 0.3; // 70% chance of success
};

const CameraService = {
  getAllCameras,
  getCameraById,
  addCamera,
  updateCamera,
  deleteCamera,
  getPlayableStreamUrl,
  checkCameraStatus,
  refreshAllCameraStatuses,
  createSampleCameras,
  testCameraConnection
};

export default CameraService;
