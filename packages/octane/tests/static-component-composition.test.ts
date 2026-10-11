import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flushSync } from 'octane';
import { App } from './_fixtures/static-component-composition.tsrx';
import {
	App as DynamicApp,
	Toggle as DynamicToggle,
} from './_fixtures/dynamic-component-composition.tsrx';
import * as Wrapped from './_fixtures/wrapper-component-composition.tsrx';
import * as ExportedEntry from './_fixtures/exported-component-composition.tsrx';
import * as ImportedEntry from './_fixtures/exported-component-parent.tsrx';
import * as EntryParameters from './_fixtures/exported-component-parameters.tsrx';
import { act, flushEffects, mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

const compileOptions = {
	dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
	hmr: false,
};
const filename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/static-component-composition.tsrx',
);
const { App: ProductionApp } = loadCompiledFixtureSource<{ App: typeof App }>(
	readFileSync(filename, 'utf8'),
	{
		id: filename,
		mode: 'client',
		compileOptions: { dev: false, hmr: false },
	},
);
const dynamicFilename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/dynamic-component-composition.tsrx',
);
const { App: ProductionDynamicApp } = loadCompiledFixtureSource<{ App: typeof DynamicApp }>(
	readFileSync(dynamicFilename, 'utf8'),
	{
		id: dynamicFilename,
		mode: 'client',
		compileOptions: { dev: false, hmr: false },
	},
);

const wrapperFilename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/wrapper-component-composition.tsrx',
);
const wrapperProduction = loadCompiledFixtureSource<typeof Wrapped>(
	readFileSync(wrapperFilename, 'utf8'),
	{
		id: wrapperFilename,
		mode: 'client',
		compileOptions: { dev: false, hmr: false },
	},
);

function wrapperEffects() {
	const effects: Array<[string, object]> = [];
	const conditional: string[] = [];
	return {
		effects,
		conditional,
		props: {
			enabled: true,
			report: (event: string, props: object) => {
				effects.push([event, props]);
			},
			conditional: (event: string) => {
				conditional.push(event);
			},
		},
	};
}

function resolvedResource(value: string) {
	return Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
}

const entryFilename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/exported-component-composition.tsrx',
);
const entryProduction = loadCompiledFixtureSource<typeof ExportedEntry>(
	readFileSync(entryFilename, 'utf8'),
	{ id: entryFilename, mode: 'client', compileOptions: { dev: false, hmr: false } },
);
const importedEntryFilename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/exported-component-parent.tsrx',
);
const importedEntryProduction = loadCompiledFixtureSource<typeof ImportedEntry>(
	readFileSync(importedEntryFilename, 'utf8'),
	{
		id: importedEntryFilename,
		mode: 'client',
		compileOptions: { dev: false, hmr: false },
		runtimeModules: { './exported-component-composition.tsrx': entryProduction },
	},
);
const entryParametersFilename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/exported-component-parameters.tsrx',
);
const entryParametersProduction = loadCompiledFixtureSource<typeof EntryParameters>(
	readFileSync(entryParametersFilename, 'utf8'),
	{ id: entryParametersFilename, mode: 'client', compileOptions: { dev: false, hmr: false } },
);

