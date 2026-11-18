export type SqlValue = string | number | boolean | null;

export type SqlRunResult = {
  lastRowId?: number;
  changes?: number;
};

export type SqlStatement = { sql: string; params?: readonly SqlValue[] };

export interface SqlClient {
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
  run(sql: string, params?: readonly SqlValue[]): Promise<SqlRunResult>;
  batch(statements: readonly SqlStatement[]): Promise<SqlRunResult[]>;
}
