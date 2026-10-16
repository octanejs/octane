import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	EXTERNAL_HYDRATION_PROMISE,
	act,
	createContext,
	hydrateRoot,
	flushSync,
	setTransitionFallbackTimeout,
	startTransition,
} from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { condition } from 'octane/hydration';
import { prerender } from 'octane/static';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';
import {
	activateStreamedMarkup,
	createPipeableCollector,
	deferred,
	resetStreamRuntimeGlobals,
} from '../_server-stream.js';
// CLIENT-compiled components (normal .tsrx import path). Importing AsyncCounter
// (which has an onClick) makes this module register click delegation at load.
import {
	AsyncLeaf,
	AsyncCounter,
	AsyncUndef,
	DelayedHydrationBoundary,
} from '../_fixtures/ssr-suspense.tsrx';
import {
	DescriptorRetryBoundary,
	RootSuspensionScreen,
	type RootSuspensionProps,
} from '../_fixtures/suspense-timing.tsrx';

// SSR Phase 4 — client hydration seeds the server-resolved use(thenable) values
// from the inline data <script>, so a hydrating use() returns synchronously
// instead of re-suspending (and the adopted DOM is not rebuilt).

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/ssr-suspense.tsrx');

function serverModule(): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(FIXTURE, 'utf8'), {
		id: 'ssr-suspense.tsrx',
		mode: 'server',
		compileOptions: { mode: 'server' },
	});
}
const server = serverModule();

const FACTORY_SOURCE = `
	import { Hydrate, use } from 'octane';

	export function SeededResource(props) @{
		<main>
			@try {
				const value = use(props.load(props.id));
				<span id="seeded-resource">{value as string}</span>
			} @pending {
				<span id="seeded-pending">loading</span>
			} @catch (error) {
				<span id="seeded-error">{error.message as string}</span>
			}
		</main>
	}

	export function SeededResourcePair(props) @{
		<main>
			@try {
				const first = use(props.load('first', props.id));
				const second = use(props.load('second', props.id));
				<section>
					<span id="first-seeded-resource">{first as string}</span>
					<span id="second-seeded-resource">{second as string}</span>
				</section>
			} @pending {
				<span id="seeded-pair-pending">loading</span>
			}
		</main>
	}

	export function SeededMixedPromises(props) @{
		const before = use(props.before);
		const value = use(props.load(props.id));
		const after = use(props.after);
		<div id="seeded-mixed-promises">{before + ':' + value + ':' + after as string}</div>
	}

	export function SeededContextAndResource(props) @{
		const context = use(props.makeContext());
		const value = use(props.load(props.id));
		<div id="seeded-context-resource">{context + ':' + value as string}</div>
	}

	export function ContextWithoutSeed(props) @{
		const context = use(props.makeContext());
		<div id="context-without-seed">{context as string}</div>
	}

	export function SeededExternalAndResource(props) @{
		const external = use(props.makeExternal(props.id));
		const value = use(props.load(props.id));
		<div id="seeded-external-resource">{external + ':' + value as string}</div>
	}

	export function ExternalWithoutSeed(props) @{
		const external = use(props.makeExternal());
		<div id="external-without-seed">{external as string}</div>
	}

	function RepeatedResource(props) @{
		const value = use(props.load(props.kind));
		<span data-resource-kind={props.kind}>{value as string}</span>
	}

	export function SeededRepeatedOwners(props) @{
		<section id="seeded-repeated-owners">
			<RepeatedResource kind="external" load={props.makeExternal} />
			<RepeatedResource kind="ordinary" load={props.load} />
		</section>
	}

	export function SeededNestedStream(props) @{
		<main>
			@try {
				const outer = use(props.load('outer', props.id));
				<section>
					<span id="streamed-outer-resource">{outer as string}</span>
					@try {
						const inner = use(props.load('inner', props.id));
						<span id="streamed-inner-resource">{inner as string}</span>
					} @pending {
						<span id="streamed-inner-pending">inner loading</span>
					}
				</section>
			} @pending {
				<span id="streamed-outer-pending">outer loading</span>
			}
		</main>
	}

	function DeferredResource(props) @{
		const value = use(props.load(props.id));
		<button id="deferred-seeded-resource">{value as string}</button>
	}

	export function DeferredSeededResource(props) @{
		<Hydrate when={props.when} split={false}>
			<DeferredResource load={props.load} id={props.id} />
		</Hydrate>
	}
`;
const factoryServer = loadCompiledFixtureSource(FACTORY_SOURCE, {
	id: 'seeded-resource-factories.tsrx',
	mode: 'server',
	compileOptions: { hmr: false, dev: false },
});
const factoryClient = loadCompiledFixtureSource(FACTORY_SOURCE, {
	id: 'seeded-resource-factories.tsrx',
	mode: 'client',
	compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
});

function externallyFulfilled(value: string) {
	const promise = Promise.resolve(value);
	return {
		[EXTERNAL_HYDRATION_PROMISE]: true as const,
		status: 'fulfilled' as const,
		value,
		then: promise.then.bind(promise),
	};
}

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

it('adopts server content when a boundary suspends during its initial hydration', async () => {
	const fixture = loadServerFixture<typeof import('../_fixtures/ssr-suspense.tsrx')>(
		'packages/octane/tests/_fixtures/ssr-suspense.tsrx',
	);
	let resume!: () => void;
	const gate = {
		pending: false,
		promise: new Promise<void>((resolve) => {
			resume = resolve;
		}),
	};
	container.innerHTML = ServerRT.renderToString(fixture.DelayedHydrationBoundary, { gate }).html;
	const button = container.querySelector<HTMLButtonElement>('button')!;
	gate.pending = true;
	const root = hydrateRoot(container, DelayedHydrationBoundary, { gate });
	try {
		await act(() => {});
		expect(container.querySelector('button')).toBe(button);
		expect(container.textContent).not.toContain('Loading');
		await act(async () => {
			gate.pending = false;
			resume();
			await gate.promise;
		});
		expect(container.querySelector('button')).toBe(button);
		await act(() => button.click());
		expect(button.textContent).toBe('1');
	} finally {
		root.unmount();
	}
});

