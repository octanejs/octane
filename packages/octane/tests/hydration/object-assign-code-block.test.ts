import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, type CompiledFixtureModule } from '../_server-fixture.js';

// `Object.assign(Button, { Item })` attaches statics to a component and returns
// it. It never calls a function it receives, so a `@{ … }` component passed to
// it is still a component: it renders what the same component renders without
// the call, with its props, its control flow, and whatever it closes over. The
// other `Object` statics that return their first argument behave the same way.
// A template function passed to a call that may call it, like `xs.map(Row)`,
// still lowers to returned JSX, and a directive in it inside a module-level
// function is still reported.

type Props = { show: boolean; xs: string[] };

interface Case {
	/** The module, passing the component to an `Object` static. */
	block: string;
	/** The same module without the call. */
	plain: string;
	/** The markup, without range markers, that `H` renders for each state. */
	html: (props: Props) => string;
}

const factory = (result: string) => `type Props = { show: boolean; xs: string[] };
function make() {
	function Button(props: Props) @{
		<>
			<h1>Heading</h1>
			@if (props.show) {
				<button>Yes</button>
			}
		</>
	}
	return ${result};
}
const Button = make();
export function H(props: Props) @{
	<section><Button {...props} /><b>x</b></section>
}
`;

const factoryHtml = ({ show }: Props) =>
	`<section><h1>Heading</h1>${show ? '<button>Yes</button>' : ''}<b>x</b></section>`;

const STATICS: Record<string, string> = {
	'Object.assign': `Object.assign(Button, {})`,
	'Object.defineProperty': `Object.defineProperty(Button, 'displayName', { value: 'Button' })`,
	'Object.defineProperties': `Object.defineProperties(Button, { displayName: { value: 'Button' } })`,
	'Object.freeze': `Object.freeze(Button)`,
	'Object.seal': `Object.seal(Button)`,
	'Object.preventExtensions': `Object.preventExtensions(Button)`,
	'Object.setPrototypeOf': `Object.setPrototypeOf(Button, Function.prototype)`,
};

const CASES: Record<string, Case> = {
	...Object.fromEntries(
		Object.entries(STATICS).map(([name, call]) => [
			`a nested component passed to ${name}`,
			{ block: factory(call), plain: factory('Button'), html: factoryHtml },
		]),
	),
	'a nested component with lexical captures passed to Object.assign': {
		block: `type Props = { show: boolean; xs: string[] };
function make(label: string, tags: string[]) {
	const suffix = '!';
	function Tag(props: { text: string | undefined }) @{
		@if (props.text) {
			<em>{props.text as string}</em>
		}
	}
	function Button(props: Props) @{
		const count = props.xs.length;
		<>
			@if (props.show) {
				<button>{(label + suffix + count) as string}</button>
			} @else {
				<i>{label as string}</i>
			}
			<ul>
				@for (const x of props.xs; key x) {
					<li>{(x + suffix + tags.join(',')) as string}</li>
				}
			</ul>
		</>
	}
	return Object.assign(Button, { Tag });
}
const Button = make('Save', ['t', 'u']);
export function H(props: Props) @{
	<section><Button {...props} /><Button.Tag text={props.xs[0]} /><b>x</b></section>
}
`,
		plain: `type Props = { show: boolean; xs: string[] };
function make(label: string, tags: string[]) {
	const suffix = '!';
	function Tag(props: { text: string | undefined }) @{
		@if (props.text) {
			<em>{props.text as string}</em>
		}
	}
	function Button(props: Props) @{
		const count = props.xs.length;
		<>
			@if (props.show) {
				<button>{(label + suffix + count) as string}</button>
			} @else {
				<i>{label as string}</i>
			}
			<ul>
				@for (const x of props.xs; key x) {
					<li>{(x + suffix + tags.join(',')) as string}</li>
				}
			</ul>
		</>
	}
	Button.Tag = Tag;
	return Button;
}
const Button = make('Save', ['t', 'u']);
export function H(props: Props) @{
	<section><Button {...props} /><Button.Tag text={props.xs[0]} /><b>x</b></section>
}
`,
		html: ({ show, xs }) =>
			`<section>${show ? `<button>Save!${xs.length}</button>` : '<i>Save</i>'}<ul>${xs
				.map((x) => `<li>${x}!t,u</li>`)
				.join('')}</ul>${xs[0] ? `<em>${xs[0]}</em>` : ''}<b>x</b></section>`,
	},
	'an inline component passed to Object.assign at module scope': {
		block: `type Props = { show: boolean; xs: string[] };
const Menu = Object.assign(
	(props: Props) => @{
		<nav>
			@if (props.show) {
				<b>on</b>
			} @else {
				<i>off</i>
			}
		</nav>
	},
	{ label: 'Menu' },
);
export function H(props: Props) @{
	<section><Menu {...props} />{Menu.label as string}<b>x</b></section>
}
`,
		plain: `type Props = { show: boolean; xs: string[] };
const Menu = (props: Props) => @{
	<nav>
		@if (props.show) {
			<b>on</b>
		} @else {
			<i>off</i>
		}
	</nav>
};
Menu.label = 'Menu';
export function H(props: Props) @{
	<section><Menu {...props} />{Menu.label as string}<b>x</b></section>
}
`,
		html: ({ show }) =>
			`<section><nav>${show ? '<b>on</b>' : '<i>off</i>'}</nav>Menu<b>x</b></section>`,
	},
	'a component passed to Object.assign inside a component': {
		block: `type Props = { show: boolean; xs: string[] };
export function H(props: Props) @{
	function Button(inner: Props) @{
		<>
			@if (inner.show) {
				<button>{props.xs.join('+') as string}</button>
			}
		</>
	}
	const Assigned = Object.assign(Button, { label: 'B' });
	<section><Assigned {...props} />{Assigned.label as string}<b>x</b></section>
}
`,
		plain: `type Props = { show: boolean; xs: string[] };
export function H(props: Props) @{
	function Button(inner: Props) @{
		<>
			@if (inner.show) {
				<button>{props.xs.join('+') as string}</button>
			}
		</>
	}
	Button.label = 'B';
	const Assigned = Button;
	<section><Assigned {...props} />{Assigned.label as string}<b>x</b></section>
}
`,
		html: ({ show, xs }) =>
			`<section>${show ? `<button>${xs.join('+')}</button>` : ''}B<b>x</b></section>`,
	},
};

