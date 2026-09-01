import { describe, expect, it, vi } from 'vitest';
import { createQueryStore as createServerQueryStore } from '@octanejs/sanity-loader/rsc';
import { renderToStaticMarkup } from 'octane/server';
import { InitialQuery } from '../_fixtures/initial-query.tsrx';

describe('@octanejs/sanity-loader — SSR', () => {
	it('renders the initial query snapshot without a browser client', () => {
		const result = renderToStaticMarkup(InitialQuery);
		expect(result.html).toBe('<output data-loading="false">Octane and Sanity</output>');
	});

	it('preserves an explicit useCdn false in the server-only loader', async () => {
		const fetch = vi.fn(async () => ({ result: { title: 'Fresh' }, resultSourceMap: undefined }));
		const client = {
			config: vi.fn(() => ({ perspective: 'published', token: undefined, useCdn: true })),
			fetch,
			withConfig: vi.fn(() => client),
		};
		const serverStore = createServerQueryStore({ client: false, ssr: true });
		serverStore.setServerClient(client as never);

		await serverStore.loadQuery('*[_type == "post"]', {}, { useCdn: false });

		expect(fetch).toHaveBeenCalledWith(
			'*[_type == "post"]',
			{},
			expect.objectContaining({ useCdn: false }),
		);
	});
});
