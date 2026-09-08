import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { hydrateRoot, flushSync } from '../src/index.js';
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
