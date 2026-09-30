import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, type CompiledFixtureModule } from '../_server-fixture.js';

// `@{ … }` is shorthand for returning JSX, so
// `function Two(props, extra) @{ <p /> }` means
// `function Two(props, extra) { return <p />; }`. The runtime renders every
// component as `body(props, scope, extra)`, so the compiled body must take the
// scope as its second argument however many parameters it declares, and each
// authored parameter holds the argument at its authored position, as it does
// in the returned-JSX form. Each case must render the same content as its
// returned-JSX form on a client mount and update and on the server, and
// hydrate that server markup.

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

const H = `export function H(props: { v: string }) @{
	<section><Two v={props.v} /><b>x</b></section>
}`;

const CASES: Record<string, Case> = {
	'an optional second parameter': {
		block: `export function Two(props: { v: string }, extra?: string) @{ <p>{props.v}</p> }
${H}`,
		returned: `export function Two(props: { v: string }, extra?: string) {
	return <p>{props.v}</p>;
}
${H}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	// Each parameter holds the argument at its own position.
	'parameters holding their arguments': {
		block: `export function Two(props: { v: string }, second?: unknown, third?: unknown, fourth?: unknown) @{
	const bound = second === arguments[1] && third === arguments[2] && fourth === arguments[3];
	<p>{props.v + ' ' + bound}</p>
}
${H}`,
		returned: `export function Two(props: { v: string }, second?: unknown, third?: unknown, fourth?: unknown) {
	const bound = second === arguments[1] && third === arguments[2] && fourth === arguments[3];
	return <p>{props.v + ' ' + bound}</p>;
}
${H}`,
		html: (v) => section(`<p>${v} true</p>`),
	},
	'parameters with defaults and patterns': {
		block: `export function Two(
	props: { v: string },
	second: unknown = props.v,
	{ missing }: { missing?: string } = {},
	[fourth]: string[] = [props.v.toLowerCase()],
) @{
	<p>{props.v + (missing ?? '') + fourth}</p>
}
${H}`,
		returned: `export function Two(
	props: { v: string },
	second: unknown = props.v,
	{ missing }: { missing?: string } = {},
	[fourth]: string[] = [props.v.toLowerCase()],
) {
	return <p>{props.v + (missing ?? '') + fourth}</p>;
}
${H}`,
		html: (v) => section(`<p>${v}${v.toLowerCase()}</p>`),
	},
	// A parameter is an ordinary binding the body can reassign without
	// disturbing the scope the argument arrived in.
	'a reassigned second parameter': {
		block: `import { useState } from 'octane';
export function Two(props: { v: string }, extra?: unknown) @{
	extra = props.v + '!';
	const [first] = useState(props.v);
	<p>{first + ' ' + (extra as string)}</p>
}
${H}`,
		returned: `import { useState } from 'octane';
export function Two(props: { v: string }, extra?: unknown) {
	extra = props.v + '!';
	const [first] = useState(props.v);
	return <p>{first + ' ' + (extra as string)}</p>;
}
${H}`,
		html: (v, first) => section(`<p>${first} ${v}!</p>`),
	},
	// Hooks and nested template blocks read the scope and extra the runtime passes.
	'a component with state and a directive': {
		block: `import { useState } from 'octane';
function Leaf(props: { v: string }) @{ <i>{props.v}</i> }
export function Two(props: { v: string }, extra?: string) @{
	const [first] = useState(props.v);
	@if (props.v === first) {
		<p>{first}</p>
	} @else {
		<p>{first}<Leaf v={props.v} /></p>
	}
}
${H}`,
		returned: `import { useState } from 'octane';
function Leaf(props: { v: string }) @{ <i>{props.v}</i> }
export function Two(props: { v: string }, extra?: string) {
	const [first] = useState(props.v);
	return <>
		@if (props.v === first) {
			<p>{first}</p>
		} @else {
			<p>{first}<Leaf v={props.v} /></p>
		}
	</>;
}
${H}`,
		html: (v, first) => section(v === first ? `<p>${v}</p>` : `<p>${first}<i>${v}</i></p>`),
	},
	// Context resolves through the scope the body renders in.
	'a component reading context': {
		block: `import { createContext, use } from 'octane';
const Theme = createContext('light');
export function Two(props: { v: string }, extra?: string) @{ <p>{props.v + ' ' + use(Theme)}</p> }
export function H(props: { v: string }) @{
	<section><Theme value="dark"><Two v={props.v} /></Theme><b>x</b></section>
}`,
		returned: `import { createContext, use } from 'octane';
const Theme = createContext('light');
export function Two(props: { v: string }, extra?: string) {
	return <p>{props.v + ' ' + use(Theme)}</p>;
}
export function H(props: { v: string }) @{
	<section><Theme value="dark"><Two v={props.v} /></Theme><b>x</b></section>
}`,
		html: (v) => section(`<p>${v} dark</p>`),
	},
	'a component providing context': {
		block: `import { createContext, use } from 'octane';
const Theme = createContext('light');
function Leaf(props: { v: string }) @{ <i>{props.v + ' ' + use(Theme)}</i> }
export function Two(props: { v: string }, extra?: string) @{
	<p><Theme value="dark"><Leaf v={props.v} /></Theme></p>
}
${H}`,
		returned: `import { createContext, use } from 'octane';
const Theme = createContext('light');
function Leaf(props: { v: string }) @{ <i>{props.v + ' ' + use(Theme)}</i> }
export function Two(props: { v: string }, extra?: string) {
	return <p><Theme value="dark"><Leaf v={props.v} /></Theme></p>;
}
${H}`,
		html: (v) => section(`<p><i>${v} dark</i></p>`),
	},
	'a rest parameter after the second': {
		block: `export function Two(props: { v: string }, second?: unknown, ...rest: unknown[]) @{
	<p>{props.v + ' ' + (second === arguments[1] && rest.length === arguments.length - 2)}</p>
}
${H}`,
		returned: `export function Two(props: { v: string }, second?: unknown, ...rest: unknown[]) {
	return <p>{props.v + ' ' + (second === arguments[1] && rest.length === arguments.length - 2)}</p>;
}
${H}`,
		html: (v) => section(`<p>${v} true</p>`),
	},
	'a rest parameter holding every argument': {
		block: `export function Two(...parts: unknown[]) @{
	<p>{(parts[0] as { v: string }).v + ' ' + (parts.length === arguments.length)}</p>
}
${H}`,
		returned: `export function Two(...parts: unknown[]) {
	return <p>{(parts[0] as { v: string }).v + ' ' + (parts.length === arguments.length)}</p>;
}
${H}`,
		html: (v) => section(`<p>${v} true</p>`),
	},
	// A TypeScript `this` parameter takes no argument ahead of the props.
	'a typed receiver alone': {
		block: `export function Two(this: unknown) @{ <p>{'y'}</p> }
export function H(props: { v: string }) @{
	<section><Two />{props.v}<b>x</b></section>
}`,
		returned: `export function Two(this: unknown) {
	return <p>{'y'}</p>;
}
export function H(props: { v: string }) @{
	<section><Two />{props.v}<b>x</b></section>
}`,
		html: (v) => section(`<p>y</p>${v}`),
	},
	'a typed receiver before two parameters': {
		block: `export function Two(this: unknown, props: { v: string }, extra?: string) @{ <p>{props.v}</p> }
${H}`,
		returned: `export function Two(this: unknown, props: { v: string }, extra?: string) {
	return <p>{props.v}</p>;
}
${H}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a module-level arrow': {
		block: `export const Two = (props: { v: string }, extra?: string) => @{ <p>{props.v}</p> };
${H}`,
		returned: `export const Two = (props: { v: string }, extra?: string) => <p>{props.v}</p>;
${H}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a component declared in a component': {
		block: `export function H(props: { v: string }) @{
	const Two = (inner: { v: string }, extra?: string) => @{ <p>{inner.v}</p> };
	<section><Two v={props.v} /><b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const Two = (inner: { v: string }, extra?: string) => <p>{inner.v}</p>;
	<section><Two v={props.v} /><b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a component with children': {
		block: `export function Two(props: { children?: unknown }, extra?: string) @{
	<p>{props.children}</p>
}
export function H(props: { v: string }) @{
	<section><Two><i>{props.v}</i></Two><b>x</b></section>
}`,
		returned: `export function Two(props: { children?: unknown }, extra?: string) {
	return <p>{props.children}</p>;
}
export function H(props: { v: string }) @{
	<section><Two><i>{props.v}</i></Two><b>x</b></section>
}`,
		html: (v) => section(`<p><i>${v}</i></p>`),
	},
	'a render prop': {
		block: `function Slot(props: { render: () => unknown }) @{ <div>{props.render}</div> }
export function H(props: { v: string }) @{
	<section><Slot render={(first: unknown, extra?: unknown) => @{ <p>{props.v}</p> }} /><b>x</b></section>
}`,
		returned: `function Slot(props: { render: () => unknown }) @{ <div>{props.render}</div> }
export function H(props: { v: string }) @{
	<section><Slot render={(first: unknown, extra?: unknown) => <p>{props.v}</p>} /><b>x</b></section>
}`,
		html: (v) => section(`<div><p>${v}</p></div>`),
	},
	// A direct call passes its own arguments, which each parameter holds, while
	// rendering the same function as a component still works.
	'a component also called directly': {
		block: `export function Two(props: { v: string }, extra?: unknown) @{
	<p>{props.v + (typeof extra === 'string' ? extra : '')}</p>
}
export function H(props: { v: string }) @{
	<section>{Two({ v: props.v }, '!')}<Two v={props.v} /><b>x</b></section>
}`,
		returned: `export function Two(props: { v: string }, extra?: unknown) {
	return <p>{props.v + (typeof extra === 'string' ? extra : '')}</p>;
}
export function H(props: { v: string }) @{
	<section>{Two({ v: props.v }, '!')}<Two v={props.v} /><b>x</b></section>
}`,
		html: (v) => section(`<p>${v}!</p><p>${v}</p>`),
	},
	'a directly called component with a default and a rest parameter': {
		block: `export function Two(props: { v: string }, suffix: string = '?', ...rest: string[]) @{
	<p>{props.v + suffix + rest.join('')}</p>
}
export function H(props: { v: string }) @{
	<section>{Two({ v: props.v }, undefined, 'x', 'y')}<b>x</b></section>
}`,
		returned: `export function Two(props: { v: string }, suffix: string = '?', ...rest: string[]) {
	return <p>{props.v + suffix + rest.join('')}</p>;
}
export function H(props: { v: string }) @{
	<section>{Two({ v: props.v }, undefined, 'x', 'y')}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}?xy</p>`),
	},
	// The server's returned-JSX body has a direct-call path, where each
	// parameter holds the call's own argument.
	'a directly called function': {
		block: `export function H(props: { v: string }) @{
	const pair = (left: string, right: string) => @{ <p>{left + '-' + right}</p> };
	<section>{pair(props.v, 'y')}<b>x</b></section>
}`,
		returned: `function pair(left: string, right: string) {
	return <p>{left + '-' + right}</p>;
}
export function H(props: { v: string }) @{
	<section>{pair(props.v, 'y')}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}-y</p>`),
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

// A native-read module wraps each compiled body in a read scope.
const MODES: [string, Mode][] = [
	['prod', { dev: false }],
	['dev', { dev: true }],
	['native-read', { dev: false, signals: true }],
];

describe.each(MODES)('a @{} function with several parameters (%s compile)', (_name, mode) => {
	for (const [name, testCase] of Object.entries(CASES)) {
		const id = `multi-param-code-block-${Object.keys(CASES).indexOf(name)}`;
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
