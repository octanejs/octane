import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Octane from 'octane';
import { act, createRoot, flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { SelectedCounts, StoreText, type Counts, type Store } from './_fixtures/store-views.tsrx';
import {
	SelectedCounts as ServerSelectedCounts,
	StoreText as ServerStoreText,
	// @ts-expect-error the shared fixture plugin compiles this module for the server
} from './_fixtures/store-views.tsrx?octane-ssr';

const artifactRoot = resolve(import.meta.dirname, '../upstream-artifact/package');
const artifact = createRequire(resolve(artifactRoot, 'package.json'));
const React = artifact('react');
const publishedExports = artifact('./package.json').exports as Record<
	string,
	string | { default: string }
>;
const entryPoints = Object.keys(publishedExports).filter((entry) => entry !== './package.json');

function createStore<T>(initial: T, server?: T) {
	const listeners = new Set<() => void>();
	let state = initial;
	const store: Store<T> & { set(next: T): void; listeners: Set<() => void> } = {
		listeners,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getSnapshot: () => state,
		getServerSnapshot: server === undefined ? undefined : () => server,
		set(next) {
			state = next;
			for (const listener of listeners) listener();
		},
	};
	return store;
}

afterEach(() => {
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

describe('entry points', () => {
	// @parity-case conformance:use-sync-external-store-entry-names
	it('export the published names from every entry point', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		for (const entry of entryPoints) {
			const target = publishedExports[entry];
			const published = artifact(typeof target === 'string' ? target : target.default);
			const binding = await import(`@octanejs/use-sync-external-store${entry.slice(1)}`);
			expect(Object.keys(binding).sort(), entry).toEqual(Object.keys(published).sort());
		}
	});

	// @parity-case conformance:use-sync-external-store-built-in-identity
	it("export the framework's own useSyncExternalStore, as the published package does on React 18+", async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		for (const entry of [
			'.',
			'./shim',
			'./shim/index.js',
			'./shim/index.native',
			'./shim/index.native.js',
		]) {
			const target = publishedExports[entry];
			const published = artifact(typeof target === 'string' ? target : target.default);
			const binding = await import(`@octanejs/use-sync-external-store${entry.slice(1)}`);
			expect(published.useSyncExternalStore, entry).toBe(React.useSyncExternalStore);
			expect(binding.useSyncExternalStore, entry).toBe(Octane.useSyncExternalStore);
		}
		const selectors = await Promise.all(
			['/with-selector', '/with-selector.js', '/shim/with-selector', '/shim/with-selector.js'].map(
				(entry) => import(`@octanejs/use-sync-external-store${entry}`),
			),
		);
		expect(new Set(selectors.map((entry) => entry.useSyncExternalStoreWithSelector)).size).toBe(1);
	});
});

describe('compiled components', () => {
	// @parity-case conformance:use-sync-external-store-server-hydration
	it('renders the server snapshot, hydrates the server DOM, then syncs to the client snapshot', async () => {
		const store = createStore('client', 'server');
		const serverLog: string[] = [];
		const { html } = renderToString(ServerStoreText, { store, log: serverLog });
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.append(container);
		const serverDiv = container.querySelector('#text')!;
		expect(serverDiv.textContent).toBe('server');
		expect(serverLog).toEqual([]);
		expect(store.listeners.size).toBe(0);

		const log: string[] = [];
		let root!: Octane.Root;
		await act(() => {
			root = hydrateRoot(container, StoreText, { store, log });
		});
		expect(log).toEqual(['Passive effect: server', 'Passive effect: client']);
		expect(container.querySelector('#text')).toBe(serverDiv);
		expect(serverDiv.textContent).toBe('client');

		await act(() => store.set('updated'));
		expect(serverDiv.textContent).toBe('updated');
		root.unmount();
		expect(store.listeners.size).toBe(0);
	});

	// @parity-case conformance:use-sync-external-store-server-selection
	it('selects from the server snapshot on the server and falls back to getSnapshot without one', () => {
		const store = createStore<Counts>({ a: 1, b: 2 }, { a: 10, b: 20 });
		const { html } = renderToString(ServerSelectedCounts, { store, selections: [] });
		const container = document.createElement('div');
		container.innerHTML = html;
		// OCTANE DIVERGENCE: the second selector passes no server snapshot. Octane's
		// server useSyncExternalStore reads getSnapshot there; React throws.
		expect(container.querySelector('#counts')!.textContent).toBe('10:2');
	});

	// @parity-case conformance:use-sync-external-store-selector-isolation
	it('keeps two selector hooks in one component independent and retains equal selections', async () => {
		const store = createStore<Counts>({ a: 0, b: 0 });
		const selections: { b: number }[] = [];
		const container = document.createElement('div');
		const root = createRoot(container);
		flushSync(() => root.render(SelectedCounts, { store, selections }));
		expect(container.textContent).toBe('0:0');

		await act(() => store.set({ a: 1, b: 0 }));
		expect(container.textContent).toBe('1:0');
		expect(selections.at(-1)).toBe(selections[0]);

		await act(() => store.set({ a: 1, b: 2 }));
		expect(container.textContent).toBe('1:2');
		expect(selections.at(-1)).not.toBe(selections[0]);

		root.unmount();
		expect(store.listeners.size).toBe(0);
	});
});
