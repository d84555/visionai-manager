
import { StorageServiceInterface } from './StorageServiceInterface';
import { SimulatedStorageService } from './SimulatedStorageService';
import { APIStorageService } from './APIStorageService';

export type StorageMode = 'simulated' | 'api';

class StorageServiceFactory {
  private static instance: StorageServiceInterface;
  private static currentMode: StorageMode = 'api'; // Always default to API mode

  static getService(): StorageServiceInterface {
    if (!this.instance) {
      this.instance = this.createService(this.currentMode);
    }
    return this.instance;
  }

  static setMode(mode: StorageMode): void {
    if (mode !== this.currentMode) {
      this.currentMode = mode;
      this.instance = this.createService(mode);
      
      // Store the selected mode in localStorage for persistence
      localStorage.setItem('avianet-storage-mode', mode);
      
      console.log(`Storage mode switched to: ${mode}`);
    }
  }

  static getMode(): StorageMode {
    // Always return 'api' to ensure we're using the API backend
    return 'api';
  }

  private static createService(mode: StorageMode): StorageServiceInterface {
    // Always use API service regardless of mode
    return new APIStorageService();
  }
}

export default StorageServiceFactory;
