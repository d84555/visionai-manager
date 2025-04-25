
import { StorageServiceInterface, ModelInfo } from './StorageServiceInterface';

export class APIStorageService implements StorageServiceInterface {
  private apiBaseUrl = '/api';

  async uploadModel(file: File, name: string): Promise<ModelInfo> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    
    try {
      const response = await fetch(`${this.apiBaseUrl}/models/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to upload model:', error);
      throw new Error('Failed to upload model to backend server');
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/models/list`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to list models:', error);
      throw new Error('Failed to fetch models from backend server');
    }
  }

  async deleteModel(modelId: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/models/${modelId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to delete model:', error);
      throw new Error('Failed to delete model from backend server');
    }
  }

  async setActiveModel(modelName: string, modelPath: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/models/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, path: modelPath })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to set active model:', error);
      throw new Error('Failed to set active model on backend server');
    }
  }

  async getActiveModel(): Promise<{ name: string; path: string } | null> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/models/active`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to get active model:', error);
      throw new Error('Failed to fetch active model from backend server');
    }
  }

  async getModelFileUrl(modelPath: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/models/file-url?path=${encodeURIComponent(modelPath)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error('Failed to get model file URL:', error);
      throw new Error('Failed to fetch model file URL from backend server');
    }
  }
}
