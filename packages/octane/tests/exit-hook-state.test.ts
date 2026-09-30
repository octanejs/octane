import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, hydrateRoot } from '../src/index.js';
import * as ServerRT from 'octane/server';
import * as UniversalRuntime from '../src/universal.js';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	flushUniversalAct,
	type ObjectHostInstance,
} from '../src/universal.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { mount as mountDom } from './_helpers.js';
import { MixedExitRows } from './_fixtures/exit-hook-state-mixed.tsrx';

// A hook's state lives as long as the component, `@for` row, or directive arm
// that calls it. An early exit only skips the rest of one render: state
// declared after the exit survives renders that take it, while an effect after
// the exit disconnects when a render skips it and reconnects when one reaches
// it again. The same source must keep that lifetime on the DOM compiler
// (client and hydration) and the universal compiler.

const universalRenderer = { id: 'object', module: 'octane/universal', target: 'universal' };

type Props = {
	rows: string[];
	hidden: string[];
	allocate: () => string;
	log: string[];
	expose?: (row: string, set: (value: string) => void) => void;
};

// The state and effect after the exit. `$V` is the arm's value.
const HOOKS = `const [mount, setMount] = useState(props.allocate);
props.expose?.($V, setMount);
useEffect(() => {
	props.log.push('mount ' + $V);
	return () => {
		props.log.push('cleanup ' + $V);
	};
}, []);`;
const ITEM = '<item name={$V} mount={mount} />';

// Each shape exits exactly when `$V` is hidden.
const EXITS = {
	Guard: `if (props.hidden.includes($V)) return;`,
	ExplicitNull: `if (props.hidden.includes($V)) return null;`,
	Nested: `if (props.rows.length > 0) { if (props.hidden.includes($V)) return; }`,
	Switch: `switch (props.hidden.includes($V)) { case true: return; }`,
} as const;

// `continue;` is an exit only in an `@for` body.
const FOR_EXITS = {
	Continue: `if (props.hidden.includes($V)) continue;`,
	NestedContinue: `if (props.rows.length > 0) { if (props.hidden.includes($V)) continue; }`,
} as const;

function arm(exit: string): string {
	return `${exit}\n${HOOKS}\n${ITEM}`;
}

// Every declaration form after the exit stays readable by the output.
const DECLARATIONS = `const name: string = $V;
if (props.hidden.includes(name)) return;
const [mount, setMount]: [string, (value: string) => void] = useState(props.allocate);
props.expose?.(name, setMount);
const { length } = name;
let shown = length > 0 ? mount : '';
function read() {
	return shown;
}
class Reader {
	read() {
		return read();
	}
}
useEffect(() => {
	props.log.push('mount ' + name);
	return () => {
		props.log.push('cleanup ' + name);
	};
}, []);
<item name={name} mount={new Reader().read()} />`;

type Case = { source: string; multi: boolean };
const CASES: Record<string, Case> = {};

function add(name: string, source: string, multi: boolean) {
	CASES[name] = { source, multi };
}

const DIRECTIVES = {
	For: (body: string) =>
		`<list>@for (const row of props.rows; key row) {\n${body.replaceAll('$V', 'row')}\n}</list>`,
	If: (body: string) =>
		`<list>@if (props.rows.length > 0) {\n${body.replaceAll('$V', "'a'")}\n}</list>`,
	Else: (body: string) =>
		`<list>@if (props.rows.length === 0) { <i /> } @else {\n${body.replaceAll('$V', "'a'")}\n}</list>`,
	Switch: (body: string) =>
		`<list>@switch (props.rows.length) { @case 0: { <i /> } @default: {\n${body.replaceAll('$V', "'a'")}\n} }</list>`,
} as const;

