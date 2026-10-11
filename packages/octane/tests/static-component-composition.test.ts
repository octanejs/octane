import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { App } from './_fixtures/static-component-composition.tsrx';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

const compileOptions = {
	dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
	hmr: false,
};
const filename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/static-component-composition.tsrx',
);
const { App: ProductionApp } = loadCompiledFixtureSource<{ App: typeof App }>(
	readFileSync(filename, 'utf8'),
	{
		id: filename,
		mode: 'client',
		compileOptions: { dev: false, hmr: false },
	},
);

describe('static component composition', () => {
	it('preserves large fixed text and attributes under distinct component wrappers', () => {
		const value = 'long description '.repeat(640);
		const { App: LargeLabels } = loadCompiledFixtureSource(
			`function Label({ text }) @{ <span title={text}>{text as string}</span> }
function FirstCard() @{ <section class="first"><Label text={${JSON.stringify(value)}}/></section> }
function SecondCard() @{ <section class="second"><Label text={${JSON.stringify(value)}}/></section> }
export function App(props) @{ <main data-tick={props.tick}><FirstCard/><SecondCard/></main> }`,
			{ id: 'large-component-labels.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(LargeLabels, { tick: 0 });
		try {
			const spans = [view.find('.first span'), view.find('.second span')];
			const texts = spans.map((node) => node.firstChild);
			for (const span of spans) {
				expect(span.textContent).toBe(value);
				expect(span.getAttribute('title')).toBe(value);
			}
			view.update(LargeLabels, { tick: 1 });
			expect(view.find('main').getAttribute('data-tick')).toBe('1');
			for (const [index, selector] of ['.first span', '.second span'].entries()) {
				const span = view.find(selector);
				expect(span).toBe(spans[index]);
				expect(span.firstChild).toBe(texts[index]);
				expect(span.textContent).toBe(value);
				expect(span.getAttribute('title')).toBe(value);
			}
		} finally {
			view.unmount();
		}
		expect(view.container.childNodes).toHaveLength(0);
	});

	it.each([
		['carriage return', 'a\rb'],
		['null character', 'a\u0000b'],
	] as const)('preserves a %s in a child text and attribute value', (_name, value) => {
		const { App: StringValue } = loadCompiledFixtureSource(
			`function Label({ text }) @{ <span title={text}>{text as string}</span> }
function Card() @{ <div><Label text={${JSON.stringify(value)}}/></div> }
export function App() @{ <Card/> }`,
			{ id: 'component-string-values.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(StringValue);
		try {
			expect(view.find('span').textContent).toBe(value);
			expect(view.find('span').getAttribute('title')).toBe(value);
		} finally {
			view.unmount();
		}
	});

	it.each([
		['project plugin', App],
		['production compiler', ProductionApp],
	] as const)(
		'preserves keyed rows, nested nodes, drafts and events with the %s',
		(_mode, body) => {
			const rows = [{ id: 1 }, { id: 2 }];
			const picked: number[] = [];
			const onPick = (id: number) => picked.push(id);
			const view = mount(body, { rows, tick: 0, onPick });
			try {
				expect(view.findAll('[data-label]').map((node) => node.textContent)).toEqual([
					'fixed',
					'fixed',
				]);
				const elements = view.findAll('*');
				const texts = view.findAll('[data-label]').map((node) => node.firstChild);
				const firstInput = view.find('article[data-row="1"] input') as HTMLInputElement;
				const secondInput = view.find('article[data-row="2"] input') as HTMLInputElement;
				firstInput.value = 'first draft';
				secondInput.value = 'second draft';
				firstInput.focus();

				view.update(body, { rows, tick: 1, onPick });
				view.update(body, { rows, tick: 1, onPick });
				expect(view.find('main').getAttribute('data-tick')).toBe('1');
				const updated = view.findAll('*');
				expect(updated).toHaveLength(elements.length);
				updated.forEach((node, index) => expect(node).toBe(elements[index]));
				view.findAll('[data-label]').forEach((node, index) => {
					expect(node.firstChild).toBe(texts[index]);
				});
				expect(document.activeElement).toBe(firstInput);

				view.update(body, { rows: [rows[1], rows[0]], tick: 2, onPick });
				expect(view.findAll('article').map((node) => node.getAttribute('data-row'))).toEqual([
					'2',
					'1',
				]);
				expect(view.find('article[data-row="1"] input')).toBe(firstInput);
				expect(view.find('article[data-row="2"] input')).toBe(secondInput);
				expect(firstInput.value).toBe('first draft');
				expect(secondInput.value).toBe('second draft');
				view.click('article[data-row="1"] button');
				view.click('article[data-row="2"] button');
				expect(picked).toEqual([1, 2]);
			} finally {
				view.unmount();
			}
			expect(view.container.childNodes).toHaveLength(0);
		},
	);

	it.each([
		['empty child', '', '{text as string}', ['']],
		['adjacent text', 'middle', 'before{text as string}after', ['before', 'middle', 'after']],
		['adjacent empty child', '', 'before{text as string}after', ['before', '', 'after']],
	] as const)('preserves the text nodes of an %s', (_name, value, children, expected) => {
		const { App: TextValue } = loadCompiledFixtureSource(
			`function Label({ text }) @{ <span>${children}</span> }
function Card() @{ <div><Label text={${JSON.stringify(value)}}/></div> }
export function App(props) @{ <section data-tick={props.tick}><Card/></section> }`,
			{ id: 'component-text-segments.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(TextValue, { tick: 0 });
		try {
			const span = view.find('span');
			const texts = Array.from(span.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
			expect(texts.map((node) => node.nodeValue)).toEqual(expected);
			view.update(TextValue, { tick: 1 });
			expect(view.find('span')).toBe(span);
			const updated = Array.from(span.childNodes).filter(
				(node) => node.nodeType === Node.TEXT_NODE,
			);
			expect(updated.map((node) => node.nodeValue)).toEqual(expected);
			updated.forEach((node, index) => expect(node).toBe(texts[index]));
		} finally {
			view.unmount();
		}
	});

	it('keeps a native tag distinct from a lowercase function with the same name', () => {
		// The unused lowercase declaration is intentional: <div> is a native tag,
		// so adding a JavaScript reference would change the escape condition.
		const { App: HostNames } = loadCompiledFixtureSource(
			`function div() @{ <strong>wrong</strong> }
function Label() @{ <em>right</em> }
function Card() @{ <section><div/><Label/></section> }
export function App() @{ <Card/> }`,
			{ id: 'host-component-names.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(HostNames);
		try {
			expect(view.container.textContent).toBe('right');
			expect(Array.from(view.find('section').children, (node) => node.tagName)).toEqual([
				'DIV',
				'EM',
			]);
		} finally {
			view.unmount();
		}
	});

	it('evaluates an opaque child input after its parent host has been inserted', () => {
		const observed: boolean[] = [];
		const { App: Observed } = loadCompiledFixtureSource(
			`import { observe } from 'composition-observation';
function Label(props) @{ <span>{props.value as string}</span> }
function Card() @{ <div data-observed="true"><Label value={observe()}/></div> }
export function App() @{ <section><Card/></section> }`,
			{
				id: 'component-input-order.tsrx',
				mode: 'client',
				compileOptions,
				runtimeModules: {
					'composition-observation': {
						observe() {
							observed.push(document.querySelector('[data-observed]')?.isConnected === true);
							return 'observed';
						},
					},
				},
			},
		);
		const view = mount(Observed);
		try {
			expect(observed).toEqual([true]);
			expect(view.container.textContent).toBe('observed');
		} finally {
			view.unmount();
		}
	});

	it('retains the text returned by a child separately from its neighboring text', () => {
		const { App: TextComposition } = loadCompiledFixtureSource(
			`function Label() { return 'right'; }
function Card() @{ <div>left<Label/>tail</div> }
export function App(props) @{ <section data-tick={props.tick}><Card/></section> }`,
			{ id: 'text-component-boundary.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(TextComposition, { tick: 0 });
		try {
			const host = view.find('div');
			const text = Array.from(host.childNodes).find(
				(node) => node.nodeType === Node.TEXT_NODE && node.nodeValue === 'right',
			);
			expect(text).toBeDefined();
			expect(host.textContent).toBe('leftrighttail');
			view.update(TextComposition, { tick: 1 });
			expect(view.find('div')).toBe(host);
			expect(text!.parentNode).toBe(host);
			expect(text!.nodeValue).toBe('right');
			expect(host.textContent).toBe('leftrighttail');
		} finally {
			view.unmount();
		}
	});

	it('retains live defaults when a component is used as an element value', () => {
		const { App: Defaults, setDefault } = loadCompiledFixtureSource(
			`let label = 'first';
function Label(props) { return <span>{props.label as string}</span>; }
Object.defineProperty(Label, 'defaultProps', { get() { return {label}; } });
export function setDefault(value) { label = value; }
export function App(props) @{ <section data-tick={props.tick}>{<Label/>}</section> }`,
			{ id: 'component-value-defaults.tsrx', mode: 'client', compileOptions },
		);
		const view = mount(Defaults, { tick: 0 });
		try {
			expect(view.container.textContent).toBe('first');
			setDefault('second');
			view.update(Defaults, { tick: 1 });
			expect(view.container.textContent).toBe('second');
		} finally {
			view.unmount();
		}
	});
});
