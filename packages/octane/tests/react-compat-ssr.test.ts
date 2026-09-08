import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { PassThrough } from 'node:stream';
import * as Server from 'octane/server';
import * as Client from 'octane';
import { prerender } from 'octane/static';
import {
	ReactCompat,
	bridgeReactContext,
	type OctaneCompatComponentProps,
} from 'octane/react/server';
import { ReactCompat as ClientReactCompat, type ReactCompatComponentProps } from 'octane/react';
import { getServerRenderResourceContext, puMemo } from '../src/runtime.server.js';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function reactIsland(component: unknown, props?: Record<string, unknown>) {
	return Server.createElement(ReactCompat, { component, props });
}

function textFrom(html: string): string {
	const host = document.createElement('div');
	host.innerHTML = html;
	for (const element of host.querySelectorAll('script, style')) element.remove();
	return host.textContent ?? '';
}

describe('ReactCompat buffered server rendering', () => {
	it('diagnoses a server context passed to a client island before rendering React', () => {
		const contexts = [
			bridgeReactContext(Server.createContext('server'), React.createContext('React')),
		];
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = Client.createRoot(container);
		function Page() {
			return Client.createElement(Client.ErrorBoundary, {
				fallback: (error: Error) => Client.createElement('p', null, error.message),
				children: Client.createElement<ReactCompatComponentProps<Record<string, never>>>(
					ClientReactCompat,
					{
						component: () => null,
						contexts,
					},
				),
			});
		}
		try {
			root.render(Page);
			expect(container.textContent).toContain('native client Octane context');
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('hydrates existing DOM, ids, input state, refs, and events without touching Octane siblings', async () => {
		const inputRef = React.createRef<HTMLInputElement>();
		function Form({ label }: { label: string }) {
			const id = React.useId();
			const [count, setCount] = React.useState(0);
			return React.createElement(
				React.Fragment,
				null,
				React.createElement('label', { htmlFor: id }, label),
				React.createElement('input', { id, defaultValue: 'server value', ref: inputRef }),
				React.createElement('button', { onClick: () => setCount(count + 1) }, `count:${count}`),
			);
		}
		function ServerPage({ label }: { label: string }) {
			return Server.createElement(
				'main',
				null,
				Server.createElement('aside', { 'data-neighbor': '' }, label),
				reactIsland(Form, { label }),
			);
		}
		function ClientPage({ label }: { label: string }) {
			return Client.createElement(
				'main',
				null,
				Client.createElement('aside', { 'data-neighbor': '' }, label),
				Client.createElement<ReactCompatComponentProps<{ label: string }>>(ClientReactCompat, {
					component: Form,
					props: { label },
				}),
			);
		}
		const { html } = await prerender(ServerPage, { label: 'before' }, { identifierPrefix: 'page' });
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const input = container.querySelector('input')!;
		const button = container.querySelector('button')!;
		const neighbor = container.querySelector('aside')!;
		const id = input.id;
		input.value = 'typed before hydration';
		input.focus();
		input.setSelectionRange(2, 7);
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
		const previous = environment.IS_REACT_ACT_ENVIRONMENT;
		environment.IS_REACT_ACT_ENVIRONMENT = typeof React.act === 'function';
		const run = async (callback: () => void) => {
			if (typeof React.act === 'function') await React.act(callback);
			else callback();
		};
		let root: Client.Root | undefined;
		try {
			await run(() => {
				root = Client.hydrateRoot(
					container,
					ClientPage,
					{ label: 'before' },
					{ identifierPrefix: 'page' },
				);
			});
			await vi.waitFor(() => expect(inputRef.current).toBe(input));
			expect(container.querySelector('input')).toBe(input);
			expect(container.querySelector('button')).toBe(button);
			expect(container.querySelector('aside')).toBe(neighbor);
			expect(container.querySelector('label')?.htmlFor).toBe(id);
			expect(input.id).toBe(id);
			expect(input.value).toBe('typed before hydration');
			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([2, 7]);
			await run(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
			await vi.waitFor(() => expect(button.textContent).toBe('count:1'));
			await run(() => Client.flushSync(() => root!.render(ClientPage, { label: 'after' })));
			await vi.waitFor(() => expect(container.querySelector('label')?.textContent).toBe('after'));
			expect(container.querySelector('input')).toBe(input);
			expect(container.querySelector('aside')).toBe(neighbor);
			expect(neighbor.textContent).toBe('after');
			expect(button.textContent).toBe('count:1');
			expect(errors).not.toHaveBeenCalled();
		} finally {
			await run(() => root?.unmount());
			await vi.waitFor(() => expect(inputRef.current).toBeNull());
			container.remove();
			environment.IS_REACT_ACT_ENVIRONMENT = previous;
			errors.mockRestore();
		}
	});

	it('renders a real React component with scoped context and escaped content', async () => {
		const source = Server.createContext('default');
		const target = React.createContext('React default');
		const contexts = [bridgeReactContext(source, target)];
		function ReactLabel({ label }: { label: string }) {
			const theme = React.useContext(target);
			return React.createElement('button', { 'data-theme': theme }, label);
		}
		function Page() {
			return Server.createElement(source, {
				value: 'enclosing provider',
				children: Server.createElement(ReactCompat, {
					children: Server.createElement(ReactLabel, { label: '<script>not executable</script>' }),
					contexts,
				}),
			});
		}
		const { html } = await prerender(Page);
		const host = document.createElement('div');
		host.innerHTML = html;
		expect(host.querySelector('[data-react-compat] button')?.getAttribute('data-theme')).toBe(
			'enclosing provider',
		);
		expect(host.querySelector('button')?.textContent).toBe('<script>not executable</script>');
		expect(host.querySelector('script')).toBeNull();
	});

	it('reuses the suspended React render when an Octane retry reconstructs callback props', async () => {
		const resource = deferred<string>();
		function AsyncLabel({ resource }: { resource: Promise<string> }) {
			return React.createElement('strong', null, React.use(resource));
		}
		function Page() {
			return reactIsland(AsyncLabel, { resource: resource.promise, onClick: () => {} });
		}
		const rendering = prerender(Page, undefined, { timeoutMs: 1_000 });
		resource.resolve('complete');
		const { html } = await rendering;
		expect(textFrom(html)).toBe('complete');
		expect(html).not.toContain('application/json');
	});

	it('keeps concurrent requests and sibling island ids separate', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const source = Server.createContext('native default');
		const target = React.createContext('React default');
		const contexts = [bridgeReactContext(source, target)];
		function AsyncId({ resource }: { resource: Promise<string> }) {
			const id = React.useId();
			const theme = React.useContext(target);
			return React.createElement('p', { id }, `${theme}:${React.use(resource)}`);
		}
		function Page({ resource, theme }: { resource: Promise<string>; theme: string }) {
			return Server.createElement(source, {
				value: theme,
				children: [
					Server.createElement(ReactCompat, { component: AsyncId, props: { resource }, contexts }),
					Server.createElement(ReactCompat, { component: AsyncId, props: { resource }, contexts }),
				],
			});
		}
		const a = prerender(Page, { resource: first.promise, theme: 'a' }, { identifierPrefix: 'a' });
		const b = prerender(Page, { resource: second.promise, theme: 'b' }, { identifierPrefix: 'b' });
		second.resolve('second request');
		const secondHtml = (await b).html;
		first.resolve('first request');
		const firstHtml = (await a).html;
		expect(textFrom(firstHtml)).toBe('a:first requesta:first request');
		expect(textFrom(secondHtml)).toBe('b:second requestb:second request');
		const host = document.createElement('div');
		host.innerHTML = firstHtml + secondHtml;
		const ids = [...host.querySelectorAll('p')].map((element) => element.id);
		expect(new Set(ids).size).toBe(4);
	});

	it('returns an Octane fallback from a synchronous server render', async () => {
		function Label() {
			return React.createElement('p', null, 'React content');
		}
		function Page() {
			return Server.createElement(Server.Suspense, {
				fallback: Server.createElement('p', null, 'Octane pending'),
				children: reactIsland(Label),
			});
		}
		const { html } = Server.renderToString(Page);
		expect(textFrom(html)).toBe('Octane pending');
		// The synchronous request closes its Fizz work instead of leaving an
		// unobserved rejected promise or running island after the shell returns.
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	});

	it('streams an Octane fallback before the completed React island', async () => {
		const resource = deferred<string>();
		function AsyncLabel() {
			return React.createElement('strong', null, React.use(resource.promise));
		}
		function Page() {
			return Server.createElement(Server.Suspense, {
				fallback: Server.createElement('p', null, 'Octane pending'),
				children: reactIsland(AsyncLabel),
			});
		}
		const stream = await Server.renderToReadableStream(Page);
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		const shell = await reader.read();
		expect(decoder.decode(shell.value)).toContain('Octane pending');
		resource.resolve('React ready');
		let completion = '';
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) break;
			completion += decoder.decode(chunk.value, { stream: true });
		}
		completion += decoder.decode();
		await stream.allReady;
		expect(completion).toContain('<strong>React ready</strong>');
	});

	it('routes a React server error to the enclosing Octane catch arm', async () => {
		const error = new Error('React server failed');
		const captured: unknown[] = [];
		function Broken() {
			throw error;
		}
		function Page() {
			return Server.createElement(Server.ErrorBoundary, {
				fallback: (caught: unknown) => {
					captured.push(caught);
					return Server.createElement('p', null, 'Octane caught the error');
				},
				children: reactIsland(Broken),
			});
		}
		const { html } = await prerender(Page);
		expect(textFrom(html)).toBe('Octane caught the error');
		expect(captured).toContain(error);
	});

	it('awaits a local React Suspense boundary without shipping reveal scripts', async () => {
		const resource = deferred<string>();
		function AsyncLabel() {
			return React.createElement('p', null, React.use(resource.promise));
		}
		function ReactPage() {
			return React.createElement(
				React.Suspense,
				{ fallback: React.createElement('i', null, 'React pending') },
				React.createElement(AsyncLabel),
			);
		}
		const rendering = prerender(() => reactIsland(ReactPage));
		resource.resolve('React complete');
		const { html } = await rendering;
		expect(textFrom(html)).toBe('React complete');
		expect(html).not.toContain('<script');
	});

	it('rejects a disconnected request without waiting for React data', async () => {
		const controller = new AbortController();
		const never = new Promise<string>(() => {});
		const reason = new Error('request disconnected');
		function Pending() {
			return React.createElement('p', null, React.use(never));
		}
		const rendering = prerender(() => reactIsland(Pending), undefined, {
			signal: controller.signal,
			timeoutMs: 0,
		});
		controller.abort(reason);
		await expect(rendering).rejects.toBe(reason);
	});

	it('bounds a stalled React island with the outer request deadline', async () => {
		const never = new Promise<string>(() => {});
		function Pending() {
			return React.createElement('p', null, React.use(never));
		}
		await expect(
			prerender(() => reactIsland(Pending), undefined, { timeoutMs: 20 }),
		).rejects.toThrow(/(?:exceeded|timed out)/);
	});

	it('caps retained island HTML', async () => {
		function TooLarge() {
			return React.createElement('p', null, 'x'.repeat(8 * 1024 * 1024 + 1));
		}
		await expect(prerender(() => reactIsland(TooLarge))).rejects.toThrow('8 MiB limit');
	});

	it('rejects unsupported external React server ownership before starting nested work', async () => {
		const { renderToReadableStream } = await import('react-dom/server');
		const { OctaneCompat } = await import('octane/react/server');
		function ReactLabel() {
			return React.createElement('p', null, 'nested');
		}
		function OctanePage() {
			return reactIsland(ReactLabel);
		}
		const errors: unknown[] = [];
		await expect(
			renderToReadableStream(
				React.createElement<OctaneCompatComponentProps<Record<string, never>>>(OctaneCompat, {
					component: OctanePage,
				}),
				{
					onError(error) {
						errors.push(error);
					},
				},
			),
		).rejects.toThrow('owned Octane render request');
		expect(errors).toHaveLength(1);
	});
});

describe('server renderer resource lifetime', () => {
	const resourceSlot = Symbol('server resource lifetime test');

	function useRequestResource(onDispose: () => void) {
		puMemo(() => getServerRenderResourceContext()!.registerCleanup(onDispose), [], resourceSlot);
	}

	function Resource({ onDispose }: { onDispose: () => void }) {
		useRequestResource(onDispose);
		return Server.createElement('p', null, 'resource');
	}

	it.each(['renderToString', 'renderToStaticMarkup'] as const)(
		'%s closes request resources before returning',
		(method) => {
			const dispose = vi.fn();
			const { html } = Server[method](Resource, { onDispose: dispose });
			expect(textFrom(html)).toBe('resource');
			expect(dispose).toHaveBeenCalledTimes(1);
		},
	);

	it('keeps separate resources independent when they share the same cleanup callback', () => {
		const dispose = vi.fn();
		function Page() {
			return Server.createElement(
				'main',
				null,
				Server.createElement(Resource, { onDispose: dispose }),
				Server.createElement(Resource, { onDispose: dispose }),
			);
		}
		expect(textFrom(Server.renderToString(Page).html)).toBe('resourceresource');
		expect(dispose).toHaveBeenCalledTimes(2);
	});

	it('keeps resources alive across buffered retries and closes them on completion', async () => {
		const resource = deferred<string>();
		const dispose = vi.fn();
		function Page() {
			useRequestResource(dispose);
			return Server.createElement('p', null, Server.use(resource.promise));
		}
		const rendering = prerender(Page);
		expect(dispose).not.toHaveBeenCalled();
		resource.resolve('done');
		expect(textFrom((await rendering).html)).toBe('done');
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	it('closes resources when rendering fails', async () => {
		const dispose = vi.fn();
		const error = new Error('shell failed');
		function Page() {
			useRequestResource(dispose);
			throw error;
		}
		await expect(prerender(Page)).rejects.toBe(error);
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	it('closes streaming resources when the consumer cancels', async () => {
		const dispose = vi.fn();
		const never = new Promise<string>(() => {});
		function Pending() {
			return Server.createElement('p', null, Server.use(never));
		}
		function Page() {
			return Server.createElement(
				'main',
				null,
				Server.createElement(Resource, { onDispose: dispose }),
				Server.createElement(Server.Suspense, {
					fallback: Server.createElement('p', null, 'pending'),
					children: Server.createElement(Pending),
				}),
			);
		}
		const stream = await Server.renderToReadableStream(Page, undefined, { onError() {} });
		const reader = stream.getReader();
		const first = await reader.read();
		expect(new TextDecoder().decode(first.value)).toContain('resource');
		expect(dispose).not.toHaveBeenCalled();
		await reader.cancel('consumer gone');
		await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
	});

	it('closes Node streaming resources after completion', async () => {
		const dispose = vi.fn();
		const sink = new PassThrough();
		let html = '';
		sink.on('data', (chunk) => {
			html += chunk.toString();
		});
		const done = new Promise<void>((resolve, reject) => {
			sink.on('finish', resolve);
			sink.on('error', reject);
		});
		Server.renderToPipeableStream(Resource, { onDispose: dispose }).pipe(sink);
		await done;
		expect(textFrom(html)).toBe('resource');
		expect(dispose).toHaveBeenCalledTimes(1);
	});
});