for (const [directive, wrap] of Object.entries(DIRECTIVES)) {
	const multi = directive === 'For';
	for (const [shape, exit] of Object.entries(EXITS)) {
		add(`${directive}${shape}`, `export function Case(props) @{\n${wrap(arm(exit))}\n}`, multi);
	}
	add(
		`${directive}Declarations`,
		`export function Case(props) @{\n${wrap(DECLARATIONS)}\n}`,
		multi,
	);
}
for (const [shape, exit] of Object.entries(FOR_EXITS)) {
	add(`For${shape}`, `export function Case(props) @{\n${DIRECTIVES.For(arm(exit))}\n}`, true);
}

// Component bodies: the host root lowers its guard to template control flow,
// the component and fragment roots keep a real return, and the plain function
// returns values. A custom hook that returns early is the control: it has no
// scope of its own, so its state can only survive.
const COMPONENT_BODIES = {
	TemplateHost: (exit: string) => `function Inner(props) @{\n${arm(exit)}\n}`,
	TemplateComponent: (exit: string) =>
		`function Leaf(props) @{ <item name={props.name} mount={props.mount} /> }
function Inner(props) @{\n${exit}\n${HOOKS}\n<Leaf name={$V} mount={mount} />\n}`,
	TemplateFragment: (exit: string) =>
		`function Inner(props) @{\n${exit}\n${HOOKS}\n<>${ITEM}</>\n}`,
	ValueReturn: (exit: string) => `function Inner(props) {\n${exit}\n${HOOKS}\nreturn ${ITEM};\n}`,
} as const;

for (const [form, body] of Object.entries(COMPONENT_BODIES)) {
	for (const [shape, exit] of Object.entries(EXITS)) {
		add(
			`${form}${shape}`,
			`${body(exit).replaceAll('$V', "'a'")}
export function Case(props) @{ <list><Inner {...props} /></list> }`,
			false,
		);
	}
}
add(
	'TemplateHostDeclarations',
	`function Inner(props) @{\n${DECLARATIONS.replaceAll('$V', "'a'")}\n}
export function Case(props) @{ <list><Inner {...props} /></list> }`,
	false,
);
add(
	'CustomHook',
	`function useMount(props) {
	if (props.hidden.includes('a')) return null;
	${HOOKS.replaceAll('$V', "'a'")}
	return mount;
}
export function Case(props) @{
	const mount = useMount(props);
	<list>
		@if (mount !== null) {
			<item name="a" mount={mount} />
		}
	</list>
}`,
	false,
);

function sourceOf(name: string): string {
	return `import { useEffect, useState } from 'octane';\n${CASES[name].source}\n`;
}

// Hidden rows per render: the exit is taken, cleared, taken by every row, and
// cleared again.
const STATES = [[], ['a'], [], ['a', 'b'], []];

function expectedItems(multi: boolean, tokens: { a: string; b: string }): string[][] {
	return STATES.map((hidden) =>
		(multi ? ['a', 'b'] : ['a'])
			.filter((row) => !hidden.includes(row))
			.map((row) => `${row}:${tokens[row as 'a' | 'b']}`),
	);
}

function expectedLog(multi: boolean): string[] {
	return multi
		? [
				'mount a',
				'mount b',
				'cleanup a',
				'mount a',
				'cleanup a',
				'cleanup b',
				'mount a',
				'mount b',
				'cleanup a',
				'cleanup b',
			]
		: ['mount a', 'cleanup a', 'mount a', 'cleanup a', 'mount a', 'cleanup a'];
}

function counter() {
	let next = 0;
	return () => `m${++next}`;
}

function props(hidden: string[], allocate: () => string, log: string[], expose?: Props['expose']) {
	return { rows: ['a', 'b'], hidden, allocate, log, expose };
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

function domItems(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll('item')).map(
		(item) => `${item.getAttribute('name')}:${item.getAttribute('mount')}`,
	);
}

function objectItems(parent: { children: readonly ObjectHostInstance[] }): string[] {
	const out: string[] = [];
	for (const child of parent.children) {
		if (child.type === 'item') out.push(`${child.props.name}:${child.props.mount}`);
		out.push(...objectItems(child));
	}
	return out;
}

