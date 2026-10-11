import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'octane/server';
import { flushSync, hydrateRoot, type ComponentBody, type Root } from '../../src/index.js';
import {
	App as PluginApp,
	type CompositionProps,
} from '../_fixtures/static-component-composition.tsrx';
import {
	App as DynamicPluginApp,
	type DynamicCompositionProps,
} from '../_fixtures/dynamic-component-composition.tsrx';
import * as Wrapped from '../_fixtures/wrapper-component-composition.tsrx';
import * as ExportedEntry from '../_fixtures/exported-component-composition.tsrx';
import * as ImportedEntry from '../_fixtures/exported-component-parent.tsrx';
import { flushEffects } from '../_helpers.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

const filename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/static-component-composition.tsrx',
);
const source = readFileSync(filename, 'utf8');
const server = loadCompiledFixtureSource(source, {
	id: filename,
	mode: 'server',
	compileOptions: { dev: false, hmr: false },
});
const production = loadCompiledFixtureSource(source, {
	id: filename,
	mode: 'client',
	compileOptions: { dev: false, hmr: false },
});
const development = loadCompiledFixtureSource(source, {
	id: filename,
	mode: 'client',
	compileOptions: { dev: true, hmr: false },
});
const dynamicFilename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/dynamic-component-composition.tsrx',
);
const dynamicSource = readFileSync(dynamicFilename, 'utf8');
const dynamicServer = loadCompiledFixtureSource(dynamicSource, {
	id: dynamicFilename,
	mode: 'server',
	compileOptions: { dev: false, hmr: false },
});
const dynamicProduction = loadCompiledFixtureSource(dynamicSource, {
	id: dynamicFilename,
	mode: 'client',
	compileOptions: { dev: false, hmr: false },
});
const dynamicDevelopment = loadCompiledFixtureSource(dynamicSource, {
	id: dynamicFilename,
	mode: 'client',
	compileOptions: { dev: true, hmr: false },
});

const wrapperFilename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/wrapper-component-composition.tsrx',
);
const wrapperSource = readFileSync(wrapperFilename, 'utf8');
const wrapperServer = loadCompiledFixtureSource(wrapperSource, {
	id: wrapperFilename,
	mode: 'server',
	compileOptions: { dev: false, hmr: false },
});
const wrapperProduction = loadCompiledFixtureSource<typeof Wrapped>(wrapperSource, {
	id: wrapperFilename,
	mode: 'client',
	compileOptions: { dev: false, hmr: false },
});
const wrapperDevelopment = loadCompiledFixtureSource<typeof Wrapped>(wrapperSource, {
	id: wrapperFilename,
	mode: 'client',
	compileOptions: { dev: true, hmr: false },
});

const entryFilename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/exported-component-composition.tsrx',
);
const entrySource = readFileSync(entryFilename, 'utf8');
const entryServer = loadCompiledFixtureSource(entrySource, {
	id: entryFilename,
	mode: 'server',
	compileOptions: { dev: false, hmr: false },
});
const entryProduction = loadCompiledFixtureSource<typeof ExportedEntry>(entrySource, {
	id: entryFilename,
	mode: 'client',
	compileOptions: { dev: false, hmr: false },
});
const entryDevelopment = loadCompiledFixtureSource<typeof ExportedEntry>(entrySource, {
	id: entryFilename,
	mode: 'client',
	compileOptions: { dev: true, hmr: false },
});
const importedEntryFilename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/exported-component-parent.tsrx',
);
const importedEntrySource = readFileSync(importedEntryFilename, 'utf8');
const importedEntryServer = loadCompiledFixtureSource(importedEntrySource, {
	id: importedEntryFilename,
	mode: 'server',
	compileOptions: { dev: false, hmr: false },
	runtimeModules: { './exported-component-composition.tsrx': entryServer },
});
const importedEntryProduction = loadCompiledFixtureSource<typeof ImportedEntry>(
	importedEntrySource,
	{
		id: importedEntryFilename,
		mode: 'client',
		compileOptions: { dev: false, hmr: false },
		runtimeModules: { './exported-component-composition.tsrx': entryProduction },
	},
);
const importedEntryDevelopment = loadCompiledFixtureSource<typeof ImportedEntry>(
	importedEntrySource,
	{
		id: importedEntryFilename,
		mode: 'client',
		compileOptions: { dev: true, hmr: false },
		runtimeModules: { './exported-component-composition.tsrx': entryDevelopment },
	},
);

