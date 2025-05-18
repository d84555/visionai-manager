
import axios from 'axios';
import { StorageServiceInterface, ModelInfo } from './StorageServiceInterface';

export default class APIStorageService implements StorageServiceInterface {
  private baseUrl: string;
  
  constructor(baseUrl = '') {
    // Default to relative path (same origin) instead of absolute URL
    this.baseUrl = baseUrl || '/api';
    console.log(`API Storage Service initialized with baseUrl: ${this.baseUrl}`);
  }

  async uploadModel(file: File, name: string, options?: any): Promise<ModelInfo> {
    try {
      // Log full URL to help with debugging
      const uploadUrl = `${this.baseUrl}/models/upload`;
      console.log(`Uploading model ${name} to ${uploadUrl}`);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name);
      
      // Add options to formData if provided
      if (options) {
        if (options.enablePyTorchSupport) {
          formData.append('enablePyTorchSupport', 'true');
        }
        if (options.convertToOnnx) {
          formData.append('convertToOnnx', 'true');
        }
      }

      // Send the request to the backend
      const response = await axios.post(uploadUrl, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        // Add timeout and better error handling
        timeout: 30000,
        validateStatus: (status) => status >= 200 && status < 300
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
      
      // Enhance error reporting
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new Error('Model upload endpoint not found. Please check server configuration.');
        } else if (error.code === 'ECONNABORTED') {
          throw new Error('Upload timed out. The model may be too large or the server is unresponsive.');
        } else if (error.response) {
          throw new Error(`Server error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
        }
      }
      
      throw error;
    }
  }
  
  async listModels(): Promise<ModelInfo[]> {
    try {
      console.log(`Fetching models list from ${this.baseUrl}/models/list`);
      const response = await axios.get(`${this.baseUrl}/models/list`, {
        validateStatus: (status) => status >= 200 && status < 300,
        timeout: 5000
      });
      
      // Check if response is HTML (indicates a server-side error or misconfiguration)
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('text/html')) {
        console.error('Received HTML response instead of JSON', response.data);
        throw new Error('Received invalid response format from server. Expected JSON, got HTML.');
      }
      
      // Fix: Check if response.data is actually an array before using map
      if (!Array.isArray(response.data)) {
        console.warn('API response is not an array:', response.data);
        
        // If response.data has a models property that's an array, use that
        if (response.data && Array.isArray(response.data.models)) {
          return response.data.models.map((model: any) => ({
            id: model.id,
            name: model.name,
            path: model.path,
            fileSize: model.fileSize,
            uploadDate: model.uploadDate,
            format: this.getFormatFromPath(model.path)
          }));
        }
        
        // If not an array and no models property, return empty array
        console.info('Returning empty array as fallback for listModels');
        return [];
      }
      
      // Original handling for when response.data is an array
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
      await axios.delete(`${this.baseUrl}/models/${modelId}`, {
        validateStatus: (status) => status >= 200 && status < 300,
        timeout: 5000
      });
      
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
      }, {
        validateStatus: (status) => status >= 200 && status < 300,
        timeout: 5000
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
      }, {
        validateStatus: (status) => status >= 200 && status < 300,
        timeout: 5000
      });
    } catch (error) {
      console.error('Error setting multiple active models:', error);
      throw error;
    }
  }
  
  async getActiveModel(): Promise<{ name: string; path: string } | null> {
    try {
      console.log(`Fetching active model from ${this.baseUrl}/models/active`);
      const response = await axios.get(`${this.baseUrl}/models/active`, {
        validateStatus: (status) => status === 200 || status === 404,
        timeout: 5000
      });
      
      // Check if response is HTML (indicates server error)
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('text/html')) {
        console.error('Received HTML response instead of JSON', response.data);
        throw new Error('Received invalid response format from server. Expected JSON, got HTML.');
      }

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
      console.log(`Fetching active models from ${this.baseUrl}/models/active-multiple`);
      const response = await axios.get(`${this.baseUrl}/models/active-multiple`, {
        validateStatus: (status) => status === 200 || status === 404,
        timeout: 5000
      });
      
      // Check if response is HTML (indicates server error)
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('text/html')) {
        console.error('Received HTML response instead of JSON', response.data);
        throw new Error('Received invalid response format from server. Expected JSON, got HTML.');
      }
      
      // Add handling for different response formats
      if (!Array.isArray(response.data)) {
        console.warn('Active models response is not an array:', response.data);
        
        // If response.data has a models property that's an array, use that
        if (response.data && Array.isArray(response.data.models)) {
          return response.data.models.map((model: any) => ({
            name: model.name,
            path: model.path
          }));
        }
        
        // If not an array and no models property, return empty array
        console.info('Returning empty array as fallback for getActiveModels');
        return [];
      }
      
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
        params: { path: modelPath },
        validateStatus: (status) => status >= 200 && status < 300,
        timeout: 5000
      });
      return response.data.url;
    } catch (error) {
      console.error('Error getting model file URL:', error);
      return null;
    }
  }
  
  private getFormatFromPath(path: string): string {
    if (!path) return 'unknown';
    
    const pathLower = path.toLowerCase();
    if (pathLower.endsWith('.onnx')) {
      return 'onnx';
    } else if (pathLower.endsWith('.pt') || pathLower.endsWith('.pth')) {
      return 'pytorch';
    } else if (pathLower.endsWith('.tflite')) {
      return 'tflite'; 
    } else if (pathLower.endsWith('.pb')) {
      return 'tensorflow';
    } else {
      return 'unknown';
    }
  }
}
