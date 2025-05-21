
/**
 * Browser-compatible mock for the 'pg' module
 * This mock implementation provides basic functionality to make it work in the browser
 * while delegating actual database operations to the backend API.
 */

interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
  oid: number;
  fields: any[];
}

interface QueryConfig {
  text: string;
  values?: any[];
  name?: string;
  rowMode?: string;
  types?: any;
}

class MockClient {
  async connect(): Promise<void> {
    console.log('Mock PG client: connect called');
    // In a real implementation, this would make an API call to test connection
    // For now we just simulate success
  }

  async query<T = any>(textOrConfig: string | QueryConfig, values?: any[]): Promise<QueryResult<T>> {
    console.log('Mock PG client: query called', { textOrConfig, values });
    // In real implementation, this would make an API call
    return {
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: []
    };
  }

  release(): void {
    console.log('Mock PG client: release called');
  }

  end(): Promise<void> {
    console.log('Mock PG client: end called');
    return Promise.resolve();
  }
}

class MockPool {
  private options: any;

  constructor(options: any) {
    this.options = options;
    console.log('Mock PG Pool created with options', options);
  }

  async connect(): Promise<MockClient> {
    console.log('Mock PG Pool: connect called');
    return new MockClient();
  }

  async query<T = any>(textOrConfig: string | QueryConfig, values?: any[]): Promise<QueryResult<T>> {
    const client = new MockClient();
    try {
      return await client.query(textOrConfig, values);
    } finally {
      client.release();
    }
  }

  async end(): Promise<void> {
    console.log('Mock PG Pool: end called');
    return Promise.resolve();
  }
}

export const Pool = MockPool;
export type PoolClient = MockClient;
export default { Pool };
