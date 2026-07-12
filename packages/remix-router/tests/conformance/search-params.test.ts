/**
 * useSearchParams (Phase C) — read from location.search, defaultInit merge
 * semantics, and the object/function setter forms (each set navigates).
 * Ported per react-router __tests__/dom/search-params-test.tsx.
 */
import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { SearchParamsApp } from '../_fixtures/search-params.tsrx';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('useSearchParams', () => {
	it('reads the current search string', async () => {
		// Per search-params-test.tsx "reads and writes the search string".
		const r = mount(SearchParamsApp, { initial: '/?q=router' });
		await flush();
		expect(r.find('#q').textContent).toBe('q=router');
		r.unmount();
	});

	it('setSearchParams(object) replaces the params and navigates', async () => {
		const r = mount(SearchParamsApp, { initial: '/?q=initial&page=3' });
		await flush();
		r.click('#set-obj');
		await flush();
		expect(r.find('#q').textContent).toBe('q=octane');
		expect(r.find('#page').textContent).toBe('page=(none)'); // replaced, not merged
		r.unmount();
	});

	it('setSearchParams(fn) receives the previous params', async () => {
		// Per search-params-test.tsx "allows a function to be passed".
		const r = mount(SearchParamsApp, { initial: '/?page=1' });
		await flush();
		r.click('#set-fn');
		await flush();
		expect(r.find('#page').textContent).toBe('page=2');
		r.click('#set-fn');
		await flush();
		expect(r.find('#page').textContent).toBe('page=3');
		r.unmount();
	});

	it('returns initial default values for params the URL lacks', async () => {
		// Per search-params-test.tsx "returns initial default values in search params".
		const r = mount(SearchParamsApp, { defaultInit: { q: 'fallback' } });
		await flush();
		expect(r.find('#q').textContent).toBe('q=fallback');
		r.unmount();
	});

	it('allows removal of search params when a default is provided', async () => {
		// Per search-params-test.tsx "allows removal of search params when a
		// default is provided" — the URL carries the param, so the first
		// setSearchParams({}) changes location.search AND drops the default merge.
		const r = mount(SearchParamsApp, {
			initial: '/?q=initial',
			defaultInit: { q: 'initial' },
		});
		await flush();
		expect(r.find('#q').textContent).toBe('q=initial');

		r.click('#clear');
		await flush();
		expect(r.find('#q').textContent).toBe('q=(none)');
		r.unmount();
	});

	it('the URL wins over defaultInit for present params', async () => {
		const r = mount(SearchParamsApp, { initial: '/?q=fromurl', defaultInit: { q: 'fallback' } });
		await flush();
		expect(r.find('#q').textContent).toBe('q=fromurl');
		r.unmount();
	});
});