function loadDom(name: string, dev: boolean) {
	const compileOptions = { dev };
	const id = `exit-hook-state-${name}.tsrx`;
	return {
		client: loadCompiledFixtureSource(sourceOf(name), { id, mode: 'client', compileOptions }),
		server: loadCompiledFixtureSource(sourceOf(name), { id, mode: 'server', compileOptions }),
	};
}

function loadUniversal(name: string, dev: boolean) {
	return loadCompiledFixtureSource(sourceOf(name), {
		id: `exit-hook-state-${name}.object.tsrx`,
		mode: 'client',
		compileOptions: { dev, renderer: universalRenderer },
		runtimeModules: { 'octane/universal': UniversalRuntime },
	});
}

async function runDom(Case: any) {
	const container = newContainer();
	const root = createRoot(container);
	const allocate = counter();
	const log: string[] = [];
	const seen: string[][] = [];
	for (const hidden of STATES) {
		await act(() => root.render(Case, props(hidden, allocate, log)));
		seen.push(domItems(container));
	}
	await act(() => root.unmount());
	return { seen, log };
}

async function hydrateDom(modules: ReturnType<typeof loadDom>, states: string[][]) {
	const container = newContainer();
	const log: string[] = [];
	container.innerHTML = ServerRT.renderToString(
		modules.server.Case,
		props(states[0], counter(), []),
	).html;
	const serverElements = Array.from(container.querySelectorAll('*'));
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const allocate = counter();
	const root = hydrateRoot(container, modules.client.Case, props(states[0], allocate, log), {
		onRecoverableError: (error) => recoverable.push(error),
	});
	await act(() => {});
	const hydratedElements = Array.from(container.querySelectorAll('*'));
	const seen = [domItems(container)];
	for (const hidden of states.slice(1)) {
		await act(() => root.render(modules.client.Case, props(hidden, allocate, log)));
		seen.push(domItems(container));
	}
	await act(() => root.unmount());
	return { seen, log, serverElements, hydratedElements, recoverable, errors: errors.mock.calls };
}

function runUniversal(Case: any) {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	const allocate = counter();
	const log: string[] = [];
	const seen: string[][] = [];
	for (const hidden of STATES) {
		flushUniversalAct(() => root.render(Case, props(hidden, allocate, log)));
		seen.push(objectItems(container));
	}
	flushUniversalAct(() => root.unmount());
	return { seen, log };
}

describe.each([false, true])('hook state after an early exit (dev: %s)', (dev) => {
	for (const [name, testCase] of Object.entries(CASES)) {
		const expected = expectedItems(testCase.multi, { a: 'm1', b: 'm2' });
		describe(name, () => {
			let dom: ReturnType<typeof loadDom> | undefined;
			const domModules = () => (dom ??= loadDom(name, dev));

			it('keeps its state on the DOM client', async () => {
				const result = await runDom(domModules().client.Case);
				expect(result.seen).toEqual(expected);
				expect(result.log).toEqual(expectedLog(testCase.multi));
			});

			it('keeps its state after hydration', async () => {
				const result = await hydrateDom(domModules(), STATES);
				expect(result.recoverable).toEqual([]);
				expect(result.errors).toEqual([]);
				expect(result.hydratedElements).toEqual(result.serverElements);
				expect(result.seen).toEqual(expected);
				expect(result.log).toEqual(expectedLog(testCase.multi));
			});

			it('keeps state first created after hydrating with the exit taken', async () => {
				// The server renders row a exited, so the client allocates it last.
				const states = [['a'], [], ['a'], []];
				const result = await hydrateDom(domModules(), states);
				expect(result.recoverable).toEqual([]);
				expect(result.errors).toEqual([]);
				expect(result.hydratedElements).toEqual(result.serverElements);
				const a = testCase.multi ? 'm2' : 'm1';
				const b = testCase.multi ? ['b:m1'] : [];
				expect(result.seen).toEqual([b, [`a:${a}`, ...b], b, [`a:${a}`, ...b]]);
			});

			it('keeps its state on the universal renderer', () => {
				const result = runUniversal(loadUniversal(name, dev).Case);
				expect(result.seen).toEqual(expected);
				expect(result.log).toEqual(expectedLog(testCase.multi));
			});
		});
	}
});

