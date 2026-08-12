/**
 * Differential parity: the SAME `.tsrx` fixture runs through
 * @octanejs/remix-router (octane) AND real react-router 8.2.0 (React) — the
 * setup rewrites the imports for the React side, and both sides run the SAME
 * (vendored-equal) router core. octane's mountDifferential mounts both,
 * drives identical clicks, and asserts byte-identical innerHTML after each
 * step — layouts, params, loader data, redirects, explicit error boundaries,
 * Await fallback/resolution, and deterministic pending-navigation state.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { act as reactAct } from 'react';
import { drainPassiveEffects as octaneDrainEffects } from 'octane';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const NESTED = resolve(__dirname, '../_fixtures/nested-layouts-diff.tsrx');
const LOADER = resolve(__dirname, '../_fixtures/loader-redirect-error-diff.tsrx');
const AWAIT = resolve(__dirname, '../_fixtures/await-deferred-diff.tsrx');
const PENDING = resolve(__dirname, '../_fixtures/pending-navigation-diff.tsrx');
const DECLARATIVE = resolve(__dirname, '../_fixtures/declarative-diff.tsrx');
const NAVLINK = resolve(__dirname, '../_fixtures/navlink-diff.tsrx');
const FORMS = resolve(__dirname, '../_fixtures/forms-diff.tsrx');
const GUARDS = resolve(__dirname, '../_fixtures/guards-diff.tsrx');
// React fixtures are precompiled into THIS package's cache (see differential
// _setup.ts) so the React side resolves react-router from here.
const CACHE = resolve(__dirname, '.react-cache');

type Mount = { container: HTMLElement; find(selector: string): Element };

function predicateHolds(predicate: (mount: Mount) => boolean, mount: Mount): boolean {
	try {
		return predicate(mount);
	} catch {
		// mount.find throws when a node is absent mid-transition; treat as
		// unsettled so the retry loop can drain and poll again.
		return false;
	}
}

async function waitForBoth(
	octane: Mount,
	react: Mount,
	description: string,
	predicate: (mount: Mount) => boolean,
): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (predicateHolds(predicate, octane) && predicateHolds(predicate, react)) return;
		octaneDrainEffects();
		await reactAct(async () => {
			await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
		});
	}
	throw new Error(
		`${description} did not settle: ${JSON.stringify({
			octane: octane.container.innerHTML,
			react: react.container.innerHTML,
		})}`,
	);
}

const textIs = (selector: string, text: string) => (mount: Mount) =>
	mount.container.querySelector(selector)?.textContent === text;

await Promise.all([
	preloadDifferentialFixture(NESTED, CACHE),
	preloadDifferentialFixture(LOADER, CACHE),
	preloadDifferentialFixture(AWAIT, CACHE),
	preloadDifferentialFixture(DECLARATIVE, CACHE),
	preloadDifferentialFixture(NAVLINK, CACHE),
	preloadDifferentialFixture(FORMS, CACHE),
	preloadDifferentialFixture(GUARDS, CACHE),
	preloadDifferentialFixture(PENDING, CACHE),
]);

describe('differential: @octanejs/remix-router vs real react-router', () => {
	// @parity-case differential:remix-router-nested
	it('NestedApp: layouts + params navigation via Link clicks, byte-identical', async () => {
		const d = await mountDifferential(NESTED, 'NestedApp', undefined, CACHE);
		await d.step('mount', async (i, r) => {
			await waitForBoth(i, r, 'nested home mount', textIs('h1', 'Home'));
		});
		await d.step('to /about', async (i, r) => {
			await i.click('.nav-about');
			await r.click('.nav-about');
			await waitForBoth(i, r, 'about navigation', textIs('h1', 'About'));
		});
		await d.step('to /users/42 (params + nested outlet)', async (i, r) => {
			await i.click('.nav-user');
			await r.click('.nav-user');
			await waitForBoth(
				i,
				r,
				'user navigation',
				(mount) => textIs('h1', 'Users')(mount) && textIs('p', 'Item 42')(mount),
			);
		});
		await d.step('back home', async (i, r) => {
			await i.click('.nav-home');
			await r.click('.nav-home');
			await waitForBoth(i, r, 'home navigation', textIs('h1', 'Home'));
		});
		d.unmount();
	});

	// @parity-case differential:remix-router-loader
	it('LoaderApp: loader data + redirect + errorElement + reset, byte-identical', async () => {
		const d = await mountDifferential(LOADER, 'LoaderApp', undefined, CACHE);
		await d.step('mount', async (i, r) => {
			await waitForBoth(i, r, 'loader home mount', textIs('h1', 'Home'));
		});
		await d.step('loader data', async (i, r) => {
			await i.click('.go-data');
			await r.click('.go-data');
			await waitForBoth(i, r, 'loader data', textIs('p', 'loader:from-loader'));
		});
		await d.step('loader redirect → /login', async (i, r) => {
			await i.click('.go-secret');
			await r.click('.go-secret');
			await waitForBoth(i, r, 'loader redirect', textIs('h1', 'Login'));
		});
		await d.step('loader throws Response(400) → errorElement', async (i, r) => {
			await i.click('.go-boom');
			await r.click('.go-boom');
			await waitForBoth(i, r, 'loader error boundary', textIs('.err', '400 nope'));
		});
		await d.step('boundary reset (navigate home)', async (i, r) => {
			await i.click('.go-home');
			await r.click('.go-home');
			await waitForBoth(i, r, 'error boundary reset', textIs('h1', 'Home'));
		});
		d.unmount();
	});

	// @parity-case differential:remix-router-await
	it('AwaitApp: fallback → resolved render-prop, byte-identical at both steps', async () => {
		const d = await mountDifferential(AWAIT, 'AwaitApp', undefined, CACHE);
		await d.step('mount (fallback)', async (i, r) => {
			await waitForBoth(i, r, 'await fallback', textIs('.fallback', 'waiting'));
		});
		await d.step('resolve', async (i, r) => {
			await i.click('#resolve');
			await r.click('#resolve');
			await waitForBoth(i, r, 'await resolution', textIs('.value', 'got:hello'));
		});
		d.unmount();
	});

	// @parity-case differential:remix-router-declarative
	it('DeclarativeDiffApp: block-children <Routes> navigation, byte-identical', async () => {
		// Phase B: the octane side goes through the registration collector; the
		// React side is upstream's element-children walk of the SAME source.
		const d = await mountDifferential(DECLARATIVE, 'DeclarativeDiffApp', undefined, CACHE);
		await d.step('mount (index in layout)', async (i, r) => {
			await waitForBoth(i, r, 'declarative home mount', textIs('h1', 'Home'));
		});
		await d.step('to /about', async (i, r) => {
			await i.click('.nav-about');
			await r.click('.nav-about');
			await waitForBoth(i, r, 'declarative about navigation', textIs('h1', 'About'));
		});
		await d.step('to /users/42', async (i, r) => {
			await i.click('.nav-user');
			await r.click('.nav-user');
			await waitForBoth(i, r, 'declarative user navigation', textIs('p', 'User 42'));
		});
		await d.step('back home', async (i, r) => {
			await i.click('.nav-home');
			await r.click('.nav-home');
			await waitForBoth(i, r, 'declarative home navigation', textIs('h1', 'Home'));
		});
		d.unmount();
	});

	// @parity-case differential:remix-router-navigate
	it('NavigateDiffApp: <Navigate> mount redirect, byte-identical', async () => {
		const d = await mountDifferential(DECLARATIVE, 'NavigateDiffApp', undefined, CACHE);
		await d.step('mount (redirected to /new)', async (i, r) => {
			await waitForBoth(i, r, 'Navigate redirect', textIs('h1', 'New'));
		});
		d.unmount();
	});

	// @parity-case differential:remix-router-navlink
	it('NavLinkDiffApp: NavLink active states + useSearchParams, byte-identical', async () => {
		// Phase C: default `active` class, `end`, className/children render props,
		// aria-current across navigations; useSearchParams defaults + set/clear.
		const d = await mountDifferential(NAVLINK, 'NavLinkDiffApp', undefined, CACHE);
		await d.step('mount (home active)', async (i, r) => {
			await waitForBoth(i, r, 'NavLink home mount', (mount) =>
				mount.find('#nl-home').classList.contains('active'),
			);
		});
		await d.step('to /users (parent + child-fn links flip)', async (i, r) => {
			await i.click('#nl-users');
			await r.click('#nl-users');
			await waitForBoth(
				i,
				r,
				'NavLink users navigation',
				(mount) =>
					mount.find('h1').textContent === 'Users' &&
					mount.find('#nl-users').classList.contains('active'),
			);
		});
		await d.step('to /users/7 (parent stays active, end variant not)', async (i, r) => {
			await i.click('#nl-user-7');
			await r.click('#nl-user-7');
			await waitForBoth(
				i,
				r,
				'NavLink user detail navigation',
				(mount) =>
					mount.find('h1').textContent === 'User' &&
					mount.find('#nl-users').classList.contains('active') &&
					!mount.find('#nl-users-end').classList.contains('active'),
			);
		});
		await d.step('to /search (className fn + default merge)', async (i, r) => {
			await i.click('#nl-fn');
			await r.click('#nl-fn');
			await waitForBoth(
				i,
				r,
				'NavLink search navigation',
				(mount) =>
					mount.find('#nl-fn').classList.contains('is-on') &&
					mount.find('#q').textContent === 'q=fallback',
			);
		});
		await d.step('set search param', async (i, r) => {
			await i.click('#set-q');
			await r.click('#set-q');
			await waitForBoth(i, r, 'search parameter set', textIs('#q', 'q=octane'));
		});
		await d.step('clear search params', async (i, r) => {
			await i.click('#clear-q');
			await r.click('#clear-q');
			await waitForBoth(i, r, 'search parameters cleared', textIs('#q', 'q=(none)'));
		});
		d.unmount();
	});

	// @parity-case differential:remix-router-forms
	it('FormsDiffApp: Form GET/POST + JSON submit + fetcher outcomes, byte-identical', async () => {
		// Phase D: native submit (octane) vs synthetic onSubmit (React) over the
		// same jsdom SubmitEvent; submitter formmethod; fetchers.
		const d = await mountDifferential(FORMS, 'FormsDiffApp', undefined, CACHE);
		await d.step('mount', async (i, r) => {
			await waitForBoth(
				i,
				r,
				'forms mount',
				(mount) =>
					mount.find('#loc').textContent === '/' &&
					mount.find('#action-out').textContent === '(none)',
			);
		});
		await d.step('GET form → search params', async (i, r) => {
			await i.click('#get-submit');
			await r.click('#get-submit');
			await waitForBoth(i, r, 'GET form navigation', textIs('#loc', '/?q=octane'));
		});
		await d.step('POST form → actionData', async (i, r) => {
			await i.click('#post-submit');
			await r.click('#post-submit');
			await waitForBoth(i, r, 'POST form action', textIs('#action-out', 'form:post:dominic'));
		});
		await d.step('submitter formmethod=put override', async (i, r) => {
			await i.click('#put-submit');
			await r.click('#put-submit');
			await waitForBoth(i, r, 'PUT submitter override', textIs('#action-out', 'form:put:dominic'));
		});
		await d.step('JSON useSubmit', async (i, r) => {
			await i.click('#submit-json');
			await r.click('#submit-json');
			await waitForBoth(i, r, 'JSON submission', textIs('#action-out', 'json:post:imperative'));
		});
		await d.step('fetcher.load', async (i, r) => {
			await i.click('#f-load');
			await r.click('#f-load');
			await waitForBoth(i, r, 'fetcher load', textIs('#f-data', 'instant-data'));
		});
		await d.step('fetcher.Form post', async (i, r) => {
			await i.click('#f-form-submit');
			await r.click('#f-form-submit');
			await waitForBoth(i, r, 'fetcher Form action', textIs('#f-data', 'acted:fx'));
		});
		await d.step('fetcher.submit imperative', async (i, r) => {
			await i.click('#f-submit');
			await r.click('#f-submit');
			await waitForBoth(i, r, 'imperative fetcher submit', textIs('#f-data', 'acted:imperative'));
		});
		d.unmount();
	});

	// @parity-case differential:remix-router-guards
	it('GuardsDiffApp: useBlocker lifecycle + unstable_useRouterState, byte-identical', async () => {
		// Phase E: blocked → reset → blocked → proceed, with useRoute/useRouterState probes.
		const d = await mountDifferential(GUARDS, 'GuardsDiffApp', undefined, CACHE);
		await d.step('mount', async (i, r) => {
			await waitForBoth(
				i,
				r,
				'guard home mount',
				(mount) =>
					mount.find('h1').textContent === 'Home' &&
					mount.find('#b-state').textContent === 'unblocked',
			);
		});
		await d.step('unblocked navigation', async (i, r) => {
			await i.click('#to-away');
			await r.click('#to-away');
			await waitForBoth(i, r, 'unblocked navigation', textIs('h1', 'Away'));
		});
		await d.step('arm blocker', async (i, r) => {
			await i.click('#b-toggle');
			await r.click('#b-toggle');
			await waitForBoth(i, r, 'blocker armed', textIs('#b-state', 'unblocked'));
		});
		await d.step('blocked navigation attempt', async (i, r) => {
			await i.click('#to-home');
			await r.click('#to-home');
			await waitForBoth(i, r, 'navigation blocked', textIs('#b-state', 'blocked'));
		});
		await d.step('reset (stay)', async (i, r) => {
			await i.click('#b-reset');
			await r.click('#b-reset');
			await waitForBoth(
				i,
				r,
				'blocker reset',
				(mount) =>
					mount.find('#b-state').textContent === 'unblocked' &&
					mount.find('h1').textContent === 'Away',
			);
		});
		await d.step('block again then proceed', async (i, r) => {
			await i.click('#to-home');
			await r.click('#to-home');
			await waitForBoth(i, r, 'navigation blocked again', textIs('#b-state', 'blocked'));
			await i.click('#b-proceed');
			await r.click('#b-proceed');
			await waitForBoth(
				i,
				r,
				'blocked navigation proceeded',
				(mount) =>
					mount.find('#b-state').textContent === 'unblocked' &&
					mount.find('h1').textContent === 'Home',
			);
		});
		d.unmount();
	});

	// @parity-case differential:remix-router-pending
	it('PendingApp: deterministic loading state → landed page, byte-identical', async () => {
		const d = await mountDifferential(PENDING, 'PendingApp', undefined, CACHE);
		await d.step('mount', async (i, r) => {
			await waitForBoth(
				i,
				r,
				'pending fixture mount',
				(mount) =>
					mount.find('h1').textContent === 'Home' &&
					mount.find('[data-state]').getAttribute('data-state') === 'idle',
			);
		});
		await d.step('start slow navigation (pending UI)', async (i, r) => {
			await i.click('.nav-slow');
			await r.click('.nav-slow');
			await waitForBoth(
				i,
				r,
				'pending navigation state',
				(mount) =>
					mount.find('[data-state]').getAttribute('data-state') === 'loading' &&
					mount.find('h1').textContent === 'Home',
			);
		});
		await d.step('finish loader', async (i, r) => {
			await i.click('#finish');
			await r.click('#finish');
			await waitForBoth(
				i,
				r,
				'pending navigation completion',
				(mount) =>
					mount.find('[data-state]').getAttribute('data-state') === 'idle' &&
					mount.find('h1').textContent === 'Slow:slow-data',
			);
		});
		d.unmount();
	});
});
