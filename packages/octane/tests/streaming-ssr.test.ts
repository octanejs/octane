import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { compile } from 'octane/compiler';
import { act, hydrateRoot, flushSync } from '../src/index.js';
import * as ServerRT from 'octane/server';
import * as HydrationRT from 'octane/hydration';
import { prerender } from 'octane/static';
import { initializeHydrationEventCapture, interaction } from 'octane/hydration';
import { loadServerFixture } from './_server-fixture.js';
// CLIENT-compiled fixture (registers click delegation at import).
import {
	Boundary,
	DeferredAsyncLeaf,
	DeferredStreamWithLiveSibling,
	DeferredStreamedSuspense,
	IdBoundary,
	LateStyledBoundary,
	NestedDeferredStreamedHydrates,
	NestedStreamSeedScopes,
	ReasonBoundary,
	Siblings,
	StyledBoundary,
} from './_fixtures/ssr-suspense.tsrx';
import { DeferredWithPermanentStaticStream } from './_fixtures/ssr-permanent-static-stream.tsrx';

// Streaming SSR — renderToPipeableStream / renderToReadableStream: shell with
// fallbacks + <template data-oct-b> sentinels, out-of-order hidden segments
// swapped in by the inline $OCTRC runtime, per-boundary hydration seeds.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/ssr-suspense.tsrx');
const FIXTURE_ID = '/packages/octane/tests/_fixtures/ssr-suspense.tsrx';

function serverModule(): Record<string, any> {
	// Compile under the SAME root-relative id Vite hands the client transform: the
	// scoped-<style> class hash is filename-derived, so server/client markup
	// only matches (and hydration only adopts) when the ids agree.
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), FIXTURE_ID, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/hydration['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __hydration;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__hydration', '__exports', code + '\nreturn __exports;')(
		ServerRT,
		HydrationRT,
		{},
	);
}
const server = serverModule();
const permanentStaticServer = loadServerFixture<{
	DeferredWithPermanentStaticStream: typeof DeferredWithPermanentStaticStream;
}>('packages/octane/tests/_fixtures/ssr-permanent-static-stream.tsrx');

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** Collects chunks; resolves when end() is called. */
function collector() {
	const chunks: string[] = [];
	let end!: () => void;
	const ended = new Promise<void>((res) => (end = res));
	return {
		chunks,
		ended,
		dest: {
			write: (c: string) => chunks.push(c),
			end: () => end(),
		},
	};
}

function protocolIds(html: string, attr = 'data-oct-b'): string[] {
	return [...html.matchAll(new RegExp(attr + '="([^"]+)"', 'g'))].map((match) => match[1]);
}

function swapCall(id: string): string {
	return '$OCTRC(' + JSON.stringify(id) + ')';
}

function errorCall(id: string): string {
	return '$OCTRX(' + JSON.stringify(id) + ')';
}

function staticErrorCall(id: string): string {
	return '$OCTRX(' + JSON.stringify(id) + ',1)';
}

/** Execute the stream's inline scripts the way a browser would (in order). */
function activate(container: HTMLElement, removeScripts = true): void {
	for (const s of Array.from(container.querySelectorAll('script'))) {
		if (s.getAttribute('type') === 'application/json') continue;
		// eslint-disable-next-line no-eval
		(0, eval)(s.textContent || '');
		if (removeScripts) s.remove();
	}
}

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => {
	container.remove();
	delete (window as any).$OCTS;
	delete (window as any).$OCTRC;
	delete (window as any).$OCTRX;
});

