import type { Assertion, AsymmetricMatchersContaining } from 'vitest';

interface CustomMatchers<R = unknown> {
	toMatchFiles: (files: Record<string, any>) => R;
}

declare module 'vitest' {
	interface Assertion<T = any> extends CustomMatchers<T> {}
}
