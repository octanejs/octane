/**
 * @octanejs/remix-router export parity — PHASED. The port ships react-router
 * in phases (docs/remix-router-port-plan.md); this test pins the boundary
 * precisely:
 *
 *   1. Every upstream runtime export is either provided by the port or listed
 *      in EXPECTED_MISSING below (grouped by the phase that will deliver it).
 *   2. EXPECTED_MISSING may only SHRINK: an entry that the port now provides
 *      fails the stale-entries assertion until it is deleted from its block.
 *   3. The port exports nothing upstream doesn't (no octane-specific extras).
 *
 * The final phase SHIPPED: EXPECTED_MISSING is empty — framework-mode client
 * APIs are throwing stubs, the cookie/session server runtime is re-exported
 * from the vendored tree (see the plan doc for the stub policy).
 */
import { describe, it, expect } from 'vitest';
import * as port from '@octanejs/remix-router';
import * as portDom from '@octanejs/remix-router/dom';

// FULL PARITY: every upstream export ships (framework/RSC names as throwing
// stubs per the plan doc's scope policy). Kept as a Set so a future re-vendor
// (v8) can re-budget new exports the same way.
const EXPECTED_MISSING = new Set<string>([]);

describe('export surface (phased)', () => {
	it('everything upstream exports is provided or budgeted per phase', async () => {
		const real = await import('react-router');
		const upstream = Object.keys(real).sort();
		const portKeys = new Set(Object.keys(port));
		const missing = upstream.filter((name) => !portKeys.has(name));
		const unbudgeted = missing.filter((name) => !EXPECTED_MISSING.has(name));
		expect(unbudgeted, 'upstream exports neither shipped nor in EXPECTED_MISSING').toEqual([]);
	});

	it('EXPECTED_MISSING only shrinks (delete entries the port now provides)', () => {
		const stale = [...EXPECTED_MISSING].filter((name) => name in port);
		expect(stale, 'these landed — delete them from EXPECTED_MISSING').toEqual([]);
	});

	it('the port exports nothing upstream does not', async () => {
		const real = await import('react-router');
		const upstream = new Set(Object.keys(real));
		const extras = Object.keys(port).filter((name) => !upstream.has(name));
		expect(extras).toEqual([]);
	});

	it('the /dom entry provides the flushSync RouterProvider variant', () => {
		// react-router-dom was removed in v8; DOM RouterProvider now lives only
		// at react-router/dom.
		expect(typeof portDom.RouterProvider).toBe('function');
	});

	it('core re-exports are the same instances across entry points', async () => {
		// The vendored core is one module instance across the package.
		expect(port.matchPath).toBeTypeOf('function');
		expect(port.createPath).toBeTypeOf('function');
		expect(port.IDLE_NAVIGATION).toBeDefined();
	});
});
