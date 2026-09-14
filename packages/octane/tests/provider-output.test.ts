import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createContext, createRoot, flushSync, hydrateRoot } from '../src/index.js';
import * as ServerRuntime from 'octane/server';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { act, mount } from './_helpers.js';

const source = readFileSync('packages/octane/tests/_fixtures/provider-output.tsrx', 'utf8');

describe('retained Provider output', () => {
	for (const autoMemo of [false, true]) {
		for (const inlineHookMemo of [false, true]) {
			it(`renders the current body after repeated switches (auto=${autoMemo}, inline=${inlineHookMemo})`, () => {
				const { First, Second } = loadCompiledFixtureSource(source, {
					id: 'provider-output.tsrx',
					mode: 'client',
					compileOptions: { hmr: false, dev: false, autoMemo, inlineHookMemo },
				});
				const Context = createContext('default');
				const container = document.createElement('div');
				document.body.appendChild(container);
				const root = createRoot(container);
				try {
					root.render(Context.Provider, { value: 'initial', children: First });
					const input = container.querySelector('input')!;
					const button = container.querySelector('button')!;
					const label = container.querySelector('span')!;
					input.value = 'typed';
					flushSync(() => button.click());
					expect(label.textContent).toBe('first');
					expect(button.textContent).toBe('1');
					for (const [body, text] of [
						[Second, 'second'],
						[First, 'first'],
						[Second, 'second'],
						[First, 'first'],
					] as const) {
						flushSync(() => root.render(Context.Provider, { value: text, children: body }));
						expect(container.querySelector('input')).toBe(input);
						expect(container.querySelector('button')).toBe(button);
						expect(input.value).toBe('typed');
						expect(container.querySelector('span')).toBe(label);
						expect(label.textContent).toBe(text);
						expect(button.textContent).toBe('1');
					}
					flushSync(() => button.click());
					expect(button.textContent).toBe('2');
				} finally {
					root.unmount();
					container.remove();
				}
			});
		}
	}

	for (const inlineHookMemo of [false, true]) {
		it(`keeps independently compiled child memos separate (inline=${inlineHookMemo})`, () => {
			const options = { hmr: false, dev: false, autoMemo: true, inlineHookMemo };
			const first = loadCompiledFixtureSource(source, {
				id: 'provider-module-first.tsrx',
				mode: 'client',
				compileOptions: options,
			});
			const second = loadCompiledFixtureSource(
				source.replaceAll("text: 'first'", "text: 'second'"),
				{
					id: 'provider-module-second.tsrx',
					mode: 'client',
					compileOptions: options,
				},
			);
			const Context = createContext('default');
			const view = mount(Context.Provider, { value: 'value', children: first.First });
			try {
				for (const [children, text] of [
					[second.First, 'second'],
					[first.First, 'first'],
					[second.First, 'second'],
				] as const) {
					view.update(Context.Provider, { value: text, children });
					expect(view.find('span').textContent).toBe(text);
				}
			} finally {
				view.unmount();
			}
		});
	}

	it.each([false, true])(
		'supports switching independent compilation modes (optimized first=%s)',
		(optimizedFirst) => {
			const bodies = [false, true].map((optimized) =>
				loadCompiledFixtureSource(source, {
					id: `provider-compiled-${optimized}.tsrx`,
					mode: 'client',
					compileOptions: {
						hmr: false,
						dev: false,
						autoMemo: optimized,
						inlineHookMemo: optimized,
					},
				}),
			);
			const first = bodies[Number(optimizedFirst)];
			const second = bodies[Number(!optimizedFirst)];
			const Context = createContext('default');
			const view = mount(Context.Provider, { value: 'value', children: first.First });
			try {
				for (const [children, text] of [
					[second.Second, 'second'],
					[first.First, 'first'],
					[second.Second, 'second'],
				] as const) {
					view.update(Context.Provider, { value: text, children });
					expect(view.find('span').textContent).toBe(text);
					view.click('button');
					expect(view.find('button').textContent).toBe('1');
				}
			} finally {
				view.unmount();
			}
		},
	);

	for (const inlineHookMemo of [false, true]) {
		it(`retains each independent body's own hooks (inline=${inlineHookMemo})`, () => {
			const ownedSource = readFileSync(
				'packages/octane/tests/_fixtures/provider-owned-hooks.tsrx',
				'utf8',
			);
			const compileOptions = { hmr: false, dev: false, autoMemo: true, inlineHookMemo };
			const first = loadCompiledFixtureSource(ownedSource, {
				id: 'owned-first.tsrx',
				mode: 'client',
				compileOptions,
			});
			const second = loadCompiledFixtureSource(ownedSource.replaceAll("'first'", "'second'"), {
				id: 'owned-second.tsrx',
				mode: 'client',
				compileOptions,
			});
			const Context = createContext('default');
			const view = mount(Context.Provider, { value: 'value', children: first.Content });
			try {
				const input = view.find('input') as HTMLInputElement;
				input.value = 'typed across bodies';
				view.click('button');
				expect(view.find('button').textContent).toBe('1');
				view.update(Context.Provider, { value: 'value', children: second.Content });
				expect(view.find('span').textContent).toBe('second');
				expect(view.find('p').textContent).toBe('second');
				expect(view.find('button').textContent).toBe('0');
				view.click('button');
				view.click('button');
				view.update(Context.Provider, { value: 'value', children: first.Content });
				expect(view.find('span').textContent).toBe('first');
				expect(view.find('p').textContent).toBe('first');
				expect(view.find('button').textContent).toBe('1');
				view.update(Context.Provider, { value: 'value', children: second.Content });
				expect(view.find('button').textContent).toBe('2');
				expect(view.find('input')).toBe(input);
				expect(input.value).toBe('typed across bodies');
			} finally {
				view.unmount();
			}
		});
	}

	it('restores a memoized body after an intermediate body compiled without memoization', () => {
		const options = { hmr: false, dev: false, autoMemo: true, inlineHookMemo: true };
		const shared = loadCompiledFixtureSource(source, {
			id: 'provider-helpers.tsrx',
			mode: 'client',
			compileOptions: options,
		});
		const sharedSource = readFileSync(
			'packages/octane/tests/_fixtures/provider-output-shared.tsrx',
			'utf8',
		);
		const runtimeModules = { './provider-output.tsrx': shared };
		const first = loadCompiledFixtureSource(sharedSource, {
			id: 'provider-first.tsrx',
			mode: 'client',
			compileOptions: options,
			runtimeModules,
		});
		const second = loadCompiledFixtureSource(sharedSource, {
			id: 'provider-uncached.tsrx',
			mode: 'client',
			compileOptions: { ...options, autoMemo: false, inlineHookMemo: false },
			runtimeModules,
		});
		const Context = createContext('default');
		const view = mount(Context.Provider, { value: 'value', children: first.First });
		try {
			const input = view.find('input') as HTMLInputElement;
			input.value = 'retained';
			view.update(Context.Provider, { value: 'other', children: second.Second });
			expect(view.find('span').textContent).toBe('second');
			view.update(Context.Provider, { value: 'return', children: first.First });
			expect(view.find('span').textContent).toBe('first');
			expect(view.find('input')).toBe(input);
			expect(input.value).toBe('retained');
		} finally {
			view.unmount();
		}
	});

	it('keeps server hook slots distinct across independently evaluated modules and render retries', () => {
		const ownedSource = readFileSync(
			'packages/octane/tests/_fixtures/provider-owned-hooks.tsrx',
			'utf8',
		);
		for (const id of ['server-owned-first.tsrx', 'server-owned-second.tsrx']) {
			const server = loadCompiledFixtureSource(ownedSource, {
				id,
				mode: 'server',
				compileOptions: { hmr: false, dev: false },
			});
			const container = document.createElement('div');
			container.innerHTML = ServerRuntime.renderToString(server.Retry).html;
			expect(container.querySelector('span')!.textContent).toBe('accepted');
		}
	});

	it('uses fresh inline children captures while retaining mounted state', () => {
		const { Inline } = loadCompiledFixtureSource(source, {
			id: 'provider-inline.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false, autoMemo: true, inlineHookMemo: true },
		});
		const Context = createContext('default');
		const seen: string[] = [];
		const view = mount(Inline, { Context, text: 'first', onClick: () => seen.push('first') });
		try {
			const input = view.find('input') as HTMLInputElement;
			const label = view.find('span');
			input.value = 'draft';
			view.click('button');
			for (const text of ['first', 'second', 'first']) {
				view.update(Inline, { Context, text, onClick: () => seen.push(text) });
				expect(view.find('span')).toBe(label);
				expect(label.textContent).toBe(text);
				expect(view.find('input')).toBe(input);
				expect(input.value).toBe('draft');
				expect(view.find('button').textContent).toBe('1');
				view.click('a');
			}
			expect(seen).toEqual(['first', 'second', 'first']);
		} finally {
			view.unmount();
		}
	});

	it('retries the current body after a later sibling suspends its completed output', async () => {
		const { First, Second, Shell } = loadCompiledFixtureSource(source, {
			id: 'provider-held.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false, autoMemo: true, inlineHookMemo: true },
		});
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		let ready = false;
		const Context = createContext('default');
		const view = mount(Shell, { Context, children: First, read: () => 'ready' });
		try {
			const label = view.find('span');
			const input = view.find('input') as HTMLInputElement;
			input.value = 'held draft';
			view.click('button');
			view.update(Shell, {
				Context,
				children: Second,
				read() {
					if (!ready) throw promise;
					return 'resolved';
				},
			});
			expect(label.textContent).toBe('first');
			expect(view.find('button').textContent).toBe('1');
			ready = true;
			await act(async () => {
				resolve();
				await promise;
			});
			expect(view.find('span')).toBe(label);
			expect(label.textContent).toBe('second');
			expect(view.find('p').textContent).toBe('resolved');
			view.update(Shell, { Context, children: First, read: () => 'latest' });
			expect(label.textContent).toBe('first');
			expect(view.find('input')).toBe(input);
			expect(input.value).toBe('held draft');
			view.click('button');
			expect(view.find('button').textContent).toBe('2');
		} finally {
			resolve();
			view.unmount();
		}
	});

	it.each(['first', 'second'] as const)(
		'keeps the latest %s body after an obsolete suspended update resolves',
		async (acceptedText) => {
			const { First, Second, Shell } = loadCompiledFixtureSource(source, {
				id: 'provider-superseded.tsrx',
				mode: 'client',
				compileOptions: { hmr: false, dev: false, autoMemo: true, inlineHookMemo: true },
			});
			const accepted = acceptedText === 'first' ? First : Second;
			const pending = acceptedText === 'first' ? Second : First;
			const pendingText = acceptedText === 'first' ? 'second' : 'first';
			let resolve!: () => void;
			const promise = new Promise<void>((done) => {
				resolve = done;
			});
			let ready = false;
			const Context = createContext('default');
			const view = mount(Shell, { Context, children: accepted, read: () => 'accepted' });
			try {
				const label = view.find('span');
				const button = view.find('button');
				const input = view.find('input') as HTMLInputElement;
				input.value = 'draft kept through supersession';
				input.focus();
				input.setSelectionRange(2, 7);
				view.click('button');
				view.update(Shell, {
					Context,
					children: pending,
					read() {
						if (!ready) throw promise;
						return 'obsolete';
					},
				});
				expect(label.textContent).toBe(acceptedText);
				expect(view.find('p').textContent).toBe('accepted');
				expect(view.find('input')).toBe(input);
				expect(document.activeElement).toBe(input);
				view.click('button');
				expect(button.textContent).toBe('2');

				view.update(Shell, { Context, children: accepted, read: () => 'latest' });
				ready = true;
				await act(async () => {
					resolve();
					await promise;
				});
				expect(view.find('span')).toBe(label);
				expect(label.textContent).toBe(acceptedText);
				expect(view.find('p').textContent).toBe('latest');
				expect(view.find('button')).toBe(button);
				expect(button.textContent).toBe('2');
				expect(view.find('input')).toBe(input);
				expect(input.value).toBe('draft kept through supersession');
				expect(document.activeElement).toBe(input);
				expect(input.selectionStart).toBe(2);
				expect(input.selectionEnd).toBe(7);

				view.update(Shell, { Context, children: pending, read: () => 'subsequent' });
				expect(label.textContent).toBe(pendingText);
				view.update(Shell, { Context, children: accepted, read: () => 'returned' });
				expect(label.textContent).toBe(acceptedText);
				view.click('button');
				expect(button.textContent).toBe('3');
			} finally {
				ready = true;
				resolve();
				view.unmount();
			}
		},
	);

	it.each([false, true])(
		'hydrates then switches independent body compilations (optimized first=%s)',
		(optimizedFirst) => {
			const modeOptions = (optimized: boolean) => ({
				hmr: false,
				dev: false,
				autoMemo: optimized,
				inlineHookMemo: optimized,
			});
			const first = loadCompiledFixtureSource(source, {
				id: 'provider-independent-hydrate-first.tsrx',
				mode: 'client',
				compileOptions: modeOptions(optimizedFirst),
			});
			const second = loadCompiledFixtureSource(source, {
				id: 'provider-independent-hydrate-second.tsrx',
				mode: 'client',
				compileOptions: modeOptions(!optimizedFirst),
			});
			const server = loadCompiledFixtureSource(source, {
				id: 'provider-independent-hydrate-first.tsrx',
				mode: 'server',
				compileOptions: modeOptions(optimizedFirst),
			});
			const serverContext = ServerRuntime.createContext('default');
			const Context = createContext('default');
			const container = document.createElement('div');
			container.innerHTML = ServerRuntime.renderToString(serverContext.Provider, {
				value: 'server',
				children: server.First,
			}).html;
			document.body.appendChild(container);
			const input = container.querySelector('input')!;
			const label = container.querySelector('span')!;
			input.value = 'typed before hydration';
			const root = hydrateRoot(container, Context.Provider, {
				value: 'server',
				children: first.First,
			});
			try {
				expect(container.querySelector('span')).toBe(label);
				for (const [children, text] of [
					[second.Second, 'second'],
					[first.First, 'first'],
				] as const) {
					flushSync(() => root.render(Context.Provider, { value: text, children }));
					expect(container.querySelector('span')!.textContent).toBe(text);
					expect(container.querySelector('input')).toBe(input);
					expect(input.value).toBe('typed before hydration');
					flushSync(() => container.querySelector('button')!.click());
					expect(container.querySelector('button')!.textContent).toBe('1');
				}
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);

	it.each([false, true])(
		'abandons a suspended independent body switch (optimized first=%s)',
		async (optimizedFirst) => {
			const modeOptions = (optimized: boolean) => ({
				hmr: false,
				dev: false,
				autoMemo: optimized,
				inlineHookMemo: optimized,
			});
			const first = loadCompiledFixtureSource(source, {
				id: 'provider-independent-held-first.tsrx',
				mode: 'client',
				compileOptions: modeOptions(optimizedFirst),
			});
			const second = loadCompiledFixtureSource(source, {
				id: 'provider-independent-held-second.tsrx',
				mode: 'client',
				compileOptions: modeOptions(!optimizedFirst),
			});
			let resolve!: () => void;
			const pending = new Promise<void>((done) => {
				resolve = done;
			});
			let ready = false;
			const Context = createContext('default');
			const view = mount(first.Shell, { Context, children: first.First, read: () => 'accepted' });
			try {
				const input = view.find('input') as HTMLInputElement;
				const label = view.find('span');
				const button = view.find('button');
				input.value = 'accepted input';
				view.click('button');
				view.update(first.Shell, {
					Context,
					children: second.Second,
					read() {
						if (!ready) throw pending;
						return 'obsolete';
					},
				});
				expect(view.find('span')).toBe(label);
				expect(label.textContent).toBe('first');
				expect(view.find('button')).toBe(button);
				expect(button.textContent).toBe('1');
				view.click('button');
				view.update(first.Shell, { Context, children: first.First, read: () => 'latest' });
				ready = true;
				await act(async () => {
					resolve();
					await pending;
				});
				expect(view.find('span')).toBe(label);
				expect(label.textContent).toBe('first');
				expect(view.find('p').textContent).toBe('latest');
				expect(view.find('input')).toBe(input);
				expect(input.value).toBe('accepted input');
				expect(view.find('button')).toBe(button);
				expect(button.textContent).toBe('2');
				view.update(first.Shell, { Context, children: second.Second, read: () => 'complete' });
				expect(view.find('span').textContent).toBe('second');
				expect(view.find('p').textContent).toBe('complete');
				view.click('button');
				expect(view.find('button').textContent).toBe('1');
			} finally {
				ready = true;
				resolve();
				view.unmount();
			}
		},
	);

	it('updates adopted Provider content after leaving and returning to the server body', () => {
		const compileOptions = { hmr: false, dev: false, autoMemo: true, inlineHookMemo: true };
		const client = loadCompiledFixtureSource(source, {
			id: 'provider-hydration.tsrx',
			mode: 'client',
			compileOptions,
		});
		const server = loadCompiledFixtureSource(source, {
			id: 'provider-hydration.tsrx',
			mode: 'server',
			compileOptions,
		});
		const serverContext = ServerRuntime.createContext('default');
		const Context = createContext('default');
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(serverContext.Provider, {
			value: 'server',
			children: server.First,
		}).html;
		document.body.appendChild(container);
		const input = container.querySelector('input')!;
		const label = container.querySelector('span')!;
		input.value = 'before hydration';
		const root = hydrateRoot(container, Context.Provider, {
			value: 'server',
			children: client.First,
		});
		try {
			expect(container.querySelector('span')).toBe(label);
			expect(label.textContent).toBe('first');
			for (const [children, text] of [
				[client.Second, 'second'],
				[client.First, 'first'],
			] as const) {
				flushSync(() => root.render(Context.Provider, { value: text, children }));
				expect(container.querySelector('span')).toBe(label);
				expect(label.textContent).toBe(text);
				expect(container.querySelector('input')).toBe(input);
				expect(input.value).toBe('before hydration');
			}
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
