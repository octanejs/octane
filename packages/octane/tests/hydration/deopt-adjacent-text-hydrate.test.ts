import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { act, createElement, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadServerFixture } from '../_server-fixture';
import {
	CompiledOptions,
	Greeting,
	Label,
	Parts,
	SuspendedGreeting,
} from './_fixtures/deopt-adjacent-text.tsrx';

// A pure-host descriptor's children are reconciled as raw DOM by the client's
// de-opt reconciler, one Text node per primitive child. The HTML parser merges
// adjacent server texts into one node, so the server must keep them apart for
// hydration to adopt each one as it is.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/deopt-adjacent-text.tsrx',
);
const server = loadServerFixture(FIXTURE, {
	id: 'deopt-adjacent-text.tsrx',
	compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
});

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

// Elements and text boundaries, which innerHTML cannot distinguish. Comments
// are hydration protocol, not content.
function shape(node: Node): unknown {
	if (node.nodeType === 3) return JSON.stringify((node as Text).data);
	const children = Array.from(node.childNodes).filter((child) => child.nodeType !== 8);
	return { [(node as Element).localName]: children.map(shape) };
}

function textNodes(root: Node): Text[] {
	const out: Text[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) out.push(n as Text);
	return out;
}

// What a fresh client mount of the same props renders inside #el.
function clientShape(component: any, props: Record<string, unknown>): unknown {
	const container = newContainer();
	const root = createRoot(container);
	flushSync(() => root.render(component, props));
	const out = shape(container.querySelector('#el')!);
	root.unmount();
	return out;
}

async function hydrateAndUpdate(
	name: 'Greeting' | 'Parts',
	component: any,
	props: Record<string, unknown>,
	next: Record<string, unknown>,
	text: string,
	nextText: string,
) {
	const container = newContainer();
	container.innerHTML = ServerRT.renderToString(server[name], props).html;
	const el = container.querySelector('#el')!;
	expect(el.textContent).toBe(text);
	const serverDom = el.innerHTML;
	const serverTexts = textNodes(el);

	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, component, props, {
		onRecoverableError: (error) => recoverable.push(error),
	});
	try {
		await act(() => {});
		expect(recoverable).toEqual([]);
		expect(errors.mock.calls).toEqual([]);
		expect(warnings.mock.calls).toEqual([]);
		// Hydration adopts the server DOM without changing it, and the server
		// text nodes have the text boundaries a client mount builds.
		expect(container.querySelector('#el')).toBe(el);
		expect(el.innerHTML).toBe(serverDom);
		expect(textNodes(el)).toEqual(serverTexts);
		textNodes(el).forEach((node, i) => expect(node).toBe(serverTexts[i]));
		expect(shape(el)).toEqual(clientShape(component, props));

		flushSync(() => root.render(component, next));
		expect(container.querySelector('#el')).toBe(el);
		expect(el.textContent).toBe(nextText);
		expect(shape(el)).toEqual(clientShape(component, next));
		expect(recoverable).toEqual([]);
		expect(errors.mock.calls).toEqual([]);
	} finally {
		root.unmount();
	}
}

const b = (text: string) => createElement('b', null, text);

