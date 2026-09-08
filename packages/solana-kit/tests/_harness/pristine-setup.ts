import { vi } from 'vitest';

// Upstream @solana/react tests call jest.fn; Vitest's vi is API-compatible.
(globalThis as { jest?: typeof vi }).jest = vi;
