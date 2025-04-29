
import { StorageServiceInterface, ModelInfo } from './StorageServiceInterface';

export class APIStorageService implements StorageServiceInterface {
  private apiBaseUrl = 'http://localhost:8000';  // Updated to remove /api prefix

  // Helper method to determine API base URL
  private getApiBaseUrl(): string {
    // Check if we're running in development or production
    const isProduction = window.location.hostname.endsWith('lovableproject.com');
    
    if (isProduction) {
      // Use relative URL to avoid CORS issues on production
      return '';
    }
    
    return this.apiBaseUrl;
  }

  async uploadModel(file: File, name: string): Promise<ModelInfo> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    
    try {
      console.log(`Uploading model to ${this.getApiBaseUrl()}/models/upload`);
      const response = await fetch(`${this.getApiBaseUrl()}/models/upload`, {
        method: 'POST',
        body: formData,
        // No Content-Type header needed - browser sets it with boundary for FormData
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: `HTTP error! Status: ${response.status}` }));
        throw new Error(error.detail || `HTTP error! Status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log("Upload successful:", result);
      return result;
    } catch (error) {
      console.error('Failed to upload model:', error);
      throw error;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      console.log(`Fetching models from ${this.getApiBaseUrl()}/models/list`);
      const response = await fetch(`${this.getApiBaseUrl()}/models/list`, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: `HTTP error! Status: ${response.status}` }));
        throw new Error(error.detail || `HTTP error! Status: ${response.status}`);
      }
      
      const models = await response.json();
      console.log("Models retrieved:", models);
      return models;
    } catch (error) {
      console.error('Failed to list models:', error);
      throw error;
    }
  }

  async deleteModel(modelId: string): Promise<void> {
    try {
      console.log(`Deleting model ${modelId}`);
      const response = await fetch(`${this.getApiBaseUrl()}/models/${modelId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: `HTTP error! Status: ${response.status}` }));
        throw new Error(error.detail || `HTTP error! Status: ${response.status}`);
      }
      
      console.log(`Model ${modelId} deleted successfully`);
    } catch (error) {
      console.error('Failed to delete model:', error);
      throw error;
    }
  }

  async setActiveModel(modelName: string, modelPath: string): Promise<void> {
    try {
      console.log(`Setting active model: ${modelName}, ${modelPath}`);
      const response = await fetch(`${this.getApiBaseUrl()}/models/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, path: modelPath })
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: `HTTP error! Status: ${response.status}` }));
        throw new Error(error.detail || `HTTP error! Status: ${response.status}`);
      }
      
      console.log("Active model set successfully");
      // Cache the active model in localStorage for quick access
      localStorage.setItem('active-ai-model', JSON.stringify({ name: modelName, path: modelPath }));
    } catch (error) {
      console.error('Failed to set active model:', error);
      throw error;
    }
  }

  async getActiveModel(): Promise<{ name: string; path: string } | null> {
    try {
      console.log(`Getting active model from ${this.getApiBaseUrl()}/models/active`);
      const response = await fetch(`${this.getApiBaseUrl()}/models/active`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log("No active model set");
          return null;
        }
        const error = await response.json().catch(() => ({ detail: `HTTP error! Status: ${response.status}` }));
        throw new Error(error.detail || `HTTP error! Status: ${response.status}`);
      }
      
      const activeModel = await response.json();
      console.log("Active model:", activeModel);
      
      // Cache the active model in localStorage for quick access
      localStorage.setItem('active-ai-model', JSON.stringify(activeModel));
      return activeModel;
    } catch (error) {
      console.error('Failed to get active model:', error);
      
      // Try to get from localStorage if API fails
      const cachedModel = localStorage.getItem('active-ai-model');
      if (cachedModel) {
        return JSON.parse(cachedModel);
      }
      
      throw error;
    }
  }

  async getModelFileUrl(modelPath: string): Promise<string | null> {
    try {
      console.log(`Getting model file URL for ${modelPath}`);
      const response = await fetch(`${this.getApiBaseUrl()}/models/file-url?path=${encodeURIComponent(modelPath)}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`Model file not found: ${modelPath}`);
          return null;
        }
        const error = await response.json().catch(() => ({ detail: `HTTP error! Status: ${response.status}` }));
        throw new Error(error.detail || `HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`Got model file URL: ${data.url}`);
      return data.url;
    } catch (error) {
      console.error('Failed to get model file URL:', error);
      throw error;
    }
  }
}
