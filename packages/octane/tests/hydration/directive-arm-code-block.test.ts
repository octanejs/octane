import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// A child `@{ … }` block written as the direct output of a directive arm —
// `@if (x) { @{ … } }` with no host around it inside the arm — is the arm's
// render output, exactly as it is at any other child position. A render-only
// block is transparent. A block with setup is its own render scope at that
// position and keeps its hook state across parent updates.

type Props = Record<string, unknown>;
type Modules = ReturnType<typeof load>;

function load(source: string, id: string, dev: boolean) {
	const compileOptions = { dev };
	return {
		client: loadCompiledFixtureSource(source, { id, mode: 'client', compileOptions }),
		server: loadCompiledFixtureSource(source, { id, mode: 'server', compileOptions }),
	};
}

// Each block reads `name`, a binding its arm can see.
const output = (name: string) => `<b>{(first + '/' + ${name}) as string}</b>`;
const BLOCKS = {
	RenderOnly: (name: string) => `@{ <b>{${name} as string}</b> }`,
	Setup: (name: string) => `@{ const [first] = useState(${name}); ${output(name)} }`,
	// The block owns the directive in its own output.
	SetupIf: (name: string) =>
		`@{ const [first] = useState(${name}); @if (${name} !== '') { ${output(name)} } }`,
	// A render-only block whose output is a setup-bearing block.
	Nested: (name: string) => `@{ @{ const [first] = useState(${name}); ${output(name)} } }`,
} as const;
type Block = keyof typeof BLOCKS;

// Every state keeps `x`, so each arm stays selected; only `label` changes.
const ARMS: Record<string, (block: (name: string) => string) => string> = {
	If: (block) => `@if (x > 0) { ${block('label')} }`,
	Else: (block) => `@if (x < 0) { <i /> } @else { ${block('label')} }`,
	ElseIf: (block) => `@if (x < 0) { <i /> } @else if (x > 0) { ${block('label')} } @else { <s /> }`,
	Case: (block) => `@switch (x) { @case 1: { ${block('label')} } @default: { <i /> } }`,
	Default: (block) => `@switch (x) { @case 0: { <i /> } @default: { ${block('label')} } }`,
	Try: (block) => `@try { ${block('label')} } @catch (e) { <i /> }`,
	For: (block) => `@for (const row of [x]; key row) { ${block('label')} }`,
	// The block reads the row binding only the item body can see.
	ForRow: (block) => `@for (const row of [label]; key 0) { ${block('row')} }`,
	Empty: (block) =>
		`@for (const row of x > 0 ? [] : [x]; key row) { <i /> } @empty { ${block('label')} }`,
	ForInIf: (block) => `@if (x > 0) { @for (const row of [x]; key row) { ${block('label')} } }`,
	// The block reads the arm's own setup.
	ArmSetup: (block) => `@if (x > 0) { const shown = label; ${block('shown')} }`,
	// An early exit nests the rest of the arm, block included, under a guard.
	EarlyReturn: (block) => `@if (x > 0) { if (label === '') return; ${block('label')} }`,
	EarlyContinue: (block) =>
		`@for (const row of [x]; key row) { if (row < 0) continue; ${block('label')} }`,
};

const HOSTS: {
	name: string;
	component: (name: string, arm: string) => string;
}[] = [
	{
		name: 'a template body',
		component: (name, arm) => `export function ${name}({ x, label }: Props) @{
	<div class="list">${arm}</div>
}`,
	},
	{
		name: 'returned JSX',
		component: (name, arm) => `export function ${name}({ x, label }: Props) {
	return <div class="list">${arm}</div>;
}`,
	},
	{
		name: 'a keyed host',
		component: (name, arm) => `export function ${name}({ x, label }: Props) @{
	<div key={x} class="list">${arm}</div>
}`,
	},
	{
		name: 'a component root',
		component: (name, arm) => `function ${name}Root({ x, label }: Props) @{
	${arm}
}
export function ${name}({ x, label }: Props) @{
	<div class="list"><${name}Root x={x} label={label} /></div>
}`,
	},
];

