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

	/**
	 * Render a page, or run the native form POST that reached it. An accepted
	 * submission redirects back to the page; a refused one renders the page with
	 * the form's values and issues.
	 */
	async function render(page: Page, request: Request, template: string): Promise<Response> {
		const account = 'ada';
		const url = new URL(request.url);
		const headers = new Headers(request.headers);
		headers.set('x-shelf-account', namespaceFrom(url.search) + account);
		const authenticated = new Request(request, { headers });
		const forms = await data.forms(authenticated);
		if (forms.response) return forms.response;
		const store = createDataStore({ transport: data.transport(authenticated), form: forms.form });
		let html: string;
		let seed: string;
		try {
			html = await (page === 'octane' ? renderOctane : renderReact)(serverSession(account, store));
			seed = store.dehydrate();
		} finally {
			// A failed render still ends the request's store and its timers.
			store.retire();
		}
		const body = template
			.replace('<!--ssr-html-->', () => html)
			.replace(
				'<!--ssr-seed-->',
				() => `<script type="application/json" id="shelf-seed">${seed}</script>`,
			);
		return new Response(body, { status: forms.status, headers: { 'content-type': 'text/html' } });
	}

	return { data, render };
}
