import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { PreloadedApp, createPreloadedStore, preloadedApi } from './_fixtures/preloaded.tsrx';

describe('@octanejs/redux-toolkit SSR', () => {
	it('renders fulfilled RTK Query cache data without a DOM', async () => {
		expect(typeof document).toBe('undefined');
		const store = createPreloadedStore();
		await store.dispatch(preloadedApi.endpoints.getValue.initiate('value'));

		const { html, css } = renderToString(PreloadedApp, { store });
		expect(html.replace(/<!--[^>]*-->/g, '')).toBe(
			'<p id="preloaded-result">result=server-value:fulfilled</p>',
		);
		expect(css).toBe('');
	});
});
