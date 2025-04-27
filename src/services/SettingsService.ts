import StorageServiceFactory from './storage/StorageServiceFactory';
import { ModelInfo } from './storage/StorageServiceInterface';

// Define types for settings
export interface ModelSettings {
  confidenceThreshold: number;
  detectionFrequency: number;
  maxDetections: number;
  useHighResolution: boolean;
  autoApplyModel: boolean;
}

export interface VideoSettings {
  defaultStreamUrl: string;
  autoStart: boolean;
  showOverlays: boolean;
  showLabels: boolean;
}

export interface AlertSettings {
  enableNotifications: boolean;
  soundAlerts: boolean;
  minimumConfidence: number;
  automaticDismiss: boolean;
}

export interface FFmpegSettings {
  corePath: string;
  customPath: boolean;
  localBinaryPath: string;
  useLocalBinary: boolean;
}

export interface SyslogSettings {
  enabled: boolean;
  server: string;
  port: string;
  protocol: string;
  facility: string;
  severity: string;
}

export interface SmtpSettings {
  enabled: boolean;
  server: string;
  port: string;
  username: string;
  password: string;
  useTLS: boolean;
  fromAddress: string;
}

export interface StorageSettings {
  retentionDays: number;
  maxStorageGB: number;
  storageLocation: string;
  compressionEnabled: boolean;
  modelStoragePath: string;
}

export interface CustomModel {
  id: string;
  name: string;
  path: string;
  uploadedAt: string;
  size?: string;
  cameras?: string[];
  type?: string;
  localFilePath?: string; // Physical file path on disk
}

// Local storage directory configuration
interface LocalStorageConfig {
  basePath: string;
  modelsPath: string;
  settingsPath: string;
  enabled: boolean;
}

