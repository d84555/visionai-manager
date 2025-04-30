
export interface ModelInfo {
  id: string;
  name: string;
  path: string;
  fileSize?: number;
  uploadDate?: string;
  format?: string;
}

export interface StorageServiceInterface {
  uploadModel(file: File, name: string, options?: any): Promise<ModelInfo>;
  listModels(): Promise<ModelInfo[]>;
  deleteModel(modelId: string): Promise<void>;
  setActiveModel(modelName: string, modelPath: string): Promise<void>;
  setActiveModels(models: { name: string; path: string }[]): Promise<void>;  
  getActiveModel(): Promise<{ name: string; path: string } | null>;
  getActiveModels(): Promise<{ name: string; path: string }[]>;
  getModelFileUrl(modelPath: string): Promise<string | null>;
}