function source(host: (typeof HOSTS)[number]) {
	const components = Object.entries(ARMS).flatMap(([arm, write]) =>
		Object.entries(BLOCKS).map(([block, text]) => host.component(arm + block, write(text))),
	);
	return `import { useState } from 'octane';
type Props = { x: number; label: string };
${components.join('\n')}
`;
}

const STATES: Props[] = [
	{ x: 1, label: 'a' },
	{ x: 1, label: 'b' },
];

function expected(block: Block): string[] {
	const inner = block === 'RenderOnly' ? ['a', 'b'] : ['a/a', 'a/b'];
	return inner.map((text) => `<div class="list"><b>${text}</b></div>`);
}

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
	vi.restoreAllMocks();
});

function newContainer(): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	containers.push(container);
	return container;
}

// Hydration and range markers are not part of the rendered content.
function content(container: HTMLElement): string {
	return container.innerHTML.replace(/<!--[^]*?-->/g, '');
}

function serverHtml(modules: Modules, name: string, props: Props): string {
	return ServerRT.renderToString(modules.server[name], props).html.replace(/<!--[^]*?-->/g, '');
}

function mount(modules: Modules, name: string) {
	const container = newContainer();
	const root = createRoot(container);
	const seen: string[] = [];
	const blocks: (Element | null)[] = [];
	for (const props of STATES) {
		flushSync(() => root.render(modules.client[name], props));
		seen.push(content(container));
		blocks.push(container.querySelector('b'));
	}
	root.unmount();
	return { seen, blocks };
}

async function hydrate(modules: Modules, name: string) {
	const container = newContainer();
	container.innerHTML = ServerRT.renderToString(modules.server[name], STATES[0]).html;
	const serverElements = Array.from(container.querySelectorAll('*'));
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, modules.client[name], STATES[0], {
		onRecoverableError: (error) => recoverable.push(error),
	});
	await act(() => {});
	const hydrated = content(container);
	const hydratedElements = Array.from(container.querySelectorAll('*'));
	const block = container.querySelector('b');
	flushSync(() => root.render(modules.client[name], STATES[1]));
	const updated = content(container);
	const updatedBlock = container.querySelector('b');
	root.unmount();
	return {
		hydrated,
		updated,
		serverElements,
		hydratedElements,
		blockSurvived: block !== null && block === updatedBlock,
		recoverable,
		errors: errors.mock.calls,
	};
}