describe('exported component entry hydration', () => {
	it.each([
		['production', entryProduction.default],
		['development', entryDevelopment.default],
		['project plugin', ExportedEntry.default],
	] as const)('adopts the literal child root with the %s client', async (_mode, body) => {
		const rendered = await renderToString(entryServer.default);
		const container = document.createElement('div');
		container.innerHTML = rendered.html;
		document.body.appendChild(container);
		const child = container.querySelector('div')!;
		const text = Array.from(child.childNodes).find((node) => node.nodeType === 3)!;
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
		let root: Root | undefined;
		try {
			expect(text.nodeValue).toBe('123');
			root = hydrateRoot(container, body);
			flushSync(() => {});
			expect(container.querySelector('div')).toBe(child);
			expect(Array.from(child.childNodes)).toContain(text);
			flushSync(() => root!.render(body));
			expect(container.querySelector('div')).toBe(child);
			expect(Array.from(child.childNodes)).toContain(text);
			expect(text.nodeValue).toBe('123');
			expect(errors.mock.calls).toEqual([]);
			expect(warnings.mock.calls).toEqual([]);
		} finally {
			root?.unmount();
			container.remove();
			errors.mockRestore();
			warnings.mockRestore();
		}
		expect(container.childNodes).toHaveLength(0);
	});

	it.each([
		['local production', entryServer.LocalParent, entryProduction.LocalParent],
		['local development', entryServer.LocalParent, entryDevelopment.LocalParent],
		['local project plugin', entryServer.LocalParent, ExportedEntry.LocalParent],
		[
			'imported production',
			importedEntryServer.ImportedParent,
			importedEntryProduction.ImportedParent,
		],
		[
			'imported development',
			importedEntryServer.ImportedParent,
			importedEntryDevelopment.ImportedParent,
		],
		['imported project plugin', importedEntryServer.ImportedParent, ImportedEntry.ImportedParent],
	] as const)(
		'adopts an exported entry between native siblings with the %s client',
		async (_mode, serverBody, body) => {
			const picks: string[] = [];
			const props = { tick: 0, onPick: () => picks.push('first') };
			const rendered = await renderToString(serverBody, props);
			const container = document.createElement('div');
			container.innerHTML = rendered.html;
			document.body.appendChild(container);
			const elements = Array.from(container.querySelectorAll('*'));
			const main = container.querySelector('main')!;
			const before = container.querySelector('strong')!;
			const child = container.querySelector('main > div')!;
			const text = Array.from(child.childNodes).find((node) => node.nodeType === 3)!;
			const after = container.querySelector('em')!;
			const input = container.querySelector('input')!;
			input.value = 'hydrated draft';
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
			let root: Root | undefined;
			try {
				root = hydrateRoot(container, body, props);
				flushSync(() => {});
				Array.from(container.querySelectorAll('*')).forEach((node, index) =>
					expect(node).toBe(elements[index]),
				);
				expect(Array.from(child.childNodes)).toContain(text);
				flushSync(() => container.querySelector('button')!.click());
				flushSync(() => root!.render(body, { tick: 1, onPick: () => picks.push('second') }));
				flushSync(() => container.querySelector('button')!.click());
				expect(container.querySelector('main')).toBe(main);
				expect(main.getAttribute('data-tick')).toBe('1');
				expect(container.querySelector('main > div')).toBe(child);
				expect(Array.from(child.childNodes)).toContain(text);
				expect(text.nodeValue).toBe('123');
				expect(before.nextElementSibling).toBe(child);
				expect(child.nextElementSibling).toBe(after);
				expect(container.querySelector('input')).toBe(input);
				expect(input.value).toBe('hydrated draft');
				expect(picks).toEqual(['first', 'second']);
				expect(errors.mock.calls).toEqual([]);
				expect(warnings.mock.calls).toEqual([]);
			} finally {
				root?.unmount();
				container.remove();
				errors.mockRestore();
				warnings.mockRestore();
			}
			expect(container.childNodes).toHaveLength(0);
		},
	);
});

