import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
	createElement,
	flushSync,
	hydrateRoot,
	lazy,
	memo,
	ViewTransition,
	type ComponentBody,
} from '../src/index.js';
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
	it('keeps children when a returned lazy body switches to ViewTransition, then clears undefined output', () => {
		let selected: ComponentBody<any> = () => createElement('span', { children: 'returned' });
		const payload = {
			get default() {
				return selected;
			},
		};
		const Lazy = lazy(() => immediate(payload));
		const children = createElement('em', { children: 'transition child' });
		const view = mount(Lazy, { children });
		try {
			expect(view.find('span').textContent).toBe('returned');
			selected = ViewTransition;
			view.update(Lazy, { children });
			expect(view.findAll('span')).toEqual([]);
			expect(view.find('em').textContent).toBe('transition child');
			view.update(Lazy, { children });
			expect(view.find('em').textContent).toBe('transition child');

			selected = () => undefined;
			view.update(Lazy, { children });
			expect(view.container.textContent).toBe('');
		} finally {
			view.unmount();
		}
	});

	for (const depth of [1, 2]) {
		it.each([false, true])(
			`checks bodies through ${depth} memo wrappers (custom comparator=%s)`,
			(custom) => {
				const { First, Second, Shell } = compileFixture();
				let selected = First;
				let Wrapped = lazy(() =>
					immediate({
						get default() {
							return selected;
						},
					}),
				);
				const compare = vi.fn(() => true);
				for (let i = 0; i < depth; i++) Wrapped = memo(Wrapped, custom ? compare : undefined);
				const log = vi.fn();
				const read = () => 'tail';
				const views = [
					mount(Shell, { Lazy: Wrapped, log, read }),
					mount(Shell, { Lazy: Wrapped, log, read }),
				];
				try {
					const inputs = views.map((view) => view.find('input') as HTMLInputElement);
					const buttons = views.map((view) => view.find('button'));
					for (const view of views) view.click('button');
					inputs[0].value = 'first draft';
					inputs[1].value = 'second draft';
					for (const [body, text] of [
						[First, 'first'],
						[Second, 'second'],
						[First, 'first'],
					] as const) {
						selected = body;
						for (const [index, view] of views.entries()) {
							view.update(Shell, { Lazy: Wrapped, log, read });
							expect(view.find('span').textContent).toBe(text);
							expect(view.find('input')).toBe(inputs[index]);
							expect(view.find('button')).toBe(buttons[index]);
							expect(buttons[index].textContent).toBe('1');
							expect(inputs[index].value).toBe(index === 0 ? 'first draft' : 'second draft');
						}
					}
					if (custom) {
						expect(compare).toHaveBeenCalled();
						for (const args of compare.mock.calls) expect(args).toHaveLength(2);
					}
					expect(log.mock.calls).toEqual([['mount'], ['mount']]);
				} finally {
					for (const view of views) view.unmount();
				}
				expect(log.mock.calls).toEqual([['mount'], ['mount'], ['unmount'], ['unmount']]);
			},
		);
	}

	it.each([false, true])(
		'preserves the outer comparison for an unchanged lazy body (custom=%s)',
		(custom) => {
			const { Dynamic, PropShell } = compileFixture();
			const compare = vi.fn(() => true);
			const Wrapped = memo(
				memo(lazy(() => immediate({ default: Dynamic }))),
				custom ? compare : undefined,
			);
			const view = mount(PropShell, { Lazy: Wrapped, text: 'first' });
			try {
				view.update(PropShell, { Lazy: Wrapped, text: 'second' });
				expect(view.find('span').textContent).toBe(custom ? 'first' : 'second');
				if (custom) {
					expect(compare).toHaveBeenCalled();
					for (const args of compare.mock.calls) expect(args).toHaveLength(2);
				}
			} finally {
				view.unmount();
			}
		},
	);

	it.each([0, 1, 2])(
		'checks lazy ownership before an identical descriptor bailout (memo depth=%s)',
		(depth) => {
			const { First, Second, DescriptorShell } = compileFixture();
			let selected = First;
			let Wrapped = lazy(() =>
				immediate({
					get default() {
						return selected;
					},
				}),
			);
			for (let i = 0; i < depth; i++) Wrapped = memo(Wrapped);
			const log = () => {};
			const child = createElement(Wrapped, { log });
			const view = mount(DescriptorShell, { child, read: () => 'first' });
			try {
				const input = view.find('input');
				for (const [body, text] of [
					[Second, 'second'],
					[First, 'first'],
				] as const) {
					selected = body;
					view.update(DescriptorShell, { child, read: () => text });
					expect(view.find('span').textContent).toBe(text);
					expect(view.find('input')).toBe(input);
				}
			} finally {
				view.unmount();
			}
		},
	);

	it('checks a lazy body reached through a resolved memo wrapper', () => {
		const { First, Second, Shell } = compileFixture();
		let selected = First;
		const Inner = lazy(() =>
			immediate({
				get default() {
					return selected;
				},
			}),
		);
		const current = memo(Inner, () => true);
		const Outer = lazy(() => immediate({ default: current }));
		const log = () => {};
		const read = () => 'tail';
		const view = mount(Shell, { Lazy: Outer, log, read });
		try {
			for (const [body, text] of [
				[Second, 'second'],
				[First, 'first'],
			] as const) {
				selected = body;
				view.update(Shell, { Lazy: Outer, log, read });
				expect(view.find('span').textContent).toBe(text);
			}
		} finally {
			view.unmount();
		}
	});

	it('keeps hoisted lazy memo metadata nominal to the original wrapper', () => {
		const { First, Shell } = compileFixture();
		const loader = vi.fn(() => immediate({ default: First }));
		const Original = memo(lazy(loader));
		let output = 'wrapper';
		const Hoc = () => createElement('span', null, output);
		for (const key of Reflect.ownKeys(Original)) {
			if (['name', 'length', 'prototype', 'caller', 'arguments'].includes(String(key))) continue;
			Object.defineProperty(Hoc, key, Object.getOwnPropertyDescriptor(Original, key)!);
		}
		const compare = vi.fn(() => true);
		const Wrapped = memo(Hoc, compare);
		const log = () => {};
		const view = mount(Shell, { Lazy: Wrapped, log, read: () => 'first' });
		try {
			output = 'not accepted';
			view.update(Shell, { Lazy: Wrapped, log, read: () => 'second' });
			expect(view.find('span').textContent).toBe('wrapper');
			expect(loader).not.toHaveBeenCalled();
			expect(compare).toHaveBeenCalled();
			for (const args of compare.mock.calls) expect(args).toHaveLength(2);
		} finally {
			view.unmount();
		}
	});

	it('checks an imported memo lazy wrapper through a cached compiled parent', () => {
		const { First, Second } = compileFixture();
		let selected = First;
		const Wrapped = memo(
			lazy(() =>
				immediate({
					get default() {
						return selected;
					},
				}),
			),
		);
		const imported = readFileSync(
			'packages/octane/tests/_fixtures/lazy-output-imported.tsrx',
			'utf8',
		);
		const { ImportedShell } = loadCompiledFixtureSource(imported, {
			id: 'lazy-output-imported.tsrx',
			mode: 'client',
			compileOptions: options,
			runtimeModules: { './lazy-output.tsrx': { First: Wrapped } },
		});
		const log = () => {};
		const view = mount(ImportedShell, { log, read: () => 'first' });
		try {
			for (const [body, text] of [
				[Second, 'second'],
				[First, 'first'],
			] as const) {
				selected = body;
				view.update(ImportedShell, { log, read: () => text });
				expect(view.find('span').textContent).toBe(text);
			}
		} finally {
			view.unmount();
		}
	});

	it('shares lazy bailout checks across independently evaluated runtime copies', async () => {
		const { First, Second, Shell } = compileFixture();
		let selected = memo(First, () => true);
		const first = selected;
		const second = memo(Second, () => true);
		// Isolate only the wrapper factory; the compiled bodies use this root's runtime.
		vi.resetModules();
		const OtherRuntime = await import('../src/runtime.js');
		const Lazy = OtherRuntime.lazy(() =>
			immediate({
				get default() {
					return selected;
				},
			}),
		);
		const Wrapped = memo(Lazy);
		const log = () => {};
		const read = () => 'tail';
		const views = [mount(Shell, { Lazy, log, read }), mount(Shell, { Lazy: Wrapped, log, read })];
		try {
			for (const [body, text] of [
				[second, 'second'],
				[first, 'first'],
			] as const) {
				selected = body;
				for (const [index, view] of views.entries()) {
					view.update(Shell, { Lazy: index === 0 ? Lazy : Wrapped, log, read });
					expect(view.find('span').textContent).toBe(text);
				}
			}
		} finally {
			for (const view of views) view.unmount();
		}
	});

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

	it.each([false, true])(
		'restores the accepted body after a later sibling suspends and retries (memo wrapper=%s)',
		async (wrapped) => {
			const { First, Second, Shell } = compileFixture();
			let selected = First;
			const LazyBody = lazy(() =>
				immediate({
					get default() {
						return selected;
					},
				}),
			);
			const Lazy = wrapped ? memo(memo(LazyBody), () => true) : LazyBody;
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
		},
	);

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
