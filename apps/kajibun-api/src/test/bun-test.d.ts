declare module "bun:test" {
  type TestFunction = (name: string, fn: () => unknown | Promise<unknown>) => void;

  export const test: TestFunction;
  export const describe: TestFunction;
  export const beforeEach: (fn: () => unknown | Promise<unknown>) => void;
  export const afterEach: (fn: () => unknown | Promise<unknown>) => void;
  export const expect: {
    <T>(actual: T): {
      toBe(expected: T): void;
      toEqual(expected: unknown): void;
      toHaveLength(expected: number): void;
      toContain(expected: unknown): void;
      toMatch(expected: RegExp | string): void;
      toBeInstanceOf(expected: unknown): void;
      toBeGreaterThan(expected: number): void;
    };
  };
}
