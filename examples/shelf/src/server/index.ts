/**
 * The server: browser calls to `data`, and a renderer for the Octane and React
 * pages. One middleware authenticates both. Each page render gets its own store,
 * whose `data` calls run in process under the page request's account. Its
 * loaded values go into the page, so the browser's store starts with them and
 * hydration loads nothing.
 */
import type { Middleware } from '@octanejs/app-core';
import { createServerFunctions } from '@octanejs/app-core/server-functions';
import { createDataStore, serverTransport } from 'octane/data';
import * as dataModule from '../shared/data.tsrx';
import { handler } from '../shared/server.ts';
import { ACCOUNT_COOKIE, namespaceFrom, serverSession } from '../shared/session.ts';
import { renderOctane } from '../octane/server.ts';
import { renderReact } from '../react/server.tsx';
import { PAGES, type Page } from './routes.ts';

/**
 * A browser call acts for the account its cookie names. A page renders for its
 * namespace's first account, which the browser then signs in as; its in-process
 * calls keep that account.
 */
const authenticate: Middleware = (context, next) => {
	if (context.viewer === undefined) {
		const cookie = context.request.headers.get('cookie') ?? '';
		const named = cookie.match(new RegExp(`(?:^|;\\s*)${ACCOUNT_COOKIE}=([^;]*)`))?.[1];
		context.viewer =
			context.rpc && named ? decodeURIComponent(named) : namespaceFrom(context.url.search) + 'ada';
	}
	return next();
};

export function createShelfServer() {
	const functions = createServerFunctions({
		// Keyed as the compiler names the module, by its path from the project root.
		modules: { '/src/shared/data.tsrx': dataModule },
		middlewares: [authenticate],
	});

	/**
	 * Render a page, or run the native form POST that reached it. An accepted
	 * submission redirects back to the page; a refused one renders the page with
	 * the form's values and issues.
	 */
	function render(page: Page, request: Request, template: string): Promise<Response> {
		return functions.respond(request, async (context) => {
			const forms = await handler.forms(context.request, context);
			if (forms.response) return forms.response;
			const store = createDataStore({
				transport: serverTransport(dataModule.data),
				form: forms.form,
			});
			let html: string;
			let seed: string;
			try {
				html = await (page === 'octane' ? renderOctane : renderReact)(serverSession('ada', store));
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
		});
	}

	/**
	 * Answer a page, or a browser's call to `data`. `template` reads a page's
	 * HTML file; anything else, such as a built asset, is `null`, for the host to serve.
	 */
	async function fetch(
		request: Request,
		template: (file: string) => Promise<string>,
	): Promise<Response | null> {
		const route = PAGES[new URL(request.url).pathname];
		// A page takes GET, and POST from its forms before hydration or without JavaScript.
		if (route) return render(route.page, request, await template(route.file));
		return functions.handle(request);
	}

	return { fetch };
}
