
import DatabaseService from './DatabaseService';
import { 
  ModelSettings, 
  VideoSettings, 
  AlertSettings, 
  FFmpegSettings,
  SmtpConfig,
  SyslogConfig,
  StorageConfig,
  GridLayout,
  BrandingSettings,
  EventsSettings,
  EventTypeConfig,
  ModelInfo
} from './SettingsService';
import SettingsService from './SettingsService';
import { toast } from 'sonner';

class DBSettingsService {
  private static instance: DBSettingsService;
  private fallbackToLocalStorage: boolean = true;

  private constructor() {}

  public static getInstance(): DBSettingsService {
    if (!DBSettingsService.instance) {
      DBSettingsService.instance = new DBSettingsService();
    }
    return DBSettingsService.instance;
  }

  public setFallbackMode(enabled: boolean): void {
    this.fallbackToLocalStorage = enabled;
  }

  private async getSetting(key: string): Promise<any> {
    try {
      const result = await DatabaseService.query('SELECT value FROM settings WHERE key = $1', [key]);
      if (result.rows.length > 0) {
        return result.rows[0].value;
      }
      
      // Fall back to localStorage if setting not found in DB and fallback is enabled
      if (this.fallbackToLocalStorage) {
        console.log(`Setting ${key} not found in database, falling back to localStorage`);
        return SettingsService.getSetting(key);
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching setting from database:', error);
      
      // Fall back to localStorage on error if fallback is enabled
      if (this.fallbackToLocalStorage) {
        console.log(`Error fetching ${key} from database, falling back to localStorage`);
        return SettingsService.getSetting(key);
      }
      
      throw error;
    }
  }

  private async saveSetting(key: string, value: any, description: string = ''): Promise<void> {
    try {
      const query = `
        INSERT INTO settings (key, value, description, updated_at) 
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (key) 
        DO UPDATE SET value = $2, description = $3, updated_at = NOW()
      `;
      await DatabaseService.query(query, [key, JSON.stringify(value), description]);
      
      // Also update localStorage for backwards compatibility if fallback is enabled
      if (this.fallbackToLocalStorage) {
        SettingsService.setSetting(key, value);
      }
    } catch (error) {
      console.error('Error saving setting to database:', error);
      
      // Fall back to localStorage on error if fallback is enabled
      if (this.fallbackToLocalStorage) {
        console.log(`Error saving ${key} to database, falling back to localStorage`);
        SettingsService.setSetting(key, value);
      } else {
        throw error;
      }
    }
  }

  public async getSettings(section: string): Promise<any> {
    const key = `settings-${section}`;
    const data = await this.getSetting(key);
    
    if (data) {
      return data;
    }
    
    // Return default settings if not found
    return SettingsService.getDefaultSettings(section);
  }

  public async updateSettings(section: string, settings: any): Promise<void> {
    const key = `settings-${section}`;
    await this.saveSetting(key, settings, `Settings for ${section}`);
  }

  public async saveAllSettings(allSettings: Record<string, any>): Promise<void> {
    try {
      await DatabaseService.executeInTransaction(async (client) => {
        for (const [section, settings] of Object.entries(allSettings)) {
          const key = `settings-${section}`;
          const query = `
            INSERT INTO settings (key, value, description, updated_at) 
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (key) 
            DO UPDATE SET value = $2, description = $3, updated_at = NOW()
          `;
          await client.query(query, [key, JSON.stringify(settings), `Settings for ${section}`]);
        }
      });
      
      // Also update localStorage for backwards compatibility if fallback is enabled
      if (this.fallbackToLocalStorage) {
        SettingsService.saveAllSettings(allSettings);
      }
      
      toast.success('All settings saved successfully');
    } catch (error) {
      console.error('Error saving all settings to database:', error);
      
      // Fall back to localStorage on error if fallback is enabled
      if (this.fallbackToLocalStorage) {
        console.log('Error saving settings to database, falling back to localStorage');
        SettingsService.saveAllSettings(allSettings);
        toast.warning('Settings saved to local storage (database unavailable)');
      } else {
        toast.error('Failed to save settings to database');
        throw error;
      }
    }
  }

  // Custom models methods
  public async getCustomModels(): Promise<ModelInfo[]> {
    try {
      const result = await DatabaseService.query('SELECT * FROM ai_models ORDER BY uploaded_at DESC');
      
      // Convert database results to ModelInfo objects
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        path: row.path,
        size: row.size,
        format: row.format,
        uploadedAt: row.uploaded_at,
        cameras: row.metadata?.cameras || ['All Cameras']
      }));
    } catch (error) {
      console.error('Error fetching custom models from database:', error);
      
      // Fall back to localStorage on error if fallback is enabled
      if (this.fallbackToLocalStorage) {
        return SettingsService.getCustomModels();
      }
      
      return [];
    }
  }

  public async uploadCustomModel(file: File, modelName: string, options?: any): Promise<ModelInfo> {
    // First, use the original service to handle file upload
    const modelInfo = await SettingsService.uploadCustomModel(file, modelName, options);
    
    // Then save to database
    try {
      const query = `
        INSERT INTO ai_models (id, name, path, size, format, uploaded_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      
      // Convert the cameras array to metadata JSON
      const metadata = {
        cameras: modelInfo.cameras || []
      };
      
      await DatabaseService.query(query, [
        modelInfo.id,
        modelInfo.name,
        modelInfo.path,
        modelInfo.size || '',
        modelInfo.format || 'unknown',
        modelInfo.uploadedAt || new Date().toISOString(),
        JSON.stringify(metadata)
      ]);
      
      return modelInfo;
    } catch (error) {
      console.error('Error saving model to database:', error);
      // We still return the model info since the file upload succeeded
      return modelInfo;
    }
  }

  public async deleteCustomModel(modelId: string): Promise<boolean> {
    try {
      // Start by deleting from the database
      const result = await DatabaseService.query('DELETE FROM ai_models WHERE id = $1', [modelId]);
      
      // Also delete from localStorage for backwards compatibility
      if (this.fallbackToLocalStorage) {
        SettingsService.deleteCustomModel(modelId);
      }
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting model from database:', error);
      
      // Fall back to localStorage on error if fallback is enabled
      if (this.fallbackToLocalStorage) {
        return SettingsService.deleteCustomModel(modelId);
      }
      
      return false;
    }
  }

  // SMTP Configuration
  public async saveSmtpConfig(config: SmtpConfig): Promise<void> {
    await this.saveSetting('smtp-config', config, 'SMTP server configuration for alerts');
  }

  public async getSmtpConfig(): Promise<SmtpConfig | null> {
    return this.getSetting('smtp-config');
  }

  // Syslog Configuration
  public async saveSyslogConfig(config: SyslogConfig): Promise<void> {
    await this.saveSetting('syslog-config', config, 'Syslog server configuration');
  }

  public async getSyslogConfig(): Promise<SyslogConfig | null> {
    return this.getSetting('syslog-config');
  }

  // Storage Configuration
  public async saveStorageConfig(config: StorageConfig): Promise<void> {
    await this.saveSetting('storage-config', config, 'Storage path configuration');
  }

  public async getStorageConfig(): Promise<StorageConfig> {
    const config = await this.getSetting('storage-config');
    return config || SettingsService.getStorageConfig();
  }

  // Grid Layout Preferences
  public async saveGridLayout(layout: GridLayout): Promise<void> {
    await this.saveSetting('grid-layout', layout, 'Camera grid layout configuration');
  }

  public async getGridLayout(): Promise<GridLayout | null> {
    return this.getSetting('grid-layout');
  }

  // AI Model settings
  public async setActiveModel(name: string, path: string): Promise<void> {
    await this.setActiveModels([{ name, path }]);
  }

  public async setActiveModels(models: { name: string; path: string }[]): Promise<void> {
    await this.saveSetting('active-ai-models', models, 'Currently active AI models');
  }

  public async getActiveModel(): Promise<{ name: string; path: string } | null> {
    const models = await this.getActiveModels();
    return models.length > 0 ? models[0] : null;
  }

  public async getActiveModels(): Promise<{ name: string; path: string }[]> {
    const models = await this.getSetting('active-ai-models');
    return models || [];
  }

  // Events Configuration
  public async getEventTypes(): Promise<EventTypeConfig[]> {
    try {
      const result = await DatabaseService.query(`
        SELECT id, name, category, enabled, notify_on_triggered AS "notifyOnTriggered", 
               severity, record_video AS "recordVideo", send_email AS "sendEmail", 
               description
        FROM event_types 
        ORDER BY category, name
      `);
      
      if (result.rows.length === 0) {
        // Fall back to default event types if none found in DB
        return SettingsService.getDefaultEventTypes();
      }
      
      return result.rows;
    } catch (error) {
      console.error('Error fetching event types from database:', error);
      
      // Fall back to localStorage on error if fallback is enabled
      if (this.fallbackToLocalStorage) {
        return SettingsService.getEventTypes();
      }
      
      return SettingsService.getDefaultEventTypes();
    }
  }

  public async updateEventType(updatedEventType: EventTypeConfig): Promise<void> {
    try {
      const query = `
        UPDATE event_types
        SET name = $1, category = $2, enabled = $3, notify_on_triggered = $4,
            severity = $5, record_video = $6, send_email = $7, description = $8, 
            updated_at = NOW()
        WHERE id = $9
      `;
      
      await DatabaseService.query(query, [
        updatedEventType.name,
        updatedEventType.category,
        updatedEventType.enabled,
        updatedEventType.notifyOnTriggered,
        updatedEventType.severity,
        updatedEventType.recordVideo,
        updatedEventType.sendEmail || false,
        updatedEventType.description || '',
        updatedEventType.id
      ]);
      
      // Also update in localStorage for backwards compatibility
      if (this.fallbackToLocalStorage) {
        SettingsService.updateEventType(updatedEventType);
      }
    } catch (error) {
      console.error('Error updating event type in database:', error);
      
      // Fall back to localStorage on error if fallback is enabled
      if (this.fallbackToLocalStorage) {
        SettingsService.updateEventType(updatedEventType);
      } else {
        throw error;
      }
    }
  }

  public async updateEventsSettings(settings: Partial<EventsSettings>): Promise<void> {
    try {
      const currentSettings = await this.getSettings('events') as EventsSettings;
      const updatedSettings = {
        ...currentSettings,
        ...settings
      };
      
      await this.updateSettings('events', updatedSettings);
    } catch (error) {
      console.error('Error updating events settings in database:', error);
      
      // Fall back to localStorage on error if fallback is enabled
      if (this.fallbackToLocalStorage) {
        SettingsService.updateEventsSettings(settings);
      } else {
        throw error;
      }
    }
  }

  public async clearAll(): Promise<void> {
    try {
      // Delete all settings from the database
      await DatabaseService.query('DELETE FROM settings');
      await DatabaseService.query('DELETE FROM event_types');
      await DatabaseService.query('DELETE FROM ai_models');
      
      // Also clear localStorage for backwards compatibility
      if (this.fallbackToLocalStorage) {
        SettingsService.clearAll();
      }
      
      toast.success('All settings cleared successfully');
    } catch (error) {
      console.error('Error clearing settings from database:', error);
      
      // Fall back to localStorage on error if fallback is enabled
      if (this.fallbackToLocalStorage) {
        SettingsService.clearAll();
        toast.warning('Settings cleared from local storage (database unavailable)');
      } else {
        toast.error('Failed to clear settings from database');
        throw error;
      }
    }
  }
}

export default DBSettingsService.getInstance();