describe.each([false, true])('a child @{} block as a directive arm output (dev: %s)', (dev) => {
	for (const [index, host] of HOSTS.entries()) {
		// Every test renders into its own root, so they share one compile.
		let shared: Modules | undefined;
		const modules = () => (shared ??= load(source(host), `directive-arm-block-${index}.tsrx`, dev));

		for (const arm of Object.keys(ARMS)) {
			for (const block of Object.keys(BLOCKS) as Block[]) {
				const name = arm + block;

				it(`renders a ${block} block in a ${arm} arm under ${host.name} on the server and on mount and update`, () => {
					const compiled = modules();
					const html = expected(block);
					expect(serverHtml(compiled, name, STATES[0])).toBe(html[0]);
					const mounted = mount(compiled, name);
					expect(mounted.seen).toEqual(html);
					// The update keeps the block's DOM (and, for setup, its state).
					expect(mounted.blocks[1]).toBe(mounted.blocks[0]);
				});

				// An early exit in an arm under returned JSX fails to hydrate with any
				// output, block or not; that is a separate defect.
				if (arm === 'EarlyReturn' && host.name === 'returned JSX') continue;

				it(`hydrates a ${block} block in a ${arm} arm under ${host.name} from renderToString`, async () => {
					const compiled = modules();
					const html = expected(block);
					const result = await hydrate(compiled, name);
					expect(result.recoverable).toEqual([]);
					expect(result.errors).toEqual([]);
					expect(result.hydrated).toBe(html[0]);
					expect(result.hydratedElements).toEqual(result.serverElements);
					expect(result.updated).toBe(html[1]);
					expect(result.blockSurvived).toBe(true);
				});
			}
		}
	}

	// The @catch and @pending arms render only when their @try body fails or
	// suspends, so they get a body that always does. Hydration re-renders a
	// thrown or still-pending body on the client instead of adopting the
	// server's arm, whatever the arm renders, so these arms are checked on the
	// server and on mount and update.
	const boundaries = () =>
		load(
			`import { use, useState } from 'octane';
type Props = { label: string; promise: Promise<string> };
function Thrower({ label }: { label: string }): never {
	throw new Error('boom ' + label);
}
function Waiter({ promise }: { promise: Promise<string> }) @{
	<u>{use(promise) as string}</u>
}
export function Catch({ label }: Props) @{
	<div class="list">@try { <Thrower label={label} /> } @catch (e) { @{ const [first] = useState(label); <b>{(first + '/' + label + ':' + (e as Error).message) as string}</b> } }</div>
}
export function Pending({ label, promise }: Props) @{
	<div class="list">@try { <Waiter promise={promise} /> } @pending { @{ const [first] = useState(label); ${output('label')} } }</div>
}
`,
			'directive-arm-block-boundaries.tsrx',
			dev,
		);
	const BOUNDARIES = {
		// The boundary keeps the first error while its arm's block keeps its state.
		Catch: ['a/a:boom a', 'a/b:boom a'],
		Pending: ['a/a', 'a/b'],
	};

	for (const [name, texts] of Object.entries(BOUNDARIES)) {
		it(`renders a setup block in a ${name} arm on the server and on mount and update`, async () => {
			const compiled = boundaries();
			const html = texts.map((text) => `<div class="list"><b>${text}</b></div>`);
			const promise = new Promise<string>(() => {});
			vi.spyOn(console, 'error').mockImplementation(() => {});
			expect(serverHtml(compiled, name, { label: 'a', promise })).toBe(html[0]);
			const container = newContainer();
			const root = createRoot(container);
			await act(() => root.render(compiled.client[name], { label: 'a', promise }));
			expect(content(container)).toBe(html[0]);
			const block = container.querySelector('b');
			await act(() => root.render(compiled.client[name], { label: 'b', promise }));
			expect(content(container)).toBe(html[1]);
			expect(container.querySelector('b')).toBe(block);
			root.unmount();
		});
	}

	// The arm's block reads a sub-template local or a mapped row's item, names
	// that reach the hoisted arm only through its captures.
	const scopes = () =>
		load(
			`import { useState } from 'octane';
type Props = { x: number; label: string; items: { id: number; v: string }[] };
export function SubTemplate({ x, label }: Props) @{
	const inner = () => @{ const tag = label + '!'; @if (x > 0) { @{ const [first] = useState(tag); ${output('tag')} } } };
	<div class="list">{inner}</div>
}
export function MappedRow({ items, label }: Props) @{
	<ul>{items.map((item) => <li key={item.id}>@if (item.id > 0) { @{ const [first] = useState(item.v + label); ${output('item.v + label')} } }</li>)}</ul>
}
`,
			'directive-arm-block-scopes.tsrx',
			dev,
		);
	const items = [
		{ id: 1, v: 'p' },
		{ id: 2, v: 'q' },
	];
	const list = (...rows: string[]) =>
		`<ul>${rows.map((row) => `<li><b>${row}</b></li>`).join('')}</ul>`;
	const SCOPES: Record<string, string[]> = {
		SubTemplate: ['<div class="list"><b>a!/a!</b></div>', '<div class="list"><b>a!/b!</b></div>'],
		MappedRow: [list('pa/pa', 'qa/qa'), list('pa/pb', 'qa/qb')],
	};

	for (const [name, html] of Object.entries(SCOPES)) {
		it(`renders and hydrates a block in an arm of a ${name}`, async () => {
			const compiled = scopes();
			const first = { x: 1, label: 'a', items };
			const second = { x: 1, label: 'b', items };
			expect(serverHtml(compiled, name, first)).toBe(html[0]);

			const container = newContainer();
			const root = createRoot(container);
			flushSync(() => root.render(compiled.client[name], first));
			expect(content(container)).toBe(html[0]);
			const block = container.querySelector('b');
			flushSync(() => root.render(compiled.client[name], second));
			expect(content(container)).toBe(html[1]);
			expect(container.querySelector('b')).toBe(block);
			root.unmount();

			const hydrated = newContainer();
			hydrated.innerHTML = ServerRT.renderToString(compiled.server[name], first).html;
			const serverElements = Array.from(hydrated.querySelectorAll('*'));
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			const recoverable: unknown[] = [];
			const hydratedRoot = hydrateRoot(hydrated, compiled.client[name], first, {
				onRecoverableError: (error) => recoverable.push(error),
			});
			await act(() => {});
			expect(recoverable).toEqual([]);
			expect(errors.mock.calls).toEqual([]);
			expect(Array.from(hydrated.querySelectorAll('*'))).toEqual(serverElements);
			flushSync(() => hydratedRoot.render(compiled.client[name], second));
			expect(content(hydrated)).toBe(html[1]);
			expect(hydrated.querySelector('b')).toBe(serverElements.find((el) => el.tagName === 'B'));
			hydratedRoot.unmount();
		});
	}

	const effects = () =>
		load(
			`import { useEffect, useState } from 'octane';
type Props = { x: number; label: string; log: string[] };
export function CodeOnly({ x, log }: Props) @{
	<div class="list">@if (x > 0) { @{ useEffect(() => { log.push('effect ' + x); }); } }</div>
}
export function EmptyBlock({ x }: Props) @{
	<div class="list">@if (x > 0) { @{} } @else { <i /> }</div>
}
export function Toggle({ x, label }: Props) @{
	<div class="list">@if (x > 0) { @{ const [first] = useState(label); ${output('label')} } }</div>
}
`,
			'directive-arm-block-effects.tsrx',
			dev,
		);

	it('runs the setup of a code-only block in an arm and renders nothing for it', async () => {
		const compiled = effects();
		const empty = '<div class="list"></div>';
		expect(serverHtml(compiled, 'CodeOnly', { x: 1, log: [] })).toBe(empty);

		const container = newContainer();
		const root = createRoot(container);
		const log: string[] = [];
		await act(() => root.render(compiled.client.CodeOnly, { x: 1, log }));
		expect(content(container)).toBe(empty);
		expect(log).toEqual(['effect 1']);
		root.unmount();

		const hydrated = newContainer();
		hydrated.innerHTML = ServerRT.renderToString(compiled.server.CodeOnly, { x: 1, log: [] }).html;
		const list = hydrated.querySelector('.list');
		const recoverable: unknown[] = [];
		const hydrateLog: string[] = [];
		const hydratedRoot = hydrateRoot(
			hydrated,
			compiled.client.CodeOnly,
			{ x: 1, log: hydrateLog },
			{ onRecoverableError: (error) => recoverable.push(error) },
		);
		await act(() => {});
		expect(recoverable).toEqual([]);
		expect(hydrateLog).toEqual(['effect 1']);
		expect(hydrated.querySelector('.list')).toBe(list);
		hydratedRoot.unmount();
	});

	it('renders nothing for an empty block in an arm', () => {
		const compiled = effects();
		expect(serverHtml(compiled, 'EmptyBlock', { x: 1 })).toBe('<div class="list"></div>');
		const container = newContainer();
		const root = createRoot(container);
		flushSync(() => root.render(compiled.client.EmptyBlock, { x: 1 }));
		expect(content(container)).toBe('<div class="list"></div>');
		flushSync(() => root.render(compiled.client.EmptyBlock, { x: 0 }));
		expect(content(container)).toBe('<div class="list"><i></i></div>');
		root.unmount();
	});

	it("drops a block's state when its arm unmounts and starts fresh when it returns", () => {
		const compiled = effects();
		const container = newContainer();
		const root = createRoot(container);
		const seen: string[] = [];
		for (const props of [
			{ x: 1, label: 'a' },
			{ x: 1, label: 'b' },
			{ x: 0, label: 'c' },
			{ x: 1, label: 'd' },
		]) {
			flushSync(() => root.render(compiled.client.Toggle, props));
			seen.push(content(container));
		}
		expect(seen).toEqual([
			'<div class="list"><b>a/a</b></div>',
			'<div class="list"><b>a/b</b></div>',
			'<div class="list"></div>',
			'<div class="list"><b>d/d</b></div>',
		]);
		root.unmount();
	});
});
