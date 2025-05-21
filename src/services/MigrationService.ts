
import DatabaseService from './DatabaseService';
import SettingsService, { 
  ModelSettings, 
  VideoSettings, 
  AlertSettings, 
  FFmpegSettings,
  EventTypeConfig,
  BrandingSettings,
  SyslogConfig,
  SmtpConfig
} from './SettingsService';
import { toast } from 'sonner';

class MigrationService {
  private static instance: MigrationService;
  
  private constructor() {}

  public static getInstance(): MigrationService {
    if (!MigrationService.instance) {
      MigrationService.instance = new MigrationService();
    }
    return MigrationService.instance;
  }

  /**
   * Migrates all settings from localStorage to PostgreSQL
   */
  public async migrateSettings(): Promise<boolean> {
    try {
      // Ensure tables exist
      await DatabaseService.createTables();
      
      // Migrate settings section by section
      await this.migrateModelSettings();
      await this.migrateVideoSettings();
      await this.migrateAlertSettings();
      await this.migrateBrandingSettings();
      await this.migrateFFmpegSettings();
      await this.migrateSyslogConfig();
      await this.migrateSmtpConfig();
      await this.migrateEventSettings();
      await this.migrateCustomModels();
      await this.migrateActiveModels();
      await this.migrateGridLayout();
      await this.migrateStorageConfig();

      toast.success('Settings successfully migrated to PostgreSQL database');
      return true;
    } catch (error) {
      console.error('Error migrating settings:', error);
      toast.error('Failed to migrate settings to database');
      return false;
    }
  }

  /**
   * Saves a setting to the database
   */
  private async saveSetting(key: string, value: any, description: string = ''): Promise<void> {
    const query = `
      INSERT INTO settings (key, value, description, updated_at) 
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (key) 
      DO UPDATE SET value = $2, description = $3, updated_at = NOW()
    `;
    await DatabaseService.query(query, [key, JSON.stringify(value), description]);
  }

  private async migrateModelSettings(): Promise<void> {
    const modelSettings = SettingsService.getSettings('model') as ModelSettings;
    await this.saveSetting('settings-model', modelSettings, 'AI model detection settings');
  }

  private async migrateVideoSettings(): Promise<void> {
    const videoSettings = SettingsService.getSettings('video') as VideoSettings;
    await this.saveSetting('settings-video', videoSettings, 'Video playback settings');
  }

  private async migrateAlertSettings(): Promise<void> {
    const alertSettings = SettingsService.getSettings('alerts') as AlertSettings;
    await this.saveSetting('settings-alerts', alertSettings, 'Alert notification settings');
  }

  private async migrateBrandingSettings(): Promise<void> {
    const brandingSettings = SettingsService.getSettings('branding') as BrandingSettings;
    await this.saveSetting('settings-branding', brandingSettings, 'UI branding settings');
  }

  private async migrateFFmpegSettings(): Promise<void> {
    const ffmpegSettings = SettingsService.getSettings('ffmpeg') as FFmpegSettings;
    await this.saveSetting('settings-ffmpeg', ffmpegSettings, 'FFmpeg configuration');
  }

  private async migrateSyslogConfig(): Promise<void> {
    const syslogConfig = SettingsService.getSyslogConfig();
    if (syslogConfig) {
      await this.saveSetting('syslog-config', syslogConfig, 'Syslog server configuration');
    }
  }

  private async migrateSmtpConfig(): Promise<void> {
    const smtpConfig = SettingsService.getSmtpConfig();
    if (smtpConfig) {
      await this.saveSetting('smtp-config', smtpConfig, 'SMTP server configuration for alerts');
    }
  }

  private async migrateEventSettings(): Promise<void> {
    const eventTypes = SettingsService.getEventTypes();
    const eventsSettings = SettingsService.getSettings('events');
    
    // Save the general events settings
    await this.saveSetting('settings-events', eventsSettings, 'Event handling settings');
    
    // Migrate each event type to the dedicated table
    for (const eventType of eventTypes) {
      const query = `
        INSERT INTO event_types (
          id, name, category, enabled, notify_on_triggered, 
          severity, record_video, send_email, description
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) 
        DO UPDATE SET 
          name = $2, category = $3, enabled = $4, 
          notify_on_triggered = $5, severity = $6, record_video = $7,
          send_email = $8, description = $9, updated_at = NOW()
      `;
      
      await DatabaseService.query(query, [
        eventType.id, 
        eventType.name, 
        eventType.category,
        eventType.enabled,
        eventType.notifyOnTriggered,
        eventType.severity,
        eventType.recordVideo, 
        eventType.sendEmail || false,
        eventType.description || ''
      ]);
    }
  }

  private async migrateCustomModels(): Promise<void> {
    const models = SettingsService.getCustomModels();
    
    // Save the full models array as a backup
    await this.saveSetting('custom-ai-models', models, 'Custom AI model configurations');
    
    // Add each model to the dedicated table
    for (const model of models) {
      const query = `
        INSERT INTO ai_models (id, name, path, size, format, uploaded_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) 
        DO UPDATE SET 
          name = $2, path = $3, size = $4, format = $5,
          metadata = $7, uploaded_at = $6
      `;
      
      // Convert the cameras array to metadata JSON
      const metadata = {
        cameras: model.cameras || []
      };
      
      await DatabaseService.query(query, [
        model.id,
        model.name,
        model.path,
        model.size || '',
        model.format || 'unknown',
        model.uploadedAt || new Date().toISOString(),
        JSON.stringify(metadata)
      ]);
    }
  }

  private async migrateActiveModels(): Promise<void> {
    const activeModels = SettingsService.getActiveModels();
    await this.saveSetting('active-ai-models', activeModels, 'Currently active AI models');
  }

  private async migrateGridLayout(): Promise<void> {
    const gridLayout = SettingsService.getGridLayout();
    if (gridLayout) {
      await this.saveSetting('grid-layout', gridLayout, 'Camera grid layout configuration');
    }
  }

  private async migrateStorageConfig(): Promise<void> {
    const storageConfig = SettingsService.getStorageConfig();
    await this.saveSetting('storage-config', storageConfig, 'Storage path configuration');
  }
}

export default MigrationService.getInstance();
