import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import {
	EXTERNAL_HYDRATION_PROMISE,
	act,
	createContext,
	hydrateRoot,
	flushSync,
} from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { condition } from 'octane/hydration';
import { prerender } from 'octane/static';
import { loadCompiledFixtureSource } from '../_server-fixture.js';
// CLIENT-compiled components (normal .tsrx import path). Importing AsyncCounter
// (which has an onClick) makes this module register click delegation at load.
import { AsyncLeaf, AsyncCounter, AsyncUndef } from '../_fixtures/ssr-suspense.tsrx';

// SSR Phase 4 — client hydration seeds the server-resolved use(thenable) values
// from the inline data <script>, so a hydrating use() returns synchronously
// instead of re-suspending (and the adopted DOM is not rebuilt).

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/ssr-suspense.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'ssr-suspense.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
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

describe('hydrateRoot — Suspense data seeding (SSR Phase 4)', () => {
	it('seeds the server value so use(promise) returns synchronously (no re-suspend, no rebuild)', async () => {
		const { html } = await prerender(server.AsyncLeaf, { promise: Promise.resolve('hello') });
		expect(html).toBe(
			'<div id="leaf">hello</div>' +
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

	it('adopts a rejected resource without starting a client request or replacing the server catch', async () => {
		const { html } = await prerender(factoryServer.SeededResource, {
			id: 'rejected',
			load: () => Promise.reject(new Error('server-rejection')),
		});
		container.innerHTML = html;
		const serverCatch = container.querySelector('#seeded-error');
		const clientLoad = vi.fn(() => Promise.resolve('client-success'));

		const root = hydrateRoot(container, factoryClient.SeededResource, {
			id: 'rejected',
			load: clientLoad,
		});
		flushSync(() => {});

		expect(container.querySelector('#seeded-error')).toBe(serverCatch);
		expect(serverCatch?.textContent).toBe('server-rejection');
		expect(clientLoad).not.toHaveBeenCalled();
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
			'<main id="ac"><h1>Hi</h1><button id="ac-btn">count:0</button></main>' +
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