describe.each(['raw', 'use'] as const)(
	'hydrateRoot — root suspension without a boundary (%s resource reads)',
	(readMode) => {
		const rootServer = loadServerFixture('packages/octane/tests/_fixtures/suspense-timing.tsrx');

		function pendingResource() {
			let resolve!: (value: string) => void;
			let reject!: (reason: Error) => void;
			let state: 'pending' | 'fulfilled' | 'rejected' = 'pending';
			let value: string;
			let error: Error;
			const promise = Object.assign(
				new Promise<string>((res, rej) => {
					resolve = res;
					reject = rej;
				}),
				{ [EXTERNAL_HYDRATION_PROMISE]: true as const },
			);
			promise.then(
				(result) => {
					state = 'fulfilled';
					value = result;
				},
				(reason) => {
					state = 'rejected';
					error = reason;
				},
			);
			return {
				promise,
				resolve,
				reject,
				read:
					readMode === 'raw'
						? () => {
								if (state === 'pending') throw promise;
								if (state === 'rejected') throw error;
								return value;
							}
						: undefined,
			};
		}

		function readyProps(label = 'server', value = 'server data'): RootSuspensionProps {
			return {
				label,
				items: ['first', 'second'],
				// An externally owned use() resource must hydrate from its client cache,
				// rather than the ordinary SSR seed that would bypass suspension.
				promise: Object.assign(Promise.resolve(value), {
					[EXTERNAL_HYDRATION_PROMISE]: true as const,
					status: 'fulfilled' as const,
					value,
				}),
				read: readMode === 'raw' ? () => value : undefined,
			};
		}

		function observe() {
			return {
				onLifecycle: vi.fn(),
				onRef: vi.fn(),
				onShellRef: vi.fn(),
				onUncaughtError: vi.fn(),
			};
		}

		async function serverScreen() {
			const props = readyProps();
			const { html } = await prerender(rootServer.RootSuspensionScreen, props);
			container.innerHTML = html;
			return props;
		}

		it('retains the server screen until hydration can commit, then preserves it through later updates', async () => {
			const props = await serverScreen();
			const observed = observe();
			const onRecoverableError = vi.fn();
			const resource = pendingResource();
			const main = container.querySelector('main');
			const header = container.querySelector('header');
			const input = container.querySelector<HTMLInputElement>('input')!;
			const button = container.querySelector<HTMLButtonElement>('[data-count]')!;
			const content = container.querySelector('[data-value]')!;
			const text = content.firstChild;
			const survivor = container.querySelector('[data-item="second"]');
			const tail = container.querySelector('footer');
			const serverText = container.textContent;
			let root: ReturnType<typeof hydrateRoot> | undefined;
			try {
				await act(() => {
					root = hydrateRoot(
						container,
						RootSuspensionScreen,
						{ ...props, ...observed, promise: resource.promise, read: resource.read },
						{ onUncaughtError: observed.onUncaughtError, onRecoverableError },
					);
				});
				expect(container.querySelector('main')).toBe(main);
				expect(container.querySelector('header')).toBe(header);
				expect(container.querySelector('input')).toBe(input);
				expect(container.querySelector('[data-count]')).toBe(button);
				expect(container.querySelector('[data-value]')).toBe(content);
				expect(content.firstChild).toBe(text);
				expect(container.querySelector('footer')).toBe(tail);
				expect(container.textContent).toBe(serverText);
				expect(observed.onLifecycle).not.toHaveBeenCalled();
				expect(observed.onRef).not.toHaveBeenCalled();
				expect(observed.onShellRef).not.toHaveBeenCalled();
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
				expect(onRecoverableError).not.toHaveBeenCalled();

				await act(() => resource.resolve('server data'));
				expect(container.querySelector('main')).toBe(main);
				expect(container.querySelector('header')).toBe(header);
				expect(container.querySelector('input')).toBe(input);
				expect(container.querySelector('[data-count]')).toBe(button);
				expect(container.querySelector('[data-value]')).toBe(content);
				expect(content.firstChild).toBe(text);
				expect(container.querySelector('footer')).toBe(tail);
				expect(observed.onRef).toHaveBeenCalledExactlyOnceWith(content);
				expect(observed.onShellRef).toHaveBeenCalledExactlyOnceWith(header);
				expect(observed.onLifecycle).toHaveBeenCalledWith('layout reader:server data');
				expect(observed.onLifecycle).toHaveBeenCalledWith('passive shell:server');
				await act(() => button.click());
				expect(button.textContent).toBe('server:1');

				const next = pendingResource();
				const committedText = container.textContent;
				const committedLifecycle = [...observed.onLifecycle.mock.calls];
				await act(() =>
					root!.render(RootSuspensionScreen, {
						...props,
						...observed,
						promise: next.promise,
						read: next.read,
						label: 'next',
						items: ['added', 'second'],
					}),
				);
				expect(container.textContent).toBe(committedText);
				expect(input.value).toBe('server');
				expect(observed.onLifecycle.mock.calls).toEqual(committedLifecycle);
				await act(() => next.resolve('next data'));
				expect(container.querySelector('[data-value]')).toBe(content);
				expect(content.textContent).toBe('next data');
				expect(container.querySelector('[data-count]')).toBe(button);
				expect(button.textContent).toBe('next:1');
				expect(container.querySelector('[data-item="second"]')).toBe(survivor);
				expect(input.value).toBe('next');
				expect(observed.onRef).toHaveBeenCalledExactlyOnceWith(content);
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
				expect(onRecoverableError).not.toHaveBeenCalled();
			} finally {
				root?.unmount();
			}
		});

		it('reports the actual rejection after an initially suspended hydration fails', async () => {
			const props = await serverScreen();
			const observed = observe();
			const resource = pendingResource();
			const serverMain = container.querySelector('main');
			let root: ReturnType<typeof hydrateRoot> | undefined;
			try {
				await act(() => {
					root = hydrateRoot(
						container,
						RootSuspensionScreen,
						{ ...props, ...observed, promise: resource.promise, read: resource.read },
						{ onUncaughtError: observed.onUncaughtError },
					);
				});
				expect(container.querySelector('main')).toBe(serverMain);
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
				const error = new Error('hydration resource failed');
				await act(() => resource.reject(error));
				expect(container.querySelector('*')).toBeNull();
				expect(container.textContent).toBe('');
				expect(observed.onUncaughtError.mock.calls.map((call) => call[0])).toEqual([error]);
				expect(observed.onLifecycle).not.toHaveBeenCalled();
				expect(observed.onRef).not.toHaveBeenCalled();
				expect(observed.onShellRef).not.toHaveBeenCalled();
			} finally {
				root?.unmount();
			}
		});

		it('does not adopt or attach callbacks after a suspended hydration is unmounted', async () => {
			const props = await serverScreen();
			const observed = observe();
			const resource = pendingResource();
			let root: ReturnType<typeof hydrateRoot> | undefined;
			try {
				await act(() => {
					root = hydrateRoot(
						container,
						RootSuspensionScreen,
						{ ...props, ...observed, promise: resource.promise, read: resource.read },
						{ onUncaughtError: observed.onUncaughtError },
					);
				});
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
				await act(() => root!.unmount());
				await act(() => resource.resolve('server data'));
				expect(container.querySelector('*')).toBeNull();
				expect(container.textContent).toBe('');
				expect(observed.onLifecycle).not.toHaveBeenCalled();
				expect(observed.onRef).not.toHaveBeenCalled();
				expect(observed.onShellRef).not.toHaveBeenCalled();
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
			} finally {
				root?.unmount();
			}
		});

		it('lets a current root render supersede an incomplete hydration and ignore its stale rejection', async () => {
			const props = await serverScreen();
			const observed = observe();
			const resource = pendingResource();
			let root: ReturnType<typeof hydrateRoot> | undefined;
			try {
				await act(() => {
					root = hydrateRoot(
						container,
						RootSuspensionScreen,
						{ ...props, ...observed, promise: resource.promise, read: resource.read },
						{ onUncaughtError: observed.onUncaughtError },
					);
				});
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
				await act(() =>
					root!.render(RootSuspensionScreen, {
						...readyProps('replacement', 'replacement data'),
						...observed,
					}),
				);
				const replacement = container.querySelector('[data-value]');
				expect(replacement?.textContent).toBe('replacement data');
				expect(container.querySelector('footer')?.textContent).toBe('replacement');
				const committedLifecycle = [...observed.onLifecycle.mock.calls];
				const committedRefs = [...observed.onRef.mock.calls];
				await act(() => resource.reject(new Error('abandoned hydration')));
				expect(container.querySelector('[data-value]')).toBe(replacement);
				expect(replacement?.textContent).toBe('replacement data');
				expect(observed.onLifecycle.mock.calls).toEqual(committedLifecycle);
				expect(observed.onRef.mock.calls).toEqual(committedRefs);
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
			} finally {
				root?.unmount();
			}
		});
	},
);

