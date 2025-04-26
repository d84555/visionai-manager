
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { ManualEdgeDevice } from '@/services/EdgeDeviceService';
import StorageServiceFactory from '@/services/storage/StorageServiceFactory';

// Storage key for localStorage
const EDGE_DEVICES_STORAGE_KEY = 'avianet-vision-edge-devices';

/**
 * Get all manually added edge devices from storage
 * @returns Array of edge devices
 */
export const getAllEdgeDevices = (): ManualEdgeDevice[] => {
  try {
    // Check if we're using API mode or simulated mode
    const storageMode = StorageServiceFactory.getMode();
    
    if (storageMode === 'api') {
      // In API mode, we'll fetch from localStorage temporarily
      // In a real implementation, this would come from the API
      const storedDevices = localStorage.getItem(EDGE_DEVICES_STORAGE_KEY);
      return storedDevices ? JSON.parse(storedDevices) : [];
    } else {
      // In simulated mode, use localStorage
      const storedDevices = localStorage.getItem(EDGE_DEVICES_STORAGE_KEY);
      return storedDevices ? JSON.parse(storedDevices) : [];
    }
  } catch (error) {
    console.error('Failed to load edge devices from storage:', error);
    return [];
  }
};

/**
 * Save all edge devices to storage
 * @param devices Array of edge devices to save
 */
export const saveAllEdgeDevices = (devices: ManualEdgeDevice[]): void => {
  try {
    // Check if we're using API mode or simulated mode
    const storageMode = StorageServiceFactory.getMode();
    
    if (storageMode === 'api') {
      // In API mode, we'll save to localStorage temporarily
      // In a real implementation, this would be sent to the API
      localStorage.setItem(EDGE_DEVICES_STORAGE_KEY, JSON.stringify(devices));
    } else {
      // In simulated mode, use localStorage
      localStorage.setItem(EDGE_DEVICES_STORAGE_KEY, JSON.stringify(devices));
    }
  } catch (error) {
    console.error('Failed to save edge devices to storage:', error);
    toast.error('Failed to save edge devices');
  }
};

/**
 * Add a new edge device
 * @param device Device to add
 * @returns The added device with generated ID
 */
export const addEdgeDevice = (device: Omit<ManualEdgeDevice, 'id'>): ManualEdgeDevice => {
  const devices = getAllEdgeDevices();
  
  // Create new device with ID
  const newDevice: ManualEdgeDevice = {
    id: uuidv4(),
    ...device
  };
  
  // Add to devices list
  devices.push(newDevice);
  
  // Save to storage
  saveAllEdgeDevices(devices);
  toast.success(`Edge device '${newDevice.name}' added successfully`);
  
  return newDevice;
};

/**
 * Update an existing edge device
 * @param device Device to update
 * @returns The updated device
 */
export const updateEdgeDevice = (device: ManualEdgeDevice): ManualEdgeDevice => {
  const devices = getAllEdgeDevices();
  const index = devices.findIndex(d => d.id === device.id);
  
  if (index === -1) {
    throw new Error(`Device with ID ${device.id} not found`);
  }
  
  // Update device
  devices[index] = device;
  
  // Save to storage
  saveAllEdgeDevices(devices);
  toast.success(`Edge device '${device.name}' updated successfully`);
  
  return device;
};

/**
 * Delete an edge device
 * @param deviceId ID of the device to delete
 */
export const deleteEdgeDevice = (deviceId: string): void => {
  const devices = getAllEdgeDevices();
  const deviceToDelete = devices.find(d => d.id === deviceId);
  
  if (!deviceToDelete) {
    toast.error('Device not found');
    return;
  }
  
  // Filter out the device
  const updatedDevices = devices.filter(d => d.id !== deviceId);
  
  // Save to storage
  saveAllEdgeDevices(updatedDevices);
  toast.success(`Edge device '${deviceToDelete.name}' deleted successfully`);
};

const EdgeManagementService = {
  getAllEdgeDevices,
  saveAllEdgeDevices,
  addEdgeDevice,
  updateEdgeDevice,
  deleteEdgeDevice
};

export default EdgeManagementService;
