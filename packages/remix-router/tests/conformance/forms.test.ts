/**
 * <Form> / useSubmit / useFormAction / useFetcher(s) (Phase D). Ported per
 * react-router __tests__/dom/data-browser-router-test.tsx (Form/fetcher
 * behaviors run identically on the memory router). Octane note: Form's
 * onSubmit is a NATIVE delegated submit listener — jsdom fires SubmitEvent
 * (with `submitter`) when a submit button is clicked, same as the browser.
 */
import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { FormApp, FormActionApp, FetcherApp, fetcherGate } from '../_fixtures/forms.tsrx';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('<Form>', () => {
	it('GET forms navigate with the form fields as search params', async () => {
		// Per data-browser-router-test.tsx "supports <Form method="get">".
		const r = mount(FormApp, {});
		await flush();
		expect(r.find('#loc').textContent).toBe('/');

		r.click('#get-submit');
		await flush();
		expect(r.find('#loc').textContent).toBe('/?q=octane');
		r.unmount();
	});

	it('POST forms submit formData to the route action; actionData renders', async () => {
		// Per data-browser-router-test.tsx "supports <Form method="post">".
		const r = mount(FormApp, {});
		await flush();
		expect(r.find('#action-out').textContent).toBe('(none)');

		r.click('#post-submit');
		await flush();
		expect(r.find('#action-out').textContent).toBe('form:post:dominic');
		r.unmount();
	});

	it('a submitter formmethod overrides the form method', async () => {
		// Per data-browser-router-test.tsx submitter handling.
		const r = mount(FormApp, {});
		await flush();
		r.click('#put-submit');
		await flush();
		expect(r.find('#action-out').textContent).toBe('form:put:dominic');
		r.unmount();
	});
});

describe('useSubmit', () => {
	it('submits plain objects with encType application/json', async () => {
		// Per data-browser-router-test.tsx "supports JSON submissions".
		const r = mount(FormApp, {});
		await flush();
		r.click('#submit-json');
		await flush();
		expect(r.find('#action-out').textContent).toBe('json:post:imperative');
		r.unmount();
	});
});

describe('useFormAction', () => {
	it('index routes resolve to ?index; named actions append to the route path', async () => {
		// Per useFormAction unit behaviors in data-browser-router-test.tsx.
		const r = mount(FormActionApp, {});
		await flush();
		expect(r.find('#fa-default').textContent).toBe('/?index');
		expect(r.find('#fa-destroy').textContent).toBe('/destroy');
		r.unmount();
	});

	it('child routes resolve against the closest route', async () => {
		const r = mount(FormActionApp, { initial: '/items/5' });
		await flush();
		expect(r.find('#fa-default').textContent).toBe('/items/5');
		expect(r.find('#fa-destroy').textContent).toBe('/items/5/destroy');
		r.unmount();
	});
});

describe('useFetcher / useFetchers', () => {
	it('fetcher.load runs a loader without navigating: idle → loading → idle + data', async () => {
		// Per data-browser-router-test.tsx "fetcher.load()".
		fetcherGate.resolve = null;
		const r = mount(FetcherApp, {});
		await flush();
		expect(r.find('#f-state').textContent).toBe('idle');
		expect(r.find('#f-count').textContent).toBe('0');

		r.click('#f-load');
		await flush();
		expect(r.find('#f-state').textContent).toBe('loading');
		expect(r.find('#f-count').textContent).toBe('1');
		expect(r.find('#loc, #f-data').textContent).toBe('(none)'); // no navigation, no data yet

		fetcherGate.resolve!({ value: 'api-data' });
		await flush();
		expect(r.find('#f-state').textContent).toBe('idle');
		expect(r.find('#f-data').textContent).toBe('api-data');
		r.unmount();
	});

	it('fetcher.Form posts to an action without navigating', async () => {
		// Per data-browser-router-test.tsx "fetcher.Form".
		const r = mount(FetcherApp, {});
		await flush();
		r.click('#f-form-submit');
		await flush();
		expect(r.find('#f-data').textContent).toBe('acted:fx');
		r.unmount();
	});

	it('fetcher.submit posts imperatively', async () => {
		const r = mount(FetcherApp, {});
		await flush();
		r.click('#f-submit');
		await flush();
		expect(r.find('#f-data').textContent).toBe('acted:imperative');
		r.unmount();
	});

	it('fetchers with the same key share state across components', async () => {
		// Per data-browser-router-test.tsx fetcher `key` behaviors.
		const r = mount(FetcherApp, {});
		await flush();
		expect(r.find('#shared-mirror').textContent).toBe('(none)');

		r.click('#shared-load');
		await flush();
		expect(r.find('#shared-data').textContent).toBe('instant-data');
		expect(r.find('#shared-mirror').textContent).toBe('instant-data');
		r.unmount();
	});
});
