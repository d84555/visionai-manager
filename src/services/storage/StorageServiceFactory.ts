
import { StorageServiceInterface } from './StorageServiceInterface';
import { SimulatedStorageService } from './SimulatedStorageService';
import { APIStorageService } from './APIStorageService';

export type StorageMode = 'simulated' | 'api';

class StorageServiceFactory {
  private static instance: StorageServiceInterface;
  private static currentMode: StorageMode = 'api'; // Changed default to 'api'

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
    // Try to load from localStorage if available
    const savedMode = localStorage.getItem('avianet-storage-mode') as StorageMode | null;
    if (savedMode && (savedMode === 'api' || savedMode === 'simulated')) {
      this.currentMode = savedMode;
    }
    return this.currentMode;
  }

  private static createService(mode: StorageMode): StorageServiceInterface {
    switch (mode) {
      case 'api':
        return new APIStorageService();
      case 'simulated':
      default:
        return new SimulatedStorageService();
    }
  }
}

export default StorageServiceFactory;
