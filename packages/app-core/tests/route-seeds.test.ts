// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContext } from '../src/server/middleware.js';
import { composeHtmlStream } from '../src/server/html-stream.js';
import { failRoute, onRouteEnd, readRouteSeed, routeEnding, routeSeed } from '../src/seeds.js';
import { resolveOctaneConfig } from '../src/resolve-config.js';
import { create_client_entry_source } from '../src/codegen.js';

const context = () => createContext(new Request('https://app.test/'), {});

/** A render stream that yields `chunks`, then ends. */
function rendered(chunks: string[]) {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
}

const text = (stream: ReadableStream<Uint8Array>) => new Response(stream).text();

afterEach(() => {
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

describe('route seeds', () => {
	it('writes each seed before </body> once the render has finished, and the browser reads it back', async () => {
		const route = context();
		const produced: string[] = [];
		routeSeed(route, 'data', () => {
			produced.push('data');
			return 'a "seed" with </script> and <!-- in it';
		});
		const body = composeHtmlStream(
			'<html><body><div id="root">',
			rendered(['<p>page</p>']),
			'</div></body></html>',
			'',
			routeEnding(route, ' nonce="n1"'),
		);
		// Nothing is produced before the render has been read through.
		expect(produced).toEqual([]);
		const html = await text(body);
		expect(produced).toEqual(['data']);
		expect(html).toMatch(
			/^<html><body><div id="root"><p>page<\/p><\/div><script id="__octane_seed:data" type="application\/json" nonce="n1">[^<]*<\/script><\/body><\/html>$/,
		);

		document.body.innerHTML = html.slice(html.indexOf('<div'), html.lastIndexOf('</body>'));
		expect(readRouteSeed('data')).toBe('a "seed" with </script> and <!-- in it');
		expect(readRouteSeed('missing')).toBeNull();
	});

	it('leaves out a seed that fails to produce, and keeps the others', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const route = context();
		routeSeed(route, 'broken', () => {
			throw new Error('no');
		});
		routeSeed(route, 'kept', async () => 'yes');
		const html = await text(
			composeHtmlStream('', rendered(['x']), '</body>', '', routeEnding(route, '')),
		);
		expect(html).not.toContain('__octane_seed:broken');
		expect(html).toContain(
			'<script id="__octane_seed:kept" type="application/json">"yes"</script></body>',
		);
	});

	it('releases a route once, whether its stream completes or is cancelled', async () => {
		const completed = context();
		const release = vi.fn();
		onRouteEnd(completed, release);
		await text(composeHtmlStream('', rendered(['x']), '', '', routeEnding(completed, '')));
		expect(release).toHaveBeenCalledTimes(1);
		// Ending again, or registering after the end, runs it once and at once.
		routeEnding(completed, '').end();
		const late = vi.fn();
		onRouteEnd(completed, late);
		expect(release).toHaveBeenCalledTimes(1);
		expect(late).toHaveBeenCalledTimes(1);

		const cancelled = context();
		const released = vi.fn();
		const produce = vi.fn(() => 'never');
		onRouteEnd(cancelled, released);
		routeSeed(cancelled, 'data', produce);
		const reader = composeHtmlStream(
			'<p>',
			new ReadableStream<Uint8Array>({ pull() {} }),
			'</p>',
			'',
			routeEnding(cancelled, ''),
		).getReader();
		await reader.read();
		await reader.cancel();
		expect(released).toHaveBeenCalledTimes(1);
		// A cancelled page never finished rendering, so it has nothing to seed.
		expect(produce).not.toHaveBeenCalled();
	});

	it("cancels a failed request's live stream, which ends its render and releases the route", async () => {
		const route = context();
		const released = vi.fn();
		const cancelled = vi.fn();
		onRouteEnd(route, released);
		composeHtmlStream(
			'<p>',
			new ReadableStream<Uint8Array>({ pull() {}, cancel: cancelled }),
			'</p>',
			'',
			routeEnding(route, ''),
		);
		failRoute(route);
		await vi.waitFor(() => expect(released).toHaveBeenCalledTimes(1));
		expect(cancelled).toHaveBeenCalledTimes(1);

		// A request that failed before streaming ends at once.
		const early = context();
		const releasedEarly = vi.fn();
		onRouteEnd(early, releasedEarly);
		failRoute(early);
		expect(releasedEarly).toHaveBeenCalledTimes(1);
	});

	it('refuses a name that could not be an element id', () => {
		expect(() => routeSeed(context(), 'two words', () => '')).toThrow(/may only use/);
	});
});

describe('config data module', () => {
	it('takes a project-root module ID', () => {
		expect(resolveOctaneConfig({ data: '/src/data.ts' }).data).toBe('/src/data.ts');
		expect(() => resolveOctaneConfig({ data: './src/data.ts' })).toThrow(/project-root module ID/);
	});

	it('leaves the data store out of a client entry whose app has no data module', () => {
		const ids = {
			runtimeModuleId: 'runtime',
			dataRootModuleId: 'data-root',
			seedsModuleId: 'seeds',
		};
		expect(create_client_entry_source(ids)).not.toContain('data-root');
		expect(create_client_entry_source({ ...ids, data: true })).toContain('"data-root"');
		// DataRoot wraps the route in a body no void proof covers.
		expect(create_client_entry_source({ ...ids, voidRoot: true })).toContain('__hydrateVoidRoot');
		expect(create_client_entry_source({ ...ids, voidRoot: true, data: true })).not.toContain(
			'__hydrateVoidRoot',
		);
	});
});