describe('hydrateRoot — Suspense data seeding (SSR Phase 4)', () => {
	it('preserves adopted descriptor DOM and state when an update suspends', async () => {
		const descriptorServer = loadServerFixture(
			'packages/octane/tests/_fixtures/suspense-timing.tsrx',
		);
		const props = { promise: Promise.resolve('initial'), label: 'reader' };
		const { html } = await prerender(descriptorServer.DescriptorRetryBoundary, props);
		container.innerHTML = html;
		const button = container.querySelector<HTMLButtonElement>('[data-value="reader"]')!;
		expect(button.textContent).toBe('initial:0');
		const onRecoverableError = vi.fn();
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			await act(() => {
				root = hydrateRoot(container, DescriptorRetryBoundary, props, { onRecoverableError });
			});
			expect(container.querySelector('[data-value="reader"]')).toBe(button);
			await act(() => button.click());
			expect(button.textContent).toBe('initial:1');
			let resolveNext!: (value: string) => void;
			const next = new Promise<string>((resolve) => {
				resolveNext = resolve;
			});
			await act(() => root!.render(DescriptorRetryBoundary, { ...props, promise: next }));
			expect(container.querySelector('[data-fallback="reader"]')?.textContent).toBe('loading');
			expect(container.querySelector('[data-value="reader"]')).toBe(button);
			expect(button.isConnected).toBe(true);
			await act(() => resolveNext('next'));
			expect(container.querySelector('[data-fallback="reader"]')).toBeNull();
			expect(container.querySelector('[data-value="reader"]')).toBe(button);
			expect(button.textContent).toBe('next:1');
			expect(onRecoverableError).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
		}
	});

	it('seeds the server value so use(promise) returns synchronously (no re-suspend, no rebuild)', async () => {
		const { html } = await prerender(server.AsyncLeaf, { promise: Promise.resolve('hello') });
		expect(html).toBe(
			'<!--3--><div id="leaf">hello</div>' +
				'<script type="application/json" data-octane-suspense>["hello"]</script>',
		);

		container.innerHTML = html;
		const div = container.querySelector('#leaf') as HTMLElement;
		const textNode = div.firstChild; // the server text node — must be adopted

		const root = hydrateRoot(container, AsyncLeaf, { promise: Promise.resolve('hello') });
		flushSync(() => {}); // drain (there should be no re-suspend / scheduled work)

		// Boundary did not re-suspend or rebuild: same element + text node adopted.
		expect(container.querySelector('#leaf')).toBe(div);
		expect(div.firstChild).toBe(textNode);
		expect(div.textContent).toBe('hello');
		// The seed <script> was consumed and removed from the live DOM.
		expect(container.querySelector('script[data-octane-suspense]')).toBeNull();
		root.unmount();
	});

	// A server and client from different Octane versions may not agree on what
	// the server's hydration ranges or seeds mean. The comment that opens the
	// root's output names the server's protocol version, and a root from another
	// version renders on the client, reporting why, instead of adopting ranges
	// it would misread or seeding values it would misplace.
	it.each([
		['an older server', ''],
		['a version 2 server', '<!--2-->'],
		['a newer server', '<!--4-->'],
	])('client-renders a seeded root that %s rendered, and reports it', async (_label, mark) => {
		const { html } = await prerender(server.AsyncLeaf, { promise: Promise.resolve('server') });
		expect(html).toContain('data-octane-suspense>');
		container.innerHTML = html.replace('<!--3-->', mark);
		const div = container.querySelector('#leaf') as HTMLElement;
		const recoverable: unknown[] = [];

		await act(async () => {
			hydrateRoot(
				container,
				AsyncLeaf,
				{ promise: Promise.resolve('client') },
				{ onRecoverableError: (error) => recoverable.push(error) },
			);
		});

		const leaf = container.querySelector('#leaf')!;
		expect(leaf).not.toBe(div);
		expect(leaf.textContent).toBe('client');
		expect(container.querySelector('script[data-octane-suspense]')).toBeNull();
		expect(recoverable).toEqual([
			expect.objectContaining({
				message: expect.stringContaining('hydration protocol'),
			}),
		]);
	});

	it('adopts a fulfilled resource without starting a client request and refetches when its input changes', async () => {
		const { html } = await prerender(factoryServer.SeededResource, {
			id: 'initial',
			load: (id: string) => Promise.resolve(`server-${id}`),
		});
		container.innerHTML = html;
		const serverNode = container.querySelector('#seeded-resource');
		const clientLoad = vi.fn((id: string) => Promise.resolve(`client-${id}`));

		const root = hydrateRoot(container, factoryClient.SeededResource, {
			id: 'initial',
			load: clientLoad,
		});
		flushSync(() => {});

		expect(container.querySelector('#seeded-resource')).toBe(serverNode);
		expect(serverNode?.textContent).toBe('server-initial');
		expect(clientLoad).not.toHaveBeenCalled();

		await act(() => root.render(factoryClient.SeededResource, { id: 'updated', load: clientLoad }));

		expect(clientLoad).toHaveBeenCalledExactlyOnceWith('updated');
		expect(container.querySelector('#seeded-resource')?.textContent).toBe('client-updated');
		root.unmount();
	});

	it('retries a resource caught on the server, starting the client request', async () => {
		const { html } = await prerender(factoryServer.SeededResource, {
			id: 'rejected',
			load: () => Promise.reject(new Error('server-rejection')),
		});
		container.innerHTML = html;
		expect(container.querySelector('#seeded-pending')).toBeNull();
		expect(container.querySelector('#seeded-error')?.textContent).toBe('server-rejection');
		const clientLoad = vi.fn(() => Promise.resolve('client-success'));
		const onRecoverableError = vi.fn();

		let root!: ReturnType<typeof hydrateRoot>;
		await act(async () => {
			root = hydrateRoot(
				container,
				factoryClient.SeededResource,
				{ id: 'rejected', load: clientLoad },
				{ onRecoverableError },
			);
		});
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(container.querySelector('#seeded-resource')?.textContent).toBe('client-success');
		});
		expect(container.querySelector('#seeded-pending, #seeded-error')).toBeNull();
		expect(clientLoad).toHaveBeenCalledWith('rejected');
		expect(onRecoverableError).not.toHaveBeenCalled();
		root.unmount();
	});

	it('adopts independent hoisted resources in order without starting either client request', async () => {
		const { html } = await prerender(factoryServer.SeededResourcePair, {
			id: 'initial',
			load: (name: string, id: string) => Promise.resolve(`${name}-${id}`),
		});
		container.innerHTML = html;
		const firstNode = container.querySelector('#first-seeded-resource');
		const secondNode = container.querySelector('#second-seeded-resource');
		const clientLoad = vi.fn(() => Promise.resolve('client-value'));

		const root = hydrateRoot(container, factoryClient.SeededResourcePair, {
			id: 'initial',
			load: clientLoad,
		});
		flushSync(() => {});

		expect(container.querySelector('#first-seeded-resource')).toBe(firstNode);
		expect(container.querySelector('#second-seeded-resource')).toBe(secondNode);
		expect(firstNode?.textContent).toBe('first-initial');
		expect(secondNode?.textContent).toBe('second-initial');
		expect(clientLoad).not.toHaveBeenCalled();
		root.unmount();
	});

	it('keeps existing promises on both sides of a skipped resource in their original seed positions', async () => {
		const { html } = await prerender(factoryServer.SeededMixedPromises, {
			id: 'middle',
			before: Promise.resolve('server-before'),
			after: Promise.resolve('server-after'),
			load: (id: string) => Promise.resolve(`server-${id}`),
		});
		container.innerHTML = html;
		const serverNode = container.querySelector('#seeded-mixed-promises');
		const clientLoad = vi.fn(() => Promise.resolve('client-middle'));

		const root = hydrateRoot(container, factoryClient.SeededMixedPromises, {
			id: 'middle',
			before: Promise.resolve('client-before'),
			after: Promise.resolve('client-after'),
			load: clientLoad,
		});
		flushSync(() => {});

		expect(container.querySelector('#seeded-mixed-promises')).toBe(serverNode);
		expect(serverNode?.textContent).toBe('server-before:server-middle:server-after');
		expect(clientLoad).not.toHaveBeenCalled();
		root.unmount();
	});

	it('evaluates an unseeded context factory without stealing the following resource seed', async () => {
		const context = createContext('context-value');
		const { html } = await prerender(factoryServer.SeededContextAndResource, {
			id: 'context',
			makeContext: () => context,
			load: (id: string) => Promise.resolve(`server-${id}`),
		});
		container.innerHTML = html;
		const serverNode = container.querySelector('#seeded-context-resource');
		const makeContext = vi.fn(() => context);
		const clientLoad = vi.fn(() => Promise.resolve('client-context'));

		const root = hydrateRoot(container, factoryClient.SeededContextAndResource, {
			id: 'context',
			makeContext,
			load: clientLoad,
		});
		flushSync(() => {});

		expect(container.querySelector('#seeded-context-resource')).toBe(serverNode);
		expect(serverNode?.textContent).toBe('context-value:server-context');
		expect(makeContext).toHaveBeenCalledOnce();
		expect(clientLoad).not.toHaveBeenCalled();
		root.unmount();
	});

	it('evaluates an externally owned factory without stealing the following resource seed', async () => {
		const { html } = await prerender(factoryServer.SeededExternalAndResource, {
			id: 'external',
			makeExternal: () => externallyFulfilled('external-value'),
			load: (id: string) => Promise.resolve(`server-${id}`),
		});
		container.innerHTML = html;
		const serverNode = container.querySelector('#seeded-external-resource');
		const makeExternal = vi.fn(() => externallyFulfilled('external-value'));
		const clientLoad = vi.fn(() => Promise.resolve('client-external'));

		const root = hydrateRoot(container, factoryClient.SeededExternalAndResource, {
			id: 'external',
			makeExternal,
			load: clientLoad,
		});
		flushSync(() => {});

		expect(container.querySelector('#seeded-external-resource')).toBe(serverNode);
		expect(serverNode?.textContent).toBe('external-value:server-external');
		expect(makeExternal).toHaveBeenCalledExactlyOnceWith('external');
		expect(clientLoad).not.toHaveBeenCalled();
		root.unmount();
	});

	it('distinguishes external and ordinary owners at the same repeated resource site', async () => {
		const { html } = await prerender(factoryServer.SeededRepeatedOwners, {
			makeExternal: () => externallyFulfilled('external-value'),
			load: (kind: string) => Promise.resolve(`server-${kind}`),
		});
		container.innerHTML = html;
		const externalNode = container.querySelector('[data-resource-kind="external"]');
		const ordinaryNode = container.querySelector('[data-resource-kind="ordinary"]');
		const makeExternal = vi.fn(() => externallyFulfilled('external-value'));
		const clientLoad = vi.fn(() => Promise.resolve('client-ordinary'));

		const root = hydrateRoot(container, factoryClient.SeededRepeatedOwners, {
			makeExternal,
			load: clientLoad,
		});
		flushSync(() => {});

		expect(container.querySelector('[data-resource-kind="external"]')).toBe(externalNode);
		expect(container.querySelector('[data-resource-kind="ordinary"]')).toBe(ordinaryNode);
		expect(externalNode?.textContent).toBe('external-value');
		expect(ordinaryNode?.textContent).toBe('server-ordinary');
		expect(makeExternal).toHaveBeenCalledExactlyOnceWith('external');
		expect(clientLoad).not.toHaveBeenCalled();
		root.unmount();
	});

	it('does not emit suspense seed scripts for context-only or externally owned resources', async () => {
		const context = createContext('context-only');
		const contextRender = await prerender(factoryServer.ContextWithoutSeed, {
			makeContext: () => context,
		});
		expect(contextRender.html).toContain('context-only');
		expect(contextRender.html).not.toContain('data-octane-suspense');

		const externalRender = await prerender(factoryServer.ExternalWithoutSeed, {
			makeExternal: () => externallyFulfilled('external-only'),
		});
		expect(externalRender.html).toContain('external-only');
		expect(externalRender.html).not.toContain('data-octane-suspense');
	});

	it('adopts nested streamed resource scopes without starting either client request', async () => {
		const chunks: string[] = [];
		let finish!: () => void;
		const completed = new Promise<void>((resolve) => {
			finish = resolve;
		});
		ServerRT.renderToPipeableStream(factoryServer.SeededNestedStream, {
			id: 'streamed',
			load: (name: string, id: string) => Promise.resolve(`${name}-${id}`),
		}).pipe({
			write(chunk: string | Uint8Array) {
				chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
				return true;
			},
			end: finish,
		});
		await completed;
		container.innerHTML = chunks.join('');

		try {
			for (const script of Array.from(container.querySelectorAll('script'))) {
				if (script.getAttribute('type') === 'application/json') continue;
				// eslint-disable-next-line no-eval
				(0, eval)(script.textContent || '');
				script.remove();
			}

			const outerNode = container.querySelector('#streamed-outer-resource');
			const innerNode = container.querySelector('#streamed-inner-resource');
			const clientLoad = vi.fn(() => Promise.resolve('client-streamed'));
			const root = hydrateRoot(container, factoryClient.SeededNestedStream, {
				id: 'streamed',
				load: clientLoad,
			});
			flushSync(() => {});

			expect(container.querySelector('#streamed-outer-resource')).toBe(outerNode);
			expect(container.querySelector('#streamed-inner-resource')).toBe(innerNode);
			expect(outerNode?.textContent).toBe('outer-streamed');
			expect(innerNode?.textContent).toBe('inner-streamed');
			expect(clientLoad).not.toHaveBeenCalled();
			root.unmount();
		} finally {
			delete (window as any).$OCTS;
			delete (window as any).$OCTRC;
			delete (window as any).$OCTRX;
		}
	});

	it('adopts a deferred resource after activation without starting a client request', async () => {
		const dormant = condition(false);
		const { html } = await prerender(factoryServer.DeferredSeededResource, {
			id: 'deferred',
			when: dormant,
			load: (id: string) => Promise.resolve(`server-${id}`),
		});
		container.innerHTML = html;
		const serverButton = container.querySelector('#deferred-seeded-resource');
		const clientLoad = vi.fn(() => Promise.resolve('client-deferred'));
		const root = hydrateRoot(container, factoryClient.DeferredSeededResource, {
			id: 'deferred',
			when: dormant,
			load: clientLoad,
		});
		await act(() => {});
		expect(container.querySelector('#deferred-seeded-resource')).toBe(serverButton);
		expect(clientLoad).not.toHaveBeenCalled();

		await act(() =>
			root.render(factoryClient.DeferredSeededResource, {
				id: 'deferred',
				when: condition(true),
				load: clientLoad,
			}),
		);

		expect(container.querySelector('#deferred-seeded-resource')).toBe(serverButton);
		expect(serverButton?.textContent).toBe('server-deferred');
		expect(clientLoad).not.toHaveBeenCalled();
		root.unmount();
	});

	it('round-trips an undefined-resolving use() as undefined, not null', async () => {
		const { html } = await prerender(server.AsyncUndef, {
			promise: Promise.resolve(undefined),
		});
		// Server saw `undefined` and the seed encodes it via a scalar wire escape — NOT
		// `[null]` (which a naive JSON.stringify of `[undefined]` would produce).
		expect(html).toContain('<div id="undef">is-undefined</div>');
		expect(html).toContain('\\u0000octane:ssr-seed:u');
		expect(html).not.toContain('>[null]<');

		container.innerHTML = html;
		const div = container.querySelector('#undef') as HTMLElement;
		const root = hydrateRoot(container, AsyncUndef, { promise: Promise.resolve(undefined) });
		flushSync(() => {});

		// The seeded value hydrated as `undefined` (not `null`): same discriminant,
		// adopted (not rebuilt), seed script consumed.
		expect(container.querySelector('#undef')).toBe(div);
		expect(div.textContent).toBe('is-undefined');
		expect(container.querySelector('script[data-octane-suspense]')).toBeNull();
		root.unmount();
	});

	it('reads the seed value, not the client promise (server is the source of truth)', async () => {
		// Server resolved to 'server-value'; hand the client a DIFFERENT promise.
		// The seeded value must win — the client must not re-fetch / re-suspend.
		const { html } = await prerender(server.AsyncLeaf, {
			promise: Promise.resolve('server-value'),
		});
		container.innerHTML = html;
		const div = container.querySelector('#leaf') as HTMLElement;

		const root = hydrateRoot(container, AsyncLeaf, { promise: Promise.resolve('client-value') });
		flushSync(() => {});

		expect(div.textContent).toBe('server-value');
		root.unmount();
	});

	it('composes seeded use() with a stateful, interactive counter (the example app shape)', async () => {
		const { html } = await prerender(server.AsyncCounter, {
			promise: Promise.resolve('Hi'),
		});
		expect(html).toBe(
			'<!--3--><main id="ac"><h1>Hi</h1><button id="ac-btn">count:0</button></main>' +
				'<script type="application/json" data-octane-suspense>["Hi"]</script>',
		);

		container.innerHTML = html;
		const before = container.querySelector('#ac')!.outerHTML;
		const root = hydrateRoot(container, AsyncCounter, { promise: Promise.resolve('Hi') });
		flushSync(() => {});
		// No mismatch: the #ac subtree is unchanged after hydrateRoot.
		expect(container.querySelector('#ac')!.outerHTML).toBe(before);

		// Click → re-render. The counter updates AND the seeded use() does not
		// re-suspend (the greeting stays put, no fallback / blank).
		const btn = container.querySelector('#ac-btn') as HTMLButtonElement;
		flushSync(() => btn.click());
		expect(container.querySelector('#ac-btn')!.textContent).toBe('count:1');
		expect(container.querySelector('#ac h1')!.textContent).toBe('Hi');
		root.unmount();
	});
});

