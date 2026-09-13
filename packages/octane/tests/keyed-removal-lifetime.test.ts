import { describe, expect, it } from 'vitest';
import { startTransition } from '../src/index.js';
import { act, mount } from './_helpers';
import { KeyedRemovalLifetime } from './_fixtures/keyed-removal-lifetime.tsrx';

function fulfilled(value: string): PromiseLike<string> {
	return { status: 'fulfilled', value, then() {} } as unknown as PromiseLike<string>;
}

describe('keyed removal lifetime', () => {
	it.each([false, true])(
		'preserves row state and both nodes while a removal is suspended (urgent edit: %s)',
		async (urgent) => {
			let resolve!: (value: string) => void;
			const pending = new Promise<string>((accept) => {
				resolve = accept;
			});
			const api = {
				setStep: (_value: number) => {},
				rows: new Map<string, (value: number) => void>(),
			};
			const cleanup: string[] = [];
			const root = mount(KeyedRemovalLifetime, {
				api,
				load: (step) => (step === 0 ? fulfilled('ready') : pending),
				cleanup: (id) => cleanup.push(id),
			});
			try {
				await act(() => {});
				const row = root.find('[data-row="b"]');
				const detail = root.find('[data-detail="b"]');
				await act(() => {
					startTransition(() => api.setStep(1));
					if (urgent) api.rows.get('b')!(1);
				});
				expect(root.find('[data-row="b"]')).toBe(row);
				expect(root.find('[data-detail="b"]')).toBe(detail);
				expect(row.textContent).toBe(urgent ? 'b:1' : 'b:0');
				expect(root.find('#removal-value').textContent).toBe('ready');
				expect(root.findAll('#removal-fallback')).toHaveLength(0);
				expect(cleanup).toEqual([]);
				root.click('[data-row="b"]');
				expect(row.textContent).toBe(urgent ? 'b:2' : 'b:1');
				await act(() => resolve('resolved'));
				expect(root.findAll('[data-row]').map((node) => node.textContent)).toEqual(['a:0', 'c:0']);
				expect(root.find('#removal-value').textContent).toBe('resolved');
				expect(cleanup).toEqual(['b']);
				expect(row.isConnected).toBe(false);
				expect(detail.isConnected).toBe(false);
			} finally {
				resolve('resolved');
				root.unmount();
			}
		},
	);

	it('retries the requested rows after a hold driven by multiple components', async () => {
		let resolve!: (value: string) => void;
		const pending = new Promise<string>((accept) => {
			resolve = accept;
		});
		const api = {
			setStep: (_value: number) => {},
			rows: new Map<string, (value: number) => void>(),
		};
		const cleanup: string[] = [];
		const root = mount(KeyedRemovalLifetime, {
			api,
			load: (step) => (step === 0 ? fulfilled('ready') : pending),
			cleanup: (id) => cleanup.push(id),
		});
		try {
			await act(() => {});
			const row = root.find('[data-row="b"]');
			const detail = root.find('[data-detail="b"]');
			await act(() => {
				startTransition(() => {
					api.setStep(1);
					api.rows.get('b')!(1);
				});
			});
			expect(root.find('[data-row="b"]')).toBe(row);
			expect(root.find('[data-detail="b"]')).toBe(detail);
			expect(row.textContent).toBe('b:0');
			expect(root.find('#removal-value').textContent).toBe('ready');
			expect(cleanup).toEqual([]);
			await act(() => resolve('resolved'));
			expect(root.findAll('[data-row]').map((node) => node.textContent)).toEqual(['a:0', 'c:0']);
			expect(root.find('#removal-value').textContent).toBe('resolved');
			expect(cleanup).toEqual(['b']);
			expect(row.isConnected).toBe(false);
			expect(detail.isConnected).toBe(false);
		} finally {
			resolve('resolved');
			root.unmount();
		}
	});
});
