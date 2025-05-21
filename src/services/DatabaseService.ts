
import { Pool, PoolClient } from 'pg';
import { toast } from 'sonner';

export interface DBConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean; // Changed from optional to required
}

class DatabaseService {
  private pool: Pool | null = null;
  private static instance: DatabaseService;
  private isConnected = false;

  private constructor() {
    // Get config from localStorage initially, will be migrated later
    const dbConfig = this.getConnectionConfig();
    this.initializePool(dbConfig);
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private initializePool(config: DBConfig): void {
    try {
      this.pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: config.ssl,
        // Add some reasonable defaults for connection handling
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test the connection on initialization
      this.testConnection().catch(err => {
        console.error('Failed to initialize database connection:', err);
      });
    } catch (error) {
      console.error('Error initializing database pool:', error);
      this.pool = null;
    }
  }

  public getConnectionConfig(): DBConfig {
    // Default connection config
    const defaultConfig: DBConfig = {
      host: 'localhost',
      port: 5432,
      database: 'avianet',
      user: 'postgres',
      password: '',
      ssl: false
    };

    // Try to get config from localStorage
    const storedConfig = localStorage.getItem('db-connection-config');
    return storedConfig ? { ...defaultConfig, ...JSON.parse(storedConfig) } : defaultConfig;
  }

  public saveConnectionConfig(config: DBConfig): void {
    localStorage.setItem('db-connection-config', JSON.stringify(config));
    this.initializePool(config);
  }

  public async testConnection(): Promise<boolean> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      this.isConnected = true;
      return result && result.rows && result.rows.length > 0;
    } catch (error) {
      console.error('Error testing database connection:', error);
      this.isConnected = false;
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  public async query(text: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      throw new Error('Database connection not established');
    }

    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      const result = await client.query(text, params);
      return result;
    } catch (error) {
      console.error('Error executing query:', error);
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  public async executeInTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Database connection not established');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  public isConnectedToDatabase(): boolean {
    return this.isConnected;
  }

  public async createTables(): Promise<void> {
    const queries = [
      // Settings table
      `CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        description TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      
      // Events/Alerts table
      `CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        severity VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      
      // Event types configuration
      `CREATE TABLE IF NOT EXISTS event_types (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        notify_on_triggered BOOLEAN DEFAULT TRUE,
        severity VARCHAR(50) NOT NULL,
        record_video BOOLEAN DEFAULT FALSE,
        send_email BOOLEAN DEFAULT FALSE,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      
      // Model information
      `CREATE TABLE IF NOT EXISTS ai_models (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        path VARCHAR(255) NOT NULL,
        size VARCHAR(50),
        format VARCHAR(50),
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        metadata JSONB
      )`,
      
      // Camera-model assignments
      `CREATE TABLE IF NOT EXISTS camera_model_assignments (
        id SERIAL PRIMARY KEY,
        camera_id VARCHAR(100) NOT NULL,
        model_id VARCHAR(100) NOT NULL,
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(camera_id, model_id)
      )`
    ];

    for (const query of queries) {
      try {
        await this.query(query);
      } catch (error) {
        console.error('Error creating table:', error);
        throw error;
      }
    }
  }
}

export default DatabaseService.getInstance();
