
import { StorageServiceInterface, ModelInfo } from './StorageServiceInterface';
import SettingsService from '../SettingsService';

export default class SimulatedStorageService implements StorageServiceInterface {
  async uploadModel(file: File, name: string): Promise<ModelInfo> {
    return SettingsService.uploadCustomModel(file, name);
  }
  
  async listModels(): Promise<ModelInfo[]> {
    // Get models from SettingsService
    const customModels = SettingsService.getCustomModels();
    
    // Add some simulated default models if no custom models exist
    const models: ModelInfo[] = customModels.length > 0 ? customModels : [
      {
        id: 'yolo-v11',
        name: 'YOLOv11',
        path: '/models/yolov11.onnx',
        size: '23.5 MB',
        uploadedAt: new Date().toISOString()
      },
      {
        id: 'yolo-v11-tiny',
        name: 'YOLOv11-Tiny',
        path: '/models/yolov11-tiny.onnx',
        size: '6.3 MB',
        uploadedAt: new Date().toISOString()
      },
      {
        id: 'face-detection',
        name: 'Face Detection',
        path: '/models/face-detection.onnx',
        size: '15.7 MB',
        uploadedAt: new Date().toISOString()
      }
    ];
    
    return models;
  }
  
  async deleteModel(modelId: string): Promise<void> {
    // Check if this is a custom model
    if (modelId.startsWith('custom-')) {
      const success = SettingsService.deleteCustomModel(modelId);
      if (!success) {
        throw new Error('Model not found or could not be deleted');
      }
      return;
    }
    
    // For simulated models, just log the request
    console.log(`Simulating deletion of model with ID: ${modelId}`);
    
    // Throw an error for non-custom models in simulation mode
    throw new Error('Only custom models can be deleted');
  }
  
  async setActiveModel(modelName: string, modelPath: string): Promise<void> {
    SettingsService.setActiveModel(modelName, modelPath);
  }
  
  async setActiveModels(models: { name: string; path: string }[]): Promise<void> {
    SettingsService.setActiveModels(models);
  }
  
  async getActiveModel(): Promise<{ name: string; path: string } | null> {
    return SettingsService.getActiveModel();
  }
  
  async getActiveModels(): Promise<{ name: string; path: string }[]> {
    return SettingsService.getActiveModels();
  }
  
  async getModelFileUrl(modelPath: string): Promise<string | null> {
    // In simulation mode, we just return the path itself
    return modelPath;
  }
}
