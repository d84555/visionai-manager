
import { StorageServiceInterface } from './StorageServiceInterface';
import SimulatedStorageService from './SimulatedStorageService';
import APIStorageService from './APIStorageService';

export default class StorageServiceFactory {
  private static mode: 'api' | 'simulated' = 'api';
  private static apiInstance: APIStorageService | null = null;
  private static simulatedInstance: SimulatedStorageService | null = null;

  public static setMode(mode: 'api' | 'simulated'): void {
    this.mode = mode;
    localStorage.setItem('storage-mode', mode);
    console.log(`Storage mode set to ${mode}`);
  }

  public static getMode(): 'api' | 'simulated' {
    // Try to load from localStorage, default to 'api' if not found
    const savedMode = localStorage.getItem('storage-mode');
    if (savedMode && (savedMode === 'api' || savedMode === 'simulated')) {
      this.mode = savedMode as 'api' | 'simulated';
    }
    return this.mode;
  }

  public static getService(): StorageServiceInterface {
    const currentMode = this.getMode();
    
    if (currentMode === 'api') {
      if (!this.apiInstance) {
        this.apiInstance = new APIStorageService();
      }
      return this.apiInstance;
    } else {
      if (!this.simulatedInstance) {
        this.simulatedInstance = new SimulatedStorageService();
      }
      return this.simulatedInstance;
    }
  }
  
  // Helper to check if API is available
  public static async isApiAvailable(): Promise<boolean> {
    try {
      const response = await fetch('/api/health');
      return response.ok;
    } catch (error) {
      console.warn('API health check failed:', error);
      return false;
    }
  }
  
  // Auto-fallback to simulated mode if API is not available
  public static async autoSelectMode(): Promise<'api' | 'simulated'> {
    const apiAvailable = await this.isApiAvailable();
    if (!apiAvailable && this.mode === 'api') {
      console.warn('API not available, falling back to simulated mode');
      this.setMode('simulated');
    } else if (apiAvailable && this.mode === 'simulated') {
      console.info('API available, using API mode');
      this.setMode('api');
    }
    return this.mode;
  }
}
