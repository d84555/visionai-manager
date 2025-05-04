import { CacheService } from './CacheService';

interface GridLayout {
  layout: '1x1' | '2x2' | '3x3' | '4x4';
  streamType: 'main' | 'sub';
  pinnedCameraIds?: string[]; // Added for MultiCameraGrid
}

export interface SmtpConfig {
  server: string;
  port: number;
  username: string;
  password: string;
  useTLS: boolean;
  fromEmail: string;
  recipients: string[];
}

export interface SyslogConfig {
  server: string;
  port: number;
  protocol: 'UDP' | 'TCP';
  facility: string;
  appName: string;
}

// Adding this for SyslogConfig component
export interface SyslogSettings {
  enabled: boolean;
  server: string;
  port: number;
  protocol: 'UDP' | 'TCP';
  facility: string;
  severity: string;
}

export interface StorageConfig {
  mode: 'api' | 'simulated';
  apiUrl: string;
  recordingsPath: string;
  modelsPath: string;
  settingsPath: string;
  maxStorageDays: number;
  maxStorageGB: number;
}

// Define interfaces for the settings types
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
  serverBinaryPath: string;  // Added for server-side FFmpeg
  useServerBinary: boolean;  // Added for server-side FFmpeg
  serverTranscoding: boolean; // Added for server-side transcoding option
  transcodeFormat: 'hls' | 'mp4' | 'webm'; // Added for transcoding format selection
}

// Interface for branding settings
export interface BrandingSettings {
  logoUrl: string;
  customFooterText: string;
  useCustomFooter: boolean;
}

// Interface for custom AI models
export interface ModelInfo {
  id: string;
  name: string;
  path: string;
  size?: string;  // Making size optional
  uploadedAt?: string;
  cameras?: string[];
  format?: string; // Added to track model format (ONNX, PyTorch, etc.)
}

// Model upload options
export interface ModelUploadOptions {
  enablePyTorchSupport?: boolean;
  convertToOnnx?: boolean;
}

class SettingsService {
  // Default paths for various storage locations
  localStorageConfig: StorageConfig = {
    mode: 'api',
    apiUrl: '/api', // Changed from http://localhost:8000 to relative path
    recordingsPath: '/recordings',
    modelsPath: '/models',
    settingsPath: '/config',
    maxStorageDays: 30,
    maxStorageGB: 500
  };

  constructor() {
    // Load storage config from localStorage if available
    const savedConfig = localStorage.getItem('storage-config');
    if (savedConfig) {
      this.localStorageConfig = { ...this.localStorageConfig, ...JSON.parse(savedConfig) };
    }
  }

  // Custom models management
  getCustomModels(): ModelInfo[] {
    const modelsStr = localStorage.getItem('custom-ai-models');
    return modelsStr ? JSON.parse(modelsStr) : [];
  }

  // Helper method to determine the model format from file extension
  private getModelFormat(filename: string): string {
    if (!filename) return 'unknown';
    
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    
    if (extension === 'onnx') return 'onnx';
    if (extension === 'pt' || extension === 'pth') return 'pytorch';
    if (extension === 'tflite') return 'tflite';
    if (extension === 'pb') return 'tensorflow';
    
    return 'unknown';
  }

  async uploadCustomModel(file: File, modelName: string, options?: ModelUploadOptions): Promise<ModelInfo> {
    const format = this.getModelFormat(file.name);
    
    // Check for PyTorch model without explicit support enabled
    if (format === 'pytorch' && (!options || !options.enablePyTorchSupport)) {
      throw new Error('PyTorch models require special handling. Enable PyTorch support to continue.');
    }
    
    // Create a model info object for local storage
    const modelInfo: ModelInfo = {
      id: `custom-${Date.now()}`,
      name: modelName,
      path: `/models/${file.name}`,
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      uploadedAt: new Date().toISOString(),
      cameras: ['All Cameras'],
      format: format
    };

    try {
      // Add to local storage regardless of API success to ensure UI consistency
      const existingModels = this.getCustomModels();
      localStorage.setItem('custom-ai-models', JSON.stringify([...existingModels, modelInfo]));
      
      console.log(`Model ${modelName} (${format} format) simulated upload successful`);
      
      // In a real app with API mode, we would return the API response here
      // For now, just return the created model info
      return modelInfo;
    } catch (error) {
      console.error('Error in uploadCustomModel:', error);
      throw error;
    }
  }

  // Delete a model by ID
  deleteCustomModel(modelId: string): boolean {
    const existingModels = this.getCustomModels();
    
    // Check if model exists and is custom (has ID starting with 'custom-')
    const modelToDelete = existingModels.find(model => model.id === modelId);
    if (!modelToDelete || !modelToDelete.id.startsWith('custom-')) {
      console.error('Only custom models can be deleted');
      return false;
    }
    
    const filteredModels = existingModels.filter(model => model.id !== modelId);
    
    // If no models were removed, return false
    if (existingModels.length === filteredModels.length) {
      return false;
    }
    
    // Save the updated models list
    localStorage.setItem('custom-ai-models', JSON.stringify(filteredModels));
    
    // Check if the deleted model was active and reset if needed
    const activeModels = this.getActiveModels();
    
    if (modelToDelete && activeModels.some(m => m.path === modelToDelete.path)) {
      // Filter out the deleted model from active models
      const updatedActiveModels = activeModels.filter(m => m.path !== modelToDelete.path);
      this.setActiveModels(updatedActiveModels);
    }
    
    return true;
  }

