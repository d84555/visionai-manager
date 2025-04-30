
import axios from 'axios';
import { StorageServiceInterface, ModelInfo } from './StorageServiceInterface';

export default class APIStorageService implements StorageServiceInterface {
  private baseUrl: string;
  
  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  async uploadModel(file: File, name: string): Promise<ModelInfo> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name);
      
      const response = await axios.post(`${this.baseUrl}/models/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      const result = response.data;
      
      return {
        id: result.id,
        name: result.name,
        path: result.path,
        fileSize: result.fileSize,
        uploadDate: result.uploadDate,
        format: this.getFormatFromPath(result.path)
      };
    } catch (error) {
      console.error('Error uploading model:', error);
      throw error;
    }
  }
  
  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/models/list`);
      return response.data.map((model: any) => ({
        id: model.id,
        name: model.name,
        path: model.path,
        fileSize: model.fileSize,
        uploadDate: model.uploadDate,
        format: this.getFormatFromPath(model.path)
      }));
    } catch (error) {
      console.error('Error listing models:', error);
      throw error;
    }
  }
  
  async deleteModel(modelId: string): Promise<void> {
    try {
      // Make a DELETE request to remove the model
      await axios.delete(`${this.baseUrl}/models/${modelId}`);
      
      // Check if the model was active and reset active model if needed
      const activeModel = await this.getActiveModel();
      
      if (activeModel) {
        // We would need to check if the deleted model was active
        // This would require additional API call or storing model IDs with paths
        // For now, we'll handle this in the ModelSelector component
      }
    } catch (error) {
      console.error('Error deleting model:', error);
      throw error;
    }
  }
  
  async setActiveModel(modelName: string, modelPath: string): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/models/select`, {
        name: modelName,
        path: modelPath
      });
    } catch (error) {
      console.error('Error setting active model:', error);
      throw error;
    }
  }
  
  async setActiveModels(models: { name: string; path: string }[]): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/models/select-multiple`, {
        models: models
      });
    } catch (error) {
      console.error('Error setting multiple active models:', error);
      throw error;
    }
  }
  
  async getActiveModel(): Promise<{ name: string; path: string } | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/models/active`);
      return response.data ? {
        name: response.data.name,
        path: response.data.path
      } : null;
    } catch (error) {
      // If no active model is set, the API returns 404
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error('Error getting active model:', error);
      throw error;
    }
  }
  
  async getActiveModels(): Promise<{ name: string; path: string }[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/models/active-multiple`);
      return response.data.map((model: any) => ({
        name: model.name,
        path: model.path
      }));
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return [];
      }
      console.error('Error getting active models:', error);
      throw error;
    }
  }
  
  async getModelFileUrl(modelPath: string): Promise<string | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/models/file-url`, {
        params: { path: modelPath }
      });
      return response.data.url;
    } catch (error) {
      console.error('Error getting model file URL:', error);
      return null;
    }
  }
  
  private getFormatFromPath(path: string): string {
    if (path.toLowerCase().endsWith('.onnx')) {
      return 'onnx';
    } else if (path.toLowerCase().endsWith('.pt') || path.toLowerCase().endsWith('.pth')) {
      return 'pytorch';
    } else {
      return 'unknown';
    }
  }
}
