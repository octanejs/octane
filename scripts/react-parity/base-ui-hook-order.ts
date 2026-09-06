import { vi } from 'vitest';

// Base UI's pinned root config uses registration-order cleanup. Vitest replaces
// project-level sequence settings with workspace defaults, so restore this
// through its public per-file configuration API before the tests run.
vi.setConfig({ sequence: { hooks: 'list' } });
