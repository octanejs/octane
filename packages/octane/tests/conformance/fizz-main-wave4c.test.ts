import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { createElement, flushSync, hydrateRoot } from '../../src/index.js';
import { loadServerFixture } from '../_server-fixture.js';
import {
	activateStreamedMarkup,
	collectPipeableStream,
	createPipeableCollector,
	deferred,
	resetStreamRuntimeGlobals,
} from '../_server-stream.js';
import * as client from './_fixtures/fizz-main-wave4c.tsrx';

const FIXTURE = 'packages/octane/tests/conformance/_fixtures/fizz-main-wave4c.tsrx';
const server = loadServerFixture(FIXTURE);

function activate(html: string): HTMLDivElement {
	const container = document.createElement('div');
	container.dataset.fizzMainWave4c = '';
	document.body.appendChild(container);
	container.innerHTML = html;
	activateStreamedMarkup(container);
	return container;
}

function parse(html: string): DocumentFragment {
	const template = document.createElement('template');
	template.innerHTML = html;
	return template.content;
}

function oneShotIterator<T>(values: T[]): IterableIterator<T> {
	let index = 0;
	const iterator: IterableIterator<T> = {
		[Symbol.iterator]() {
			return iterator;
		},
		next() {
			if (index < values.length) return { done: false, value: values[index++] };
			return { done: true, value: undefined };
		},
	};
	return iterator;
}

afterEach(() => {
	resetStreamRuntimeGlobals();
	document.querySelectorAll('[data-fizz-main-wave4c]').forEach((node) => node.remove());
});