// Calls that may call the function they receive, in a module-level function.
const UNOWNED: Record<string, string> = {
	'a nested component passed to map': `function make(xs: { done: boolean }[]) {
	function Row(x: { done: boolean }) @{
		<li>
			@if (x.done) {
				<b>done</b>
			}
		</li>
	}
	return xs.map(Row);
}
export function H() @{ <ul>{make([{ done: true }])}</ul> }
`,
	'a nested component passed to a user function': `const run = (fn: (props: { done: boolean }) => unknown) => fn({ done: true });
function make() {
	function Row(x: { done: boolean }) @{
		<li>
			@if (x.done) {
				<b>done</b>
			}
		</li>
	}
	return run(Row);
}
export function H() @{ <ul>{make()}</ul> }
`,
	'a nested component passed to an Object static that calls it': `function make(xs: { done: boolean }[]) {
	function Row(x: { done: boolean }) @{
		<li>
			@if (x.done) {
				<b>done</b>
			}
		</li>
	}
	return Object.groupBy(xs, Row);
}
export function H() @{ <ul>{Object.keys(make([{ done: true }])).length as number}</ul> }
`,
	'an inline function passed to a user function at module scope': `const run = (fn: (props: { done: boolean }) => unknown) => fn({ done: true });
const row = run((x) => @{
	<li>
		@if (x.done) {
			<b>done</b>
		}
	</li>
});
export function H() @{ <ul>{row}</ul> }
`,
};

const STATES: Props[] = [
	{ show: true, xs: ['a', 'b'] },
	{ show: false, xs: ['c'] },
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
const content = (html: string) => html.replace(/<!--[^]*?-->/g, '');

interface Compiled {
	client: CompiledFixtureModule;
	server: CompiledFixtureModule;
}

function load(source: string, id: string, dev: boolean): Compiled {
	const compileOptions = { dev };
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

describe.each([false, true])('a @{} component passed to an Object static (dev: %s)', (dev) => {
	for (const [name, testCase] of Object.entries(CASES)) {
		const id = `object-assign-code-block-${Object.keys(CASES).indexOf(name)}`;
		let shared: { block: Compiled; plain: Compiled } | undefined;
		const modules = () =>
			(shared ??= {
				block: load(testCase.block, `${id}.tsrx`, dev),
				plain: load(testCase.plain, `${id}-plain.tsrx`, dev),
			});
		const expected = STATES.map(testCase.html);

		it(`renders ${name} on the server like the component without the call`, () => {
			const { block, plain } = modules();
			for (const [i, props] of STATES.entries()) {
				const html = serverHtml(block, props);
				expect(content(html)).toBe(expected[i]);
				expect(content(html)).toBe(content(serverHtml(plain, props)));
			}
		});

		it(`mounts and updates ${name} like the component without the call`, () => {
			const { block, plain } = modules();
			const mounted = mount(block);
			expect(mounted.errors).toEqual([]);
			expect(mounted.seen).toEqual(expected);
			expect(mounted.seen).toEqual(mount(plain).seen);
		});

		it(`hydrates ${name} from its server markup`, async () => {
			const result = await hydrate(modules().block);
			expect(result.recoverable).toEqual([]);
			expect(result.errors).toEqual([]);
			expect(result.hydrated).toBe(expected[0]);
			// Hydration adopts every server element instead of rebuilding it.
			expect(result.hydratedElements).toEqual(result.serverElements);
			expect(result.updated).toBe(expected[1]);
		});
	}

	for (const [name, source] of Object.entries(UNOWNED)) {
		it(`still reports a directive in ${name}`, () => {
			const index = Object.keys(UNOWNED).indexOf(name);
			for (const mode of ['client', 'server'] as const) {
				expect(() =>
					loadCompiledFixtureSource(source, {
						id: `object-assign-code-block-unowned-${index}-${mode}.tsrx`,
						mode,
						compileOptions: { dev },
					}),
				).toThrow(/`@if` is not supported inside a module-level callback/);
			}
		});
	}
});
