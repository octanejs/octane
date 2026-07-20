import { createElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.edge';
import { App } from '../../../streaming-ssr/react/src/App.tsrx';
import { makeCards, type Scenario } from '../../../streaming-ssr/react/src/data';

// Module Worker — React 19 target (Fizz edge). A line-for-line mirror of
// ../../octane/src/worker.ts: parse the scenario, start the renderer's web
// stream, return it as the Response body. renderToReadableStream is Fizz's
// Workers-native entry (react-dom/server.edge), the same import a real React
// app deployed to Cloudflare uses.
export default {
	async fetch(request: Request): Promise<Response> {
		const scenario = (new URL(request.url).searchParams.get('scenario') ?? 'all-fast') as Scenario;
		const stream = await renderToReadableStream(createElement(App, { cards: makeCards(scenario) }));
		return new Response(stream, {
			headers: { 'content-type': 'text/html; charset=utf-8' },
		});
	},
};
