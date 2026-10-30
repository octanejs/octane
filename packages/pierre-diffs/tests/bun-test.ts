// The adapted suite's `bun:test` module: the same registrars and matchers from
// Vitest. `mock` is Bun's spelling of a mock function.
import { vi } from 'vitest';

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
export const mock = vi.fn;
export const spyOn = vi.spyOn;
