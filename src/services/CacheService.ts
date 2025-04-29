
/**
 * Simple cache service for managing in-memory caches across the application
 */
class CacheServiceClass {
  private caches: Map<string, Map<string, any>> = new Map();

  /**
   * Get a value from a specific cache
   * @param cacheName The name of the cache
   * @param key The key to retrieve
   * @returns The cached value or undefined if not found
   */
  get<T>(cacheName: string, key: string): T | undefined {
    const cache = this.caches.get(cacheName);
    if (!cache) return undefined;
    return cache.get(key) as T;
  }

  /**
   * Set a value in a specific cache
   * @param cacheName The name of the cache
   * @param key The key to store the value under
   * @param value The value to cache
   */
  set<T>(cacheName: string, key: string, value: T): void {
    if (!this.caches.has(cacheName)) {
      this.caches.set(cacheName, new Map());
    }
    this.caches.get(cacheName)?.set(key, value);
  }

  /**
   * Remove a specific entry from a cache
   * @param cacheName The name of the cache
   * @param key The key to remove
   */
  remove(cacheName: string, key: string): void {
    const cache = this.caches.get(cacheName);
    if (cache) {
      cache.delete(key);
    }
  }

  /**
   * Clear all entries in a specific cache
   * @param cacheName The name of the cache to clear
   */
  clearCache(cacheName: string): void {
    const cache = this.caches.get(cacheName);
    if (cache) {
      cache.clear();
    }
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.caches.forEach(cache => cache.clear());
    console.log('All caches cleared');
  }
}

// Export a singleton instance
export const CacheService = new CacheServiceClass();
