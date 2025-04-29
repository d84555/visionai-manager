
import { StorageServiceInterface, ModelInfo } from './StorageServiceInterface';

export class SimulatedStorageService implements StorageServiceInterface {
  // Simulate model storage using localStorage
  private readonly MODELS_KEY = 'simulated-models';
  private readonly ACTIVE_MODELS_KEY = 'active-ai-models';

  constructor() {
    // Initialize with some demo models if none exist
    if (!localStorage.getItem(this.MODELS_KEY)) {
      const initialModels: ModelInfo[] = [
        { 
          id: 'yolov8n', 
          name: 'YOLOv8 Nano', 
          path: '/models/yolov8n.pt',
          fileSize: 6800000,
          uploadDate: new Date(Date.now() - 86400000 * 7).toISOString(),
          format: 'pt'
        },
        { 
          id: 'yolov8s', 
          name: 'YOLOv8 Small', 
          path: '/models/yolov8s.pt',
          fileSize: 22900000,
          uploadDate: new Date(Date.now() - 86400000 * 5).toISOString(),
          format: 'pt'
        },
        { 
          id: 'helmet-det', 
          name: 'Helmet Detection', 
          path: '/models/helmet-detection.onnx',
          fileSize: 14500000,
          uploadDate: new Date(Date.now() - 86400000 * 2).toISOString(),
          format: 'onnx'
        }
      ];
      localStorage.setItem(this.MODELS_KEY, JSON.stringify(initialModels));
    }
  }

  async uploadModel(file: File, name: string): Promise<ModelInfo> {
    // Generate a unique ID for the model
    const id = `model-${Date.now()}`;
    
    // Use either the provided name or derive it from the file name
    const displayName = name.trim() || this.getDisplayNameFromFile(file);
    
    // Determine the file format from the extension
    const pathParts = file.name.split('.');
    const format = pathParts.length > 1 ? pathParts[pathParts.length - 1] : 'unknown';
    
    const model: ModelInfo = {
      id,
      name: displayName,
      path: `/models/${file.name}`, // In a real implementation, this would be the path where the file is stored
      fileSize: file.size,
      uploadDate: new Date().toISOString(),
      format
    };

    // Read the current models
    const existingModelsStr = localStorage.getItem(this.MODELS_KEY) || '[]';
    const existingModels: ModelInfo[] = JSON.parse(existingModelsStr);

    // Add the new model
    existingModels.push(model);

    // Save the updated models list
    localStorage.setItem(this.MODELS_KEY, JSON.stringify(existingModels));

    // Simulate some network latency
    await new Promise(resolve => setTimeout(resolve, 500));

    return model;
  }

  // Helper function to get a display name from file
  private getDisplayNameFromFile(file: File): string {
    // Remove extension and replace special characters
    const nameParts = file.name.split('.');
    const extension = nameParts.pop() || '';
    const baseName = nameParts.join('.');
    
    // Clean up the name to be display-friendly
    return baseName.replace(/[-_]/g, ' ').trim() || `Model-${new Date().getTime()}`;
  }

  async listModels(): Promise<ModelInfo[]> {
    // Read the models from localStorage
    const modelsStr = localStorage.getItem(this.MODELS_KEY) || '[]';
    const models: ModelInfo[] = JSON.parse(modelsStr);

    // Simulate some network latency
    await new Promise(resolve => setTimeout(resolve, 300));

    return models;
  }

  async deleteModel(modelId: string): Promise<void> {
    // Read the current models
    const existingModelsStr = localStorage.getItem(this.MODELS_KEY) || '[]';
    const existingModels: ModelInfo[] = JSON.parse(existingModelsStr);

    // Filter out the model to delete
    const updatedModels = existingModels.filter(model => model.id !== modelId);

    // Save the updated models list
    localStorage.setItem(this.MODELS_KEY, JSON.stringify(updatedModels));

    // Simulate some network latency
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  async setActiveModel(modelName: string, modelPath: string): Promise<void> {
    // Save the active model in localStorage
    const activeModel = { name: modelName, path: modelPath };
    localStorage.setItem(this.ACTIVE_MODELS_KEY, JSON.stringify([activeModel]));
    
    // Simulate some network latency
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  async setActiveModels(models: { name: string; path: string }[]): Promise<void> {
    // Save the active models in localStorage
    localStorage.setItem(this.ACTIVE_MODELS_KEY, JSON.stringify(models));
    
    // Simulate some network latency
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  async getActiveModel(): Promise<{ name: string; path: string } | null> {
    // Get the active model from localStorage
    const activeModelsStr = localStorage.getItem(this.ACTIVE_MODELS_KEY);
    if (!activeModelsStr) return null;
    
    const activeModels = JSON.parse(activeModelsStr);
    return activeModels.length > 0 ? activeModels[0] : null;
  }

  async getActiveModels(): Promise<{ name: string; path: string }[]> {
    // Get the active models from localStorage
    const activeModelsStr = localStorage.getItem(this.ACTIVE_MODELS_KEY);
    return activeModelsStr ? JSON.parse(activeModelsStr) : [];
  }

  async getModelFileUrl(modelPath: string): Promise<string | null> {
    // In a simulated environment, we don't have actual file URLs, so we'll return the path as is
    return modelPath;
  }
}