describe('renderToPipeableStream — chunk protocol', () => {
	it('streams a deferred Hydrate child and later adopts its revealed DOM and seed', async () => {
		const serverValue = deferred<string>();
		const c = collector();
		const when = interaction({ events: 'click' });
		ServerRT.renderToPipeableStream(server.DeferredAsyncLeaf, {
			promise: serverValue.promise,
			when,
		}).pipe(c.dest);

		const shell = c.chunks[0];
		expect(shell).toContain('data-octane-hydrate-id');
		expect(shell).not.toContain('id="leaf"');

		serverValue.resolve('streamed deferred value');
		await c.ended;
		container.innerHTML = c.chunks.join('');
		activate(container);

		const serverLeaf = container.querySelector('#leaf');
		expect(serverLeaf?.textContent).toBe('streamed deferred value');
		const clientValue: any = new Promise<string>(() => {});
		const root = hydrateRoot(container, DeferredAsyncLeaf as any, {
			promise: clientValue,
			when,
		});
		flushSync(() => {});

		// Interaction opens the dormant boundary. The nested stream seed lets its
		// unresolved client promise adopt the revealed server result synchronously.
		serverLeaf!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await vi.waitFor(() => expect(clientValue.status).toBe('fulfilled'));
		expect(clientValue.value).toBe('streamed deferred value');
		expect(container.querySelector('#leaf')).toBe(serverLeaf);
		root.unmount();
	});

	it('waits for a pending streamed reveal before activating deferred hydration', async () => {
		const serverValue = deferred<string>();
		const clientValue: any = new Promise<string>(() => {});
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		const when = interaction({ events: 'click' });
		const c = collector();
		ServerRT.renderToPipeableStream(server.DeferredStreamedSuspense, {
			promise: serverValue.promise,
			when,
		}).pipe(c.dest);

		container.innerHTML = c.chunks.join('');
		activate(container);
		const shellChunkCount = c.chunks.length;
		const fallback = container.querySelector('#deferred-stream-action') as HTMLButtonElement;
		expect(fallback.textContent).toBe('Loading streamed content');

		const root = hydrateRoot(container, DeferredStreamedSuspense as any, {
			promise: clientValue,
			when,
			onClick,
			onHydrated,
		});
		try {
			expect(() => fallback.click()).not.toThrow();
			await act(() => {});

			// Activation must stay dormant while the server still owns the pending
			// reveal. Claiming the fallback now strands the later server result.
			expect(container.querySelector('#deferred-stream-action')).toBe(fallback);
			expect(onHydrated).not.toHaveBeenCalled();
			expect(onClick).not.toHaveBeenCalled();

			serverValue.resolve('Streamed content');
			await c.ended;
			container.insertAdjacentHTML('beforeend', c.chunks.slice(shellChunkCount).join(''));
			activate(container);
			const revealed = container.querySelector('#deferred-stream-action') as HTMLButtonElement;
			expect(revealed.textContent).toBe('Streamed content');

			await vi.waitFor(async () => {
				await act(() => {});
				expect(onHydrated).toHaveBeenCalledOnce();
			});
			expect(container.querySelector('#deferred-stream-action')).toBe(revealed);
			expect(onClick).toHaveBeenCalledOnce();
			expect(onClick).toHaveBeenCalledWith('Streamed content');
		} finally {
			root.unmount();
		}
	});

	it('replays pre-root interaction after the pending stream reveals', async () => {
		const serverValue = deferred<string>();
		const clientValue: any = new Promise<string>(() => {});
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		const when = interaction({ events: 'click' });
		const c = collector();
		ServerRT.renderToPipeableStream(server.DeferredStreamedSuspense, {
			promise: serverValue.promise,
			when,
		}).pipe(c.dest);

		container.innerHTML = c.chunks.join('');
		activate(container);
		const shellChunkCount = c.chunks.length;
		const fallback = container.querySelector('#deferred-stream-action') as HTMLButtonElement;
		initializeHydrationEventCapture(document);
		fallback.click();
		expect(onClick).not.toHaveBeenCalled();

		// The stream can replace the event target before hydrateRoot consumes the
		// queued intent. Replay must address the corresponding revealed element.
		serverValue.resolve('Pre-root streamed content');
		await c.ended;
		container.insertAdjacentHTML('beforeend', c.chunks.slice(shellChunkCount).join(''));
		activate(container);
		const revealed = container.querySelector('#deferred-stream-action') as HTMLButtonElement;
		expect(revealed.textContent).toBe('Pre-root streamed content');

		const root = hydrateRoot(container, DeferredStreamedSuspense as any, {
			promise: clientValue,
			when,
			onClick,
			onHydrated,
		});
		try {
			await vi.waitFor(async () => {
				await act(() => {});
				expect(onHydrated).toHaveBeenCalledOnce();
			});
			expect(container.querySelector('#deferred-stream-action')).toBe(revealed);
			expect(onClick).toHaveBeenCalledOnce();
			expect(onClick).toHaveBeenCalledWith('Pre-root streamed content');
		} finally {
			root.unmount();
		}
	});

	it('replays to a surviving sibling when a preceding stream changes element count', async () => {
		const serverValue = deferred<string>();
		const clientValue: any = new Promise<string>(() => {});
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		const when = interaction({ events: 'click' });
		const c = collector();
		ServerRT.renderToPipeableStream(server.DeferredStreamWithLiveSibling, {
			promise: serverValue.promise,
			when,
		}).pipe(c.dest);

		container.innerHTML = c.chunks.join('');
		activate(container);
		const shellChunkCount = c.chunks.length;
		const sibling = container.querySelector('#stream-live-sibling') as HTMLButtonElement;
		const root = hydrateRoot(container, DeferredStreamWithLiveSibling as any, {
			promise: clientValue,
			when,
			onClick,
			onHydrated,
		});
		try {
			sibling.click();
			await act(() => {});
			expect(onClick).not.toHaveBeenCalled();
			expect(onHydrated).not.toHaveBeenCalled();

			serverValue.resolve('First streamed node');
			await c.ended;
			container.insertAdjacentHTML('beforeend', c.chunks.slice(shellChunkCount).join(''));
			activate(container);
			expect(container.querySelector('#streamed-first-value')?.textContent).toBe(
				'First streamed node',
			);
			expect(container.querySelector('#streamed-second-value')?.textContent).toBe(
				'Second streamed node',
			);

			await vi.waitFor(async () => {
				await act(() => {});
				expect(onHydrated).toHaveBeenCalledOnce();
			});
			expect(container.querySelector('#stream-live-sibling')).toBe(sibling);
			expect(onClick).toHaveBeenCalledOnce();
		} finally {
			root.unmount();
		}
	});

	it('does not make an outer Hydrate wait for a nested Hydrate stream reveal', async () => {
		const serverValue = deferred<string>();
		const clientValue: any = new Promise<string>(() => {});
		const onOuterClick = vi.fn();
		const onInnerClick = vi.fn();
		const onOuterHydrated = vi.fn();
		const onInnerHydrated = vi.fn();
		const outerWhen = interaction({ events: 'click' });
		const innerWhen = interaction({ events: 'click' });
		const c = collector();
		ServerRT.renderToPipeableStream(server.NestedDeferredStreamedHydrates, {
			promise: serverValue.promise,
			outerWhen,
			innerWhen,
		}).pipe(c.dest);

		container.innerHTML = c.chunks.join('');
		activate(container);
		const shellChunkCount = c.chunks.length;
		const outer = container.querySelector('#outer-deferred-stream-action') as HTMLButtonElement;
		const nestedFallback = container.querySelector(
			'#nested-deferred-stream-action',
		) as HTMLButtonElement;
		expect(nestedFallback.textContent).toBe('Loading nested stream');

		const root = hydrateRoot(container, NestedDeferredStreamedHydrates as any, {
			promise: clientValue,
			outerWhen,
			innerWhen,
			onOuterClick,
			onInnerClick,
			onOuterHydrated,
			onInnerHydrated,
		});
		try {
			outer.click();
			await vi.waitFor(async () => {
				await act(() => {});
				expect(onOuterHydrated).toHaveBeenCalledOnce();
			});

			// The pending record belongs to the independently dormant inner marker.
			// It must survive outer adoption and must not delay the outer replay.
			expect(container.querySelector('#outer-deferred-stream-action')).toBe(outer);
			expect(container.querySelector('#nested-deferred-stream-action')).toBe(nestedFallback);
			expect(onOuterClick).toHaveBeenCalledOnce();
			expect(onInnerHydrated).not.toHaveBeenCalled();
			expect(onInnerClick).not.toHaveBeenCalled();

			serverValue.resolve('Nested streamed content');
			await c.ended;
			container.insertAdjacentHTML('beforeend', c.chunks.slice(shellChunkCount).join(''));
			activate(container);
			const revealed = container.querySelector(
				'#nested-deferred-stream-action',
			) as HTMLButtonElement;
			expect(revealed.textContent).toBe('Nested streamed content');
			expect(onInnerHydrated).not.toHaveBeenCalled();

			revealed.click();
			await vi.waitFor(async () => {
				await act(() => {});
				expect(onInnerHydrated).toHaveBeenCalledOnce();
			});
			expect(container.querySelector('#nested-deferred-stream-action')).toBe(revealed);
			expect(onInnerClick).toHaveBeenCalledOnce();
			expect(onInnerClick).toHaveBeenCalledWith('Nested streamed content');
		} finally {
			root.unmount();
		}
	});

	it('does not make an outer Hydrate wait for a permanent-static stream reveal', async () => {
		const serverValue = deferred<string>();
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		const when = interaction({ events: 'click' });
		const c = collector();
		ServerRT.renderToPipeableStream(permanentStaticServer.DeferredWithPermanentStaticStream, {
			promise: serverValue.promise,
			when,
		}).pipe(c.dest);

		container.innerHTML = c.chunks.join('');
		activate(container);
		const [staticBoundaryId] = protocolIds(c.chunks.join(''));
		const shellChunkCount = c.chunks.length;
		const staticFallback = container.querySelector(
			'#permanent-static-stream-value',
		) as HTMLSpanElement;
		const action = container.querySelector(
			'#deferred-permanent-static-action',
		) as HTMLButtonElement;
		const root = hydrateRoot(container, DeferredWithPermanentStaticStream as any, {
			promise: new Promise<string>(() => {}),
			when,
			onClick,
			onHydrated,
		});
		try {
			action.click();
			await vi.waitFor(async () => {
				await act(() => {});
				expect(onHydrated).toHaveBeenCalledOnce();
			});

			// The static subtree stays under the server stream's ownership while the
			// live sibling hydrates and replays independently.
			expect(container.querySelector('#deferred-permanent-static-action')).toBe(action);
			expect(container.querySelector('#permanent-static-stream-value')).toBe(staticFallback);
			expect(onClick).toHaveBeenCalledOnce();

			serverValue.resolve('Permanent static streamed content');
			await c.ended;
			const tail = c.chunks.slice(shellChunkCount).join('');
			expect(tail).not.toContain('data-oct-seed');
			container.insertAdjacentHTML('beforeend', tail);
			activate(container);
			expect((window as any).$OCTS?.[staticBoundaryId]).toBeUndefined();
			expect(container.querySelector('#permanent-static-stream-value')?.textContent).toBe(
				'Permanent static streamed content',
			);
		} finally {
			root.unmount();
		}
	});

	it('routes a synchronous permanent-static error to an enclosing server catch', async () => {
		const c = collector();
		const onError = vi.fn();
		ServerRT.renderToPipeableStream(
			permanentStaticServer.PermanentStaticSyncCaught,
			{ error: new Error('static shell boom') },
			{ onError },
		).pipe(c.dest);

		await c.ended;
		const html = c.chunks.join('');
		expect(html).toContain('id="permanent-static-sync-catch"');
		expect(html).toContain('static shell boom');
		expect(html).not.toContain('data-oct-b');
		expect(html).not.toContain('$OCTRX(');
		expect(onError).not.toHaveBeenCalled();
	});

	it('retains a permanent-static fallback when its pending stream rejects', async () => {
		const value = deferred<string>();
		const c = collector();
		const onError = vi.fn();
		const onAllReady = vi.fn();
		ServerRT.renderToPipeableStream(
			permanentStaticServer.PermanentStaticRejectedStream,
			{ promise: value.promise },
			{ onError, onAllReady },
		).pipe(c.dest);

		container.innerHTML = c.chunks.join('');
		activate(container);
		const shellChunkCount = c.chunks.length;
		const [id] = protocolIds(c.chunks.join(''));
		const fallback = container.querySelector('#permanent-static-rejected-fallback');
		value.reject(new Error('static stream boom'));
		await c.ended;
		const tail = c.chunks.slice(shellChunkCount).join('');
		expect(tail).toContain(staticErrorCall(id));
		expect(tail).not.toContain(errorCall(id));
		container.insertAdjacentHTML('beforeend', tail);
		activate(container);

		expect(container.querySelector('template[data-oct-b]')).toBeNull();
		expect(container.querySelector('#permanent-static-rejected-fallback')).toBe(fallback);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'static stream boom' }),
		);
		expect(onAllReady).toHaveBeenCalledOnce();
	});

	it('streams an authored catch inside a permanent-static range', async () => {
		const value = deferred<string>();
		const c = collector();
		const onError = vi.fn();
		ServerRT.renderToPipeableStream(
			permanentStaticServer.PermanentStaticCaughtStream,
			{ promise: value.promise },
			{ onError },
		).pipe(c.dest);

		container.innerHTML = c.chunks.join('');
		activate(container);
		const shellChunkCount = c.chunks.length;
		value.reject(new Error('caught static stream boom'));
		await c.ended;
		const tail = c.chunks.slice(shellChunkCount).join('');
		expect(tail).not.toContain('data-oct-seed');
		container.insertAdjacentHTML('beforeend', tail);
		activate(container);

		expect(container.querySelector('#permanent-static-caught-error')?.textContent).toBe(
			'caught static stream boom',
		);
		expect(onError).not.toHaveBeenCalled();
	});

	it('retains a permanent-static fallback when the stream aborts', async () => {
		const value = deferred<string>();
		const c = collector();
		const onError = vi.fn();
		const onAllReady = vi.fn();
		const render = ServerRT.renderToPipeableStream(
			permanentStaticServer.PermanentStaticRejectedStream,
			{ promise: value.promise },
			{ onError, onAllReady },
		);
		render.pipe(c.dest);

		container.innerHTML = c.chunks.join('');
		activate(container);
		const shellChunkCount = c.chunks.length;
		const [id] = protocolIds(c.chunks.join(''));
		const fallback = container.querySelector('#permanent-static-rejected-fallback');
		render.abort(new Error('static stream aborted'));
		await c.ended;
		const tail = c.chunks.slice(shellChunkCount).join('');
		expect(tail).toContain(staticErrorCall(id));
		container.insertAdjacentHTML('beforeend', tail);
		activate(container);

		expect(container.querySelector('template[data-oct-b]')).toBeNull();
		expect(container.querySelector('#permanent-static-rejected-fallback')).toBe(fallback);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'static stream aborted' }),
		);
		expect(onAllReady).toHaveBeenCalledOnce();
	});

	it('releases deferred activation when a pending stream degrades to client rendering', async () => {
		const serverValue = deferred<string>();
		const clientValue = deferred<string>();
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		const onError = vi.fn();
		const when = interaction({ events: 'click' });
		const c = collector();
		const render = ServerRT.renderToPipeableStream(
			server.DeferredStreamedSuspense,
			{ promise: serverValue.promise, when },
			{ onError },
		);
		render.pipe(c.dest);

		container.innerHTML = c.chunks.join('');
		activate(container);
		const shellChunkCount = c.chunks.length;
		const fallback = container.querySelector('#deferred-stream-action') as HTMLButtonElement;
		const root = hydrateRoot(container, DeferredStreamedSuspense as any, {
			promise: clientValue.promise,
			when,
			onClick,
			onHydrated,
		});
		try {
			fallback.click();
			await act(() => {});
			expect(onHydrated).not.toHaveBeenCalled();

			render.abort(new Error('defer to client'));
			await c.ended;
			container.insertAdjacentHTML('beforeend', c.chunks.slice(shellChunkCount).join(''));
			activate(container);
			expect(container.querySelector('#deferred-stream-action')).toBe(fallback);
			expect(onError).toHaveBeenCalled();

			clientValue.resolve('Client recovery');
			await vi.waitFor(async () => {
				await act(() => {});
				expect(onHydrated).toHaveBeenCalledOnce();
			});
			expect(container.querySelector('#deferred-stream-action')?.textContent).toBe(
				'Client recovery',
			);
			expect(onClick).toHaveBeenCalledOnce();
			expect(onClick).toHaveBeenCalledWith('Client recovery');
		} finally {
			root.unmount();
		}
	});

	it('flushes the shell with the fallback + template sentinel, then the segment', async () => {
		const d = deferred<string>();
		const c = collector();
		const events: string[] = [];
		const { pipe } = ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: d.promise },
			{
				onShellReady: () => events.push('shell'),
				onAllReady: () => events.push('all'),
			},
		);
		pipe(c.dest);
		// The shell flushes synchronously: fallback + sentinel + swap runtime.
		expect(c.chunks).toHaveLength(1);
		const shell = c.chunks[0];
		const [id] = protocolIds(shell);
		expect(id).not.toBe('0');
		expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
		expect(shell).toContain('<template data-oct-b="' + id + '"></template>');
		expect(shell).toContain('loading');
		expect(shell).toContain('$OCTRC=');
		expect(shell).not.toContain('class="ok"');
		expect(events).toEqual(['shell']);

		d.resolve('streamed!');
		await c.ended;
		expect(events).toEqual(['shell', 'all']);
		container.innerHTML = c.chunks.join('');
		activate(container);
		expect(container.querySelector('.loading')).toBeNull();
		expect(container.querySelector('.ok')?.textContent).toBe('streamed!');
		// The boundary's use() value is available to hydration only after its
		// segment has been activated.
		expect((window as any).$OCTS[id]).toContain('streamed!');
		expect(shell).not.toContain('streamed!');
	});

	it('balances canonical counted markers in the inline segment swap runtime', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Boundary, { promise: d.promise });
		pipe(c.dest);
		const shell = c.chunks[0];
		d.resolve('done');
		await c.ended;

		// Install the real emitted runtime, then exercise it against a compacted
		// enclosing boundary. The counted close is the scanner's stopping node; a
		// legacy-only parser runs past it and deletes the trailing sibling/segment.
		container.innerHTML = shell;
		const runtimeScript = Array.from(container.querySelectorAll('script')).find((script) =>
			(script.textContent || '').includes('$OCTRC=function'),
		);
		expect(runtimeScript).toBeDefined();
		// eslint-disable-next-line no-eval
		(0, eval)(runtimeScript!.textContent || '');
		container.innerHTML =
			'<!--[2--><template data-oct-b="counted"></template>' +
			'<i class="counted-fallback">loading</i><!--]2-->' +
			'<p class="after-counted">after</p>' +
			'<div hidden data-oct-s="counted"><b class="counted-ready">ready</b></div>';

		(window as any).$OCTRC('counted');
		expect(container.querySelector('.counted-fallback')).toBeNull();
		expect(container.querySelector('.counted-ready')?.textContent).toBe('ready');
		expect(container.querySelector('.after-counted')?.textContent).toBe('after');
		expect(container.querySelector('[data-oct-s]')).toBeNull();
		const comments = Array.from(container.childNodes)
			.filter((node): node is Comment => node.nodeType === Node.COMMENT_NODE)
			.map((node) => node.data);
		expect(comments).toEqual(['[2', 'oct-seed:counted', ']2']);
	});

	it('streams independent sibling boundaries as separate segments', async () => {
		const a = deferred<string>();
		const b = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Siblings, {
			a: a.promise,
			b: b.promise,
		});
		pipe(c.dest);
		const [aId, bId] = protocolIds(c.chunks[0]);
		expect(aId).not.toBe(bId);

		a.resolve('alpha');
		b.resolve('beta');
		await c.ended;
		const tail = c.chunks.slice(1).join('');
		expect(tail).toContain('data-oct-s="' + aId + '"');
		expect(tail).toContain('data-oct-s="' + bId + '"');
		expect(tail).toContain('alpha');
		expect(tail).toContain('beta');
	});

	it('keeps a transient object @for key stable across streaming passes', async () => {
		const value = deferred<string>();
		const c = collector();
		ServerRT.renderToPipeableStream(server.TransientObjectKeyBoundary, {
			promise: value.promise,
		}).pipe(c.dest);
		expect(c.chunks[0]).toContain('transient-object-loading');
		value.resolve('object key ready');
		await c.ended;

		container.innerHTML = c.chunks.join('');
		activate(container);
		expect(container.querySelector('.transient-object-loading')).toBeNull();
		expect(container.querySelector('.transient-object-ready')?.textContent).toBe(
			'object key ready',
		);
	});

	it('keeps stable @for keys attached to their streamed boundaries after a reorder', async () => {
		const a = deferred<string>();
		const b = deferred<string>();
		const props = {
			items: [
				{ id: 'a', promise: a.promise },
				{ id: 'b', promise: b.promise },
			],
		};
		const c = collector();
		const onError = vi.fn();
		ServerRT.renderToPipeableStream(server.StableKeyReorderBoundary, props, {
			onError,
		}).pipe(c.dest);
		expect(c.chunks[0]).toContain('a:loading');
		expect(c.chunks[0]).toContain('b:loading');

		props.items.reverse();
		a.resolve('alpha');
		b.resolve('beta');
		await c.ended;
		expect(onError).not.toHaveBeenCalled();

		container.innerHTML = c.chunks.join('');
		activate(container);
		expect(
			Array.from(container.querySelectorAll('.stable-key-ready'), (node) => node.textContent),
		).toEqual(['a:alpha', 'b:beta']);
		expect(container.querySelector('.stable-key-loading')).toBeNull();
	});

	it('uses opaque render-scoped ids when two streams share one document', async () => {
		const a = deferred<string>();
		const b = deferred<string>();
		const first = collector();
		const second = collector();
		ServerRT.renderToPipeableStream(server.Boundary, { promise: a.promise }).pipe(first.dest);
		ServerRT.renderToPipeableStream(server.Boundary, { promise: b.promise }).pipe(second.dest);
		const [firstId] = protocolIds(first.chunks[0]);
		const [secondId] = protocolIds(second.chunks[0]);
		expect(firstId).not.toBe(secondId);

		// Interleave the segment order across two roots. A document-global numeric
		// id would swap both chunks into the first template and cross the seeds.
		b.resolve('second');
		a.resolve('first');
		await Promise.all([first.ended, second.ended]);
		container.innerHTML =
			'<section id="stream-a">' +
			first.chunks[0] +
			'</section><section id="stream-b">' +
			second.chunks[0] +
			'</section>' +
			second.chunks.slice(1).join('') +
			first.chunks.slice(1).join('');
		activate(container);

		const rootA = container.querySelector('#stream-a')!;
		const rootB = container.querySelector('#stream-b')!;
		expect(rootA.querySelector('.ok')!.textContent).toBe('first');
		expect(rootB.querySelector('.ok')!.textContent).toBe('second');
		expect((window as any).$OCTS[firstId]).toContain('first');
		expect((window as any).$OCTS[secondId]).toContain('second');

		const pending = new Promise<string>(() => {});
		const firstNode = rootA.querySelector('.ok');
		const secondNode = rootB.querySelector('.ok');
		const hydratedA = hydrateRoot(rootA, Boundary as any, { promise: pending });
		const hydratedB = hydrateRoot(rootB, Boundary as any, { promise: pending });
		flushSync(() => {});
		expect(rootA.querySelector('.ok')).toBe(firstNode);
		expect(rootB.querySelector('.ok')).toBe(secondNode);
		expect((window as any).$OCTS[firstId]).toContain('first');
		expect((window as any).$OCTS[secondId]).toContain('second');
		hydratedA.unmount();
		hydratedB.unmount();
	});

	it('isolates a nested buffered render from the outer stream registry', async () => {
		const data = deferred<string>();
		const nested: string[] = [];
		const prerenders: Array<Promise<{ html: string; css: string }>> = [];
		const Outer = () => {
			nested.push(ServerRT.renderToString(server.Boundary, { promise: data.promise }).html);
			nested.push(ServerRT.renderToStaticMarkup(server.Boundary, { promise: data.promise }).html);
			if (prerenders.length === 0) {
				prerenders.push(prerender(server.Boundary, { promise: data.promise }));
			}
			return '<main>outer-only</main>';
		};
		const c = collector();
		const onError = vi.fn();
		ServerRT.renderToPipeableStream(Outer as any, undefined, { onError }).pipe(c.dest);
		await vi.waitFor(() => expect(prerenders).toHaveLength(1));
		data.resolve('nested-ready');
		const [, nestedResult] = await Promise.all([c.ended, prerenders[0]]);

		expect(nested).toHaveLength(2);
		for (const html of nested) {
			expect(html).toContain('loading');
			expect(html).not.toContain('data-oct-b');
		}
		expect(nestedResult.html).toContain('nested-ready');
		expect(c.chunks.join('')).toBe('<main>outer-only</main>');
		expect(onError).not.toHaveBeenCalled();
	});

	it('streams each boundary at its own resolve time, not the wave-set slowest', async () => {
		// REAL timers on purpose (no vi.useFakeTimers): the assertion is about
		// wall-clock chunk arrival. Margins are generous so CI jitter can't flip
		// it — the early chunk must land in [EARLY, LATE - 50], i.e. long before
		// the late boundary's data even resolves.
		const EARLY = 20;
		const LATE = 250;
		const a = new Promise<string>((r) => setTimeout(() => r('alpha'), EARLY));
		const b = new Promise<string>((r) => setTimeout(() => r('beta'), LATE));
		const arrivals: { chunk: string; at: number }[] = [];
		let end!: () => void;
		const ended = new Promise<void>((res) => (end = res));
		const t0 = performance.now();
		const { pipe } = ServerRT.renderToPipeableStream(server.Siblings, { a, b });
		pipe({
			write: (chunk: string) => arrivals.push({ chunk, at: performance.now() - t0 }),
			end: () => end(),
		});
		const [aId, bId] = protocolIds(arrivals[0].chunk);
		await ended;

		// Shell + one segment chunk PER boundary. The old settle-all round held
		// alpha's segment until beta landed and shipped both in ONE chunk.
		expect(arrivals).toHaveLength(3);
		const [, first, second] = arrivals;
		expect(first.chunk).toContain('data-oct-s="' + aId + '"');
		expect(first.chunk).toContain('alpha');
		expect(first.chunk).not.toContain('beta');
		expect(second.chunk).toContain('data-oct-s="' + bId + '"');
		expect(second.chunk).toContain('beta');
		expect(first.at).toBeGreaterThanOrEqual(EARLY - 5); // not before its data
		expect(first.at).toBeLessThan(LATE - 50); // on the wire while beta still pends
		expect(second.at).toBeGreaterThanOrEqual(LATE - 5);
	});

	it('coalesces resolutions landing in the same wave into one chunk/pass', async () => {
		let ra!: (v: string) => void;
		let rb!: (v: string) => void;
		const a = new Promise<string>((r) => (ra = r));
		const b = new Promise<string>((r) => (rb = r));
		// Both settle in the SAME event-loop turn → they must share one re-pass
		// and flush as one chunk, not cost a wave (and a full pass) each.
		setTimeout(() => {
			ra('alpha');
			rb('beta');
		}, 10);
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Siblings, { a, b });
		pipe(c.dest);
		const [aId, bId] = protocolIds(c.chunks[0]);
		await c.ended;
		expect(c.chunks).toHaveLength(2); // shell + ONE coalesced segment chunk
		expect(c.chunks[1]).toContain('data-oct-s="' + aId + '"');
		expect(c.chunks[1]).toContain('data-oct-s="' + bId + '"');
		expect(c.chunks[1]).toContain('alpha');
		expect(c.chunks[1]).toContain('beta');
	});

	it('streams a nested boundary parent-first', async () => {
		const outer = deferred<string>();
		const inner = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Nested, {
			outer: outer.promise,
			inner: inner.promise,
		});
		pipe(c.dest);
		const [outerId] = protocolIds(c.chunks[0]);
		expect(c.chunks[0]).toContain('outer…');

		outer.resolve('one');
		inner.resolve('two');
		await c.ended;
		const tail = c.chunks.slice(1).join('');
		const [emittedOuterId, innerId] = protocolIds(tail, 'data-oct-s');
		// The outer segment introduces the inner boundary, so its carrier must be
		// emitted first even though both promises resolved in the same wave.
		expect(emittedOuterId).toBe(outerId);
		expect(innerId).toBeTruthy();
		container.innerHTML = c.chunks.join('');
		activate(container);
		expect(container.querySelector('.both')?.textContent).toContain('one:two');
	});

	it('defers an inner segment until its outer segment introduces the template', async () => {
		const NestedInnerFirst = (props: any, scope: any) =>
			ServerRT.ssrTry(
				scope,
				'outer-inner-first',
				() => {
					const inner = ServerRT.ssrTry(
						scope,
						'inner-first',
						() =>
							ServerRT.ssrBlock(
								'<span class="inner-value">' + ServerRT.use(props.inner, 'inner-value') + '</span>',
							),
						() => ServerRT.ssrBlock('<span class="inner-pending">inner…</span>'),
						null,
					);
					const outer = ServerRT.use(props.outer, 'outer-value');
					return inner + ServerRT.ssrBlock('<span class="outer-value">' + outer + '</span>');
				},
				() => ServerRT.ssrBlock('<span class="outer-pending">outer…</span>'),
				null,
			);
		const outer = deferred<string>();
		const inner = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(NestedInnerFirst as any, {
			outer: outer.promise,
			inner: inner.promise,
		});
		pipe(c.dest);
		const [outerId] = protocolIds(c.chunks[0]);

		inner.resolve('inside');
		await new Promise((resolve) => setTimeout(resolve, 20));
		// The inner content is ready, but its template exists only inside the outer
		// segment. Emitting it now would make `$OCTRC` a permanent no-op.
		expect(c.chunks).toHaveLength(1);

		outer.resolve('outside');
		await c.ended;
		const tail = c.chunks.slice(1).join('');
		const [emittedOuterId, innerId] = protocolIds(tail, 'data-oct-s');
		expect(emittedOuterId).toBe(outerId);
		expect(innerId).toBeTruthy();

		container.innerHTML = c.chunks.join('');
		activate(container);
		expect(container.querySelector('.inner-value')?.textContent).toBe('inside');
		expect(container.querySelector('.outer-value')?.textContent).toBe('outside');
	});

	it('streams the @catch arm when the promise rejects', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Boundary, { promise: d.promise });
		pipe(c.dest);
		d.reject(new Error('nope'));
		await c.ended;
		container.innerHTML = c.chunks.join('');
		activate(container);
		expect(container.querySelector('.err')?.textContent).toContain('nope');
	});

	it('abort landing during a wave coalesce cancels the pass and completes once', async () => {
		const d = deferred<string>();
		const c = collector();
		const onError = vi.fn();
		const events: string[] = [];
		const { pipe, abort } = ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: d.promise },
			{ onError, onAllReady: () => events.push('all') },
		);
		pipe(c.dest);
		const [id] = protocolIds(c.chunks[0]);
		// Land the abort INSIDE the wave's coalesce window: resolve now (the
		// resolution wins the guarded race), then abort on the same macrotask
		// channel the coalesce yield uses. Our callback is queued BEFORE the
		// wave schedules its own yield (that happens a few microtasks from
		// now), so it runs first — after the race settled, before the wave
		// returns. The wave must still surface the abort instead of spending a
		// pass, flushing the segment, and firing allReady on a dead request.
		d.resolve('too late');
		const afterRaceSettles =
			typeof setImmediate === 'function' ? setImmediate : (fn: () => void) => setTimeout(fn, 0);
		afterRaceSettles(() => abort(new Error('gone')));
		await c.ended;
		const tail = c.chunks.slice(1).join('');
		expect(tail).not.toContain('data-oct-s=');
		expect(tail).not.toContain('too late');
		expect(tail).toContain(errorCall(id));
		// Per ReactDOMFizzServerNode-test.js:328, a post-shell abort is terminal
		// readiness even though its pending boundary degrades to client rendering.
		expect(events).toEqual(['all']);
		expect(onError).toHaveBeenCalled();
	});

	it('abort marks pending boundaries errored and ends the stream', async () => {
		const d = deferred<string>();
		const c = collector();
		const onError = vi.fn();
		const { pipe, abort } = ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: d.promise },
			{ onError },
		);
		pipe(c.dest);
		const [id] = protocolIds(c.chunks[0]);
		abort(new Error('gone'));
		await c.ended;
		expect(c.chunks.join('')).toContain(errorCall(id));
		expect(onError).toHaveBeenCalled();
	});

	it('waits for Node drain before writing the next chunk or ending', async () => {
		const d = deferred<string>();
		const emitter = new EventEmitter();
		const chunks: string[] = [];
		let end!: () => void;
		const ended = new Promise<void>((resolve) => (end = resolve));
		let allReady = false;
		const destination = {
			write(chunk: string) {
				chunks.push(chunk);
				return chunks.length !== 1; // pressure the shell write
			},
			end,
			once: emitter.once.bind(emitter),
			off: emitter.off.bind(emitter),
		};
		ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: d.promise },
			{ onAllReady: () => (allReady = true) },
		).pipe(destination);
		expect(chunks).toHaveLength(1);

		d.resolve('after-drain');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(chunks).toHaveLength(1);
		expect(allReady).toBe(false);

		emitter.emit('drain');
		await ended;
		expect(chunks).toHaveLength(2);
		expect(chunks[1]).toContain('after-drain');
		expect(allReady).toBe(true);
	});

	it('reports late destination write and end failures after rendering completed', async () => {
		const Sync = () => '<p>ready</p>';
		const writeError = new Error('write failed');
		const onWriteError = vi.fn();
		ServerRT.renderToPipeableStream(Sync as any, undefined, { onError: onWriteError }).pipe({
			write() {
				throw writeError;
			},
			end: vi.fn(),
		});
		expect(onWriteError).toHaveBeenCalledTimes(1);
		expect(onWriteError).toHaveBeenCalledWith(writeError);

		const endError = new Error('end failed');
		const onEndError = vi.fn();
		ServerRT.renderToPipeableStream(Sync as any, undefined, { onError: onEndError }).pipe({
			write: () => true,
			end() {
				throw endError;
			},
		});
		expect(onEndError).toHaveBeenCalledTimes(1);
		expect(onEndError).toHaveBeenCalledWith(endError);
		await Promise.resolve();
	});

	it('abort breaks a Node drain wait and still queues degraded recovery', async () => {
		const d = deferred<string>();
		const emitter = new EventEmitter();
		const chunks: string[] = [];
		let end!: () => void;
		const ended = new Promise<void>((resolve) => (end = resolve));
		const onError = vi.fn();
		const render = ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: d.promise },
			{ onError },
		);
		render.pipe({
			write(chunk: string) {
				chunks.push(chunk);
				return false;
			},
			end,
			once: emitter.once.bind(emitter),
			off: emitter.off.bind(emitter),
		});
		const [id] = protocolIds(chunks[0]);
		d.resolve('must-not-flush');
		await new Promise((resolve) => setTimeout(resolve, 20));
		render.abort(new Error('stop-under-pressure'));
		await ended;
		expect(chunks.join('')).not.toContain('must-not-flush');
		expect(chunks.join('')).toContain(errorCall(id));
		expect(onError).toHaveBeenCalled();
	});

	it('cancels rendering when a Node destination closes under pressure', async () => {
		const d = deferred<string>();
		const emitter = new EventEmitter();
		const chunks: string[] = [];
		const onError = vi.fn();
		const onAllReady = vi.fn();
		const end = vi.fn();
		ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: d.promise },
			{ onError, onAllReady },
		).pipe({
			write(chunk: string) {
				chunks.push(chunk);
				return false;
			},
			end,
			once: emitter.once.bind(emitter),
			off: emitter.off.bind(emitter),
		});

		emitter.emit('close');
		await vi.waitFor(() => expect(onError).toHaveBeenCalled());
		d.resolve('must-not-render');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(chunks).toHaveLength(1);
		expect(chunks.join('')).not.toContain('must-not-render');
		// Per ReactDOMFizzServerNode-test.js:641, an unexpectedly closed
		// destination cancels remaining work and completes renderer readiness.
		expect(onAllReady).toHaveBeenCalledOnce();
		expect(end).not.toHaveBeenCalled();
	});

	it('cancels rendering when a Node destination errors under pressure', async () => {
		const d = deferred<string>();
		const emitter = new EventEmitter();
		const chunks: string[] = [];
		const onError = vi.fn();
		ServerRT.renderToPipeableStream(server.Boundary, { promise: d.promise }, { onError }).pipe({
			write(chunk: string) {
				chunks.push(chunk);
				return false;
			},
			end: vi.fn(),
			once: emitter.once.bind(emitter),
			off: emitter.off.bind(emitter),
		});
		const reason = new Error('socket failed');
		emitter.emit('error', reason);
		await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(reason));
		d.resolve('must-not-render');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(chunks).toHaveLength(1);
		expect(chunks.join('')).not.toContain('must-not-render');
	});

	it('puts the CSP nonce on shell, segment, seed, style, and degraded scripts', async () => {
		const nonce = 'stream-"nonce';
		const d = deferred<string>();
		const c = collector();
		ServerRT.renderToPipeableStream(server.StyledBoundary, { promise: d.promise }, { nonce }).pipe(
			c.dest,
		);
		d.resolve('nonce-ok');
		await c.ended;
		const tags = c.chunks.join('').match(/<(?:script|style)\b[^>]*>/g) ?? [];
		expect(tags.length).toBeGreaterThanOrEqual(4);
		for (const tag of tags) expect(tag).toContain('nonce="stream-&quot;nonce"');

		const pending = deferred<string>();
		const aborted = collector();
		const render = ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: pending.promise },
			{ nonce },
		);
		render.pipe(aborted.dest);
		const [id] = protocolIds(aborted.chunks[0]);
		render.abort(new Error('stop'));
		await aborted.ended;
		const errorScript = aborted.chunks
			.join('')
			.match(new RegExp('<script[^>]*>' + errorCall(id).replace(/[()$]/g, '\\$&')))?.[0];
		expect(errorScript).toContain('nonce="stream-&quot;nonce"');
	});
});

