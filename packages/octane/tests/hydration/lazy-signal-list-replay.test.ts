import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, flushSync, hydrateRoot, lazy } from 'octane';
import { renderToString } from 'octane/server';
import * as Signals from 'octane/signals';
import * as ClientSignals from 'octane/signals/client';
import * as ServerSignals from 'octane/signals/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

type View = { reversed: boolean; loading: boolean; rows: { id: string; label: string }[] };
const source = readFileSync(
	'packages/octane/tests/hydration/_fixtures/lazy-signal-list-replay.tsrx',
	'utf8',
);
const modes = [false, true].map((dev) => {
	const options = {
		id: `lazy-signal-list-replay-${dev}.tsrx`,
		compileOptions: { nativeReads: true, hmr: false, dev },
		runtimeModules: {
			'octane/signals': Signals,
			'octane/signals/client': ClientSignals,
			'octane/signals/server': ServerSignals,
		},
	};
	return {
		dev,
		server: loadCompiledFixtureSource(source, { ...options, mode: 'server' }),
		client: loadCompiledFixtureSource(source, { ...options, mode: 'client' }),
	};
});
let container: HTMLElement;
let root: ReturnType<typeof hydrateRoot> | undefined;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => {
	root?.unmount();
	root = undefined;
	container.remove();
});