  // SMTP Configuration
  saveSmtpConfig(config: SmtpConfig): void {
    localStorage.setItem('smtp-config', JSON.stringify(config));
  }

  getSmtpConfig(): SmtpConfig | null {
    const config = localStorage.getItem('smtp-config');
    return config ? JSON.parse(config) : null;
  }

  // Syslog Configuration
  saveSyslogConfig(config: SyslogConfig): void {
    localStorage.setItem('syslog-config', JSON.stringify(config));
  }

  getSyslogConfig(): SyslogConfig | null {
    const config = localStorage.getItem('syslog-config');
    return config ? JSON.parse(config) : null;
  }

  // Storage Configuration
  saveStorageConfig(config: StorageConfig): void {
    this.localStorageConfig = { ...this.localStorageConfig, ...config };
    localStorage.setItem('storage-config', JSON.stringify(this.localStorageConfig));
  }

  getStorageConfig(): StorageConfig {
    return this.localStorageConfig;
  }

  // Grid Layout Preferences
  saveGridLayout(layout: GridLayout): void {
    localStorage.setItem('grid-layout', JSON.stringify(layout));
  }

  getGridLayout(): GridLayout | null {
    const layout = localStorage.getItem('grid-layout');
    return layout ? JSON.parse(layout) : null;
  }

  // AI Model settings
  setActiveModel(name: string, path: string): void {
    localStorage.setItem('active-ai-models', JSON.stringify([{ name, path }]));
  }

  setActiveModels(models: { name: string; path: string }[]): void {
    localStorage.setItem('active-ai-models', JSON.stringify(models));
  }

  getActiveModel(): { name: string; path: string } | null {
    const models = this.getActiveModels();
    return models.length > 0 ? models[0] : null;
  }

  getActiveModels(): { name: string; path: string }[] {
    const modelsStr = localStorage.getItem('active-ai-models');
    return modelsStr ? JSON.parse(modelsStr) : [];
  }

  // User preferences
  saveUserPreferences(preferences: Record<string, any>): void {
    localStorage.setItem('user-preferences', JSON.stringify(preferences));
  }

  getUserPreferences(): Record<string, any> | null {
    const preferences = localStorage.getItem('user-preferences');
    return preferences ? JSON.parse(preferences) : null;
  }

  // Generic settings retrieval/storage
  getSetting(key: string): any {
    const value = localStorage.getItem(key);
    try {
      return value ? JSON.parse(value) : null;
    } catch (e) {
      return value;
    }
  }

  setSetting(key: string, value: any): void {
    if (typeof value === 'object') {
      localStorage.setItem(key, JSON.stringify(value));
    } else {
      localStorage.setItem(key, value);
    }
  }

  // Settings management methods for different sections
  getSettings(section: string): any {
    return this.getSetting(`settings-${section}`) || this.getDefaultSettings(section);
  }

  updateSettings(section: string, settings: any): void {
    this.setSetting(`settings-${section}`, settings);
  }

  saveAllSettings(allSettings: Record<string, any>): void {
    Object.entries(allSettings).forEach(([section, settings]) => {
      this.setSetting(`settings-${section}`, settings);
    });
  }

  // Default settings for each section
  private getDefaultSettings(section: string): any {
    switch (section) {
      case 'model':
        return {
          confidenceThreshold: 70,
          detectionFrequency: 3,
          maxDetections: 10,
          useHighResolution: false,
          autoApplyModel: true,
        };
      case 'video':
        return {
          defaultStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          autoStart: false,
          showOverlays: true,
          showLabels: true,
        };
      case 'alerts':
        return {
          enableNotifications: true,
          soundAlerts: false,
          minimumConfidence: 85,
          automaticDismiss: false,
        };
      case 'ffmpeg':
        return {
          corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
          customPath: false,
          localBinaryPath: '/usr/bin/ffmpeg',
          useLocalBinary: false,
          serverBinaryPath: '/usr/bin/ffmpeg',
          useServerBinary: false,
          serverTranscoding: false,
          transcodeFormat: 'hls'
        };
      case 'syslog':
        return {
          enabled: false,
          server: '',
          port: 514,
          protocol: 'UDP',
          facility: 'local0',
          severity: 'notice',
          appName: 'AVIANETVision'
        };
      case 'gridLayout':
        return {
          layout: '2x2',
          streamType: 'main',
          pinnedCameraIds: []
        };
      case 'branding':
        return {
          logoUrl: '',
          customFooterText: '',
          useCustomFooter: false
        };
      default:
        return {};
    }
  }

  // Clear all settings
  clearAll(): void {
    // Don't clear everything in localStorage, only our settings
    const keysToKeep = ['user-token', 'auth-user'];
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !keysToKeep.includes(key)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Reset the storage config to defaults
    this.localStorageConfig = {
      mode: 'api',
      apiUrl: '/api',
      recordingsPath: '/recordings',
      modelsPath: '/models',
      settingsPath: '/config',
      maxStorageDays: 30,
      maxStorageGB: 500
    };
    
    // Clear cached data
    CacheService.clearAllCaches();
  }
}

export default new SettingsService();
