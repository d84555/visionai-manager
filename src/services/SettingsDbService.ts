
import databaseService from './DatabaseService';
import SettingsService, { 
  ModelSettings,
  VideoSettings,
  AlertSettings,
  FFmpegSettings,
  BrandingSettings,
  EventsSettings,
  SmtpConfig,
  SyslogConfig,
  StorageConfig,
  GridLayout
} from './SettingsService';
import { toast } from 'sonner';

type SettingsType = 
  | ModelSettings 
  | VideoSettings 
  | AlertSettings 
  | FFmpegSettings 
  | BrandingSettings 
  | EventsSettings 
  | SmtpConfig 
  | SyslogConfig
  | StorageConfig
  | GridLayout
  | Record<string, any>;

class SettingsDbService {
  // Initialize the service - migrate existing settings to DB
  async initialize(): Promise<void> {
    try {
      console.log('Initializing SettingsDbService');
      await databaseService.initializeSchema();
      await this.migrateSettingsToDb();
    } catch (error) {
      console.error('Failed to initialize SettingsDbService', error);
    }
  }

  // Migrate settings from localStorage to database
  private async migrateSettingsToDb(): Promise<void> {
    try {
      console.log('Migrating settings from localStorage to database');
      
      // Check if migration has already been performed
      const migrationFlag = localStorage.getItem('settings-migration-completed');
      if (migrationFlag === 'true') {
        console.log('Settings migration already completed');
        return;
      }

      // Get all settings keys from localStorage that start with "settings-"
      const settingsKeys = Object.keys(localStorage)
        .filter(key => key.startsWith('settings-'));

      // Settings to migrate with their sections
      for (const key of settingsKeys) {
        const section = key.replace('settings-', '');
        const value = localStorage.getItem(key);
        
        if (value) {
          try {
            const parsedValue = JSON.parse(value);
            await this.saveSettings(section, parsedValue);
            console.log(`Migrated settings for section: ${section}`);
          } catch (e) {
            console.error(`Failed to migrate settings for section: ${section}`, e);
          }
        }
      }

      // Migrate other configuration types
      const configTypes = [
        { key: 'smtp-config', section: 'smtp' },
        { key: 'syslog-config', section: 'syslog' },
        { key: 'storage-config', section: 'storage' },
        { key: 'grid-layout', section: 'gridLayout' },
        { key: 'user-preferences', section: 'preferences' },
        { key: 'active-ai-models', section: 'activeModels' },
        { key: 'custom-ai-models', section: 'customModels' }
      ];

      for (const { key, section } of configTypes) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            const parsedValue = JSON.parse(value);
            await this.saveSettings(section, parsedValue);
            console.log(`Migrated config for: ${key}`);
          } catch (e) {
            console.error(`Failed to migrate config for: ${key}`, e);
          }
        }
      }

      // Mark migration as completed
      localStorage.setItem('settings-migration-completed', 'true');
      toast.success('Settings successfully migrated to database');
      
    } catch (error) {
      console.error('Settings migration failed', error);
      toast.error('Failed to migrate settings to database');
    }
  }

  // Get settings from database for a specific section
  async getSettings(section: string): Promise<SettingsType | null> {
    try {
      const results = await databaseService.query(
        'SELECT value FROM settings WHERE section = $1 AND key = $2',
        [section, 'config']
      );
      
      if (results && results.length > 0) {
        return results[0].value as SettingsType;
      }
      
      // If not found in DB, try localStorage as fallback during transition
      const fallbackValue = localStorage.getItem(`settings-${section}`);
      if (fallbackValue) {
        try {
          return JSON.parse(fallbackValue) as SettingsType;
        } catch (e) {
          console.error(`Failed to parse fallback value for section: ${section}`, e);
        }
      }
      
      // Return null if not found in either location
      return null;
    } catch (error) {
      console.error(`Failed to get settings for section: ${section}`, error);
      
      // Fallback to localStorage if DB fails
      try {
        const fallbackValue = localStorage.getItem(`settings-${section}`);
        if (fallbackValue) {
          return JSON.parse(fallbackValue) as SettingsType;
        }
      } catch (e) {
        console.error(`Failed to get fallback settings for: ${section}`, e);
      }
      
      return null;
    }
  }

  // Save settings to database
  async saveSettings(section: string, settings: SettingsType): Promise<boolean> {
    try {
      const query = `
        INSERT INTO settings(section, key, value, updated_at)
        VALUES($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT(section, key)
        DO UPDATE SET value = $3, updated_at = CURRENT_TIMESTAMP
      `;
      
      await databaseService.query(query, [section, 'config', settings]);
      
      // During transition period, also update localStorage
      localStorage.setItem(`settings-${section}`, JSON.stringify(settings));
      
      return true;
    } catch (error) {
      console.error(`Failed to save settings for section: ${section}`, error);
      
      // Fallback to localStorage if DB fails
      try {
        localStorage.setItem(`settings-${section}`, JSON.stringify(settings));
      } catch (e) {
        console.error(`Failed to save fallback settings for: ${section}`, e);
      }
      
      return false;
    }
  }

  // Get all settings
  async getAllSettings(): Promise<Record<string, SettingsType>> {
    try {
      const results = await databaseService.query('SELECT section, value FROM settings WHERE key = $1', ['config']);
      
      const allSettings: Record<string, SettingsType> = {};
      if (results && results.length > 0) {
        for (const row of results) {
          allSettings[row.section] = row.value as SettingsType;
        }
      }
      
      return allSettings;
    } catch (error) {
      console.error('Failed to get all settings', error);
      
      // Fallback to localStorage if DB fails
      const allSettings: Record<string, SettingsType> = {};
      try {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('settings-')) {
            const section = key.replace('settings-', '');
            const value = localStorage.getItem(key);
            if (value) {
              allSettings[section] = JSON.parse(value) as SettingsType;
            }
          }
        }
      } catch (e) {
        console.error('Failed to get fallback settings', e);
      }
      
      return allSettings;
    }
  }
}

const settingsDbService = new SettingsDbService();
export default settingsDbService;
