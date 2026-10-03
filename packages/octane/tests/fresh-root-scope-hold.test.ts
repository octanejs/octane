import { describe, expect, it } from 'vitest';
import { act, mount } from './_helpers';
import { FreshRootScopeHold, KeyedIndexHold } from './_fixtures/fresh-root-scope-hold.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function fulfilled<T>(value: T): PromiseLike<T> {
	return { then() {}, status: 'fulfilled', value } as any;
}

describe('new scopes in a held root render', () => {
	it('removes newly mounted content while restoring committed and external writes', async () => {
		const pending = deferred<string>();
		const external = document.createElement('div');
		external.textContent = 'external:initial';
		external.setAttribute('data-state', 'initial');
		document.body.appendChild(external);
		const root = mount(FreshRootScopeHold, {
			show: false,
			label: 'initial',
			promise: fulfilled('first'),
			external,
		});
		try {
			const label = root.find('#committed-label');
			expect(label.getAttribute('class')).toBe('initial');
			const reader = root.find('#root-read');
			root.update(FreshRootScopeHold, {
				show: true,
				label: 'next',
				promise: pending.promise,
				external,
			});
			expect(root.findAll('#new-row')).toHaveLength(0);
			expect(root.find('#committed-label')).toBe(label);
			expect(label.textContent).toBe('initial');
			expect(label.getAttribute('title')).toBe('initial');
			expect(label.getAttribute('class')).toBe('initial');
			expect(root.find('#root-read')).toBe(reader);
			expect(reader.textContent).toBe('first');
			expect(external.textContent).toBe('external:initial');
			expect(external.getAttribute('data-state')).toBe('initial');

			await act(() => pending.resolve('second'));
			expect(label.getAttribute('class')).toBe('next');
			const row = root.find('#new-row');
			expect(row.textContent).toBe('row:next:0');
			expect(row.getAttribute('title')).toBe('row:next');
			expect(external.textContent).toBe('external:next');
			expect(external.getAttribute('data-state')).toBe('next');
			root.click('#new-row');
			expect(row.textContent).toBe('row:next:1');
			expect(root.find('#new-row')).toBe(row);
		} finally {
			root.unmount();
			external.remove();
		}
	});
});

describe('keyed rows in a held root render', () => {
	const initial = ['a', 'b', 'c', 'd'];
	const rows = (root: ReturnType<typeof mount>) =>
		root.findAll('ol li').map((row) => row.textContent);

	it.each([
		['rotate', ['b', 'c', 'd', 'a']],
		['reverse', ['d', 'c', 'b', 'a']],
		['remove first', ['b', 'c', 'd']],
		['insert first', ['x', 'a', 'b', 'c', 'd']],
	])('renders each row at its position after a held %s', async (_name, next) => {
		const pending = deferred<string>();
		const root = mount(KeyedIndexHold, { items: initial, promise: fulfilled('first') });
		try {
			const nodes = new Map(initial.map((item) => [item, root.find('#row-' + item)]));
			root.update(KeyedIndexHold, { items: next, promise: pending.promise });
			expect(rows(root)).toEqual(['a:0', 'b:1', 'c:2', 'd:3']);
			for (const [item, node] of nodes) expect(root.find('#row-' + item)).toBe(node);

			await act(() => pending.resolve('second'));
			expect(rows(root)).toEqual(next.map((item, index) => item + ':' + index));
			for (const item of next)
				if (nodes.has(item)) expect(root.find('#row-' + item)).toBe(nodes.get(item));

			root.update(KeyedIndexHold, { items: initial, promise: fulfilled('third') });
			expect(rows(root)).toEqual(['a:0', 'b:1', 'c:2', 'd:3']);
		} finally {
			root.unmount();
		}
	});
});
