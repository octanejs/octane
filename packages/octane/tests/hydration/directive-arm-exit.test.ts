import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// An early exit ends the output of the directive arm that owns it, wherever it
// sits in that arm's setup: `return;` and `return null;` are the same exit, and
// so is one nested in an `if`, block, `switch`, loop, `try`, or labeled
// statement. A `continue;` that targets the `@for` is its item's exit. Jumps
// that target a loop, switch, or label inside the arm, and returns inside a
// nested function, stay ordinary JavaScript.

type Props = { x: number; label: string };
type Modules = ReturnType<typeof load>;

function load(source: string, id: string, dev: boolean) {
	const compileOptions = { dev };
	return {
		client: loadCompiledFixtureSource(source, { id, mode: 'client', compileOptions }),
		server: loadCompiledFixtureSource(source, { id, mode: 'server', compileOptions }),
	};
}

// Each shape exits exactly when `$V` is empty. `$V` is the arm's value: the
// label, or the `@for` item.
const SHAPES = {
	// The guard shape that always lowered, as a control.
	Guard: `if ($V === '') return;`,
	ExplicitNull: `if ($V === '') return null;`,
	BracedNull: `if ($V === '') { return null; }`,
	NestedIf: `if (x > 0) { if ($V === '') return; }`,
	NestedNull: `if (x > 0) { if ($V === '') return null; }`,
	SetupBeforeExit: `if ($V === '') { const reason = 'empty'; if (reason !== '') return; }`,
	ElseBranch: `let tone = 'plain'; if ($V !== '') { tone = 'set'; } else return;`,
	Switch: `switch ($V) { case '': return; default: break; }`,
	LoopLocalJumps: `for (const ch of ['skip', $V, 'stop']) { if (ch === 'skip') continue; if (ch === 'stop') break; if (ch === '') return null; }`,
	WhileLoop: `let i = 0; while (i < 1) { i++; if ($V === '') return; }`,
	TryFinally: `let done = false; try { if ($V === '') return; } finally { done = true; }`,
	Labeled: `check: { if ($V !== '') break check; return; }`,
	NestedFunction: `const empty = () => { return $V === ''; }; if (empty()) return;`,
	TwoExits: `if (x < 0) { return; } if (x > 0) { if ($V === '') return null; }`,
} as const;

// `continue;` is only an exit in an `@for` item body.
const FOR_SHAPES = {
	...SHAPES,
	NestedContinue: `if (x > 0) { if ($V === '') continue; }`,
	SwitchContinue: `switch ($V) { case '': continue; }`,
} as const;

const OUTPUT = '<b>{label as string}</b>';
const DIRECTIVES = {
	If: (exit: string) => `@if (x > 0) { ${exit} ${OUTPUT} }`,
	Else: (exit: string) => `@if (x < 0) { <i /> } @else { ${exit} ${OUTPUT} }`,
	Switch: (exit: string) => `@switch (x) { @case 1: { ${exit} ${OUTPUT} } @default: { <i /> } }`,
	For: (exit: string) => `@for (const item of [label]; key 0) { ${exit} <b>{item as string}</b> }`,
} as const;
type Directive = keyof typeof DIRECTIVES;

// An unconditional exit at the top of an arm: nothing after it renders.
const UNCONDITIONAL = {
	IfUnconditional: `@if (label === '') { return null; <b>never</b> } @else { ${OUTPUT} }`,
	ForUnconditional: `@for (const item of [label]; key 0) { @if (item === '') { return; } @else { <b>{item as string}</b> } }`,
} as const;

function shapesOf(directive: Directive): Record<string, string> {
	return directive === 'For' ? FOR_SHAPES : SHAPES;
}

// Every component under test, by name, with its directive source.
const COMPONENTS: Record<string, string> = { ...UNCONDITIONAL };
for (const directive of Object.keys(DIRECTIVES) as Directive[]) {
	for (const [shape, exit] of Object.entries(shapesOf(directive))) {
		const value = directive === 'For' ? 'item' : 'label';
		COMPONENTS[`${directive}${shape}`] = DIRECTIVES[directive](exit.replaceAll('$V', value));
	}
}

const list = (inner: string) => `<div class="list">${inner}</div>`;

