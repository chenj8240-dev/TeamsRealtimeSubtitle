// Setup for the `component` test project only.
//
// Testing Library normally registers its own teardown, but only when vitest's globals are
// enabled — this repo imports `describe`/`it`/`expect` explicitly instead, so the cleanup has
// to be wired up here or components would pile up in the document between tests.
import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/svelte';

expect.extend(matchers);

afterEach(() => {
	cleanup();
});
