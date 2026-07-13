import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { settle } from '../_helpers';
import { PreloadedApp, createPreloadedStore, preloadedApi } from '../ssr/_fixtures/preloaded.tsrx';

const SERVER_HTML =
	'<!--[--><!--[--><p id="preloaded-result">result=server-value:fulfilled</p><!--]--><!--]-->';

function expandCountedMarkers(html: string): string {
	return html.replace(/<!--([\[\]])([1-9]\d*)-->/g, (whole, marker: string, raw: string) => {
		const count = Number(raw);
		return Number.isSafeInteger(count) && count > 1 ? `<!--${marker}-->`.repeat(count) : whole;
	});
}

let container: HTMLElement;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	container = document.createElement('div');
	container.innerHTML = SERVER_HTML;
	document.body.appendChild(container);
	error = vi.spyOn(console, 'error');
});

afterEach(() => {
	expect(error.mock.calls).toEqual([]);
	error.mockRestore();
	container.remove();
});

describe('@octanejs/redux-toolkit hydration', () => {
	it('adopts preloaded query output and subscribes it to cache updates', async () => {
		const store = createPreloadedStore();
		await store.dispatch(preloadedApi.endpoints.getValue.initiate('value'));
		const paragraph = container.querySelector('#preloaded-result');

		const root = hydrateRoot(container, PreloadedApp, { store });
		flushSync(() => {});
		await settle(1);
		expect(expandCountedMarkers(container.innerHTML)).toBe(SERVER_HTML);
		expect(container.querySelector('#preloaded-result')).toBe(paragraph);

		store.dispatch(preloadedApi.util.updateQueryData('getValue', 'value', () => 'client-updated'));
		expect(preloadedApi.endpoints.getValue.select('value')(store.getState()).data).toBe(
			'client-updated',
		);
		// configureStore batches this low-priority cache notification on its
		// default animation-frame scheduler.
		await settle(30);
		expect(container.querySelector('#preloaded-result')?.textContent).toBe(
			'result=client-updated:fulfilled',
		);
		expect(container.querySelector('#preloaded-result')).toBe(paragraph);
		root.unmount();
	});
});
