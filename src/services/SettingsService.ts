
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
}

// Complete settings object structure
export interface AppSettings {
  model: ModelSettings;
  video: VideoSettings;
  alerts: AlertSettings;
  syslog: SyslogSettings;
  smtp: SmtpSettings;
  storage: StorageSettings;
  ffmpeg: FFmpegSettings;
}

// Default settings to use when nothing is stored
const DEFAULT_SETTINGS: AppSettings = {
  model: {
    confidenceThreshold: 70,
    detectionFrequency: 3,
    maxDetections: 10,
    useHighResolution: false,
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
  },
};

// Storage keys
const SETTINGS_STORAGE_KEY = 'avianet-vision-settings';

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

const SettingsService = {
  loadAllSettings,
  saveAllSettings,
  updateSettings,
  getSettings,
  resetAllSettings,
  resetCategorySettings,
};

export default SettingsService;
