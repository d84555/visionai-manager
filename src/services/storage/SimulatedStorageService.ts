
import { StorageServiceInterface, ModelInfo } from './StorageServiceInterface';

export class SimulatedStorageService implements StorageServiceInterface {
  private basePath = '/opt/visionai/';
  private modelsPath = '/opt/visionai/models/';

  async uploadModel(file: File, name: string): Promise<ModelInfo> {
    console.log(`[SIMULATED] Saving model to ${this.modelsPath}${name}`);
    
    const modelId = `custom-${Date.now()}`;
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    const fileURL = URL.createObjectURL(file);
    
    const modelInfo: ModelInfo = {
      id: modelId,
      name,
      path: `/custom_models/${name.toLowerCase().replace(/\s+/g, '_')}.onnx`,
      type: 'Object Detection',
      size: `${fileSizeMB} MB`,
      uploadedAt: new Date().toISOString(),
      cameras: ['All Cameras']
    };

    // Store in localStorage
    const customModels = this.listModels();
    const modelsArray = await customModels;
    modelsArray.push(modelInfo);
    localStorage.setItem('custom-ai-models', JSON.stringify(modelsArray));
    
    // Store file URL reference
    localStorage.setItem(`fs-model-${modelId}`, JSON.stringify({
      metadata: modelInfo,
      fileUrl: fileURL,
      fileExists: true,
      lastModified: new Date().toISOString()
    }));

    return modelInfo;
  }

  async listModels(): Promise<ModelInfo[]> {
    const storedModels = localStorage.getItem('custom-ai-models');
    return storedModels ? JSON.parse(storedModels) : [];
  }

  async deleteModel(modelId: string): Promise<void> {
    const models = await this.listModels();
    const updatedModels = models.filter(model => model.id !== modelId);
    localStorage.setItem('custom-ai-models', JSON.stringify(updatedModels));
    localStorage.removeItem(`fs-model-${modelId}`);
  }

  async setActiveModel(modelName: string, modelPath: string): Promise<void> {
    const modelData = { name: modelName, path: modelPath };
    localStorage.setItem('active-ai-model', JSON.stringify(modelData));
  }

  async getActiveModel(): Promise<{ name: string; path: string } | null> {
    const storedModel = localStorage.getItem('active-ai-model');
    return storedModel ? JSON.parse(storedModel) : null;
  }

  async getModelFileUrl(modelPath: string): Promise<string | null> {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('fs-model-')) {
        try {
          const modelData = JSON.parse(localStorage.getItem(key) || '{}');
          if (modelData?.metadata?.path === modelPath && modelData.fileUrl) {
            return modelData.fileUrl;
          }
        } catch (e) {
          console.error("Failed to parse model data:", e);
        }
      }
    }
    return null;
  }
}