describe('hydrateRoot: adjacent text children of a de-opt host', () => {
	it.each([
		{ label: 'a string', value: 'A', next: 'B', text: 'hello A', nextText: 'hello B' },
		{ label: 'a number', value: 7, next: 8, text: 'hello 7', nextText: 'hello 8' },
		{ label: 'zero', value: 0, next: 'x', text: 'hello 0', nextText: 'hello x' },
		{
			label: 'escaped text',
			value: '<b> & c',
			next: 'd',
			text: 'hello <b> & c',
			nextText: 'hello d',
		},
		{ label: 'an empty string', value: '', next: 'A', text: 'hello ', nextText: 'hello A' },
		{ label: 'null', value: null, next: 'A', text: 'hello ', nextText: 'hello A' },
	])('adopts text beside $label', async ({ value, next, text, nextText }) => {
		await hydrateAndUpdate('Greeting', Greeting, { value }, { value: next }, text, nextText);
	});

	it.each([
		{ label: 'a single text', parts: ['hello'], next: ['bye'], text: 'hello', nextText: 'bye' },
		{
			label: 'adjacent text and number',
			parts: ['count: ', 1],
			next: ['count: ', 2],
			text: 'count: 1',
			nextText: 'count: 2',
		},
		{
			label: 'three adjacent primitives',
			parts: ['a', 1, 'b'],
			next: ['c', 2, 'd'],
			text: 'a1b',
			nextText: 'c2d',
		},
		{
			label: 'text beside an element',
			parts: ['hello ', b('world'), '!'],
			next: ['bye ', b('moon'), '?'],
			text: 'hello world!',
			nextText: 'bye moon?',
		},
		{
			label: 'an empty string between two texts',
			parts: ['a', '', 'b'],
			next: ['c', '', 'd'],
			text: 'ab',
			nextText: 'cd',
		},
		{
			label: 'empty values between two texts',
			parts: ['a', null, false, 'b'],
			next: ['a', 'x', false, 'b'],
			text: 'ab',
			nextText: 'axb',
		},
		{
			label: 'texts across nested arrays',
			parts: ['a', ['b', ['c']], 'd'],
			next: ['e', ['f', ['g']], 'h'],
			text: 'abcd',
			nextText: 'efgh',
		},
		{
			label: 'adjacent texts inside a nested host',
			parts: [createElement('span', null, 'x', 1), 'y'],
			next: [createElement('span', null, 'x', 2), 'z'],
			text: 'x1y',
			nextText: 'x2z',
		},
		{
			label: 'adjacent texts inside keyed hosts',
			parts: [
				createElement('ul', null, [
					createElement('li', { key: 'a' }, 'Item ', 1),
					createElement('li', { key: 'b' }, 'Item ', 2),
				]),
			],
			next: [
				createElement('ul', null, [
					createElement('li', { key: 'b' }, 'Item ', 2),
					createElement('li', { key: 'a' }, 'Item ', 1),
				]),
			],
			text: 'Item 1Item 2',
			nextText: 'Item 2Item 1',
		},
	])('adopts $label', async ({ parts, next, text, nextText }) => {
		await hydrateAndUpdate('Parts', Parts, { parts }, { parts: next }, text, nextText);
	});
});

describe('hydrateRoot: adjacent text children beside a component in a de-opt host', () => {
	// A component child makes every child its own hydration range, so texts
	// never merge there and no separator may leak into a range. A host among
	// those children still separates its own adjacent texts.
	const parts = (label: unknown, text: string, tail: unknown) => [
		'a',
		1,
		createElement(label as any, { text }),
		createElement('b', null, 'x', tail),
		'!',
	];

	it('adopts the texts, the host and the component', async () => {
		const container = newContainer();
		container.innerHTML = ServerRT.renderToString(server.Parts, {
			parts: parts(server.Label, 'c', 'd'),
		}).html;
		const el = container.querySelector('#el')!;
		const serverDom = el.innerHTML;
		const label = el.querySelector('i')!;
		const host = el.querySelector('b')!;
		const hostTexts = textNodes(host);
		expect(el.textContent).toBe('a1cxd!');

		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const recoverable: unknown[] = [];
		const root = hydrateRoot(
			container,
			Parts,
			{ parts: parts(Label, 'c', 'd') },
			{ onRecoverableError: (error) => recoverable.push(error) },
		);
		try {
			await act(() => {});
			expect(recoverable).toEqual([]);
			expect(errors.mock.calls).toEqual([]);
			expect(container.querySelector('#el')).toBe(el);
			expect(el.innerHTML).toBe(serverDom);
			expect(el.querySelector('i')).toBe(label);
			expect(el.querySelector('b')).toBe(host);
			expect(shape(host)).toEqual({ b: ['"x"', '"d"'] });
			textNodes(host).forEach((node, i) => expect(node).toBe(hostTexts[i]));

			flushSync(() => root.render(Parts, { parts: parts(Label, 'e', 2) }));
			expect(container.querySelector('#el')).toBe(el);
			expect(el.querySelector('i')).toBe(label);
			expect(el.querySelector('b')).toBe(host);
			expect(el.textContent).toBe('a1ex2!');
			expect(recoverable).toEqual([]);
		} finally {
			root.unmount();
		}
	});
});

