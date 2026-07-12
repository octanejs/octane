/**
 * @octanejs/remix-router <Await> conformance — deferred loader values through
 * octane's suspense boundary (@try/@pending in the fixture), against the REAL
 * vendored core. Ports behaviors from react-router's
 * data-memory-router-test.tsx "defer" suite.
 */
import { describe, it, expect } from 'vitest';
import { createMemoryRouter } from '@octanejs/remix-router';
import { mount, nextPaint } from '../_helpers';
import { App, ErrorProbe } from '../_fixtures/basic.tsrx';
import { AwaitPage, AwaitRenderPropPage, AwaitNoErrorElementPage } from '../_fixtures/await.tsrx';
import { createElement } from 'octane';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

function router(element: unknown, msg: unknown, errorElement?: unknown) {
	return createMemoryRouter([{ path: '/', loader: () => ({ msg }), element, errorElement }]);
}

describe('<Await>', () => {
	it('shows the suspense fallback while pending, then children + useAsyncValue', async () => {
		// Per data-memory-router-test.tsx:2651 ("allows loaders to returned
		// deferred data (child component)").
		let resolve: any;
		const p = new Promise((res) => (resolve = res));
		const r = mount(App, { router: router(createElement(AwaitPage), p) });
		await flush();
		expect(r.find('.fallback').textContent).toBe('loading');
		expect(r.findAll('.value').length).toBe(0);

		resolve('hello');
		await flush();
		expect(r.findAll('.fallback').length).toBe(0);
		expect(r.find('.value').textContent).toBe('got:hello');
		r.unmount();
	});

	it('supports the render-prop children form', async () => {
		// Per data-memory-router-test.tsx:2708 ("allows loaders to returned
		// deferred data (render prop)").
		let resolve: any;
		const p = new Promise((res) => (resolve = res));
		const r = mount(App, { router: router(createElement(AwaitRenderPropPage), p) });
		await flush();
		expect(r.find('.fallback').textContent).toBe('loading');

		resolve('world');
		await flush();
		expect(r.find('.value').textContent).toBe('rp:world');
		r.unmount();
	});

	it("a rejection renders Await's errorElement and exposes useAsyncError", async () => {
		// Per data-memory-router-test.tsx:2766 ("sends data errors to the
		// provided errorElement").
		let reject: any;
		const p = new Promise((_res, rej) => (reject = rej));
		const r = mount(App, { router: router(createElement(AwaitPage), p) });
		await flush();
		expect(r.find('.fallback').textContent).toBe('loading');

		reject(new Error('oh no'));
		await flush();
		expect(r.findAll('.fallback').length).toBe(0);
		expect(r.findAll('.value').length).toBe(0);
		expect(r.find('.await-err').textContent).toBe('err:oh no');
		r.unmount();
	});

	it('a rejection with NO errorElement bubbles to the route error boundary', async () => {
		// Per data-memory-router-test.tsx:2828 ("sends unhandled data errors to
		// the nearest route error boundary").
		let reject: any;
		const p = new Promise((_res, rej) => (reject = rej));
		const r = mount(App, {
			router: router(createElement(AwaitNoErrorElementPage), p, createElement(ErrorProbe)),
		});
		await flush();
		expect(r.find('.fallback').textContent).toBe('loading');

		reject(new Error('bubble'));
		await flush();
		expect(r.findAll('.fallback').length).toBe(0);
		expect(r.find('.err').textContent).toBe('error:bubble');
		r.unmount();
	});

	it('renders immediately for a raw (non-promise) resolve value', async () => {
		// Per data-memory-router-test.tsx:3324 ("can render raw values with <Await>").
		const r = mount(App, { router: router(createElement(AwaitPage), 'plain') });
		await flush();
		expect(r.findAll('.fallback').length).toBe(0);
		expect(r.find('.value').textContent).toBe('got:plain');
		r.unmount();
	});

	it('renders promises that resolve to undefined', async () => {
		// Per data-memory-router-test.tsx:3232 ("can render raw resolved to
		// undefined promises with <Await>").
		let resolve: any;
		const p = new Promise((res) => (resolve = res));
		const r = mount(App, { router: router(createElement(AwaitPage), p) });
		await flush();
		expect(r.find('.fallback').textContent).toBe('loading');

		resolve(undefined);
		await flush();
		expect(r.find('.value').textContent).toBe('got:undefined');
		r.unmount();
	});
});
