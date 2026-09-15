import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { act, flushSync, hydrateRoot, startTransition } from 'octane';
import { renderToString } from 'octane/server';
import { createScope, query } from 'octane/signals';
import type { CSSProperties } from 'octane/jsx-runtime';
import * as Signals from 'octane/signals';
import * as ClientSignals from 'octane/signals/client';
import * as ServerSignals from 'octane/signals/server';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
import * as client from './_fixtures/signals-dom-bindings.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/signals-dom-bindings.tsrx',
	{ runtimeModules: { 'octane/signals': Signals, 'octane/signals/server': ServerSignals } },
);

describe('signal-valued DOM styles', () => {
	it.each([client.GuardedStyles, client.SignalStyles, client.InlineGuardedStyles])(
		'releases a replaced style source after its initial render suspends',
		async (Component) => {
			const scope = createScope({ scopeKey: 'initial-style-retry' });
			let resolve!: (value: number) => void;
			const request = query(
				'position',
				() =>
					new Promise<number>((done) => {
						resolve = done;
					}),
			);
			const initial$ = scope.asyncSignal$('initial', () => request(undefined));
			const replacement$ = scope.signal$<number | null>('replacement', 30);
			const rendered = mount(Component, { left$: initial$ });
			try {
				await act(() => resolve(15));
				const host = rendered.find('div') as HTMLElement;
				expect(host.style.left).toBe('15px');
				rendered.update(Component, { left$: replacement$ });
				expect(rendered.find('div')).toBe(host);
				expect(host.style.left).toBe('30px');
				expect(scope.inspect().nodes.find((node) => node.key === 'initial')?.subscribers).toBe(0);
				flushSync(() => replacement$.set(31));
				expect(host.style.left).toBe('31px');
			} finally {
				rendered.unmount();
				scope.dispose();
			}
		},
	);

	it('releases styles completed before a sibling initially suspends', async () => {
		const scope = createScope({ scopeKey: 'initial-style-pair' });
		const first$ = scope.signal$<number | null>('first', 10);
		const replacement$ = scope.signal$<number | null>('replacement', 30);
		let resolve!: (value: number) => void;
		const request = query(
			'position',
			() =>
				new Promise<number>((done) => {
					resolve = done;
				}),
		);
		const pending$ = scope.asyncSignal$('pending', () => request(undefined));
		const rendered = mount(client.InlineGuardedStylePair, { left$: first$, right$: pending$ });
		try {
			await act(() => resolve(20));
			const hosts = rendered.findAll('section > div') as HTMLElement[];
			expect(hosts.map((host) => host.style.left)).toEqual(['10px', '20px', '10px']);
			rendered.update(client.InlineGuardedStylePair, { left$: replacement$, right$: replacement$ });
			expect(rendered.findAll('section > div')).toEqual(hosts);
			expect(hosts.map((host) => host.style.left)).toEqual(['30px', '30px', '30px']);
			expect(scope.inspect().nodes.find((node) => node.key === 'first')?.subscribers).toBe(0);
			flushSync(() => first$.set(11));
			expect(hosts.map((host) => host.style.left)).toEqual(['30px', '30px', '30px']);
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});

	it.each([client.GuardedStylePair, client.GuardedSpreadStylePair])(
		'restores accepted styles while a sibling suspends in a transition',
		async (Component) => {
			const scope = createScope({ scopeKey: 'held-style' });
			const left$ = scope.signal$<number | null>('left', 0);
			const key$ = scope.signal$('key', 'first');
			let resolve!: (value: number) => void;
			const request = query('position', (key: string) =>
				key === 'first'
					? Promise.resolve(10)
					: new Promise<number>((done) => {
							resolve = done;
						}),
			);
			const right$ = scope.asyncSignal$('right', () => request(key$.get()));
			const rendered = mount(Component, {
				left$,
				right$,
				leftStyle: Object.fromEntries([['left', left$]]),
				rightStyle: Object.fromEntries([['left', right$]]),
			});
			try {
				await act(() => {});
				const hosts = rendered.findAll('section > div') as HTMLElement[];
				expect(hosts.map((host) => host.style.left)).toEqual(['0px', '10px']);
				await act(() =>
					startTransition(() =>
						scope.batch(() => {
							left$.set(1);
							key$.set('second');
						}),
					),
				);
				expect(hosts.map((host) => host.style.left)).toEqual(['0px', '10px']);
				await act(() => left$.set(2));
				expect(hosts.map((host) => host.style.left)).toEqual(['0px', '10px']);
				await act(() => resolve(20));
				const current = rendered.findAll('section > div');
				expect(current).toHaveLength(2);
				expect(current[0]).toBe(hosts[0]);
				expect(current[1]).toBe(hosts[1]);
				expect(hosts.map((host) => host.style.left)).toEqual(['2px', '20px']);
			} finally {
				rendered.unmount();
				scope.dispose();
			}
		},
	);

	it('preserves hidden Activity content and catches up when shown', async () => {
		const scope = createScope({ scopeKey: 'hidden-style' });
		const left$ = scope.signal$<number | null>('left', 3);
		const rendered = mount(client.HiddenStyles, { left$, hidden: false });
		try {
			const host = rendered.find('div') as HTMLElement;
			const child = rendered.find('span');
			rendered.update(client.HiddenStyles, { left$, hidden: true });
			await act(() => left$.set(8));
			expect(host.style.display).toBe('none');
			rendered.update(client.HiddenStyles, { left$, hidden: false });
			expect(rendered.find('div')).toBe(host);
			expect(rendered.find('span')).toBe(child);
			expect(host.style.display).toBe('');
			expect(host.style.left).toBe('8px');
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});

	it('retains unitless, important and custom-property CSS rules on SVG hosts', () => {
		const scope = createScope({ scopeKey: 'css-values' });
		const opacity$ = scope.signal$('opacity', 0.5);
		const color$ = scope.signal$<string | null>('color', 'red !important');
		const rendered = mount(client.CssValueStyles, { opacity$, color$ });
		try {
			const host = rendered.find('svg') as SVGElement;
			expect(host.style.opacity).toBe('0.5');
			expect(host.style.color).toBe('red');
			expect(host.style.getPropertyPriority('color')).toBe('important');
			expect(host.style.getPropertyValue('--tint')).toBe('red');
			flushSync(() => {
				opacity$.set(0);
				color$.set(null);
			});
			expect(host.style.opacity).toBe('0');
			expect(host.style.color).toBe('');
			expect(host.style.getPropertyValue('--tint')).toBe('');
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});

	it('routes pending and retired style sources through their boundary', async () => {
		const scope = createScope({ scopeKey: 'pending-style' });
		let resolve!: (value: number) => void;
		const request = query(
			'position',
			() =>
				new Promise<number>((done) => {
					resolve = done;
				}),
		);
		const left$ = scope.asyncSignal$('left', () => request(undefined));
		const rendered = mount(client.GuardedStyles, { left$ });
		try {
			expect(rendered.container.textContent).toBe('waiting');
			await act(() => resolve(15));
			expect((rendered.find('div') as HTMLElement).style.left).toBe('15px');
			await act(() => scope.dispose());
			expect(rendered.container.textContent).toBe('failed');
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});

	it('retires bindings after an uncaught render error and supports a fresh render', () => {
		const scope = createScope({ scopeKey: 'aborted-style' });
		const first$ = scope.signal$<number | null>('first', 3);
		const second$ = scope.signal$<number | null>('second', 4);
		const rendered = mount(client.AbortableStyles, { left$: first$, fail: false });
		try {
			const host = rendered.find('div') as HTMLElement;
			expect(() => rendered.update(client.AbortableStyles, { left$: second$, fail: true })).toThrow(
				'discard styles',
			);
			expect(rendered.container.textContent).toBe('');
			expect(host.style.left).toBe('3px');
			flushSync(() => first$.set(8));
			expect(host.style.left).toBe('3px');
			flushSync(() => second$.set(20));
			expect(host.style.left).toBe('3px');
			rendered.update(client.AbortableStyles, { left$: second$, fail: false });
			expect((rendered.find('div') as HTMLElement).style.left).toBe('20px');
			flushSync(() => second$.set(21));
			expect((rendered.find('div') as HTMLElement).style.left).toBe('21px');
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});
	it('keeps later spread styles authoritative and restores the signal when removed', () => {
		const scope = createScope({ scopeKey: 'style-spread' });
		const left$ = scope.signal$<number | null>('left', 1);
		const rendered = mount(client.SpreadSignalStyles, { left$, override: true });
		try {
			const host = rendered.find('div') as HTMLElement;
			expect(host.style.left).toBe('42px');
			flushSync(() => left$.set(9));
			expect(host.style.left).toBe('42px');
			rendered.update(client.SpreadSignalStyles, { left$, override: false });
			expect(host.style.left).toBe('9px');
			flushSync(() => left$.set(11));
			expect(host.style.left).toBe('11px');
			const html = renderToString(server.SpreadSignalStyles, { left$, override: false }).html;
			const parsed = document.createElement('div');
			parsed.innerHTML = html;
			expect(parsed.querySelector('div')!.style.left).toBe('11px');
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});

	it('switches whole styles between objects, strings and null without removing children', () => {
		const scope = createScope({ scopeKey: 'whole-style' });
		const style$ = scope.signal$<CSSProperties | string | null>('style', { left: 4, color: 'red' });
		const rendered = mount(client.WholeSignalStyle, { style$ });
		try {
			const host = rendered.find('div') as HTMLElement;
			const child = rendered.find('span');
			expect(host.style.left).toBe('4px');
			flushSync(() => style$.set('right: 6px'));
			expect([host.style.left, host.style.color, host.style.right]).toEqual(['', '', '6px']);
			flushSync(() => style$.set(null));
			expect(host.style.cssText).toBe('');
			expect(rendered.find('span')).toBe(child);
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});
	it('updates local signal properties alongside spread styles', () => {
		const rendered = mount(client.LocalStyles, { style: { color: 'red', left: 99 } });
		try {
			const host = rendered.find('section > div') as HTMLElement;
			expect([host.style.left, host.style.right, host.style.color]).toEqual(['1px', '2px', 'red']);
			flushSync(() => (rendered.find('button') as HTMLButtonElement).click());
			expect([host.style.left, host.style.right, host.style.color]).toEqual([
				'10px',
				'20px',
				'red',
			]);
		} finally {
			rendered.unmount();
		}
	});

	it.each([client.SignalStyles, client.ReturnedSignalStyles, client.ConditionalSignalStyles])(
		'replaces and removes live style values',
		(Component) => {
			const scope = createScope({ scopeKey: 'dom-style' });
			const first$ = scope.signal$<number | null>('first', 3);
			const second$ = scope.signal$<number | null>('second', 4);
			const rendered = mount(Component, { left$: first$ });
			const host = rendered.find('div') as HTMLElement;
			try {
				expect(host.style.left).toBe('3px');
				flushSync(() => first$.set(8));
				expect(host.style.left).toBe('8px');
				rendered.update(Component, { left$: second$ });
				flushSync(() => first$.set(30));
				expect(host.style.left).toBe('4px');
				flushSync(() => second$.set(null));
				expect(host.style.left).toBe('');
				rendered.unmount();
				flushSync(() => second$.set(50));
				expect(host.style.left).toBe('');
			} finally {
				rendered.unmount();
				scope.dispose();
			}
		},
	);

	it('adopts server styles and catches up with live signals on the same host', () => {
		const scope = createScope({ scopeKey: 'dom-style-hydration' });
		const left$ = scope.signal$<number | null>('left', 7);
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = renderToString(server.SignalStyles, { left$ }).html;
		const host = container.querySelector('div')!;
		expect(host.style.left).toBe('7px');
		left$.set(12);
		const root = hydrateRoot(container, client.SignalStyles, { left$ });
		try {
			flushSync(() => {});
			expect(container.querySelector('div')).toBe(host);
			expect(host.style.left).toBe('12px');
			flushSync(() => left$.set(13));
			expect(host.style.left).toBe('13px');
		} finally {
			root.unmount();
			container.remove();
			scope.dispose();
		}

		// Native style-only scopes must observe facade aliases in the enclosing
		// component's owner, not create independent cells for each style block.
		const source = readFileSync(
			new URL('./_fixtures/signals-dom-bindings.tsrx', import.meta.url),
			'utf8',
		);
		for (const dev of [false, true]) {
			const options = {
				id: `/native-style-facade-${dev}.tsrx`,
				compileOptions: { nativeReads: true, dev, hmr: false },
				runtimeModules: {
					'octane/signals': Signals,
					'octane/signals/client': ClientSignals,
					'octane/signals/server': ServerSignals,
				},
			};
			const nativeServer = loadCompiledFixtureSource<typeof client>(source, {
				...options,
				mode: 'server',
			});
			const nativeClient = loadCompiledFixtureSource<typeof client>(source, {
				...options,
				mode: 'client',
			});
			const nativeContainer = document.createElement('div');
			document.body.appendChild(nativeContainer);
			nativeContainer.innerHTML = renderToString(nativeServer.FacadeStyleOwners).html;
			const rows = Array.from(nativeContainer.querySelectorAll<HTMLElement>('[data-style-row]'));
			const global = nativeContainer.querySelector<HTMLElement>('[data-style-global]')!;
			expect(rows.map((row) => row.style.left)).toEqual(['1px', '10px']);
			expect(global.style.left).toBe('4px');
			const nativeRoot = hydrateRoot(nativeContainer, nativeClient.FacadeStyleOwners);
			try {
				flushSync(() => {});
				const adoptedRows = nativeContainer.querySelectorAll('[data-style-row]');
				expect(adoptedRows).toHaveLength(2);
				expect(adoptedRows[0]).toBe(rows[0]);
				expect(adoptedRows[1]).toBe(rows[1]);
				expect(nativeContainer.querySelector('[data-style-global]')).toBe(global);
				flushSync(() => rows[0]!.querySelector('button')!.click());
				expect(rows.map((row) => row.style.left)).toEqual(['2px', '10px']);
				expect(rows.map((row) => row.style.getPropertyValue('--position'))).toEqual(['2', '10']);
				expect(global.style.left).toBe('4px');
				flushSync(() => global.querySelector('button')!.click());
				expect(global.style.left).toBe('5px');
				expect(rows.map((row) => row.style.left)).toEqual(['2px', '10px']);
			} finally {
				nativeRoot.unmount();
				nativeContainer.remove();
			}
		}
	});
});
