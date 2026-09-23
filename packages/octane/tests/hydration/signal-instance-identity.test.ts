import { describe, expect, it, vi } from 'vitest';
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
// Compile-tooling setup is separate from the behavior checks. Cold scenarios
// still load a fresh runtime graph and fixture helper after resetModules().
import '../_server-fixture.js';

function currentInstanceKey(): string {
	return (currentSignalOwner() as { instanceKey?: string } | null)?.instanceKey ?? 'missing';
}

describe('signal component instance identity', () => {
	it.each(
		[
			{ dev: false, strong: false },
			{ dev: true, strong: false },
			{ dev: false, strong: true },
		].flatMap(({ dev, strong }) =>
			['object', 'opaque', 'function', 'symbol', 'primitive', 'string'].flatMap((kind) =>
				['component', 'inline'].map((declaration) => ({ dev, strong, kind, declaration })),
			),
		),
	)(
		'keeps keyed row signals independent through SSR, hydration, edits and reorder (%j)',
		async ({ dev, strong, kind, declaration }) => {
			vi.resetModules();
			const server = await import('../../src/runtime.server.js');
			const client = await import('../../src/runtime.js');
			const signals = await import('../../src/signals/index.js');
			const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
			const { collectPipeableStream, collectReadableStream } = await import('../_server-stream.js');
			const source = `import { signal$ } from 'octane/signals';
function Row(props) @{
 const value$ = signal$(props.label);
 <section><output>{String(value$.get())}</output><input value={value$}/></section>
}
export function App(props) @{
 const prefix = props.prefix ?? '';
 <main>@for (const item of props.items; key item.key) {
 ${
		declaration === 'component'
			? '<Row label={prefix + item.label}/>'
			: 'const value$ = signal$(prefix + item.label); <section><output>{String(value$.get())}</output><input value={value$}/></section>'
 }
 }</main>
}`;
			const options = {
				id: '/src/keyed-row-signals.tsrx',
				compileOptions: { dev, strong, hmr: false },
				runtimeModules: { 'octane/signals': signals },
			};
			const serverModule = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const clientModule = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const items = ['first', 'second'].map((label, index) => ({
				label,
				key:
					kind === 'object'
						? { id: label }
						: kind === 'opaque'
							? {
									[Symbol.toPrimitive]() {
										throw new Error('A reconciliation key is not rendered text.');
									},
								}
							: kind === 'function'
								? () => undefined
								: kind === 'symbol'
									? Symbol('row')
									: kind === 'string'
										? label
										: index === 0
											? 1
											: '1',
			}));
			const container = document.createElement('div');
			const expected = items.map((item) => item.label);
			const mounted = client.createRoot(container);
			try {
				mounted.render(clientModule.App, { items });
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual(
					expected,
				);
			} finally {
				mounted.unmount();
			}
			const outputs: { html: string }[] = [
				server.renderToString(serverModule.App, { items }),
				server.renderToStaticMarkup(serverModule.App, { items }),
				await server.prerender(serverModule.App, { items }),
				server.renderToString(serverModule.App, { items: items.toReversed() }),
			];
			for (const collect of [collectPipeableStream, collectReadableStream]) {
				const output = await collect(serverModule.App, { items });
				expect(output.errors).toEqual([]);
				outputs.push(output);
			}
			for (const [index, output] of outputs.entries()) {
				container.innerHTML = output.html;
				const labels = index === 3 ? expected.toReversed() : expected;
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual(
					labels,
				);
				expect([...container.querySelectorAll('input')].map((node) => node.value)).toEqual(labels);
			}
			container.innerHTML = outputs[0]!.html;
			document.body.append(container);
			const controls = [...container.querySelectorAll('input')];
			const errors: unknown[] = [];
			const root = client.hydrateRoot(
				container,
				clientModule.App,
				{ items },
				{ onRecoverableError: (error) => errors.push(error) },
			);
			try {
				expect([...container.querySelectorAll('input')]).toEqual(controls);
				expect(controls.map((node) => node.value)).toEqual(expected);
				expect(errors).toEqual([]);
				controls[0]!.value = 'edited first';
				client.flushSync(() => controls[0]!.dispatchEvent(new Event('input', { bubbles: true })));
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
					'edited first',
					'second',
				]);
				client.flushSync(() =>
					root.render(clientModule.App, { items: items.toReversed(), prefix: 'changed ' }),
				);
				expect([...container.querySelectorAll('input')]).toEqual(controls.toReversed());
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
					'second',
					'edited first',
				]);
			} finally {
				root.unmount();
				expect(container.childNodes).toHaveLength(0);
				container.remove();
			}
		},
	);

	it.each([false, true])(
		'starts cold inline row queries once through discovery (dev: %s)',
		async (dev) => {
			vi.resetModules();
			const server = await import('../../src/runtime.server.js');
			const signals = await import('../../src/signals/index.js');
			const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
			const source = `export function App(props) @{
 <main>@for (const item of props.items; key item.id) {
  const value = props.produce(item.label);
  <section><output>{value as string}</output></section>
 }</main>
}`;
			const { App } = loadCompiledFixtureSource(source, {
				id: '/src/cold-inline-query.tsrx',
				mode: 'server',
				compileOptions: { dev, hmr: false },
			});
			const items = [
				{ id: 'a', label: 'first' },
				{ id: 'b', label: 'second' },
			];
			const loads: string[] = [];
			const produce = (label: string) =>
				signals.__queryAt(
					'i:cold-inline-query',
					() => label,
					async (key: string) => {
						loads.push(key);
						return key;
					},
				);
			const output = await server.prerender(App, { items, produce });
			const container = document.createElement('div');
			container.innerHTML = output.html;
			expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
				'first',
				'second',
			]);
			expect(loads).toEqual(['first', 'second']);
		},
	);

	it.each([false, true])(
		'hydrates the first cold inline handle in its row (dev: %s)',
		async (dev) => {
			vi.resetModules();
			const server = await import('../../src/runtime.server.js');
			const client = await import('../../src/runtime.js');
			const signals = await import('../../src/signals/index.js');
			const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
			const source = `export function App(props) @{
 <main>@for (const item of props.items; key item.id) {
  const value = props.produce(item.label);
  <section><output>{value as string}</output><input value={value}/></section>
 }</main>
}`;
			const options = {
				id: '/src/cold-inline-handle.tsrx',
				compileOptions: { dev, hmr: false },
			};
			const serverModule = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const clientModule = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const items = [
				{ id: 'a', label: 'first' },
				{ id: 'b', label: 'second' },
			];
			const produce = (label: string) => signals.__signalAt('i:cold-inline', label);
			const container = document.createElement('div');
			container.innerHTML = server.renderToString(serverModule.App, { items, produce }).html;
			const controls = [...container.querySelectorAll('input')];
			const errors: unknown[] = [];
			const root = client.hydrateRoot(
				container,
				clientModule.App,
				{ items, produce },
				{
					onRecoverableError: (error) => errors.push(error),
				},
			);
			try {
				expect([...container.querySelectorAll('input')]).toEqual(controls);
				expect(controls.map((control) => control.value)).toEqual(['first', 'second']);
				expect(errors).toEqual([]);
				controls[0]!.value = 'edited first';
				client.flushSync(() => controls[0]!.dispatchEvent(new Event('input', { bubbles: true })));
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
					'edited first',
					'second',
				]);
			} finally {
				root.unmount();
			}
		},
	);

	it('preserves inline row owners when Strong selection changes', async () => {
		vi.resetModules();
		const client = await import('../../src/runtime.js');
		const signals = await import('../../src/signals/index.js');
		const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
		const source = `import {signal$} from 'octane/signals';
export function App(props) @{
	const outside$ = signal$('outside');
 const selected = props.selected;
 const read = props.read;
 <main>@for (const item of props.items; key item.id) {
  <section class={selected === item.id ? 'selected' : ''}><output>{read(item.label) as string}</output></section>
 }</main>
}`;
		const { App } = loadCompiledFixtureSource(source, {
			id: '/src/inline-selection-signals.tsrx',
			mode: 'client',
			compileOptions: { dev: false, strong: true, hmr: false },
			runtimeModules: { 'octane/signals': signals },
		});
		const items = [
			{ id: 'a', label: 'first' },
			{ id: 'b', label: 'second' },
		];
		const read = (label: string) => signals.__signalAt('i:inline-selection', label).get();
		const container = document.createElement('div');
		const root = client.createRoot(container);
		try {
			root.render(App, { items, read, selected: 'a' });
			const rows = [...container.querySelectorAll('section')];
			client.flushSync(() => root.render(App, { items, read, selected: 'b' }));
			expect([...container.querySelectorAll('section')]).toEqual(rows);
			expect(rows.map((row) => row.className)).toEqual(['', 'selected']);
			expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
				'first',
				'second',
			]);
		} finally {
			root.unmount();
		}
	});

	it.each([false, true].flatMap((dev) => [false, true].map((carrier) => ({ dev, carrier }))))(
		'keeps nested and sibling inline row state independent after suspension (%j)',
		async ({ dev, carrier }) => {
			vi.resetModules();
			const server = await import('../../src/runtime.server.js');
			const client = await import('../../src/runtime.js');
			const signals = await import('../../src/signals/index.js');
			const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
			const source = `import {use} from 'octane';
import {signal$} from 'octane/signals';
export function App(props) @{
 const outside$ = signal$('outside');
 <main>
 @for (const group of props.groups; key group.id) {
  const group$ = signal$(group.id);
  <article><h2>{String(group$.get())}</h2>
  @for (const item of group.items; key item.id) {
   const value$ = signal$(group.id + item.label);
   if (props.pending) use(props.pending);
   <section>@if (props.show) { <><output>{String(value$.get())}</output><input value={value$}/></> }</section>
  }
  </article>
 }
 @for (const item of props.siblings; key item.id) {
  const value$ = signal$(item.label);
  <aside><output>{String(value$.get())}</output><input value={value$}/></aside>
 }
 <footer>{String(outside$.get())}</footer>
 </main>
}`;
			const options = {
				id: '/src/nested-inline-row-signals.tsrx',
				compileOptions: { dev, hmr: false },
				runtimeModules: { 'octane/signals': signals },
			};
			const serverModule = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const clientModule = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const groups = ['left|', 'right|'].map((id) => ({
				id,
				items: [
					{ id: 'a', label: 'first' },
					{ id: 'b', label: 'second' },
				],
			}));
			const siblings = [
				{ id: 'a', label: 'sibling first' },
				{ id: 'b', label: 'sibling second' },
			];
			const props = { groups, siblings, show: true };
			const expected = [
				'left|first',
				'left|second',
				'right|first',
				'right|second',
				...siblings.map((item) => item.label),
			];
			const storage = new AsyncLocalStorage<SignalOwner>();
			const restore = carrier
				? signals.installSignalOwnerEnvironment({
						current: () => storage.getStore() ?? null,
						run: (owner, callback) => storage.run(owner, callback),
						capture: (owner) => (callback) => storage.run(owner, callback),
					})
				: () => {};
			let resolve!: () => void;
			const pending = new Promise<void>((complete) => {
				resolve = complete;
			});
			const container = document.createElement('div');
			try {
				const ambient = signals.currentSignalOwner();
				const rendering = server.prerender(serverModule.App, { ...props, pending });
				resolve();
				container.innerHTML = (await rendering).html;
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual(
					expected,
				);
				expect([...container.querySelectorAll('h2')].map((node) => node.textContent)).toEqual(
					groups.map((group) => group.id),
				);
				expect(container.querySelector('footer')!.textContent).toBe('outside');
				expect(signals.currentSignalOwner()).toBe(ambient);
				const controls = [...container.querySelectorAll('input')];
				const errors: unknown[] = [];
				const root = client.hydrateRoot(container, clientModule.App, props, {
					onRecoverableError: (error) => errors.push(error),
				});
				try {
					expect([...container.querySelectorAll('input')]).toEqual(controls);
					expect(controls.map((node) => node.value)).toEqual(expected);
					expect(errors).toEqual([]);
					controls[0]!.value = 'edited first';
					client.flushSync(() => controls[0]!.dispatchEvent(new Event('input', { bubbles: true })));
					expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual(
						['edited first', ...expected.slice(1)],
					);
					const reordered = groups
						.toReversed()
						.map((group) => ({ ...group, items: group.items.toReversed() }));
					client.flushSync(() =>
						root.render(clientModule.App, {
							...props,
							groups: reordered,
							siblings: siblings.toReversed(),
						}),
					);
					expect([...container.querySelectorAll('input')]).toEqual([
						...controls.slice(0, 4).toReversed(),
						...controls.slice(4).toReversed(),
					]);
					expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual(
						[
							...expected.slice(1, 4).toReversed(),
							'edited first',
							...expected.slice(4).toReversed(),
						],
					);
					client.flushSync(() => root.render(clientModule.App, { ...props, show: false }));
					expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual(
						siblings.map((item) => item.label),
					);
					client.flushSync(() => root.render(clientModule.App, props));
					expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual(
						['edited first', ...expected.slice(1)],
					);
				} finally {
					root.unmount();
				}
			} finally {
				restore();
			}
		},
	);

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
			[false, true].flatMap((mapped) =>
				[false, true].flatMap((framed) =>
					(mapped ? [false] : [false, true]).flatMap((objectKeys) =>
						(mapped ? ['component'] : ['component', 'inline']).flatMap((declaration) =>
							(declaration === 'inline' ? ['sync', 'prerender'] : ['prerender']).map(
								(rendering) => ({
									dev,
									mapped,
									framed,
									objectKeys,
									declaration,
									rendering,
								}),
							),
						),
					),
				),
			),
		),
	)(
		'keeps late handle values separate in nested keyed lists through hydration and reorder (%j)',
		async ({ dev, mapped, framed, objectKeys, declaration, rendering }) => {
			vi.resetModules();
			const server = await import('../../src/runtime.server.js');
			const client = await import('../../src/runtime.js');
			const signals = await import('../../src/signals/index.js');
			const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
			const rows = mapped
				? '{props.group.items.map(item => <Row key={item.key} label={props.group.id + item.label} produce={props.produce} pending={props.pending}/>)}'
				: declaration === 'component'
					? '@for (const item of props.group.items; key item.key) { <Row label={props.group.id + item.label} produce={props.produce} pending={props.pending}/> }'
					: '@for (const item of props.group.items; key item.key) { if (props.pending) use(props.pending); const value = props.produce(props.group.id + item.label); <section><output>{value as string}</output><input value={value}/></section> }';
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
 <main>@for (const group of props.groups; key group.key) { ${group} }</main>
}`;
			const options = {
				id: '/src/nested-keyed-server-output.tsrx',
				compileOptions: { dev, hmr: false },
			};
			const serverModule = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const clientModule = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const groups = ['left|', '右:'].map((id) => ({
				id,
				key: objectKeys ? {} : id,
				items: [
					{ key: objectKeys ? {} : 'same|', label: 'red' },
					{ key: objectKeys ? {} : 'same:', label: 'blue' },
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
			const outputPromise =
				rendering === 'sync'
					? server.renderToString(serverModule.App, { groups, produce })
					: server.prerender(serverModule.App, { groups, produce, pending });
			resolve();
			const output = await outputPromise;
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

describe('opaque keyed signals across hydration and retries', () => {
	it.each([false, true])(
		'preserves separate keyed state when a sibling hydrates before a deferred boundary (dev=%s)',
		async (dev) => {
			vi.resetModules();
			const server = await import('../../src/runtime.server.js');
			const client = await import('../../src/runtime.js');
			const signals = await import('../../src/signals/index.js');
			const { condition } = await import('../../src/hydration/index.js');
			const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
			const source = `import { Hydrate, useState } from 'octane';
import { signal$ } from 'octane/signals';
function Row(props) @{
 props.remember(props.label);
 const value$ = signal$(props.label);
 <section><output>{value$ as string}</output><input value={value$}/></section>
}
function Group(props) @{
 const [ready] = useState(true);
 <article data-ready={ready ? 'yes' : 'no'}>@for (const item of props.items; key item.key) { <Row label={item.label} remember={props.remember}/> }</article>
}
export function App(props) @{
 <main><Hydrate when={props.when} split={false}><Group items={props.deferred} remember={props.remember}/></Hydrate><Group items={props.live} remember={props.remember}/></main>
}`;
			const options = {
				id: '/src/deferred-opaque-keyed-signals.tsrx',
				compileOptions: { dev, hmr: false },
				runtimeModules: { 'octane/signals': signals },
			};
			const serverModule = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const clientModule = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const serverKeys: Record<string, string | undefined> = {};
			const clientKeys: Record<string, string | undefined> = {};
			const remember = (keys: Record<string, string | undefined>, label: string) => {
				keys[label] = (signals.currentSignalOwner() as { instanceKey?: string } | null)
					?.instanceKey;
			};
			const serverProps = {
				when: condition(false),
				deferred: [{ key: {}, label: 'deferred server value' }],
				live: [{ key: {}, label: 'live server value' }],
				remember: (label: string) => remember(serverKeys, label),
			};
			const clientProps = {
				when: condition(false),
				deferred: [{ key: {}, label: 'deferred server value' }],
				live: [{ key: {}, label: 'live server value' }],
				remember: (label: string) => remember(clientKeys, label),
			};
			const container = document.createElement('div');
			container.innerHTML = server.renderToString(serverModule.App, serverProps).html;
			document.body.append(container);
			const inputs = [...container.querySelectorAll('input')];
			const errors: unknown[] = [];
			const root = client.hydrateRoot(container, clientModule.App, clientProps, {
				onRecoverableError: (error) => errors.push(error),
			});
			try {
				expect(clientKeys['live server value']).toBe(serverKeys['live server value']);
				expect([...container.querySelectorAll('input')]).toEqual(inputs);
				expect(inputs.map((input) => input.value)).toEqual([
					'deferred server value',
					'live server value',
				]);
				inputs[1]!.value = 'live edited before reveal';
				client.flushSync(() => inputs[1]!.dispatchEvent(new Event('input', { bubbles: true })));
				await client.act(() =>
					root.render(clientModule.App, { ...clientProps, when: condition(true) }),
				);
				expect([...container.querySelectorAll('input')]).toEqual(inputs);
				expect(inputs.map((input) => input.value)).toEqual([
					'deferred server value',
					'live edited before reveal',
				]);
				expect(clientKeys).toEqual(serverKeys);
				inputs[0]!.value = 'deferred edited after reveal';
				client.flushSync(() => inputs[0]!.dispatchEvent(new Event('input', { bubbles: true })));
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
					'deferred edited after reveal',
					'live edited before reveal',
				]);
				expect(errors).toEqual([]);
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);

	it.each([false, true])(
		'reuses pending row queries when server passes recreate object keys (dev=%s)',
		async (dev) => {
			vi.resetModules();
			const server = await import('../../src/runtime.server.js');
			const signals = await import('../../src/signals/index.js');
			const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
			const source = `import { query$ } from 'octane/signals';
function Row(props) @{
 const value$ = query$(() => props.label, props.load);
 <output>{value$.get() as string}</output>
}
export function App(props) @{
 <main>@for (const item of props.items; key props.makeKey()) { <Row label={item} load={props.load}/> }</main>
}`;
			const serverModule = loadCompiledFixtureSource(source, {
				id: '/src/transient-opaque-keyed-query.tsrx',
				mode: 'server',
				compileOptions: { dev, hmr: false },
				runtimeModules: { 'octane/signals': signals },
			});
			const started: string[] = [];
			const output = await server.prerender(serverModule.App, {
				items: ['row'],
				makeKey: () => ({}),
				load(label: string) {
					started.push(label);
					if (started.length > 1) throw new Error('The pending row request was restarted.');
					return Promise.resolve(label + ' ready');
				},
			});
			const container = document.createElement('div');
			container.innerHTML = output.html;
			expect(container.querySelector('output')?.textContent).toBe('row ready');
			expect(started).toEqual(['row']);
		},
	);

	it.each([false, true])(
		'joins keyed native values when independent rows reveal in reverse order (dev=%s)',
		async (dev) => {
			vi.resetModules();
			const client = await import('../../src/runtime.js');
			const signals = await import('../../src/signals/index.js');
			const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
			const { activateStreamedMarkup, collectReadableStream, deferred, resetStreamRuntimeGlobals } =
				await import('../_server-stream.js');
			const source = `import { use } from 'octane';
function Row(props) @{
 if (props.pending) use(props.pending);
 const value = props.produce(props.label);
 <section><output>{value as string}</output><input value={value}/></section>
}
export function App(props) @{
 <main>@for (const item of props.items; key item.key) {
  <article>@try { <Row label={item.label} pending={item.pending} produce={props.produce}/> } @pending { <i>waiting</i> }</article>
 }</main>
}`;
			const options = {
				id: '/src/reverse-reveal-opaque-keyed-signals.tsrx',
				compileOptions: { dev, hmr: false },
			};
			const serverModule = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const clientModule = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const first = deferred<void>();
			const second = deferred<void>();
			const secondProduced = deferred<void>();
			const rendering = collectReadableStream(serverModule.App, {
				items: [
					{ key: {}, label: 'first', pending: first.promise },
					{ key: {}, label: 'second', pending: second.promise },
				],
				produce(label: string) {
					if (label === 'second') secondProduced.resolve();
					return signals.__signalAt('i:reverse-reveal-value', 'server ' + label);
				},
			});
			second.resolve();
			await secondProduced.promise;
			first.resolve();
			const output = await rendering;
			expect(output.errors).toEqual([]);
			const container = document.createElement('div');
			container.innerHTML = output.html;
			document.body.append(container);
			activateStreamedMarkup(container);
			const inputs = [...container.querySelectorAll('input')];
			expect(inputs.map((input) => input.value)).toEqual(['server first', 'server second']);
			const errors: unknown[] = [];
			const root = client.hydrateRoot(
				container,
				clientModule.App,
				{
					items: [
						{ key: {}, label: 'first' },
						{ key: {}, label: 'second' },
					],
					produce(label: string) {
						return signals.__signalAt('i:reverse-reveal-value', 'server ' + label);
					},
				},
				{ onRecoverableError: (error) => errors.push(error) },
			);
			try {
				expect([...container.querySelectorAll('input')]).toEqual(inputs);
				expect(inputs.map((input) => input.value)).toEqual(['server first', 'server second']);
				inputs[0]!.value = 'first edited';
				client.flushSync(() => inputs[0]!.dispatchEvent(new Event('input', { bubbles: true })));
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
					'first edited',
					'server second',
				]);
				expect(errors).toEqual([]);
			} finally {
				root.unmount();
				container.remove();
				resetStreamRuntimeGlobals();
			}
		},
	);
});
