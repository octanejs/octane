// An islands-only route's shell is server-rendered and never loads in the
// browser, so client work it renders outside its independent islands never
// runs. A development render that asks for `shellWitness` reports each such
// construct it actually reached: a handler, a ref, an effect or subscription
// hook, an editable controlled value, or a live signal-handle binding.
import { resolve } from 'node:path';
import * as Signals from 'octane/signals';
import { renderToReadableStream, renderToString, type ShellWitness } from 'octane/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadServerFixture } from './_server-fixture';

const constructs = loadServerFixture(resolve(__dirname, '_fixtures/ssr-shell-witness.tsrx'), {
	compileOptions: { dev: true },
	runtimeModules: { 'octane/signals': Signals },
});
const shell = {
	...constructs,
	...loadServerFixture(resolve(__dirname, '_fixtures/ssr-shell-witness-islands.tsrx'), {
		compileOptions: { dev: true },
		runtimeModules: { './ssr-shell-witness.tsrx': constructs },
	}),
};
const independentHydration = {
	buildId: 'shell-witness',
	resolve: () => ({ moduleId: 'island', styles: [] }),
};
const at = expect.stringMatching(/ssr-shell-witness(?:-islands)?\.tsrx:\d+:\d+$/);

function render(component: unknown, props?: Record<string, unknown>) {
	const witnesses: ShellWitness[] = [];
	const { html } = renderToString(component as never, props, {
		independentHydration,
		shellWitness: (witness) => witnesses.push(witness),
	});
	return { html, witnesses };
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('DEV SSR islands shell witness', () => {
	it.each([
		['an event handler', 'Handler', {}, [{ kind: 'event', name: 'onClick', tag: 'button' }]],
		['a ref', 'Ref', {}, [{ kind: 'ref', name: 'ref', tag: 'div' }]],
		[
			'a controlled value',
			'Controlled',
			{ query: 'q', agreed: true },
			[
				{ kind: 'control', name: 'value', tag: 'input' },
				{ kind: 'control', name: 'checked', tag: 'input' },
			],
		],
		['a signal text binding', 'SignalText', {}, [{ kind: 'signal', name: 'signal', tag: 'span' }]],
		[
			'a signal attribute binding',
			'SignalAttribute',
			{},
			[{ kind: 'signal', name: 'signal', tag: 'span' }],
		],
		[
			'a signal handle under a local alias',
			'SignalAlias',
			{},
			[{ kind: 'signal', name: 'signal', tag: 'output' }],
		],
		['a function form action', 'Action', {}, [{ kind: 'event', name: 'action', tag: 'form' }]],
	] as const)('reports %s at its element', (_construct, name, props, expected) => {
		const { witnesses } = render(shell[name], props);

		expect(witnesses).toEqual(
			expected.map((witness) => ({ ...witness, location: at, component: name })),
		);
	});

	it.each([
		['effects', 'Effects', ['useEffect', 'useLayoutEffect']],
		['a layout snapshot under an alias', 'Snapshot', ['useLayoutSnapshot']],
		['an imperative handle', 'Handle', ['useImperativeHandle']],
		['a store subscription', 'Store', ['useSyncExternalStore']],
	] as const)('reports %s by the component that calls them', (_construct, name, hooks) => {
		const { witnesses } = render(shell[name]);

		expect(witnesses).toEqual(
			hooks.map((hook) => ({ kind: 'effect', name: hook, component: name })),
		);
	});

	it('reports handlers and refs that reach the server through a spread', () => {
		const { witnesses } = render(shell.Spread, {
			extra: { onClick: () => {}, onFocus: undefined, ref: { current: null }, title: 'Spread' },
		});

		expect(witnesses).toEqual([
			{ kind: 'event', name: 'onClick', tag: 'button', location: at, component: 'Spread' },
			{ kind: 'ref', name: 'ref', tag: 'button', location: at, component: 'Spread' },
		]);
		expect(render(shell.Spread, { extra: { onClick: null, ref: null } }).witnesses).toEqual([]);
	});

	it('reports a spread value only where the user can edit it', () => {
		expect(render(shell.SpreadInput, { extra: { value: 'q' } }).witnesses).toEqual([
			{ kind: 'control', name: 'value', tag: 'input', location: at, component: 'SpreadInput' },
		]);
		expect(render(shell.SpreadInput, { extra: { value: 'q', readOnly: true } }).witnesses).toEqual(
			[],
		);
		expect(render(shell.SpreadInput, { extra: { defaultValue: 'q' } }).witnesses).toEqual([]);
	});

	// A helper's createElement call is invisible to a source check of the shell.
	it('reports a handler on an element a plain helper creates', () => {
		const { html, witnesses } = render(shell.Descriptor);

		expect(html).toContain('Menu</button>');
		expect(witnesses).toEqual([
			{ kind: 'event', name: 'onClick', tag: 'button', component: 'Descriptor' },
		]);
	});

	it('reports a descriptor value only where the user can edit it', () => {
		expect(render(shell.DescriptorInput, { input: { value: 'q' } }).witnesses).toEqual([
			{ kind: 'control', name: 'value', tag: 'input', component: 'DescriptorInput' },
		]);
		for (const input of [
			{ value: 'q', disabled: true },
			{ value: 'q', type: 'submit' },
			{ defaultValue: 'q' },
			{ value: null },
		]) {
			expect(render(shell.DescriptorInput, { input }).witnesses).toEqual([]);
		}
	});

	it('stays silent for static markup and controls the user cannot edit', () => {
		expect(render(shell.Static).witnesses).toEqual([]);
		expect(render(shell.StaticControls, { query: 'q', choice: 'a' }).witnesses).toEqual([]);
	});

	it('reports only the branches and rows a render reaches, once per site', () => {
		expect(render(shell.Conditional, { open: false }).witnesses).toEqual([]);
		expect(render(shell.Conditional, { open: true }).witnesses).toHaveLength(1);
		expect(render(shell.Repeated, { items: ['a', 'b', 'c'] }).witnesses).toEqual([
			{ kind: 'event', name: 'onClick', tag: 'button', location: at, component: 'Repeated' },
		]);
	});

	it('leaves client work inside independent islands to the islands', () => {
		const { html, witnesses } = render(shell.Islands);

		expect(html).toContain('Nested</button>');
		// Only the shell's own handler, after every island (nested ones too) closed.
		expect(witnesses).toEqual([
			{ kind: 'event', name: 'onDoubleClick', tag: 'button', location: at, component: 'Islands' },
		]);
		expect(html.slice(html.lastIndexOf('<footer>'))).toContain('After</button>');
	});

	it('treats an ordinary Hydrate boundary as part of the shell', () => {
		expect(render(shell.OrdinaryHydrate).witnesses).toEqual([
			{ kind: 'event', name: 'onClick', tag: 'button', location: at, component: 'Handler' },
		]);
	});

	// The shell attempts the suspended arm and streams it in a later wave.
	it('reports a streamed boundary once across its waves', async () => {
		const witnesses: ShellWitness[] = [];
		let resolveData!: (value: string) => void;
		const data = new Promise<string>((done) => {
			resolveData = done;
		});
		const stream = await renderToReadableStream(
			shell.Deferred,
			{ data },
			{
				shellWitness: (witness) => witnesses.push(witness),
			},
		);
		resolveData('Ready');
		const html = await new Response(stream).text();

		expect(html).toContain('Ready</button>');
		expect(witnesses).toEqual([
			{ kind: 'event', name: 'onClick', tag: 'button', location: at, component: 'Deferred' },
		]);
	});

	it('changes no markup, and is inert unless requested', () => {
		for (const [component, props] of [
			[shell.Islands, undefined],
			[shell.Controlled, { query: 'q', agreed: true }],
			[shell.SignalText, undefined],
		] as const) {
			const plain = renderToString(component as never, props, { independentHydration });
			expect(render(component, props).html).toBe(plain.html);
		}
	});

	it('is ignored by production renders', () => {
		vi.stubEnv('NODE_ENV', 'production');

		expect(render(shell.Handler).witnesses).toEqual([]);
		expect(render(shell.Effects).witnesses).toEqual([]);
		expect(render(shell.Snapshot).witnesses).toEqual([]);
		expect(render(shell.SignalText).witnesses).toEqual([]);
	});
});
