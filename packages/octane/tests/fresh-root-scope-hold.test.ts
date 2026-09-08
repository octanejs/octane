import { describe, expect, it } from 'vitest';
import { act, mount } from './_helpers';
import { FreshRootScopeHold } from './_fixtures/fresh-root-scope-hold.tsrx';

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
			expect(root.find('#root-read')).toBe(reader);
			expect(reader.textContent).toBe('first');
			expect(external.textContent).toBe('external:initial');
			expect(external.getAttribute('data-state')).toBe('initial');

			await act(() => pending.resolve('second'));
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
