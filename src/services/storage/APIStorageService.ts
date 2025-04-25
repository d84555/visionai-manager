
import { StorageServiceInterface, ModelInfo } from './StorageServiceInterface';

export class APIStorageService implements StorageServiceInterface {
  private apiBaseUrl = '/api'; // Will be configured when implementing real backend

  async uploadModel(file: File, name: string): Promise<ModelInfo> {
    throw new Error('API Storage Service not implemented yet');
    // Future implementation:
    // const formData = new FormData();
    // formData.append('file', file);
    // formData.append('name', name);
    // const response = await fetch(`${this.apiBaseUrl}/models/upload`, {
    //   method: 'POST',
    //   body: formData
    // });
    // return response.json();
  }

  async listModels(): Promise<ModelInfo[]> {
    throw new Error('API Storage Service not implemented yet');
    // Future implementation:
    // const response = await fetch(`${this.apiBaseUrl}/models/list`);
    // return response.json();
  }

  async deleteModel(modelId: string): Promise<void> {
    throw new Error('API Storage Service not implemented yet');
    // Future implementation:
    // await fetch(`${this.apiBaseUrl}/models/${modelId}`, {
    //   method: 'DELETE'
    // });
  }

  async setActiveModel(modelName: string, modelPath: string): Promise<void> {
    throw new Error('API Storage Service not implemented yet');
    // Future implementation:
    // await fetch(`${this.apiBaseUrl}/models/select`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ name: modelName, path: modelPath })
    // });
  }

  async getActiveModel(): Promise<{ name: string; path: string } | null> {
    throw new Error('API Storage Service not implemented yet');
    // Future implementation:
    // const response = await fetch(`${this.apiBaseUrl}/models/active`);
    // return response.json();
  }

  async getModelFileUrl(modelPath: string): Promise<string | null> {
    throw new Error('API Storage Service not implemented yet');
    // Future implementation:
    // const response = await fetch(`${this.apiBaseUrl}/models/file-url?path=${encodeURIComponent(modelPath)}`);
    // const data = await response.json();
    // return data.url;
  }
}
