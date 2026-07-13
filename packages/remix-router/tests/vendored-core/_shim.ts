// Shared jest→vitest shim for the vendored react-router core test port.
// The upstream tests (react-router@8.2.0 packages/react-router/__tests__/router)
// were written for jest with injected globals; this vitest project runs with
// `globals: false`, so we bridge both here. Imported first by every test file.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from 'vitest';

const g = globalThis as any;
g.jest = vi;
g.describe = describe;
g.it = it;
g.test = test;
g.expect = expect;
g.beforeEach = beforeEach;
g.afterEach = afterEach;
g.beforeAll = beforeAll;
g.afterAll = afterAll;