describe('pending lazy child list adoption replay', () => {
	for (const { dev, server, client } of modes) {
		it(`${dev ? 'development' : 'production'} ignores lazy delivery after unmount`, async () => {
			const view: View = { reversed: false, loading: false, rows: [] };
			container.innerHTML = renderToString(server.Deferred, {
				Component: server.Sections,
				view,
			}).html;
			let resolve!: (module: { default: typeof client.Sections }) => void;
			const delivery = new Promise<{ default: typeof client.Sections }>((accept) => {
				resolve = accept;
			});
			const onMount = vi.fn();
			const recoverable = vi.fn();
			const uncaught = vi.fn();
			const Component = lazy(() => delivery);
			await act(() => {
				root = hydrateRoot(
					container,
					client.Deferred,
					{ Component, view, onMount },
					{ onRecoverableError: recoverable, onUncaughtError: uncaught },
				);
			});
			expect(onMount).not.toHaveBeenCalled();
			root!.unmount();
			root = undefined;
			await act(() => resolve({ default: client.Sections }));
			expect(container.querySelector('[data-view]')).toBeNull();
			expect(onMount).not.toHaveBeenCalled();
			expect(recoverable).not.toHaveBeenCalled();
			expect(uncaught).not.toHaveBeenCalled();
		});
		it(`${dev ? 'development' : 'production'} preserves the lazy delivery error contract`, async () => {
			const view: View = { reversed: false, loading: false, rows: [] };
			container.innerHTML = renderToString(server.Deferred, {
				Component: server.Sections,
				view,
			}).html;
			const error = new Error('synthetic delivery failure');
			const Component = lazy(() => Promise.reject(error));
			const recoverable = vi.fn();
			const uncaught = vi.fn();
			const onMount = vi.fn();
			await act(() => {
				root = hydrateRoot(
					container,
					client.Deferred,
					{ Component, view, onMount },
					{ onRecoverableError: recoverable, onUncaughtError: uncaught },
				);
			});
			expect(uncaught).toHaveBeenCalledOnce();
			expect(uncaught.mock.calls[0]![0]).toBe(error);
			expect(recoverable).not.toHaveBeenCalled();
			expect(onMount).not.toHaveBeenCalled();
		});
		for (const kept of [0, 1]) {
			it(`${dev ? 'development' : 'production'} still reports and removes actual extra server rows (${kept} kept)`, async () => {
				const serverView: View = {
					reversed: false,
					loading: false,
					rows: [
						{ id: 'a', label: 'First' },
						{ id: 'b', label: 'Extra' },
					],
				};
				const clientView: View = { ...serverView, rows: serverView.rows.slice(0, kept) };
				container.innerHTML = renderToString(server.Deferred, {
					Component: server.Adjacent,
					view: serverView,
				}).html;
				const first = container.querySelector('[data-row="a"]');
				const extra = container.querySelector('[data-row="b"]');
				const recoverable = vi.fn();
				const uncaught = vi.fn();
				await act(() => {
					root = hydrateRoot(
						container,
						client.Deferred,
						{ Component: client.Adjacent, view: clientView },
						{ onRecoverableError: recoverable, onUncaughtError: uncaught },
					);
				});
				expect(uncaught).not.toHaveBeenCalled();
				expect(recoverable).toHaveBeenCalledOnce();
				expect(recoverable.mock.calls[0]![0]).toBeInstanceOf(Error);
				expect(container.querySelector('[data-row="a"]')).toBe(kept ? first : null);
				expect(extra!.isConnected).toBe(false);
				expect(container.querySelectorAll('[data-row]')).toHaveLength(kept);
			});
		}
		for (const name of ['Sections', 'Adjacent']) {
			for (const pending of [false, true]) {
				it(`${dev ? 'development' : 'production'} ${name} ${pending ? 'pending' : 'available'} child adopts without recovery`, async () => {
					const view: View = { reversed: false, loading: false, rows: [] };
					const html = renderToString(server.Deferred, { Component: server[name], view }).html;
					container.innerHTML = html;
					const before = Array.from(container.querySelectorAll('[data-row]'));
					const input = container.querySelector('input');
					if (input) {
						input.value = 'typed@example.test';
						input.focus();
					}
					const recoverable = vi.fn();
					const uncaught = vi.fn();
					const onClick = vi.fn();
					const dispose = vi.fn();
					const onMount = vi.fn(() => dispose);
					let view$: Signals.WritableSignal<View> | undefined;
					const Component = pending
						? lazy(() => Promise.resolve({ default: client[name] }))
						: client[name];
					await act(() => {
						root = hydrateRoot(
							container,
							client.Deferred,
							{
								Component,
								view,
								onMount,
								onClick,
								expose: (next$: Signals.WritableSignal<View>) => {
									view$ = next$;
								},
							},
							{ onRecoverableError: recoverable, onUncaughtError: uncaught },
						);
					});
					expect(uncaught).not.toHaveBeenCalled();
					expect(recoverable).not.toHaveBeenCalled();
					expect(Array.from(container.querySelectorAll('[data-row]'))).toEqual(before);
					if (input) {
						expect(document.activeElement).toBe(input);
						expect(input.value).toBe('typed@example.test');
					}
					before.forEach((node, index) =>
						expect(container.querySelectorAll('[data-row]')[index]).toBe(node),
					);
					expect(onMount).toHaveBeenCalledOnce();
					flushSync(() =>
						view$!.set({
							...view,
							reversed: true,
							rows: [
								{ id: 'a', label: 'First' },
								{ id: 'b', label: 'Second' },
							],
						}),
					);
					if (name === 'Sections') {
						expect(
							Array.from(container.querySelectorAll('[data-row]')).map((row) =>
								row.getAttribute('data-row'),
							),
						).toEqual(['email', 'phone', 'divider', 'providers']);
						for (const node of before)
							expect(container.querySelector(`[data-row="${node.getAttribute('data-row')}"]`)).toBe(
								node,
							);
						expect(document.activeElement).toBe(input);
					} else {
						expect(
							Array.from(container.querySelectorAll('[data-row]')).map((row) => row.textContent),
						).toEqual(['First', 'Second']);
						const survivor = container.querySelector('[data-row="b"]');
						flushSync(() => view$!.set({ ...view, rows: [{ id: 'b', label: 'Updated' }] }));
						expect(container.querySelector('[data-row="b"]')).toBe(survivor);
						expect(survivor?.textContent).toBe('Updated');
					}
					flushSync(() => container.querySelector('button')!.click());
					expect(onClick).toHaveBeenCalledOnce();
					root!.unmount();
					root = undefined;
					expect(dispose).toHaveBeenCalledOnce();
					expect(recoverable).not.toHaveBeenCalled();
					expect(uncaught).not.toHaveBeenCalled();
				});
			}
		}
	}
});
