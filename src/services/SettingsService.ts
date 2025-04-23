/**
 * Settings persistence service for Avianet Vision
 * Handles loading, saving, and updating of application settings in local storage
 */

// We'll use local storage as our "database" since we don't have a backend database connection
// In a real implementation, this would be replaced with API calls to your backend

// Types for different setting categories
export interface ModelSettings {
  confidenceThreshold: number;
  detectionFrequency: number;
  maxDetections: number;
  useHighResolution: boolean;
  activeModelName?: string; // Name of the currently loaded model
  activeModelPath?: string; // Path to the currently loaded model file
  autoApplyModel: boolean;  // Whether to automatically apply the model to videos
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

export interface SyslogSettings {
  enabled: boolean;
  server: string;
  port: string;
  protocol: 'udp' | 'tcp';
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
  storageLocation: string;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export interface FFmpegSettings {
  corePath: string;
  customPath: boolean;
  localBinaryPath?: string;
  useLocalBinary: boolean;
}

export interface GridLayoutSettings {
  layout: '1x1' | '2x2' | '3x3' | '4x4';
  streamType: 'main' | 'sub';
  pinnedCameraIds?: string[]; // IDs of cameras pinned to the grid
}

export interface AppSettings {
  model: ModelSettings;
  video: VideoSettings;
  alerts: AlertSettings;
  syslog: SyslogSettings;
  smtp: SmtpSettings;
  storage: StorageSettings;
  ffmpeg: FFmpegSettings;
  gridLayout: GridLayoutSettings; // New grid layout settings
}

// Default settings to use when nothing is stored
const DEFAULT_SETTINGS: AppSettings = {
  model: {
    confidenceThreshold: 70,
    detectionFrequency: 3,
    maxDetections: 10,
    useHighResolution: false,
    activeModelName: 'YOLOv11',
    activeModelPath: '/models/yolov11.onnx',
    autoApplyModel: true,
  },
  video: {
    defaultStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    autoStart: false,
    showOverlays: true,
    showLabels: true,
  },
  alerts: {
    enableNotifications: true,
    soundAlerts: false,
    minimumConfidence: 85,
    automaticDismiss: false,
  },
  syslog: {
    enabled: false,
    server: '',
    port: '514',
    protocol: 'udp',
    facility: 'local0',
    severity: 'notice',
  },
  smtp: {
    enabled: false,
    server: '',
    port: '25',
    username: '',
    password: '',
    useTLS: true,
    fromAddress: '',
  },
  storage: {
    retentionDays: 30,
    storageLocation: 'local',
    compressionEnabled: true,
    encryptionEnabled: false,
  },
  ffmpeg: {
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
    customPath: false,
    localBinaryPath: '/usr/bin/ffmpeg',
    useLocalBinary: false,
  },
  gridLayout: {
    layout: '2x2',
    streamType: 'main',
    pinnedCameraIds: []
  }
};

// Storage keys
const SETTINGS_STORAGE_KEY = 'avianet-vision-settings';
const EDGE_DEVICES_KEY = 'avianet-vision-edge-devices';

/**
 * Load all settings from storage
 */
export const loadAllSettings = (): AppSettings => {
  try {
    const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (storedSettings) {
      return JSON.parse(storedSettings) as AppSettings;
    }
  } catch (error) {
    console.error('Failed to load settings from storage:', error);
  }
  
  // If loading fails or nothing is stored, return defaults
  return DEFAULT_SETTINGS;
};

/**
 * Save all settings to storage
 */
export const saveAllSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings to storage:', error);
  }
};

/**
 * Update a specific category of settings
 */
export const updateSettings = <K extends keyof AppSettings>(
  category: K, 
  newSettings: AppSettings[K]
): void => {
  const allSettings = loadAllSettings();
  const updatedSettings = {
    ...allSettings,
    [category]: newSettings
  };
  saveAllSettings(updatedSettings);
};

/**
 * Get settings for a specific category
 */
export const getSettings = <K extends keyof AppSettings>(
  category: K
): AppSettings[K] => {
  const allSettings = loadAllSettings();
  return allSettings[category];
};

/**
 * Reset all settings to default values
 */
export const resetAllSettings = (): void => {
  saveAllSettings(DEFAULT_SETTINGS);
};

/**
 * Reset a specific category of settings to default values
 */
export const resetCategorySettings = <K extends keyof AppSettings>(
  category: K
): void => {
  const allSettings = loadAllSettings();
  const updatedSettings = {
    ...allSettings,
    [category]: DEFAULT_SETTINGS[category]
  };
  saveAllSettings(updatedSettings);
};

/**
 * Set the currently active YOLO model
 * @param modelName Name of the model
 * @param modelPath Path to the model file
 */
export const setActiveModel = (modelName: string, modelPath: string): void => {
  const modelSettings = getSettings('model');
  updateSettings('model', {
    ...modelSettings,
    activeModelName: modelName,
    activeModelPath: modelPath
  });
};

/**
 * Get the active YOLO model information
 * @returns Object containing model name and path, or undefined if not set
 */
export const getActiveModel = (): { name: string; path: string } | undefined => {
  const modelSettings = getSettings('model');
  if (modelSettings.activeModelName && modelSettings.activeModelPath) {
    return {
      name: modelSettings.activeModelName,
      path: modelSettings.activeModelPath
    };
  }
  return undefined;
};

/**
 * Save grid layout configuration
 * @param layout Grid layout configuration
 */
export const saveGridLayout = (layout: GridLayoutSettings): void => {
  updateSettings('gridLayout', layout);
};

/**
 * Get saved grid layout configuration
 * @returns The saved grid layout or default if not found
 */
export const getGridLayout = (): GridLayoutSettings => {
  return getSettings('gridLayout');
};

const SettingsService = {
  loadAllSettings,
  saveAllSettings,
  updateSettings,
  getSettings,
  resetAllSettings,
  resetCategorySettings,
  setActiveModel,
  getActiveModel,
  saveGridLayout,
  getGridLayout,
};

export default SettingsService;
