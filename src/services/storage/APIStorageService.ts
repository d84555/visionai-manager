
import { StorageServiceInterface, ModelInfo } from './StorageServiceInterface';

export class APIStorageService implements StorageServiceInterface {
  private apiBaseUrl = 'http://localhost:8000';  // Updated to remove /api prefix

  async uploadModel(file: File, name: string): Promise<ModelInfo> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    
    try {
      const response = await fetch(`${this.apiBaseUrl}/models/upload`, {
        method: 'POST',
        body: formData,
        // No Content-Type header needed - browser sets it with boundary for FormData
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `HTTP error! Status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to upload model:', error);
      throw error;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/models/list`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `HTTP error! Status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to list models:', error);
      throw error;
    }
  }

  async deleteModel(modelId: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/models/${modelId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `HTTP error! Status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to delete model:', error);
      throw error;
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
        const error = await response.json();
        throw new Error(error.detail || `HTTP error! Status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to set active model:', error);
      throw error;
    }
  }

  async getActiveModel(): Promise<{ name: string; path: string } | null> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/models/active`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const error = await response.json();
        throw new Error(error.detail || `HTTP error! Status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to get active model:', error);
      throw error;
    }
  }

  async getModelFileUrl(modelPath: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/models/file-url?path=${encodeURIComponent(modelPath)}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const error = await response.json();
        throw new Error(error.detail || `HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error('Failed to get model file URL:', error);
      throw error;
    }
  }
}