describe('renderToReadableStream', () => {
	it('resolves at shell-ready; allReady settles after the last segment', async () => {
		const d = deferred<string>();
		const stream = await ServerRT.renderToReadableStream(server.Boundary, {
			promise: d.promise,
		});
		let settled = false;
		stream.allReady.then(() => (settled = true));
		await Promise.resolve();
		expect(settled).toBe(false); // shell ready, boundary still pending

		const responseText = new Response(stream).text();
		d.resolve('web!');
		await stream.allReady;
		const text = await responseText;
		expect(text).toContain('web!');
		const [id] = protocolIds(text);
		expect(text).toContain(swapCall(id));
	});

	it('holds boundary output until the consumer pulls', async () => {
		const d = deferred<string>();
		const stream = await ServerRT.renderToReadableStream(server.Boundary, {
			promise: d.promise,
		});
		let settled = false;
		stream.allReady.then(() => (settled = true));
		d.resolve('pulled');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(settled).toBe(false);

		const reader = stream.getReader();
		const shell = await reader.read();
		expect(new TextDecoder().decode(shell.value)).toContain('loading');
		await stream.allReady;
		const segment = await reader.read();
		expect(new TextDecoder().decode(segment.value)).toContain('pulled');
		expect((await reader.read()).done).toBe(true);
	});

	it('consumer cancellation aborts pending rendering and rejects allReady', async () => {
		const d = deferred<string>();
		const onError = vi.fn();
		const onAllReady = vi.fn();
		const stream = await ServerRT.renderToReadableStream(
			server.Boundary,
			{ promise: d.promise },
			{ onError, onAllReady },
		);
		const reason = new Error('reader left');
		await stream.cancel(reason);
		await expect(stream.allReady).rejects.toBe(reason);
		expect(onError).toHaveBeenCalledWith(reason);
		expect(onAllReady).not.toHaveBeenCalled();
		d.resolve('must-not-render');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(onAllReady).not.toHaveBeenCalled();
	});

	it('external abort rejects allReady even when output is pull-blocked', async () => {
		const d = deferred<string>();
		const aborter = new AbortController();
		const stream = await ServerRT.renderToReadableStream(
			server.Boundary,
			{ promise: d.promise },
			{ signal: aborter.signal },
		);
		d.resolve('must-not-flush');
		await new Promise((resolve) => setTimeout(resolve, 20));
		const reason = new Error('request-left');
		aborter.abort(reason);
		await expect(stream.allReady).rejects.toBe(reason);

		const text = await new Response(stream).text();
		const [id] = protocolIds(text);
		expect(text).not.toContain('must-not-flush');
		expect(text).toContain(errorCall(id));
	});
});