// A Suspense boundary's server range records what the server rendered for it:
// its content, a streamed fallback whose content has not arrived, or a fallback
// left for the client after the server's render threw. In each state the
// boundary hydrates without disturbing the server DOM around it, and the
// `useId` values the server reserved inside it keep later ids in step.
const STATES_SOURCE = `
	import { Suspense, use, useId } from 'octane';

	function Tail() @{
		const id = useId();
		<footer id="states-after">{id as string}</footer>
	}

	export function BoundaryStates(props) @{
		<main>
			<header id="states-before">{'before' as string}</header>
			@try {
				const id = useId();
				const value = use(props.value);
				<p id="states-content" data-id={id}>{value as string}</p>
			} @pending {
				<i id="states-fallback">{'loading' as string}</i>
			}
			<Tail />
		</main>
	}

	function SuspenseContent(props) @{
		const id = useId();
		const value = use(props.value);
		<p id="states-content" data-id={id}>{value as string}</p>
	}

	export function JsxBoundaryStates(props) @{
		<main>
			<header id="states-before">{'before' as string}</header>
			<Suspense fallback={<i id="states-fallback">{'loading' as string}</i>}>
				<SuspenseContent value={props.value} />
			</Suspense>
			<Tail />
		</main>
	}

	export function CatchingStates(props) @{
		<main>
			<header id="states-before">{'before' as string}</header>
			@try {
				const value = use(props.value);
				if (value === 'boom') throw new Error('boom');
				<p id="states-content">{value as string}</p>
			} @pending {
				<i id="states-fallback">{'loading' as string}</i>
			} @catch (error) {
				<b id="states-error">{(error as Error).message as string}</b>
			}
			<Tail />
		</main>
	}

	export function NestedCatchingStates(props) @{
		<main>
			<header id="states-before">{'before' as string}</header>
			@try {
				const id = useId();
				<section data-id={id}>
					@try {
						const value = use(props.value);
						if (value === 'boom') throw new Error('boom');
						<p id="states-content">{value as string}</p>
					} @pending {
						<i id="states-fallback">{'loading' as string}</i>
					}
				</section>
			} @catch (error) {
				<b id="states-error">{(error as Error).message as string}</b>
			}
			<Tail />
		</main>
	}

	function SeededTail(props) @{
		const value = use(props.value);
		<footer id="states-after">{value as string}</footer>
	}

	export function SeededNestedCatchingStates(props) @{
		<main>
			@try {
				const primary = use(props.primary);
				<section data-primary={primary}>
					@try {
						const value = use(props.value);
						if (value === 'boom') throw new Error('boom');
						<p id="states-content">{value as string}</p>
					} @pending {
						<i id="states-fallback">{'loading' as string}</i>
					}
				</section>
			} @catch (error) {
				<b id="states-error">{(error as Error).message as string}</b>
			}
			<SeededTail value={props.sibling} />
		</main>
	}

	function LifecycleTail(props) @{
		props.beforeRead?.();
		const id = useId();
		const value = use(props.value);
		<footer id="states-after" data-id={id}>{value as string}</footer>
	}

	function ShellGate(props) @{
		props.beforeRead?.();
		const value = use(props.value);
		<aside>{value as string}</aside>
	}

	export function LifecycleNestedCatchingStates(props) @{
		<main>
			@try {
				<section>
					@if (props.phase.ready) {
						const primary = use(props.primary);
						const id = useId();
						<output data-id={id}>{primary as string}</output>
					}
					@try {
						const value = use(props.value);
						<p id="states-content">{value as string}</p>
					} @pending {
						<i id="states-fallback">{'loading' as string}</i>
					}
				</section>
			} @catch (error) {
				<b id="states-error">{(error as Error).message as string}</b>
			}
			<LifecycleTail value={props.sibling} />
			<ShellGate value={props.shell} beforeRead={props.beforeShellRead} />
		</main>
	}

	export function WithheldCatchingStates(props) @{
		<main>
			@try {
				<section>
					@try {
						const inner = use(props.inner);
						<div data-inner={inner}>
							@try {
								const primary = use(props.primary);
								const id = useId();
								<article data-id={id} data-primary={primary}>
									@try {
										const value = use(props.value);
										<p id="states-content">{value as string}</p>
									} @pending {
										<i id="states-fallback">{'loading' as string}</i>
									}
								</article>
							} @catch (error) {
								props.onCatch?.();
								<b id="states-error">{(error as Error).message as string}</b>
							}
							<LifecycleTail value={props.sibling} beforeRead={props.afterGuard} />
						</div>
					} @pending {
						<i id="states-inner-fallback">{'inner loading' as string}</i>
					}
					<ShellGate value={props.outer} />
				</section>
			} @pending {
				<i id="states-outer-fallback">{'outer loading' as string}</i>
			}
		</main>
	}
`;

