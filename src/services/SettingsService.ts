
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
  
  // Upload a custom YOLO model
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
          
          // Store in custom models list
          const customModels = SettingsService.getCustomModels();
          customModels.push({ 
            id: `custom-${Date.now()}`, 
            name, 
            path: modelPath,
            uploadedAt: new Date().toISOString()
          });
          localStorage.setItem('custom-ai-models', JSON.stringify(customModels));
          
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
    return storedModels ? JSON.parse(storedModels) : [];
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
