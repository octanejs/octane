import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { componentSlot, createRoot, enableSignalBindings, type Scope } from '../../src/runtime.js';
import {
	enableNativeReadCollection,
	enableServerSignalBindings,
	renderToString,
	ssrChild,
	ssrComponent,
	ssrHtml,
	ssrInputAttrs,
	ssrSignalControlAttrs,
	ssrSignalControlValue,
} from '../../src/runtime.server.js';
import {
	__signalAt,
	currentSignalOwner,
	installSignalOwnerEnvironment,
	runWithSignalOwner,
	type SignalOwner,
} from '../../src/signals/index.js';

function currentInstanceKey(): string {
	return (currentSignalOwner() as { instanceKey?: string } | null)?.instanceKey ?? 'missing';
}

describe('signal component instance identity', () => {
	beforeAll(async () => {
		// Compile-tooling setup is separate from the behavior checks. Each cold
		// scenario still executes a fresh runtime graph after resetModules().
		await import('../_server-fixture.js');
	});

	it.each([false, true])(
		'renders an ordinary object-keyed list without stringifying its keys (development: %s)',
		async (dev) => {
			vi.resetModules();
			const server = await import('../../src/runtime.server.js');
			const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
			const { collectPipeableStream, collectReadableStream } = await import('../_server-stream.js');
			const source = `function Row(props) @{ <p>{props.label as string}</p> }
export function App(props) @{
 <main>@for (const item of props.items; key item.key) { <Row label={item.label} /> }</main>
}`;
			const { App } = loadCompiledFixtureSource(source, {
				id: '/src/keyed-server-output.tsrx',
				mode: 'server',
				compileOptions: { dev, hmr: false },
			});
			const items = ['first', 'second'].map((label) => ({
				label,
				key: {
					[Symbol.toPrimitive]() {
						throw new Error('A reconciliation key is not rendered text.');
					},
				},
			}));
			const outputs: { html: string; signals?: unknown }[] = [
				server.renderToString(App, { items }),
				server.renderToStaticMarkup(App, { items }),
				await server.prerender(App, { items }),
			];
			for (const collect of [collectPipeableStream, collectReadableStream]) {
				const output = await collect(App, { items });
				expect(output.errors).toEqual([]);
				outputs.push(output);
			}
			for (const output of outputs) {
				const container = document.createElement('div');
				container.innerHTML = output.html;
				expect([...container.querySelectorAll('p')].map((node) => node.textContent)).toEqual([
					'first',
					'second',
				]);
				expect(output.signals).toBeUndefined();
			}
		},
	);

	it.each(
		[false, true].flatMap((dev) =>
			[false, true].flatMap((mapped) => [false, true].map((framed) => ({ dev, mapped, framed }))),
		),
	)(
		'keeps late handle values separate in nested keyed lists through hydration and reorder (%j)',
		async ({ dev, mapped, framed }) => {
			vi.resetModules();
			const server = await import('../../src/runtime.server.js');
			const client = await import('../../src/runtime.js');
			const signals = await import('../../src/signals/index.js');
			const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
			const rows = mapped
				? '{props.group.items.map(item => <Row key={item.id} label={props.group.id + item.label} produce={props.produce} pending={props.pending}/>)}'
				: '@for (const item of props.group.items; key item.id) { <Row label={props.group.id + item.label} produce={props.produce} pending={props.pending}/> }';
			const groupBody = framed ? `function Group(props) @{ <article>${rows}</article> }` : '';
			const group = framed
				? '<Group group={group} produce={props.produce} pending={props.pending}/>'
				: `<article>${rows.replaceAll('props.group', 'group')}</article>`;
			const source = `import {use} from 'octane';
function Row(props) @{
 if (props.pending) use(props.pending);
 const value = props.produce(props.label);
 <section><output>{value as string}</output><input value={value}/></section>
}
${groupBody}
export function App(props) @{
 <main>@for (const group of props.groups; key group.id) { ${group} }</main>
}`;
			const options = {
				id: '/src/nested-keyed-server-output.tsrx',
				compileOptions: { dev, hmr: false },
			};
			const serverModule = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const clientModule = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const groups = ['left|', '右:'].map((id) => ({
				id,
				items: [
					{ id: 'same|', label: 'red' },
					{ id: 'same:', label: 'blue' },
				],
			}));
			const scalar = (label: string) => label;
			expect(
				server.renderToString(serverModule.App, { groups, produce: scalar }).signals,
			).toBeUndefined();
			const produce = (label: string) => signals.__signalAt('i:nested-keyed-output', label);
			let resolve!: () => void;
			const pending = new Promise<void>((complete) => {
				resolve = complete;
			});
			// The first pass leaves its keyed frames parked before any handle read.
			// Discovery then resumes those frames outside their original list arms.
			const rendering = server.prerender(serverModule.App, { groups, produce, pending });
			resolve();
			const output = await rendering;
			const container = document.createElement('div');
			container.innerHTML = output.html;
			document.body.append(container);
			const controls = [...container.querySelectorAll('input')];
			const expected = ['left|red', 'left|blue', '右:red', '右:blue'];
			expect(controls.map((node) => node.value)).toEqual(expected);
			const errors: unknown[] = [];
			const root = client.hydrateRoot(
				container,
				clientModule.App,
				{ groups, produce },
				{
					onRecoverableError: (error) => errors.push(error),
				},
			);
			try {
				expect([...container.querySelectorAll('input')]).toEqual(controls);
				expect(controls.map((node) => node.value)).toEqual(expected);
				expect(errors).toEqual([]);
				controls[0]!.value = 'edited first';
				client.flushSync(() => controls[0]!.dispatchEvent(new Event('input', { bubbles: true })));
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
					'edited first',
					...expected.slice(1),
				]);
				const reordered = groups
					.toReversed()
					.map((group) => ({ ...group, items: group.items.toReversed() }));
				client.flushSync(() => root.render(clientModule.App, { groups: reordered, produce }));
				expect([...container.querySelectorAll('input')]).toEqual(controls.toReversed());
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
					...expected.slice(1).toReversed(),
					'edited first',
				]);
			} finally {
				root.unmount();
				expect(container.childNodes).toHaveLength(0);
				container.remove();
			}
		},
	);

	it.each([false, true].flatMap((carrier) => [false, true].map((throws) => ({ carrier, throws }))))(
		'restores nested server ownership after a child returns or throws (%j)',
		({ carrier, throws }) => {
			enableNativeReadCollection();
			enableServerSignalBindings();
			const storage = new AsyncLocalStorage<SignalOwner>();
			const restore = carrier
				? installSignalOwnerEnvironment({
						current: () => storage.getStore() ?? null,
						run: (owner, callback) => storage.run(owner, callback),
						capture: (owner) => (callback) => storage.run(owner, callback),
					})
				: undefined;
			const ambient = { scopeKey: 'ambient-server-owner' };
			const documentOwner = { scopeKey: 'rendered-server-owner' };
			const nestedOwner = { scopeKey: 'nested-server-owner' };
			const nestedValue$ = __signalAt('g:nested-owner-default', 'nested value', {
				key: 'nested-owner-default',
			});
			const seen: Record<string, SignalOwner | null> = {};
			const Nested = ({ value = nestedValue$.get() }: { value?: string }) => {
				seen.nested = currentSignalOwner();
				return value;
			};
			const Child = () => {
				seen.child = currentSignalOwner();
				const nested = renderToString(Nested, {}, { signalOwner: nestedOwner });
				expect(nested.html).toContain('nested value');
				expect(nested.signals?.scopes).toMatchObject([
					{
						version: 1,
						scopeKey: nestedOwner.scopeKey,
						entries: [
							{
								key: 'nested-owner-default',
								kind: 'signal',
								value: ['string', 'nested value'],
								complete: true,
							},
						],
					},
				]);
				seen.afterNested = currentSignalOwner();
				if (throws) throw new Error('child failure');
				return 'child';
			};
			const Sibling = () => {
				seen.sibling = currentSignalOwner();
				return 'sibling';
			};
			const Parent = (_props: unknown, scope: any) => {
				seen.parent = currentSignalOwner();
				let child: string;
				try {
					child = ssrComponent(scope, Child, {}, false, undefined, false, 'c:child');
				} catch (error) {
					if ((error as Error).message !== 'child failure') throw error;
					child = 'caught';
				}
				seen.afterChild = currentSignalOwner();
				return child + ssrComponent(scope, Sibling, {}, false, undefined, false, 'c:sibling');
			};
			try {
				runWithSignalOwner(ambient, () => {
					const result = renderToString(Parent, {}, { signalOwner: documentOwner });
					expect(result.html).toContain(throws ? 'caught' : 'child');
					expect(result.html).toContain('sibling');
					expect(result.signals).toBeUndefined();
					expect(currentSignalOwner()).toBe(ambient);
					expect(() =>
						renderToString(
							() => {
								throw new Error('root failure');
							},
							{},
							{ signalOwner: documentOwner },
						),
					).toThrow('root failure');
					expect(currentSignalOwner()).toBe(ambient);
				});
				expect(seen.afterChild).toBe(seen.parent);
				expect(seen.afterNested).toBe(seen.child);
				expect(seen.child).not.toBe(seen.parent);
				expect(seen.sibling).not.toBe(seen.child);
				for (const [name, owner] of Object.entries(seen)) {
					expect(owner).toMatchObject({
						documentOwner: name === 'nested' ? nestedOwner : documentOwner,
					});
				}
			} finally {
				restore?.();
			}
		},
	);

	it('strict-reads a generic child handle without compiler signal classification', async () => {
		const value$ = __signalAt('g:server-child', 'server value', { key: 'server-child' });
		const ServerRoot = (_props: unknown, scope: any) => ssrChild(value$, scope);

		expect(renderToString(ServerRoot).html).toContain('server value');

		// A real cold module graph matters: another fixture's declaration must
		// not eagerly install owners and hide a missing lazy identity/read path.
		vi.resetModules();
		const server = await import('../../src/runtime.server.js');
		const signals = await import('../../src/signals/index.js');
		const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
		const source = `function Row(props) @{
  <section><output>{props.value as string}</output><input value={props.value}/><div style={{ color: props.value }}/></section>
}
export function App(props) @{ <main>@for (const item of props.items; key item) { <Row value={props.produce(item)}/> }</main> }`;
		const options = { id: '/src/cold-server-handle.tsrx', mode: 'server' as const };
		const { App } = loadCompiledFixtureSource(source, options);
		const items = ['red', 'blue'];
		expect(server.renderToString(App, { items, produce: (item: string) => item }).html).toContain(
			'color:red',
		);
		const produce = (item: string) => signals.__signalAt('i:cold-server-handle', item);
		const fragment = document.createElement('template');
		for (let request = 0; request < 2; request++) {
			fragment.innerHTML = server.renderToString(App, { items, produce }).html;
			expect(
				[...fragment.content.querySelectorAll('output')].map((node) => node.textContent),
			).toEqual(items);
			expect([...fragment.content.querySelectorAll('input')].map((node) => node.value)).toEqual(
				items,
			);
			const identities = [...fragment.content.querySelectorAll('input')].map((node) =>
				node.getAttribute('data-octane-signal-control'),
			);
			expect(identities[0]).not.toBeNull();
			expect(identities[0]).not.toBe(identities[1]);
		}
		const client = await import('../../src/runtime.js');
		const clientModule = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
		const container = document.createElement('div');
		container.append(fragment.content.cloneNode(true));
		document.body.append(container);
		const controls = [...container.querySelectorAll('input')];
		const errors: unknown[] = [];
		const root = client.hydrateRoot(
			container,
			clientModule.App,
			{ items, produce },
			{ onRecoverableError: (error) => errors.push(error) },
		);
		try {
			expect([...container.querySelectorAll('input')]).toEqual(controls);
			expect(controls.map((node) => node.value)).toEqual(items);
			expect(errors).toEqual([]);
			controls[0]!.value = 'green';
			client.flushSync(() => controls[0]!.dispatchEvent(new Event('input', { bubbles: true })));
			expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
				'green',
				'blue',
			]);
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('serializes only the winning writable control identity', () => {
		enableServerSignalBindings();
		const draft$ = __signalAt('g:server-draft', 'draft', { key: 'server-draft' });
		const ServerRoot = () => {
			const control = ssrSignalControlValue(draft$, 'i:control');
			const sources = [
				[false, 'value', control] as const,
				[false, 'value', 'scalar winner'] as const,
			];
			return ssrHtml(
				'<input data-octane-input="i:control"' +
					ssrInputAttrs(sources) +
					ssrSignalControlAttrs(sources) +
					'/>',
			);
		};

		const html = renderToString(ServerRoot).html;
		expect(html).toContain('value="scalar winner"');
		expect(html).not.toContain('data-octane-signal-control="');
	});

	it('joins a winning writable control to its document-scoped signal node', () => {
		enableServerSignalBindings();
		const draft$ = __signalAt('g:joined-draft', 'draft', { key: 'joined-draft' });
		const ServerRoot = () => {
			const control = ssrSignalControlValue(draft$, 'i:control');
			const sources = [[false, 'value', control] as const];
			return ssrHtml(
				'<input data-octane-input="i:control"' +
					ssrInputAttrs(sources) +
					ssrSignalControlAttrs(sources) +
					'/>',
			);
		};

		const html = renderToString(ServerRoot).html;
		expect(html).toContain('data-octane-signal-control="');
		expect(html).toContain('joined-draft');
		expect(html).toContain('value="draft"');
	});

	it('does not shift a sibling when an SSR-only fallback is absent on the client', () => {
		enableServerSignalBindings();
		enableSignalBindings();
		const serverKeys: Record<string, string> = {};
		const clientKeys: Record<string, string> = {};
		const ServerFallback = () => {
			serverKeys.fallback = currentInstanceKey();
			return '';
		};
		const ServerSibling = () => {
			serverKeys.sibling = currentInstanceKey();
			return '';
		};
		const ServerRoot = (_props: unknown, scope: any) =>
			ssrComponent(scope, ServerFallback, {}, false, undefined, false, 'c:fallback') +
			ssrComponent(scope, ServerSibling, {}, false, undefined, false, 'c:sibling');
		renderToString(ServerRoot, {}, { identifierPrefix: 'structural-' });

		const ClientSibling = () => {
			clientKeys.sibling = currentInstanceKey();
		};
		const ClientRoot = (_props: unknown, scope: Scope) => {
			componentSlot(
				scope,
				1,
				scope.block.parentNode,
				ClientSibling,
				{},
				scope.block.endMarker,
				undefined,
				false,
				false,
				false,
				'c:sibling',
			);
		};
		const container = document.createElement('div');
		const root = createRoot(container, {
			identifierPrefix: 'structural-',
			signalInstancePrefix: 'structural-',
		});
		root.render(ClientRoot, {});

		expect(serverKeys.fallback).not.toBe(serverKeys.sibling);
		expect(clientKeys.sibling).toBe(serverKeys.sibling);
		root.unmount();
	});

	it('keeps repeated keyed call sites stable across opposite traversal order', () => {
		const serverKeys: Record<string, string> = {};
		const clientKeys: Record<string, string> = {};
		const ServerItem = (props: { id: string }) => {
			serverKeys[props.id] = currentInstanceKey();
			return '';
		};
		const ServerRoot = (_props: unknown, scope: any) =>
			['b', 'a']
				.map((id) => ssrComponent(scope, ServerItem, { id }, false, id, false, 'c:item'))
				.join('');
		renderToString(ServerRoot, {}, { identifierPrefix: 'keyed-' });

		const ClientItem = (props: { id: string }) => {
			clientKeys[props.id] = currentInstanceKey();
		};
		const ClientRoot = (_props: unknown, scope: Scope) => {
			for (const [slot, id] of ['a', 'b'].entries()) {
				componentSlot(
					scope,
					slot,
					scope.block.parentNode,
					ClientItem,
					{ id },
					scope.block.endMarker,
					id,
					false,
					false,
					true,
					'c:item',
				);
			}
		};
		const container = document.createElement('div');
		const root = createRoot(container, {
			identifierPrefix: 'keyed-',
			signalInstancePrefix: 'keyed-',
		});
		root.render(ClientRoot, {});

		expect(clientKeys).toEqual(serverKeys);
		expect(clientKeys.a).not.toBe(clientKeys.b);
		root.unmount();
	});
});