const SettingsService = {
  // Local storage configuration
  localStorageConfig: {
    basePath: '/opt/visionai/',  // Changed from /var/lib/visionai/ to /opt/visionai/
    modelsPath: '/opt/visionai/models/',  // Changed path
    settingsPath: '/opt/visionai/settings/',  // Changed path
    enabled: true // Whether local storage is enabled
  } as LocalStorageConfig,
  
  // Initialize local storage paths
  initLocalStorage: () => {
    try {
      // IMPORTANT NOTE: Browser Security Sandbox
      // In a web browser environment, we cannot directly access the file system
      // This would require server-side code (Node.js) or Electron for filesystem access
      console.log("Local storage initialized with base path:", SettingsService.localStorageConfig.basePath);
      console.log("NOTE: In browser environment, this is simulated storage only.");
      
      // Store the config in localStorage for simulated persistence
      localStorage.setItem('local-storage-config', JSON.stringify(SettingsService.localStorageConfig));
      
      return true;
    } catch (error) {
      console.error("Failed to initialize local storage:", error);
      return false;
    }
  },
  
  // Update local storage configuration
  updateLocalStorageConfig: (config: Partial<LocalStorageConfig>) => {
    SettingsService.localStorageConfig = {
      ...SettingsService.localStorageConfig,
      ...config
    };
    
    localStorage.setItem('local-storage-config', JSON.stringify(SettingsService.localStorageConfig));
    console.log("Updated local storage configuration:", SettingsService.localStorageConfig);
    
    return SettingsService.localStorageConfig;
  },
  
  // Get local storage configuration
  getLocalStorageConfig: (): LocalStorageConfig => {
    const storedConfig = localStorage.getItem('local-storage-config');
    if (storedConfig) {
      return JSON.parse(storedConfig);
    }
    return SettingsService.localStorageConfig;
  },

  // Get active AI model - now returns the model directly instead of a promise
  getActiveModel: () => {
    const storageService = StorageServiceFactory.getService();
    try {
      // Get from localStorage first for synchronous access
      const storedModel = localStorage.getItem('active-ai-model');
      if (storedModel) {
        return JSON.parse(storedModel);
      }
      return null;
    } catch (e) {
      console.error("Error getting active model:", e);
      return null;
    }
  },
  
  // Set active AI model - now returns void instead of a promise
  setActiveModel: (name: string, path: string) => {
    const storageService = StorageServiceFactory.getService();
    // Store in localStorage for synchronous access
    localStorage.setItem('active-ai-model', JSON.stringify({ name, path }));
    // Also store via service (asynchronously)
    storageService.setActiveModel(name, path).catch(e => {
      console.error("Error setting active model:", e);
    });
    return { name, path };
  },
  
  // Upload a custom YOLO model
  uploadCustomModel: (file: File, name: string): Promise<ModelInfo> => {
    const storageService = StorageServiceFactory.getService();
    return storageService.uploadModel(file, name);
  },
  
  // Get list of custom models - now returns array directly instead of promise
  getCustomModels: (): ModelInfo[] => {
    try {
      const storedModels = localStorage.getItem('custom-ai-models');
      return storedModels ? JSON.parse(storedModels) : [];
    } catch (e) {
      console.error("Error getting custom models:", e);
      return [];
    }
  },
  
  // Save grid layout settings
  saveGridLayout: (settings: { layout: '1x1' | '2x2' | '3x3' | '4x4'; streamType: 'main' | 'sub' }) => {
    localStorage.setItem('grid-layout', JSON.stringify(settings));
    
    // Also save to simulated local file system
    if (SettingsService.localStorageConfig.enabled) {
      console.log(`Saving grid layout to ${SettingsService.localStorageConfig.settingsPath}grid-layout.json`);
      localStorage.setItem('fs-grid-layout', JSON.stringify(settings));
    }
  },
  
  // Get grid layout settings
  getGridLayout: () => {
    // Try to load from filesystem simulation first
    const fsLayout = localStorage.getItem('fs-grid-layout');
    if (fsLayout) {
      return JSON.parse(fsLayout);
    }
    
    // Fall back to normal localStorage
    const savedLayout = localStorage.getItem('grid-layout');
    if (savedLayout) {
      return JSON.parse(savedLayout);
    }
    return null;
  },
  
  // Get settings for a specific category
  getSettings: (category: string) => {
    // Try to load from filesystem simulation first
    const fsSettings = localStorage.getItem(`fs-settings-${category}`);
    if (fsSettings) {
      return JSON.parse(fsSettings);
    }
    
    // Fall back to normal settings
    const settings = SettingsService.getAllSettings();
    return settings[category] || {};
  },
  
  // Get all settings
  getAllSettings: () => {
    // Try to load from filesystem simulation first
    const fsAllSettings = localStorage.getItem('fs-all-settings');
    if (fsAllSettings) {
      return JSON.parse(fsAllSettings);
    }
    
    // Fall back to normal localStorage
    const storedSettings = localStorage.getItem('avianet-settings');
    return storedSettings ? JSON.parse(storedSettings) : {};
  },
  
  // Save settings for a specific category
  saveSettings: (category: string, data: any) => {
    const settings = SettingsService.getAllSettings();
    settings[category] = { ...settings[category], ...data };
    localStorage.setItem('avianet-settings', JSON.stringify(settings));
    
    // Also save to simulated local file system
    if (SettingsService.localStorageConfig.enabled) {
      console.log(`Saving ${category} settings to ${SettingsService.localStorageConfig.settingsPath}${category}.json`);
      localStorage.setItem(`fs-settings-${category}`, JSON.stringify(settings[category]));
      localStorage.setItem('fs-all-settings', JSON.stringify(settings));
    }
  },
  
  // Update settings for a specific category (alias for saveSettings for clarity)
  updateSettings: (category: string, data: any) => {
    SettingsService.saveSettings(category, data);
  },
  
  // Save all settings at once
  saveAllSettings: (allSettings: Record<string, any>) => {
    localStorage.setItem('avianet-settings', JSON.stringify(allSettings));
    
    // Also save to simulated local file system
    if (SettingsService.localStorageConfig.enabled) {
      console.log(`Saving all settings to ${SettingsService.localStorageConfig.settingsPath}all-settings.json`);
      localStorage.setItem('fs-all-settings', JSON.stringify(allSettings));
    }
  },
  
  // Get the Blob URL for a model file (if available)
  getModelFileUrl: (modelPath: string) => {
    // First try direct mapping (new approach)
    const directUrl = localStorage.getItem(`model-url-${modelPath}`);
    if (directUrl) {
      console.log(`Found direct URL mapping for ${modelPath}: ${directUrl}`);
      return directUrl;
    }

    // Look through stored model data to find the Blob URL (old approach)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('fs-model-')) {
        try {
          const modelData = JSON.parse(localStorage.getItem(key) || '{}');
          if (modelData?.metadata?.path === modelPath && modelData.fileUrl) {
            // Store for future direct lookups
            localStorage.setItem(`model-url-${modelPath}`, modelData.fileUrl);
            console.log(`Found and stored URL for ${modelPath}: ${modelData.fileUrl}`);
            return modelData.fileUrl;
          }
        } catch (e) {
          console.error("Failed to parse model data:", e);
        }
      }
    }
    
    console.warn(`No URL found for model path: ${modelPath}`);
    return null;
  },

  // Add a helper method to create a test model for debugging
  createTestModel: (name: string, path: string) => {
    const modelId = `test-${Date.now()}`;
    const modelInfo = {
      id: modelId,
      name: name,
      path: path,
      type: 'Object Detection',
      size: '5.2 MB',
      uploadedAt: new Date().toISOString(),
      cameras: ['All Cameras']
    };
    
    // Create a small test blob
    const blob = new Blob(['Test model data'], { type: 'application/octet-stream' });
    const fileURL = URL.createObjectURL(blob);
    
    // Store model data
    localStorage.setItem(`fs-model-${modelId}`, JSON.stringify({
      metadata: modelInfo,
      fileUrl: fileURL,
      fileExists: true,
      lastModified: new Date().toISOString()
    }));
    
    // Create direct mapping
    localStorage.setItem(`model-url-${path}`, fileURL);
    
    // Add to custom models list
    const customModels = SettingsService.getCustomModels();
    customModels.push(modelInfo);
    localStorage.setItem('custom-ai-models', JSON.stringify(customModels));
    
    console.log(`Created test model ${name} with path ${path} and URL ${fileURL}`);
    return modelInfo;
  }
};

// Initialize local storage on module load
SettingsService.initLocalStorage();

// Create a test model if no models exist (for debugging)
setTimeout(() => {
  const models = SettingsService.getCustomModels();
  if (models.length === 0) {
    console.log("No models found, creating a test model...");
    const testModel = SettingsService.createTestModel("YOLO Test Model", "/custom_models/coverall.onnx");
    SettingsService.setActiveModel(testModel.name, testModel.path);
  }
}, 1000);

export default SettingsService;
