import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createElement, flushSync, hydrateRoot, type Root } from 'octane';
import { createElement as createServerElement, renderToString } from 'octane/server';
import * as Signals from 'octane/signals';
import * as ProjectClient from '../_fixtures/wrapper-native-composition.tsrx';
import * as ProjectNative from '../_fixtures/wrapper-native-view.tsrx';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

const appId = '/packages/octane/tests/_fixtures/wrapper-native-composition.tsrx';
const nativeId = '/packages/octane/tests/_fixtures/wrapper-native-view.tsrx';
const source = readFileSync(join(process.cwd(), appId.slice(1)), 'utf8');
const nativeSource = readFileSync(join(process.cwd(), nativeId.slice(1)), 'utf8');
// Opaque @for keys use the public source loader, as in signal-instance-identity:
// the virtual JSX type mapper currently applies the narrower component Key type.
const keyedId = '/packages/octane/tests/_fixtures/wrapper-native-keyed-source.tsrx';
const keyedSource = `
import { NativeView } from './wrapper-native-view.tsrx';
function Child(props) @{ <article><NativeView initial={props.initial} label={props.label} /></article> }
function Wrapper(props) @{ <Child {...props} /> }
export function KeyedApp(props) @{
  <main>
    @for (const item of props.items; key item.key) {
      <Wrapper initial={item.initial} label={item.label} />
    }
  </main>
}
`;
interface NativeRow {
	initial: string;
	label: string;
	key: object | symbol;
}
const production = { dev: false, hmr: false };
const nativeServer = loadCompiledFixtureSource(nativeSource, {
	id: nativeId,
	mode: 'server',
	compileOptions: production,
	runtimeModules: { 'octane/signals': Signals },
});
const server = loadCompiledFixtureSource(source, {
	id: appId,
	mode: 'server',
	compileOptions: production,
	runtimeModules: { './wrapper-native-view.tsrx': nativeServer },
});
const keyedServer = loadCompiledFixtureSource(keyedSource, {
	id: keyedId,
	mode: 'server',
	compileOptions: production,
	runtimeModules: { './wrapper-native-view.tsrx': nativeServer },
});

function loadClient(dev: boolean) {
	const compileOptions = { dev, hmr: false };
	const native = loadCompiledFixtureSource<typeof ProjectNative>(nativeSource, {
		id: nativeId,
		mode: 'client',
		compileOptions,
		runtimeModules: { 'octane/signals': Signals },
	});
	const app = loadCompiledFixtureSource<typeof ProjectClient>(source, {
		id: appId,
		mode: 'client',
		compileOptions,
		runtimeModules: { './wrapper-native-view.tsrx': native },
	});
	const keyed = loadCompiledFixtureSource(keyedSource, {
		id: keyedId,
		mode: 'client',
		compileOptions,
		runtimeModules: { './wrapper-native-view.tsrx': native },
	});
	return { app, native, keyed };
}

const manualClients = [
	['production', loadClient(false)],
	['development', loadClient(true)],
] as const;
const clients = [
	...manualClients,
	['project plugin', { app: ProjectClient, native: ProjectNative }],
] as const;

