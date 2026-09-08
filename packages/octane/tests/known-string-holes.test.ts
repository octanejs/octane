import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { createElement, hydrateRoot, flushSync } from '../src/index.js';
import { ConcatCount, Labelled } from './_fixtures/known-string.tsrx';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture';

// Text can be authored without a cast when its expression is already a string.
// Unknown values still retain renderable semantics (arrays flatten, booleans
// disappear). Exercise those outcomes rather than a particular emitted helper.
const compileOptions = {
	hmr: false,
	dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
};

describe('dynamic text authoring', () => {
	it.each([
		['left string concatenation', '', `{'Count: ' + n}`, 'Count: 0', 'Count: 1'],
		['right string concatenation', '', `{n + ' items'}`, '0 items', '1 items'],
		['template literal', '', '{`Count: ${n}`}', 'Count: 0', 'Count: 1'],
		['concatenated member', '', `{'Hi ' + props.name}`, 'Hi Ada', 'Hi Grace'],
		[
			'string conditional',
			'',
			`{n === 1 ? ' item left' : ' items left'}`,
			' items left',
			' item left',
		],
		['mixed conditional', '', `{n === 1 ? ' item left' : props.label}`, 'zero!', ' item left'],
		['explicit text cast', '', '{n as string}', '0', '1'],
		['numeric identifier', '', '{n}', '0', '1'],
		['numeric literal', '', '{42}', '42', '42'],
		['bigint literal', '', '{42n}', '42', '42'],
		['Number conversion', '', '{Number(n)}', '0', '1'],
		['BigInt conversion', '', '{BigInt(n)}', '0', '1'],
		['numeric arithmetic', '', '{n * 2}', '0', '2'],
		['numeric addition', '', '{Number(n) + 1}', '1', '2'],
		['numeric conditional', '', '{n === 0 ? Number(n) : 42n}', '0', '42'],
		['numeric logical', '', '{Number(n) || 7}', '7', '1'],
		['numeric sequence', '', '{(n, Number(n))}', '0', '1'],
		['typeof expression', '', '{typeof n}', 'number', 'number'],
		['string logical', '', "{(n === 0 ? '' : 'ready') || 'pending'}", 'pending', 'ready'],
		['renderable member', '', '{props.label}', 'zero!', 'one!'],
		[
			'tracked concatenation',
			`const greeting = 'Hi ' + props.name;`,
			'{greeting}',
			'Hi Ada',
			'Hi Grace',
		],
		['typed local', 'const label: string = props.x;', '{label}', 'first', 'second'],
		['chained string locals', `const a = 'x'; const b = a + props.y;`, '{b}', 'xA', 'xB'],
		['numeric local', 'const count = 5;', '{count}', '5', '5'],
		[
			'reassigned local',
			`let label: unknown = 'first'; if (n === 1) label = props.label;`,
			'{label}',
			'first',
			'one!',
		],
	])('renders and updates %s', (_name, setup, hole, first, second) => {
		const source = `import { useState } from 'octane';
			export function C(props) @{
				const [n, setN] = useState(0);
				${setup}
				<div><button onClick={() => setN(n + 1)}>Next</button><p>${hole}</p></div>
			}`;
		const { C } = loadCompiledFixtureSource(source, {
			id: 'known-string.tsrx',
			mode: 'client',
			compileOptions,
		});
		const root = mount(C, { name: 'Ada', label: ['zero', '!'], x: 'first', y: 'A' });
		try {
			expect(root.find('p').textContent).toBe(first);
			root.click('button');
			root.update(C, { name: 'Grace', label: ['one', '!'], x: 'second', y: 'B' });
			expect(root.find('p').textContent).toBe(second);
		} finally {
			root.unmount();
		}
	});

	it('keeps renderable semantics when a loop shadows a string local', () => {
		const { C } = loadCompiledFixtureSource(
			`
			export function C(props) @{
				const item = 'outer';
				<ul>@for (const item of props.items; key item) { <li>{item}</li> }</ul>
			}`,
			{ id: 'shadow.tsrx', mode: 'client', compileOptions },
		);
		const root = mount(C, { items: [true, false, 'word'] });
		try {
			expect(root.findAll('li').map((node) => node.textContent)).toEqual(['', '', 'word']);
			root.update(C, { items: ['word', false, true] });
			expect(root.findAll('li').map((node) => node.textContent)).toEqual(['word', '', '']);
		} finally {
			root.unmount();
		}
	});

	it('renders and updates a string-typed parameter without a cast', () => {
		const { C } = loadCompiledFixtureSource('export function C(name: string) @{ <p>{name}</p> }', {
			id: 'param.tsrx',
			mode: 'client',
			compileOptions,
		});
		const root = mount(C, 'first');
		try {
			expect(root.find('p').textContent).toBe('first');
			root.update(C, 'second');
			expect(root.find('p').textContent).toBe('second');
		} finally {
			root.unmount();
		}
	});

	it.each([false, true])(
		'renders scalar expressions without a cast and hydrates them (dev: %s)',
		async (dev) => {
			const source = `export function Scalar(props) @{
				<main>
					<p id="numeric">{Number(props.value)}</p>
					<p id="bigint">{BigInt(props.whole)}</p>
					<p id="arithmetic">{props.left - props.right}</p>
					<p id="type">{typeof props.child}</p>
					<p id="sequence">{(props.observe(), Number(props.value))}</p>
					<div id="asserted">before{props.label as string}after</div>
					<div id="adjacent">before{Number(props.value)}and{BigInt(props.whole)}after</div>
				</main>
			}`;
			const options = { hmr: false, dev };
			const client = loadCompiledFixtureSource(source, {
				id: 'numeric-text.tsrx',
				mode: 'client',
				compileOptions: options,
			});
			const server = loadCompiledFixtureSource(source, {
				id: 'numeric-text.tsrx',
				mode: 'server',
				compileOptions: options,
			});
			const observed: string[] = [];
			const first = {
				value: '001.5',
				whole: '9',
				left: 7,
				right: 2,
				child: { nested: true },
				label: 'first',
				observe: () => observed.push('first'),
			};
			const second = {
				value: '2',
				whole: '18',
				left: 12,
				right: 7,
				child: () => 'not called',
				label: 'second',
				observe: () => observed.push('second'),
			};
			const { html } = await ServerRT.renderToString(server.Scalar, first);
			const container = document.createElement('div');
			container.innerHTML = html;
			document.body.appendChild(container);
			const numeric = container.querySelector('#numeric')!;
			const numericText = numeric.firstChild;
			const asserted = container.querySelector('#asserted')!;
			const assertedText = [...asserted.childNodes].find(
				(node) => node.nodeType === Node.TEXT_NODE && node.nodeValue === 'first',
			);
			expect(assertedText).toBeDefined();
			const adjacent = container.querySelector('#adjacent')!;
			const adjacentText = [...adjacent.childNodes].find(
				(node) => node.nodeType === Node.TEXT_NODE && node.nodeValue === '1.5',
			);
			expect(adjacentText).toBeDefined();
			let root: ReturnType<typeof hydrateRoot> | undefined;
			try {
				root = hydrateRoot(container, client.Scalar, first);
				flushSync(() => {});
				expect(numeric.firstChild).toBe(numericText);
				expect(assertedText!.parentNode).toBe(asserted);
				expect(asserted.textContent).toBe('beforefirstafter');
				expect(adjacentText!.parentNode).toBe(adjacent);
				expect(numeric.textContent).toBe('1.5');
				expect(container.querySelector('#bigint')!.textContent).toBe('9');
				expect(container.querySelector('#arithmetic')!.textContent).toBe('5');
				expect(container.querySelector('#type')!.textContent).toBe('object');
				expect(adjacent.textContent).toBe('before1.5and9after');
				flushSync(() => root.render(client.Scalar, second));
				expect(numeric.firstChild).toBe(numericText);
				expect(assertedText!.nodeValue).toBe('second');
				expect(asserted.textContent).toBe('beforesecondafter');
				expect(adjacentText!.nodeValue).toBe('2');
				expect(container.querySelector('#sequence')!.textContent).toBe('2');
				expect(container.querySelector('#bigint')!.textContent).toBe('18');
				expect(container.querySelector('#type')!.textContent).toBe('function');
				expect(adjacent.textContent).toBe('before2and18after');
				expect(observed).toEqual(['first', 'first', 'second']);
			} finally {
				root?.unmount();
				container.remove();
			}
		},
	);

	it('preserves element children from a shadowed or replaced Number function', () => {
		const local = loadCompiledFixtureSource(
			`export function Local(props) @{
				const Number = props.render;
				<main>{Number(props.value)}</main>
			}`,
			{ id: 'shadowed-number.tsrx', mode: 'client', compileOptions },
		);
		const render = (value: string) => createElement('strong', null, value);
		const localRoot = mount(local.Local, { render, value: 'one' });
		try {
			expect(localRoot.find('strong').textContent).toBe('one');
			localRoot.update(local.Local, { render, value: 'two' });
			expect(localRoot.find('strong').textContent).toBe('two');
		} finally {
			localRoot.unmount();
		}

		const replaced = loadCompiledFixtureSource(
			`export function replaceNumber(replacement) {
				const original = globalThis.Number;
				globalThis.Number = replacement;
				return () => { globalThis.Number = original; };
			}
			export function Replaced(props) @{ <main>{Number(props.value)}</main> }`,
			{ id: 'replaced-number.tsrx', mode: 'client', compileOptions },
		);
		const previous = globalThis.Number;
		const sentinel = {};
		const restore = replaced.replaceNumber((value: unknown) =>
			value === sentinel ? createElement('em', null, 'replacement') : previous(value),
		);
		let replacedRoot: ReturnType<typeof mount> | undefined;
		try {
			replacedRoot = mount(replaced.Replaced, { value: sentinel });
			expect(replacedRoot.find('em').textContent).toBe('replacement');
		} finally {
			restore();
			replacedRoot?.unmount();
		}
	});

	it('renders Date() text and preserves object children from a shadowed Date', () => {
		const source = `export function Converted() @{ <p>{String(new Date(0))}</p> }
		export function Clock() @{ <p>{Date()}</p> }
		export function ObjectChild() @{ <p>{new Date(0)}</p> }`;
		const client = loadCompiledFixtureSource(source, {
			id: 'date-child.tsrx',
			mode: 'client',
			compileOptions,
		});
		const server = loadCompiledFixtureSource(source, {
			id: 'date-child.tsrx',
			mode: 'server',
			compileOptions,
		});
		const converted = mount(client.Converted);
		try {
			expect(converted.find('p').textContent).toBe(String(new Date(0)));
			expect(ServerRT.renderToString(server.Converted).html).toContain(String(new Date(0)));
		} finally {
			converted.unmount();
		}
		const clock = mount(client.Clock);
		try {
			// Date() returns a display string, whereas new Date() is an object child.
			expect(Number.isFinite(Date.parse(clock.find('p').textContent!))).toBe(true);
			expect(ServerRT.renderToString(server.Clock).html).toContain('GMT');
		} finally {
			clock.unmount();
		}
		expect(() => mount(client.ObjectChild)).toThrow(
			/Objects are not valid|Minified Octane error #3/,
		);
		expect(() => ServerRT.renderToString(server.ObjectChild)).toThrow(
			/Objects are not valid|Minified Octane error #3/,
		);
		const shadowed = loadCompiledFixtureSource(
			`export function Shadowed(props) @{
				const Date = props.render;
				<p>{Date()}</p>
			}`,
			{ id: 'shadowed-date.tsrx', mode: 'client', compileOptions },
		);
		const root = mount(shadowed.Shadowed, {
			render: () => createElement('i', null, 'an element'),
		});
		try {
			expect(root.find('i').textContent).toBe('an element');
		} finally {
			root.unmount();
		}
	});
});

