import { renderToReadableStream } from 'octane/server';
import { App } from '../../../streaming-ssr/octane/src/App.tsrx';
import { makeCards, type Scenario } from '../../../streaming-ssr/octane/src/data';

// Module Worker — octane target. The SAME ~12 lines front both targets (see
// ../../react/src/worker.ts): parse the scenario, start the renderer's web
// stream, return it as the Response body. Any measured gap is the renderer's,
// not the worker shell's. Data promises start at fetch time, mirroring backend
// requests fired when the HTTP request arrives.
export default {
	async fetch(request: Request): Promise<Response> {
		const scenario = (new URL(request.url).searchParams.get('scenario') ?? 'all-fast') as Scenario;
		const stream = await renderToReadableStream(App, { cards: makeCards(scenario) });
		return new Response(stream, {
			headers: { 'content-type': 'text/html; charset=utf-8' },
		});
	},
};
