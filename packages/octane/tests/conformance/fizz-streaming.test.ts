import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { flushSync, hydrateRoot } from '../../src/index.js';
import { loadServerFixture } from '../_server-fixture.js';
import { mount } from '../_helpers.js';
import {
	activateStreamedMarkup,
	collectPipeableStream,
	collectReadableStream,
	createPipeableCollector,
	deferred,
	resetStreamRuntimeGlobals,
} from '../_server-stream.js';
import * as client from './_fixtures/fizz-streaming.tsrx';

const FIXTURE = 'packages/octane/tests/conformance/_fixtures/fizz-streaming.tsrx';
const server = loadServerFixture(FIXTURE);

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const MATHML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';

function startPipeable(component: any, props?: any, options?: ServerRuntime.StreamOptions) {
	const collector = createPipeableCollector();
	const stream = ServerRuntime.renderToPipeableStream(component, props, options);
	stream.pipe(collector.destination);
	return { ...stream, collector };
}

function activate(
	html: string,
	options?: Parameters<typeof activateStreamedMarkup>[1],
): HTMLDivElement {
	const container = document.createElement('div');
	container.dataset.fizzTestRoot = '';
	document.body.appendChild(container);
	container.innerHTML = html;
	activateStreamedMarkup(container, options);
	return container;
}

afterEach(() => {
	resetStreamRuntimeGlobals();
	document.querySelectorAll('[data-fizz-test-root]').forEach((node) => node.remove());
});

