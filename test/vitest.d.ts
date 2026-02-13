import 'vitest';

declare module 'vitest' {
  interface Matchers<T = any> {
    toMatchFiles: (files: Record<string, string | null>) => Promise<T>;
  }
}
