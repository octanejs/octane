import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, type CompiledFixtureModule } from '../_server-fixture.js';

// `@{ … }` is shorthand for returning JSX, so `function Join(...parts) @{ <p /> }`
// means `function Join(...parts) { return <p />; }`, and its rest parameter
// holds what that returned-JSX form's rest parameter holds. The compiled body
// takes the runtime's `body(props, scope, extra)` call with the scope and extra
// parameters after the authored ones, and a rest parameter must be last. Each
// case must load, render the same content as its returned-JSX form on a client
// mount and update and on the server, and hydrate that server markup.

type Props = { v: string };

interface Case {
	/** The module, written with the `@{ … }` form. */
	block: string;
	/** The same module, written with the returned-JSX form. */
	returned: string;
	/** The markup, without range markers, that `H` renders for each state. */
	html: (v: string, first: string) => string;
}

const section = (inner: string) => `<section>${inner}<b>x</b></section>`;

const CASES: Record<string, Case> = {
	'a module-level declaration': {
		block: `export function Join(...parts: [{ v: string }]) @{ <p>{parts[0].v}</p> }
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		returned: `export function Join(...parts: [{ v: string }]) {
	return <p>{parts[0].v}</p>;
}
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	// A body call passes `(props, scope, extra)`, all of which the returned-JSX
	// form's rest parameter holds.
	'a rest parameter holding every argument': {
		block: `export function Join(...parts: unknown[]) @{
	<p>{(parts[0] as { v: string }).v + ' ' + parts.length}</p>
}
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		returned: `export function Join(...parts: unknown[]) {
	return <p>{(parts[0] as { v: string }).v + ' ' + parts.length}</p>;
}
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		html: (v) => section(`<p>${v} 3</p>`),
	},
	'a rest parameter after the props': {
		block: `export function Join(props: { v: string }, ...rest: unknown[]) @{
	<p>{props.v + ' ' + rest.length}</p>
}
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		returned: `export function Join(props: { v: string }, ...rest: unknown[]) {
	return <p>{props.v + ' ' + rest.length}</p>;
}
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		html: (v) => section(`<p>${v} 2</p>`),
	},
	'a destructured rest parameter': {
		block: `export function Join(...[label]: [{ v: string }]) @{ <p>{label.v}</p> }
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		returned: `export function Join(...[label]: [{ v: string }]) {
	return <p>{label.v}</p>;
}
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	// The rest parameter is an ordinary binding the body can reassign.
	'a reassigned rest parameter': {
		block: `export function Join(...parts: unknown[]) @{
	parts = [(parts[0] as { v: string }).v + '!'];
	<p>{parts[0] as string}</p>
}
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		returned: `export function Join(...parts: unknown[]) {
	parts = [(parts[0] as { v: string }).v + '!'];
	return <p>{parts[0] as string}</p>;
}
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		html: (v) => section(`<p>${v}!</p>`),
	},
	// Hooks read the scope from the argument after the props.
	'a component with state': {
		block: `import { useState } from 'octane';
export function Join(...parts: [{ v: string }]) @{
	const [first] = useState(parts[0].v);
	<p>{first + ' ' + parts[0].v}</p>
}
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		returned: `import { useState } from 'octane';
export function Join(...parts: [{ v: string }]) {
	const [first] = useState(parts[0].v);
	return <p>{first + ' ' + parts[0].v}</p>;
}
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		html: (v, first) => section(`<p>${first} ${v}</p>`),
	},
	// A TypeScript `this` parameter takes no argument ahead of the props.
	'a typed receiver before a rest parameter': {
		block: `export function Join(this: unknown, ...parts: [{ v: string }]) @{ <p>{parts[0].v}</p> }
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		returned: `export function Join(this: unknown, ...parts: [{ v: string }]) {
	return <p>{parts[0].v}</p>;
}
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a typed receiver alone': {
		block: `export function Join(this: unknown) @{ <p>{'y'}</p> }
export function H(props: { v: string }) @{
	<section><Join />{props.v}<b>x</b></section>
}`,
		returned: `export function Join(this: unknown) {
	return <p>{'y'}</p>;
}
export function H(props: { v: string }) @{
	<section><Join />{props.v}<b>x</b></section>
}`,
		html: (v) => section(`<p>y</p>${v}`),
	},
	'a module-level arrow': {
		block: `export const Join = (...parts: [{ v: string }]) => @{ <p>{parts[0].v}</p> };
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		returned: `export const Join = (...parts: [{ v: string }]) => <p>{parts[0].v}</p>;
export function H(props: { v: string }) @{
	<section><Join v={props.v} /><b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a component declared in a component': {
		block: `export function H(props: { v: string }) @{
	const Join = (...parts: [{ v: string }]) => @{ <p>{parts[0].v}</p> };
	<section><Join v={props.v} /><b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const Join = (...parts: [{ v: string }]) => <p>{parts[0].v}</p>;
	<section><Join v={props.v} /><b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a render function child': {
		block: `export function H(props: { v: string }) @{
	const helper = (...parts: unknown[]) => @{ <p>{props.v}</p> };
	<section>{helper}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const helper = (...parts: unknown[]) => <p>{props.v}</p>;
	<section>{helper}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a render prop': {
		block: `function Slot(props: { render: () => unknown }) @{ <div>{props.render}</div> }
export function H(props: { v: string }) @{
	<section><Slot render={(...parts: unknown[]) => @{ <p>{props.v}</p> }} /><b>x</b></section>
}`,
		returned: `function Slot(props: { render: () => unknown }) @{ <div>{props.render}</div> }
export function H(props: { v: string }) @{
	<section><Slot render={(...parts: unknown[]) => <p>{props.v}</p>} /><b>x</b></section>
}`,
		html: (v) => section(`<div><p>${v}</p></div>`),
	},
	// The server's returned-JSX body has a direct-call path, where the rest
	// parameter holds the call's own arguments.
	'a directly called function': {
		block: `export function H(props: { v: string }) @{
	const join = (...parts: string[]) => @{ <p>{parts.join(' ')}</p> };
	<section>{join(props.v, 'y')}<b>x</b></section>
}`,
		returned: `function join(...parts: string[]) {
	return <p>{parts.join(' ')}</p>;
}
export function H(props: { v: string }) @{
	<section>{join(props.v, 'y')}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v} y</p>`),
	},
	'a directly called function with a leading parameter': {
		block: `export function H(props: { v: string }) @{
	const join = (glue: string, ...parts: string[]) => @{ <p>{parts.join(glue)}</p> };
	<section>{join('-', props.v, 'y', 'z')}<b>x</b></section>
}`,
		returned: `function join(glue: string, ...parts: string[]) {
	return <p>{parts.join(glue)}</p>;
}
export function H(props: { v: string }) @{
	<section>{join('-', props.v, 'y', 'z')}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}-y-z</p>`),
	},
};

const STATES: Props[] = [{ v: 'A' }, { v: 'B' }];

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
const content = (html: string) => html.replace(/<!--[^]*?-->/g, '');

interface Compiled {
	client: CompiledFixtureModule;
	server: CompiledFixtureModule;
}

interface Mode {
	dev: boolean;
	/** Importing the signals module compiles native signal reads. */
	signals?: boolean;
}

function load(source: string, id: string, mode: Mode): Compiled {
	const compileOptions = { dev: mode.dev };
	if (mode.signals) source = `import 'octane/signals';\n${source}`;
	return {
		client: loadCompiledFixtureSource(source, { id, mode: 'client', compileOptions }),
		server: loadCompiledFixtureSource(source, { id, mode: 'server', compileOptions }),
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

// A native-read module wraps each compiled body in a read scope, which the
// rest binding precedes.
const MODES: [string, Mode][] = [
	['prod', { dev: false }],
	['dev', { dev: true }],
	['native-read', { dev: false, signals: true }],
];

describe.each(MODES)('a rest parameter on a @{} function (%s compile)', (_name, mode) => {
	for (const [name, testCase] of Object.entries(CASES)) {
		const id = `rest-param-code-block-${Object.keys(CASES).indexOf(name)}`;
		let shared: { block: Compiled; returned: Compiled } | undefined;
		const modules = () =>
			(shared ??= {
				block: load(testCase.block, `${id}.tsrx`, mode),
				returned: load(testCase.returned, `${id}-returned.tsrx`, mode),
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

		it(`hydrates ${name} from its server markup`, async () => {
			for (const compiled of Object.values(modules())) {
				const result = await hydrate(compiled);
				expect(result.recoverable).toEqual([]);
				expect(result.errors).toEqual([]);
				expect(result.hydrated).toBe(expected[0]);
				// Hydration adopts every server element instead of rebuilding it.
				expect(result.hydratedElements).toEqual(result.serverElements);
				expect(result.updated).toBe(expected[1]);
			}
		});
	}
});
