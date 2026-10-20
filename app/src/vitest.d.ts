import 'vitest';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// jest-dom 7.0.1 still augments Vitest 4's Assertion interface. Use Vitest 5's
// matcher extension point until jest-dom provides compatible declarations.
declare module 'vitest' {
	interface Matchers<
		R extends void | Promise<void> = void | Promise<void>,
		T = unknown
	> extends TestingLibraryMatchers<unknown, R> {}
}
