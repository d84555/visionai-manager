
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
  modelStoragePath: string; // Added this field for custom model storage path
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
    basePath: '/var/lib/visionai/',
    modelsPath: '/var/lib/visionai/models/',
    settingsPath: '/var/lib/visionai/settings/',
    enabled: true // Whether local storage is enabled
  } as LocalStorageConfig,
  
  // Initialize local storage paths
  initLocalStorage: () => {
    try {
      // In a browser environment, we can't directly access the file system
      // This would need to be implemented with Node.js, Electron, or server-side integration
      console.log("Local storage initialized with base path:", SettingsService.localStorageConfig.basePath);
      
      // For now, we'll use localStorage with a fallback mechanism for persistence
      // We'll add proper filesystem support when running in an Electron or Node.js environment
      
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

  // Get active AI model
  getActiveModel: () => {
    const storedModel = localStorage.getItem('active-ai-model');
    if (storedModel) {
      return JSON.parse(storedModel);
    }
    
    // Return default model if none is stored
    return {
      name: 'YOLOv11 Base',
      path: '/models/yolov11.onnx'
    };
  },
  
  // Set active AI model - improved to ensure persistence
  setActiveModel: (name: string, path: string) => {
    const modelData = { name, path };
    localStorage.setItem('active-ai-model', JSON.stringify(modelData));
    
    // Store in a secondary location for redundancy
    const settings = SettingsService.getAllSettings();
    settings.ai = settings.ai || {};
    settings.ai.activeModel = modelData;
    localStorage.setItem('avianet-settings', JSON.stringify(settings));
    
    // Also save to local file system if enabled
    if (SettingsService.localStorageConfig.enabled) {
      // In a real implementation, this would write to a file
      console.log(`Saving active model to ${SettingsService.localStorageConfig.settingsPath}active-model.json`);
      // For now, we'll use localStorage as a simulation of file system persistence
      localStorage.setItem('fs-active-model', JSON.stringify(modelData));
    }
    
    console.log(`Set active model to ${name}`, modelData);
    return modelData;
  },
  
  // Upload a custom YOLO model with improved persistence
  uploadCustomModel: (file: File, name: string): Promise<{ name: string; path: string }> => {
    return new Promise((resolve, reject) => {
      // Calculate file size in MB
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
      
      // Generate a mock path that looks like a local file URL
      const fileName = `${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.onnx`;
      const modelPath = `/custom_models/${fileName}`;
      
      // Generate a unique ID for the model
      const modelId = `custom-${Date.now()}`;
      
      // For filesystem storage, determine the physical path
      const localFilePath = SettingsService.localStorageConfig.modelsPath + fileName;
      
      // Create the model object with all necessary data
      const modelData: CustomModel = {
        id: modelId,
        name,
        path: modelPath,
        uploadedAt: new Date().toISOString(),
        size: fileSizeMB,
        cameras: ['All Cameras'],
        type: 'Object Detection',
        localFilePath // Add the physical file path
      };
      
      // In a real implementation with file system access:
      // 1. We would save the file to the localFilePath
      // 2. Create any necessary directories
      // 3. Handle file system permissions
      
      // For browser simulation purposes, we'll:
      // 1. Create a blob URL to simulate file access
      // 2. Store the file content in IndexedDB (not implemented here)
      // 3. Use localStorage for metadata
      
      // Simulate processing delay
      setTimeout(() => {
        try {
          console.log(`[FILESYSTEM] Saving model file to: ${localFilePath}`);
          console.log(`File size: ${fileSizeMB}, Model ID: ${modelId}`);
          
          // Store in custom models list
          const customModels = SettingsService.getCustomModels();
          customModels.push(modelData);
          localStorage.setItem('custom-ai-models', JSON.stringify(customModels));
          
          // Also store in the general settings under a specific key
          const settings = SettingsService.getAllSettings();
          settings.customModels = settings.customModels || [];
          settings.customModels.push(modelData);
          localStorage.setItem('avianet-settings', JSON.stringify(settings));
          
          // For filesystem simulation
          localStorage.setItem(`fs-model-${modelId}`, JSON.stringify({
            metadata: modelData,
            // In a real implementation, we would save the file content or a reference to it
            fileExists: true,
            lastModified: new Date().toISOString()
          }));
          
          // Also set as active model
          SettingsService.setActiveModel(name, modelPath);
          
          resolve({ name, path: modelPath });
        } catch (error) {
          console.error('Error uploading model:', error);
          reject(error);
        }
      }, 1500);
    });
  },
  
  // Get list of custom models
  getCustomModels: () => {
    const storedModels = localStorage.getItem('custom-ai-models');
    const models = storedModels ? JSON.parse(storedModels) : [];
    
    // Also check in general settings as a fallback and for redundancy
    if (models.length === 0) {
      const settings = SettingsService.getAllSettings();
      if (settings.customModels && settings.customModels.length > 0) {
        // Restore models from settings and update the dedicated storage
        localStorage.setItem('custom-ai-models', JSON.stringify(settings.customModels));
        return settings.customModels;
      }
    }
    
    // For filesystem simulation, check for any models stored with the fs- prefix
    const fsModels: CustomModel[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('fs-model-')) {
        try {
          const modelData = JSON.parse(localStorage.getItem(key) || '{}');
          if (modelData && modelData.metadata) {
            fsModels.push(modelData.metadata);
          }
        } catch (e) {
          console.error("Failed to parse model data:", e);
        }
      }
    }
    
    // Merge filesystem models with localStorage models, avoiding duplicates
    if (fsModels.length > 0) {
      const mergedModels = [...models];
      for (const fsModel of fsModels) {
        if (!mergedModels.some(m => m.id === fsModel.id)) {
          mergedModels.push(fsModel);
        }
      }
      return mergedModels;
    }
    
    return models;
  },
  
  // Save grid layout settings
  saveGridLayout: (settings: { layout: '1x1' | '2x2' | '3x3' | '4x4'; streamType: 'main' | 'sub' }) => {
    localStorage.setItem('grid-layout', JSON.stringify(settings));
    
    // Also save to local file system if enabled
    if (SettingsService.localStorageConfig.enabled) {
      // In a real implementation, this would write to a file
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
    
    // Also save to local file system if enabled
    if (SettingsService.localStorageConfig.enabled) {
      // In a real implementation, this would write to a file
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
    
    // Also save to local file system if enabled
    if (SettingsService.localStorageConfig.enabled) {
      // In a real implementation, this would write to a file
      console.log(`Saving all settings to ${SettingsService.localStorageConfig.settingsPath}all-settings.json`);
      localStorage.setItem('fs-all-settings', JSON.stringify(allSettings));
    }
  }
};

// Initialize local storage on module load
SettingsService.initLocalStorage();

export default SettingsService;
