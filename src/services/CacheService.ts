
/**
 * Simple cache service for application data
 */
export class CacheService {
  private static caches: Record<string, Map<string, any>> = {};
  
  /**
   * Store an item in a specific cache
   * @param cacheName Name of the cache to use
   * @param key Key to store the value under
   * @param value Value to store
   */
  static set(cacheName: string, key: string, value: any): void {
    if (!this.caches[cacheName]) {
      this.caches[cacheName] = new Map();
    }
    
    this.caches[cacheName].set(key, value);
  }
  
  /**
   * Retrieve an item from a specific cache
   * @param cacheName Name of the cache to use
   * @param key Key to retrieve
   * @returns The cached value or undefined if not found
   */
  static get(cacheName: string, key: string): any {
    return this.caches[cacheName]?.get(key);
  }
  
  /**
   * Clear a specific cache
   * @param cacheName Name of the cache to clear
   */
  static clearCache(cacheName: string): void {
    if (this.caches[cacheName]) {
      this.caches[cacheName].clear();
    }
  }
  
  /**
   * Clear all caches
   */
  static clearAllCaches(): void {
    Object.keys(this.caches).forEach(cacheName => {
      this.caches[cacheName].clear();
    });
    
    // Reset caches object
    this.caches = {};
  }
}