describe('conformance: Fizz public streaming behavior', () => {
	// Per ReactDOMFizzServerNode-test.js:71/:82/:90 and
	// ReactDOMFizzServerBrowser-test.js:57.
	it('renders through both public stream transports and fires pipeable readiness callbacks once', async () => {
		const pipeEvents: string[] = [];
		const pipeable = await collectPipeableStream(
			server.TextPayload,
			{ text: 'hello world' },
			{
				onShellReady: () => pipeEvents.push('shell'),
				onAllReady: () => pipeEvents.push('all'),
			},
		);
		expect(pipeable.html).toContain('<div id="payload">hello world</div>');
		expect(pipeable.errors).toEqual([]);
		expect(pipeEvents).toEqual(['shell', 'all']);

		const readable = await collectReadableStream(server.TextPayload, { text: 'hello world' });
		expect(readable.html).toContain('<div id="payload">hello world</div>');
		expect(readable.errors).toEqual([]);
	});

	// Per ReactDOMFizzServerNode-test.js:90.
	it('allows pipe() to be called from onShellReady after the stream handle is returned', async () => {
		const collector = createPipeableCollector();
		let stream!: ReturnType<typeof ServerRuntime.renderToPipeableStream>;
		let returned = false;
		let callbackRanBeforeReturn = false;
		stream = ServerRuntime.renderToPipeableStream(
			server.TextPayload,
			{ text: 'shell ready' },
			{
				onShellReady() {
					if (!returned) {
						callbackRanBeforeReturn = true;
						return;
					}
					stream.pipe(collector.destination);
				},
			},
		);
		returned = true;
		// Drain even on failure so the test cannot strand the renderer.
		if (callbackRanBeforeReturn) stream.pipe(collector.destination);

		expect(await collector.ended).toContain('<div id="payload">shell ready</div>');
		expect(callbackRanBeforeReturn).toBe(false);
	});

	// Per ReactDOMFizzServerBrowser-test.js:135 and
	// ReactDOMFizzServerNode-test.js:210.
	it('reports a root failure through the shell callbacks and rejects a readable stream', async () => {
		const pipeError = new Error('root failed');
		const onPipeError = vi.fn();
		const onShellError = vi.fn();
		const pipeable = startPipeable(
			server.RootError,
			{ error: pipeError },
			{
				onError: onPipeError,
				onShellError,
			},
		);
		expect(await pipeable.collector.ended).toBe('');
		expect(onPipeError).toHaveBeenCalledOnce();
		expect(onPipeError).toHaveBeenCalledWith(pipeError);
		expect(onShellError).toHaveBeenCalledOnce();
		expect(onShellError).toHaveBeenCalledWith(pipeError);

		const readableError = new Error('readable root failed');
		const onReadableError = vi.fn();
		await expect(
			ServerRuntime.renderToReadableStream(
				server.RootError,
				{ error: readableError },
				{ onError: onReadableError },
			),
		).rejects.toBe(readableError);
		expect(onReadableError).toHaveBeenCalledOnce();
		expect(onReadableError).toHaveBeenCalledWith(readableError);
	});

	// Per ReactDOMFizzServer-test.js:3397/:3482,
	// ReactDOMFizzServerBrowser-test.js:432/:471, and
	// ReactDOMFizzServerNode-test.js:328.
	it('surfaces caller-provided string and Error abort reasons and closes the stream', async () => {
		for (const reason of ['request closed', new Error('request closed')]) {
			const pending = deferred<string>();
			const onError = vi.fn();
			const onAllReady = vi.fn();
			const stream = startPipeable(
				server.PendingBoundary,
				{ promise: pending.promise },
				{ onError, onAllReady },
			);
			expect(stream.collector.chunks.join('')).toContain('pending-fallback');

			stream.abort(reason);
			const html = await stream.collector.ended;
			expect(html).toContain('pending-fallback');
			expect(onError).toHaveBeenCalledOnce();
			expect(onError).toHaveBeenCalledWith(reason);
			expect(onAllReady).toHaveBeenCalledOnce();
		}
	});

	// Per ReactDOMFizzServerBrowser-test.js:384 and
	// ReactDOMFizzServerNode-test.js:690.
	it('round-trips a large multibyte payload without truncation or null bytes', async () => {
		const text = ('Latin-α-漢字-🙂|' as string).repeat(16_384);
		const [pipeable, readable] = await Promise.all([
			collectPipeableStream(server.TextPayload, { text }),
			collectReadableStream(server.TextPayload, { text }),
		]);
		for (const result of [pipeable, readable]) {
			expect(result.html).not.toContain('\0');
			const template = document.createElement('template');
			template.innerHTML = result.html;
			expect(template.content.querySelector('#payload')?.textContent).toBe(text);
		}
	});

	// Per ReactDOMFizzServerNode-test.js:453/:505/:582 and
	// ReactDOMFizzServer-test.js:2010.
	it('restores each Provider value across suspended concurrent streams', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const a = startPipeable(server.ContextBoundary, {
			context: 'A',
			promise: first.promise,
		});
		const b = startPipeable(server.ContextBoundary, {
			context: 'B',
			promise: second.promise,
		});

		second.resolve('second');
		first.resolve('first');
		const [aHtml, bHtml] = await Promise.all([a.collector.ended, b.collector.ended]);
		const aContainer = activate(aHtml);
		const bContainer = activate(bHtml);
		try {
			expect(aContainer.querySelector('.context-value')?.textContent).toBe('A:first');
			expect(bContainer.querySelector('.context-value')?.textContent).toBe('B:second');
			expect(aContainer.querySelector('.context-after-provider')?.textContent).toBe('default');
			expect(bContainer.querySelector('.context-after-provider')?.textContent).toBe('default');
		} finally {
			aContainer.remove();
			bContainer.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:2296.
	it('uses getServerSnapshot during both stream transports', async () => {
		const getClientSnapshot = vi.fn(() => 'client');
		const getServerSnapshot = vi.fn(() => 'server');
		const props = {
			subscribe: () => () => {},
			getClientSnapshot,
			getServerSnapshot,
		};
		const [pipeable, readable] = await Promise.all([
			collectPipeableStream(server.ExternalStoreReader, props),
			collectReadableStream(server.ExternalStoreReader, props),
		]);
		expect(pipeable.html).toContain('<span id="store-value">server</span>');
		expect(readable.html).toContain('<span id="store-value">server</span>');
		expect(getServerSnapshot).toHaveBeenCalled();
		expect(getClientSnapshot).not.toHaveBeenCalled();
	});

	// Per ReactDOMFizzServer-test.js:409.
	it('streams a lazy component after its module resolves', async () => {
		for (const collect of [collectPipeableStream, collectReadableStream]) {
			const result = await collect(server.LazyBoundary);
			const container = activate(result.html);
			try {
				expect(container.querySelector('.lazy-value')?.textContent).toBe('lazy ready');
				expect(container.querySelector('.lazy-fallback')).toBeNull();
			} finally {
				container.remove();
			}
		}
	});

	// Per ReactDOMFizzServer-test.js:6295.
	it('unwraps a Promise Usable rendered directly as a node', async () => {
		const promise = await collectPipeableStream(server.PromiseNode, {
			promise: Promise.resolve('promise value'),
		});
		const container = activate(promise.html);
		const element = container.querySelector('#promise-node');
		const textNode = Array.from(element?.childNodes ?? []).find((node) => node.nodeType === 3);
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.PromiseNode, {
			promise: Promise.resolve('different client value'),
		});
		try {
			flushSync(() => {});
			expect(container.querySelector('#promise-node')).toBe(element);
			expect(Array.from(element?.childNodes ?? []).find((node) => node.nodeType === 3)).toBe(
				textNode,
			);
			expect(element?.textContent).toBe('promise value');
			expect(diagnostic).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	// Combines ReactDOMFizzServer-test.js:6295's Promise-as-node behavior with
	// progressive boundary delivery: work that finishes while the bare Promise
	// delays the shell must still be visible once the shell is released.
	it('delivers a boundary that resolves while a bare Promise delays the shell', async () => {
		const boundary = deferred<string>();
		const root = deferred<string>();
		const stream = startPipeable(server.BoundaryBeforePromiseNode, {
			boundaryPromise: boundary.promise,
			rootPromise: root.promise,
		});
		boundary.resolve('boundary ready');
		await boundary.promise;
		await Promise.resolve();
		root.resolve('root ready');

		const container = activate(await stream.collector.ended);
		try {
			expect(container.querySelector('#mixed-boundary-value')?.textContent).toBe('boundary ready');
			expect(container.querySelector('#mixed-boundary-fallback')).toBeNull();
			expect(container.querySelector('#mixed-root-value')?.textContent).toBe('root ready');
		} finally {
			container.remove();
		}
	});

	// Extends ReactDOMFizzServer-test.js:6295's Promise-as-node behavior. Work
	// discovered before a root-blocking Usable must not flush unless its boundary
	// is still present in the shell that is ultimately published.
	it('omits boundaries removed while a bare Promise delays the shell', async () => {
		for (const completeBeforeRemoval of [false, true]) {
			const boundary = deferred<string>();
			const root = deferred<string>();
			const firstVisibilityRead = deferred<void>();
			const secondVisibilityRead = deferred<void>();
			let visibilityReads = 0;
			let boundaryVisible = true;
			const onError = vi.fn();
			const onAllReady = vi.fn();
			const stream = startPipeable(
				server.BoundaryRemovedBeforeRootRetry,
				{
					boundaryPromise: boundary.promise,
					rootPromise: root.promise,
					readBoundaryVisibility() {
						visibilityReads++;
						if (visibilityReads === 1) firstVisibilityRead.resolve();
						if (visibilityReads === 2) secondVisibilityRead.resolve();
						return boundaryVisible;
					},
				},
				{ onError, onAllReady },
			);

			await firstVisibilityRead.promise;
			if (completeBeforeRemoval) {
				boundary.resolve('stale content');
				await secondVisibilityRead.promise;
			}
			boundaryVisible = false;
			root.resolve('root ready');

			const html = await stream.collector.ended;
			expect(onError).not.toHaveBeenCalled();
			expect(onAllReady).toHaveBeenCalledOnce();
			expect(html).not.toContain('stale fallback');
			expect(html).not.toContain('stale content');
			const container = activate(html);
			try {
				expect(container.querySelector('#conditional-root-value')?.textContent).toBe('root ready');
				expect(container.querySelector('.conditional-boundary-fallback')).toBeNull();
				expect(container.querySelector('.conditional-boundary-value')).toBeNull();
			} finally {
				container.remove();
			}
		}
	});

	// Per ReactDOMFizzServer-test.js:6313.
	it('unwraps a Context Usable rendered directly as a node', async () => {
		const context = await collectPipeableStream(server.ContextNode);
		const container = activate(context.html);
		try {
			expect(container.querySelector('#context-node')?.textContent).toBe('provided');
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:6322.
	it('recursively unwraps a Promise that resolves to a Context Usable', async () => {
		const recursive = await collectPipeableStream(server.RecursiveUsableNode, {
			promise: Promise.resolve(server.StreamContext),
		});
		const container = activate(recursive.html);
		try {
			expect(container.querySelector('#recursive-usable-node')?.textContent).toBe(
				'recursive provided',
			);
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:1714.
	it('reveals streamed table content in its required parser context', async () => {
		const value = deferred<string>();
		const stream = startPipeable(server.TableBoundary, { promise: value.promise });
		expect(stream.collector.chunks.join('')).toContain('table-fallback');
		value.resolve('cell ready');
		const container = activate(await stream.collector.ended);
		try {
			expect(container.querySelector('.table-fallback')).toBeNull();
			expect(container.querySelector('.table-ready td')?.textContent).toBe('cell ready');
			expect(container.querySelector('.table-ready')?.parentElement?.localName).toBe('table');
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:1786.
	it('preserves the SVG namespace when a streamed segment is revealed', async () => {
		const value = deferred<string>();
		const stream = startPipeable(server.SvgBoundary, { promise: value.promise });
		value.resolve('stream-path');
		const container = activate(await stream.collector.ended);
		try {
			const path = container.querySelector('#stream-path');
			expect(path).not.toBeNull();
			expect(path?.namespaceURI).toBe(SVG_NAMESPACE);
			expect(path?.parentElement?.localName).toBe('g');
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:1722, "can stream into an SVG container".
	it('preserves the SVG namespace through a JSX Suspense boundary', async () => {
		const value = deferred<string>();
		const stream = startPipeable(server.JsxSvgSuspense, { promise: value.promise });
		value.resolve('jsx-svg-path');
		const container = activate(await stream.collector.ended);
		try {
			const path = container.querySelector('#jsx-svg-path');
			expect(path?.namespaceURI).toBe(SVG_NAMESPACE);
			expect(container.querySelector('#jsx-svg-fallback')).toBeNull();
		} finally {
			container.remove();
		}

		const htmlValue = deferred<string>();
		const htmlStream = startPipeable(server.JsxForeignObjectSuspense, {
			promise: htmlValue.promise,
		});
		htmlValue.resolve('jsx-html-content');
		const htmlContainer = activate(await htmlStream.collector.ended);
		try {
			const content = htmlContainer.querySelector('#jsx-html-content');
			expect(content?.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
			expect(htmlContainer.querySelector('#jsx-html-fallback')).toBeNull();
		} finally {
			htmlContainer.remove();
		}

		const first = deferred<string>();
		const second = deferred<string>();
		const dynamicStream = startPipeable(server.DynamicSvgHostBoundaries, {
			tag: 'g',
			a: first.promise,
			b: second.promise,
		});
		first.resolve('dynamic-svg-first');
		second.resolve('dynamic-svg-second');
		const dynamicContainer = activate(await dynamicStream.collector.ended);
		try {
			expect(dynamicContainer.querySelector('#dynamic-svg-first')?.namespaceURI).toBe(
				SVG_NAMESPACE,
			);
			expect(dynamicContainer.querySelector('#dynamic-svg-second')?.namespaceURI).toBe(
				SVG_NAMESPACE,
			);
		} finally {
			dynamicContainer.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:1786. The namespace carrier used for a
	// boundary nested inside SVG must not be confused with a real SVG root that
	// is the content of an ordinary HTML boundary.
	it('keeps a real SVG root inside an HTML streaming boundary', async () => {
		const value = deferred<string>();
		const stream = startPipeable(server.HtmlSvgBoundary, { promise: value.promise });
		value.resolve('html-svg-root');
		const container = activate(await stream.collector.ended);
		try {
			const svg = container.querySelector('#html-svg-root');
			const circle = container.querySelector('#html-svg-circle');
			expect(svg?.localName).toBe('svg');
			expect(svg?.namespaceURI).toBe(SVG_NAMESPACE);
			expect(circle?.parentElement).toBe(svg);
			expect(circle?.namespaceURI).toBe(SVG_NAMESPACE);
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:1617.
	it('reveals option, col, and MathML segments in their native contexts', async () => {
		const option = deferred<string>();
		const column = deferred<string>();
		const math = deferred<string>();
		const stream = startPipeable(server.EsotericBoundary, {
			option: option.promise,
			column: column.promise,
			math: math.promise,
		});
		option.resolve('ready option');
		column.resolve('ready-column');
		math.resolve('ready-math');
		const container = activate(await stream.collector.ended);
		try {
			expect(container.querySelector('select option')?.textContent).toBe('ready option');
			expect(container.querySelector('table col')?.getAttribute('class')).toBe('ready-column');
			const mi = container.querySelector('#ready-math');
			expect(mi?.namespaceURI).toBe(MATHML_NAMESPACE);
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:5392/:5451/:5503/:5555/:5595/:5633.
	it('keeps adjacent streamed text distinct and hydrates the revealed DOM in place', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const stream = startPipeable(server.AdjacentTextBoundary, {
			first: first.promise,
			second: second.promise,
		});
		second.resolve('SECOND');
		await Promise.resolve();
		first.resolve('FIRST');
		const container = activate(await stream.collector.ended);
		const before = container.querySelector('#adjacent-text');
		expect(before?.textContent).toBe('start:FIRST|middle|SECOND:end');

		const pendingFirst = new Promise<string>(() => {});
		const pendingSecond = new Promise<string>(() => {});
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.AdjacentTextBoundary, {
			first: pendingFirst,
			second: pendingSecond,
		});
		try {
			flushSync(() => {});
			expect(container.querySelector('#adjacent-text')).toBe(before);
			expect(before?.textContent).toBe('start:FIRST|middle|SECOND:end');
			expect(diagnostic).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			diagnostic.mockRestore();
		}
	});

	// Per ReactDOMFizzServer-test.js:5503.
	it('preserves adjacent text when one segment resolves before pipe and another patches later', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		let signalFirstRender!: () => void;
		const firstRendered = new Promise<void>((resolve) => {
			signalFirstRender = resolve;
		});
		const onFirstRendered = vi.fn(signalFirstRender);
		const stream = ServerRuntime.renderToPipeableStream(server.AdjacentTextBoundary, {
			first: first.promise,
			second: second.promise,
			onFirstRendered,
		});
		first.resolve('FIRST');
		await firstRendered;

		const collector = createPipeableCollector();
		stream.pipe(collector.destination);
		expect(onFirstRendered).toHaveBeenCalled();
		expect(collector.chunks.join('')).toContain('FIRST');
		expect(collector.chunks.join('')).not.toContain('SECOND');

		second.resolve('SECOND');
		const container = activate(await collector.ended);
		try {
			expect(container.querySelector('#adjacent-text')?.textContent).toBe(
				'start:FIRST|middle|SECOND:end',
			);
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:5555/:5595.
	it('reveals text after an element and an element after text without visible separators', async () => {
		const text = deferred<string>();
		const textStream = startPipeable(server.TextAfterElementBoundary, { promise: text.promise });
		text.resolve('world');
		const textContainer = activate(await textStream.collector.ended);
		try {
			const parent = textContainer.querySelector('#text-after-element')!;
			expect(parent.textContent).toBe('helloworld');
			expect(parent.querySelector('b')?.textContent).toBe('hello');
		} finally {
			textContainer.remove();
		}

		const element = deferred<string>();
		const elementStream = startPipeable(server.ElementAfterTextBoundary, {
			promise: element.promise,
		});
		element.resolve('world');
		const elementContainer = activate(await elementStream.collector.ended);
		try {
			const parent = elementContainer.querySelector('#element-after-text')!;
			expect(parent.textContent).toBe('helloworld');
			expect(parent.querySelector('b')?.textContent).toBe('world');
		} finally {
			elementContainer.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:5788/:5815/:5842/:5869.
	it('serializes supported string, number, bigint, and single-array title children', async () => {
		for (const [value, expected] of [
			['title string', 'title string'],
			[42, '42'],
			[42n, '42'],
			[['array title'], 'array title'],
		] as const) {
			const result = await collectPipeableStream(server.TitleValue, { value });
			const template = document.createElement('template');
			template.innerHTML = result.html;
			expect(template.content.querySelector('title')?.textContent).toBe(expected);
			expect(template.content.querySelector('#title-body')?.textContent).toBe('body');
		}
	});

	// Adapted from ReactDOMFizzServer-test.js:4422/:6604. TSRX intentionally
	// treats a <script> body as an embedded raw JS document, so a dynamic source
	// uses dangerouslySetInnerHTML instead of a JSX child expression.
	it('keeps dynamic inline script text safe on the client and executable through buffered and streaming SSR', async () => {
		const source = `
			<!-- comment </script><script>window.__octaneFizzInlineScript = 'pwned'</script><script>
			window.__octaneFizzInlineScript = 'safe';
			--> </Script><Script>window.__octaneFizzInlineScript = 'pwned after'</Script>
		`;

		const mounted = mount(client.InlineScript, { source });
		try {
			expect(mounted.findAll('script')).toHaveLength(1);
			expect(mounted.find('script').textContent).toBe(source);
		} finally {
			mounted.unmount();
		}

		const buffered = ServerRuntime.renderToString(server.InlineScript, { source }).html;
		const streamed = (await collectPipeableStream(server.InlineScript, { source })).html;
		for (const html of [buffered, streamed]) {
			(window as any).__octaneFizzInlineScript = '';
			const container = activate(html, { removeScripts: false });
			try {
				expect(container.querySelectorAll('script')).toHaveLength(1);
				expect((window as any).__octaneFizzInlineScript).toBe('safe');
			} finally {
				container.remove();
			}
		}

		const UppercaseDescriptor = () =>
			ServerRuntime.createElement('SCRIPT', {
				dangerouslySetInnerHTML: { __html: source },
			});
		(window as any).__octaneFizzInlineScript = '';
		const uppercase = activate(ServerRuntime.renderToString(UppercaseDescriptor).html, {
			removeScripts: false,
		});
		try {
			expect(uppercase.querySelectorAll('script')).toHaveLength(1);
			expect((window as any).__octaneFizzInlineScript).toBe('safe');
		} finally {
			uppercase.remove();
		}

		const UppercaseTextarea = () =>
			ServerRuntime.createElement('TEXTAREA', { value: 'uppercase value' });
		const UppercaseBreak = () => ServerRuntime.createElement('BR', null);
		const UppercaseObject = () =>
			ServerRuntime.createElement('OBJECT', { data: 'javascript:uppercase-not-safe' });
		const uppercaseHosts = activate(
			ServerRuntime.renderToString(() => [
				ServerRuntime.createElement(UppercaseTextarea, null),
				ServerRuntime.createElement(UppercaseBreak, null),
				ServerRuntime.createElement(UppercaseObject, null),
			]).html,
		);
		try {
			const textarea = uppercaseHosts.querySelector('textarea') as HTMLTextAreaElement;
			expect(textarea.value).toBe('uppercase value');
			expect(uppercaseHosts.querySelectorAll('br')).toHaveLength(1);
			expect(uppercaseHosts.querySelector('object')?.getAttribute('data')).not.toBe(
				'javascript:uppercase-not-safe',
			);
		} finally {
			uppercaseHosts.remove();
		}

		const raw = deferred<string>();
		const rawStream = startPipeable(server.RawTemplateBoundary, { promise: raw.promise });
		raw.resolve('</template><span id="kept-template-content">kept</span>');
		const rawContainer = activate(await rawStream.collector.ended);
		try {
			expect(rawContainer.querySelector('#raw-template-loading')).toBeNull();
			expect(
				rawContainer.querySelector('#raw-template-content #kept-template-content')?.textContent,
			).toBe('kept');
		} finally {
			rawContainer.remove();
		}
		delete (window as any).__octaneFizzInlineScript;
	});

	// Per ReactDOMFizzServer-test.js:8734.
	it('renders a component tree one thousand levels deep', async () => {
		const result = await collectPipeableStream(server.DeepTree, { depth: 1_000 });
		expect(result.errors).toEqual([]);
		expect(result.html).toContain('<span id="deep-leaf">done</span>');
	});

	// Per ReactDOMServerIntegrationHooks-test.js:122, a state updater invoked
	// outside its owning component's current render is inert on the server.
	it('keeps a parent render-phase dispatcher isolated from a call-free child getter', async () => {
		const result = await collectPipeableStream(server.DescendantGetterUpdate);
		const container = activate(result.html);
		try {
			expect(container.querySelector('#getter-parent-count')?.textContent).toBe('Count: 0');
			expect(container.querySelector('#getter-value')?.textContent).toBe('child');
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMServerIntegrationHooks-test.js:158, render-phase hook updates
	// replay even when user code is reached through property access.
	it('replays a render-time hook invoked by a component property getter', async () => {
		const result = await collectPipeableStream(server.GetterHookReplay);
		const container = activate(result.html);
		try {
			expect(container.querySelector('#getter-hook-value')?.textContent).toBe('Value: 1');
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMServerIntegrationHooks-test.js:158, a component replays its own
	// render-phase updates until they converge.
	it('replays a render-time hook call in a component default parameter', async () => {
		const result = await collectPipeableStream(server.DefaultParameterReplay);
		const container = activate(result.html);
		try {
			expect(container.querySelector('#default-parameter-value')?.textContent).toBe('Value: 1');
		} finally {
			container.remove();
		}
	});
});
