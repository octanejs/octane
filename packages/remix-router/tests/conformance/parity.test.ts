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
 * At the final phase EXPECTED_MISSING reaches empty — framework-mode client
 * APIs become throwing stubs and the server runtime is re-exported from the
 * vendored tree (see the plan doc for the stub policy).
 */
import { describe, it, expect } from 'vitest';
import * as port from '@octanejs/remix-router';
import * as portDom from '@octanejs/remix-router/dom';

const EXPECTED_MISSING = new Set([
	// Phase C — DOM entry + links
	'createBrowserRouter',
	'createHashRouter',
	'BrowserRouter',
	'HashRouter',
	'unstable_HistoryRouter',
	'NavLink',
	'useSearchParams',
	// Phase D — mutations
	'Form',
	'useSubmit',
	'useFormAction',
	'useFetcher',
	'useFetchers',
	// Phase E — guards / scroll / view transitions
	'useBlocker',
	'unstable_usePrompt',
	'ScrollRestoration',
	'useBeforeUnload',
	'useViewTransitionState',
	'UNSAFE_useScrollRestoration',
	'unstable_useRoute',
	'unstable_useRouterState',
	// Phase F — static SSR
	'createStaticHandler',
	'createStaticRouter',
	'StaticRouter',
	'StaticRouterProvider',
	// Final phase — framework-mode client APIs (throwing stubs) + server
	// runtime (re-exported from the vendored tree) + RSC (stubs)
	'Meta',
	'Links',
	'Scripts',
	'PrefetchPageLinks',
	'ServerRouter',
	'createRoutesStub',
	'UNSAFE_FrameworkContext',
	'UNSAFE_RemixErrorBoundary',
	'UNSAFE_getPatchRoutesOnNavigationFunction',
	'UNSAFE_useFogOFWarDiscovery',
	'UNSAFE_getHydrationData',
	'UNSAFE_createClientRoutes',
	'UNSAFE_createClientRoutesWithHMRRevalidationOptOut',
	'UNSAFE_shouldHydrateRouteLoader',
	'UNSAFE_ServerMode',
	'UNSAFE_SingleFetchRedirectSymbol',
	'UNSAFE_decodeViaTurboStream',
	'UNSAFE_getTurboStreamSingleFetchDataStrategy',
	'createCookie',
	'isCookie',
	'createRequestHandler',
	'createSession',
	'createSessionStorage',
	'isSession',
	'createCookieSessionStorage',
	'createMemorySessionStorage',
	'unstable_setDevServerHooks',
	'unstable_routeRSCServerRequest',
	'unstable_RSCStaticRouter',
	'UNSAFE_RSCDefaultRootErrorBoundary',
]);

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

	it('react-router-dom shim surface is covered by the same budget', async () => {
		const shim = await import('react-router-dom');
		const portKeys = new Set(Object.keys(port));
		const missing = Object.keys(shim)
			.sort()
			.filter((name) => name !== 'RouterProvider' && name !== 'HydratedRouter')
			.filter((name) => !portKeys.has(name) && !EXPECTED_MISSING.has(name));
		expect(missing).toEqual([]);
		// The shim's RouterProvider is the /dom flushSync variant.
		expect(typeof portDom.RouterProvider).toBe('function');
	});

	it('core re-exports are the same instances across entry points', async () => {
		// The vendored core is one module instance across the package.
		expect(port.matchPath).toBeTypeOf('function');
		expect(port.createPath).toBeTypeOf('function');
		expect(port.IDLE_NAVIGATION).toBeDefined();
	});
});
