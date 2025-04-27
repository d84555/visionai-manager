
import { StorageServiceInterface, ModelInfo } from './StorageServiceInterface';

export class SimulatedStorageService implements StorageServiceInterface {
  private basePath = '/opt/visionai/';
  private modelsPath = '/opt/visionai/models/';

  async uploadModel(file: File, name: string): Promise<ModelInfo> {
    console.log(`[SIMULATED] Saving model to ${this.modelsPath}${name}`);
    
    const modelId = `custom-${Date.now()}`;
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    const fileURL = URL.createObjectURL(file);
    
    // Format path to match what useVideoFeed is expecting
    const path = `/custom_models/${name.toLowerCase().replace(/\s+/g, '_')}.onnx`;
    
    const modelInfo: ModelInfo = {
      id: modelId,
      name,
      path: path,
      type: 'Object Detection',
      size: `${fileSizeMB} MB`,
      uploadedAt: new Date().toISOString(),
      cameras: ['All Cameras']
    };

    // Store in localStorage
    const customModels = await this.listModels();
    customModels.push(modelInfo);
    localStorage.setItem('custom-ai-models', JSON.stringify(customModels));
    
    // Store file URL reference with the correct path format
    localStorage.setItem(`fs-model-${modelId}`, JSON.stringify({
      metadata: modelInfo,
      fileUrl: fileURL,
      fileExists: true,
      lastModified: new Date().toISOString()
    }));
    
    // Also store a direct path-to-URL mapping for easier lookup
    localStorage.setItem(`model-url-${path}`, fileURL);

    console.log(`[SIMULATED] Model ${name} stored with path ${path} and URL ${fileURL}`);
    return modelInfo;
  }

  async listModels(): Promise<ModelInfo[]> {
    const storedModels = localStorage.getItem('custom-ai-models');
    return storedModels ? JSON.parse(storedModels) : [];
  }

  async deleteModel(modelId: string): Promise<void> {
    const models = await this.listModels();
    const modelToDelete = models.find(model => model.id === modelId);
    
    if (modelToDelete && modelToDelete.path) {
      // Remove the path-to-URL mapping
      localStorage.removeItem(`model-url-${modelToDelete.path}`);
    }
    
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
    // First check the direct path-to-URL mapping
    const directUrl = localStorage.getItem(`model-url-${modelPath}`);
    if (directUrl) {
      console.log(`[SIMULATED] Found direct URL mapping for ${modelPath}: ${directUrl}`);
      return directUrl;
    }
    
    // Then try the old method as fallback
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('fs-model-')) {
        try {
          const modelData = JSON.parse(localStorage.getItem(key) || '{}');
          if (modelData?.metadata?.path === modelPath && modelData.fileUrl) {
            console.log(`[SIMULATED] Found model URL in fs-model data for ${modelPath}: ${modelData.fileUrl}`);
            
            // Also create a direct mapping for future lookups
            localStorage.setItem(`model-url-${modelPath}`, modelData.fileUrl);
            
            return modelData.fileUrl;
          }
        } catch (e) {
          console.error("Failed to parse model data:", e);
        }
      }
    }
    
    console.warn(`[SIMULATED] No URL found for model path: ${modelPath}`);
    return null;
  }
}
