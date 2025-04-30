
import { StorageServiceInterface } from './StorageServiceInterface';
import SimulatedStorageService from './SimulatedStorageService';
import APIStorageService from './APIStorageService';

export type StorageMode = 'simulated' | 'api';

class StorageServiceFactory {
  private static instance: StorageServiceInterface;
  private static currentMode: StorageMode = 'api';

  static getService(): StorageServiceInterface {
    if (!this.instance) {
      // Initialize with saved mode or default
      const savedMode = localStorage.getItem('avianet-storage-mode');
      if (savedMode === 'simulated' || savedMode === 'api') {
        this.currentMode = savedMode;
      }
      
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
    return this.currentMode;
  }

  private static createService(mode: StorageMode): StorageServiceInterface {
    if (mode === 'simulated') {
      return new SimulatedStorageService();
    } else {
      return new APIStorageService();
    }
  }
}

export default StorageServiceFactory;