describe('stateful wrapper hydration', () => {
	it.each([
		['production', wrapperProduction],
		['development', wrapperDevelopment],
		['project plugin', Wrapped],
	] as const)(
		'adopts sole wrapped keyed items before reorder and removal with the %s client',
		async (_mode, client) => {
			const effects: Array<[string, object]> = [];
			const ids: string[] = [];
			const rows = [
				{ id: 1, label: 'first' },
				{ id: 2, label: 'second' },
				{ id: 3, label: 'third' },
			];
			const props: Wrapped.CounterRowsProps = {
				rows,
				enabled: true,
				conditional: () => {},
				report: (event, value) => {
					effects.push([event, value]);
				},
				onId: (id) => {
					ids.push(id);
				},
			};
			const options = { identifierPrefix: 'sole-wrappers-' };
			const rendered = await renderToString(wrapperServer.SoleKeyedApp, props, options);
			const container = document.createElement('div');
			container.innerHTML = rendered.html;
			document.body.appendChild(container);
			const elements = Array.from(container.querySelectorAll('main, main *'));
			const counters = Array.from(container.querySelectorAll('.wrapped-counter'));
			const labels = counters.map((node) => node.querySelector('em')!);
			const labelTexts = labels.map((node) => node.firstChild);
			const outputs = counters.map((node) => node.querySelector('output')!);
			const idTexts = outputs.map((node) => node.firstChild);
			const serverIds = outputs.map((node) => node.textContent);
			const inputs = counters.map((node) => node.querySelector('input')!);
			inputs[0].value = 'first draft';
			inputs[2].value = 'third draft';
			ids.length = 0;
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
			let root: Root | undefined;
			try {
				root = hydrateRoot(container, client.SoleKeyedApp, props, options);
				flushSync(() => {});
				flushEffects();
				const adopted = Array.from(container.querySelectorAll('main, main *'));
				expect(adopted).toHaveLength(elements.length);
				adopted.forEach((node, index) => expect(node).toBe(elements[index]));
				expect(ids).toEqual(serverIds);
				flushSync(() => counters[0].querySelector('button')!.click());
				flushSync(() => counters[1].querySelector('button')!.click());
				flushSync(() => counters[1].querySelector('button')!.click());
				const first = { ...rows[0], label: 'updated first' };
				flushSync(() =>
					root!.render(client.SoleKeyedApp, { ...props, rows: [rows[2], first, rows[1]] }),
				);
				flushEffects();
				expect(Array.from(container.querySelectorAll('.wrapped-counter'))).toEqual([
					counters[2],
					counters[0],
					counters[1],
				]);
				counters.forEach((node, index) => {
					expect(node.querySelector('input')).toBe(inputs[index]);
					expect(labels[index].firstChild).toBe(labelTexts[index]);
					expect(outputs[index].firstChild).toBe(idTexts[index]);
					expect(outputs[index].textContent).toBe(serverIds[index]);
				});
				expect(labelTexts[0]?.nodeValue).toBe('updated first');
				expect(counters[0].querySelector('button')!.textContent).toBe('1');
				expect(counters[1].querySelector('button')!.textContent).toBe('2');
				flushSync(() => root!.render(client.SoleKeyedApp, { ...props, rows: [rows[2], first] }));
				flushEffects();
				expect(Array.from(container.querySelectorAll('.wrapped-counter'))).toEqual([
					counters[2],
					counters[0],
				]);
				expect(counters[1].isConnected).toBe(false);
				expect(inputs[1].isConnected).toBe(false);
				expect(counters[0].querySelector('button')!.textContent).toBe('1');
				expect(inputs[0].value).toBe('first draft');
				expect(inputs[2].value).toBe('third draft');
				for (const index of [0, 2]) {
					expect(labels[index].firstChild).toBe(labelTexts[index]);
					expect(outputs[index].firstChild).toBe(idTexts[index]);
					expect(outputs[index].textContent).toBe(serverIds[index]);
				}
				expect(errors.mock.calls).toEqual([]);
				expect(warnings.mock.calls).toEqual([]);
			} finally {
				root?.unmount();
				flushEffects();
				container.remove();
				errors.mockRestore();
				warnings.mockRestore();
			}
			expect(container.childNodes).toHaveLength(0);
			const mounted = effects.filter(([event]) => event === 'effect').map(([, value]) => value);
			const cleaned = effects.filter(([event]) => event === 'cleanup').map(([, value]) => value);
			expect(cleaned).toHaveLength(mounted.length);
			for (const value of mounted)
				expect(cleaned.filter((props) => props === value)).toHaveLength(1);
		},
	);

	it.each([
		['production', wrapperProduction],
		['development', wrapperDevelopment],
		['project plugin', Wrapped],
	] as const)(
		'adopts wrapped counters under native parents with the %s client',
		async (_mode, client) => {
			const effects: string[] = [];
			const ids: string[] = [];
			const rows = [
				{ id: 1, label: 'first' },
				{ id: 2, label: 'second' },
			];
			const props: Wrapped.CounterRowsProps = {
				rows,
				enabled: true,
				report: (event) => {
					effects.push(event);
				},
				conditional: () => {},
				onId: (id) => {
					ids.push(id);
				},
			};
			const options = { identifierPrefix: 'nested-wrappers-' };
			const rendered = await renderToString(wrapperServer.KeyedApp, props, options);
			const container = document.createElement('div');
			container.innerHTML = rendered.html;
			document.body.appendChild(container);
			const elements = Array.from(container.querySelectorAll('main, main *'));
			const articles = Array.from(container.querySelectorAll('article'));
			const outputs = Array.from(container.querySelectorAll('output'));
			const texts = outputs.map((node) => node.firstChild);
			const serverIds = outputs.map((node) => node.textContent);
			const input = articles[0].querySelector('input')!;
			input.value = 'server draft';
			ids.length = 0;
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
			let root: Root | undefined;
			try {
				root = hydrateRoot(container, client.KeyedApp, props, options);
				flushSync(() => {});
				flushEffects();
				const adopted = Array.from(container.querySelectorAll('main, main *'));
				expect(adopted).toHaveLength(elements.length);
				adopted.forEach((node, index) => expect(node).toBe(elements[index]));
				expect(ids).toEqual(serverIds);
				outputs.forEach((node, index) => expect(node.firstChild).toBe(texts[index]));
				flushSync(() => articles[0].querySelector('button')!.click());
				flushEffects();
				expect(articles[0].querySelector('button')!.textContent).toBe('1');
				expect(articles[1].querySelector('button')!.textContent).toBe('0');
				expect(effects).toEqual(['effect', 'effect']);
				flushSync(() =>
					root!.render(client.KeyedApp, {
						...props,
						rows: [rows[1], { ...rows[0], label: 'updated' }],
					}),
				);
				flushEffects();
				expect(Array.from(container.querySelectorAll('article'))).toEqual([
					articles[1],
					articles[0],
				]);
				expect(articles[0].querySelector('input')).toBe(input);
				expect(input.value).toBe('server draft');
				expect(articles[0].querySelector('button')!.textContent).toBe('1');
				expect(articles[0].querySelector('em')!.textContent).toBe('updated');
				outputs.forEach((node, index) => {
					expect(node.firstChild).toBe(texts[index]);
					expect(node.textContent).toBe(serverIds[index]);
				});
				expect(errors.mock.calls).toEqual([]);
				expect(warnings.mock.calls).toEqual([]);
			} finally {
				root?.unmount();
				flushEffects();
				container.remove();
				errors.mockRestore();
				warnings.mockRestore();
			}
			expect(container.childNodes).toHaveLength(0);
			expect(effects.filter((event) => event === 'cleanup')).toHaveLength(
				effects.filter((event) => event === 'effect').length,
			);
		},
	);

	it.each([
		['production', wrapperProduction],
		['development', wrapperDevelopment],
		['project plugin', Wrapped],
	] as const)('adopts production counters with the %s client', async (_mode, client) => {
		await checkWrappedHydration(false, client);
	});
	it.each([
		['production', wrapperProduction],
		['development', wrapperDevelopment],
		['project plugin', Wrapped],
	] as const)('adopts a seeded resource with the %s client', async (_mode, client) => {
		await checkWrappedHydration(true, client);
	});
});

