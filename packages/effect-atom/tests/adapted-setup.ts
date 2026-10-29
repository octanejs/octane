import '@testing-library/jest-dom/vitest';
import { cleanup } from '@octanejs/testing-library';
import { afterEach } from 'vitest';

// Mirrors upstream's vitest.setup.ts, with Octane's testing library.
afterEach(cleanup);
