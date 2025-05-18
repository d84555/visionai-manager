
import { StorageServiceInterface } from './StorageServiceInterface';
import SimulatedStorageService from './SimulatedStorageService';
import APIStorageService from './APIStorageService';
import { toast } from 'sonner';

export default class StorageServiceFactory {
  private static mode: 'api' | 'simulated' = 'api';
  private static apiInstance: APIStorageService | null = null;
  private static simulatedInstance: SimulatedStorageService | null = null;
  private static isCheckingAPI: boolean = false;

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
      // Prevent multiple simultaneous checks
      if (this.isCheckingAPI) {
        return this.mode === 'api';
      }
      
      this.isCheckingAPI = true;
      
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        // Add a reasonable timeout
        signal: AbortSignal.timeout(3000) 
      });
      
      const result = response.ok;
      this.isCheckingAPI = false;
      
      return result;
    } catch (error) {
      console.warn('API health check failed:', error);
      this.isCheckingAPI = false;
      return false;
    }
  }
  
  // Auto-fallback to simulated mode if API is not available
  public static async autoSelectMode(): Promise<'api' | 'simulated'> {
    try {
      const apiAvailable = await this.isApiAvailable();
      
      if (!apiAvailable && this.mode === 'api') {
        console.warn('API not available, falling back to simulated mode');
        this.setMode('simulated');
        toast.warning('API not available', { 
          description: 'Falling back to simulated storage. Models will be stored locally.',
          duration: 5000
        });
      } else if (apiAvailable && this.mode === 'simulated') {
        console.info('API available, using API mode');
        this.setMode('api');
      }
      
      return this.mode;
    } catch (error) {
      console.error('Error in autoSelectMode:', error);
      
      // If there's an error checking API, fall back to simulated mode
      if (this.mode === 'api') {
        this.setMode('simulated');
        toast.warning('Error checking API', {
          description: 'Falling back to simulated storage due to API error.',
          duration: 5000
        });
      }
      
      return this.mode;
    }
  }
  
  // Reset the storage service instances (useful when switching modes)
  public static resetInstances(): void {
    this.apiInstance = null;
    this.simulatedInstance = null;
    console.log('Storage service instances reset');
  }
  
  // Get a fresh storage service instance (bypass caching)
  public static getFreshService(): StorageServiceInterface {
    const currentMode = this.getMode();
    
    if (currentMode === 'api') {
      return new APIStorageService();
    } else {
      return new SimulatedStorageService();
    }
  }
}