const FORMS: {
	name: string;
	source: (name: string, directive: string) => string;
}[] = [
	{
		name: 'a template body',
		source: (name, directive) => `export function ${name}({ x, label }: Props) @{
	<div class="list">${directive}</div>
}`,
	},
	{
		name: 'returned JSX',
		source: (name, directive) => `export function ${name}({ x, label }: Props) {
	return <div class="list">${directive}</div>;
}`,
	},
];

function source(form: (typeof FORMS)[number], name: string) {
	return `type Props = { x: number; label: string };
${form.source(name, COMPONENTS[name])}
`;
}

function html(label: string): string {
	return list(label === '' ? '' : `<b>${label}</b>`);
}

// A same-arm text update, the exit taking effect, and the exit clearing again.
const STATES: Props[] = [
	{ x: 1, label: 'a' },
	{ x: 1, label: 'b' },
	{ x: 1, label: '' },
	{ x: 1, label: 'c' },
];

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
	const bolds: (Element | null)[] = [];
	for (const props of STATES) {
		flushSync(() => root.render(modules.client[name], props));
		seen.push(content(container));
		bolds.push(container.querySelector('b'));
	}
	root.unmount();
	return { seen, bolds };
}

async function hydrate(modules: Modules, name: string, states: Props[]) {
	const container = newContainer();
	container.innerHTML = ServerRT.renderToString(modules.server[name], states[0]).html;
	const serverElements = Array.from(container.querySelectorAll('*'));
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, modules.client[name], states[0], {
		onRecoverableError: (error) => recoverable.push(error),
	});
	await act(() => {});
	const seen = [content(container)];
	const hydratedElements = Array.from(container.querySelectorAll('*'));
	const bolds = [container.querySelector('b')];
	for (const props of states.slice(1)) {
		flushSync(() => root.render(modules.client[name], props));
		seen.push(content(container));
		bolds.push(container.querySelector('b'));
	}
	root.unmount();
	return {
		seen,
		bolds,
		serverElements,
		hydratedElements,
		recoverable,
		errors: errors.mock.calls,
	};
}

const expected = STATES.map((props) => html(props.label));

describe.each([false, true])('an early exit in a directive arm (dev: %s)', (dev) => {
	for (const [index, form] of FORMS.entries()) {
		describe(`under ${form.name}`, () => {
			for (const name of Object.keys(COMPONENTS)) {
				// One compile per component, shared by its cases, so a miscompiled
				// component fails only its own cases.
				let shared: Modules | undefined;
				const modules = () =>
					(shared ??= load(source(form, name), `directive-arm-exit-${index}-${name}.tsrx`, dev));

				it(`renders ${name} on the server and on mount and update`, () => {
					const compiled = modules();
					expect(STATES.map((props) => serverHtml(compiled, name, props))).toEqual(expected);
					const mounted = mount(compiled, name);
					expect(mounted.seen).toEqual(expected);
					expect(mounted.bolds[1]).toBe(mounted.bolds[0]);
				});

				it(`hydrates ${name} and keeps the server DOM through updates`, async () => {
					const result = await hydrate(modules(), name, STATES);
					expect(result.recoverable).toEqual([]);
					expect(result.errors).toEqual([]);
					expect(result.seen).toEqual(expected);
					expect(result.hydratedElements).toEqual(result.serverElements);
					expect(result.bolds[0]).not.toBeNull();
					expect(result.bolds[1]).toBe(result.bolds[0]);
				});

				it(`hydrates ${name} with the exit taken on the server`, async () => {
					const result = await hydrate(modules(), name, [STATES[2], STATES[3], STATES[2]]);
					expect(result.recoverable).toEqual([]);
					expect(result.errors).toEqual([]);
					expect(result.seen).toEqual([expected[2], expected[3], expected[2]]);
					expect(result.hydratedElements).toEqual(result.serverElements);
				});
			}
		});
	}
});

// An arm that can exit renders nothing when it does, so neither it nor the
// component it roots can serve as a keyed row's or a sibling's boundary. Rows
// keep their order and siblings their place while exits take, clear, and rows
// move, including exits that sit inside a `switch`, loop, or labeled block.
type Row = { id: string; hide: boolean };