describe.each([true, false])('a Suspense boundary in each server state (dev=%s)', (dev) => {
	const statesServer = loadCompiledFixtureSource(STATES_SOURCE, {
		id: 'boundary-states.tsrx',
		mode: 'server',
		compileOptions: { dev },
	});
	const statesClient = loadCompiledFixtureSource(STATES_SOURCE, {
		id: 'boundary-states.tsrx',
		mode: 'client',
		compileOptions: { dev },
	});
	afterEach(() => resetStreamRuntimeGlobals());

	async function hydrateStates(value: Promise<string>, name = 'BoundaryStates') {
		const before = container.querySelector('#states-before')!;
		const after = container.querySelector('#states-after')!;
		const afterId = after.textContent;
		const recoverable: string[] = [];
		const root = hydrateRoot(
			container,
			statesClient[name],
			{ value },
			{ onRecoverableError: (error) => recoverable.push((error as Error).message) },
		);
		await act(async () => {});
		await vi.waitFor(() => expect(container.querySelector('#states-fallback')).toBeNull());
		// The server's nodes around the boundary, and the id after it, survive.
		expect(container.querySelector('#states-before')).toBe(before);
		expect(container.querySelector('#states-after')).toBe(after);
		expect(after.textContent).toBe(afterId);
		return { root, recoverable };
	}

	it('adopts the content the server rendered', async () => {
		container.innerHTML = (
			await prerender(statesServer.BoundaryStates, { value: Promise.resolve('server') })
		).html;
		const content = container.querySelector('#states-content')!;
		const id = content.getAttribute('data-id');

		const { root, recoverable } = await hydrateStates(new Promise<string>(() => {}));
		expect(container.querySelector('#states-content')).toBe(content);
		expect(content.textContent).toBe('server');
		expect(content.getAttribute('data-id')).toBe(id);
		expect(recoverable).toEqual([]);
		root.unmount();
	});

	it('adopts the content the server rendered without inserting a node', async () => {
		container.innerHTML = (
			await prerender(statesServer.BoundaryStates, { value: Promise.resolve('server') })
		).html;
		const added: Node[] = [];
		const observer = new MutationObserver((records) => {
			for (const record of records) added.push(...record.addedNodes);
		});
		observer.observe(container, { childList: true, subtree: true, characterData: true });

		const { root } = await hydrateStates(new Promise<string>(() => {}));
		observer.disconnect();
		expect(added).toEqual([]);
		root.unmount();
	});

	it('shows its fallback beside the hydrated content while an update suspends', async () => {
		container.innerHTML = (
			await prerender(statesServer.BoundaryStates, { value: Promise.resolve('server') })
		).html;
		const content = container.querySelector<HTMLElement>('#states-content')!;
		const { root, recoverable } = await hydrateStates(new Promise<string>(() => {}));
		const after = container.querySelector<HTMLElement>('#states-after')!;

		// Each pending value suspends the hydrated content again behind one fallback.
		for (const label of ['first', 'second']) {
			let resolve!: (value: string) => void;
			const value = new Promise<string>((done) => (resolve = done));
			await act(() => root.render(statesClient.BoundaryStates, { value }));
			// The parent renders again while the content is still pending.
			await act(() => root.render(statesClient.BoundaryStates, { value }));
			const fallback = container.querySelector<HTMLElement>('#states-fallback')!;
			expect(fallback.textContent).toBe('loading');
			expect(fallback.style.display).toBe('');
			expect(content.isConnected).toBe(true);
			expect(content.style.display).toBe('none');
			expect(after.style.display).toBe('');
			expect(container.querySelectorAll('#states-fallback')).toHaveLength(1);

			await act(async () => resolve(label));
			await vi.waitFor(() => expect(container.querySelector('#states-fallback')).toBeNull());
			expect(container.querySelector('#states-content')).toBe(content);
			expect(content.textContent).toBe(label);
			expect(content.style.display).toBe('');
			expect(
				content.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
		}
		expect(recoverable).toEqual([]);
		root.unmount();
	});

	it('shows its fallback beside the hydrated content when a held transition times out', async () => {
		container.innerHTML = (
			await prerender(statesServer.BoundaryStates, { value: Promise.resolve('server') })
		).html;
		const content = container.querySelector<HTMLElement>('#states-content')!;
		const { root, recoverable } = await hydrateStates(new Promise<string>(() => {}));
		const after = container.querySelector<HTMLElement>('#states-after')!;
		// Fake timers decide when the timeout elapses: whether a real 0 ms timer
		// fires inside act depends on the runtime build's task ordering.
		vi.useFakeTimers({ shouldAdvanceTime: false });
		setTransitionFallbackTimeout(100);
		try {
			let resolve!: (value: string) => void;
			const value = new Promise<string>((done) => (resolve = done));
			await act(() => startTransition(() => root.render(statesClient.BoundaryStates, { value })));
			await vi.advanceTimersByTimeAsync(99);
			expect(container.querySelector('#states-fallback')).toBeNull();
			await vi.advanceTimersByTimeAsync(1);
			const fallback = container.querySelector<HTMLElement>('#states-fallback')!;
			expect(fallback.style.display).toBe('');
			expect(content.style.display).toBe('none');
			expect(after.style.display).toBe('');

			await act(async () => resolve('late'));
			expect(container.querySelector('#states-fallback')).toBeNull();
			expect(container.querySelector('#states-content')).toBe(content);
			expect(content.textContent).toBe('late');
			expect(content.style.display).toBe('');
		} finally {
			setTransitionFallbackTimeout(Infinity);
			vi.useRealTimers();
		}
		expect(recoverable).toEqual([]);
		root.unmount();
	});

	it('replaces what a hydrated boundary showed when its content then throws', async () => {
		container.innerHTML = (
			await prerender(statesServer.CatchingStates, { value: Promise.resolve('server') })
		).html;
		const before = container.querySelector('#states-before')!;
		const recoverable: string[] = [];
		const root = hydrateRoot(
			container,
			statesClient.CatchingStates,
			{ value: new Promise<string>(() => {}) },
			{ onRecoverableError: (error) => recoverable.push((error as Error).message) },
		);
		await act(async () => {});
		const after = container.querySelector('#states-after')!;

		let resolve!: (value: string) => void;
		const value = new Promise<string>((done) => (resolve = done));
		await act(() => root.render(statesClient.CatchingStates, { value }));
		expect(container.querySelector('#states-fallback')).not.toBeNull();
		// Everything the boundary showed: the hidden content, the fallback, and
		// whatever separates them, between its opening node and the closing one
		// before the next component's.
		const close = after.previousSibling!.previousSibling;
		const shown: Node[] = [];
		for (let node = before.nextSibling!.nextSibling; node !== close; node = node!.nextSibling)
			shown.push(node!);

		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		await act(async () => resolve('boom'));
		await vi.waitFor(() => expect(container.querySelector('#states-error')).not.toBeNull());
		errors.mockRestore();
		expect(container.querySelector('#states-error')!.textContent).toBe('boom');
		expect(shown.filter((node) => node.isConnected)).toEqual([]);
		expect(recoverable).toEqual([]);
		root.unmount();
	});

	/** Stream the boundary's shell into the container, leaving its content pending. */
	function streamShell(name = 'BoundaryStates', props: Record<string, unknown> = {}) {
		const server = deferred<string>();
		const collector = createPipeableCollector();
		ServerRT.renderToPipeableStream(
			statesServer[name],
			{ ...props, value: server.promise },
			{ onError: () => {} },
		).pipe(collector.destination);
		container.innerHTML = collector.chunks[0]!;
		activateStreamedMarkup(container);
		const deliver = async () => {
			await collector.ended;
			const late = document.createElement('div');
			late.innerHTML = collector.chunks.slice(1).join('');
			container.append(...late.childNodes);
			activateStreamedMarkup(container);
		};
		return { server, deliver };
	}

	function lifecycleStream() {
		const phase = { ready: false };
		const shell = deferred<string>();
		const descendant = deferred<string>();
		const reachedGate = deferred<void>();
		const shellReady = deferred<void>();
		const collector = createPipeableCollector();
		ServerRT.renderToPipeableStream(
			statesServer.LifecycleNestedCatchingStates,
			{
				phase,
				primary: fulfilled('primary-server'),
				value: descendant.promise,
				sibling: fulfilled('sibling-server'),
				shell: shell.promise,
				beforeShellRead: () => reachedGate.resolve(undefined),
			},
			{ onShellReady: () => shellReady.resolve(undefined) },
		).pipe(collector.destination);
		return { phase, shell, descendant, reachedGate, shellReady, collector };
	}

	function hydratePending(
		value: Promise<string>,
		name = 'BoundaryStates',
		props: Record<string, unknown> = {},
	) {
		const recoverable: string[] = [];
		const caught: unknown[] = [];
		const root = hydrateRoot(
			container,
			statesClient[name],
			{ ...props, value },
			{
				onRecoverableError: (error) => recoverable.push((error as Error).message),
				onCaughtError: (error) => caught.push(error),
			},
		);
		return { root, recoverable, caught };
	}

	/** A thenable use() reads synchronously. */
	function fulfilled(value: string): Promise<string> {
		return Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
	}

	// As React leaves a dehydrated boundary whose content is still streaming,
	// the boundary keeps the server's fallback until the stream swaps its
	// content in, and the swap's retry then hydrates that content.
	it('keeps the fallback of a streamed boundary whose content has not arrived, then hydrates its content', async () => {
		const { server, deliver } = streamShell();
		const fallback = container.querySelector('#states-fallback')!;
		const before = container.querySelector('#states-before')!;
		const after = container.querySelector('#states-after')!;
		const afterId = after.textContent;

		const { root, recoverable } = hydratePending(Promise.resolve('client'));
		await act(async () => {});
		expect(container.querySelector('#states-fallback')).toBe(fallback);
		expect(container.querySelector('#states-content')).toBeNull();
		expect(container.querySelector('#states-before')).toBe(before);
		expect(container.querySelector('#states-after')).toBe(after);
		expect(after.textContent).toBe(afterId);

		server.resolve('server');
		await deliver();
		const content = container.querySelector('#states-content')!;
		expect(content.textContent).toBe('server');
		const id = content.getAttribute('data-id');
		await act(async () => {});
		expect(container.querySelector('#states-content')).toBe(content);
		expect(content.getAttribute('data-id')).toBe(id);
		expect(recoverable).toEqual([]);

		// The content hydrated: an update patches the server's node.
		await act(() => root.render(statesClient.BoundaryStates, { value: fulfilled('next') }));
		expect(container.querySelector('#states-content')).toBe(content);
		expect(content.textContent).toBe('next');
		root.unmount();
	});

	it('renders a waiting JSX Suspense boundary on the client and reports it when its stream errors', async () => {
		const { server, deliver } = streamShell('JsxBoundaryStates');
		const { root, recoverable } = hydratePending(Promise.resolve('client'), 'JsxBoundaryStates');
		await act(async () => {});
		expect(container.querySelector('#states-fallback')).not.toBeNull();

		server.reject(new Error('server failed'));
		await deliver();
		await act(async () => {});
		await vi.waitFor(() => expect(container.querySelector('#states-fallback')).toBeNull());
		expect(container.querySelector('#states-content')!.textContent).toBe('client');
		expect(recoverable).toEqual([
			expect.stringContaining('likely due to an error during server rendering'),
		]);
		root.unmount();
	});

	it('activates before a streamed catch arm arrives without disturbing surrounding content', async () => {
		const { server, deliver } = streamShell('CatchingStates');
		const before = container.querySelector('#states-before');
		const after = container.querySelector('#states-after');
		const { root, recoverable, caught } = hydratePending(Promise.resolve('boom'), 'CatchingStates');
		await act(async () => {});
		expect(container.querySelector('#states-fallback')?.textContent).toBe('loading');

		server.resolve('boom');
		await deliver();
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(container.querySelector('#states-error')?.textContent).toBe('boom');
		});
		expect(container.querySelector('#states-fallback')).toBeNull();
		expect(container.querySelector('#states-before')).toBe(before);
		expect(container.querySelector('#states-after')).toBe(after);
		expect(recoverable).toEqual([]);
		expect(caught).toEqual([expect.objectContaining({ message: 'boom' })]);
		root.unmount();
	});

	it('settles a waiting descendant when its enclosing server catch arrives after activation', async () => {
		const { server, deliver } = streamShell('NestedCatchingStates');
		const before = container.querySelector('#states-before');
		const after = container.querySelector('#states-after')!;
		const afterId = after.textContent;
		expect(before?.textContent).toBe('before');
		const { root, recoverable, caught } = hydratePending(
			Promise.resolve('client'),
			'NestedCatchingStates',
		);
		await act(async () => {});
		expect(container.querySelector('#states-fallback')?.textContent).toBe('loading');

		server.resolve('boom');
		await deliver();
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(container.querySelector('#states-content')?.textContent).toBe('client');
		});
		expect(container.querySelector('#states-fallback, #states-error')).toBeNull();
		expect(container.querySelector('#states-before')).toBe(before);
		expect(container.querySelector('#states-after')).toBe(after);
		expect(after.textContent).toBe(afterId);
		expect(recoverable).toEqual([]);
		expect(caught).toEqual([]);
		root.unmount();
	});

	it('retries an enclosing catch delivered before activation and preserves later ids', async () => {
		const { server, deliver } = streamShell('NestedCatchingStates');
		const after = container.querySelector('#states-after')!;
		const afterId = after.textContent;
		server.resolve('boom');
		await deliver();
		expect(container.querySelector('#states-error')?.textContent).toBe('boom');

		const { root, recoverable, caught } = hydratePending(
			Promise.resolve('client'),
			'NestedCatchingStates',
		);
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(container.querySelector('#states-content')?.textContent).toBe('client');
		});
		expect(container.querySelector('#states-after')).toBe(after);
		expect(after.textContent).toBe(afterId);
		expect(recoverable).toEqual([]);
		expect(caught).toEqual([]);
		root.unmount();
	});

	it('keeps a later resource seed aligned after a streamed enclosing catch replaces its primary', async () => {
		const { server, deliver } = streamShell('SeededNestedCatchingStates', {
			primary: fulfilled('primary-server'),
			sibling: fulfilled('sibling-server'),
		});
		const sibling = container.querySelector('#states-after')!;
		expect(sibling.textContent).toBe('sibling-server');
		server.resolve('boom');
		await deliver();
		expect(container.querySelector('#states-error')?.textContent).toBe('boom');

		const { root, recoverable, caught } = hydratePending(
			fulfilled('client'),
			'SeededNestedCatchingStates',
			{ primary: fulfilled('primary-client'), sibling: new Promise<string>(() => {}) },
		);
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(container.querySelector('#states-content')?.textContent).toBe('client');
		});
		expect(container.querySelector('#states-after')).toBe(sibling);
		expect(sibling.textContent).toBe('sibling-server');
		expect(container.querySelector('section')?.getAttribute('data-primary')).toBe('primary-client');
		expect(recoverable).toEqual([]);
		expect(caught).toEqual([]);
		root.unmount();
	});

	it('preserves sibling resources and ids when the accepted shell changes before a late catch', async () => {
		const { phase, shell, descendant, reachedGate, shellReady, collector } = lifecycleStream();
		await reachedGate.promise;
		expect(collector.chunks).toEqual([]);
		phase.ready = true;
		shell.resolve('shell');
		await shellReady.promise;
		expect(collector.chunks.join('')).toContain('primary-server');

		descendant.reject(new Error('late failure'));
		container.innerHTML = await collector.ended;
		activateStreamedMarkup(container);
		expect(container.querySelector('#states-error')?.textContent).toBe('late failure');
		const sibling = container.querySelector('#states-after')!;
		const siblingId = sibling.getAttribute('data-id');
		expect(sibling.textContent).toBe('sibling-server');
		expect(siblingId).toBeTruthy();

		const { root, recoverable, caught } = hydratePending(
			fulfilled('client'),
			'LifecycleNestedCatchingStates',
			{
				phase,
				primary: fulfilled('primary-client'),
				sibling: fulfilled('sibling-client'),
				shell: fulfilled('shell'),
			},
		);
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(container.querySelector('#states-content')?.textContent).toBe('client');
		});
		expect(container.querySelector('#states-after')).toBe(sibling);
		expect(sibling.textContent).toBe('sibling-server');
		expect(sibling.getAttribute('data-id')).toBe(siblingId);
		expect(recoverable).toEqual([]);
		expect(caught).toEqual([]);
		root.unmount();
	});

	it('includes an enclosing catch in the shell when its descendant rejects before the shell', async () => {
		const { shell, descendant, reachedGate, collector } = lifecycleStream();
		await reachedGate.promise;
		expect(collector.chunks).toEqual([]);
		descendant.reject(new Error('pre-shell failure'));
		shell.resolve('shell');
		await collector.ended;
		container.innerHTML = collector.chunks[0]!;
		expect(container.querySelector('#states-error')?.textContent).toBe('pre-shell failure');
		expect(container.querySelector('#states-fallback')).toBeNull();
		expect(container.querySelector('#states-after')?.textContent).toBe('sibling-server');
	});

	it('reveals an authored catch when its nested segment fails before an outer segment is ready', async () => {
		const outer = deferred<string>();
		const inner = deferred<string>();
		const descendant = deferred<string>();
		const reachedSibling = deferred<void>();
		const reachedCatch = deferred<void>();
		const collector = createPipeableCollector();
		ServerRT.renderToPipeableStream(statesServer.WithheldCatchingStates, {
			outer: outer.promise,
			inner: inner.promise,
			value: descendant.promise,
			primary: fulfilled('primary-server'),
			sibling: fulfilled('sibling-server'),
			afterGuard: () => reachedSibling.resolve(undefined),
			onCatch: () => reachedCatch.resolve(undefined),
		}).pipe(collector.destination);
		container.innerHTML = collector.chunks[0]!;
		expect(container.querySelector('#states-outer-fallback')?.textContent).toBe('outer loading');

		inner.resolve('inner-server');
		await reachedSibling.promise;
		descendant.reject(new Error('withheld failure'));
		await reachedCatch.promise;
		outer.resolve('outer-server');
		container.innerHTML = await collector.ended;
		activateStreamedMarkup(container);
		expect(container.querySelector('#states-error')?.textContent).toBe('withheld failure');
		expect(
			container.querySelector('#states-fallback, #states-inner-fallback, #states-outer-fallback'),
		).toBeNull();
		const sibling = container.querySelector('#states-after')!;
		const siblingId = sibling.getAttribute('data-id');
		expect(sibling.textContent).toBe('sibling-server');
		expect(siblingId).toBeTruthy();

		const { root, recoverable, caught } = hydratePending(
			fulfilled('client'),
			'WithheldCatchingStates',
			{
				outer: fulfilled('outer-client'),
				inner: fulfilled('inner-client'),
				primary: fulfilled('primary-client'),
				sibling: fulfilled('sibling-client'),
			},
		);
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(container.querySelector('#states-content')?.textContent).toBe('client');
		});
		expect(container.querySelector('#states-after')).toBe(sibling);
		expect(sibling.textContent).toBe('sibling-server');
		expect(sibling.getAttribute('data-id')).toBe(siblingId);
		expect(recoverable).toEqual([]);
		expect(caught).toEqual([]);
		root.unmount();
	});

	it('renders a waiting streamed boundary on the client when an update reaches it', async () => {
		const { server, deliver } = streamShell();
		const { root, recoverable } = hydratePending(Promise.resolve('client'));
		await act(async () => {});
		expect(container.querySelector('#states-fallback')).not.toBeNull();

		// As React does for an update that reaches a pending dehydrated boundary.
		await act(() => root.render(statesClient.BoundaryStates, { value: fulfilled('update') }));
		expect(container.querySelector('#states-fallback')).toBeNull();
		expect(container.querySelector('#states-content')!.textContent).toBe('update');

		// The late segment finds no boundary to fill: the client owns it now.
		server.resolve('server');
		await deliver();
		await act(async () => {});
		expect(container.querySelectorAll('#states-content')).toHaveLength(1);
		expect(container.querySelector('#states-content')!.textContent).toBe('update');
		expect(recoverable).toEqual([]);
		root.unmount();
	});

	it('renders a JSX Suspense boundary whose server render threw on the client, and reports it', async () => {
		const errors: unknown[] = [];
		container.innerHTML = (
			await prerender(
				statesServer.JsxBoundaryStates,
				{ value: Promise.reject(new Error('server failed')) },
				{ onError: (error) => errors.push(error) },
			)
		).html;
		expect(errors).toEqual([expect.objectContaining({ message: 'server failed' })]);
		expect(container.querySelector('#states-content')).toBeNull();

		const { root, recoverable } = await hydrateStates(
			Promise.resolve('client'),
			'JsxBoundaryStates',
		);
		expect(container.querySelector('#states-content')!.textContent).toBe('client');
		expect(recoverable).toEqual([
			expect.stringContaining('could not finish this Suspense boundary'),
		]);
		root.unmount();
	});
});
