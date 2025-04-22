
/**
 * Edge Device Management Service
 * Handles persistence and management of edge devices
 */
import { toast } from 'sonner';
import { EdgeDevice } from '@/services/EdgeAIInference';

// Storage key for edge devices
const EDGE_DEVICES_STORAGE_KEY = 'avianet-vision-edge-devices';

export interface ManualEdgeDevice extends EdgeDevice {
  ipAddress: string;
  authToken?: string;
  isManuallyAdded: boolean;
  lastConnection?: string; // ISO date string
}

/**
 * Load manually added edge devices from storage
 */
export const loadManualEdgeDevices = (): ManualEdgeDevice[] => {
  try {
    const storedDevices = localStorage.getItem(EDGE_DEVICES_STORAGE_KEY);
    if (storedDevices) {
      return JSON.parse(storedDevices) as ManualEdgeDevice[];
    }
  } catch (error) {
    console.error('Failed to load edge devices from storage:', error);
  }
  
  return [];
};

/**
 * Save manually added edge devices to storage
 */
const saveManualEdgeDevices = (devices: ManualEdgeDevice[]): void => {
  try {
    localStorage.setItem(EDGE_DEVICES_STORAGE_KEY, JSON.stringify(devices));
  } catch (error) {
    console.error('Failed to save edge devices to storage:', error);
  }
};

/**
 * Add a new manual edge device
 */
export const addManualEdgeDevice = async (
  device: Omit<ManualEdgeDevice, 'id' | 'status' | 'models' | 'cameras' | 'isManuallyAdded'>
): Promise<ManualEdgeDevice> => {
  // Generate a unique ID
  const id = `manual-edge-${Date.now()}`;
  
  // Create the device object
  const newDevice: ManualEdgeDevice = {
    id,
    name: device.name,
    ipAddress: device.ipAddress,
    authToken: device.authToken,
    status: 'offline', // Start as offline until connectivity check
    models: [],
    cameras: [],
    isManuallyAdded: true,
  };
  
  // Test connectivity
  try {
    await testDeviceConnectivity(newDevice);
    newDevice.status = 'online';
    newDevice.lastConnection = new Date().toISOString();
    toast.success(`Successfully connected to ${newDevice.name}`);
  } catch (error) {
    newDevice.status = 'offline';
    toast.error(`Could not connect to ${newDevice.name}. Device added but offline.`);
  }
  
  // Get current devices and add the new one
  const devices = loadManualEdgeDevices();
  devices.push(newDevice);
  saveManualEdgeDevices(devices);
  
  return newDevice;
};

/**
 * Update an existing manual edge device
 */
export const updateManualEdgeDevice = async (device: ManualEdgeDevice): Promise<ManualEdgeDevice> => {
  const devices = loadManualEdgeDevices();
  const index = devices.findIndex(d => d.id === device.id);
  
  if (index === -1) {
    throw new Error(`Edge device with ID ${device.id} not found`);
  }
  
  // Try to connect if the IP has changed
  if (devices[index].ipAddress !== device.ipAddress) {
    try {
      await testDeviceConnectivity(device);
      device.status = 'online';
      device.lastConnection = new Date().toISOString();
      toast.success(`Successfully connected to updated device ${device.name}`);
    } catch (error) {
      device.status = 'offline';
      toast.error(`Could not connect to updated device ${device.name}. Changes saved but device offline.`);
    }
  }
  
  // Update the device
  devices[index] = device;
  saveManualEdgeDevices(devices);
  
  return device;
};

/**
 * Delete a manual edge device
 */
export const deleteManualEdgeDevice = (deviceId: string): void => {
  const devices = loadManualEdgeDevices();
  const updatedDevices = devices.filter(d => d.id !== deviceId);
  saveManualEdgeDevices(updatedDevices);
};

/**
 * Test connectivity to an edge device
 * In a real implementation, this would make an actual API call to check connectivity
 */
export const testDeviceConnectivity = (device: ManualEdgeDevice): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    // Simulate a network request
    setTimeout(() => {
      // For simulation purposes, we'll consider devices with "fail" in their name or IP to fail the test
      if (device.name.toLowerCase().includes('fail') || device.ipAddress.includes('fail')) {
        reject(new Error(`Failed to connect to ${device.name} at ${device.ipAddress}`));
      } else {
        resolve(true);
      }
    }, 1500);
  });
};

/**
 * Get all edge devices (both manual and auto-discovered)
 */
export const getAllEdgeDevices = async (): Promise<ManualEdgeDevice[]> => {
  // Get manual devices
  const manualDevices = loadManualEdgeDevices();
  
  return manualDevices;
};

const EdgeDeviceService = {
  loadManualEdgeDevices,
  addManualEdgeDevice,
  updateManualEdgeDevice,
  deleteManualEdgeDevice,
  testDeviceConnectivity,
  getAllEdgeDevices,
};

export default EdgeDeviceService;
