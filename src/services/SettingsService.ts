
import { CacheService } from './CacheService';

interface GridLayout {
  layout: '1x1' | '2x2' | '3x3' | '4x4';
  streamType: 'main' | 'sub';
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

export interface StorageConfig {
  mode: 'api' | 'simulated';
  apiUrl: string;
  recordingsPath: string;
  modelsPath: string;
  settingsPath: string;
  maxStorageDays: number;
  maxStorageGB: number;
}

class SettingsService {
  // Default paths for various storage locations
  localStorageConfig: StorageConfig = {
    mode: 'api',
    apiUrl: 'http://localhost:8000',
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
      apiUrl: 'http://localhost:8000',
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
