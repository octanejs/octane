import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, type CompiledFixtureModule } from '../_server-fixture.js';

// `@{ … }` is shorthand for returning JSX: `function F(v) @{ …; <p /> }` means
// `function F(v) { …; return <p />; }`. A module-level template function is
// also a component, so rendering it (`<F />`, `{F}`) runs its compiled body.
// When module code calls it directly instead, the call must return the JSX value
// its returned-JSX twin returns: on a client mount and update, on the server,
// and through hydration of that server markup.

type Props = { v: string };

interface Case {
	/** The module, written with the `@{ … }` function. */
	block: string;
	/** The same module, written with the function's returned-JSX form. */
	returned: string;
	/** The markup, without range markers, that `H` renders for each state. */
	html: (v: string, first: string) => string;
}

const section = (inner: string) => `<section>${inner}<b>x</b></section>`;

const CASES: Record<string, Case> = {
	'an arrow reading its param': {
		block: `const helper = (v: string) => @{ <p>{v}</p> };
export function H(props: { v: string }) @{ <section>{helper(props.v)}<b>x</b></section> }`,
		returned: `const helper = (v: string) => <p>{v}</p>;
export function H(props: { v: string }) @{ <section>{helper(props.v)}<b>x</b></section> }`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a declaration rendering a fragment': {
		block: `function Helper(v: string) @{ <><p>{v}</p><i>{v}</i></> }
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		returned: `function Helper(v: string) {
	return <><p>{v}</p><i>{v}</i></>;
}
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		html: (v) => section(`<p>${v}</p><i>${v}</i>`),
	},
	'a declaration with setup': {
		block: `function Helper(v: string) @{
	const lower = v.toLowerCase();
	<p class={lower}>{lower}</p>
}
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		returned: `function Helper(v: string) {
	const lower = v.toLowerCase();
	return <p class={lower}>{lower}</p>;
}
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		html: (v) => section(`<p class="${v.toLowerCase()}">${v.toLowerCase()}</p>`),
	},
	// The body call lowers this guard to template control flow. The direct call
	// still returns null.
	'a declaration with an early return': {
		block: `function Helper(v: string) @{
	if (v === 'B') return null;
	<p>{v}</p>
}
export function H(props: { v: string }) @{
	const node = Helper(props.v);
	<section>{node === null ? 'none' : node}<b>x</b></section>
}`,
		returned: `function Helper(v: string) {
	if (v === 'B') return null;
	return <p>{v}</p>;
}
export function H(props: { v: string }) @{
	const node = Helper(props.v);
	<section>{node === null ? 'none' : node}<b>x</b></section>
}`,
		html: (v) => section(v === 'B' ? 'none' : `<p>${v}</p>`),
	},
	'a declaration returning JSX from setup': {
		block: `function Helper(v: string) @{
	if (v === 'B') return <i>{v}</i>;
	<p>{v}</p>
}
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		returned: `function Helper(v: string) {
	if (v === 'B') return <i>{v}</i>;
	return <p>{v}</p>;
}
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		html: (v) => section(v === 'B' ? `<i>${v}</i>` : `<p>${v}</p>`),
	},
	'a declaration rendering a directive': {
		block: `function Helper(v: string) @{
	@if (v === 'A') {
		<p>{v}</p>
	} @else {
		<i>{v}</i>
	}
}
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		returned: `function Helper(v: string) {
	return <>
		@if (v === 'A') {
			<p>{v}</p>
		} @else {
			<i>{v}</i>
		}
	</>;
}
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		html: (v) => section(v === 'A' ? `<p>${v}</p>` : `<i>${v}</i>`),
	},
	// A direct call runs the function's setup in the caller, like any function
	// that returns JSX, so the hook belongs to `H` and keeps its first value.
	'a declaration calling a hook': {
		block: `import { useState } from 'octane';
function Helper(v: string) @{
	const [first] = useState(v);
	<p>{first + '/' + v}</p>
}
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		returned: `import { useState } from 'octane';
function Helper(v: string) {
	const [first] = useState(v);
	return <p>{first + '/' + v}</p>;
}
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		html: (v, first) => section(`<p>${first}/${v}</p>`),
	},
	// The returned value resolves where it renders, like the returned-JSX form,
	// and the provider still renders the function itself as a child body.
	'a declaration reading context': {
		block: `import { createContext, use } from 'octane';
const Theme = createContext('outer');
function Label() @{ <span>{use(Theme) as string}</span> }
export function H(props: { v: string }) @{
	const label = Label();
	<section><Theme value={props.v}>{label}{Label}</Theme><b>x</b></section>
}`,
		returned: `import { createContext, use } from 'octane';
const Theme = createContext('outer');
function Label() {
	return <span>{use(Theme) as string}</span>;
}
export function H(props: { v: string }) @{
	const label = Label();
	<section><Theme value={props.v}>{label}{Label}</Theme><b>x</b></section>
}`,
		html: (v) => section(`<span>${v}</span><span>${v}</span>`),
	},
	'an exported declaration': {
		block: `export function Helper(v: string) @{ <p>{v}</p> }
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		returned: `export function Helper(v: string) {
	return <p>{v}</p>;
}
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a default-exported declaration': {
		block: `export default function Helper(v: string) @{ <p>{v}</p> }
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		returned: `export default function Helper(v: string) {
	return <p>{v}</p>;
}
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a declaration called before it is declared': {
		block: `export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }
function Helper(v: string) @{ <p>{v}</p> }`,
		returned: `export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }
function Helper(v: string) {
	return <p>{v}</p>;
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	// The module calls it while it evaluates, above the declaration.
	'a declaration called at module scope': {
		block: `const early = Helper('early');
export function H(props: { v: string }) @{ <section>{early}{Helper(props.v)}<b>x</b></section> }
function Helper(v: string) @{ <p>{v}</p> }`,
		returned: `const early = Helper('early');
export function H(props: { v: string }) @{ <section>{early}{Helper(props.v)}<b>x</b></section> }
function Helper(v: string) {
	return <p>{v}</p>;
}`,
		html: (v) => section(`<p>early</p><p>${v}</p>`),
	},
	'a destructured parameter': {
		block: `function Item({ label, suffix = '!' }: { label: string; suffix?: string }) @{
	<p>{label + suffix}</p>
}
export function H(props: { v: string }) @{ <section>{Item({ label: props.v })}<b>x</b></section> }`,
		returned: `function Item({ label, suffix = '!' }: { label: string; suffix?: string }) {
	return <p>{label + suffix}</p>;
}
export function H(props: { v: string }) @{ <section>{Item({ label: props.v })}<b>x</b></section> }`,
		html: (v) => section(`<p>${v}!</p>`),
	},
	'several parameters': {
		block: `function Pair(a: string, b: string) @{ <p>{a + b}</p> }
export function H(props: { v: string }) @{ <section>{Pair(props.v, '2')}<b>x</b></section> }`,
		returned: `function Pair(a: string, b: string) {
	return <p>{a + b}</p>;
}
export function H(props: { v: string }) @{ <section>{Pair(props.v, '2')}<b>x</b></section> }`,
		html: (v) => section(`<p>${v}2</p>`),
	},
	'a call through Function.prototype.call': {
		block: `function Helper(v: string) @{ <p>{v}</p> }
export function H(props: { v: string }) @{ <section>{Helper.call(null, props.v)}<b>x</b></section> }`,
		returned: `function Helper(v: string) {
	return <p>{v}</p>;
}
export function H(props: { v: string }) @{ <section>{Helper.call(null, props.v)}<b>x</b></section> }`,
		html: (v) => section(`<p>${v}</p>`),
	},
	// `map` calls the function with the row index where a render body takes its
	// Scope.
	'a declaration passed to map': {
		block: `function Row(v: string) @{ <p key={v}>{v}</p> }
export function H(props: { v: string }) @{ <section>{[props.v, props.v + '2'].map(Row)}<b>x</b></section> }`,
		returned: `function Row(v: string) {
	return <p key={v}>{v}</p>;
}
export function H(props: { v: string }) @{ <section>{[props.v, props.v + '2'].map(Row)}<b>x</b></section> }`,
		html: (v) => section(`<p>${v}</p><p>${v}2</p>`),
	},
	'optional calls': {
		block: `function Row(v: string) @{ <p key={v}>{v}</p> }
export function H(props: { v: string }) @{
	<section>{Row?.(props.v)}{Row?.call(null, props.v + '1')}{[props.v + '2']?.map(Row)}<b>x</b></section>
}`,
		returned: `function Row(v: string) {
	return <p key={v}>{v}</p>;
}
export function H(props: { v: string }) @{
	<section>{Row?.(props.v)}{Row?.call(null, props.v + '1')}{[props.v + '2']?.map(Row)}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p><p>${v}1</p><p>${v}2</p>`),
	},
	'a call inside a callback': {
		block: `import type { OctaneNode } from 'octane';
const run = (render: () => OctaneNode) => render();
function Helper(v: string) @{ <p>{v}</p> }
export function H(props: { v: string }) @{ <section>{run(() => Helper(props.v))}<b>x</b></section> }`,
		returned: `import type { OctaneNode } from 'octane';
const run = (render: () => OctaneNode) => render();
function Helper(v: string) {
	return <p>{v}</p>;
}
export function H(props: { v: string }) @{ <section>{run(() => Helper(props.v))}<b>x</b></section> }`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a call from a returned-JSX function': {
		block: `function Helper(v: string) @{ <p>{v}</p> }
function render(v: string) {
	return <div>{Helper(v)}</div>;
}
export function H(props: { v: string }) @{ <section>{render(props.v)}<b>x</b></section> }`,
		returned: `function Helper(v: string) {
	return <p>{v}</p>;
}
function render(v: string) {
	return <div>{Helper(v)}</div>;
}
export function H(props: { v: string }) @{ <section>{render(props.v)}<b>x</b></section> }`,
		html: (v) => section(`<div><p>${v}</p></div>`),
	},
	// The runtime still renders the function as a component and as a
	// render-function child, beside the direct call.
	'a declaration also rendered as a component': {
		block: `function Label(label: { v: string }) @{ <p>{label.v}</p> }
export function H(props: { v: string }) @{
	<section>{Label({ v: props.v })}<Label v={props.v} /><b>x</b></section>
}`,
		returned: `function Label(label: { v: string }) {
	return <p>{label.v}</p>;
}
export function H(props: { v: string }) @{
	<section>{Label({ v: props.v })}<Label v={props.v} /><b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p><p>${v}</p>`),
	},
	'a declaration also rendered through memo': {
		block: `import { memo } from 'octane';
function Label(label: { v: string }) @{ <p>{label.v}</p> }
const MemoLabel = memo(Label);
export function H(props: { v: string }) @{
	<section>{Label({ v: props.v })}<MemoLabel v={props.v} /><b>x</b></section>
}`,
		returned: `import { memo } from 'octane';
function Label(label: { v: string }) {
	return <p>{label.v}</p>;
}
const MemoLabel = memo(Label);
export function H(props: { v: string }) @{
	<section>{Label({ v: props.v })}<MemoLabel v={props.v} /><b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p><p>${v}</p>`),
	},
	'a renderable parameter': {
		block: `import type { OctaneNode } from 'octane';
function Frame(frame: { children: OctaneNode }) @{ <div>{frame.children}</div> }
export function H(props: { v: string }) @{
	<section>{Frame({ children: <i>{props.v}</i> })}<b>x</b></section>
}`,
		returned: `import type { OctaneNode } from 'octane';
function Frame(frame: { children: OctaneNode }) {
	return <div>{frame.children}</div>;
}
export function H(props: { v: string }) @{
	<section>{Frame({ children: <i>{props.v}</i> })}<b>x</b></section>
}`,
		html: (v) => section(`<div><i>${v}</i></div>`),
	},
	'a declaration also rendered as a child': {
		block: `function Static() @{ <><p>s</p><i>x</i></> }
export function H(props: { v: string }) @{ <section>{Static()}{Static}<b>{props.v}</b></section> }`,
		returned: `function Static() {
	return <><p>s</p><i>x</i></>;
}
export function H(props: { v: string }) @{ <section>{Static()}{Static}<b>{props.v}</b></section> }`,
		html: (v) => `<section><p>s</p><i>x</i><p>s</p><i>x</i><b>${v}</b></section>`,
	},
	'a recursive declaration': {
		block: `function Nest(depth: number) @{
	@if (depth > 0) {
		<i>{Nest(depth - 1)}</i>
	} @else {
		<b>end</b>
	}
}
export function H(props: { v: string }) @{ <section>{Nest(props.v === 'A' ? 1 : 2)}<b>x</b></section> }`,
		returned: `function Nest(depth: number) {
	return <>
		@if (depth > 0) {
			<i>{Nest(depth - 1)}</i>
		} @else {
			<b>end</b>
		}
	</>;
}
export function H(props: { v: string }) @{ <section>{Nest(props.v === 'A' ? 1 : 2)}<b>x</b></section> }`,
		html: (v) => section(v === 'A' ? '<i><b>end</b></i>' : '<i><i><b>end</b></i></i>'),
	},
	'a declaration with a scoped style': {
		block: `function Label(label: { v: string }) @{
	<>
		<style>
			.label { color: red; }
		</style>
		<p class="label">{label.v}</p>
	</>
}
export function H(props: { v: string }) @{ <section>{Label({ v: props.v })}<b>x</b></section> }`,
		// Returned JSX cannot hold a standalone style block, so compare the
		// direct call with rendering the function as a component.
		returned: `function Label(label: { v: string }) @{
	<>
		<style>
			.label { color: red; }
		</style>
		<p class="label">{label.v}</p>
	</>
}
export function H(props: { v: string }) @{ <section><Label v={props.v} /><b>x</b></section> }`,
		html: (v) => section(`<p class="label tsrx-scope">${v}</p>`),
	},
	// The returned-JSX form takes a name the module does not already bind.
	'a declaration beside a binding named like its returned-JSX form': {
		block: `const Helper$direct = '!';
function Helper(v: string) @{ <p>{v + Helper$direct}</p> }
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		returned: `const Helper$direct = '!';
function Helper(v: string) {
	return <p>{v + Helper$direct}</p>;
}
export function H(props: { v: string }) @{ <section>{Helper(props.v)}<b>x</b></section> }`,
		html: (v) => section(`<p>${v}!</p>`),
	},
	'a declaration with a directly called nested helper': {
		block: `function Outer(v: string) @{
	const inner = (w: string) => @{ <i>{w}</i> };
	<p>{inner(v)}</p>
}
export function H(props: { v: string }) @{ <section>{Outer(props.v)}<b>x</b></section> }`,
		returned: `function Outer(v: string) {
	const inner = (w: string) => <i>{w}</i>;
	return <p>{inner(v)}</p>;
}
export function H(props: { v: string }) @{ <section>{Outer(props.v)}<b>x</b></section> }`,
		html: (v) => section(`<p><i>${v}</i></p>`),
	},
};

const STATES: Props[] = [{ v: 'A' }, { v: 'B' }];

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

function newContainer(): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	containers.push(container);
	return container;
}

// Hydration and range markers are not part of the rendered content. A style
// scope's class hash depends on the module id.
const content = (html: string) =>
	html.replace(/<!--[^]*?-->/g, '').replace(/\btsrx-[0-9a-z]+/g, 'tsrx-scope');

interface Compiled {
	client: CompiledFixtureModule;
	server: CompiledFixtureModule;
}

interface Flavor {
	dev: boolean;
	native: boolean;
}

function load(source: string, id: string, { dev, native }: Flavor): Compiled {
	const compileOptions = { dev };
	const authored = native ? `import 'octane/signals';\n${source}` : source;
	return {
		client: loadCompiledFixtureSource(authored, { id, mode: 'client', compileOptions }),
		server: loadCompiledFixtureSource(authored, { id, mode: 'server', compileOptions }),
	};
}

function serverHtml(compiled: Compiled, props: Props): string {
	return ServerRT.renderToString(compiled.server.H, props).html;
}

function mount(compiled: Compiled) {
	const container = newContainer();
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const root = createRoot(container);
	const seen: string[] = [];
	for (const props of STATES) {
		flushSync(() => root.render(compiled.client.H, props));
		seen.push(content(container.innerHTML));
	}
	root.unmount();
	return { seen, errors: errors.mock.calls };
}

async function hydrate(compiled: Compiled) {
	const container = newContainer();
	container.innerHTML = serverHtml(compiled, STATES[0]);
	const serverElements = Array.from(container.querySelectorAll('*'));
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, compiled.client.H, STATES[0], {
		onRecoverableError: (error) => recoverable.push(error),
	});
	await act(() => {});
	const hydrated = content(container.innerHTML);
	const hydratedElements = Array.from(container.querySelectorAll('*'));
	flushSync(() => root.render(compiled.client.H, STATES[1]));
	const updated = content(container.innerHTML);
	root.unmount();
	return {
		hydrated,
		updated,
		serverElements,
		hydratedElements,
		recoverable,
		errors: errors.mock.calls,
	};
}

const FLAVORS: Flavor[] = [
	{ dev: false, native: false },
	{ dev: true, native: false },
	{ dev: false, native: true },
];

describe.each(FLAVORS)('a directly called module-level @{} function (%o)', (flavor) => {
	for (const [name, testCase] of Object.entries(CASES)) {
		const id = `direct-call-module-code-block-${Object.keys(CASES).indexOf(name)}`;
		let shared: { block: Compiled; returned: Compiled } | undefined;
		const modules = () =>
			(shared ??= {
				block: load(testCase.block, `${id}.tsrx`, flavor),
				returned: load(testCase.returned, `${id}-returned.tsrx`, flavor),
			});
		const expected = STATES.map((props) => testCase.html(props.v, STATES[0].v));

		it(`renders ${name} on the server like its returned-JSX form`, () => {
			const { block, returned } = modules();
			for (const props of STATES) {
				const html = serverHtml(block, props);
				expect(content(html)).toBe(testCase.html(props.v, props.v));
				expect(content(html)).toBe(content(serverHtml(returned, props)));
			}
		});

		it(`mounts and updates ${name} like its returned-JSX form`, () => {
			const { block, returned } = modules();
			const mounted = mount(block);
			expect(mounted.errors).toEqual([]);
			expect(mounted.seen).toEqual(expected);
			expect(mounted.seen).toEqual(mount(returned).seen);
		});

		for (const production of flavor.dev ? [false] : [false, true]) {
			it(`hydrates ${name} from its server markup (production runtime: ${production})`, async () => {
				const { block } = modules();
				if (production) vi.stubEnv('NODE_ENV', 'production');
				const result = await hydrate(block);
				expect(result.recoverable).toEqual([]);
				expect(result.errors).toEqual([]);
				expect(result.hydrated).toBe(expected[0]);
				// Hydration adopts every server element instead of rebuilding it.
				expect(result.hydratedElements).toEqual(result.serverElements);
				expect(result.updated).toBe(expected[1]);
			});
		}
	}
});
