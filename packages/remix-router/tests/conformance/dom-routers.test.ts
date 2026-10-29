/**
 * Browser / hash / history routers (Phase C) — jsdom smokes: the routers read
 * the real window.history / location.hash, Link clicks push, and data mode
 * works over createBrowserRouter. jsdom owns ONE window, so every test resets
 * the URL and unmounts before the next.
 * Ported per react-router __tests__/dom/data-browser-router-test.tsx and
 * __tests__/dom/link-push-test.tsx.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { UNSAFE_createMemoryHistory as createMemoryHistory } from '@octanejs/remix-router';
import { mount, nextPaint } from '../_helpers';
import { BrowserApp, HashApp, HistoryApp, BrowserDataApp } from '../_fixtures/dom-routers.tsrx';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

beforeEach(() => {
	window.history.replaceState(null, '', '/');
});

describe('<BrowserRouter>', () => {
	it('renders the route matching window.location and pushes on Link clicks', async () => {
		window.history.replaceState(null, '', '/about');
		const r = mount(BrowserApp, {});
		await flush();
		expect(r.find('h1').textContent).toBe('About');

		r.click('.go-home');
		await flush();
		expect(r.find('h1').textContent).toBe('Home');
		expect(window.location.pathname).toBe('/');

		r.click('.go-about');
		await flush();
		expect(r.find('h1').textContent).toBe('About');
		expect(window.location.pathname).toBe('/about');
		r.unmount();
	});
});

describe('<HashRouter>', () => {
	it('stores the location in the hash and navigates via Link clicks', async () => {
		window.location.hash = '';
		const r = mount(HashApp, {});
		await flush();
		expect(r.find('h1').textContent).toBe('Home');

		r.click('.go-about');
		await flush();
		expect(r.find('h1').textContent).toBe('About');
		expect(window.location.hash).toBe('#/about');
		r.unmount();
	});
});

describe('<unstable_HistoryRouter>', () => {
	it('resubscribes when two history instances share the same listen function', async () => {
		const subscriptions: string[] = [];
		let owner = 'first';
		const listen = () => {
			const subscribed = owner;
			subscriptions.push('subscribe ' + subscribed);
			return () => subscriptions.push('unsubscribe ' + subscribed);
		};
		const first = Object.assign(createMemoryHistory(), { listen });
		const second = Object.assign(createMemoryHistory(), { listen });
		const r = mount(HistoryApp, { history: first });
		r.update(HistoryApp, { history: first });
		await flush();
		expect(subscriptions).toEqual(['subscribe first']);
		owner = 'second';
		r.update(HistoryApp, { history: second });
		await flush();
		r.unmount();
		expect(subscriptions).toEqual([
			'subscribe first',
			'unsubscribe first',
			'subscribe second',
			'unsubscribe second',
		]);
	});

	it('drives the router from a caller-provided history instance', async () => {
		const history = createMemoryHistory({ initialEntries: ['/about'], v5Compat: true });
		const r = mount(HistoryApp, { history });
		await flush();
		expect(r.find('h1').textContent).toBe('About');

		r.click('.go-home');
		await flush();
		expect(r.find('h1').textContent).toBe('Home');
		expect(history.location.pathname).toBe('/');
		r.unmount();
	});
});

describe('createBrowserRouter (data mode)', () => {
	it('navigates, runs loaders, and reflects the URL in window.history', async () => {
		// Per data-browser-router-test.tsx "navigates through a history stack".
		window.history.replaceState(null, '', '/users/dominic');
		const r = mount(BrowserDataApp, {});
		await flush();
		expect(r.find('h1').textContent).toBe('User dominic');

		r.click('.go-about');
		await flush();
		expect(r.find('h1').textContent).toBe('About');
		expect(window.location.pathname).toBe('/about');
		r.unmount();
	});
});
