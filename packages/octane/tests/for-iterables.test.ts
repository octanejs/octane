import { describe, expect, it } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import * as Server from 'octane/server';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import { Rows, SafeRows } from './_fixtures/for-iterables.tsrx';

const server = loadServerFixture('packages/octane/tests/_fixtures/for-iterables.tsrx');
const factories: [string, (items: string[]) => Iterable<string>][] = [
	['set', (items) => new Set(items)],
	['map values', (items) => new Map(items.map((item) => [item, item])).values()],
	[
		'generator',
		function* (items) {
			yield* items;
		},
	],
];

describe('iterable template loops', () => {
	it.each(factories)(
		'mounts, reorders and empties %s rows while preserving survivor state',
		(_, values) => {
			const view = mount(Rows, { items: values(['a', 'b']) });
			try {
				expect(view.findAll('li').map((node) => node.getAttribute('data-item'))).toEqual([
					'a',
					'b',
				]);
				const input = view.find('[data-item="b"] input') as HTMLInputElement;
				input.value = 'edited';
				view.update(Rows, { items: values(['b', 'c', 'a']) });
				expect(view.findAll('li').map((node) => node.getAttribute('data-item'))).toEqual([
					'b',
					'c',
					'a',
				]);
				expect(view.find('[data-item="b"] input')).toBe(input);
				expect(input.value).toBe('edited');
				view.update(Rows, { items: values([]) });
				expect(view.find('ul')?.textContent).toBe('Empty');
				view.update(Rows, { items: values(['d']) });
				expect(view.findAll('li').map((node) => node.getAttribute('data-item'))).toEqual(['d']);
			} finally {
				view.unmount();
			}
		},
	);

	it.each(factories)('hydrates %s rows without replacing server inputs', (_, values) => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = Server.renderToString(server.Rows, { items: values(['a', 'b']) }).html;
		const inputs = [...container.querySelectorAll('input')];
		expect(inputs).toHaveLength(2);
		inputs[1].value = 'edited before hydration';
		const errors: unknown[] = [];
		const root = hydrateRoot(
			container,
			Rows,
			{ items: values(['a', 'b']) },
			{ onRecoverableError: (error) => errors.push(error) },
		);
		try {
			flushSync(() => {});
			expect([...container.querySelectorAll('input')]).toEqual(inputs);
			expect(inputs[1].value).toBe('edited before hydration');
			expect(errors).toEqual([]);
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('consumes each iterator once and recovers after an iterator throws', () => {
		const visited: string[] = [];
		function* values(fail: boolean) {
			visited.push('a');
			yield 'a';
			if (fail) throw new Error('unavailable');
			visited.push('b');
			yield 'b';
		}
		const view = mount(SafeRows, { items: values(true) });
		try {
			expect(view.find('p')?.textContent).toBe('Unavailable');
			expect(view.findAll('input')).toHaveLength(0);
			view.update(SafeRows, { items: values(false) });
			flushSync(() => (view.find('button') as HTMLButtonElement).click());
			expect(view.findAll('input').map((node) => (node as HTMLInputElement).value)).toEqual([
				'a',
				'b',
			]);
			expect(visited).toEqual(['a', 'a', 'b']);
		} finally {
			view.unmount();
		}
	});
});
