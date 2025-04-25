
export interface ModelInfo {
  id: string;
  name: string;
  path: string;
  type?: string;
  size?: string;
  uploadedAt: string;
  cameras?: string[];
  localFilePath?: string; // Added this property to fix the TypeScript errors
}

export interface StorageServiceInterface {
  uploadModel(file: File, name: string): Promise<ModelInfo>;
  listModels(): Promise<ModelInfo[]>;
  deleteModel(modelId: string): Promise<void>;
  setActiveModel(modelName: string, modelPath: string): Promise<void>;
  getActiveModel(): Promise<{ name: string; path: string } | null>;
  getModelFileUrl(modelPath: string): Promise<string | null>;
}
