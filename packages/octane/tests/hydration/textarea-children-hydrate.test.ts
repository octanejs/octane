import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { act, createElement, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { createScope } from '../../src/signals/index.js';
import { loadServerFixture } from '../_server-fixture';
import * as Client from './_fixtures/textarea-children.tsrx';

// Textarea content is RCDATA: the HTML parser keeps markup and comments inside
// it as literal text. A textarea's children are therefore text on both sides:
// the client binds one Text node (no `<!>` template placeholder) and the server
// writes markerless escaped text (no `<!-- -->` separator or `<!--[-->` frame).

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/textarea-children.tsrx',
);
const server = loadServerFixture(FIXTURE, {
	id: 'textarea-children.tsrx',
	compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
});

type Name = keyof typeof Client;

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
	vi.restoreAllMocks();
});

function container() {
	const element = document.createElement('div');
	document.body.appendChild(element);
	containers.push(element);
	return element;
}

// The React-parity DEV authoring warning for textarea children is not a
// hydration report; it fires for a client-only mount too.
const isTextareaChildrenWarning = (call: unknown[]) =>
	String(call[0]).includes('instead of children on <textarea>');

function renderServer(name: Name, props: Record<string, unknown>, options?: object) {
	const host = container();
	host.innerHTML = ServerRT.renderToString(server[name], props, options).html;
	return host;
}

function textareaMarkup(host: HTMLElement) {
	return /<textarea[^>]*>([\s\S]*)<\/textarea>/.exec(host.innerHTML)![1];
}

function hydrate(host: HTMLElement, name: Name, props: Record<string, unknown>, options = {}) {
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(host, Client[name] as any, props, {
		...options,
		onRecoverableError: (error) => recoverable.push(error),
	});
	return {
		root,
		recoverable,
		reports: () => errors.mock.calls.filter((call) => !isTextareaChildrenWarning(call)),
	};
}

// The default value is the content a user sees and a form reset restores. A
// textarea holds only text: an element or comment inside it is invisible to the
// value, and the parser would turn either into literal text on a re-parse.
function expectOnlyText(textarea: HTMLTextAreaElement, expected: string) {
	expect(textarea.defaultValue).toBe(expected);
	expect(textarea.value).toBe(expected);
	for (const node of Array.from(textarea.childNodes)) expect(node.nodeType).toBe(Node.TEXT_NODE);
}

interface Case {
	name: Name;
	label: string;
	props: Record<string, unknown>;
	expected: string;
	next: Record<string, unknown>;
	nextExpected: string;
}

const CASES: Case[] = [
	{
		name: 'MixedText',
		label: 'a string',
		props: { value: 'A' },
		expected: 'hello A',
		next: { value: 'B' },
		nextExpected: 'hello B',
	},
	{
		name: 'MixedText',
		label: 'true (text-hole coercion)',
		props: { value: true },
		expected: 'hello true',
		next: { value: null },
		nextExpected: 'hello ',
	},
	{
		name: 'MixedText',
		label: 'escaped markup and a newline',
		props: { value: 'a & <b>\n<!-- c -->' },
		expected: 'hello a & <b>\n<!-- c -->',
		next: { value: '' },
		nextExpected: 'hello ',
	},
	{
		name: 'MixedChild',
		label: 'a number',
		props: { value: 7 },
		expected: 'hello 7',
		next: { value: 'B' },
		nextExpected: 'hello B',
	},
	{
		name: 'MixedChild',
		label: 'true (renderable coercion)',
		props: { value: true },
		expected: 'hello ',
		next: { value: false },
		nextExpected: 'hello ',
	},
	{
		name: 'MixedChild',
		label: 'an array of text',
		props: { value: ['a', ['b', 3]] },
		expected: 'hello ab3',
		next: { value: ['c'] },
		nextExpected: 'hello c',
	},
	{
		name: 'TwoChildren',
		label: 'two strings',
		props: { value: 'A', other: 'B' },
		expected: 'AB',
		next: { value: 'C', other: 'D' },
		nextExpected: 'CD',
	},
	{
		name: 'TwoChildren',
		label: 'a leading newline',
		props: { value: '\nA', other: null },
		expected: '\nA',
		next: { value: '\n\nB', other: 0 },
		nextExpected: '\n\nB0',
	},
	{
		name: 'TwoChildren',
		label: 'empty values',
		props: { value: null, other: undefined },
		expected: '',
		next: { value: 'A', other: 'B' },
		nextExpected: 'AB',
	},
	{
		name: 'SoleChild',
		label: 'an iterable of text',
		props: { value: new Set(['x', 'y']) },
		expected: 'xy',
		next: { value: 'z' },
		nextExpected: 'z',
	},
	{
		name: 'SoleChild',
		label: 'a leading newline',
		props: { value: '\nA' },
		expected: '\nA',
		next: { value: ['\n', 'B'] },
		nextExpected: '\nB',
	},
	{
		name: 'SpreadMixed',
		label: 'forwarded attributes',
		props: { value: 'v', rest: { name: 'body', rows: 3 } },
		expected: 'A: v!',
		next: { value: 'w', rest: { name: 'body', rows: 4 } },
		nextExpected: 'A: w!',
	},
	{
		name: 'SpreadMixed',
		label: 'an empty spread',
		props: { value: null, rest: {} },
		expected: 'A: !',
		next: { value: ['\n', 1], rest: {} },
		nextExpected: 'A: \n1!',
	},
	{
		name: 'Descriptor',
		label: 'createElement text children',
		props: { value: 'A' },
		expected: 'hello A',
		next: { value: ['b', 'c'] },
		nextExpected: 'hello bc',
	},
	{
		// An iterable child moves the descriptor onto the block-backed host path.
		name: 'Descriptor',
		label: 'an iterable child',
		props: { value: new Set(['a', 'b']) },
		expected: 'hello ab',
		next: { value: new Set(['\n', 'c']) },
		nextExpected: 'hello \nc',
	},
	{
		name: 'StoredJsx',
		label: 'stored JSX text children',
		props: { value: '\nA' },
		expected: 'hi \nA',
		next: { value: 2 },
		nextExpected: 'hi 2',
	},
];

