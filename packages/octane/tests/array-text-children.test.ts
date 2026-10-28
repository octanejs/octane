import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import * as ServerRuntime from 'octane/server';
import { act, createElement, flushSync, hydrateRoot, startTransition } from '../src/index.js';
import { ELEMENT_DESCRIPTORS } from '../src/runtime/drivers.js';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import { SoleChild, Siblings, Suspending } from './_fixtures/array-text-children.tsrx';

// An array or iterable child of text renders as React's does: one Text node
// per leaf, nothing for an empty leaf, and a leaf keeps its Text node while its
// position survives. A bundle without an element factory renders these through
// the keyed list without its descriptor handling; one with a factory renders
// them through the whole list. The same contract holds for both, so every case
// runs in each.

const server = loadServerFixture(join(import.meta.dirname, '_fixtures/array-text-children.tsrx'), {
	id: 'array-text-children.tsrx',
	compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
});

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
	vi.restoreAllMocks();
});

function texts(node: Node): Text[] {
	return Array.from(node.childNodes).filter((child): child is Text => child.nodeType === 3);
}

function data(node: Node): string[] {
	return texts(node).map((text) => text.data);
}

function* letters(): Generator<string> {
	yield 'x';
	yield 'y';
}

function contract() {
	it.each([
		{ label: 'an array', value: ['a', 'b'], expected: ['a', 'b'] },
		{
			label: 'empty leaves',
			value: ['a', null, false, '', 3, true, undefined],
			expected: ['a', '3'],
		},
		{ label: 'nested arrays', value: [['x', ['y']], 'z'], expected: ['x', 'y', 'z'] },
		{ label: 'a Set', value: new Set(['p', 'q']), expected: ['p', 'q'] },
		{ label: 'an empty array', value: [], expected: [] },
	])('renders each text leaf of $label as its own Text node', ({ value, expected }) => {
		const sole = mount(SoleChild, { value });
		expect(data(sole.find('#host'))).toEqual(expected);
		sole.unmount();
		const siblings = mount(Siblings, { value });
		expect(data(siblings.find('#host'))).toEqual(['before', ...expected]);
		expect(siblings.find('#host').textContent).toBe(['before', ...expected, 'after'].join(''));
		siblings.unmount();
	});

	it('reads a one-shot iterable once per render', () => {
		const r = mount(SoleChild, { value: letters() });
		expect(data(r.find('#host'))).toEqual(['x', 'y']);
		r.update(SoleChild, { value: letters() });
		expect(data(r.find('#host'))).toEqual(['x', 'y']);
		r.unmount();
	});

	it.each([
		['a sole child', SoleChild],
		['a sibling', Siblings],
	] as const)('keeps the Text node of every surviving position as %s', (_, component) => {
		const r = mount(component, { value: ['a', 'b'] });
		const host = r.find('#host');
		const [, a, b] = component === Siblings ? texts(host) : [null, ...texts(host)];
		r.update(component, { value: ['a', 'b', 'c'] });
		expect(data(host).slice(-3)).toEqual(['a', 'b', 'c']);
		expect(texts(host).at(-3)).toBe(a);
		expect(texts(host).at(-2)).toBe(b);
		r.update(component, { value: ['x', null, 'z'] });
		expect(data(host).slice(-2)).toEqual(['x', 'z']);
		expect(texts(host).at(-2)).toBe(a);
		r.update(component, { value: ['x', 'y', 'z'] });
		expect(data(host).slice(-3)).toEqual(['x', 'y', 'z']);
		expect(texts(host).at(-3)).toBe(a);
		r.update(component, { value: [['x', 'y'], 'z'] });
		// Position 0 became a nested array: React remounts what it holds.
		expect(data(host).slice(-3)).toEqual(['x', 'y', 'z']);
		expect(texts(host).at(-3)).not.toBe(a);
		const nested = texts(host).at(-3);
		const last = texts(host).at(-1);
		r.update(component, { value: [['x'], 'z'] });
		expect(data(host).slice(-2)).toEqual(['x', 'z']);
		expect(texts(host).at(-2)).toBe(nested);
		expect(texts(host).at(-1)).toBe(last);
		r.unmount();
	});

	it.each([
		['a sole child', SoleChild],
		['a sibling', Siblings],
	] as const)('switches between text lists and other children as %s', (_, component) => {
		const r = mount(component, { value: ['a', 'b'] });
		const host = r.find('#host');
		const tail = component === Siblings ? 'after' : '';
		for (const [value, text] of [
			['plain', 'plain'],
			[['c', 'd'], 'cd'],
			[null, ''],
			[[], ''],
			[['e'], 'e'],
			[() => 'body', 'body'],
			[['f', 'g'], 'fg'],
		] as const) {
			r.update(component, { value });
			expect(host.textContent).toBe((component === Siblings ? 'before' : '') + text + tail);
		}
		r.unmount();
		expect(r.container.childNodes.length).toBe(0);
	});

	it('renders what a thenable leaf resolved to', async () => {
		const resolved = Promise.resolve('later');
		await resolved;
		const r = mount(Siblings, { value: ['now ', resolved] });
		await act(async () => {
			await resolved;
		});
		expect(r.find('#host').textContent).toBe('beforenow laterafter');
		r.unmount();
	});

	// OCTANE DIVERGENCE: a function item renders as a body, as a lone `{fn}`
	// does, on the server and client alike. React renders nothing for it.
	it('renders a function item as a body on the server and client', async () => {
		const value = ['a', () => 'body', 'b'];
		const r = mount(Siblings, { value });
		expect(r.find('#host').textContent).toBe('beforeabodybafter');
		r.update(Siblings, { value: ['a', 'b'] });
		expect(r.find('#host').textContent).toBe('beforeabafter');
		r.unmount();
		const container = document.createElement('div');
		document.body.appendChild(container);
		containers.push(container);
		container.innerHTML = ServerRuntime.renderToString(server.Siblings, { value }).html;
		const host = container.querySelector('#host')!;
		expect(host.textContent).toBe('beforeabodybafter');
		const serverHtml = host.innerHTML;
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const recoverable: unknown[] = [];
		const root = hydrateRoot(container, Siblings, { value } as any, {
			onRecoverableError: (error) => recoverable.push(error),
		});
		await act(() => {});
		expect(recoverable).toEqual([]);
		expect(errors.mock.calls).toEqual([]);
		expect(host.innerHTML).toBe(serverHtml);
		root.unmount();
	});

	it('rejects an object leaf as React does', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => mount(SoleChild, { value: ['a', { b: 1 }] })).toThrow(/object with keys \{b\}/);
	});

	it('keeps the committed text while a transition that updates it suspends', async () => {
		const r = mount(Suspending, { value: ['a', 'b'], promise: null });
		const host = r.find('#host');
		const [a, b] = texts(host);
		let release!: (value: string) => void;
		const promise = new Promise<string>((resolve) => {
			release = resolve;
		});
		await act(() => {
			startTransition(() => r.root.render(Suspending, { value: ['x', 'y', 'z'], promise }));
		});
		expect(r.find('#host')).toBe(host);
		expect(data(host)).toEqual(['a', 'b']);
		expect(texts(host)[0]).toBe(a);
		expect(texts(host)[1]).toBe(b);
		await act(async () => {
			release('!');
			await promise;
		});
		expect(data(host)).toEqual(['x', 'y', 'z', '!']);
		expect(texts(host)[0]).toBe(a);
		expect(texts(host)[1]).toBe(b);
		r.unmount();
	});

	it.each(['SoleChild', 'Siblings'] as const)(
		'hydrates the server text of each leaf in place (%s)',
		async (name) => {
			const component = name === 'SoleChild' ? SoleChild : Siblings;
			const value = ['a', null, 'b', ['c']];
			const container = document.createElement('div');
			document.body.appendChild(container);
			containers.push(container);
			container.innerHTML = ServerRuntime.renderToString(server[name], { value }).html;
			const host = container.querySelector('#host')!;
			const serverHtml = host.innerHTML;
			const serverTexts = texts(host);
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			const recoverable: unknown[] = [];
			const root = hydrateRoot(container, component, { value } as any, {
				onRecoverableError: (error) => recoverable.push(error),
			});
			try {
				await act(() => {});
				expect(recoverable).toEqual([]);
				expect(errors.mock.calls).toEqual([]);
				expect(container.querySelector('#host')).toBe(host);
				expect(host.innerHTML).toBe(serverHtml);
				expect(texts(host).length).toBe(serverTexts.length);
				texts(host).forEach((node, i) => expect(node).toBe(serverTexts[i]));
				flushSync(() => root.render(component, { value: ['x', 'y', 'b'] } as any));
				expect(host.textContent).toBe(name === 'Siblings' ? 'beforexybafter' : 'xyb');
				expect(texts(host)).toContain(serverTexts[name === 'Siblings' ? 1 : 0]);
				expect(recoverable).toEqual([]);
			} finally {
				root.unmount();
			}
		},
	);
}

describe('array text children in a bundle that builds no element values', () => {
	beforeAll(() => {
		// No element factory has run yet, so the list keeps no descriptor handling.
		expect(ELEMENT_DESCRIPTORS).toBe(false);
	});

	contract();
});

describe('array text children when an element factory first runs', () => {
	it('carries a mounted list over to the keyed list', () => {
		const r = mount(Siblings, { value: ['a', 'b'] });
		const host = r.find('#host');
		expect(data(host)).toEqual(['before', 'a', 'b']);
		// As when a lazily loaded module builds the first element value.
		createElement('i');
		expect(ELEMENT_DESCRIPTORS).toBe(true);
		r.update(Siblings, { value: ['a', 'b', 'c'] });
		expect(data(host)).toEqual(['before', 'a', 'b', 'c']);
		expect(host.textContent).toBe('beforeabcafter');
		r.update(Siblings, { value: 'plain' });
		expect(host.textContent).toBe('beforeplainafter');
		r.unmount();
		expect(r.container.childNodes.length).toBe(0);
	});
});

describe('array text children once an element factory has run', () => {
	beforeAll(() => {
		createElement('i');
		expect(ELEMENT_DESCRIPTORS).toBe(true);
	});

	contract();
});
