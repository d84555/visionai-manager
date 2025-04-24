
import { v4 as uuidv4 } from 'uuid';

// Define types for our edge devices
export interface ManualEdgeDevice {
  id: string;
  name: string;
  ipAddress: string;
  authToken?: string;
  status: 'online' | 'offline' | 'degraded';
  lastConnection?: string;
  models: string[];
}

// Storage key for localStorage
const EDGE_DEVICES_STORAGE_KEY = 'avianet_manual_edge_devices';

// Helper function to get all devices from localStorage
const getStoredDevices = (): ManualEdgeDevice[] => {
  const storedDevices = localStorage.getItem(EDGE_DEVICES_STORAGE_KEY);
  return storedDevices ? JSON.parse(storedDevices) : [];
};

// Helper function to save devices to localStorage
const saveDevicesToStorage = (devices: ManualEdgeDevice[]) => {
  localStorage.setItem(EDGE_DEVICES_STORAGE_KEY, JSON.stringify(devices));
};

// EdgeDeviceService singleton
const EdgeDeviceService = {
  // Add a new manually configured edge device
  addManualEdgeDevice: async (device: Omit<ManualEdgeDevice, 'id' | 'status' | 'models'>) => {
    // Create a new device with defaults
    const newDevice: ManualEdgeDevice = {
      id: uuidv4(),
      name: device.name,
      ipAddress: device.ipAddress,
      authToken: device.authToken,
      status: 'offline', // Default to offline until connectivity is verified
      models: [],
    };

    // Get existing devices
    const existingDevices = getStoredDevices();
    
    // Add new device
    const updatedDevices = [...existingDevices, newDevice];
    
    // Save to storage
    saveDevicesToStorage(updatedDevices);
    
    // Try to connect to the device
    try {
      await EdgeDeviceService.testDeviceConnectivity(newDevice);
      // If successful, update the status
      newDevice.status = 'online';
      newDevice.lastConnection = new Date().toISOString();
      saveDevicesToStorage(updatedDevices);
    } catch (error) {
      console.error('Failed to connect to new device:', error);
      // Status remains offline
    }
    
    return newDevice;
  },

  // Get all edge devices
  getAllEdgeDevices: async (): Promise<ManualEdgeDevice[]> => {
    return getStoredDevices();
  },

  // Update an existing edge device
  updateManualEdgeDevice: async (device: ManualEdgeDevice): Promise<ManualEdgeDevice> => {
    const devices = getStoredDevices();
    const index = devices.findIndex(d => d.id === device.id);
    
    if (index === -1) {
      throw new Error('Device not found');
    }
    
    devices[index] = device;
    saveDevicesToStorage(devices);
    
    return device;
  },

  // Delete an edge device
  deleteManualEdgeDevice: async (deviceId: string): Promise<void> => {
    const devices = getStoredDevices();
    const updatedDevices = devices.filter(d => d.id !== deviceId);
    saveDevicesToStorage(updatedDevices);
    return Promise.resolve();
  },

  // Test connectivity to an edge device
  testDeviceConnectivity: async (device: ManualEdgeDevice): Promise<boolean> => {
    // Simulate a connection test with a timeout
    return new Promise((resolve, reject) => {
      console.log(`Testing connection to ${device.name} at ${device.ipAddress}...`);
      
      // Simulate network delay
      setTimeout(() => {
        // 80% chance of success for simulation purposes
        if (Math.random() > 0.2) {
          console.log(`Successfully connected to ${device.name}`);
          resolve(true);
        } else {
          console.error(`Failed to connect to ${device.name}`);
          reject(new Error('Connection failed'));
        }
      }, 1500);
    });
  },
};

export default EdgeDeviceService;
