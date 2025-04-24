
// Key additions to ensure YOLO model settings persistence

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
}

export interface CustomModel {
  id: string;
  name: string;
  path: string;
  uploadedAt: string;
  size?: string;
  cameras?: string[];
  type?: string;
}

const SettingsService = {
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
    
    console.log(`Set active model to ${name}`, modelData);
    return modelData;
  },
  
  // Upload a custom YOLO model with improved persistence
  uploadCustomModel: (file: File, name: string): Promise<{ name: string; path: string }> => {
    return new Promise((resolve, reject) => {
      // In a real implementation, this would upload the file to a server
      // or store it locally with IndexedDB or other storage mechanism
      
      // For now, we'll simulate an upload and return a mock path
      console.log(`Uploading model: ${name}`, file);
      
      // Simulate processing delay
      setTimeout(() => {
        try {
          // Generate a mock path that looks like a local file URL
          const modelPath = `/custom_models/${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.onnx`;
          
          // Get file size in MB
          const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
          
          // Generate a unique ID for the model
          const modelId = `custom-${Date.now()}`;
          
          // Create the model object with all necessary data
          const modelData = {
            id: modelId,
            name,
            path: modelPath,
            uploadedAt: new Date().toISOString(),
            size: fileSizeMB,
            cameras: ['All Cameras'],
            type: 'Object Detection'
          };
          
          // Store in custom models list
          const customModels = SettingsService.getCustomModels();
          customModels.push(modelData);
          localStorage.setItem('custom-ai-models', JSON.stringify(customModels));
          
          // Also store in the general settings under a specific key
          const settings = SettingsService.getAllSettings();
          settings.customModels = settings.customModels || [];
          settings.customModels.push(modelData);
          localStorage.setItem('avianet-settings', JSON.stringify(settings));
          
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
    
    return models;
  },
  
  // Save grid layout settings
  saveGridLayout: (settings: { layout: '1x1' | '2x2' | '3x3' | '4x4'; streamType: 'main' | 'sub' }) => {
    localStorage.setItem('grid-layout', JSON.stringify(settings));
  },
  
  // Get grid layout settings
  getGridLayout: () => {
    const savedLayout = localStorage.getItem('grid-layout');
    if (savedLayout) {
      return JSON.parse(savedLayout);
    }
    return null;
  },
  
  // Get settings for a specific category
  getSettings: (category: string) => {
    const settings = SettingsService.getAllSettings();
    return settings[category] || {};
  },
  
  // Get all settings
  getAllSettings: () => {
    const storedSettings = localStorage.getItem('avianet-settings');
    return storedSettings ? JSON.parse(storedSettings) : {};
  },
  
  // Save settings for a specific category
  saveSettings: (category: string, data: any) => {
    const settings = SettingsService.getAllSettings();
    settings[category] = { ...settings[category], ...data };
    localStorage.setItem('avianet-settings', JSON.stringify(settings));
  },
  
  // Update settings for a specific category (alias for saveSettings for clarity)
  updateSettings: (category: string, data: any) => {
    SettingsService.saveSettings(category, data);
  },
  
  // Save all settings at once
  saveAllSettings: (allSettings: Record<string, any>) => {
    localStorage.setItem('avianet-settings', JSON.stringify(allSettings));
  }
};

export default SettingsService;