describe('streamed page → swap runtime → hydration (end to end)', () => {
	it('hydrates completed boundary useId values in its opaque stream namespace', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(
			server.IdBoundary,
			{ promise: d.promise },
			{ identifierPrefix: 'page-' },
		);
		pipe(c.dest);
		const [id] = protocolIds(c.chunks[0]);
		d.resolve('ready');
		await c.ended;

		container.innerHTML = c.chunks.join('');
		activate(container);
		const rootId = ':page-in-0:';
		const boundaryId = ':page-b' + id + '-in-0:';
		expect(container.querySelector('#id-box')!.getAttribute('data-root-id')).toBe(rootId);
		expect(container.querySelector('.id-ok')!.getAttribute('data-boundary-id')).toBe(boundaryId);

		const seen: Array<[string, string]> = [];
		const content = container.querySelector('.id-ok');
		const clientPending = new Promise<string>(() => {});
		const root = hydrateRoot(
			container,
			IdBoundary as any,
			{
				promise: clientPending,
				onId: (arm: string, value: string) => seen.push([arm, value]),
			},
			{ identifierPrefix: 'page-' },
		);
		flushSync(() => {});
		expect(container.querySelector('.id-ok')).toBe(content);
		expect(seen).toContainEqual(['root', rootId]);
		expect(seen).toContainEqual(['content', boundaryId]);
		root.unmount();
	});

	it('hydrates a pending shell with the template boundary useId namespace', async () => {
		const d = deferred<string>();
		const c = collector();
		const render = ServerRT.renderToPipeableStream(
			server.IdBoundary,
			{ promise: d.promise },
			{ identifierPrefix: 'page-' },
		);
		render.pipe(c.dest);
		const [id] = protocolIds(c.chunks[0]);
		container.innerHTML = c.chunks[0];
		activate(container);

		const rootId = ':page-in-0:';
		const boundaryId = ':page-b' + id + '-in-0:';
		expect(container.querySelector('#id-box')!.getAttribute('data-root-id')).toBe(rootId);
		expect(container.querySelector('.id-loading')!.getAttribute('data-boundary-id')).toBe(
			boundaryId,
		);

		const seen: Array<[string, string]> = [];
		const clientPending = deferred<string>();
		// A still-pending shell intentionally takes mountTry's documented degraded
		// client-render path; keep its expected structural warning out of test output.
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(
			container,
			IdBoundary as any,
			{
				promise: clientPending.promise,
				onId: (arm: string, value: string) => seen.push([arm, value]),
			},
			{ identifierPrefix: 'page-' },
		);
		try {
			flushSync(() => {});
			expect(seen).toContainEqual(['root', rootId]);
			expect(seen).toContainEqual(['pending', boundaryId]);
			expect(container.querySelectorAll('.id-loading')).toHaveLength(1);
			expect(container.querySelector('template[data-oct-b]')).toBeNull();

			const replacement = deferred<string>();
			flushSync(() => {
				root.render(IdBoundary as any, {
					promise: replacement.promise,
					onId: (arm: string, value: string) => seen.push([arm, value]),
				});
			});
			replacement.resolve('client-ready');
			await Promise.resolve();
			flushSync(() => {});
			expect(container.querySelectorAll('.id-ok')).toHaveLength(1);
			expect(container.querySelector('.id-ok')?.textContent).toBe('client-ready');
			expect(container.querySelector('.id-loading')).toBeNull();
			expect(container.querySelector('template[data-oct-b]')).toBeNull();
			expect(seen.some(([arm]) => arm === 'content')).toBe(true);

			// If the server finishes after hydration claimed the still-pending shell,
			// its obsolete carrier is discarded rather than leaking hidden DOM.
			d.resolve('server-late');
			await c.ended;
			container.insertAdjacentHTML('beforeend', c.chunks.slice(1).join(''));
			activate(container);
			expect(container.querySelector('[data-oct-s]')).toBeNull();
			expect(container.querySelector('.id-ok')?.textContent).toBe('client-ready');

			clientPending.resolve('obsolete-client-result');
			await Promise.resolve();
			flushSync(() => {});
			expect(container.querySelector('.id-ok')?.textContent).toBe('client-ready');
		} finally {
			errSpy.mockRestore();
			root.unmount();
			render.abort(new Error('test complete'));
			await c.ended;
		}
	});

	it('hydrates a streamed catch arm in place and consumes the superseded client rejection', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(
			server.IdBoundary,
			{ promise: d.promise },
			{ identifierPrefix: 'page-' },
		);
		pipe(c.dest);
		const [id] = protocolIds(c.chunks[0]);
		d.reject({ name: 'PlainFailure', message: 'server-no' });
		await c.ended;

		container.innerHTML = c.chunks.join('');
		activate(container);
		const rootId = ':page-in-0:';
		const boundaryId = ':page-b' + id + '-in-0:';
		const errorSpan = container.querySelector('.id-error');
		expect(errorSpan!.textContent).toBe('server-no');
		expect(errorSpan!.getAttribute('data-boundary-id')).toBe(boundaryId);

		const seen: Array<[string, string]> = [];
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const clientPending = deferred<string>();
		const unhandledClientRejections: unknown[] = [];
		const onUnhandledRejection = (reason: unknown, promise: Promise<unknown>) => {
			if (promise === clientPending.promise) unhandledClientRejections.push(reason);
		};
		process.on('unhandledRejection', onUnhandledRejection);
		const root = hydrateRoot(
			container,
			IdBoundary as any,
			{
				promise: clientPending.promise,
				onId: (arm: string, value: string) => seen.push([arm, value]),
			},
			{ identifierPrefix: 'page-' },
		);
		try {
			flushSync(() => {});
			expect(container.querySelector('.id-error')).toBe(errorSpan);
			expect(container.querySelector('.id-loading')).toBeNull();
			expect(seen).toContainEqual(['root', rootId]);
			expect(seen).toContainEqual(['catch', boundaryId]);
			expect(errSpy).not.toHaveBeenCalled();

			// The server rejection remains authoritative for this hydration episode,
			// but the client-created request still settles later. Wait through a host
			// task boundary so an unobserved promise would emit `unhandledRejection`.
			clientPending.reject(new Error('client request also rejected'));
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			expect(unhandledClientRejections).toEqual([]);
			expect(container.querySelector('.id-error')).toBe(errorSpan);
			expect(errorSpan!.textContent).toBe('server-no');
			expect(errSpy).not.toHaveBeenCalled();
		} finally {
			process.off('unhandledRejection', onUnhandledRejection);
			errSpy.mockRestore();
			root.unmount();
		}
	});

	it('preserves primitive and plain-object reasons in streamed catch hydration', async () => {
		const cases = [
			{ reason: 'stream-string', text: 'stream-string:', kind: 'string', code: '' },
			{
				reason: { message: 'stream-object', code: 'E_STREAM' },
				text: 'stream-object:E_STREAM',
				kind: 'object',
				code: 'E_STREAM',
			},
		] as const;

		for (const testCase of cases) {
			const d = deferred<string>();
			const c = collector();
			const { pipe } = ServerRT.renderToPipeableStream(server.ReasonBoundary, {
				promise: d.promise,
			});
			pipe(c.dest);
			d.reject(testCase.reason);
			await c.ended;

			container.innerHTML = c.chunks.join('');
			activate(container);
			const serverCatch = container.querySelector('.reason-error');
			let caught: any;
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const root = hydrateRoot(container, ReasonBoundary as any, {
				promise: new Promise<string>(() => {}),
				onCatch: (reason: unknown) => (caught = reason),
			});
			flushSync(() => {});

			expect(container.querySelector('.reason-error')).toBe(serverCatch);
			expect(serverCatch!.textContent).toBe(testCase.text);
			expect(serverCatch!.getAttribute('data-kind')).toBe(testCase.kind);
			expect(serverCatch!.getAttribute('data-code')).toBe(testCase.code);
			if (typeof testCase.reason === 'string') expect(caught).toBe(testCase.reason);
			else expect(caught).toEqual(testCase.reason);
			expect(errorSpy).not.toHaveBeenCalled();
			errorSpy.mockRestore();
			root.unmount();
		}
	});

	it('swaps the segment into place, scopes its seeds, and hydrates byte-for-byte', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Boundary, { promise: d.promise });
		pipe(c.dest);
		const [id] = protocolIds(c.chunks[0]);
		d.resolve('streamed!');
		await c.ended;

		// Build the browser-equivalent DOM: parse the full stream, run its scripts.
		container.innerHTML = c.chunks.join('');
		activate(container);
		// Post-swap: fallback gone, content live, seed comment + stash in place.
		expect(container.querySelector('.loading')).toBeNull();
		expect(container.querySelector('.ok')!.textContent).toBe('streamed!');
		expect(container.querySelector('[data-oct-s]')).toBeNull();
		expect((window as any).$OCTS[id]).toContain('streamed!');

		// Hydrate with a client-side pending promise: the scoped seed must satisfy
		// the boundary's use() (no re-suspend, no rebuild, no mismatch warning).
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const okSpan = container.querySelector('.ok');
		const clientPending = new Promise<string>(() => {});
		const root = hydrateRoot(container, Boundary as any, { promise: clientPending });
		flushSync(() => {});
		expect(container.querySelector('.ok')).toBe(okSpan); // adopted, not rebuilt
		expect(container.querySelector('.ok')!.textContent).toBe('streamed!');
		expect(errSpy).not.toHaveBeenCalled();
		expect((window as any).$OCTS[id]).toContain('streamed!');
		errSpy.mockRestore();
		root.unmount();
	});

	it('hydrates streams with both shell-leading and late revealed scoped styles', async () => {
		// The shell flushes scoped styles BEFORE the body markup (so painted
		// fallbacks are styled) — the container's first children are <style>
		// tags, and hydrateRoot must skip them when positioning the cursor.
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.StyledBoundary, {
			promise: d.promise,
		});
		pipe(c.dest);
		d.resolve('styled!');
		await c.ended;
		expect(c.chunks[0].startsWith('<style data-octane=')).toBe(true);

		container.innerHTML = c.chunks.join('');
		// Real browsers retain executed inline scripts. Leave them in place so
		// hydrateRoot proves it ignores only renderer-owned protocol sidecars.
		activate(container, false);
		expect(container.firstElementChild!.tagName).toBe('STYLE');
		expect(container.querySelector('.ok')!.textContent).toBe('styled!');

		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const okSpan = container.querySelector('.ok');
		const clientPending = new Promise<string>(() => {});
		const root = hydrateRoot(container, StyledBoundary as any, { promise: clientPending });
		flushSync(() => {});
		expect(container.querySelector('.ok')).toBe(okSpan); // adopted, not rebuilt
		expect(errSpy).not.toHaveBeenCalled();
		errSpy.mockRestore();
		root.unmount();

		container.replaceChildren();
		const late = deferred<string>();
		const lateCollector = collector();
		ServerRT.renderToPipeableStream(server.LateStyledBoundary, {
			promise: late.promise,
		}).pipe(lateCollector.dest);
		expect(lateCollector.chunks[0]).not.toContain('rgb(4, 5, 6)');
		late.resolve('late styled!');
		await lateCollector.ended;

		container.innerHTML = lateCollector.chunks.join('');
		activate(container, false);
		const lateContent = container.querySelector('.late-content');
		const lateStyle = Array.from(container.querySelectorAll('style')).find((style) =>
			style.textContent?.includes('rgb(4, 5, 6)'),
		);
		expect(lateContent?.textContent).toBe('late styled!');
		expect(lateStyle).toBeDefined();

		const lateErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const lateClientPending = new Promise<string>(() => {});
		const lateRoot = hydrateRoot(container, LateStyledBoundary as any, {
			promise: lateClientPending,
		});
		flushSync(() => {});
		expect(container.querySelector('.late-content')).toBe(lateContent);
		expect(Array.from(container.querySelectorAll('style'))).toContain(lateStyle);
		expect(lateStyle!.textContent).toContain('rgb(4, 5, 6)');
		expect(lateErrorSpy).not.toHaveBeenCalled();
		lateErrorSpy.mockRestore();
		lateRoot.unmount();
	});

	it('hydrates two streamed sibling boundaries, each from its own seed scope', async () => {
		const a = deferred<string>();
		const b = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Siblings, {
			a: a.promise,
			b: b.promise,
		});
		pipe(c.dest);
		// Resolve in REVERSE order so segments stream out-of-order vs tree order.
		b.resolve('beta');
		await new Promise((r) => setTimeout(r, 0));
		a.resolve('alpha');
		await c.ended;

		container.innerHTML = c.chunks.join('');
		activate(container);
		expect(container.querySelector('.a')!.textContent).toBe('alpha');
		expect(container.querySelector('.b')!.textContent).toBe('beta');

		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const pending = new Promise<string>(() => {});
		const root = hydrateRoot(container, Siblings as any, { a: pending, b: pending });
		flushSync(() => {});
		expect(container.querySelector('.a')!.textContent).toBe('alpha');
		expect(container.querySelector('.b')!.textContent).toBe('beta');
		expect(errSpy).not.toHaveBeenCalled();
		errSpy.mockRestore();
		root.unmount();
	});

	it('gives a pending nested stream boundary an empty seed scope', async () => {
		const outer = deferred<string>();
		const inner = deferred<string>();
		const later = deferred<string>();
		const c = collector();
		const render = ServerRT.renderToPipeableStream(server.NestedStreamSeedScopes, {
			outer: outer.promise,
			inner: inner.promise,
			later: later.promise,
		});
		render.pipe(c.dest);
		outer.resolve('outer-ready');
		later.resolve('later-ready');
		await vi.waitFor(() => expect(c.chunks.length).toBeGreaterThan(1));

		container.innerHTML = c.chunks.join('');
		activate(container);
		const outerNode = container.querySelector('.outer-seed');
		const pendingNode = container.querySelector('.inner-seed-pending');
		const laterNode = container.querySelector('.later-seed');
		expect(outerNode!.textContent).toBe('outer-ready');
		expect(pendingNode!.textContent).toBe('inner pending');
		expect(laterNode!.textContent).toBe('later-ready');

		const clientOuter: any = new Promise<string>(() => {});
		const clientInner: any = new Promise<string>(() => {});
		const clientLater: any = new Promise<string>(() => {});
		// A still-pending nested template takes the existing degraded structural
		// recovery path; this regression observes seed ownership on the thenables.
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, NestedStreamSeedScopes as any, {
			outer: clientOuter,
			inner: clientInner,
			later: clientLater,
		});
		flushSync(() => {});

		expect(clientOuter.status).toBe('fulfilled');
		expect(clientOuter.value).toBe('outer-ready');
		// The inner template owns an EMPTY scope. Without the guard it consumes
		// the outer segment's `later-ready` seed and becomes spuriously fulfilled.
		expect(clientInner.status).toBe('pending');
		expect(clientInner.value).toBeUndefined();
		errorSpy.mockRestore();
		root.unmount();
		render.abort(new Error('test complete'));
		await c.ended;
	});
});
