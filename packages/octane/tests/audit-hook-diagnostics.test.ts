import { describe, expect, it, vi } from 'vitest';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

function fixture(source: string) {
	return loadCompiledFixtureSource(source, {
		id: 'audit-hook-diagnostics.tsrx',
		mode: 'client',
		compileOptions: {
			dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
			hmr: false,
		},
	});
}

describe('cached factory hook diagnostics', () => {
	it.each([
		['useMemo, use', 'useMemo', 'use'],
		['useMemo as remember, use as read', 'remember', 'read'],
	])('diagnoses use() inside a cached factory imported as %s', (imports, memo, use) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { App } = fixture(`import {createContext, ${imports}} from 'octane';
			const Context = createContext('read');
			export function App() @{ const value = ${memo}(() => ${use}(Context), []); <p>{value as string}</p> }`);
		const root = mount(App);
		try {
			expect(root.find('p').textContent).toBe('read');
			if (process.env.NODE_ENV !== 'production') {
				expect(error.mock.calls.flat().join(' ')).toContain('use() inside a useMemo() factory');
			} else expect(error).not.toHaveBeenCalled();
			error.mockClear();
			root.update(App, {});
			expect(error).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			error.mockRestore();
		}
	});

	it.each([
		`import {useMemo, use as read} from 'octane';
		 export function App() @{ const value = useMemo(() => { const read = () => 'local'; return read(); }, []); <p>{value as string}</p> }`,
		`import {createContext, useMemo as remember, use} from 'octane'; const Context = createContext('local');
		 export function App() @{ const remember = fn => fn(); const value = remember(() => use(Context)); <p>{value as string}</p> }`,
	])('does not warn for shadowed hook imports (%#)', (source) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { App } = fixture(source);
		const root = mount(App);
		try {
			expect(root.find('p').textContent).toBe('local');
			expect(error).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			error.mockRestore();
		}
	});

	it('ends the factory diagnostic scope when a computation throws', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { App } =
			fixture(`import {createContext, useMemo, use} from 'octane'; const Context = createContext('outside');
			export function App() @{ try { useMemo(function () { throw new Error('expected'); }, []); } catch {}
			const value = use(Context); <p>{value as string}</p> }`);
		const root = mount(App);
		try {
			expect(root.find('p').textContent).toBe('outside');
			expect(error).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			error.mockRestore();
		}
	});
});