// The state cell itself survives, not just its initializer: an update made
// before the exit, and one made while the exit is taken, both show when the
// output returns.
describe.each(['ForGuard', 'IfNested', 'TemplateHostGuard', 'ValueReturnExplicitNull'])(
	'updates to state after an exit in %s',
	(name) => {
		const expected = [['a:m1'], ['a:updated'], [], [], ['a:while-exited']];
		const setters = new Map<string, (value: string) => void>();
		const at = (hidden: string[], allocate: () => string) => ({
			...props(hidden, allocate, [], (row, set) => setters.set(row, set)),
			rows: ['a'],
		});

		it('apply on the DOM client', async () => {
			const Case = loadDom(name, false).client.Case;
			const container = newContainer();
			const root = createRoot(container);
			const allocate = counter();
			const seen: string[][] = [];
			await act(() => root.render(Case, at([], allocate)));
			seen.push(domItems(container));
			const set = setters.get('a')!;
			await act(() => set('updated'));
			seen.push(domItems(container));
			await act(() => root.render(Case, at(['a'], allocate)));
			seen.push(domItems(container));
			await act(() => set('while-exited'));
			seen.push(domItems(container));
			await act(() => root.render(Case, at([], allocate)));
			seen.push(domItems(container));
			expect(setters.get('a')).toBe(set);
			await act(() => root.unmount());
			expect(seen).toEqual(expected);
		});

		it('apply on the universal renderer', () => {
			const Case = loadUniversal(name, false).Case;
			const container = createObjectContainer();
			const root = createUniversalRoot(container, createObjectDriver());
			const allocate = counter();
			const seen: string[][] = [];
			flushUniversalAct(() => root.render(Case, at([], allocate)));
			seen.push(objectItems(container));
			const set = setters.get('a')!;
			flushUniversalAct(() => set('updated'));
			seen.push(objectItems(container));
			flushUniversalAct(() => root.render(Case, at(['a'], allocate)));
			seen.push(objectItems(container));
			flushUniversalAct(() => set('while-exited'));
			seen.push(objectItems(container));
			flushUniversalAct(() => root.render(Case, at([], allocate)));
			seen.push(objectItems(container));
			expect(setters.get('a')).toBe(set);
			flushUniversalAct(() => root.unmount());
			expect(seen).toEqual(expected);
		});
	},
);

// A tail that reads use() starts all of its independent reads before the first
// one suspends, hydrates against the values the server resolved, and keeps its
// state like any other tail.
const USE_TAIL = `const [mount] = useState(props.allocate);
const first = use(props.load($V + '1'));
const second = use(props.load($V + '2'));
<item name={$V} mount={mount + ':' + first + second} />`;
const USE_CASES = {
	For: `export function Case(props) @{\n${DIRECTIVES.For(`if (props.hidden.includes(row)) continue;\n${USE_TAIL}`)}\n}`,
	If: `export function Case(props) @{\n${DIRECTIVES.If(`if (props.hidden.includes('a')) return;\n${USE_TAIL}`)}\n}`,
	TemplateHost: `function Inner(props) @{\nif (props.hidden.includes('a')) return;\n${USE_TAIL.replaceAll('$V', "'a'")}\n}
export function Case(props) @{ <list><Inner {...props} /></list> }`,
} as const;

