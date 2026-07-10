import { afterEach } from 'vitest';
import { drainPassiveEffects } from '../src/index.js';

// Per-test isolation for DEFERRED passive work. Unmount passive destroys run
// in the passive flush, not synchronously (React parity — see unmountScope) —
// so a test that unmounts without flushing would otherwise leak its deferred
// cleanups into the NEXT test's first flush (polluting shared module-level
// logs/counters after that test's reset). Mirrors testing-library's
// act-wrapped auto-cleanup.
afterEach(() => {
	drainPassiveEffects();
});