const POSITION_SOURCE = `type Row = { id: string; hide: boolean };
function Leaf({ row }: { row: Row }) @{
	@if (row.id !== '') {
		for (const hide of [row.hide]) {
			if (hide) return;
		}
		<b>{row.id as string}</b>
	} @else {
		<i />
	}
}
function LabeledLeaf({ row }: { row: Row }) @{
	@if (row.id !== '') {
		check: {
			if (!row.hide) break check;
			return;
		}
		<b>{row.id as string}</b>
	} @else {
		<i />
	}
}
export function Guard({ rows }: { rows: Row[] }) @{
	<div class="list">
		@for (const row of rows; key row.id) {
			if (row.hide) return;
			<b>{row.id as string}</b>
		}
		<hr />
	</div>
}
export function TwoGuards({ rows }: { rows: Row[] }) @{
	<div class="list">
		@for (const row of rows; key row.id) {
			if (row.id === '') return;
			if (row.hide) return;
			<b>{row.id as string}</b>
		}
		<hr />
	</div>
}
export function NestedExit({ rows }: { rows: Row[] }) @{
	<div class="list">
		@for (const row of rows; key row.id) {
			if (row.id !== '') {
				if (row.hide) return null;
			}
			<b>{row.id as string}</b>
		}
		<hr />
	</div>
}
export function HostIfRow({ rows }: { rows: Row[] }) @{
	<div class="list">
		@for (const row of rows; key row.id) {
			@if (row.id !== '') {
				switch (row.hide) {
					case true:
						return;
				}
				<b>{row.id as string}</b>
			} @else {
				<i />
			}
		}
		<hr />
	</div>
}
export function ComponentRow({ rows }: { rows: Row[] }) @{
	<div class="list">
		@for (const row of rows; key row.id) {
			<Leaf row={row} />
		}
		<hr />
	</div>
}
export function Siblings({ rows }: { rows: Row[] }) @{
	<div class="list">
		<LabeledLeaf row={rows[0]} />
		<LabeledLeaf row={rows[1]} />
	</div>
}
`;

const POSITION_COMPONENTS = [
	'Guard',
	'TwoGuards',
	'NestedExit',
	'HostIfRow',
	'ComponentRow',
	'Siblings',
] as const;

const rows = (spec: string): Row[] =>
	spec.split(' ').map((token) => ({ id: token.replace('_', ''), hide: token.startsWith('_') }));

// `_` marks a row whose arm exits.
const ROW_STATES = [
	'a _b c',
	'c b _a',
	'_c a b',
	'b a c',
	'b _c a',
	'a b c',
	'_a _b _c',
	'c a b',
	'b c _a d',
].map(rows);

function rowsHtml(name: string, state: Row[]): string {
	const shown = (name === 'Siblings' ? state.slice(0, 2) : state).filter((row) => !row.hide);
	const bolds = shown.map((row) => `<b>${row.id}</b>`).join('');
	return list(name === 'Siblings' ? bolds : `${bolds}<hr>`);
}

describe.each([false, true])('an arm that can exit keeps its position (dev: %s)', (dev) => {
	let shared: Modules | undefined;
	const modules = () => (shared ??= load(POSITION_SOURCE, 'directive-arm-exit-position.tsrx', dev));

	for (const name of POSITION_COMPONENTS) {
		for (const start of [0, 1, 2]) {
			const states = [...ROW_STATES.slice(start), ...ROW_STATES.slice(0, start)];
			const expected = states.map((state) => rowsHtml(name, state));

			it(`mounts ${name} from state ${start} and updates through exits and moves`, () => {
				const { client } = modules();
				const container = newContainer();
				const root = createRoot(container);
				const seen: string[] = [];
				for (const state of states) {
					flushSync(() => root.render(client[name], { rows: state }));
					seen.push(content(container));
				}
				root.unmount();
				expect(seen).toEqual(expected);
			});

			it(`hydrates ${name} from state ${start} and updates through exits and moves`, async () => {
				const { client, server } = modules();
				const container = newContainer();
				container.innerHTML = ServerRT.renderToString(server[name], { rows: states[0] }).html;
				const serverElements = Array.from(container.querySelectorAll('*'));
				const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
				const recoverable: unknown[] = [];
				const root = hydrateRoot(
					container,
					client[name],
					{ rows: states[0] },
					{
						onRecoverableError: (error) => recoverable.push(error),
					},
				);
				await act(() => {});
				const hydratedElements = Array.from(container.querySelectorAll('*'));
				const seen = [content(container)];
				for (const state of states.slice(1)) {
					flushSync(() => root.render(client[name], { rows: state }));
					seen.push(content(container));
				}
				root.unmount();
				expect(recoverable).toEqual([]);
				expect(errors.mock.calls).toEqual([]);
				expect(hydratedElements).toEqual(serverElements);
				expect(seen).toEqual(expected);
			});
		}
	}
});