describe('native signal identity through component wrappers', () => {
	for (const [mode, client] of clients) {
		it.each(['direct', 'deep', 'renderable hole'] as const)(
			`adopts server cells and live controls through a %s entry with the ${mode} client`,
			(kind) => {
				const serverProps = { initial: 'server', label: 'one' };
				const clientProps = { initial: 'client', label: 'one' };
				const body = kind === 'deep' ? 'DeepApp' : 'App';
				const rendered =
					kind === 'renderable hole'
						? renderToString(server.OpaqueApp, {
								content: createServerElement(nativeServer.NativeView, serverProps),
							})
						: renderToString(server[body], serverProps);
				const container = document.createElement('div');
				container.innerHTML = rendered.html;
				document.body.appendChild(container);
				const section = container.querySelector('section')!;
				const output = container.querySelector('output')!;
				const text = Array.from(output.childNodes).find((node) => node.nodeType === 3)!;
				const input = container.querySelector('input')!;
				const button = container.querySelector('button')!;
				input.value = 'typed before hydration';
				const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
				const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
				let root: Root | undefined;
				try {
					expect(output.textContent).toBe('server');
					let adopted: string | null | undefined;
					flushSync(() => {
						root =
							kind === 'renderable hole'
								? hydrateRoot(container, client.app.OpaqueApp, {
										content: createElement(client.native.NativeView, clientProps),
									})
								: hydrateRoot(container, client.app[body], clientProps);
						adopted = container.querySelector('output')?.textContent;
					});
					expect(adopted).toBe('server');
					expect(container.querySelector('section')).toBe(section);
					expect(container.querySelector('output')).toBe(output);
					expect(Array.from(output.childNodes)).toContain(text);
					expect(container.querySelector('input')).toBe(input);
					expect(container.querySelector('button')).toBe(button);
					expect(input.value).toBe('typed before hydration');
					expect(output.textContent).toBe('client');
					flushSync(() => button.click());
					expect(output.textContent).toBe('client!');
					expect(Array.from(output.childNodes)).toContain(text);
					expect(input.value).toBe('typed before hydration');
					expect(errors.mock.calls).toEqual([]);
					expect(warnings.mock.calls).toEqual([]);
				} finally {
					try {
						root?.unmount();
					} finally {
						container.remove();
						errors.mockRestore();
						warnings.mockRestore();
					}
				}
				expect(container.childNodes).toHaveLength(0);
			},
		);
	}

	for (const [mode, client] of manualClients) {
		it.each(['object', 'symbol'] as const)(
			`adopts independent %s-keyed cells before edits, reorder and removal with the ${mode} client`,
			(kind) => {
				const items = (prefix: string): NativeRow[] =>
					['first', 'second'].map((label) => ({
						label,
						initial: `${prefix}-${label}`,
						key:
							kind === 'symbol'
								? Symbol(label)
								: {
										[Symbol.toPrimitive]() {
											throw new Error('A row identity must not be coerced to text.');
										},
									},
					}));
				const clientItems = items('client');
				const rendered = renderToString(keyedServer.KeyedApp, { items: items('server') });
				const container = document.createElement('div');
				container.innerHTML = rendered.html;
				document.body.appendChild(container);
				const rows = Array.from(container.querySelectorAll('section'));
				const outputs = rows.map((row) => row.querySelector('output')!);
				const texts = outputs.map((output) =>
					Array.from(output.childNodes).find((node) => node.nodeType === 3),
				);
				const inputs = rows.map((row) => row.querySelector('input')!);
				inputs.forEach((input, index) => {
					input.value = `draft-${index}`;
				});
				const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
				const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
				let root: Root | undefined;
				try {
					let adopted: (string | null)[] = [];
					flushSync(() => {
						root = hydrateRoot(container, client.keyed.KeyedApp, { items: clientItems });
						adopted = Array.from(container.querySelectorAll('output')).map(
							(output) => output.textContent,
						);
					});
					expect(adopted).toEqual(['server-first', 'server-second']);
					const adoptedRows = Array.from(container.querySelectorAll('section'));
					expect(adoptedRows).toHaveLength(rows.length);
					adoptedRows.forEach((row, index) => expect(row).toBe(rows[index]));
					expect(outputs.map((output) => output.textContent)).toEqual([
						'client-first',
						'client-second',
					]);
					rows.forEach((row, index) => {
						expect(row.querySelector('input')).toBe(inputs[index]);
						expect(inputs[index].value).toBe(`draft-${index}`);
						expect(Array.from(outputs[index].childNodes)).toContain(texts[index]);
					});
					flushSync(() => rows[0].querySelector('button')!.click());
					expect(outputs[0].textContent).toBe('client-first!');
					flushSync(() => root!.render(client.keyed.KeyedApp, { items: clientItems.toReversed() }));
					const reordered = Array.from(container.querySelectorAll('section'));
					expect(reordered).toHaveLength(rows.length);
					reordered.forEach((row, index) => expect(row).toBe(rows[rows.length - 1 - index]));
					expect(outputs.map((output) => output.textContent)).toEqual([
						'client-first!',
						'client-second',
					]);
					flushSync(() => root!.render(client.keyed.KeyedApp, { items: [clientItems[1]] }));
					const remaining = Array.from(container.querySelectorAll('section'));
					expect(remaining).toHaveLength(1);
					expect(remaining[0]).toBe(rows[1]);
					expect(rows[0].isConnected).toBe(false);
					expect(inputs[1].value).toBe('draft-1');
					expect(Array.from(outputs[1].childNodes)).toContain(texts[1]);
					expect(errors.mock.calls).toEqual([]);
					expect(warnings.mock.calls).toEqual([]);
				} finally {
					try {
						root?.unmount();
					} finally {
						container.remove();
						errors.mockRestore();
						warnings.mockRestore();
					}
				}
				expect(container.childNodes).toHaveLength(0);
			},
		);
	}
});
