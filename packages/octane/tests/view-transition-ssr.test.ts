/**
 * SSR ViewTransition annotation and reveal coverage, audited against React
 * 9b9385327857d1211fb4dc022122d897fb38bc5a. Extends the July 11 annotation
 * ports with nested parent relays, native update ownership, resource waits,
 * composed streams, failure cleanup, and hydration during an active capture.
 * Real capture evidence lives in browser/view-transition-streaming.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { interaction } from 'octane/hydration';
import { prerender } from 'octane/static';
import { loadServerFixture } from './_server-fixture.js';
import {
	deferred,
	createPipeableCollector,
	activateStreamedMarkup as activate,
	resetStreamRuntimeGlobals,
} from './_server-stream.js';
import { act, hydrateRoot, startTransition, type ViewTransitionInstance } from '../src/index.js';
import * as ServerRT from '../src/server/index.js';
// CLIENT-compiled fixture (for hydration).
import {
	AnnotationsApp,
	ArmsApp,
	DualApp,
	OutsideApp,
	RelayApp,
	ScopedStylesApp,
	SameHostScopesApp,
	StaticScopeStyleApp,
	ScopedRefNameApp,
	InvalidScopeApp,
	QueuedHydrationApp,
} from './_fixtures/view-transition-ssr.tsrx';

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/view-transition-ssr.tsrx');

const server = loadServerFixture(FIXTURE);
function collector() {
	const collection = createPipeableCollector();
	return { ...collection, dest: collection.destination };
}

const vt = (el: Element | null) => {
	if (el === null) return null;
	const out: Record<string, string> = {};
	for (const a of Array.from(el.attributes)) {
		if (a.name.startsWith('vt-')) out[a.name] = a.value;
	}
	return out;
};

function mockNativeTransitions(elements = false) {
	const frames: Array<{
		owner: Document | Element;
		update: () => unknown;
		ready: () => void;
		finish: () => void;
		skip: () => void;
	}> = [];
	const previous = document.startViewTransition;
	const previousElement = Object.getOwnPropertyDescriptor(Element.prototype, 'startViewTransition');
	const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
		x: 0,
		y: 0,
		left: 0,
		top: 0,
		right: 100,
		bottom: 20,
		width: 100,
		height: 20,
		toJSON() {},
	});
	function start(this: Document | Element, options: { update: () => unknown }) {
		let ready!: () => void, reject!: (error: unknown) => void, finish!: () => void;
		const result = {
			ready: new Promise<void>((resolve, rejectReady) => {
				ready = resolve;
				reject = rejectReady;
			}),
			finished: new Promise<void>((resolve) => {
				finish = resolve;
			}),
			skipTransition() {
				options.update();
				reject(new DOMException('Skipped', 'AbortError'));
				finish();
			},
		};
		frames.push({
			owner: this,
			update: options.update,
			ready,
			finish,
			skip: result.skipTransition,
		});
		return result;
	}
	(document as any).startViewTransition = start;
	if (elements)
		Object.defineProperty(Element.prototype, 'startViewTransition', {
			configurable: true,
			value: start,
		});
	return {
		frames,
		restore() {
			(document as any).startViewTransition = previous;
			if (previousElement)
				Object.defineProperty(Element.prototype, 'startViewTransition', previousElement);
			else delete (Element.prototype as any).startViewTransition;
			rect.mockRestore();
		},
	};
}

describe('ReactDOMFizzViewTransition (ported)', () => {
	let container: HTMLElement;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errorSpy = vi.spyOn(console, 'error');
	});
	afterEach(() => {
		// Hydration must not yield any errors/mismatch warnings (React's check).
		expect(errorSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
		container.remove();
		resetStreamRuntimeGlobals();
	});

	// Per ReactDOMFizzViewTransition-test.js:99
	it('emits annotations for view transitions', async () => {
		const { html } = ServerRT.renderToString(server.AnnotationsApp, {});
		container.innerHTML = html;

		const root = container.firstElementChild!;
		const kids = Array.from(root.children);
		expect(kids).toHaveLength(4);
		expect(vt(kids[0])).toEqual({ 'vt-update': 'auto' });
		expect(vt(kids[1])).toEqual({ 'vt-name': 'foo', 'vt-update': 'bar', 'vt-share': 'auto' });
		expect(vt(kids[2])).toEqual({ 'vt-update': 'baz' });
		// Nested boundary inside the named outer: innermost owns vt-update; the
		// outer contributes name + share.
		expect(vt(kids[3])).toEqual({ 'vt-name': 'outer', 'vt-update': 'auto', 'vt-share': 'pair' });

		// Hydration should not yield any errors (checked in afterEach).
		const root2 = hydrateRoot(container, AnnotationsApp, {});
		root2.unmount();
		container.innerHTML = '';
	});

	// Per ReactDOMFizzViewTransition-test.js:142
	it('emits enter/exit annotations for view transitions inside Suspense', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.ArmsApp, { promise: d.promise });
		pipe(c.dest);

		// Shell: the fallback root exits on reveal; the nested boundary is plain.
		const shell = document.createElement('div');
		shell.innerHTML = c.chunks[0];
		const shellAnnotated = shell.querySelectorAll('[vt-update]');
		expect(shellAnnotated).toHaveLength(2);
		expect(vt(shellAnnotated[0])).toEqual({ 'vt-update': 'auto', 'vt-exit': 'auto' });
		expect(shellAnnotated[1].tagName).toBe('SPAN');
		expect(vt(shellAnnotated[1])).toEqual({ 'vt-update': 'auto' });

		d.resolve('Content');
		await c.ended;
		container.innerHTML = c.chunks.join('');
		activate(container);

		// Revealed content: the content root enters; the nested boundary is plain.
		const annotated = container.querySelectorAll('[vt-update]');
		expect(annotated).toHaveLength(2);
		expect(vt(annotated[0])).toEqual({ 'vt-update': 'auto', 'vt-enter': 'auto' });
		expect(vt(annotated[1])).toEqual({ 'vt-update': 'auto' });
		expect(container.querySelector('span')!.textContent).toBe('Content');

		const root = hydrateRoot(container, ArmsApp, { promise: d.promise });
		await Promise.resolve();
		root.unmount();
		container.innerHTML = '';
	});

	// Per ReactDOMFizzViewTransition-test.js:207
	it('can emit both enter and exit on the same node', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.DualApp, { promise: d.promise });
		pipe(c.dest);

		// The fallback's boundary is Suspense CONTENT (inner @try) inside the
		// outer FALLBACK arm — it both enters and exits.
		const shell = document.createElement('div');
		shell.innerHTML = c.chunks[0];
		const shellAnnotated = shell.querySelectorAll('[vt-update]');
		expect(shellAnnotated).toHaveLength(2);
		expect(vt(shellAnnotated[0])).toEqual({
			'vt-update': 'auto',
			'vt-enter': 'hello',
			'vt-exit': 'goodbye',
		});
		expect(vt(shellAnnotated[1])).toEqual({ 'vt-update': 'auto' });

		d.resolve('Content');
		await c.ended;
		container.innerHTML = c.chunks.join('');
		activate(container);

		const annotated = container.querySelectorAll('[vt-update]');
		expect(annotated).toHaveLength(2);
		expect(vt(annotated[0])).toEqual({ 'vt-update': 'auto', 'vt-enter': 'hi' });
		expect(container.querySelector('span')!.textContent).toBe('Content');

		const root = hydrateRoot(container, DualApp, { promise: d.promise });
		await Promise.resolve();
		root.unmount();
		container.innerHTML = '';
	});

	// Per ReactDOMFizzViewTransition-test.js:274
	it('emits annotations for view transitions outside Suspense', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.OutsideApp, { promise: d.promise });
		pipe(c.dest);

		// The wrapping boundary pairs fallback and content across the swap: BOTH
		// captures carry the same auto vt-name + vt-share.
		const shell = document.createElement('div');
		shell.innerHTML = c.chunks[0];
		const shellAnnotated = shell.querySelectorAll('[vt-update]');
		expect(shellAnnotated).toHaveLength(2);
		const fbAttrs = vt(shellAnnotated[0])!;
		expect(fbAttrs['vt-name']).toMatch(/^_O.+_$/);
		expect(fbAttrs['vt-update']).toBe('auto');
		expect(fbAttrs['vt-share']).toBe('auto');
		expect(fbAttrs['vt-enter']).toBeUndefined();
		expect(fbAttrs['vt-exit']).toBeUndefined();
		expect(vt(shellAnnotated[1])).toEqual({ 'vt-update': 'auto' });

		d.resolve('Content');
		await c.ended;
		container.innerHTML = c.chunks.join('');
		activate(container);

		const annotated = container.querySelectorAll('[vt-update]');
		expect(annotated).toHaveLength(2);
		const cAttrs = vt(annotated[0])!;
		// The SAME stable name on the new capture (frame-path derived).
		expect(cAttrs['vt-name']).toBe(fbAttrs['vt-name']);
		expect(cAttrs['vt-update']).toBe('auto');
		expect(cAttrs['vt-share']).toBe('auto');
		expect(vt(annotated[1])).toEqual({ 'vt-update': 'auto' });
		expect(container.querySelector('span')!.textContent).toBe('Content');

		const root = hydrateRoot(container, OutsideApp, { promise: d.promise });
		await Promise.resolve();
		root.unmount();
		container.innerHTML = '';
	});
	// ReactDOMFizzViewTransition: nested parentEnter/parentExit streaming relays.
	it.each([
		{ relay: 'relay', handler: undefined, deep: true, own: 'relay' },
		{
			relay: { default: 'relay', navigation: 'other' },
			handler: undefined,
			deep: true,
			own: 'relay',
		},
		{ relay: 'none', handler: undefined, deep: false, own: null },
		{ relay: undefined, handler: undefined, deep: false, own: null },
		{ relay: 'auto', handler: undefined, deep: true, own: null },
		{ relay: undefined, handler: () => {}, deep: true, own: null },
	])(
		'preserves nested stream relay opt-in $relay / $deep',
		async ({ relay, handler, deep, own }) => {
			const d = deferred<string>();
			const c = collector();
			ServerRT.renderToPipeableStream(server.RelayApp, { promise: d.promise, relay, handler }).pipe(
				c.dest,
			);
			container.innerHTML = c.chunks[0];
			expect(container.querySelector('#fallback-relay')!.getAttribute('vt-parent-exit')).toBe(own);
			expect(container.querySelector('#fallback-deep')!.getAttribute('vt-parent-exit')).toBe(
				deep ? 'deep-exit' : null,
			);
			d.resolve('Content');
			await c.ended;
			container.innerHTML = c.chunks.join('');
			activate(container);
			await Promise.resolve();
			expect(container.querySelector('#relay')!.getAttribute('vt-parent-enter')).toBe(own);
			expect(container.querySelector('#deep')!.getAttribute('vt-parent-enter')).toBe(
				deep ? 'deep-enter' : null,
			);
		},
	);

	it('annotates each host and reserves auto for generated names', () => {
		container.innerHTML = ServerRT.renderToString(server.MultipleHostsApp, {}).html;
		const first = container.querySelector('#first')!;
		const second = container.querySelector('#second')!;
		expect(first.getAttribute('vt-update')).toBe('resize');
		expect(second.getAttribute('vt-update')).toBe('resize');
		// Secondary hosts take the same `-N` suffix the client runtime assigns, so
		// authored `::view-transition-group(siblings-1)` rules match a streamed
		// reveal and a later client update alike.
		expect(first.getAttribute('vt-name')).toBe('siblings');
		expect(second.getAttribute('vt-name')).toBe('siblings-1');
		expect(container.querySelector('#automatic')!.getAttribute('vt-name')).toBeNull();
	});

	it('uses the wrapping update class when Suspense replaces fallback content', async () => {
		const d = deferred<string>();
		const c = collector();
		ServerRT.renderToPipeableStream(server.OutsideClassesApp, { promise: d.promise }).pipe(c.dest);
		container.innerHTML = c.chunks[0];
		expect(container.querySelector('[vt-name="outer-classes"]')!.getAttribute('vt-share')).toBe(
			'resize',
		);
		d.resolve('Content');
		await c.ended;
		container.innerHTML = c.chunks.join('');
		activate(container);
		expect(container.querySelector('[vt-name="outer-classes"]')!.getAttribute('vt-share')).toBe(
			'resize',
		);
	});

	it('captures streamed fallback and nested content inside the native update callback', async () => {
		const previous = document.startViewTransition;
		const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 100,
			bottom: 20,
			width: 100,
			height: 20,
			toJSON() {},
		});
		const captured: Record<string, string>[] = [];
		let update!: () => void;
		let ready!: () => void;
		let finished!: () => void;
		(document as any).startViewTransition = (options: { update: () => void }) => {
			captured.push(
				Object.fromEntries(
					Array.from(container.querySelectorAll<HTMLElement>('[id]'))
						.filter((el) => !el.closest('[hidden]'))
						.map((el) => [el.id, el.style.viewTransitionClass]),
				),
			);
			update = options.update;
			return {
				ready: new Promise<void>((r) => {
					ready = r;
				}),
				finished: new Promise<void>((r) => {
					finished = r;
				}),
				skipTransition() {
					update();
					ready();
					finished();
				},
			};
		};
		try {
			const d = deferred<string>();
			const c = collector();
			ServerRT.renderToPipeableStream(server.RelayApp, { promise: d.promise, relay: 'relay' }).pipe(
				c.dest,
			);
			d.resolve('Content');
			await c.ended;
			container.innerHTML = c.chunks.join('');
			activate(container);
			await Promise.resolve();
			await Promise.resolve();
			expect(captured).toEqual([
				{ fallback: 'page-exit', 'fallback-relay': 'relay', 'fallback-deep': 'deep-exit' },
			]);
			expect(container.querySelector('#fallback')).not.toBeNull();
			update();
			expect(container.querySelector('#fallback')).toBeNull();
			expect(container.querySelector<HTMLElement>('#content')!.style.viewTransitionClass).toBe(
				'page-enter',
			);
			expect(container.querySelector<HTMLElement>('#deep')!.style.viewTransitionClass).toBe(
				'deep-enter',
			);
			const content = container.querySelector('#content');
			const hydrated = hydrateRoot(container, RelayApp, { promise: d.promise, relay: 'relay' });
			expect(container.querySelector('#content')).toBe(content);
			ready();
			await Promise.resolve();
			expect(container.querySelector<HTMLElement>('#content')!.style.viewTransitionName).toBe('');
			expect(container.querySelector<HTMLElement>('#deep')!.style.viewTransitionClass).toBe('');
			finished();
			await Promise.resolve();
			hydrated.unmount();
		} finally {
			(document as any).startViewTransition = previous;
			rect.mockRestore();
		}
	});
	it('queues independently composed streams and releases the next reveal after a skip', async () => {
		const native = mockNativeTransitions();
		try {
			for (const id of ['one', 'two', 'removed']) {
				const d = deferred<string>();
				const c = collector();
				ServerRT.renderToPipeableStream(server.StreamTextApp, { promise: d.promise, id }).pipe(
					c.dest,
				);
				d.resolve(id);
				await c.ended;
				const host = document.createElement('div');
				host.innerHTML = c.chunks.join('');
				container.appendChild(host);
				activate(host);
				if (id === 'removed') host.remove();
			}
			expect(native.frames).toHaveLength(1);
			native.frames[0].skip();
			await Promise.resolve();
			expect(container.querySelector('#one')!.textContent).toBe('one');
			expect(native.frames).toHaveLength(2);
			native.frames[1].update();
			native.frames[1].ready();
			native.frames[1].finish();
			await Promise.resolve();
			expect(container.querySelector('#two')!.textContent).toBe('two');
			expect(container.querySelectorAll('p')).toHaveLength(0);
		} finally {
			native.restore();
		}
	});

	it.each(['reject', 'abort'] as const)(
		'recovers dormant hydration when a child %s arrives before its queued parent reveal',
		async (failure) => {
			const native = mockNativeTransitions();
			let root: ReturnType<typeof hydrateRoot> | undefined;
			try {
				const first = deferred<string>();
				const firstStream = collector();
				ServerRT.renderToPipeableStream(server.StreamTextApp, {
					promise: first.promise,
					id: 'blocking',
				}).pipe(firstStream.dest);
				first.resolve('First');
				await firstStream.ended;
				const blocker = document.createElement('div');
				blocker.innerHTML = firstStream.chunks.join('');
				container.appendChild(blocker);

				const parent = deferred<string>();
				const child = deferred<string>();
				const onHydrated = vi.fn();
				const onClick = vi.fn();
				const onError = vi.fn();
				const props = {
					parent: parent.promise,
					child: child.promise,
					when: interaction(),
					onHydrated,
					onClick,
				};
				const chunks = collector();
				const controller = ServerRT.renderToPipeableStream(server.QueuedHydrationApp, props, {
					onError,
				});
				controller.pipe(chunks.dest);
				const host = document.createElement('div');
				host.innerHTML = chunks.chunks.join('');
				container.appendChild(host);
				let consumed = chunks.chunks.length;
				root = hydrateRoot(
					host,
					QueuedHydrationApp,
					{ ...props, recover: true },
					{ onRecoverableError() {} },
				);
				await act(() => host.querySelector<HTMLButtonElement>('#activate-hydration')!.click());
				expect(onHydrated).not.toHaveBeenCalled();
				activate(blocker);
				await Promise.resolve();
				expect(native.frames).toHaveLength(1);

				parent.resolve('Live button');
				await vi.waitFor(() => expect(chunks.chunks.length).toBeGreaterThan(consumed));
				const transport = document.createElement('div');
				transport.innerHTML = chunks.chunks.slice(consumed).join('');
				container.appendChild(transport);
				activate(transport);
				consumed = chunks.chunks.length;
				await Promise.resolve();
				expect(host.querySelector('#queued-parent')).toBeNull();
				const error = new Error('Child unavailable');
				if (failure === 'reject') child.reject(error);
				else controller.abort(error);
				await chunks.ended;
				transport.insertAdjacentHTML('beforeend', chunks.chunks.slice(consumed).join(''));
				activate(transport);
				await act(async () => {
					native.frames[0].skip();
					await Promise.resolve();
					expect(native.frames).toHaveLength(2);
					native.frames[1].skip();
				});
				await vi.waitFor(() => expect(onHydrated).toHaveBeenCalledOnce());
				expect(host.querySelector('#recovered-child')!.textContent).toBe('Recovered child');
				await act(() => host.querySelector<HTMLButtonElement>('#recovered-button')!.click());
				expect(onClick).toHaveBeenCalledOnce();
				expect(onError).toHaveBeenCalledWith(error);
			} finally {
				root?.unmount();
				native.restore();
			}
		},
	);

	it('captures a document boundary around an invalid streamed element scope', async () => {
		const native = mockNativeTransitions();
		try {
			const value = deferred<string>();
			const chunks = collector();
			ServerRT.renderToPipeableStream(server.InvalidScopeOuterStreamApp, {
				promise: value.promise,
			}).pipe(chunks.dest);
			value.resolve('Content');
			await chunks.ended;
			container.innerHTML = chunks.chunks.join('');
			activate(container);
			await Promise.resolve();
			expect(native.frames).toHaveLength(1);
			expect(native.frames[0].owner).toBe(document);
			expect(
				container.querySelector<HTMLElement>('#invalid-stream-fallback')!.style.viewTransitionName,
			).toBe('document-outer');
			native.frames[0].skip();
			await Promise.resolve();
			expect(container.textContent).toBe('ContentSibling');
		} finally {
			native.restore();
		}
	});

	it('shares one capture across sibling boundaries completed in the same stream wave', async () => {
		const native = mockNativeTransitions();
		try {
			const d = deferred<string>();
			const c = collector();
			ServerRT.renderToPipeableStream(server.SharedWaveApp, { promise: d.promise }).pipe(c.dest);
			d.resolve('Content');
			await c.ended;
			container.innerHTML = c.chunks.join('');
			activate(container);
			await Promise.resolve();
			expect(native.frames).toHaveLength(1);
			const old = container.querySelector<HTMLElement>('#wave-old')!;
			expect(old.style.viewTransitionName).toBe('wave-hero');
			expect(old.style.viewTransitionClass).toBe('old-share');
			native.frames[0].update();
			const next = container.querySelector<HTMLElement>('#wave-new')!;
			expect(next.closest('[hidden]')).toBeNull();
			expect(next.style.viewTransitionName).toBe(old.style.viewTransitionName);
			expect(next.style.viewTransitionClass).toBe('new-share');
			expect(container.querySelector('p')).toBeNull();
			native.frames[0].ready();
			native.frames[0].finish();
			await Promise.resolve();
			expect(native.frames).toHaveLength(1);
		} finally {
			native.restore();
		}
	});

	it('captures sibling element scopes independently before revealing either stream', async () => {
		const native = mockNativeTransitions(true);
		try {
			for (const id of ['left-scope', 'right-scope']) {
				const d = deferred<string>();
				const c = collector();
				ServerRT.renderToPipeableStream(server.ScopedStreamApp, { id, promise: d.promise }).pipe(
					c.dest,
				);
				d.resolve(id);
				await c.ended;
				const carrier = document.createElement('div');
				carrier.innerHTML = c.chunks.join('');
				container.appendChild(carrier);
			}
			activate(container);
			await Promise.resolve();
			expect(native.frames.map((frame) => (frame.owner as Element).id)).toEqual([
				'left-scope',
				'right-scope',
			]);
			const scopes = Array.from(
				container.querySelectorAll<HTMLElement>('#left-scope, #right-scope'),
			);
			for (const scope of scopes) {
				expect(getComputedStyle(scope).getPropertyValue('view-transition-scope')).toBe('all');
				expect(scope.querySelector<HTMLElement>('#wave-old')!.style.viewTransitionName).toBe(
					'wave-hero',
				);
			}
			native.frames[0].update();
			expect(scopes.every((scope) => scope.querySelector('#wave-old'))).toBe(true);
			native.frames[1].update();
			for (const scope of scopes) {
				expect(scope.querySelector('#wave-old')).toBeNull();
				expect(scope.querySelector('#wave-new')!.textContent).toBe(scope.id);
			}
			for (const frame of native.frames) {
				frame.ready();
				frame.finish();
			}
			await Promise.resolve();
		} finally {
			native.restore();
		}
	});

	it('keeps nested streamed scopes in separate native captures', async () => {
		const native = mockNativeTransitions(true);
		try {
			const d = deferred<string>();
			const c = collector();
			ServerRT.renderToPipeableStream(server.NestedScopedStreamApp, { promise: d.promise }).pipe(
				c.dest,
			);
			d.resolve('Content');
			await c.ended;
			container.innerHTML = c.chunks.join('');
			activate(container);
			await Promise.resolve();
			expect(native.frames.map((frame) => (frame.owner as Element).id)).toEqual([
				'outer-scope',
				'inner-scope',
			]);
			for (const frame of native.frames) frame.update();
			expect(container.querySelector('#outer-content')!.textContent).toBe('Content');
			expect(container.querySelector('#wave-new')!.textContent).toBe('Content');
			for (const frame of native.frames) {
				frame.ready();
				frame.finish();
			}
			await Promise.resolve();
		} finally {
			native.restore();
		}
	});

	it.each(['', 'scope-css', 'none'])(
		'preserves the authored inline name of a streamed scope root (%s)',
		async (name) => {
			const native = mockNativeTransitions(true);
			try {
				const value = deferred<string>();
				const c = collector();
				ServerRT.renderToPipeableStream(server.ScopedStreamApp, {
					id: 'named-scope',
					promise: value.promise,
					style: name ? 'view-transition-name:' + name : undefined,
				}).pipe(c.dest);
				value.resolve('Content');
				await c.ended;
				container.innerHTML = c.chunks.join('');
				activate(container);
				await Promise.resolve();
				const host = container.querySelector<HTMLElement>('#named-scope')!;
				expect(native.frames).toHaveLength(1);
				expect(native.frames[0].owner).toBe(host);
				expect(host.style.getPropertyValue('view-transition-name')).toBe(name);
				native.frames[0].update();
				native.frames[0].ready();
				native.frames[0].finish();
				await Promise.resolve();
			} finally {
				native.restore();
			}
		},
	);

	it('queues another reveal for its active scope while an independent stream proceeds', async () => {
		const native = mockNativeTransitions(true);
		try {
			const first = deferred<string>();
			const second = deferred<string>();
			const c = collector();
			ServerRT.renderToPipeableStream(server.ScopedTwoWaveApp, {
				first: first.promise,
				second: second.promise,
			}).pipe(c.dest);
			container.innerHTML = c.chunks.join('');
			activate(container);
			let emitted = c.chunks.length;
			first.resolve('First');
			await vi.waitFor(() => expect(c.chunks.length).toBeGreaterThan(emitted));
			const append = (html: string) => {
				const carrier = document.createElement('div');
				carrier.innerHTML = html;
				container.appendChild(carrier);
				activate(carrier);
			};
			append(c.chunks.slice(emitted).join(''));
			await Promise.resolve();
			emitted = c.chunks.length;
			expect(native.frames.map((frame) => (frame.owner as Element).id)).toEqual(['queued-scope']);
			native.frames[0].update();
			native.frames[0].ready();
			second.resolve('Second');
			await c.ended;
			append(c.chunks.slice(emitted).join(''));
			await Promise.resolve();
			expect(native.frames).toHaveLength(1);
			const other = deferred<string>();
			const otherCollector = collector();
			ServerRT.renderToPipeableStream(server.ScopedStreamApp, {
				id: 'independent-scope',
				promise: other.promise,
			}).pipe(otherCollector.dest);
			other.resolve('Independent');
			await otherCollector.ended;
			append(otherCollector.chunks.join(''));
			await Promise.resolve();
			expect(native.frames.map((frame) => (frame.owner as Element).id)).toEqual([
				'queued-scope',
				'independent-scope',
			]);
			native.frames[1].update();
			expect(container.querySelector('#wave-new')!.textContent).toBe('Independent');
			expect(container.querySelector('#second-wave')).toBeNull();
			native.frames[0].finish();
			await Promise.resolve();
			expect(native.frames.map((frame) => (frame.owner as Element).id)).toEqual([
				'queued-scope',
				'independent-scope',
				'queued-scope',
			]);
			native.frames[2].update();
			expect(container.querySelector('#second-wave')!.textContent).toBe('Second');
			for (const frame of native.frames.slice(1)) {
				frame.ready();
				frame.finish();
			}
			await Promise.resolve();
		} finally {
			native.restore();
		}
	});

	it.each(['lowercase', 'mixed syntax'])(
		'ignores annotation lookalikes inside trusted HTML attribute values (%s)',
		async (syntax) => {
			const native = mockNativeTransitions();
			try {
				const value = deferred<string>();
				const chunks = collector();
				const title =
					syntax === 'lowercase' ? ' vt-parent-exit-x="none"' : ' vt-parent-exit-x = "none"';
				const attributes =
					syntax === 'lowercase'
						? 'vt-parent-exit-x="relay-exit" vt-parent-enter-x="none"'
						: 'data-mode="quoted value" data-flag VT-PARENT-EXIT-X = relay-exit VT-PARENT-ENTER-X = \'none\'';
				const markup = `<span id="raw-relay" title='${title}' ${attributes}>Leaving</span>`;
				ServerRT.renderToPipeableStream(server.RawAttributeRelayApp, {
					promise: value.promise,
					markup,
				}).pipe(chunks.dest);
				value.resolve('Content');
				await chunks.ended;
				container.innerHTML = chunks.chunks.join('');
				activate(container);
				await Promise.resolve();
				const relay = container.querySelector<HTMLElement>('#raw-relay')!;
				expect(relay.title).toBe(title);
				expect(relay.hasAttribute('vt-parent-enter-x')).toBe(false);
				expect(relay.style.viewTransitionClass).toBe('relay-exit');
				native.frames[0].skip();
				await Promise.resolve();
				expect(container.textContent).toBe('Content');
			} finally {
				native.restore();
			}
		},
	);

	it.each(['ready', 'streamed'])(
		'preserves adjacent trusted HTML attributes when removing unused transition annotations (%s)',
		async (mode) => {
			const props = { markup: '<p id="raw-adjacent" a="1"vt-exit-x="b"c="2">Ready</p>' };
			if (mode === 'ready')
				container.innerHTML = ServerRT.renderToString(server.RawMarkupApp, props).html;
			else {
				const chunks = collector();
				ServerRT.renderToPipeableStream(server.RawMarkupApp, props).pipe(chunks.dest);
				await chunks.ended;
				container.innerHTML = chunks.chunks.join('');
			}
			const element = container.querySelector('#raw-adjacent')!;
			expect(element.getAttribute('a')).toBe('1');
			expect(element.getAttribute('c')).toBe('2');
			expect(element.hasAttribute('vt-exit-x')).toBe(false);
			expect(element.textContent).toBe('Ready');
		},
	);

	it.each(['ready', 'streamed'])(
		'preserves trusted raw text with uppercase closing tags (%s)',
		async (mode) => {
			const text = `<i vt-exit-x="literal">Raw text</i>`;
			const props = { markup: `<SCRIPT id="raw-script" type="application/json">${text}</SCRIPT>` };
			if (mode === 'ready')
				container.innerHTML = ServerRT.renderToString(server.RawMarkupApp, props).html;
			else {
				const chunks = collector();
				ServerRT.renderToPipeableStream(server.RawMarkupApp, props).pipe(chunks.dest);
				await chunks.ended;
				container.innerHTML = chunks.chunks.join('');
			}
			expect(container.querySelector('#raw-script')!.textContent).toBe(text);
			expect(container.querySelector('[vt-name="raw-neighbor"]')!.textContent).toBe('Neighbor');
		},
	);

	it.each(['ready', 'streamed'])(
		'preserves transition-looking text and raw-tag lookalikes in authored attributes (%s)',
		async (mode) => {
			for (const title of ['', '<script>not a real script']) {
				const props = { text: ' vt-exit-x="literal"', title };
				if (mode === 'ready')
					container.innerHTML = ServerRT.renderToString(server.LiteralAnnotationsApp, props).html;
				else {
					const chunks = collector();
					ServerRT.renderToPipeableStream(server.LiteralAnnotationsApp, props).pipe(chunks.dest);
					await chunks.ended;
					container.innerHTML = chunks.chunks.join('');
				}
				const element = container.querySelector('#literal-annotations')!;
				expect(element.textContent).toBe(props.text);
				expect(element.getAttribute('title')).toBe(props.title);
				expect(vt(container.querySelector('[vt-name="literal-neighbor"]'))).toEqual({
					'vt-name': 'literal-neighbor',
					'vt-update': 'auto',
					'vt-share': 'auto',
				});
			}
		},
	);

	it('preserves quoted trusted HTML supplied by an ordinary host spread', () => {
		const title = ' vt-exit-x="authored title"';
		container.innerHTML = ServerRT.renderToString(server.SpreadRawMarkupApp, {
			markup: `<p id="spread-raw" title='${title}'>Ready</p>`,
		}).html;
		expect(container.querySelector('#spread-raw')!.getAttribute('title')).toBe(title);
	});

	it('preserves memoized trusted HTML across a render-phase state retry', () => {
		const title = ' vt-exit-x="authored title"';
		container.innerHTML = ServerRT.renderToString(server.RetriedRawMarkupApp, {
			markup: `<p id="retried-raw" title='${title}'>Ready</p>`,
		}).html;
		expect(container.querySelector('#retried-raw')!.getAttribute('title')).toBe(title);
	});

	it.each(['prerender', 'streamed'])(
		'preserves cached trusted HTML returned by an asynchronous component (%s)',
		async (mode) => {
			const title = ' vt-exit-x="authored title"';
			const props = {
				markup: `<p id="async-raw" title='${title}'>Ready</p>`,
				promise: Promise.resolve(),
			};
			if (mode === 'prerender')
				container.innerHTML = (await prerender(server.AsyncRawMarkupApp, props)).html;
			else {
				const chunks = collector();
				ServerRT.renderToPipeableStream(server.AsyncRawMarkupApp, props).pipe(chunks.dest);
				await chunks.ended;
				container.innerHTML = chunks.chunks.join('');
				activate(container);
				await Promise.resolve();
			}
			expect(container.querySelector('#async-raw')!.getAttribute('title')).toBe(title);
		},
	);

	it('preserves trusted HTML while another server render completes or throws', () => {
		const title = ' vt-exit-x="authored title"';
		const markup = `<p id="reentrant-raw" title='${title}'>Ready</p>`;
		const rendered = ServerRT.renderToString(server.ReentrantRawMarkupApp, {
			markup,
			render() {
				ServerRT.renderToString(server.AnnotationsApp, {});
				expect(() =>
					ServerRT.renderToString(() => {
						throw new Error('Nested render');
					}, {}),
				).toThrow('Nested render');
			},
		});
		container.innerHTML = rendered.html;
		expect(container.querySelector('#reentrant-raw')!.getAttribute('title')).toBe(title);
	});

	it('preserves trusted HTML in a reveal after an independent stream finishes', async () => {
		const title = ' vt-exit-x="authored title"';
		const value = deferred<string>();
		const chunks = collector();
		ServerRT.renderToPipeableStream(server.RawMarkupStreamApp, { promise: value.promise }).pipe(
			chunks.dest,
		);
		const other = collector();
		ServerRT.renderToPipeableStream(server.AnnotationsApp, {}).pipe(other.dest);
		await other.ended;
		value.resolve(`<p id="streamed-raw" title='${title}'>Ready</p>`);
		await chunks.ended;
		container.innerHTML = chunks.chunks.join('');
		activate(container);
		await Promise.resolve();
		expect(container.querySelector('#streamed-raw')!.getAttribute('title')).toBe(title);
	});

	it('preserves authored inline scope styles while emitting the shared scope rule', () => {
		const props = {
			scope: 'element',
			style: 'color:red;view-transition-scope:none!important',
			text: 'Server',
		};
		const rendered = ServerRT.renderToString(server.ScopedStylesApp, props);
		container.innerHTML = rendered.css + rendered.html;
		const host = container.querySelector<HTMLElement>('#scope-styles')!;
		expect(host.getAttribute('style')).toBe(props.style);
		expect(getComputedStyle(host).getPropertyValue('view-transition-scope')).toBe('none');
		const rules = [...container.querySelectorAll('style')].flatMap((style) => [
			...(style.sheet?.cssRules ?? []),
		]);
		expect(
			rules.some(
				(rule) =>
					rule.cssText.includes('[vt-scope="element"]') &&
					rule.cssText.includes('view-transition-scope: all !important'),
			),
		).toBe(true);
	});

	it('adopts SSR scopes without changing authored inline scope styles', async () => {
		const props = {
			scope: 'element' as 'element' | undefined,
			title: 'quoted style="not a style attribute"',
			style: 'color:red;view-transition-scope:none!important',
			text: 'Server',
		};
		container.innerHTML = ServerRT.renderToString(server.ScopedStylesApp, props).html;
		const host = container.querySelector<HTMLElement>('#scope-styles')!;
		expect(host.title).toBe(props.title);
		const root = hydrateRoot(container, ScopedStylesApp, props);
		try {
			expect(container.querySelector('#scope-styles')).toBe(host);
			expect(host.style.getPropertyValue('view-transition-scope')).toBe('none');
			expect(host.style.getPropertyPriority('view-transition-scope')).toBe('important');
			host.style.color = 'blue';
			await act(() => root.render(ScopedStylesApp, { ...props, scope: undefined, text: 'Client' }));
			expect(container.querySelector('#scope-styles')).toBe(host);
			expect(host.textContent).toBe('Client');
			expect(host.style.getPropertyValue('view-transition-scope')).toBe('none');
			expect(host.style.getPropertyPriority('view-transition-scope')).toBe('important');
			expect(host.style.color).toBe('blue');
		} finally {
			root.unmount();
		}
	});

	it('retains an authored scope value that becomes equal to the owned declaration', async () => {
		const props = {
			scope: 'element' as 'element' | undefined,
			style: 'view-transition-scope:none!important',
			text: 'First',
		};
		container.innerHTML = ServerRT.renderToString(server.ScopedStylesApp, props).html;
		const root = hydrateRoot(container, ScopedStylesApp, props);
		try {
			const host = container.querySelector<HTMLElement>('#scope-styles')!;
			const authored = { ...props, style: 'view-transition-scope:all!important', text: 'Second' };
			await act(() => root.render(ScopedStylesApp, authored));
			await act(() => root.render(ScopedStylesApp, { ...authored, scope: undefined }));
			expect(host.style.getPropertyValue('view-transition-scope')).toBe('all');
			expect(host.style.getPropertyPriority('view-transition-scope')).toBe('important');
		} finally {
			root.unmount();
		}
	});

	it('switches a live scoped ref to an equal explicit name with its own layout lifetime', async () => {
		const connected: ViewTransitionInstance[] = [];
		const cleaned: ViewTransitionInstance[] = [];
		const reference = (instance: ViewTransitionInstance | null) => {
			if (instance === null) return;
			connected.push(instance);
			return () => {
				cleaned.push(instance);
			};
		};
		container.innerHTML = ServerRT.renderToString(server.ScopedRefNameApp, { reference }).html;
		const root = hydrateRoot(container, ScopedRefNameApp, { reference });
		try {
			await act(() => {});
			const host = container.querySelector<HTMLElement>('#scope-ref-name')!;
			const live = connected[0];
			expect(live.name).toBe('hero');
			await act(() => root.render(ScopedRefNameApp, { reference, name: 'hero' }));
			expect(connected).toHaveLength(2);
			expect(cleaned).toEqual([live]);
			const fixed = connected[1];
			expect(fixed).not.toBe(live);
			host.style.viewTransitionName = 'card';
			expect(live.name).toBe('card');
			expect(live.group.selector).toBe('::view-transition-group(card)');
			expect(fixed.name).toBe('hero');
			expect(fixed.group.selector).toBe('::view-transition-group(hero)');
		} finally {
			root.unmount();
		}
		expect(cleaned).toEqual(connected);
	});

	it('keeps hydrated hosts of an invalid element scope in the document capture', async () => {
		const onUpdate = () => {};
		const { html } = ServerRT.renderToString(server.InvalidScopeApp, { text: 'One', onUpdate });
		container.innerHTML = html;
		// The server still marks the invalid declaration so a streamed reveal
		// inside it does not widen to a document animation before hydration.
		expect(container.querySelector('#invalid-first')!.getAttribute('vt-scope')).toBe('none');
		const native = mockNativeTransitions();
		const root = hydrateRoot(container, InvalidScopeApp, { text: 'One', onUpdate });
		try {
			await act(() => {});
			await act(() => {
				startTransition(() => {
					root.render(InvalidScopeApp, { text: 'One much longer', onUpdate });
				});
			});
			// Same outcome as a client-only mount: one document transition whose old
			// capture names both of the outer boundary's hosts.
			expect(native.frames).toHaveLength(1);
			expect(native.frames[0].owner).toBe(document);
			const first = container.querySelector<HTMLElement>('#invalid-first')!;
			const second = container.querySelector<HTMLElement>('#invalid-second')!;
			const name = first.style.viewTransitionName;
			expect(name).not.toBe('');
			expect(second.style.viewTransitionName).toBe(name + '-1');
			await native.frames[0].update();
			native.frames[0].ready();
			native.frames[0].finish();
			await act(() => {});
			expect(first.textContent).toBe('One much longer');
			expect(first.style.viewTransitionName).toBe('');
		} finally {
			root.unmount();
			native.restore();
			if (process.env.NODE_ENV !== 'production') {
				expect(errorSpy).toHaveBeenCalledWith(
					expect.stringContaining('requires exactly one host element'),
				);
				errorSpy.mockClear();
			}
		}
	});

	it.each([false, true])(
		'checks authored static scope styles during hydration (mismatch=%s)',
		(mismatch) => {
			container.innerHTML = ServerRT.renderToString(server.StaticScopeStyleApp, {}).html;
			const host = container.querySelector<HTMLElement>('#static-scope-style')!;
			if (mismatch) host.style.color = 'blue';
			const root = hydrateRoot(container, StaticScopeStyleApp, {});
			try {
				const hydrated = container.querySelector<HTMLElement>('#static-scope-style')!;
				expect(hydrated === host).toBe(!mismatch);
				expect(hydrated.style.color).toBe('red');
				expect(hydrated.style.getPropertyValue('view-transition-scope')).toBe('none');
				expect(hydrated.style.getPropertyPriority('view-transition-scope')).toBe('important');
			} finally {
				root.unmount();
				if (mismatch) errorSpy.mockClear();
			}
		},
	);

	it('keeps a shared scope host owned when one nested declaration is removed', async () => {
		const native = mockNativeTransitions(true);
		const updates: string[] = [];
		const props = {
			outer: 'element' as 'element' | undefined,
			inner: 'element' as 'element' | undefined,
			text: 'First',
			style: 'view-transition-scope:none!important',
			onUpdate: () => {
				updates.push('update');
			},
		};
		container.innerHTML = ServerRT.renderToString(server.SameHostScopesApp, props).html;
		const root = hydrateRoot(container, SameHostScopesApp, props);
		try {
			const host = container.querySelector<HTMLElement>('#same-host-scope')!;
			const retained = { ...props, outer: undefined };
			await act(() => root.render(SameHostScopesApp, retained));
			startTransition(() => root.render(SameHostScopesApp, { ...retained, text: 'Second' }));
			await vi.waitFor(() => expect(native.frames).toHaveLength(1));
			expect(native.frames[0].owner).toBe(host);
			await native.frames[0].update();
			native.frames[0].ready();
			native.frames[0].finish();
			await vi.waitFor(() => expect(updates).toEqual(['update']));
			expect(container.querySelector('#same-host-scope')).toBe(host);
			await act(() => root.render(SameHostScopesApp, { ...retained, inner: undefined }));
			expect(host.style.getPropertyValue('view-transition-scope')).toBe('none');
			expect(host.style.getPropertyPriority('view-transition-scope')).toBe('important');
		} finally {
			root.unmount();
			native.restore();
		}
	});

	it.each([
		'ScopedStreamApp',
		'ReplacedScopedStreamApp',
		'MultipleScopedStreamApp',
		'TextScopedStreamApp',
		'ResourceScopedStreamApp',
	])(
		'commits %s without document animation when its element scope is unavailable',
		async (name) => {
			const native = mockNativeTransitions(name !== 'ScopedStreamApp');
			try {
				const d = deferred<string>();
				const c = collector();
				ServerRT.renderToPipeableStream(server[name], {
					promise: d.promise,
					id: 'unsupported-scope',
				}).pipe(c.dest);
				d.resolve('Content');
				await c.ended;
				container.innerHTML = c.chunks.join('');
				if (name === 'ReplacedScopedStreamApp')
					expect(
						container
							.querySelector<HTMLElement>('#old-scope')!
							.style.getPropertyValue('view-transition-scope'),
					).toBe('');
				activate(container);
				await Promise.resolve();
				expect(native.frames).toHaveLength(0);
				expect(container.textContent).toContain('Content');
				expect(container.textContent).not.toContain('Loading');
			} finally {
				native.restore();
			}
		},
	);

	it('installs the animation driver when the first ViewTransition arrives in a later wave', async () => {
		const native = mockNativeTransitions();
		try {
			const d = deferred<string>();
			const c = collector();
			ServerRT.renderToPipeableStream(server.LateViewApp, { promise: d.promise }).pipe(c.dest);
			expect(c.chunks.join('')).not.toContain('$OCTVT');
			d.resolve('Content');
			await c.ended;
			container.innerHTML = c.chunks.join('');
			activate(container);
			await Promise.resolve();
			expect(native.frames).toHaveLength(1);
			native.frames[0].update();
			const content = container.querySelector<HTMLElement>('#late-content')!;
			expect(content.closest('[hidden]')).toBeNull();
			expect(content.style.viewTransitionClass).toBe('late-enter');
			native.frames[0].ready();
			native.frames[0].finish();
			await Promise.resolve();
		} finally {
			native.restore();
		}
	});

	it('animates sequential streamed reveals on callback-only native implementations', async () => {
		const native = mockNativeTransitions();
		const start = document.startViewTransition;
		(document as any).startViewTransition = function (update: unknown) {
			if (typeof update !== 'function') throw new TypeError('Expected an update callback');
			return start.call(this, { update: update as () => void });
		};
		try {
			for (const id of ['legacy-first', 'legacy-second']) {
				const value = deferred<string>();
				const chunks = collector();
				ServerRT.renderToPipeableStream(server.StreamTextApp, { promise: value.promise, id }).pipe(
					chunks.dest,
				);
				value.resolve(id);
				await chunks.ended;
				const host = document.createElement('div');
				host.innerHTML = chunks.chunks.join('');
				container.appendChild(host);
				activate(host);
				await Promise.resolve();
				expect(host.querySelector('p')!.style.viewTransitionName).not.toBe('');
				expect(native.frames.length).toBeGreaterThan(0);
				native.frames.at(-1)!.skip();
				await Promise.resolve();
				expect(host.querySelector('#' + id)!.textContent).toBe(id);
			}
		} finally {
			native.restore();
		}
	});

	it.each(['Error', 'TypeError', 'AbortError', 'InvalidStateError'])(
		'commits a streamed reveal and reports only actionable native start failures (%s)',
		async (name) => {
			const native = mockNativeTransitions();
			const error =
				name === 'TypeError'
					? new TypeError('Failed callback overload')
					: new DOMException('Native start failed', name);
			(document as any).startViewTransition = () => {
				throw error;
			};
			try {
				const value = deferred<string>();
				const chunks = collector();
				ServerRT.renderToPipeableStream(server.StreamTextApp, {
					promise: value.promise,
					id: 'failed-native',
				}).pipe(chunks.dest);
				value.resolve('Content');
				await chunks.ended;
				container.innerHTML = chunks.chunks.join('');
				activate(container);
				await Promise.resolve();
				expect(container.querySelector('#failed-native')!.textContent).toBe('Content');
				expect(container.querySelector('p')).toBeNull();
				if (name === 'AbortError' || name === 'InvalidStateError')
					expect(errorSpy).not.toHaveBeenCalled();
				else expect(errorSpy).toHaveBeenCalledWith(error);
			} finally {
				errorSpy.mockClear();
				native.restore();
			}
		},
	);

	it('reveals content and restores authored styles when native capture fails', async () => {
		const native = mockNativeTransitions();
		(document as any).startViewTransition = () => {
			throw new Error('Capture unavailable');
		};
		try {
			const d = deferred<string>();
			const c = collector();
			ServerRT.renderToPipeableStream(server.StreamTextApp, {
				promise: d.promise,
				id: 'styled',
				styled: true,
			}).pipe(c.dest);
			d.resolve('Content');
			await c.ended;
			container.innerHTML = c.chunks.join('');
			activate(container);
			await Promise.resolve();
			const el = container.querySelector<HTMLElement>('#styled')!;
			expect(el.textContent).toBe('Content');
			expect(el.style.viewTransitionName).toBe('authored');
			expect(el.style.viewTransitionClass).toBe('authored-class');
			expect(el.style.color).toBe('red');
			expect(container.querySelector('p')).toBeNull();
			expect(errorSpy).toHaveBeenCalledWith(
				expect.objectContaining({ message: 'Capture unavailable' }),
			);
		} finally {
			errorSpy.mockClear();
			native.restore();
		}
	});

	it('preserves author changes to animation classes while restoring temporary names', async () => {
		const native = mockNativeTransitions();
		try {
			const d = deferred<string>();
			const c = collector();
			ServerRT.renderToPipeableStream(server.StreamTextApp, {
				promise: d.promise,
				id: 'styled',
				styled: true,
			}).pipe(c.dest);
			d.resolve('Content');
			await c.ended;
			container.innerHTML = c.chunks.join('');
			activate(container);
			await Promise.resolve();
			native.frames[0].update();
			const el = container.querySelector<HTMLElement>('#styled')!;
			el.style.setProperty('view-transition-class', 'consumer-change', 'important');
			native.frames[0].ready();
			await Promise.resolve();
			expect(el.style.viewTransitionName).toBe('authored');
			expect(el.style.viewTransitionClass).toBe('consumer-change');
			expect(el.style.getPropertyPriority('view-transition-class')).toBe('important');
			native.frames[0].finish();
			await Promise.resolve();
		} finally {
			native.restore();
		}
	});

	it('waits for visible eager images and fonts before finishing the reveal update', async () => {
		const native = mockNativeTransitions();
		const font = deferred<void>();
		const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
		Object.defineProperty(document, 'fonts', {
			configurable: true,
			value: { status: 'loading', ready: font.promise },
		});
		const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false);
		try {
			const d = deferred<string>();
			const c = collector();
			ServerRT.renderToPipeableStream(server.StreamResourceApp, { promise: d.promise }).pipe(
				c.dest,
			);
			d.resolve('Content');
			await c.ended;
			container.innerHTML = c.chunks.join('');
			activate(container);
			await Promise.resolve();
			let settled = false;
			const updating = Promise.resolve(native.frames[0].update()).then(() => {
				settled = true;
			});
			await Promise.resolve();
			expect(settled).toBe(false);
			font.resolve();
			await Promise.resolve();
			expect(settled).toBe(false);
			container.querySelector('#stream-eager')!.dispatchEvent(new Event('load'));
			await updating;
			expect(settled).toBe(true);
			native.frames[0].ready();
			native.frames[0].finish();
			await Promise.resolve();
		} finally {
			complete.mockRestore();
			if (previousFonts) Object.defineProperty(document, 'fonts', previousFonts);
			else delete (document as any).fonts;
			native.restore();
		}
	});

	it.each(['error', 'timeout'] as const)(
		'releases a stalled reveal on image %s',
		async (outcome) => {
			const native = mockNativeTransitions();
			const complete = vi
				.spyOn(HTMLImageElement.prototype, 'complete', 'get')
				.mockReturnValue(false);
			try {
				const d = deferred<string>();
				const c = collector();
				ServerRT.renderToPipeableStream(server.StreamResourceApp, { promise: d.promise }).pipe(
					c.dest,
				);
				d.resolve('Content');
				await c.ended;
				vi.useFakeTimers();
				container.innerHTML = c.chunks.join('');
				activate(container);
				await Promise.resolve();
				const image = container.querySelector<HTMLImageElement>('#stream-eager')!;
				const remove = vi.spyOn(image, 'removeEventListener');
				let settled = false;
				const updating = Promise.resolve(native.frames[0].update()).then(() => {
					settled = true;
				});
				await Promise.resolve();
				expect(settled).toBe(false);
				if (outcome === 'error') image.dispatchEvent(new Event('error'));
				else {
					await vi.advanceTimersByTimeAsync(499);
					expect(settled).toBe(false);
					await vi.advanceTimersByTimeAsync(1);
				}
				await updating;
				expect(settled).toBe(true);
				expect(remove.mock.calls.map((call) => call[0])).toEqual(['load', 'error']);
				native.frames[0].ready();
				native.frames[0].finish();
				await Promise.resolve();
			} finally {
				vi.useRealTimers();
				complete.mockRestore();
				native.restore();
			}
		},
	);
});