describe('exported component entries', () => {
	it.each([
		['project plugin', EntryParameters],
		['production compiler', entryParametersProduction],
	] as const)(
		'keeps parameter-getter state updates independent of parent effects with the %s',
		(_mode, compiled) => {
			const key = 'entryParameterState';
			const original = Object.getOwnPropertyDescriptor(Object.prototype, key);
			const values: number[] = [];
			const effects: string[] = [];
			let update: ((value: number) => void) | undefined;
			let view: ReturnType<typeof mount> | undefined;
			Object.defineProperty(Object.prototype, key, {
				configurable: true,
				enumerable: false,
				get() {
					const [value, setValue] = compiled.useGetterState();
					values.push(value);
					update = setValue;
					return value;
				},
			});
			try {
				view = mount(compiled.Host, {
					report: (event) => effects.push(event),
					marker: () => 'authored marker',
				});
				flushEffects();
				const child = view.find('div');
				const text = Array.from(child.childNodes).find((node) => node.nodeType === 3);
				expect(child.textContent).toBe('123');
				expect(values).toContain(0);
				expect(effects).toEqual(['connect']);
				expect(update).toBeTypeOf('function');
				flushSync(() => update!(1));
				flushEffects();
				expect(values).toContain(1);
				expect(view.find('div')).toBe(child);
				expect(Array.from(child.childNodes)).toContain(text);
				expect(child.textContent).toBe('123');
				// Updating the state read by App's parameter getter must not restart
				// its otherwise unchanged memo parent's effect.
				expect(effects).toEqual(['connect']);
			} finally {
				try {
					view?.unmount();
					flushEffects();
				} finally {
					if (original) Object.defineProperty(Object.prototype, key, original);
					else Reflect.deleteProperty(Object.prototype, key);
				}
			}
			expect(effects).toEqual(['connect', 'disconnect']);
			expect(view!.container.childNodes).toHaveLength(0);
		},
	);

	it('keeps an exported child callable independently of its parent', () => {
		const compiled = loadCompiledFixtureSource(
			`export function Child({ text }) @{ <div>{text}</div> }
export default function App() @{ <Child text="123" /> }`,
			{ id: 'public-child-entry.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(compiled.default);
		try {
			expect(view.find('div').textContent).toBe('123');
			view.update(compiled.Child, { text: 'outside' });
			expect(view.find('div').textContent).toBe('outside');
			const child = view.find('div');
			view.update(compiled.Child, { text: 'changed' });
			expect(view.find('div')).toBe(child);
			expect(child.textContent).toBe('changed');
		} finally {
			view.unmount();
		}
		expect(view.container.childNodes).toHaveLength(0);
	});

	it('accepts changing external inputs to an exported entry', () => {
		const compiled = loadCompiledFixtureSource(
			`function Child({ text }) @{ <div>{text}</div> }
export function App({ text }) @{ <Child text={text} /> }`,
			{ id: 'external-entry-input.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(compiled.App, { text: 'outside' });
		try {
			const child = view.find('div');
			expect(child.textContent).toBe('outside');
			view.update(compiled.App, { text: null });
			expect(view.find('div')).toBe(child);
			expect(child.textContent).toBe('');
			view.update(compiled.App, { text: 123 });
			expect(view.find('div')).toBe(child);
			expect(child.textContent).toBe('123');
		} finally {
			view.unmount();
		}
		expect(view.container.childNodes).toHaveLength(0);
	});

	it.each([
		['project plugin', ExportedEntry.default],
		['production compiler', entryProduction.default],
	] as const)('retains the literal child through root updates with the %s', (_mode, body) => {
		const view = mount(body);
		try {
			const child = view.find('div');
			const text = Array.from(child.childNodes).find((node) => node.nodeType === 3)!;
			expect(text.nodeValue).toBe('123');
			view.update(body);
			expect(view.find('div')).toBe(child);
			expect(Array.from(child.childNodes)).toContain(text);
			expect(child.textContent).toBe('123');
		} finally {
			view.unmount();
		}
		expect(view.container.childNodes).toHaveLength(0);
	});

	it.each([
		['local project plugin', ExportedEntry.LocalParent],
		['local production compiler', entryProduction.LocalParent],
		['imported project plugin', ImportedEntry.ImportedParent],
		['imported production compiler', importedEntryProduction.ImportedParent],
	] as const)('retains a child between native siblings with the %s', (_mode, body) => {
		const picks: string[] = [];
		const view = mount(body, { tick: 0, onPick: () => picks.push('first') });
		try {
			const main = view.find('main');
			const before = view.find('strong');
			const child = view.find('main > div');
			const text = Array.from(child.childNodes).find((node) => node.nodeType === 3)!;
			const after = view.find('em');
			const input = view.find('input') as HTMLInputElement;
			input.value = 'draft';
			view.click('button');
			view.update(body, { tick: 1, onPick: () => picks.push('second') });
			view.click('button');
			expect(view.find('main')).toBe(main);
			expect(main.getAttribute('data-tick')).toBe('1');
			expect(view.find('main > div')).toBe(child);
			expect(Array.from(child.childNodes)).toContain(text);
			expect(text.nodeValue).toBe('123');
			expect(view.find('strong')).toBe(before);
			expect(before.nextElementSibling).toBe(child);
			expect(child.nextElementSibling).toBe(after);
			expect(view.find('input')).toBe(input);
			expect(input.value).toBe('draft');
			expect(picks).toEqual(['first', 'second']);
		} finally {
			view.unmount();
		}
		expect(view.container.childNodes).toHaveLength(0);
	});
});

describe('stateful component wrappers', () => {
	it('evaluates named inputs once and retains saved child props across self-updates', () => {
		const log = wrapperEffects();
		const reads: string[] = [];
		const ids: string[] = [];
		const onId = (id: string) => {
			ids.push(id);
		};
		const makeProps = (): Wrapped.CounterProps => ({
			get label() {
				reads.push('label');
				return 'same';
			},
			get enabled() {
				reads.push('enabled');
				return true;
			},
			get report() {
				reads.push('report');
				return log.props.report;
			},
			get conditional() {
				reads.push('conditional');
				return log.props.conditional;
			},
			get onId() {
				reads.push('onId');
				return onId;
			},
		});
		const expectedReads = ['label', 'enabled', 'report', 'conditional', 'onId'];
		const view = mount(wrapperProduction.NativeHostApp, makeProps());
		try {
			flushEffects();
			expect(reads).toEqual(expectedReads);
			expect(log.effects.map(([event]) => event)).toEqual(['effect']);
			const initialProps = log.effects[0][1];
			const child = view.find('.wrapped-counter');
			const label = view.find('em');
			const text = label.firstChild;
			const input = view.find('input') as HTMLInputElement;
			input.value = 'draft';
			reads.length = 0;
			view.update(wrapperProduction.NativeHostApp, makeProps());
			flushEffects();
			expect(reads).toEqual(expectedReads);
			expect(log.effects.map(([event]) => event)).toEqual(['effect', 'cleanup', 'effect']);
			expect(log.effects[1][1]).toBe(initialProps);
			const nextProps = log.effects[2][1];
			expect(nextProps).not.toBe(initialProps);
			reads.length = 0;
			view.click('button');
			flushEffects();
			expect(reads).toEqual([]);
			expect(log.effects.map(([event]) => event)).toEqual(['effect', 'cleanup', 'effect']);
			expect(log.effects[2][1]).toBe(nextProps);
			expect(view.find('button').textContent).toBe('1');
			expect(view.find('.wrapped-counter')).toBe(child);
			expect(view.find('em')).toBe(label);
			expect(label.firstChild).toBe(text);
			expect(label.textContent).toBe('same');
			expect(view.find('input')).toBe(input);
			expect(input.value).toBe('draft');
			expect(ids.every((id) => id === ids[0])).toBe(true);
		} finally {
			view.unmount();
			flushEffects();
		}
		expect(view.container.childNodes).toHaveLength(0);
		expect(log.effects.map(([event]) => event)).toEqual(['effect', 'cleanup', 'effect', 'cleanup']);
		expect(log.effects[3][1]).toBe(log.effects[2][1]);
	});

	it('preserves the receiver observed by a child body', () => {
		const { App: ReceiverApp } = loadCompiledFixtureSource(
			`function Child(props) @{ <span>{(this === undefined ? 'bare' : 'bound') as string}</span> }
function Wrapper(props) @{ <Child {...props}/> }
export function App() @{ <Wrapper value="x"/> }`,
			{ id: 'wrapper-receiver.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(ReceiverApp);
		try {
			expect(view.find('span').textContent).toBe('bound');
		} finally {
			view.unmount();
		}
	});

	it.each([
		['project plugin', Wrapped.App, Wrapped.OtherApp],
		['production compiler', wrapperProduction.App, wrapperProduction.OtherApp],
		['colliding parameter name', wrapperProduction.CollisionApp, wrapperProduction.OtherApp],
		[
			'caller parameter named after the child',
			wrapperProduction.ShadowedApp,
			wrapperProduction.OtherApp,
		],
		['native host parent', wrapperProduction.NativeHostApp, wrapperProduction.OtherApp],
	] as const)(
		'preserves child state, props effects and drafts with the %s',
		(_name, body, replacement) => {
			const log = wrapperEffects();
			const ids: string[] = [];
			const props = {
				...log.props,
				label: 'first',
				onId: (id: string) => {
					ids.push(id);
				},
			};
			const view = mount(body, props);
			try {
				flushEffects();
				const child = view.find('.wrapped-counter');
				const label = view.find('em');
				const text = label.firstChild;
				const input = view.find('input') as HTMLInputElement;
				input.value = 'draft';
				expect(log.effects.map(([event]) => event)).toEqual(['effect']);
				view.click('button');
				flushEffects();
				expect(view.find('button').textContent).toBe('1');
				expect(log.effects.map(([event]) => event)).toEqual(['effect']);
				expect(view.find('.wrapped-counter')).toBe(child);
				view.update(body, { ...props, label: 'second', enabled: false });
				flushEffects();
				expect(label.textContent).toBe('second');
				expect(label.firstChild).toBe(text);
				expect(log.conditional).toEqual(['enabled', 'disabled']);
				view.update(body, { ...props, label: 'third' });
				flushEffects();
				expect(log.conditional).toEqual(['enabled', 'disabled', 'enabled']);
				expect(view.find('button').textContent).toBe('1');
				expect(view.find('input')).toBe(input);
				expect(input.value).toBe('draft');
				expect(ids.every((id) => id === ids[0])).toBe(true);
				view.update(replacement, { ...props, label: 'replacement' });
				flushEffects();
				expect(view.find('button').textContent).toBe('0');
				expect(view.find('.wrapped-counter')).not.toBe(child);
				expect(child.isConnected).toBe(false);
				expect(view.find('input')).not.toBe(input);
				expect((view.find('input') as HTMLInputElement).value).toBe('seed');
				expect(view.find('em').textContent).toBe('replacement');
			} finally {
				view.unmount();
				flushEffects();
			}
			expect(view.container.childNodes).toHaveLength(0);
			expect(
				log.effects.filter(([event]) => event === 'cleanup').map(([, props]) => props),
			).toEqual(log.effects.filter(([event]) => event === 'effect').map(([, props]) => props));
		},
	);

	it('uses a caller binding that shadows a module component tag', () => {
		const view = mount(wrapperProduction.WrapperTagShadowApp, wrapperProduction.Replacement);
		try {
			expect(view.find('strong').textContent).toBe('replacement');
			expect(view.container.querySelector('.wrapped-counter')).toBeNull();
		} finally {
			view.unmount();
		}
	});

	it.each([
		['native parent with project plugin', Wrapped.KeyedApp],
		['native parent with production compiler', wrapperProduction.KeyedApp],
		['shadowed row binding with project plugin', Wrapped.KeyedShadowedApp],
		['shadowed row binding with production compiler', wrapperProduction.KeyedShadowedApp],
	] as const)('retains independent keyed child state with a %s', (_name, body) => {
		const log = wrapperEffects();
		const rows = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const view = mount(body, { ...log.props, rows });
		try {
			flushEffects();
			const first = view.find('article[data-row="1"]');
			const second = view.find('article[data-row="2"]');
			const label = first.querySelector('em')!;
			const text = label.firstChild;
			const input = first.querySelector('input')!;
			input.value = 'first draft';
			input.focus();
			view.click('article[data-row="1"] button');
			flushEffects();
			expect(first.querySelector('button')!.textContent).toBe('1');
			expect(second.querySelector('button')!.textContent).toBe('0');
			expect(log.effects.map(([event]) => event)).toEqual(['effect', 'effect']);
			view.update(body, { ...log.props, rows: [rows[1], { ...rows[0], label: 'updated' }] });
			flushEffects();
			expect(view.findAll('article')).toEqual([second, first]);
			expect(view.find('article[data-row="1"]')).toBe(first);
			expect(first.querySelector('em')).toBe(label);
			expect(label.firstChild).toBe(text);
			expect(text?.nodeValue).toBe('updated');
			expect(first.querySelector('button')!.textContent).toBe('1');
			expect(second.querySelector('button')!.textContent).toBe('0');
			expect(first.querySelector('input')).toBe(input);
			expect(input.value).toBe('first draft');
			expect(document.activeElement).toBe(input);
		} finally {
			view.unmount();
			flushEffects();
		}
		expect(view.container.childNodes).toHaveLength(0);
		const mounted = log.effects.filter(([event]) => event === 'effect').map(([, props]) => props);
		const cleaned = log.effects.filter(([event]) => event === 'cleanup').map(([, props]) => props);
		expect(cleaned).toHaveLength(mounted.length);
		for (const props of mounted) expect(cleaned.filter((value) => value === props)).toHaveLength(1);
	});

	it('retires one wrapper while its sibling keeps independent state, input and id', () => {
		const log = wrapperEffects();
		const props = { ...log.props, first: [{ id: 1, label: 'first' }] };
		const view = mount(wrapperProduction.SiblingApp, props);
		try {
			flushEffects();
			const first = view.find('.first-region .wrapped-counter');
			const second = view.find('.second-region .wrapped-counter');
			const secondInput = second.querySelector('input')!;
			const secondId = second.querySelector('output')!.textContent;
			const firstProps = log.effects.find(
				([event, value]) => event === 'effect' && (value as Wrapped.CounterProps).label === 'first',
			)![1];
			secondInput.value = 'second draft';
			view.click('.first-region button');
			view.click('.second-region button');
			view.click('.second-region button');
			flushEffects();
			expect(first.querySelector('button')!.textContent).toBe('1');
			expect(second.querySelector('button')!.textContent).toBe('2');
			view.update(wrapperProduction.SiblingApp, { ...props, first: [] });
			flushEffects();
			expect(view.container.querySelector('.first-region .wrapped-counter')).toBeNull();
			expect(first.isConnected).toBe(false);
			expect(
				log.effects.filter(([event, value]) => event === 'cleanup' && value === firstProps),
			).toHaveLength(1);
			expect(view.find('.second-region .wrapped-counter')).toBe(second);
			expect(second.querySelector('button')!.textContent).toBe('2');
			expect(second.querySelector('input')).toBe(secondInput);
			expect(secondInput.value).toBe('second draft');
			expect(second.querySelector('output')!.textContent).toBe(secondId);
			view.update(wrapperProduction.SiblingApp, {
				...props,
				first: [{ id: 2, label: 'new first' }],
			});
			flushEffects();
			const replacement = view.find('.first-region .wrapped-counter');
			expect(replacement).not.toBe(first);
			expect(replacement.querySelector('button')!.textContent).toBe('0');
			expect(replacement.querySelector('input')!.value).toBe('seed');
			expect(view.find('.second-region .wrapped-counter')).toBe(second);
			expect(second.querySelector('button')!.textContent).toBe('2');
			expect(second.querySelector('input')).toBe(secondInput);
			expect(secondInput.value).toBe('second draft');
			expect(second.querySelector('output')!.textContent).toBe(secondId);
		} finally {
			view.unmount();
			flushEffects();
		}
		expect(view.container.childNodes).toHaveLength(0);
		const mounted = log.effects.filter(([event]) => event === 'effect').map(([, props]) => props);
		const cleaned = log.effects.filter(([event]) => event === 'cleanup').map(([, props]) => props);
		expect(cleaned).toHaveLength(mounted.length);
		for (const props of mounted) expect(cleaned.filter((value) => value === props)).toHaveLength(1);
	});

	it.each([
		['project plugin', Wrapped.NativeResourceBoundary],
		['production compiler', wrapperProduction.NativeResourceBoundary],
	] as const)('resumes a resource between native siblings with the %s', async (_mode, body) => {
		let resolveFirst!: (value: string) => void, resolveNext!: (value: string) => void;
		const first = new Promise<string>((done) => {
			resolveFirst = done;
		});
		const next = new Promise<string>((done) => {
			resolveNext = done;
		});
		const log = wrapperEffects();
		const view = mount(body, { ...log.props, promise: first });
		try {
			expect(view.find('.native-resource-pending').textContent).toBe('waiting');
			expect(log.effects).toEqual([]);
			await act(() => resolveFirst('first'));
			flushEffects();
			// These nodes are observed only after the first successful publication.
			const before = view.find('.before-resource');
			const resource = view.find('.wrapped-resource');
			const after = view.find('.after-resource');
			const host = view.find('.resource-host');
			const input = resource.querySelector('input')!;
			const label = resource.querySelector('em')!;
			const text = label.firstChild;
			input.value = 'published draft';
			expect(before.parentNode).toBe(host);
			expect(before.nextElementSibling).toBe(resource);
			expect(resource.nextElementSibling).toBe(after);
			view.click('.wrapped-resource button');
			flushEffects();
			expect(resource.querySelector('button')!.textContent).toBe('1');
			view.update(body, { ...log.props, promise: next });
			expect(view.find('.native-resource-pending').textContent).toBe('waiting');
			await act(() => resolveNext('next'));
			flushEffects();
			expect(view.find('.resource-host')).toBe(host);
			expect(view.find('.before-resource')).toBe(before);
			expect(view.find('.after-resource')).toBe(after);
			expect(view.find('.wrapped-resource')).toBe(resource);
			expect(before.nextElementSibling).toBe(resource);
			expect(resource.nextElementSibling).toBe(after);
			expect(label.firstChild).toBe(text);
			expect(text?.nodeValue).toBe('next');
			expect(resource.querySelector('input')).toBe(input);
			expect(input.value).toBe('published draft');
			expect(resource.querySelector('button')!.textContent).toBe('1');
			expect(view.container.querySelector('.native-resource-pending')).toBeNull();
		} finally {
			view.unmount();
			resolveFirst('released');
			resolveNext('released');
			flushEffects();
		}
		expect(view.container.childNodes).toHaveLength(0);
		expect(log.effects.filter(([event]) => event === 'cleanup').map(([, props]) => props)).toEqual(
			log.effects.filter(([event]) => event === 'effect').map(([, props]) => props),
		);
	});

	it.each([
		['project plugin', Wrapped.NativeResourceBoundary],
		['production compiler', wrapperProduction.NativeResourceBoundary],
	] as const)(
		'does not publish a native-host resource after pending unmount with the %s',
		async (_mode, body) => {
			let resolve!: (value: string) => void;
			const pending = new Promise<string>((done) => {
				resolve = done;
			});
			const log = wrapperEffects();
			const view = mount(body, { ...log.props, promise: pending });
			let unmounted = false;
			try {
				expect(view.find('.native-resource-pending').textContent).toBe('waiting');
				view.unmount();
				unmounted = true;
				await act(() => resolve('late'));
				flushEffects();
				expect(view.container.childNodes).toHaveLength(0);
				expect(log.effects).toEqual([]);
				expect(log.conditional).toEqual([]);
			} finally {
				if (!unmounted) view.unmount();
				resolve('released');
				flushEffects();
			}
		},
	);

	it('retries a nested resource without reviving an obsolete request or losing child state', async () => {
		let firstResolve!: (value: string) => void,
			oldResolve!: (value: string) => void,
			latestResolve!: (value: string) => void;
		const first = new Promise<string>((done) => {
			firstResolve = done;
		});
		const old = new Promise<string>((done) => {
			oldResolve = done;
		});
		const latest = new Promise<string>((done) => {
			latestResolve = done;
		});
		const log = wrapperEffects();
		const view = mount(Wrapped.Nested, { ...log.props, promise: first });
		try {
			expect(view.find('.inner-pending').textContent).toBe('inner waiting');
			expect(view.container.querySelector('.outer-pending')).toBeNull();
			expect(log.effects).toEqual([]);
			await act(() => firstResolve('first'));
			flushEffects();
			const child = view.find('.wrapped-resource');
			const input = view.find('input') as HTMLInputElement;
			const label = view.find('em');
			input.value = 'draft';
			view.click('button');
			flushEffects();
			expect(log.effects.map(([event]) => event)).toEqual(['effect']);
			view.update(Wrapped.Nested, { ...log.props, promise: old });
			view.update(Wrapped.Nested, { ...log.props, promise: latest });
			await act(() => oldResolve('obsolete'));
			expect(view.container.textContent).not.toContain('obsolete');
			await act(() => latestResolve('current'));
			flushEffects();
			expect(view.find('.wrapped-resource')).toBe(child);
			expect(view.find('input')).toBe(input);
			expect(input.value).toBe('draft');
			expect(view.find('em')).toBe(label);
			expect(label.textContent).toBe('current');
			expect(view.find('button').textContent).toBe('1');
			expect(view.container.querySelector('.inner-pending')).toBeNull();
		} finally {
			view.unmount();
			flushEffects();
		}
		expect(view.container.childNodes).toHaveLength(0);
	});

	it('recovers from a later sibling error with accepted content and live events', () => {
		const log = wrapperEffects();
		const props = { ...log.props, promise: resolvedResource('first'), read: () => 'ready' };
		const view = mount(Wrapped.Held, props);
		try {
			flushEffects();
			const label = view.find('em');
			expect(() =>
				view.update(Wrapped.Held, {
					...props,
					promise: resolvedResource('rejected'),
					read() {
						throw Error('rejected sibling');
					},
				}),
			).toThrow('rejected sibling');
			expect(label.textContent).toBe('first');
			view.update(Wrapped.Held, {
				...props,
				promise: resolvedResource('accepted'),
				read: () => 'current',
			});
			flushEffects();
			expect(view.find('em').textContent).toBe('accepted');
			view.click('button');
			expect(view.find('button').textContent).toBe('1');
		} finally {
			view.unmount();
			flushEffects();
		}
		expect(view.container.childNodes).toHaveLength(0);
		expect(log.effects.filter(([event]) => event === 'cleanup').map(([, props]) => props)).toEqual(
			log.effects.filter(([event]) => event === 'effect').map(([, props]) => props),
		);
	});

	it('preserves child identity while a later sibling is held and superseded', async () => {
		let resolve!: () => void;
		const pending = new Promise<void>((done) => {
			resolve = done;
		});
		let ready = false,
			reads = 0;
		const log = wrapperEffects();
		const props = { ...log.props, promise: resolvedResource('first'), read: () => 'ready' };
		const view = mount(Wrapped.Held, props);
		try {
			flushEffects();
			const child = view.find('.wrapped-resource');
			const label = view.find('em');
			const text = label.firstChild;
			const input = view.find('input') as HTMLInputElement;
			const id = view.find('output').textContent;
			input.value = 'draft';
			view.update(Wrapped.Held, {
				...props,
				promise: resolvedResource('abandoned'),
				read() {
					reads++;
					if (!ready) throw pending;
					return 'stale';
				},
			});
			expect(reads).toBeGreaterThan(0);
			expect(label.textContent).toBe('first');
			expect(log.effects.map(([event]) => event)).toEqual(['effect']);
			view.update(Wrapped.Held, {
				...props,
				promise: resolvedResource('accepted'),
				read: () => 'current',
			});
			await act(() => {
				ready = true;
				resolve();
			});
			expect(view.find('.wrapped-resource')).toBe(child);
			expect(view.find('em')).toBe(label);
			expect(label.firstChild).toBe(text);
			expect(label.textContent).toBe('accepted');
			expect(view.find('input')).toBe(input);
			expect(input.value).toBe('draft');
			expect(view.find('output').textContent).toBe(id);
			expect(view.find('.last').textContent).toBe('current');
		} finally {
			ready = true;
			resolve();
			view.unmount();
			flushEffects();
		}
		expect(view.container.childNodes).toHaveLength(0);
	});
});

describe('dynamic string component composition', () => {
	it('holds existing content while a later sibling suspends and discards its superseded update', async () => {
		const { Held } = loadCompiledFixtureSource(
			`${readFileSync(dynamicFilename, 'utf8')}
function PendingSibling(props) @{
  const value = props.read();
  <p>{value as string}</p>
}
export function Held(props) @{
  <section>
    <App rows={props.rows} tick={props.tick} onPick={props.onPick}/>
    <PendingSibling read={props.read}/>
  </section>
}`,
			{ id: 'held-dynamic-components.tsrx', mode: 'client', compileOptions },
		);
		let resolve!: () => void;
		const pending = new Promise<void>((done) => {
			resolve = done;
		});
		let ready = false;
		let pendingReads = 0;
		const picked: string[] = [];
		const onPick = (id: number, label: string) => picked.push(`${id}:${label}`);
		const view = mount(Held, {
			rows: [{ id: 1, label: 'first' }],
			tick: 0,
			onPick,
			read: () => 'ready',
		});
		try {
			const label = view.find('[data-dynamic-label]');
			const text = Array.from(label.childNodes).find(
				(node) => node.nodeType === Node.TEXT_NODE && node.nodeValue === 'first',
			)!;
			const input = view.find('input') as HTMLInputElement;
			input.value = 'held draft';
			view.update(Held, {
				rows: [{ id: 1, label: 'abandoned' }],
				tick: 1,
				onPick,
				read() {
					pendingReads++;
					if (!ready) throw pending;
					return 'stale';
				},
			});
			expect(pendingReads).toBeGreaterThan(0);
			expect(view.find('[data-dynamic-label]')).toBe(label);
			expect(label.isConnected).toBe(true);
			expect(label.textContent).toBe('beforefirstafter');
			expect(label.getAttribute('title')).toBe('first');
			expect(text.parentNode).toBe(label);
			expect(text.nodeValue).toBe('first');
			expect(view.find('input')).toBe(input);
			expect(input.value).toBe('held draft');
			expect(view.find('p').textContent).toBe('ready');
			view.update(Held, {
				rows: [{ id: 1, label: 'accepted' }],
				tick: 2,
				onPick,
				read: () => 'current',
			});
			await act(async () => {
				ready = true;
				resolve();
				await pending;
			});
			expect(view.find('[data-dynamic-label]')).toBe(label);
			expect(label.textContent).toBe('beforeacceptedafter');
			expect(label.getAttribute('title')).toBe('accepted');
			expect(text.parentNode).toBe(label);
			expect(text.nodeValue).toBe('accepted');
			expect(view.find('input')).toBe(input);
			expect(input.value).toBe('held draft');
			expect(view.find('p').textContent).toBe('current');
			view.click('button');
			expect(picked).toEqual(['1:accepted']);
		} finally {
			ready = true;
			resolve();
			view.unmount();
		}
		expect(view.container.childNodes).toHaveLength(0);
	});

	it.each([
		['project plugin', DynamicApp],
		['production compiler', ProductionDynamicApp],
	] as const)(
		'updates independent keyed instances without replacing their nodes with the %s',
		(_mode, body) => {
			const rows = [
				{ id: 1, label: 'first' },
				{ id: 2, label: 'second' },
			];
			const picked: string[] = [];
			const onPick = (id: number, label: string) => picked.push(`${id}:${label}`);
			const view = mount(body, { rows, tick: 0, onPick });
			try {
				const first = view.find('article[data-row="1"]');
				const second = view.find('article[data-row="2"]');
				const firstLabel = first.querySelector('[data-dynamic-label]')!;
				const secondLabel = second.querySelector('[data-dynamic-label]')!;
				const firstText = firstLabel.childNodes[1];
				const secondText = secondLabel.childNodes[1];
				const input = first.querySelector('input')!;
				input.value = 'retained draft';
				input.focus();
				expect(firstText.nodeValue).toBe('first');
				expect(secondText.nodeValue).toBe('second');
				view.update(body, { rows, tick: 1, onPick });
				view.update(body, { rows: rows.map((row) => ({ ...row })), tick: 1, onPick });
				expect(firstLabel.childNodes[1]).toBe(firstText);
				expect(secondLabel.childNodes[1]).toBe(secondText);
				expect(document.activeElement).toBe(input);
				const changed = [{ id: 1, label: 'changed' }, rows[1]];
				view.update(body, { rows: changed, tick: 2, onPick });
				expect(view.find('article[data-row="1"]')).toBe(first);
				expect(firstLabel.getAttribute('title')).toBe('changed');
				expect(firstLabel.textContent).toBe('beforechangedafter');
				expect(firstLabel.childNodes[1]).toBe(firstText);
				expect(firstText.nodeValue).toBe('changed');
				expect(secondText.nodeValue).toBe('second');
				view.update(body, { rows: [changed[1], changed[0]], tick: 3, onPick });
				expect(view.findAll('article')).toEqual([second, first]);
				expect(view.find('article[data-row="1"]')).toBe(first);
				expect(view.find('article[data-row="2"]')).toBe(second);
				expect(view.find('article[data-row="1"] input')).toBe(input);
				expect(input.value).toBe('retained draft');
				view.click('article[data-row="1"] button');
				view.click('article[data-row="2"] button');
				expect(picked).toEqual(['1:changed', '2:second']);
			} finally {
				view.unmount();
			}
			expect(view.container.childNodes).toHaveLength(0);
		},
	);

	it.each([
		['empty', ''],
		['carriage return', 'a\rb'],
		['null character', 'a\u0000b'],
		['whitespace', ' \tline\n '],
	] as const)(
		'keeps a dynamic %s string in its original text node and attribute',
		(_name, value) => {
			const onPick = () => {};
			const view = mount(DynamicApp, { rows: [{ id: 1, label: 'initial' }], tick: 0, onPick });
			try {
				const label = view.find('[data-dynamic-label]');
				const [before, text, after] = Array.from(label.childNodes);
				view.update(DynamicApp, { rows: [{ id: 1, label: value }], tick: 1, onPick });
				expect(view.find('[data-dynamic-label]')).toBe(label);
				expect(Array.from(label.childNodes)).toEqual([before, text, after]);
				[label.childNodes[0], label.childNodes[1], label.childNodes[2]].forEach((node, index) => {
					expect(node).toBe([before, text, after][index]);
				});
				expect(before.nodeValue).toBe('before');
				expect(text.nodeValue).toBe(value);
				expect(after.nodeValue).toBe('after');
				expect(label.getAttribute('title')).toBe(value);
				expect(label.textContent).toBe(`before${value}after`);
				view.update(DynamicApp, { rows: [{ id: 1, label: 'restored' }], tick: 2, onPick });
				expect(label.childNodes[1]).toBe(text);
				expect(text.nodeValue).toBe('restored');
			} finally {
				view.unmount();
			}
		},
	);

	it('retires conditional content and creates a fresh instance when it returns', () => {
		const onPick = () => {};
		const props = { rows: [{ id: 1, label: 'first' }], tick: 0, onPick, visible: true };
		const view = mount(DynamicToggle, props);
		try {
			const oldLabel = view.find('[data-dynamic-label]');
			const oldInput = view.find('input') as HTMLInputElement;
			oldInput.value = 'retired draft';
			view.update(DynamicToggle, { ...props, visible: false });
			expect(view.container.textContent).toBe('hidden');
			expect(oldLabel.isConnected).toBe(false);
			expect(oldInput.isConnected).toBe(false);
			view.update(DynamicToggle, { ...props, rows: [{ id: 1, label: 'new' }] });
			expect(view.find('[data-dynamic-label]')).not.toBe(oldLabel);
			expect(view.find('[data-dynamic-label]').textContent).toBe('beforenewafter');
			expect(view.find('input')).not.toBe(oldInput);
			expect((view.find('input') as HTMLInputElement).value).toBe('seed');
		} finally {
			view.unmount();
		}
	});

	it('evaluates a template-literal input at the existing caller position', () => {
		const input = `function Label({ label }) @{ <span>{label as string}</span> }
function Entry({ label }) @{ <section class="dynamic-entry"><Label label={label}/></section> }
export function App(props) @{ <main class="dynamic-caller"><Entry label={\`\${props.read()}\`}/></main> }`;
		const { App: Observed } = loadCompiledFixtureSource(input, {
			id: 'dynamic-input-order.tsrx',
			mode: 'client',
			compileOptions,
		});
		const observations: string[] = [];
		const view = mount(Observed, {
			read() {
				observations.push(
					`${document.querySelector('.dynamic-caller')?.isConnected === true}:${document.querySelector('.dynamic-entry') !== null}`,
				);
				return 'first';
			},
		});
		try {
			expect(observations).toEqual(['true:false']);
			expect(view.container.textContent).toBe('first');
			view.update(Observed, {
				read() {
					observations.push(
						`${document.querySelector('.dynamic-caller')?.isConnected === true}:${document.querySelector('.dynamic-entry') !== null}`,
					);
					return 'second';
				},
			});
			expect(observations).toEqual(['true:false', 'true:true']);
			expect(view.container.textContent).toBe('second');
		} finally {
			view.unmount();
		}
	});

	it('preserves getter and object-coercion order when another entry call has an unknown value', () => {
		const input = `function Label({ label }) @{ <span title={label}>{label as string}</span> }
function Entry({ label }) @{ <section class="opaque-entry"><Label label={label}/></section> }
export function Proven(props) @{ <main><Entry label={\`\${props.value}\`}/></main> }
export function Opaque(props) @{ <main class="opaque-caller"><Entry label={(props.beforeRead(), props.value)}/></main> }`;
		const { Opaque } = loadCompiledFixtureSource(input, {
			id: 'mixed-dynamic-inputs.tsrx',
			mode: 'client',
			compileOptions,
		});
		const observations: string[] = [];
		const value = {
			[Symbol.toPrimitive]() {
				observations.push(
					`coerce:${document.querySelector('.opaque-entry')?.isConnected === true}:${document.querySelector('.opaque-entry span') !== null}`,
				);
				return 'coerced';
			},
		};
		const view = mount(Opaque, {
			beforeRead() {
				observations.push('before');
			},
			get value() {
				observations.push(
					`get:${document.querySelector('.opaque-caller')?.isConnected === true}:${document.querySelector('.opaque-entry') !== null}`,
				);
				return value;
			},
		});
		try {
			// The title observes the detached leaf; its text binding runs after insertion.
			// Moving either coercion across host construction changes visible DOM state.
			expect(observations).toEqual([
				'before',
				'get:true:false',
				'coerce:true:false',
				'coerce:true:true',
			]);
			expect(view.find('span').textContent).toBe('coerced');
			expect(view.find('span').getAttribute('title')).toBe('coerced');
		} finally {
			view.unmount();
		}
	});
});

describe('static component composition', () => {
	it('preserves large fixed text and attributes under distinct component wrappers', () => {
		const value = 'long description '.repeat(640);
		const { App: LargeLabels } = loadCompiledFixtureSource(
			`function Label({ text }) @{ <span title={text}>{text as string}</span> }
function FirstCard() @{ <section class="first"><Label text={${JSON.stringify(value)}}/></section> }
function SecondCard() @{ <section class="second"><Label text={${JSON.stringify(value)}}/></section> }
export function App(props) @{ <main data-tick={props.tick}><FirstCard/><SecondCard/></main> }`,
			{ id: 'large-component-labels.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(LargeLabels, { tick: 0 });
		try {
			const spans = [view.find('.first span'), view.find('.second span')];
			const texts = spans.map((node) => node.firstChild);
			for (const span of spans) {
				expect(span.textContent).toBe(value);
				expect(span.getAttribute('title')).toBe(value);
			}
			view.update(LargeLabels, { tick: 1 });
			expect(view.find('main').getAttribute('data-tick')).toBe('1');
			for (const [index, selector] of ['.first span', '.second span'].entries()) {
				const span = view.find(selector);
				expect(span).toBe(spans[index]);
				expect(span.firstChild).toBe(texts[index]);
				expect(span.textContent).toBe(value);
				expect(span.getAttribute('title')).toBe(value);
			}
		} finally {
			view.unmount();
		}
		expect(view.container.childNodes).toHaveLength(0);
	});

	it.each([
		['carriage return', 'a\rb'],
		['null character', 'a\u0000b'],
	] as const)('preserves a %s in a child text and attribute value', (_name, value) => {
		const { App: StringValue } = loadCompiledFixtureSource(
			`function Label({ text }) @{ <span title={text}>{text as string}</span> }
function Card() @{ <div><Label text={${JSON.stringify(value)}}/></div> }
export function App() @{ <Card/> }`,
			{ id: 'component-string-values.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(StringValue);
		try {
			expect(view.find('span').textContent).toBe(value);
			expect(view.find('span').getAttribute('title')).toBe(value);
		} finally {
			view.unmount();
		}
	});

	it.each([
		['project plugin', App],
		['production compiler', ProductionApp],
	] as const)(
		'preserves keyed rows, nested nodes, drafts and events with the %s',
		(_mode, body) => {
			const rows = [{ id: 1 }, { id: 2 }];
			const picked: number[] = [];
			const onPick = (id: number) => picked.push(id);
			const view = mount(body, { rows, tick: 0, onPick });
			try {
				expect(view.findAll('[data-label]').map((node) => node.textContent)).toEqual([
					'fixed',
					'fixed',
				]);
				const elements = view.findAll('*');
				const texts = view.findAll('[data-label]').map((node) => node.firstChild);
				const firstInput = view.find('article[data-row="1"] input') as HTMLInputElement;
				const secondInput = view.find('article[data-row="2"] input') as HTMLInputElement;
				firstInput.value = 'first draft';
				secondInput.value = 'second draft';
				firstInput.focus();

				view.update(body, { rows, tick: 1, onPick });
				view.update(body, { rows, tick: 1, onPick });
				expect(view.find('main').getAttribute('data-tick')).toBe('1');
				const updated = view.findAll('*');
				expect(updated).toHaveLength(elements.length);
				updated.forEach((node, index) => expect(node).toBe(elements[index]));
				view.findAll('[data-label]').forEach((node, index) => {
					expect(node.firstChild).toBe(texts[index]);
				});
				expect(document.activeElement).toBe(firstInput);

				view.update(body, { rows: [rows[1], rows[0]], tick: 2, onPick });
				expect(view.findAll('article').map((node) => node.getAttribute('data-row'))).toEqual([
					'2',
					'1',
				]);
				expect(view.find('article[data-row="1"] input')).toBe(firstInput);
				expect(view.find('article[data-row="2"] input')).toBe(secondInput);
				expect(firstInput.value).toBe('first draft');
				expect(secondInput.value).toBe('second draft');
				view.click('article[data-row="1"] button');
				view.click('article[data-row="2"] button');
				expect(picked).toEqual([1, 2]);
			} finally {
				view.unmount();
			}
			expect(view.container.childNodes).toHaveLength(0);
		},
	);

	it.each([
		['empty child', '', '{text as string}', ['']],
		['adjacent text', 'middle', 'before{text as string}after', ['before', 'middle', 'after']],
		['adjacent empty child', '', 'before{text as string}after', ['before', '', 'after']],
	] as const)('preserves the text nodes of an %s', (_name, value, children, expected) => {
		const { App: TextValue } = loadCompiledFixtureSource(
			`function Label({ text }) @{ <span>${children}</span> }
function Card() @{ <div><Label text={${JSON.stringify(value)}}/></div> }
export function App(props) @{ <section data-tick={props.tick}><Card/></section> }`,
			{ id: 'component-text-segments.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(TextValue, { tick: 0 });
		try {
			const span = view.find('span');
			const texts = Array.from(span.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
			expect(texts.map((node) => node.nodeValue)).toEqual(expected);
			view.update(TextValue, { tick: 1 });
			expect(view.find('span')).toBe(span);
			const updated = Array.from(span.childNodes).filter(
				(node) => node.nodeType === Node.TEXT_NODE,
			);
			expect(updated.map((node) => node.nodeValue)).toEqual(expected);
			updated.forEach((node, index) => expect(node).toBe(texts[index]));
		} finally {
			view.unmount();
		}
	});

	it('keeps a native tag distinct from a lowercase function with the same name', () => {
		// The unused lowercase declaration is intentional: <div> is a native tag,
		// so adding a JavaScript reference would change the escape condition.
		const { App: HostNames } = loadCompiledFixtureSource(
			`function div() @{ <strong>wrong</strong> }
function Label() @{ <em>right</em> }
function Card() @{ <section><div/><Label/></section> }
export function App() @{ <Card/> }`,
			{ id: 'host-component-names.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(HostNames);
		try {
			expect(view.container.textContent).toBe('right');
			expect(Array.from(view.find('section').children, (node) => node.tagName)).toEqual([
				'DIV',
				'EM',
			]);
		} finally {
			view.unmount();
		}
	});

	it('evaluates an opaque child input after its parent host has been inserted', () => {
		const observed: boolean[] = [];
		const { App: Observed } = loadCompiledFixtureSource(
			`import { observe } from 'composition-observation';
function Label(props) @{ <span>{props.value as string}</span> }
function Card() @{ <div data-observed="true"><Label value={observe()}/></div> }
export function App() @{ <section><Card/></section> }`,
			{
				id: 'component-input-order.tsrx',
				mode: 'client',
				compileOptions,
				runtimeModules: {
					'composition-observation': {
						observe() {
							observed.push(document.querySelector('[data-observed]')?.isConnected === true);
							return 'observed';
						},
					},
				},
			},
		);
		const view = mount(Observed);
		try {
			expect(observed).toEqual([true]);
			expect(view.container.textContent).toBe('observed');
		} finally {
			view.unmount();
		}
	});

	it('retains the text returned by a child separately from its neighboring text', () => {
		const { App: TextComposition } = loadCompiledFixtureSource(
			`function Label() { return 'right'; }
function Card() @{ <div>left<Label/>tail</div> }
export function App(props) @{ <section data-tick={props.tick}><Card/></section> }`,
			{ id: 'text-component-boundary.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(TextComposition, { tick: 0 });
		try {
			const host = view.find('div');
			const text = Array.from(host.childNodes).find(
				(node) => node.nodeType === Node.TEXT_NODE && node.nodeValue === 'right',
			);
			expect(text).toBeDefined();
			expect(host.textContent).toBe('leftrighttail');
			view.update(TextComposition, { tick: 1 });
			expect(view.find('div')).toBe(host);
			expect(text!.parentNode).toBe(host);
			expect(text!.nodeValue).toBe('right');
			expect(host.textContent).toBe('leftrighttail');
		} finally {
			view.unmount();
		}
	});

	it('retains live defaults when a component is used as an element value', () => {
		const { App: Defaults, setDefault } = loadCompiledFixtureSource(
			`let label = 'first';
function Label(props) { return <span>{props.label as string}</span>; }
Object.defineProperty(Label, 'defaultProps', { get() { return {label}; } });
export function setDefault(value) { label = value; }
export function App(props) @{ <section data-tick={props.tick}>{<Label/>}</section> }`,
			{ id: 'component-value-defaults.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(Defaults, { tick: 0 });
		try {
			expect(view.container.textContent).toBe('first');
			setDefault('second');
			view.update(Defaults, { tick: 1 });
			expect(view.container.textContent).toBe('second');
		} finally {
			view.unmount();
		}
	});
});
