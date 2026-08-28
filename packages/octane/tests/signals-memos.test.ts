import { describe, expect, it } from 'vitest';
import { act, flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { createScope, query } from 'octane/signals';
import { flushEffects, mount } from './_helpers';
import { loadPlainHookFixtureSource, loadServerFixture } from './_server-fixture';
import { deferred } from './_server-stream';
import * as client from './_fixtures/signals-memos.tsrx';

describe('native reads in inferred memos', () => {
	it('refreshes inferred reads after a cache hit without changing explicit dependency contracts', () => {
		const scope = createScope({ scopeKey: 'memo-contracts' });
		const value$ = scope.signal$('value', 'first');
		const props = { read$: () => value$.get(), label: 'before' };
		const root = mount(client.MemoContracts, props);
		try {
			root.update(client.MemoContracts, { ...props, label: 'after' });
			flushSync(() => value$.set('second'));
			expect(root.find('.label').textContent).toBe('after');
			expect(root.find('.inferred').textContent).toBe('second');
			expect(root.find('.fixed').textContent).toBe('first');
			expect(root.find('.always').textContent).toBe('second');
			flushSync(() => value$.set('third'));
			expect(root.find('.inferred').textContent).toBe('third');
			expect(root.find('.fixed').textContent).toBe('first');
		} finally {
			root.unmount();
			scope.dispose();
		}
	});

	for (const Component of [client.MemoAlias, client.MemoNamespace, client.MemoCustomHook]) {
		it(`tracks reads through ${Component.name}`, () => {
			const scope = createScope({ scopeKey: 'memo-imports' });
			const value$ = scope.signal$('value', 'first');
			const props = { read$: () => value$.get() };
			const root = mount(Component, props);
			try {
				root.update(Component, props);
				flushSync(() => value$.set('second'));
				expect(root.find('output').textContent).toBe('second');
			} finally {
				root.unmount();
				expect(value$.get()).toBe('second');
				scope.dispose();
			}
		});
	}

	it('replaces conditional dependencies and retains them through unrelated parent updates', () => {
		const scope = createScope({ scopeKey: 'memo-conditional' });
		const choose$ = scope.signal$('choose', true);
		const left$ = scope.signal$('left', 'left');
		const right$ = scope.signal$('right', 'right');
		const props = {
			choose$: () => choose$.get(),
			left$: () => left$.get(),
			right$: () => right$.get(),
		};
		const root = mount(client.MemoSelected, props);
		try {
			flushSync(() => choose$.set(false));
			expect(root.find('output').textContent).toBe('right');
			root.update(client.MemoSelected, { ...props, label: 'updated' });
			flushSync(() => left$.set('unused'));
			expect(root.find('output').textContent).toBe('right');
			flushSync(() => right$.set('selected'));
			expect(root.find('output').textContent).toBe('selected');
			flushSync(() => choose$.set(true));
			expect(root.find('output').textContent).toBe('unused');
		} finally {
			root.unmount();
			scope.dispose();
		}
	});

	it('retries suspended memo reads and follows later resource changes', async () => {
		const scope = createScope({ scopeKey: 'memo-pending' });
		const first = deferred<string>();
		const second = deferred<string>();
		const key$ = scope.signal$('key', 'first');
		const request = query('memo-pending', (key: string) =>
			key === 'first' ? first.promise : second.promise,
		);
		const value$ = scope.asyncSignal$('value', () => request(key$.get()));
		const props = { read$: () => value$.get() };
		const root = mount(client.MemoPending, props);
		try {
			expect(root.find('.pending').textContent).toBe('waiting');
			await act(() => first.resolve('ready first'));
			expect(root.find('output').textContent).toBe('ready first');
			root.update(client.MemoPending, props);
			await act(() => key$.set('second'));
			await act(() => second.resolve('ready second'));
			expect(root.find('output').textContent).toBe('ready second');
		} finally {
			root.unmount();
			scope.dispose();
		}
	});

	it('seeds memo reads and adopts historical values before following live state', () => {
		const server = loadServerFixture<typeof client>(
			'packages/octane/tests/_fixtures/signals-memos.tsrx',
			{ compileOptions: { nativeReads: true } },
		);
		const scope = createScope({ scopeKey: 'memo-hydration' });
		const value$ = scope.signal$('value', 'server');
		const props = { read$: () => value$.get() };
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = renderToString(server.MemoValue, props).html;
		const output = container.querySelector('output')!;
		value$.set('live');
		const observations: string[] = [];
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			flushSync(() => {
				root = hydrateRoot(container, client.MemoValue, {
					...props,
					log: (value: string) => observations.push(value),
				});
				expect(output.textContent).toBe('server');
				expect(value$.get()).toBe('live');
			});
			expect(observations).toEqual(['server', 'live']);
			expect(container.querySelector('output')).toBe(output);
			flushSync(() => value$.set('after hydration'));
			expect(output.textContent).toBe('after hydration');
		} finally {
			root?.unmount();
			container.remove();
			scope.dispose();
			flushEffects();
		}
	});

	for (const inlineHookMemo of [false, true]) {
		it(`tracks inferred memos in plain modules (inline=${inlineHookMemo})`, () => {
			const plain = loadPlainHookFixtureSource(
				`import { createElement, useMemo } from 'octane';
export function App(props) {
  const value = useMemo(() => props.read$());
  const sampled = useMemo(() => props.label, [props.label]);
  return createElement('output', null, sampled + ':' + value);
}`,
				{ id: 'native-memo-hook.ts', inlineHookMemo, nativeReads: true },
			);
			const scope = createScope({ scopeKey: 'memo-plain-' + inlineHookMemo });
			const value$ = scope.signal$('value', 'first');
			const props = { read$: () => value$.get(), label: 'plain' };
			const root = mount(plain.App, props);
			try {
				root.update(plain.App, props);
				flushSync(() => value$.set('second'));
				expect(root.find('output').textContent).toBe('plain:second');
			} finally {
				root.unmount();
				scope.dispose();
			}
		});
	}
});
