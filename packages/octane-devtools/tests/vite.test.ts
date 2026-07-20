/**
 * The standalone dev-server plugin: the panel entry is served and injected
 * for dev HTML, and `/__octane_devtools/snapshot` relays one request/response
 * pair over the HMR websocket.
 */
import { describe, expect, it } from 'vitest';
// Relative import (tool-test convention): the project's `@octanejs/devtools/*`
// alias maps subpaths to `.ts` sources, and this entry is intentionally plain JS.
import {
	create_devtools_entry_source,
	create_devtools_snapshot_middleware,
	octaneDevtools,
	RESOLVED_VIRTUAL_DEVTOOLS_ID,
	VIRTUAL_DEVTOOLS_ID,
} from '../src/vite.js';

type AnyPlugin = Record<string, any>;

function plugin(): AnyPlugin {
	return octaneDevtools() as unknown as AnyPlugin;
}

describe('octaneDevtools plugin', () => {
	it('is a serve-only plugin', () => {
		expect(plugin().apply).toBe('serve');
	});

	it('serves the devtools entry through the virtual module pair', () => {
		const instance = plugin();
		expect(instance.resolveId(VIRTUAL_DEVTOOLS_ID)).toBe(RESOLVED_VIRTUAL_DEVTOOLS_ID);
		expect(instance.resolveId('/src/main.ts')).toBeNull();
		const source = instance.load(RESOLVED_VIRTUAL_DEVTOOLS_ID);
		expect(source).toContain("import('@octanejs/devtools')");
		expect(source).toContain('mountOctaneDevtools');
		expect(source).toContain('octane:devtools:snapshot-request');
	});

	it('injects the panel entry into every dev HTML response', () => {
		const result = plugin().transformIndexHtml.handler('<html><body></body></html>') as {
			html: string;
			tags: Array<{ tag: string; attrs: Record<string, string> }>;
		};
		expect(result.tags).toHaveLength(1);
		expect(result.tags[0].tag).toBe('script');
		expect(result.tags[0].attrs.type).toBe('module');
		expect(result.tags[0].attrs.src).toBe(`/@id/${VIRTUAL_DEVTOOLS_ID}`);
	});

	it('generates an entry that tolerates a missing @octanejs/devtools install', () => {
		expect(create_devtools_entry_source()).toContain('could not be loaded');
	});

	it('warns when the compiler half is not emitting devtools instrumentation', () => {
		const warnings: string[] = [];
		const logger = { warn: (message: string) => warnings.push(message) };
		plugin().configResolved({ define: {}, logger });
		expect(warnings.join(' ')).toContain('devtools: true');
		warnings.length = 0;
		plugin().configResolved({ define: { __OCTANE_DEVTOOLS_ENABLED__: 'true' }, logger });
		expect(warnings).toEqual([]);
	});
});

interface FakeChannel {
	handlers: Map<string, Set<(payload: unknown) => void>>;
	sent: Array<{ event: string; payload: any }>;
	on(event: string, handler: (payload: unknown) => void): void;
	off(event: string, handler: (payload: unknown) => void): void;
	send(event: string, payload: unknown): void;
	emit(event: string, payload: unknown): void;
}

function fakeChannel(): FakeChannel {
	const handlers = new Map<string, Set<(payload: unknown) => void>>();
	return {
		handlers,
		sent: [],
		on(event, handler) {
			let set = handlers.get(event);
			if (set === undefined) handlers.set(event, (set = new Set()));
			set.add(handler);
		},
		off(event, handler) {
			handlers.get(event)?.delete(handler);
		},
		send(event, payload) {
			this.sent.push({ event, payload });
		},
		emit(event, payload) {
			for (const handler of handlers.get(event) ?? []) handler(payload);
		},
	};
}

function fakeResponse(): {
	res: any;
	done: Promise<{ status: number; body: any }>;
} {
	let resolve!: (result: { status: number; body: any }) => void;
	const done = new Promise<{ status: number; body: any }>((r) => (resolve = r));
	const res: any = {
		statusCode: 200,
		setHeader() {},
		end(body: string) {
			resolve({ status: res.statusCode, body: JSON.parse(body) });
		},
	};
	return { res, done };
}

describe('snapshot middleware', () => {
	it('relays a snapshot over the websocket and forwards query options', async () => {
		const ws = fakeChannel();
		const middleware = create_devtools_snapshot_middleware({ ws } as never);
		const { res, done } = fakeResponse();
		middleware(
			{ method: 'GET', url: '/?includeState=false&maxDetailedNodes=10&eventLimit=5' } as never,
			res,
			() => {},
		);

		expect(ws.sent).toHaveLength(1);
		const request = ws.sent[0];
		expect(request.event).toBe('octane:devtools:snapshot-request');
		expect(request.payload.options).toEqual({
			includeState: false,
			maxDetailedNodes: 10,
			eventLimit: 5,
		});

		ws.emit('octane:devtools:snapshot-response', {
			id: request.payload.id,
			snapshot: { source: 'octane-devtools', componentCount: 2 },
			error: null,
		});
		expect(await done).toEqual({
			status: 200,
			body: { source: 'octane-devtools', componentCount: 2 },
		});
		// The one-shot listener is removed after settling.
		expect(ws.handlers.get('octane:devtools:snapshot-response')?.size ?? 0).toBe(0);
	});

	it('prefers a successful tab over an earlier error response (multi-tab race)', async () => {
		const ws = fakeChannel();
		const middleware = create_devtools_snapshot_middleware({ ws } as never, 100);
		const { res, done } = fakeResponse();
		middleware({ method: 'GET', url: '/' } as never, res, () => {});
		const request = ws.sent[0];

		// A tab without an Octane root answers first; the healthy tab follows.
		ws.emit('octane:devtools:snapshot-response', {
			id: request.payload.id,
			snapshot: null,
			error: 'The Octane devtools bridge is not attached in this page.',
		});
		ws.emit('octane:devtools:snapshot-response', {
			id: request.payload.id,
			snapshot: { source: 'octane-devtools', componentCount: 3 },
			error: null,
		});
		expect(await done).toEqual({
			status: 200,
			body: { source: 'octane-devtools', componentCount: 3 },
		});
	});

	it('ignores foreign ids and surfaces the held error only at the deadline', async () => {
		const ws = fakeChannel();
		const middleware = create_devtools_snapshot_middleware({ ws } as never, 50);
		const { res, done } = fakeResponse();
		middleware({ method: 'GET', url: '/' } as never, res, () => {});
		const request = ws.sent[0];

		ws.emit('octane:devtools:snapshot-response', { id: -1, snapshot: { wrong: true } });
		ws.emit('octane:devtools:snapshot-response', {
			id: request.payload.id,
			snapshot: null,
			error: 'The Octane devtools bridge is not attached in this page.',
		});
		expect(await done).toEqual({
			status: 502,
			body: { error: 'The Octane devtools bridge is not attached in this page.' },
		});
	});

	it('mounts the snapshot middleware on configureServer', () => {
		const mounted: string[] = [];
		const vite = {
			middlewares: { use: (path: string) => mounted.push(path) },
			ws: fakeChannel(),
		};
		(plugin().configureServer as (server: unknown) => void)(vite);
		expect(mounted).toContain('/__octane_devtools/snapshot');
	});

	it('rejects non-GET requests', async () => {
		const middleware = create_devtools_snapshot_middleware({ ws: fakeChannel() } as never);
		const { res, done } = fakeResponse();
		middleware({ method: 'POST', url: '/' } as never, res, () => {});
		expect((await done).status).toBe(405);
	});
});
