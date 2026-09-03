import { describe, it, expect, vi } from 'vitest';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';
const dev = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';
function fixture(source: string) {
	return loadCompiledFixtureSource(source, {
		id: 'audit-list-diagnostics.tsrx',
		mode: 'client',
		compileOptions: { dev, hmr: false },
	});
}
describe('authored list diagnostics', () => {
	it('diagnoses missing keys in ordinary JSX map results', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { App } = fixture(
			`export function App({items}) @{ <ul>{items.map(item => <li>{item as string}</li>)}</ul> }`,
		);
		const r = mount(App, { items: ['a', 'b'] });
		try {
			expect(r.findAll('li').map((n) => n.textContent)).toEqual(['a', 'b']);
			if (dev) expect(warn.mock.calls.flat().join(' ')).toContain('key');
			else expect(warn).not.toHaveBeenCalled();
		} finally {
			r.unmount();
			warn.mockRestore();
		}
	});
	it('refreshes key expressions that capture component props', () => {
		const { App } = fixture(
			`export function App({items, prefix}) @{ <section>@for (const item of items; key prefix + item) { <input defaultValue={item}/> }</section> }`,
		);
		const items = ['a'];
		const r = mount(App, { items, prefix: 'first:' });
		try {
			const input = r.find('input') as HTMLInputElement;
			input.value = 'typed';
			r.update(App, { items, prefix: 'first:' });
			expect(r.find('input')).toBe(input);
			r.update(App, { items, prefix: 'second:' });
			expect(r.find('input')).not.toBe(input);
			expect((r.find('input') as HTMLInputElement).value).toBe('a');
		} finally {
			r.unmount();
		}
	});

	it('diagnoses duplicate explicit @for keys without re-evaluating them', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const keys: string[] = [];
		const { App } = fixture(
			`export function App({items, keyOf}) @{ <ul>@for (const item of items; key keyOf(item)) { <li>{item as string}</li> }</ul> }`,
		);
		const r = mount(App, {
			items: ['a', 'a'],
			keyOf: (item: string) => {
				keys.push(item);
				return item;
			},
		});
		try {
			expect(keys).toEqual(['a', 'a']);
			if (process.env.NODE_ENV !== 'production')
				expect(error.mock.calls.flat().join(' ')).toContain('same key');
			else expect(error).not.toHaveBeenCalled();
		} finally {
			r.unmount();
			error.mockRestore();
		}
	});
});