describe.each(Object.entries(USE_CASES))('a hooked tail that reads use() in %s', (form, body) => {
	const multi = form === 'For';
	const source = `import { use, useState } from 'octane';\n${body}\n`;

	it('starts every read before the first one suspends', async () => {
		const Case = loadCompiledFixtureSource(source, {
			id: `exit-hook-state-use-start-${form}.tsrx`,
			mode: 'client',
		}).Case;
		const requested: string[] = [];
		const load = (key: string) => {
			requested.push(key);
			return new Promise<string>(() => {});
		};
		const root = createRoot(newContainer());
		await act(() => root.render(Case, { ...props([], counter(), []), rows: ['a'], load }));
		expect(requested).toEqual(['a1', 'a2']);
		await act(() => root.unmount());
	});

	const load = (key: string) => ({
		status: 'fulfilled' as const,
		value: key.toUpperCase(),
		then() {},
	});
	const at = (hidden: string[], allocate: () => string) => ({
		...props(hidden, allocate, []),
		load,
	});
	const shown = (hidden: string[]) =>
		(multi ? ['a', 'b'] : ['a'])
			.filter((row) => !hidden.includes(row))
			.map((row) => `${row}:m${row === 'a' ? 1 : 2}:${row.toUpperCase()}1${row.toUpperCase()}2`);

	it.each([false, true])('hydrates and keeps its state (dev: %s)', async (dev) => {
		const id = `exit-hook-state-use-${form}.tsrx`;
		const client = loadCompiledFixtureSource(source, {
			id,
			mode: 'client',
			compileOptions: { dev },
		});
		const server = loadCompiledFixtureSource(source, {
			id,
			mode: 'server',
			compileOptions: { dev },
		});
		const container = newContainer();
		container.innerHTML = ServerRT.renderToString(server.Case, at([], counter())).html;
		// Hydration consumes the server's use() seed script; the output stays.
		const rendered = () => Array.from(container.querySelectorAll('list, item'));
		const serverElements = rendered();
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const recoverable: unknown[] = [];
		const allocate = counter();
		const root = hydrateRoot(container, client.Case, at([], allocate), {
			onRecoverableError: (error) => recoverable.push(error),
		});
		await act(() => {});
		expect(rendered()).toEqual(serverElements);
		const seen = [domItems(container)];
		for (const hidden of STATES.slice(1)) {
			await act(() => root.render(client.Case, at(hidden, allocate)));
			seen.push(domItems(container));
		}
		await act(() => root.unmount());
		expect(recoverable).toEqual([]);
		expect(errors.mock.calls).toEqual([]);
		expect(seen).toEqual(STATES.map(shown));
	});
});

// One component whose DOM rows compile with the DOM compiler and whose Canvas
// rows compile with the universal compiler.
it('gives state after an exit one lifetime across a renderer boundary', async () => {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	const allocate = counter();
	const log: string[] = [];
	const seen: string[] = [];
	const snapshot = (mounted: ReturnType<typeof mountDom>) =>
		seen.push(`${domItems(mounted.container)} / ${objectItems(container)}`);
	let mounted!: ReturnType<typeof mountDom>;
	await act(() => {
		mounted = mountDom(MixedExitRows, { ...props([], allocate, log), root });
	});
	snapshot(mounted);
	for (const hidden of [['a'], []]) {
		await act(() => mounted.update(MixedExitRows, { ...props(hidden, allocate, log), root }));
		snapshot(mounted);
	}
	await act(() => mounted.unmount());
	expect(seen).toEqual(['a:m1,b:m2 / a:m3,b:m4', 'b:m2 / b:m4', 'a:m1,b:m2 / a:m3,b:m4']);
	expect(log).toEqual([
		'dom mount a',
		'dom mount b',
		'object mount a',
		'object mount b',
		'dom cleanup a',
		'object cleanup a',
		'dom mount a',
		'object mount a',
		'dom cleanup a',
		'dom cleanup b',
		'object cleanup a',
		'object cleanup b',
	]);
});
