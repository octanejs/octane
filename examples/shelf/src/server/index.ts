/**
 * The server: the data handler, and a renderer for the Octane and React pages.
 * Each page render gets its own store, which calls the handler in process
 * under the page request's account. Its loaded values go into the page, so the
 * browser's store starts with them and hydration loads nothing.
 */
import { createDataStore } from 'octane/data';
import { createShelfHandler } from '../shared/server.ts';
import { namespaceFrom, serverSession } from '../shared/session.ts';
import { renderOctane } from '../octane/server.ts';
import { renderReact } from '../react/server.tsx';

export type Page = 'octane' | 'react';

export function createShelfServer() {
	const data = createShelfHandler();

	async function render(page: Page, url: URL, template: string): Promise<string> {
		const account = 'ada';
		const request = new Request(url, {
			headers: { 'x-shelf-account': namespaceFrom(url.search) + account },
		});
		const store = createDataStore({ transport: data.transport(request) });
		let html: string;
		let seed: string;
		try {
			html = await (page === 'octane' ? renderOctane : renderReact)(serverSession(account, store));
			seed = store.dehydrate();
		} finally {
			// A failed render still ends the request's store and its timers.
			store.retire();
		}
		return template
			.replace('<!--ssr-html-->', () => html)
			.replace(
				'<!--ssr-seed-->',
				() => `<script type="application/json" id="shelf-seed">${seed}</script>`,
			);
	}

	return { data, render };
}