describe('textarea children: server serialization and hydration', () => {
	it.each(CASES)('$name with $label', async ({ name, props, expected, next, nextExpected }) => {
		const host = renderServer(name, props);
		// Before any script runs, the parsed default value is exactly the text.
		const textarea = host.querySelector('textarea')!;
		expectOnlyText(textarea, expected);
		const text = textarea.firstChild;

		const { root, recoverable, reports } = hydrate(host, name, props);
		try {
			await act(() => {});
			expect(recoverable).toEqual([]);
			expect(reports()).toEqual([]);
			expect(host.querySelector('textarea')).toBe(textarea);
			if (text !== null) expect(textarea.firstChild).toBe(text);
			expectOnlyText(textarea, expected);

			flushSync(() => root.render(Client[name] as any, next));
			expect(host.querySelector('textarea')).toBe(textarea);
			expectOnlyText(textarea, nextExpected);
		} finally {
			root.unmount();
		}
	});

	it.each([
		{ label: 'a string', value: 'A', expected: 'A' },
		{ label: 'a leading newline', value: '\nA', expected: '\nA' },
		{ label: 'an array of text', value: ['a', 'b'], expected: 'ab' },
		{ label: 'null', value: null, expected: '' },
	])('adopts a children prop from a spread holding $label', async ({ value, expected }) => {
		const host = renderServer('ChildrenProp', { value });
		const textarea = host.querySelector('textarea')!;
		expectOnlyText(textarea, expected);

		const { root, recoverable, reports } = hydrate(host, 'ChildrenProp', { value });
		try {
			await act(() => {});
			expect(recoverable).toEqual([]);
			expect(reports()).toEqual([]);
			expect(host.querySelector('textarea')).toBe(textarea);
			expectOnlyText(textarea, expected);
		} finally {
			root.unmount();
		}
	});

	it('keeps signal handles among the parts live after hydration', async () => {
		const owner = createScope({ scopeKey: 'textarea-children-signal' });
		const value = owner.signal$<unknown>('value', 'one');
		const other = owner.signal$<unknown>('other', 'two');
		try {
			const props = { value, other };
			const host = renderServer('TwoChildren', props, { signalOwner: owner });
			expect(textareaMarkup(host)).toBe('onetwo');
			const textarea = host.querySelector('textarea')!;
			const text = textarea.firstChild;

			const { root, recoverable, reports } = hydrate(host, 'TwoChildren', props, {
				signalOwner: owner,
			});
			try {
				await act(() => {});
				expect(recoverable).toEqual([]);
				expect(reports()).toEqual([]);
				expect(textarea.firstChild).toBe(text);

				await act(() => owner.set(value, 'three'));
				expectOnlyText(textarea, 'threetwo');
				await act(() => owner.set(other, ['four', 5]));
				expectOnlyText(textarea, 'threefour5');
				expect(textarea.firstChild).toBe(text);

				// A primitive replacement releases the subscriptions.
				await act(() => root.render(Client.TwoChildren as any, { value: 'x', other }));
				expectOnlyText(textarea, 'xfour5');
				await act(() => owner.set(value, 'ignored'));
				expectOnlyText(textarea, 'xfour5');
				await act(() => owner.set(other, 'six'));
				expectOnlyText(textarea, 'xsix');
			} finally {
				root.unmount();
			}
			await act(() => owner.set(other, 'after unmount'));
		} finally {
			owner.dispose();
		}
	});
});

