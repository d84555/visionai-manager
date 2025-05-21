
// Mock implementation of pg library for browser environments
export class Pool {
  private static instance: Pool;
  
  constructor(config: any) {
    console.log('Created mock PG Pool with config:', config);
  }
  
  async connect(): Promise<PoolClient> {
    console.log('Mock PG Pool connect called');
    return new PoolClient();
  }
}

export class PoolClient {
  async query(text: string, params?: any[]): Promise<any> {
    console.log('Mock query executed:', text, params);
    
    // Return mock data based on the query
    if (text.includes('SELECT NOW()')) {
      return {
        rows: [{ now: new Date() }],
        rowCount: 1
      };
    }
    
    if (text.startsWith('CREATE TABLE')) {
      return {
        rows: [],
        rowCount: 0
      };
    }
    
    // For INSERT queries, return a mock ID
    if (text.includes('INSERT INTO')) {
      return {
        rows: [{ id: Math.floor(Math.random() * 10000) }],
        rowCount: 1
      };
    }
    
    // For SELECT queries, return empty results to avoid breaking UI
    if (text.startsWith('SELECT')) {
      return {
        rows: [],
        rowCount: 0
      };
    }
    
    return {
      rows: [],
      rowCount: 0
    };
  }

  async release(): Promise<void> {
    console.log('Mock client released');
  }
}

export default {
  Pool,
  PoolClient
};