describe('known-string concat hole renders + updates at runtime (no cast)', () => {
	it('renders the concatenation as text and reacts to state', () => {
		const r = mount(ConcatCount as any);
		expect(r.html()).toBe('<button>Count: 0</button>');
		r.click('button');
		expect(r.html()).toBe('<button>Count: 1</button>');
		r.unmount();
	});
});

describe('tracked-identifier hole renders + updates at runtime (no cast)', () => {
	it('renders the tracked const as text and reacts to state', () => {
		const r = mount(Labelled as any);
		expect(r.html()).toBe('<button>n=0</button>');
		r.click('button');
		expect(r.html()).toBe('<button>n=1</button>');
		r.unmount();
	});
});

// Tracked string values adopt their server DOM and retain live state updates,
// independently of how either compiler represents the text binding.
const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/known-string.tsrx');
function serverModule(): Record<string, any> {
	return loadServerFixture(FIXTURE);
}

describe('tracked text hydration', () => {
	it('adopts the server text node for a tracked `{label}` hole and stays interactive', async () => {
		const server = serverModule();
		const { html } = await ServerRT.renderToString(server.Labelled, {});
		expect(html).toContain('<button>n=0</button>');

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const btn = container.querySelector('button') as HTMLButtonElement;
		const root = hydrateRoot(container, Labelled);
		flushSync(() => {});

		expect(container.querySelector('button')).toBe(btn); // adopted, not rebuilt
		flushSync(() => btn.click());
		expect(btn.textContent).toBe('n=1'); // tracked text binding is live
		root.unmount();
		container.remove();
	});
});