async function checkWrappedHydration(resource: boolean, client: typeof Wrapped) {
	const effects: Array<[string, object]> = [];
	const ids: string[] = [];
	const shared = {
		enabled: true,
		report: (event: string, props: object) => {
			effects.push([event, props]);
		},
		conditional: () => {},
		onId: (id: string) => {
			ids.push(id);
		},
	};
	type Props = Wrapped.CounterProps | Wrapped.ResourceProps;
	const props: Props = resource
		? {
				...shared,
				promise: Object.assign(Promise.resolve('server'), { status: 'fulfilled', value: 'server' }),
			}
		: { ...shared, label: 'server' };
	const serverBody = resource ? wrapperServer.ResourceApp : wrapperServer.App;
	const body = (resource ? client.ResourceApp : client.App) as ComponentBody<Props>;
	const options = { identifierPrefix: 'wrapped-' };
	const rendered = await renderToString(serverBody, props, options);
	const container = document.createElement('div');
	container.innerHTML = rendered.html;
	document.body.appendChild(container);
	// Resource seeds are consumed by hydration; preserve every authored node.
	const selector = resource ? '.wrapped-resource' : '.wrapped-counter';
	const elements = Array.from(container.querySelectorAll(`${selector}, ${selector} *`));
	const input = container.querySelector('input')!;
	const output = container.querySelector('output')!;
	const text = output.firstChild;
	const id = output.getAttribute('data-use-id');
	input.value = 'before hydration';
	ids.length = 0;
	const clientProps: Props = resource
		? { ...shared, promise: new Promise<string>(() => {}) }
		: props;
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
	let root: Root | undefined;
	try {
		root = hydrateRoot(container, body, clientProps, options);
		flushSync(() => {});
		flushEffects();
		const adopted = Array.from(container.querySelectorAll(`${selector}, ${selector} *`));
		expect(adopted).toHaveLength(elements.length);
		adopted.forEach((node, index) => expect(node).toBe(elements[index]));
		expect(container.querySelector('input')).toBe(input);
		expect(input.value).toBe('before hydration');
		expect(output.firstChild).toBe(text);
		expect(output.textContent).toBe(id);
		expect(ids.length).toBeGreaterThan(0);
		expect(ids.every((value) => value === id)).toBe(true);
		expect(container.querySelector('em')!.textContent).toBe('server');
		expect(container.querySelector('script[data-octane-suspense]')).toBeNull();
		expect(effects.map(([event]) => event)).toEqual(['effect']);
		flushSync(() => container.querySelector('button')!.click());
		flushEffects();
		expect(container.querySelector('button')!.textContent).toBe('1');
		expect(output.firstChild).toBe(text);
		expect(ids.every((value) => value === id)).toBe(true);
		expect(effects.map(([event]) => event)).toEqual(['effect']);
		expect(errors.mock.calls).toEqual([]);
		expect(warnings.mock.calls).toEqual([]);
	} finally {
		root?.unmount();
		flushEffects();
		container.remove();
		errors.mockRestore();
		warnings.mockRestore();
	}
	expect(container.childNodes).toHaveLength(0);
	expect(effects.filter(([event]) => event === 'cleanup').map(([, props]) => props)).toEqual(
		effects.filter(([event]) => event === 'effect').map(([, props]) => props),
	);
}

