import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, type CompiledFixtureModule } from '../_server-fixture.js';

// `@{ … }` is shorthand for returning JSX: `(v) => @{ …; <p /> }` means
// `(v) => { …; return <p />; }`. A template function declared inside another
// function must therefore return a JSX value when code calls it directly, and
// render exactly what its returned-JSX twin renders: on a client mount and
// update, on the server, and through hydration of that server markup.

type Props = { v: string };

interface Case {
	/** The module, written with the `@{ … }` helper. */
	block: string;
	/** The same module, written with the helper's returned-JSX form. */
	returned: string;
	/** The markup, without range markers, that `H` renders for each state. */
	html: (v: string, first: string) => string;
}

const section = (inner: string) => `<section>${inner}<b>x</b></section>`;

const CASES: Record<string, Case> = {
	'an arrow reading its param': {
		block: `export function H(props: { v: string }) @{
	const helper = (v: string) => @{ <p>{v}</p> };
	<section>{helper(props.v)}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const helper = (v: string) => <p>{v}</p>;
	<section>{helper(props.v)}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'an arrow reading the component props': {
		block: `export function H(props: { v: string }) @{
	const helper = () => @{ <p>{props.v}</p> };
	<section>{helper()}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const helper = () => <p>{props.v}</p>;
	<section>{helper()}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'an arrow rendering a fragment': {
		block: `export function H(props: { v: string }) @{
	const helper = () => @{ <><p>{props.v}</p><i>x</i></> };
	<section>{helper()}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const helper = () => <><p>{props.v}</p><i>x</i></>;
	<section>{helper()}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p><i>x</i>`),
	},
	'a named declaration rendering a fragment': {
		block: `export function H(props: { v: string }) @{
	function helper(v: string) @{ <><p>{v}</p><i>{v}</i></> }
	<section>{helper(props.v)}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	function helper(v: string) {
		return <><p>{v}</p><i>{v}</i></>;
	}
	<section>{helper(props.v)}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p><i>${v}</i>`),
	},
	'an arrow with setup': {
		block: `export function H(props: { v: string }) @{
	const helper = (v: string) => @{
		const lower = v.toLowerCase();
		<p>{lower}</p>
	};
	<section>{helper(props.v)}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const helper = (v: string) => {
		const lower = v.toLowerCase();
		return <p>{lower}</p>;
	};
	<section>{helper(props.v)}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v.toLowerCase()}</p>`),
	},
	'an arrow with an early return': {
		block: `export function H(props: { v: string }) @{
	const helper = (v: string) => @{
		if (v === 'B') return null;
		<p>{v}</p>
	};
	<section>{helper(props.v)}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const helper = (v: string) => {
		if (v === 'B') return null;
		return <p>{v}</p>;
	};
	<section>{helper(props.v)}<b>x</b></section>
}`,
		html: (v) => section(v === 'B' ? '' : `<p>${v}</p>`),
	},
	'an arrow rendering a directive': {
		block: `export function H(props: { v: string }) @{
	const helper = (v: string) => @{
		@if (v === 'A') {
			<p>{v}</p>
		} @else {
			<i>{v}</i>
		}
	};
	<section>{helper(props.v)}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const helper = (v: string) => <>
		@if (v === 'A') {
			<p>{v}</p>
		} @else {
			<i>{v}</i>
		}
	</>;
	<section>{helper(props.v)}<b>x</b></section>
}`,
		html: (v) => section(v === 'A' ? `<p>${v}</p>` : `<i>${v}</i>`),
	},
	// A direct call runs the helper's setup in the caller, like any function
	// that returns JSX, so the hook belongs to `H` and keeps its first value.
	'an arrow calling a hook': {
		block: `import { useState } from 'octane';
export function H(props: { v: string }) @{
	const helper = (v: string) => @{
		const [first] = useState(v);
		<p>{first + '/' + v}</p>
	};
	<section>{helper(props.v)}<b>x</b></section>
}`,
		returned: `import { useState } from 'octane';
export function H(props: { v: string }) @{
	const helper = (v: string) => {
		const [first] = useState(v);
		return <p>{first + '/' + v}</p>;
	};
	<section>{helper(props.v)}<b>x</b></section>
}`,
		html: (v, first) => section(`<p>${first}/${v}</p>`),
	},
	'a helper nested in a directly called helper': {
		block: `export function H(props: { v: string }) @{
	const outer = (v: string) => @{
		const inner = (w: string) => @{ <i>{w}</i> };
		<p>{inner(v)}</p>
	};
	<section>{outer(props.v)}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const outer = (v: string) => {
		const inner = (w: string) => <i>{w}</i>;
		return <p>{inner(v)}</p>;
	};
	<section>{outer(props.v)}<b>x</b></section>
}`,
		html: (v) => section(`<p><i>${v}</i></p>`),
	},
	'a call in setup': {
		block: `export function H(props: { v: string }) @{
	const helper = (v: string) => @{ <p>{v}</p> };
	const node = helper(props.v);
	<section>{node}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const helper = (v: string) => <p>{v}</p>;
	const node = helper(props.v);
	<section>{node}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a call inside a callback': {
		block: `import type { OctaneNode } from 'octane';
const run = (render: () => OctaneNode) => render();
export function H(props: { v: string }) @{
	const helper = (v: string) => @{ <p>{v}</p> };
	<section>{run(() => helper(props.v))}<b>x</b></section>
}`,
		returned: `import type { OctaneNode } from 'octane';
const run = (render: () => OctaneNode) => render();
export function H(props: { v: string }) @{
	const helper = (v: string) => <p>{v}</p>;
	<section>{run(() => helper(props.v))}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a call through Function.prototype.call': {
		block: `export function H(props: { v: string }) @{
	const helper = (v: string) => @{ <p>{v}</p> };
	<section>{helper.call(null, props.v)}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const helper = (v: string) => <p>{v}</p>;
	<section>{helper.call(null, props.v)}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	// `map` calls the helper with the row index where a render body takes its
	// Scope.
	'a helper passed to map': {
		block: `export function H(props: { v: string }) @{
	const helper = (v: string) => @{ <p key={v}>{v}</p> };
	<section>{[props.v, props.v + '2'].map(helper)}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const helper = (v: string) => <p key={v}>{v}</p>;
	<section>{[props.v, props.v + '2'].map(helper)}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p><p>${v}2</p>`),
	},
	'optional calls': {
		block: `export function H(props: { v: string }) @{
	const helper = (v: string) => @{ <p key={v}>{v}</p> };
	<section>{helper?.(props.v)}{helper?.call(null, props.v + '1')}{[props.v + '2']?.map(helper)}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const helper = (v: string) => <p key={v}>{v}</p>;
	<section>{helper?.(props.v)}{helper?.call(null, props.v + '1')}{[props.v + '2']?.map(helper)}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p><p>${v}1</p><p>${v}2</p>`),
	},
	// The runtime still renders the helper as a render-function child and as a
	// component, beside the direct call.
	'a helper also rendered as a child': {
		block: `export function H(props: { v: string }) @{
	const helper = () => @{ <><p>{props.v}</p><i>x</i></> };
	<section>{helper()}{helper}<b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	const helper = () => <><p>{props.v}</p><i>x</i></>;
	<section>{helper()}{helper}<b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p><i>x</i><p>${v}</p><i>x</i>`),
	},
	'a helper also rendered as a component': {
		block: `export function H(props: { v: string }) @{
	function Label(label: { v: string }) @{ <p>{label.v}</p> }
	<section>{Label({ v: props.v })}<Label v={props.v} /><b>x</b></section>
}`,
		returned: `export function H(props: { v: string }) @{
	function Label(label: { v: string }) {
		return <p>{label.v}</p>;
	}
	<section>{Label({ v: props.v })}<Label v={props.v} /><b>x</b></section>
}`,
		html: (v) => section(`<p>${v}</p><p>${v}</p>`),
	},
	'a helper declared in a directive arm': {
		block: `export function H(props: { v: string }) @{
	<section>
		@if (props.v !== '') {
			const helper = (v: string) => @{ <p>{v}</p> };
			<div>{helper(props.v)}</div>
		}
		<b>x</b>
	</section>
}`,
		returned: `export function H(props: { v: string }) @{
	<section>
		@if (props.v !== '') {
			const helper = (v: string) => <p>{v}</p>;
			<div>{helper(props.v)}</div>
		}
		<b>x</b>
	</section>
}`,
		html: (v) => section(`<div><p>${v}</p></div>`),
	},
	'a helper declared in a child block': {
		block: `export function H(props: { v: string }) @{
	<section>
		<div>
			@{
				const helper = (v: string) => @{ <p>{v}</p> };
				<>{helper(props.v)}</>
			}
		</div>
		<b>x</b>
	</section>
}`,
		returned: `export function H(props: { v: string }) @{
	<section>
		<div>
			@{
				const helper = (v: string) => <p>{v}</p>;
				<>{helper(props.v)}</>
			}
		</div>
		<b>x</b>
	</section>
}`,
		html: (v) => section(`<div><p>${v}</p></div>`),
	},
	'a helper declared in a returned-JSX component': {
		block: `export function H(props: { v: string }) {
	const helper = (v: string) => @{ <p>{v}</p> };
	return <section>{helper(props.v)}<b>x</b></section>;
}`,
		returned: `export function H(props: { v: string }) {
	const helper = (v: string) => <p>{v}</p>;
	return <section>{helper(props.v)}<b>x</b></section>;
}`,
		html: (v) => section(`<p>${v}</p>`),
	},
	'a helper declared in a module-level function': {
		block: `function render(v: string) {
	const helper = () => @{ <p>{v}</p> };
	return <div>{helper()}</div>;
}
export function H(props: { v: string }) @{
	<section>{render(props.v)}<b>x</b></section>
}`,
		returned: `function render(v: string) {
	const helper = () => <p>{v}</p>;
	return <div>{helper()}</div>;
}
export function H(props: { v: string }) @{
	<section>{render(props.v)}<b>x</b></section>
}`,
		html: (v) => section(`<div><p>${v}</p></div>`),
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

describe.each([false, true])('a directly called @{} helper (dev: %s)', (dev) => {
	for (const [name, testCase] of Object.entries(CASES)) {
		const id = `direct-call-code-block-helper-${Object.keys(CASES).indexOf(name)}`;
		let shared: { block: Compiled; returned: Compiled } | undefined;
		const modules = () =>
			(shared ??= {
				block: load(testCase.block, `${id}.tsrx`, dev),
				returned: load(testCase.returned, `${id}-returned.tsrx`, dev),
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
			const result = await hydrate(modules().block);
			expect(result.recoverable).toEqual([]);
			expect(result.errors).toEqual([]);
			expect(result.hydrated).toBe(expected[0]);
			// Hydration adopts every server element instead of rebuilding it.
			expect(result.hydratedElements).toEqual(result.serverElements);
			expect(result.updated).toBe(expected[1]);
		});
	}
});

// A helper that only the runtime calls, as a render-function child, keeps its
// compiled template. Rendering a multi-root fragment into an HTML parent, that
// template hydrates by adopting the fragment's server roots, in the production
// runtime too.
describe('a @{} helper rendered only as a child', () => {
	const SOURCE = `export function H(props: { v: string }) @{
	const helper = () => @{ <><p>{props.v}</p><i>x</i></> };
	<section>{helper}<b>x</b></section>
}`;
	const html = (v: string) => section(`<p>${v}</p><i>x</i>`);

	for (const dev of [false, true]) {
		for (const production of dev ? [false] : [false, true]) {
			it(`hydrates its fragment (dev: ${dev}, production runtime: ${production})`, async () => {
				const compiled = load(SOURCE, 'direct-call-code-block-helper-child.tsrx', dev);
				expect(content(serverHtml(compiled, STATES[0]))).toBe(html('A'));
				expect(mount(compiled).seen).toEqual([html('A'), html('B')]);
				if (production) vi.stubEnv('NODE_ENV', 'production');
				const result = await hydrate(compiled);
				expect(result.recoverable).toEqual([]);
				expect(result.errors).toEqual([]);
				expect(result.hydrated).toBe(html('A'));
				expect(result.hydratedElements).toEqual(result.serverElements);
				expect(result.updated).toBe(html('B'));
			});
		}
	}
});