// A `@{ … }` block is a nested template, not an arm: the jumps its setup owns
// stay JavaScript, and a `continue;` in an arm inside the block ends only that
// arm. (A jump that would leave the block is a compile error.) Both forms keep
// their rows in order while the inner arm exits, clears, and rows move.
const BLOCK_SOURCE = `type Row = { id: string; hide: boolean };
export function ChildBlock({ rows }: { rows: Row[] }) @{
	<div class="list">
		@for (const row of rows; key row.id) {
			<p>
				@{
					let seen = 0;
					for (const ch of row.id + 'xz') {
						if (ch === 'x') continue;
						if (ch === 'z') break;
						seen++;
					}
					check: {
						if (seen > 0) break check;
						seen = -1;
					}
					@if (row.id !== '') {
						if (row.hide) continue;
						<b>{\`\${row.id}\${seen}\`}</b>
					}
				}
			</p>
		}
		<hr />
	</div>
}
export function OutputBlock({ rows }: { rows: Row[] }) @{
	<div class="list">
		@for (const row of rows; key row.id) {
			@{
				let seen = 0;
				for (const ch of row.id) {
					switch (ch) {
						case 'x':
							continue;
						default:
							break;
					}
					seen++;
				}
				@if (row.id !== '') {
					if (row.hide) continue;
					<b>{\`\${row.id}\${seen}\`}</b>
				}
			}
		}
		<hr />
	</div>
}
`;

function blockHtml(name: 'ChildBlock' | 'OutputBlock', state: Row[]): string {
	const rendered = state.map((row) => {
		const bold = row.hide ? '' : `<b>${row.id}${row.id.length}</b>`;
		return name === 'ChildBlock' ? `<p>${bold}</p>` : bold;
	});
	return list(`${rendered.join('')}<hr>`);
}

describe.each([false, true])('an arm exit inside a child block (dev: %s)', (dev) => {
	let shared: Modules | undefined;
	const modules = () => (shared ??= load(BLOCK_SOURCE, 'directive-arm-exit-block.tsrx', dev));

	for (const name of ['ChildBlock', 'OutputBlock'] as const) {
		const expected = ROW_STATES.map((state) => blockHtml(name, state));

		it(`renders ${name} on the server and on mount and update`, () => {
			const { client, server } = modules();
			const parsed = newContainer();
			const serverSeen = ROW_STATES.map((state) => {
				parsed.innerHTML = ServerRT.renderToString(server[name], { rows: state }).html;
				return content(parsed);
			});
			expect(serverSeen).toEqual(expected);
			const container = newContainer();
			const root = createRoot(container);
			const seen: string[] = [];
			for (const state of ROW_STATES) {
				flushSync(() => root.render(client[name], { rows: state }));
				seen.push(content(container));
			}
			root.unmount();
			expect(seen).toEqual(expected);
		});

		it(`hydrates ${name} and updates through exits and moves`, async () => {
			const { client, server } = modules();
			const container = newContainer();
			container.innerHTML = ServerRT.renderToString(server[name], { rows: ROW_STATES[0] }).html;
			const serverElements = Array.from(container.querySelectorAll('*'));
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			const recoverable: unknown[] = [];
			const root = hydrateRoot(
				container,
				client[name],
				{ rows: ROW_STATES[0] },
				{ onRecoverableError: (error) => recoverable.push(error) },
			);
			await act(() => {});
			const hydratedElements = Array.from(container.querySelectorAll('*'));
			const seen = [content(container)];
			for (const state of ROW_STATES.slice(1)) {
				flushSync(() => root.render(client[name], { rows: state }));
				seen.push(content(container));
			}
			root.unmount();
			expect(recoverable).toEqual([]);
			expect(errors.mock.calls).toEqual([]);
			expect(hydratedElements).toEqual(serverElements);
			expect(seen).toEqual(expected);
		});
	}
});