describe('dynamic string component composition hydration', () => {
	it.each([
		['production', dynamicProduction.App],
		['development', dynamicDevelopment.App],
		['project plugin', DynamicPluginApp],
	] as const)(
		'adopts production output with the %s client and updates retained text',
		async (_mode, body) => {
			const picked: string[] = [];
			const props: DynamicCompositionProps = {
				rows: [
					{ id: 1, label: 'first' },
					{ id: 2, label: 'second' },
				],
				tick: 0,
				onPick: (id, label) => picked.push(`${id}:${label}`),
			};
			const { html } = await renderToString(dynamicServer.App, props);
			const container = document.createElement('div');
			container.innerHTML = html;
			document.body.appendChild(container);
			const elements = Array.from(container.querySelectorAll('*'));
			const input = container.querySelector('input')!;
			input.value = 'typed before hydration';
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
			let root: Root | undefined;
			try {
				root = hydrateRoot(container, body as ComponentBody<DynamicCompositionProps>, props);
				flushSync(() => {});
				const adopted = Array.from(container.querySelectorAll('*'));
				expect(adopted).toHaveLength(elements.length);
				adopted.forEach((node, index) => expect(node).toBe(elements[index]));
				const labels = Array.from(container.querySelectorAll('[data-dynamic-label]'));
				expect(labels.map((node) => node.getAttribute('title'))).toEqual(['first', 'second']);
				expect(labels.map((node) => node.textContent)).toEqual([
					'beforefirstafter',
					'beforesecondafter',
				]);
				const texts = labels.map((node, index) => {
					const text = Array.from(node.childNodes).find(
						(child) =>
							child.nodeType === Node.TEXT_NODE && child.nodeValue === props.rows[index].label,
					);
					expect(text).toBeDefined();
					return text!;
				});
				expect(input.value).toBe('typed before hydration');
				const changed = {
					...props,
					rows: [
						{ id: 1, label: '' },
						{ id: 2, label: 'a\rb' },
					],
					tick: 1,
				};
				flushSync(() => root!.render(body as ComponentBody<DynamicCompositionProps>, changed));
				labels.forEach((node, index) => {
					expect(container.querySelectorAll('[data-dynamic-label]')[index]).toBe(node);
					expect(texts[index].parentNode).toBe(node);
					expect(texts[index].nodeValue).toBe(changed.rows[index].label);
					expect(node.getAttribute('title')).toBe(changed.rows[index].label);
				});
				expect(container.querySelector('input')).toBe(input);
				expect(input.value).toBe('typed before hydration');
				flushSync(() => container.querySelector('button')!.click());
				expect(picked).toEqual(['1:']);
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
});

describe('static component composition hydration', () => {
	// PluginApp uses the real project's compile mode: development with HMR in
	// octane, and production in octane-prod. The explicit development module
	// separately covers dev output without HMR wrapping.
	it.each([
		['production', production.App],
		['development', development.App],
		['project plugin', PluginApp],
	] as const)(
		'adopts production HTML with the %s client and retains live controls',
		async (_mode, body) => {
			const picked: number[] = [];
			const props: CompositionProps = {
				rows: [{ id: 1 }, { id: 2 }],
				tick: 0,
				onPick: (id) => picked.push(id),
			};
			const { html } = await renderToString(server.App, props);
			const container = document.createElement('div');
			container.innerHTML = html;
			document.body.appendChild(container);
			const elements = Array.from(container.querySelectorAll('*'));
			const texts = Array.from(
				container.querySelectorAll('[data-label]'),
				(node) => node.firstChild,
			);
			const input = container.querySelector('input')!;
			input.value = 'typed before hydration';
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
			let root: Root | undefined;
			try {
				root = hydrateRoot(container, body as ComponentBody<CompositionProps>, props);
				flushSync(() => {});
				const adopted = Array.from(container.querySelectorAll('*'));
				expect(adopted).toHaveLength(elements.length);
				adopted.forEach((node, index) => expect(node).toBe(elements[index]));
				Array.from(container.querySelectorAll('[data-label]')).forEach((node, index) => {
					expect(node.textContent).toBe('fixed');
					expect(node.firstChild).toBe(texts[index]);
				});
				expect(input.value).toBe('typed before hydration');
				flushSync(() =>
					root!.render(body as ComponentBody<CompositionProps>, { ...props, tick: 1 }),
				);
				expect(container.querySelector('main')!.getAttribute('data-tick')).toBe('1');
				expect(container.querySelector('input')).toBe(input);
				expect(input.value).toBe('typed before hydration');
				flushSync(() => container.querySelector('button')!.click());
				expect(picked).toEqual([1]);
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
});
