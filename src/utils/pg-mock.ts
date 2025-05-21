
/**
 * Browser-compatible mock for the 'pg' module
 * This mock implementation provides basic functionality to make it work in the browser
 * while delegating actual database operations to the backend API.
 */

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
  oid: number;
  fields: any[];
}

export interface QueryConfig {
  text: string;
  values?: any[];
  name?: string;
  rowMode?: string;
  types?: any;
}

export class MockClient {
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

export class MockPool {
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

// Export Pool as MockPool for type compatibility
export { MockPool as Pool };
export type PoolClient = MockClient;

// Default export for compatibility with import syntax
const pg = { Pool: MockPool };
export default pg;
