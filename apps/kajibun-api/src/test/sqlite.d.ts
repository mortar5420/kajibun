// The project uses Bun's built-in SQLite only in tests, without Node runtime dependencies.
declare module "bun:sqlite" {
  type Binding = string | number | null;
  export class Database {
    constructor(filename: string);
    exec(sql: string): void;
    close(): void;
    query<T = unknown>(sql: string): {
      all(...params: Binding[]): T[];
      get(...params: Binding[]): T | null;
      run(...params: Binding[]): { lastInsertRowid: number | bigint; changes: number };
    };
    transaction<T>(fn: () => T): () => T;
  }
}

declare module "*.sql" {
  const sql: string;
  export default sql;
}
