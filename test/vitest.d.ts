import 'vitest';

interface CustomMatchers<R = unknown> {
  toMatchFiles: (files: Record<string, string | null>) => Promise<R>;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
}