describe('conformance: ReactDOMFizzServer public outcomes — Wave 4C', () => {
	// Per ReactDOMFizzServer-test.js:6454.
	it('unwraps a thenable that fulfills synchronously without publishing a fallback', async () => {
		let subscriptions = 0;
		const thenable = {
			then(resolve: (value: string) => void, reject: (reason: unknown) => void) {
				subscriptions++;
				resolve('Hi');
				// A malformed thenable may invoke both continuations. Promise/React
				// semantics retain the first settlement rather than letting this flip
				// the already-fulfilled record to rejected.
				reject(new Error('late rejection must be ignored'));
			},
		};
		const result = await collectPipeableStream(server.SyncThenableBoundary, { thenable });
		const shell = parse(result.html);

		expect(result.errors).toEqual([]);
		expect(shell.querySelector('#sync-thenable-value')?.textContent).toBe('Hi');
		expect(shell.querySelector('#sync-thenable-fallback')).toBeNull();
		expect(subscriptions).toBe(1);
	});

	// Per ReactDOMFizzServer-test.js:6269 and ReactFizzThenable.js:81-106.
	it('instruments an untracked pending thenable exactly once in a buffered pass', () => {
		let subscriptions = 0;
		const thenable = {
			then() {
				subscriptions++;
			},
		};
		const result = ServerRuntime.renderToString(server.SyncThenableBoundary, { thenable });

		expect(result.html).toContain('sync-thenable-fallback');
		expect(result.html).not.toContain('sync-thenable-value');
		// The subscription instruments status/value. Because buffered rendering
		// has no stream wake-up, any second call would be the erroneous status probe.
		expect(subscriptions).toBe(1);
	});

	// Per ReactDOMFizzServer-test.js:3303.
	it('streams synchronous iterable children and hydrates their host nodes in place', async () => {
		const serverItems = new Set([
			ServerRuntime.createElement('li', { id: 'iterable-first', key: 'first' }, 'first'),
			ServerRuntime.createElement('li', { id: 'iterable-second', key: 'second' }, 'second'),
		]);
		const result = await collectPipeableStream(server.IterableChildren, { items: serverItems });
		const container = activate(result.html);
		const first = container.querySelector('#iterable-first');
		const second = container.querySelector('#iterable-second');
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const clientItems = new Set([
			createElement('li', { id: 'iterable-first', key: 'first' }, 'first'),
			createElement('li', { id: 'iterable-second', key: 'second' }, 'second'),
		]);
		const root = hydrateRoot(container, client.IterableChildren, { items: clientItems });
		try {
			flushSync(() => {});
			expect(container.querySelector('#iterable-first')).toBe(first);
			expect(container.querySelector('#iterable-second')).toBe(second);
			expect(container.querySelector('#iterable-children')?.textContent).toBe('firstsecond');
			expect(diagnostic).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:3303 — public descriptor adaptation.
	it('streams iterable children nested in a public host descriptor and hydrates them in place', async () => {
		function ServerTree() {
			return ServerRuntime.createElement(
				'ul',
				{ id: 'descriptor-iterable' },
				new Set([
					ServerRuntime.createElement(
						'li',
						{ id: 'descriptor-iterable-first', key: 'first' },
						'first',
					),
					ServerRuntime.createElement(
						'li',
						{ id: 'descriptor-iterable-second', key: 'second' },
						'second',
					),
				]),
			);
		}
		const result = await collectPipeableStream(ServerTree);
		const container = activate(result.html);
		const first = container.querySelector('#descriptor-iterable-first');
		const second = container.querySelector('#descriptor-iterable-second');
		function ClientTree() {
			return createElement(
				'ul',
				{ id: 'descriptor-iterable' },
				new Set([
					createElement('li', { id: 'descriptor-iterable-first', key: 'first' }, 'first'),
					createElement('li', { id: 'descriptor-iterable-second', key: 'second' }, 'second'),
				]),
			);
		}
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, ClientTree);
		try {
			flushSync(() => {});
			expect(container.querySelector('#descriptor-iterable')?.textContent).toBe('firstsecond');
			expect(container.querySelector('#descriptor-iterable-first')).toBe(first);
			expect(container.querySelector('#descriptor-iterable-second')).toBe(second);
			expect(diagnostic).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	it('keeps pure descriptor arrays marker-free inside host content and hydrates them in place', () => {
		function ServerTree() {
			return ServerRuntime.createElement('p', { id: 'pure-descriptor-array' }, [
				ServerRuntime.createElement('strong', { id: 'pure-descriptor-strong', key: 'strong' }, [
					'Ada',
				]),
				ServerRuntime.createElement(
					'svg',
					{ key: 'svg' },
					ServerRuntime.createElement('text', null, [
						ServerRuntime.createElement(
							'tspan',
							{ id: 'pure-descriptor-tspan', key: 'tspan' },
							'label',
						),
					]),
				),
			]);
		}
		const result = ServerRuntime.renderToString(ServerTree);
		expect(result.html).toContain('<strong id="pure-descriptor-strong">Ada</strong>');
		expect(result.html).toContain('<text><tspan id="pure-descriptor-tspan">label</tspan></text>');

		const container = activate(result.html);
		const strong = container.querySelector('#pure-descriptor-strong');
		const tspan = container.querySelector('#pure-descriptor-tspan');
		function ClientTree() {
			return createElement('p', { id: 'pure-descriptor-array' }, [
				createElement('strong', { id: 'pure-descriptor-strong', key: 'strong' }, ['Ada']),
				createElement(
					'svg',
					{ key: 'svg' },
					createElement('text', null, [
						createElement('tspan', { id: 'pure-descriptor-tspan', key: 'tspan' }, 'label'),
					]),
				),
			]);
		}
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, ClientTree);
		try {
			flushSync(() => {});
			expect(container.querySelector('#pure-descriptor-strong')).toBe(strong);
			expect(container.querySelector('#pure-descriptor-tspan')).toBe(tspan);
			expect(diagnostic).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:8276.
	it('renders a synchronous generator function component as its yielded children', async () => {
		const result = await collectPipeableStream(server.GeneratorComponentOutput);
		const container = activate(result.html);
		const first = container.querySelector('#generator-component-first');
		const second = container.querySelector('#generator-component-second');
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.GeneratorComponentOutput);
		try {
			flushSync(() => {});
			expect(container.querySelector('#generator-component-output')?.textContent).toBe(
				'HelloWorld',
			);
			expect(container.querySelector('#generator-component-first')).toBe(first);
			expect(container.querySelector('#generator-component-second')).toBe(second);
			expect(diagnostic).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:8582.
	it('renders one-shot generator objects supplied as children', async () => {
		function* serverItems() {
			yield ServerRuntime.createElement(
				'li',
				{ id: 'generator-child-first', key: 'first' },
				'Hello',
			);
			yield ServerRuntime.createElement(
				'li',
				{ id: 'generator-child-second', key: 'second' },
				'World',
			);
		}
		const result = await collectPipeableStream(server.IterableChildren, {
			items: serverItems(),
		});
		const container = activate(result.html);
		const first = container.querySelector('#generator-child-first');
		const second = container.querySelector('#generator-child-second');
		function* clientItems() {
			yield createElement('li', { id: 'generator-child-first', key: 'first' }, 'Hello');
			yield createElement('li', { id: 'generator-child-second', key: 'second' }, 'World');
		}
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.IterableChildren, { items: clientItems() });
		try {
			flushSync(() => {});
			expect(container.querySelector('#iterable-children')?.textContent).toBe('HelloWorld');
			expect(container.querySelector('#generator-child-first')).toBe(first);
			expect(container.querySelector('#generator-child-second')).toBe(second);
			expect(diagnostic).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:8610.
	it('renders a custom one-shot iterator returned as children', async () => {
		const result = await collectPipeableStream(server.IterableChildren, {
			items: oneShotIterator([
				ServerRuntime.createElement('li', { id: 'iterator-first', key: 'first' }, 'Hello'),
				ServerRuntime.createElement('li', { id: 'iterator-second', key: 'second' }, 'World'),
			]),
		});
		const container = activate(result.html);
		const first = container.querySelector('#iterator-first');
		const second = container.querySelector('#iterator-second');
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.IterableChildren, {
			items: oneShotIterator([
				createElement('li', { id: 'iterator-first', key: 'first' }, 'Hello'),
				createElement('li', { id: 'iterator-second', key: 'second' }, 'World'),
			]),
		});
		try {
			flushSync(() => {});
			expect(container.querySelector('#iterable-children')?.textContent).toBe('HelloWorld');
			expect(container.querySelector('#iterator-first')).toBe(first);
			expect(container.querySelector('#iterator-second')).toBe(second);
			expect(diagnostic).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:3641.
	it('streams a custom element with nested host children', async () => {
		const result = await collectPipeableStream(server.CustomElementChildren);
		const fragment = parse(result.html);
		const custom = fragment.querySelector('my-element');
		expect(custom?.id).toBe('custom-element-children');
		expect(custom?.querySelector('#custom-element-child')?.textContent).toBe('foo');
	});

	// Per ReactDOMFizzServer-test.js:6215/:6291.
	it('keeps use() values isolated across parent and child components', async () => {
		const result = await collectPipeableStream(server.MultipleUseValues, {
			a: Promise.resolve('A'),
			b: Promise.resolve('B'),
			c: Promise.resolve('C'),
			d: Promise.resolve('D'),
		});
		const container = activate(result.html);
		const value = container.querySelector('#parent-use-values');
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.MultipleUseValues, {
			a: new Promise<string>(() => {}),
			b: new Promise<string>(() => {}),
			c: new Promise<string>(() => {}),
			d: new Promise<string>(() => {}),
		});
		try {
			flushSync(() => {});
			expect(value?.textContent).toBe('ABCD');
			expect(container.querySelector('#parent-use-values')).toBe(value);
			expect(container.querySelector('#multiple-use-fallback')).toBeNull();
			expect(diagnostic).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:6431.
	it('uses an already-instrumented fulfilled thenable in the first shell', async () => {
		const thenable = {
			status: 'fulfilled',
			value: 'instrumented',
			then() {},
		};
		const result = await collectPipeableStream(server.SyncThenableBoundary, { thenable });
		const shell = parse(result.html);
		expect(shell.querySelector('#sync-thenable-value')?.textContent).toBe('instrumented');
		expect(shell.querySelector('#sync-thenable-fallback')).toBeNull();
	});

	// Per ReactDOMFizzServer-test.js:3650.
	it('does not report a promise rejection after an abort has completed', async () => {
		const value = deferred<string>();
		const reason = new Error('abort reason');
		const errors: unknown[] = [];
		const collector = createPipeableCollector();
		const render = ServerRuntime.renderToPipeableStream(
			server.SyncThenableBoundary,
			{ thenable: value.promise },
			{ onError: (error) => errors.push(error), timeoutMs: 0 },
		);
		render.pipe(collector.destination);
		expect(collector.chunks.join('')).toContain('sync-thenable-fallback');
		render.abort(reason);
		await collector.ended;
		expect(errors).toEqual([reason]);

		value.reject(new Error('rejected after abort'));
		await Promise.resolve();
		await Promise.resolve();
		expect(errors).toEqual([reason]);
	});

	// Per ReactDOMFizzServer-test.js:3954.
	it('does not resume pending component work after a fatal shell error', async () => {
		const value = deferred<string>();
		const error = new Error('fatal shell error');
		const onRender = vi.fn();
		const onError = vi.fn();
		const onShellError = vi.fn();
		const collector = createPipeableCollector();
		ServerRuntime.renderToPipeableStream(
			server.PendingThenFatal,
			{ promise: value.promise, error, onRender },
			{ onError, onShellError, timeoutMs: 0 },
		).pipe(collector.destination);

		expect(await collector.ended).toBe('');
		expect(onError).toHaveBeenCalledOnce();
		expect(onError).toHaveBeenCalledWith(error);
		expect(onShellError).toHaveBeenCalledOnce();
		expect(onRender).not.toHaveBeenCalled();

		value.resolve('too late');
		await value.promise;
		await Promise.resolve();
		await Promise.resolve();
		expect(onRender).not.toHaveBeenCalled();
	});

	// Per ReactDOMFizzServer-test.js:1405.
	it('client-renders an aborted streamed boundary during hydration', async () => {
		const value = deferred<string>();
		const collector = createPipeableCollector();
		const render = ServerRuntime.renderToPipeableStream(
			server.SyncThenableBoundary,
			{ thenable: value.promise },
			{ timeoutMs: 0 },
		);
		render.pipe(collector.destination);
		render.abort(new Error('aborted'));
		const container = activate(await collector.ended);
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const clientThenable = {
			then(resolve: (resolved: string) => void) {
				resolve('client value');
			},
		};
		const root = hydrateRoot(container, client.SyncThenableBoundary, {
			thenable: clientThenable,
		});
		try {
			flushSync(() => {});
			expect(container.querySelector('#sync-thenable-value')?.textContent).toBe('client value');
			expect(container.querySelector('#sync-thenable-fallback')).toBeNull();
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:6620.
	it('keeps data promises distinct across a lazily loaded component boundary', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const module = deferred<{ default: typeof server.LazyUseLeaf }>();
		server.setLazyUseModule(module.promise);
		const collector = createPipeableCollector();
		const onError = vi.fn();
		const stream = ServerRuntime.renderToPipeableStream(
			server.LazyUseIsolation,
			{
				first: first.promise,
				second: second.promise,
			},
			{ onError },
		);
		stream.pipe(collector.destination);

		first.resolve('value1');
		module.resolve({ default: server.LazyUseLeaf });
		second.resolve('value2');
		const container = activate(await collector.ended);
		try {
			expect(onError).not.toHaveBeenCalled();
			expect(container.querySelector('#lazy-use-first')?.textContent).toBe('value1value2');
			expect(container.querySelector('#lazy-use-second')?.textContent).toBe('value2');
			expect(container.querySelector('#lazy-use-fallback')).toBeNull();
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:703/:1070.
	it('replaces a streamed lazy fallback with the public catch outcome on rejection', async () => {
		const module = deferred<{ default: () => unknown }>();
		server.setRejectingLazyModule(module.promise);
		const collector = createPipeableCollector();
		const onError = vi.fn();
		ServerRuntime.renderToPipeableStream(server.LazyRejectionBoundary, undefined, {
			onError,
		}).pipe(collector.destination);
		expect(collector.chunks.join('')).toContain('lazy-rejection-fallback');

		module.reject(new Error('lazy failed'));
		const container = activate(await collector.ended);
		try {
			expect(onError).not.toHaveBeenCalled();
			expect(container.querySelector('#lazy-rejection-error')?.textContent).toBe('lazy failed');
			expect(container.querySelector('#lazy-rejection-fallback')).toBeNull();
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:2074.
	it('restores the outer context after an error inside a nested provider', async () => {
		const result = await collectPipeableStream(server.ContextErrorRecovery, {
			error: new Error('provider failed'),
		});
		const container = activate(result.html);
		try {
			expect(container.querySelector('#context-error')?.textContent).toBe('provider failed');
			expect(container.querySelector('#context-after-error')?.textContent).toBe('outer');
			expect(container.querySelector('#context-outside-provider')?.textContent).toBe('default');
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:6677/:6729.
	it('hydrates useActionState after render-phase updates without replacing its output', async () => {
		const action = async (state: number) => state;
		const label = deferred<string>();
		const collector = createPipeableCollector();
		ServerRuntime.renderToPipeableStream(server.ActionStateRenderReplay, {
			action,
			promise: label.promise,
		}).pipe(collector.destination);
		label.resolve('Child');
		const container = activate(await collector.ended);
		const value = container.querySelector('#action-state-value');
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.ActionStateRenderReplay, {
			action,
			promise: new Promise<string>(() => {}),
		});
		try {
			flushSync(() => {});
			expect(value?.textContent).toBe('Child:0:3');
			expect(container.querySelector('#action-state-value')).toBe(value);
			expect(container.querySelector('#action-state-fallback')).toBeNull();
			expect(diagnostic).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:4529/:4545/:4569.
	it('keeps valid inline script characters while preventing closing-tag injection', async () => {
		const source =
			`window.__fizzRaw = "<>&";\n` +
			`window.__fizzSeparators = "\u2028\u2029";\n` +
			`/* </script><script>window.__fizzRaw = "unsafe"</script> */`;
		const buffered = ServerRuntime.renderToString(server.RawScript, { source }).html;
		const streamed = (await collectPipeableStream(server.RawScript, { source })).html;
		for (const html of [buffered, streamed]) {
			const fragment = parse(html);
			const scripts = fragment.querySelectorAll('script');
			expect(scripts).toHaveLength(1);
			expect(scripts[0].textContent).toContain('"<>&"');
			expect(scripts[0].textContent).toContain('"\u2028\u2029"');
			expect(scripts[0].textContent).toContain('</\\u0073cript>');
			expect(scripts[0].textContent).toContain('<\\u0073cript>');
		}
	});

	// Per ReactDOMFizzServer-test.js:4625.
	it('keeps raw style text in one element when it contains closing-tag-like tokens', async () => {
		const source =
			`.foo::after { content: 'sSsS</style></Style></StYlE><style><Style>sSsS'; }\n` +
			`body { color: rgb(1, 2, 3); }`;
		const descriptor = () =>
			ServerRuntime.createElement('style', {
				dangerouslySetInnerHTML: { __html: source },
			});
		const outputs = [
			ServerRuntime.renderToString(server.RawStyle, { tag: 'style', source }).html,
			(await collectPipeableStream(server.RawStyle, { tag: 'style', source })).html,
			ServerRuntime.renderToString(descriptor).html,
			(await collectPipeableStream(descriptor)).html,
		];
		for (const html of outputs) {
			const fragment = parse(html);
			const styles = fragment.querySelectorAll('style');
			expect(styles).toHaveLength(1);
			expect(styles[0].textContent).toContain('</\\73 tyle>');
			expect(styles[0].textContent).toContain('</\\53 tyle>');
			expect(styles[0].textContent).toContain('<\\73 tyle>');
			expect(styles[0].textContent).toContain('body { color: rgb(1, 2, 3); }');
		}
	});

	// Per ReactDOMFizzServer-test.js:7698.
	it('reports a component stack overflow as a root stream failure', async () => {
		const overflow = (): never => overflow();
		const onError = vi.fn();
		const onShellError = vi.fn();
		const collector = createPipeableCollector();
		ServerRuntime.renderToPipeableStream(overflow, undefined, {
			onError,
			onShellError,
		}).pipe(collector.destination);

		expect(await collector.ended).toBe('');
		expect(onError).toHaveBeenCalledOnce();
		expect(onError.mock.calls[0][0]).toBeInstanceOf(RangeError);
		expect(onShellError).toHaveBeenCalledWith(onError.mock.calls[0][0]);
	});
});
