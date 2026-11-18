/**
 * The server render: a store per request whose reads run in process, the
 * page's HTML once every read has loaded, and the seed the client hydrates from.
 */
import { createDataStore } from 'octane/data';
import { prerender } from 'octane/static';
import { App, type Strategy } from './app.tsrx';
import { handler } from './handler.ts';

export { handler };

export async function render(request: Request, strategy: Strategy, id: string) {
	const store = createDataStore({ transport: handler.transport(request) });
	try {
		const { html, css } = await prerender(App, { store, strategy, id });
		return { html: css + html, seed: store.dehydrate() };
	} finally {
		store.retire();
	}
}
