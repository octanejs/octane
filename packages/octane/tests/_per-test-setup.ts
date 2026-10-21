import { afterEach, expect } from 'vitest';
import { drainPassiveEffects } from '../src/index.js';
import './_render-write-guard.js';

const hydrationSuitePath =
	/[/\\]tests[/\\](?:hydration[/\\]|(?:(?:conformance|runtime)[/\\])?(?:ssr|stream(?:ed|ing)?|islands?)[-.])/;

// Per-test isolation for DEFERRED passive work. Unmount passive destroys run
// in the passive flush, not synchronously (React parity — see unmountScope) —
// so a test that unmounts without flushing would otherwise leak its deferred
// cleanups into the NEXT test's first flush (polluting shared module-level
// logs/counters after that test's reset). Mirrors testing-library's
// act-wrapped auto-cleanup.
afterEach(() => {
	drainPassiveEffects();
	// Resolve the current runtime graph after suites that reset modules. A
	// discarded nested attempt must release its pending adoption as well.
	if (hydrationSuitePath.test(expect.getState().testPath ?? ''))
		return import('../src/hydration-flag.js').then(({ pendingInitialHydrations }) => {
			expect(pendingInitialHydrations).toBe(0);
		});
});

if (process.env.OCTANE_HYDRATION_PROBE_AUDIT) await import('./_hydration-probe-audit.js');
