import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot, lazy, memo } from '../src/index.js';
import * as ServerRuntime from 'octane/server';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { act, mount } from './_helpers.js';

const source = readFileSync('packages/octane/tests/_fixtures/lazy-output.tsrx', 'utf8');
const options = { hmr: false, dev: false, autoMemo: true, inlineHookMemo: true };

function compileFixture(mode: 'client' | 'server' = 'client') {
	return loadCompiledFixtureSource(source, {
		id: 'lazy-output.tsrx',
		mode,
		compileOptions: options,
	});
}

function immediate<T>(value: T): PromiseLike<T> {
	return {
		then(resolve: any) {
			resolve(value);
		},
	} as PromiseLike<T>;
}

describe('resolved lazy body ownership', () => {
	it('renders each accepted module body while preserving compatible descendants', () => {
		const { First, Second } = compileFixture();
		let selected = First;
		const loader = vi.fn(() =>
			immediate({
				get default() {
					return selected;
				},
			}),
		);
		const Lazy = lazy(loader);
		const log = vi.fn();
		const view = mount(Lazy, { log });
		try {
			const input = view.find('input') as HTMLInputElement;
			const label = view.find('span');
			const button = view.find('button');
			input.value = 'typed';
			input.focus();
			input.setSelectionRange(1, 3);
			view.click('button');
			for (const [body, text] of [
				[Second, 'second'],
				[First, 'first'],
				[Second, 'second'],
				[First, 'first'],
			] as const) {
				selected = body;
				view.update(Lazy, { log });
				expect(view.find('span')).toBe(label);
				expect(label.textContent).toBe(text);
				expect(view.find('input')).toBe(input);
				expect(input.value).toBe('typed');
				expect(document.activeElement).toBe(input);
				expect(input.selectionStart).toBe(1);
				expect(input.selectionEnd).toBe(3);
				expect(view.find('button')).toBe(button);
				expect(button.textContent).toBe('1');
				expect(view.findAll('input')).toHaveLength(1);
			}
			view.click('button');
			expect(button.textContent).toBe('2');
			expect(loader).toHaveBeenCalledTimes(1);
			expect(log.mock.calls).toEqual([['mount']]);
		} finally {
			view.unmount();
		}
		expect(log.mock.calls).toEqual([['mount'], ['unmount']]);
	});

	it('tracks resolved bodies independently for multiple mounts of one lazy wrapper', () => {
		const { First, Second } = compileFixture();
		let selected = First;
		const Lazy = lazy(() =>
			immediate({
				get default() {
					return selected;
				},
			}),
		);
		const log = () => {};
		const views = [mount(Lazy, { log }), mount(Lazy, { log })];
		try {
			for (const [body, text] of [
				[Second, 'second'],
				[First, 'first'],
			] as const) {
				selected = body;
				for (const view of views) {
					view.update(Lazy, { log });
					expect(view.find('span').textContent).toBe(text);
				}
			}
		} finally {
			for (const view of views) view.unmount();
		}
	});

	it('checks the resolved memo body before applying its props comparator', () => {
		const { First, Second, Shell } = compileFixture();
		const compare = vi.fn(() => true);
		const first = memo(First, compare);
		const second = memo(Second, compare);
		let selected = first;
		const Lazy = lazy(() =>
			immediate({
				get default() {
					return selected;
				},
			}),
		);
		const log = () => {};
		const read = () => 'tail';
		const views = [mount(Shell, { Lazy, log, read }), mount(Shell, { Lazy, log, read })];
		try {
			for (const [body, text] of [
				[second, 'second'],
				[first, 'first'],
			] as const) {
				selected = body;
				for (const view of views) {
					view.update(Shell, { Lazy, log, read });
					expect(view.find('span').textContent).toBe(text);
					view.update(Shell, { Lazy, log, read });
					expect(view.find('span').textContent).toBe(text);
				}
			}
			expect(compare).toHaveBeenCalled();
			for (const args of compare.mock.calls) expect(args).toHaveLength(2);
		} finally {
			for (const view of views) view.unmount();
		}
	});

	it('stops applying old memo metadata when the resolved body is no longer memoized', () => {
		const { First, Second, Shell } = compileFixture();
		const compare = vi.fn(() => true);
		let selected = memo(First, compare);
		const Lazy = lazy(() =>
			immediate({
				get default() {
					return selected;
				},
			}),
		);
		const log = () => {};
		const props = () => ({ Lazy, log, read: () => 'tail' });
		const view = mount(Shell, props());
		try {
			selected = Second;
			view.update(Shell, props());
			expect(view.find('span').textContent).toBe('second');
			view.update(Shell, props());
			expect(compare).not.toHaveBeenCalled();
		} finally {
			view.unmount();
		}
	});

	it('keeps memo values from independently compiled resolved modules separate', () => {
		const first = compileFixture();
		const second = loadCompiledFixtureSource(source.replaceAll("text: 'first'", "text: 'other'"), {
			id: 'lazy-output-other.tsrx',
			mode: 'client',
			compileOptions: options,
		});
		let selected = first.First;
		const Lazy = lazy(() =>
			immediate({
				get default() {
					return selected;
				},
			}),
		);
		const log = () => {};
		const view = mount(Lazy, { log });
		try {
			for (const [body, text] of [
				[second.First, 'other'],
				[first.First, 'first'],
				[second.First, 'other'],
			] as const) {
				selected = body;
				view.update(Lazy, { log });
				expect(view.find('span').textContent).toBe(text);
			}
		} finally {
			view.unmount();
		}
	});

	it.each([false, true])(
		'supports body switches between compilation modes (optimized first=%s)',
		(optimizedFirst) => {
			const bodies = [false, true].map((optimized) =>
				loadCompiledFixtureSource(source, {
					id: `lazy-output-mode-${optimized}.tsrx`,
					mode: 'client',
					compileOptions: { ...options, autoMemo: optimized, inlineHookMemo: optimized },
				}),
			);
			const first = bodies[Number(optimizedFirst)];
			const second = bodies[Number(!optimizedFirst)];
			let selected = first.First;
			const Lazy = lazy(() =>
				immediate({
					get default() {
						return selected;
					},
				}),
			);
			const log = () => {};
			const view = mount(Lazy, { log });
			try {
				for (const [body, text] of [
					[second.Second, 'second'],
					[first.First, 'first'],
					[second.Second, 'second'],
				] as const) {
					selected = body;
					view.update(Lazy, { log });
					expect(view.find('span').textContent).toBe(text);
					expect(view.findAll('input')).toHaveLength(1);
					expect(view.findAll('span')).toHaveLength(1);
					expect(view.findAll('button')).toHaveLength(1);
					view.click('button');
					expect(view.find('button').textContent).toBe('1');
				}
			} finally {
				view.unmount();
			}
		},
	);

	it('restores the accepted body after a later sibling suspends and retries', async () => {
		const { First, Second, Shell } = compileFixture();
		let selected = First;
		const Lazy = lazy(() =>
			immediate({
				get default() {
					return selected;
				},
			}),
		);
		const log = vi.fn();
		let ready = false;
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		const view = mount(Shell, { Lazy, log, read: () => 'accepted' });
		try {
			// Both bodies have committed caches before the speculative handoff.
			// The retry must invalidate Second again after rollback restores First.
			selected = Second;
			view.update(Shell, { Lazy, log, read: () => 'previous second' });
			selected = First;
			view.update(Shell, { Lazy, log, read: () => 'accepted' });
			const input = view.find('input') as HTMLInputElement;
			const label = view.find('span');
			const button = view.find('button');
			input.value = 'held';
			input.focus();
			view.click('button');
			selected = Second;
			view.update(Shell, {
				Lazy,
				log,
				read() {
					if (!ready) throw promise;
					return 'retried';
				},
			});
			expect(label.textContent).toBe('first');
			expect(view.find('p').textContent).toBe('accepted');
			expect(view.find('input')).toBe(input);
			expect(input.value).toBe('held');
			expect(document.activeElement).toBe(input);
			expect(log.mock.calls).toEqual([['mount']]);
			ready = true;
			await act(async () => {
				resolve();
				await promise;
			});
			expect(label.textContent).toBe('second');
			expect(view.find('p').textContent).toBe('retried');
			selected = First;
			view.update(Shell, { Lazy, log, read: () => 'returned' });
			expect(view.find('span')).toBe(label);
			expect(label.textContent).toBe('first');
			expect(view.find('button')).toBe(button);
			expect(button.textContent).toBe('1');
			expect(view.findAll('input')).toHaveLength(1);
			expect(view.find('input')).toBe(input);
			expect(input.value).toBe('held');
			expect(log.mock.calls).toEqual([['mount']]);
		} finally {
			ready = true;
			resolve();
			view.unmount();
		}
		expect(log.mock.calls).toEqual([['mount'], ['unmount']]);
	});

	it('updates hydrated output after leaving and returning to the server body', () => {
		const client = compileFixture();
		const server = compileFixture('server');
		let selected = client.First;
		const Lazy = lazy(() =>
			immediate({
				get default() {
					return selected;
				},
			}),
		);
		const ServerLazy = ServerRuntime.lazy(() => immediate({ default: server.First }));
		const log = vi.fn();
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(ServerLazy, { log }).html;
		document.body.appendChild(container);
		const input = container.querySelector('input')!;
		const label = container.querySelector('span')!;
		input.value = 'before hydration';
		const root = hydrateRoot(container, Lazy, { log });
		try {
			expect(container.querySelector('span')).toBe(label);
			for (const [body, text] of [
				[client.Second, 'second'],
				[client.First, 'first'],
			] as const) {
				selected = body;
				flushSync(() => root.render(Lazy, { log }));
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