describe('hydrateRoot: an option labelled by adjacent text children', () => {
	// An option without a value is selected by its flattened text, as in React.
	const select = (selected: string) => [
		createElement(
			'select',
			{ defaultValue: selected },
			createElement('option', null, 'Item ', 1),
			createElement('option', null, 'Item ', 2),
		),
	];

	it.each([
		{ label: 'a de-opt select', name: 'Parts', client: Parts, props: { parts: select('Item 2') } },
		{
			label: 'a compiled select',
			name: 'CompiledOptions',
			client: CompiledOptions,
			props: { selected: 'Item 2', n: '2' },
		},
	])('selects the option on the server and adopts it: $label', async ({ name, client, props }) => {
		const container = newContainer();
		container.innerHTML = ServerRT.renderToString(server[name], props).html;
		const el = container.querySelector('select')!;
		const serverDom = el.innerHTML;
		const options = Array.from(el.options);
		expect(options.map((option) => option.defaultSelected)).toEqual([false, true]);
		expect(el.value).toBe('Item 2');

		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const recoverable: unknown[] = [];
		const root = hydrateRoot(container, client as any, props, {
			onRecoverableError: (error) => recoverable.push(error),
		});
		try {
			await act(() => {});
			expect(recoverable).toEqual([]);
			expect(errors.mock.calls).toEqual([]);
			expect(container.querySelector('select')).toBe(el);
			expect(el.innerHTML).toBe(serverDom);
			expect(Array.from(el.options)).toEqual(options);
			expect(options.map((option) => option.text)).toEqual(['Item 1', 'Item 2']);
			expect(el.value).toBe('Item 2');
		} finally {
			root.unmount();
		}
	});
});

describe('hydrateRoot: adjacent text children of a de-opt host in a suspended boundary', () => {
	it('adopts the texts once the boundary resumes', async () => {
		const container = newContainer();
		let resume!: () => void;
		const gate = { pending: false, promise: new Promise<void>((r) => (resume = r)) };
		container.innerHTML = ServerRT.renderToString(server.SuspendedGreeting, {
			value: 'A',
			gate,
		}).html;
		const el = container.querySelector('#el')!;
		const serverDom = el.innerHTML;
		const output = container.querySelector('output')!;
		const serverTexts = textNodes(el);
		expect(el.textContent).toBe('hello A');
		expect(output.textContent).toBe('ready');

		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const recoverable: unknown[] = [];
		gate.pending = true;
		const root = hydrateRoot(
			container,
			SuspendedGreeting,
			{ value: 'A', gate },
			{ onRecoverableError: (error) => recoverable.push(error) },
		);
		try {
			await act(() => {});
			// The suspended boundary keeps the server content in place.
			expect(container.querySelector('#el')).toBe(el);
			expect(container.querySelector('output')).toBe(output);
			expect(el.textContent).toBe('hello A');
			expect(container.querySelector('p')).toBeNull();

			gate.pending = false;
			await act(async () => resume());
			expect(recoverable).toEqual([]);
			expect(errors.mock.calls).toEqual([]);
			expect(container.querySelector('#el')).toBe(el);
			expect(el.innerHTML).toBe(serverDom);
			expect(container.querySelector('output')).toBe(output);
			textNodes(el).forEach((node, i) => expect(node).toBe(serverTexts[i]));
			expect(shape(el)).toEqual(clientShape(Greeting, { value: 'A' }));

			flushSync(() => root.render(SuspendedGreeting, { value: 'B', gate }));
			expect(container.querySelector('#el')).toBe(el);
			expect(el.textContent).toBe('hello B');
			expect(recoverable).toEqual([]);
		} finally {
			root.unmount();
		}
	});
});

// RCDATA and raw-text content is never tokenized, so a separator there would
// become literal text. The parser keeps such content as one node anyway.
describe('renderToString: adjacent text children of a raw-text de-opt host', () => {
	it.each(['textarea', 'title', 'xmp'])('keeps <%s> content literal', (tag) => {
		const container = newContainer();
		container.innerHTML = ServerRT.renderToString(server.Parts, {
			parts: [createElement(tag, null, 'a', 1)],
		}).html;
		const el = container.querySelector(tag)!;
		expect(el.textContent).toBe('a1');
		if (tag === 'textarea') expect((el as HTMLTextAreaElement).defaultValue).toBe('a1');
	});
});
