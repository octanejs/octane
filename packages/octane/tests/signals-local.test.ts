import { describe, expect, it } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { ScopeDisposedError, type WritableSignal } from 'octane/signals';
import * as ServerHooks from '../src/signals/server.js';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import * as client from './_fixtures/signals-local.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/signals-local.tsrx',
	{
		compileOptions: { nativeReads: true },
		runtimeModules: { 'octane/signals/server': ServerHooks },
	},
);

describe('local native writable signal hooks', () => {
	it('preserves a stable handle and immediate values across prop renders', () => {
		let value$: WritableSignal<number> | undefined;
		const expose = (next$: WritableSignal<number>) => {
			value$ = next$;
		};
		const rendered = mount(client.LocalSignal, { initial: 1, label: 'value', expose });
		try {
			const first$ = value$!;
			rendered.click('button');
			expect(rendered.find('button').textContent?.trim()).toBe('2');
			flushSync(() => {
				first$.set(7);
				expect(first$.get()).toBe(7);
			});
			rendered.update(client.LocalSignal, { initial: 99, label: 'value', expose });
			expect(value$).toBe(first$);
			expect(rendered.find('button').textContent?.trim()).toBe('7');
		} finally {
			rendered.unmount();
		}
		expect(() => value$!.get()).toThrow(ScopeDisposedError);
	});

	it('uses compiler slots rather than call order for conditional local hooks', () => {
		const rendered = mount(client.ConditionalLocalSignals, { first: true });
		try {
			rendered.click('button');
			rendered.update(client.ConditionalLocalSignals, { first: false });
			expect(rendered.find('button').textContent?.trim()).toBe('21');
			rendered.update(client.ConditionalLocalSignals, { first: true });
			expect(rendered.find('button').textContent?.trim()).toBe('21');
		} finally {
			rendered.unmount();
		}
	});

	it('keeps keyed local owners and retires removed rows during a full clear', () => {
		const handles = new Map<string, WritableSignal<number>>();
		const expose = (label: string, value$: WritableSignal<number>) => {
			handles.set(label, value$);
		};
		const rendered = mount(client.LocalRows, { rows: ['a', 'b'], expose });
		try {
			const a$ = handles.get('a')!;
			const b$ = handles.get('b')!;
			const survivor = rendered.find('[data-label="b"]');
			flushSync(() => b$.set(4));
			rendered.update(client.LocalRows, { rows: ['b', 'a'], expose });
			expect(rendered.find('[data-label="b"]')).toBe(survivor);
			expect(handles.get('b')).toBe(b$);
			expect(survivor.textContent?.trim()).toBe('4');
			rendered.update(client.LocalRows, { rows: [], expose });
			expect(rendered.findAll('button')).toEqual([]);
			expect(() => a$.get()).toThrow(ScopeDisposedError);
			expect(() => b$.get()).toThrow(ScopeDisposedError);
		} finally {
			rendered.unmount();
		}
	});

	it('uses local initialization during hydration without publishing a shared-state seed', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const response = renderToString(server.LocalSignal, { initial: 3, label: 'local' });
		container.innerHTML = response.html;
		const button = container.querySelector('button');
		let value$: WritableSignal<number> | undefined;
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			expect(response.signals).toBeUndefined();
			flushSync(() => {
				root = hydrateRoot(container, client.LocalSignal, {
					initial: 3,
					label: 'local',
					expose: (next$: WritableSignal<number>) => {
						value$ = next$;
					},
				});
			});
			expect(container.querySelector('button')).toBe(button);
			flushSync(() => value$!.set(5));
			expect(button?.textContent?.trim()).toBe('5');
		} finally {
			root?.unmount();
			container.remove();
		}
	});
});
