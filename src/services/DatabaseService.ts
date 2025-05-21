import { Pool, PoolClient, QueryResult } from '../utils/pg-mock';
import { toast } from 'sonner';

// Database connection configuration interface
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

class DatabaseService {
  private pool: Pool | null = null;
  private config: DatabaseConfig = {
    host: 'localhost',
    port: 5432,
    database: 'avianet',
    user: 'postgres',
    password: 'postgres',
    ssl: false
  };

  constructor() {
    // Load config from localStorage if available
    const savedConfig = localStorage.getItem('db-config');
    if (savedConfig) {
      try {
        this.config = { ...this.config, ...JSON.parse(savedConfig) };
      } catch (e) {
        console.error('Error parsing saved database config', e);
      }
    }
    
    // Initialize connection pool
    this.initialize();
  }

  // Initialize the database connection pool
  private initialize(): void {
    try {
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
        max: 20,
        idleTimeoutMillis: 30000
      });

      console.log('Database pool initialized');
    } catch (error) {
      console.error('Failed to initialize database pool', error);
      this.pool = null;
    }
  }

  // Get the current database configuration
  getConfig(): DatabaseConfig {
    return { ...this.config };
  }

  // Update the database configuration
  async updateConfig(newConfig: Partial<DatabaseConfig>): Promise<boolean> {
    // Save current config in case we need to revert
    const oldConfig = { ...this.config };
    
    // Update config with new values
    this.config = { ...this.config, ...newConfig };
    
    // Close existing pool
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }

    // Try to initialize with new config
    this.initialize();
    
    try {
      // Test connection
      await this.testConnection();
      
      // Save config to localStorage
      localStorage.setItem('db-config', JSON.stringify(this.config));
      return true;
    } catch (error) {
      console.error('Connection test failed with new config', error);
      // Revert to old config
      this.config = oldConfig;
      this.initialize();
      return false;
    }
  }

  // Test the database connection
  async testConnection(): Promise<boolean> {
    if (!this.pool) {
      this.initialize();
      if (!this.pool) throw new Error('Database pool could not be initialized');
    }

    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      const result = await client.query('SELECT NOW() as now');
      console.log('Database connection test successful', result.rows[0]);
      return true;
    } catch (error) {
      console.error('Database connection test failed', error);
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  // Execute a query with parameters
  async query<T>(text: string, params: any[] = []): Promise<T[]> {
    if (!this.pool) {
      this.initialize();
      if (!this.pool) throw new Error('Database pool could not be initialized');
    }

    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      const result = await client.query(text, params);
      return result.rows as T[];
    } catch (error) {
      console.error('Database query failed', error);
      toast.error('Database operation failed');
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  // Initialize the database schema if it doesn't exist
  async initializeSchema(): Promise<void> {
    try {
      // Create settings table
      await this.query(`
        CREATE TABLE IF NOT EXISTS settings (
          id SERIAL PRIMARY KEY,
          section VARCHAR(50) NOT NULL,
          key VARCHAR(100) NOT NULL,
          value JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(section, key)
        );
      `);

      // Create alerts/events table
      await this.query(`
        CREATE TABLE IF NOT EXISTS events (
          id SERIAL PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          category VARCHAR(50) NOT NULL,
          message TEXT NOT NULL,
          details JSONB,
          severity VARCHAR(20) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          acknowledged BOOLEAN DEFAULT FALSE,
          acknowledged_at TIMESTAMP,
          acknowledged_by VARCHAR(100)
        );
      `);

      console.log('Database schema initialized');
    } catch (error) {
      console.error('Failed to initialize database schema', error);
      toast.error('Failed to initialize database schema');
    }
  }
  
  // Close connection pool
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

// Export a singleton instance
const databaseService = new DatabaseService();
export default databaseService;
