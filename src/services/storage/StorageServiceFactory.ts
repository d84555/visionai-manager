
import { StorageServiceInterface } from './StorageServiceInterface';
import SimulatedStorageService from './SimulatedStorageService';
import APIStorageService from './APIStorageService';
import { toast } from 'sonner';

export default class StorageServiceFactory {
  private static mode: 'api' | 'simulated' = 'api';
  private static apiInstance: APIStorageService | null = null;
  private static simulatedInstance: SimulatedStorageService | null = null;
  private static isCheckingAPI: boolean = false;
  private static retryAttempts: number = 0;
  private static maxRetryAttempts: number = 3;
  private static lastApiCheck: number = 0;
  private static apiCheckInterval: number = 30000; // 30 seconds

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
      // Prevent multiple simultaneous checks and throttle checks
      const now = Date.now();
      if (this.isCheckingAPI || (now - this.lastApiCheck < this.apiCheckInterval && this.retryAttempts > 0)) {
        return this.mode === 'api';
      }
      
      this.isCheckingAPI = true;
      this.lastApiCheck = now;
      
      // Try both health endpoint and models list endpoint
      const healthResponse = await fetch('/api/health', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(3000) 
      });
      
      const modelsResponse = await fetch('/api/models/list', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(3000)
      });
      
      // Reset retry attempts on success
      if (healthResponse.ok && modelsResponse.ok) {
        this.retryAttempts = 0;
      }
      
      this.isCheckingAPI = false;
      return healthResponse.ok && modelsResponse.ok;
    } catch (error) {
      console.warn('API health check failed:', error);
      this.isCheckingAPI = false;
      this.retryAttempts++;
      return false;
    }
  }
  
  // Auto-fallback to simulated mode if API is not available
  public static async autoSelectMode(): Promise<'api' | 'simulated'> {
    try {
      const apiAvailable = await this.isApiAvailable();
      
      if (!apiAvailable && this.mode === 'api') {
        // Only show warning after several failed attempts to reduce noise
        if (this.retryAttempts >= this.maxRetryAttempts) {
          console.warn('API not available, falling back to simulated mode');
          this.setMode('simulated');
          toast.warning('API not available', { 
            description: 'Falling back to simulated storage. Models will be stored locally.',
            duration: 5000
          });
          // Reset retry counter after showing the message
          this.retryAttempts = 0;
        }
      } else if (apiAvailable && this.mode === 'simulated') {
        console.info('API available, using API mode');
        this.setMode('api');
        toast.success('API connection restored', {
          description: 'Using backend API for model storage.',
          duration: 3000
        });
        // Reset retry counter
        this.retryAttempts = 0;
      }
      
      return this.mode;
    } catch (error) {
      console.error('Error in autoSelectMode:', error);
      
      // If there's an error checking API, increment retry counter
      this.retryAttempts++;
      
      // Only fall back to simulated mode after several failed attempts
      if (this.retryAttempts >= this.maxRetryAttempts && this.mode === 'api') {
        this.setMode('simulated');
        toast.warning('Error checking API', {
          description: 'Falling back to simulated storage due to API error.',
          duration: 5000
        });
        // Reset retry counter after showing the message
        this.retryAttempts = 0;
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
