/**
 * Differential parity: the SAME `.tsrx` fixture runs through
 * @octanejs/remix-router (octane) AND real react-router 7.18.1 (React) — the
 * setup rewrites the imports for the React side, and both sides run the SAME
 * (vendored-equal) router core. octane's mountDifferential mounts both,
 * drives identical clicks, and asserts byte-identical innerHTML after each
 * step — layouts, params, loader data, redirects, explicit error boundaries,
 * Await fallback/resolution, and deterministic pending-navigation state.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const NESTED = resolve(__dirname, '../_fixtures/nested-layouts-diff.tsrx');
const LOADER = resolve(__dirname, '../_fixtures/loader-redirect-error-diff.tsrx');
const AWAIT = resolve(__dirname, '../_fixtures/await-deferred-diff.tsrx');
const PENDING = resolve(__dirname, '../_fixtures/pending-navigation-diff.tsrx');
const DECLARATIVE = resolve(__dirname, '../_fixtures/declarative-diff.tsrx');
const NAVLINK = resolve(__dirname, '../_fixtures/navlink-diff.tsrx');
// React fixtures are precompiled into THIS package's cache (see differential
// _setup.ts) so the React side resolves react-router from here.
const CACHE = resolve(__dirname, '.react-cache');

// react-router wraps state updates in startTransition and completeNavigation
// is async even for sync loaders — settle after EVERY step.
const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

describe('differential: @octanejs/remix-router vs real react-router', () => {
	it('NestedApp: layouts + params navigation via Link clicks, byte-identical', async () => {
		const d = await mountDifferential(NESTED, 'NestedApp', undefined, CACHE);
		await d.step('mount', async () => {
			await settle();
		});
		await d.step('to /about', async (i, r) => {
			await i.click('.nav-about');
			await r.click('.nav-about');
			await settle();
		});
		await d.step('to /users/42 (params + nested outlet)', async (i, r) => {
			await i.click('.nav-user');
			await r.click('.nav-user');
			await settle();
		});
		await d.step('back home', async (i, r) => {
			await i.click('.nav-home');
			await r.click('.nav-home');
			await settle();
		});
		d.unmount();
	});

	it('LoaderApp: loader data + redirect + errorElement + reset, byte-identical', async () => {
		const d = await mountDifferential(LOADER, 'LoaderApp', undefined, CACHE);
		await d.step('mount', async () => {
			await settle();
		});
		await d.step('loader data', async (i, r) => {
			await i.click('.go-data');
			await r.click('.go-data');
			await settle();
		});
		await d.step('loader redirect → /login', async (i, r) => {
			await i.click('.go-secret');
			await r.click('.go-secret');
			await settle();
		});
		await d.step('loader throws Response(400) → errorElement', async (i, r) => {
			await i.click('.go-boom');
			await r.click('.go-boom');
			await settle();
		});
		await d.step('boundary reset (navigate home)', async (i, r) => {
			await i.click('.go-home');
			await r.click('.go-home');
			await settle();
		});
		d.unmount();
	});

	it('AwaitApp: fallback → resolved render-prop, byte-identical at both steps', async () => {
		const d = await mountDifferential(AWAIT, 'AwaitApp', undefined, CACHE);
		await d.step('mount (fallback)', async () => {
			await settle();
		});
		await d.step('resolve', async (i, r) => {
			await i.click('#resolve');
			await r.click('#resolve');
			await settle(60);
		});
		d.unmount();
	});

	it('DeclarativeDiffApp: block-children <Routes> navigation, byte-identical', async () => {
		// Phase B: the octane side goes through the registration collector; the
		// React side is upstream's element-children walk of the SAME source.
		const d = await mountDifferential(DECLARATIVE, 'DeclarativeDiffApp', undefined, CACHE);
		await d.step('mount (index in layout)', async () => {
			await settle();
		});
		await d.step('to /about', async (i, r) => {
			await i.click('.nav-about');
			await r.click('.nav-about');
			await settle();
		});
		await d.step('to /users/42', async (i, r) => {
			await i.click('.nav-user');
			await r.click('.nav-user');
			await settle();
		});
		await d.step('back home', async (i, r) => {
			await i.click('.nav-home');
			await r.click('.nav-home');
			await settle();
		});
		d.unmount();
	});

	it('NavigateDiffApp: <Navigate> mount redirect, byte-identical', async () => {
		const d = await mountDifferential(DECLARATIVE, 'NavigateDiffApp', undefined, CACHE);
		await d.step('mount (redirected to /new)', async () => {
			await settle(60);
		});
		d.unmount();
	});

	it('NavLinkDiffApp: NavLink active states + useSearchParams, byte-identical', async () => {
		// Phase C: default `active` class, `end`, className/children render props,
		// aria-current across navigations; useSearchParams defaults + set/clear.
		const d = await mountDifferential(NAVLINK, 'NavLinkDiffApp', undefined, CACHE);
		await d.step('mount (home active)', async () => {
			await settle();
		});
		await d.step('to /users (parent + child-fn links flip)', async (i, r) => {
			await i.click('#nl-users');
			await r.click('#nl-users');
			await settle();
		});
		await d.step('to /users/7 (parent stays active, end variant not)', async (i, r) => {
			await i.click('#nl-user-7');
			await r.click('#nl-user-7');
			await settle();
		});
		await d.step('to /search (className fn + default merge)', async (i, r) => {
			await i.click('#nl-fn');
			await r.click('#nl-fn');
			await settle();
		});
		await d.step('set search param', async (i, r) => {
			await i.click('#set-q');
			await r.click('#set-q');
			await settle();
		});
		await d.step('clear search params', async (i, r) => {
			await i.click('#clear-q');
			await r.click('#clear-q');
			await settle();
		});
		d.unmount();
	});

	it('PendingApp: deterministic loading state → landed page, byte-identical', async () => {
		const d = await mountDifferential(PENDING, 'PendingApp', undefined, CACHE);
		await d.step('mount', async () => {
			await settle();
		});
		await d.step('start slow navigation (pending UI)', async (i, r) => {
			await i.click('.nav-slow');
			await r.click('.nav-slow');
			await settle();
		});
		await d.step('finish loader', async (i, r) => {
			await i.click('#finish');
			await r.click('#finish');
			await settle(60);
		});
		d.unmount();
	});
});