describe('textarea children: client-only mount and update', () => {
	it.each(CASES)('$name with $label', ({ name, props, expected, next, nextExpected }) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const host = container();
		const root = createRoot(host);
		try {
			flushSync(() => root.render(Client[name] as any, props));
			const textarea = host.querySelector('textarea')!;
			expectOnlyText(textarea, expected);
			flushSync(() => root.render(Client[name] as any, next));
			expect(host.querySelector('textarea')).toBe(textarea);
			expectOnlyText(textarea, nextExpected);
			flushSync(() => root.render(Client[name] as any, props));
			expectOnlyText(textarea, expected);
		} finally {
			root.unmount();
		}
	});

	// HTML tag names are case-insensitive, so the server serializes these as the
	// same text; the client must fold them the same way.
	it.each(['TEXTAREA', 'TextArea'])('folds the children of a %s descriptor', (tag) => {
		const serverHost = renderServer('DescriptorTag', { tag, value: new Set(['a', 'b']) });
		expectOnlyText(serverHost.querySelector('textarea')!, 'hello ab');

		vi.spyOn(console, 'error').mockImplementation(() => {});
		const host = container();
		const root = createRoot(host);
		try {
			flushSync(() =>
				root.render(Client.DescriptorTag as any, { tag, value: new Set(['a', 'b']) }),
			);
			expectOnlyText(host.querySelector('textarea')!, 'hello ab');
			flushSync(() => root.render(Client.DescriptorTag as any, { tag, value: ['c', 1] }));
			expectOnlyText(host.querySelector('textarea')!, 'hello c1');
			expect(() =>
				flushSync(() =>
					root.render(Client.DescriptorTag as any, { tag, value: createElement('p', null) }),
				),
			).toThrow(/children must be text.*One child was an element\./);
		} finally {
			root.unmount();
		}
	});

	it('updates a signal part without replacing the text node', async () => {
		const owner = createScope({ scopeKey: 'textarea-children-client-signal' });
		const value = owner.signal$<unknown>('value', 'one');
		const host = container();
		const root = createRoot(host);
		try {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			await act(() => root.render(Client.MixedText as any, { value }));
			const textarea = host.querySelector('textarea')!;
			const text = textarea.firstChild;
			expectOnlyText(textarea, 'hello one');
			await act(() => owner.set(value, true));
			expectOnlyText(textarea, 'hello true');
			await act(() => owner.set(value, null));
			expectOnlyText(textarea, 'hello ');
			expect(textarea.firstChild).toBe(text);
		} finally {
			root.unmount();
			owner.dispose();
		}
	});
});

describe('textarea children: values that are not text', () => {
	const element = createElement('p', null, 'x');
	it.each([
		{ name: 'MixedChild', props: { value: element }, kind: 'an element' },
		{ name: 'TwoChildren', props: { value: 'A', other: [element] }, kind: 'an element' },
		{ name: 'SoleChild', props: { value: element }, kind: 'an element' },
		{ name: 'SoleChild', props: { value: () => 'x' }, kind: 'a function' },
		{ name: 'SpreadMixed', props: { value: { a: 1 }, rest: {} }, kind: 'an object' },
		{ name: 'ChildrenProp', props: { value: element }, kind: 'an element' },
		{ name: 'Descriptor', props: { value: element }, kind: 'an element' },
		{ name: 'StoredJsx', props: { value: element }, kind: 'an element' },
	] as { name: Name; props: Record<string, unknown>; kind: string }[])(
		'$name rejects $kind on the server and the client',
		({ name, props, kind }) => {
			const message = new RegExp(`children must be text.*One child was ${kind}\\.`);
			expect(() => ServerRT.renderToString(server[name], props)).toThrow(message);

			vi.spyOn(console, 'error').mockImplementation(() => {});
			const root = createRoot(container());
			try {
				expect(() => flushSync(() => root.render(Client[name] as any, props))).toThrow(message);
			} finally {
				root.unmount();
			}
		},
	);
});
