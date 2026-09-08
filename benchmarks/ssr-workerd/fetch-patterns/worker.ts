import { renderToReadableStream } from 'octane/server';
import { Page } from './Pages.tsrx';
import { clearDataCache, createWorkload, type Backend, type Stats } from './data';

const requests = new Map<string, Stats>();

export default {
	async fetch(
		request: Request,
		env: { BACKEND: Backend },
		ctx: { waitUntil(job: Promise<unknown>): void },
	) {
		const url = new URL(request.url);
		if (url.pathname === '/clear-cache') {
			clearDataCache();
			return new Response('ok');
		}
		const id = url.searchParams.get('id')!;
		if (url.pathname === '/stats') {
			const stats = requests.get(id);
			if (stats?.done) requests.delete(id);
			return Response.json(stats ?? null);
		}
		const work = createWorkload(url, env.BACKEND);
		requests.set(id, work.stats);
		const abort = new AbortController();
		const timeout = setTimeout(() => abort.abort(new Error('Benchmark render timeout')), 5000);
		try {
			const stream = await renderToReadableStream(
				Page,
				{ work },
				{
					signal: abort.signal,
					onError(error) {
						work.stats.errors.push(String(error));
					},
				},
			);
			ctx.waitUntil(
				(async () => {
					try {
						await stream.allReady;
					} catch {
						/* captured by onError */
					}
					await Promise.allSettled(work.jobs);
					clearTimeout(timeout);
					work.stats.done = true;
				})(),
			);
			return new Response(stream, { headers: { 'content-type': 'text/html; charset=utf-8' } });
		} catch (error) {
			clearTimeout(timeout);
			work.stats.errors.push(String(error));
			ctx.waitUntil(
				Promise.allSettled(work.jobs).then(() => {
					work.stats.done = true;
				}),
			);
			return new Response(String(error), { status: 500 });
		}
	},
};
