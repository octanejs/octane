import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot, startTransition } from 'octane';
import { renderToString } from 'octane/server';
import { createResource, createScope, query } from 'octane/signals';
import type { CSSProperties } from 'octane/jsx-runtime';
import * as Signals from 'octane/signals';
import * as ClientSignals from 'octane/signals/client';
import * as ServerSignals from 'octane/signals/server';
import * as SignalRead from '../src/signals/read-protocol.js';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
import * as client from './_fixtures/signals-dom-bindings.tsrx';
import * as plainStyles from './_fixtures/plain-signal-styles.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/signals-dom-bindings.tsrx',
	{ runtimeModules: { 'octane/signals': Signals, 'octane/signals/server': ServerSignals } },
);

const plainStyleSource = readFileSync(
	'packages/octane/tests/_fixtures/plain-signal-styles.tsrx',
	'utf8',
);

describe('plain styles alongside native signal reads', () => {
	for (const compileOptions of [
		{ dev: true, hmr: false },
		{ dev: false, hmr: false },
		{ dev: false, hmr: false, strong: true },
	]) {
		const options = { id: '/plain-signal-styles.tsrx', compileOptions };
		const compiled = loadCompiledFixtureSource<typeof plainStyles>(plainStyleSource, {
			...options,
			mode: 'client',
		});
		const renderedServer = loadCompiledFixtureSource<typeof plainStyles>(plainStyleSource, {
			...options,
			mode: 'server',
		});

		it(`adopts plain styles and preserves edits across prop updates in ${JSON.stringify(compileOptions)}`, () => {
			const container = document.createElement('div');
			document.body.appendChild(container);
			container.innerHTML = renderToString(renderedServer.PlainStyles, {
				offset: 5,
				colored: true,
			}).html;
			const host = container.querySelector('div')!;
			const input = container.querySelector('input')!;
			const child = container.querySelector('span');
			input.value = 'typed before hydration';
			input.focus();
			input.setSelectionRange(3, 8);
			const root = hydrateRoot(container, compiled.PlainStyles, { offset: 5, colored: true });
			try {
				flushSync(() => root.render(compiled.PlainStyles, { offset: 12, colored: false }));
				expect(container.querySelector('div')).toBe(host);
				expect(container.querySelector('input')).toBe(input);
				expect(container.querySelector('span')).toBe(child);
				expect([host.style.display, host.style.marginTop, host.style.color]).toEqual([
					'flex',
					'12px',
					'',
				]);
				expect(input.value).toBe('typed before hydration');
				expect(document.activeElement).toBe(input);
				expect([input.selectionStart, input.selectionEnd]).toEqual([3, 8]);
				flushSync(() => root.render(compiled.PlainStyles, { offset: 0, colored: true }));
				expect([host.style.display, host.style.marginTop, host.style.color]).toEqual([
					'flex',
					'0px',
					'red',
				]);
			} finally {
				root.unmount();
				container.remove();
			}
		});

		it(`keeps computed and accessor reads live after source replacement in ${JSON.stringify(compileOptions)}`, () => {
			for (const hydration of [false, true])
				for (const name of [
					'ReadStyles',
					'GetterStyles',
					'AccessorStyles',
					'SpreadStyles',
				] as const) {
					const scope = createScope({ scopeKey: `plain-style-${name}` });
					const first$ = scope.signal$('first', 5);
					const next$ = scope.signal$('next', 12);
					const propsFor$ = (source$: typeof first$) => {
						const props = { source$, position: 0 };
						const read$ = () => source$.get();
						Object.defineProperty(props, 'position', { get: read$ });
						return props;
					};
					const Component = compiled[name];
					const container = document.createElement('div');
					document.body.appendChild(container);
					if (hydration)
						container.innerHTML = renderToString(renderedServer[name], propsFor$(first$)).html;
					const serverHost = container.querySelector('div');
					const root = hydration
						? hydrateRoot(container, Component, propsFor$(first$))
						: createRoot(container);
					if (!hydration) root.render(Component, propsFor$(first$));
					const host = container.querySelector('div')!;
					const child = container.querySelector('span');
					try {
						if (hydration) expect(host).toBe(serverHost);
						expect([host.style.display, host.style.marginTop]).toEqual(['flex', '5px']);
						flushSync(() => first$.set(8));
						expect(host.style.marginTop).toBe('8px');
						flushSync(() => root.render(Component, propsFor$(next$)));
						flushSync(() => first$.set(30));
						expect(host.style.marginTop).toBe('12px');
						flushSync(() => next$.set(15));
						expect(host.style.marginTop).toBe('15px');
						expect(container.querySelector('div')).toBe(host);
						expect(container.querySelector('span')).toBe(child);
						if (name === 'ReadStyles') expect(host.style.getPropertyValue('--position')).toBe('15');
						root.unmount();
						flushSync(() => next$.set(50));
						expect(host.style.marginTop).toBe('15px');
					} finally {
						root.unmount();
						container.remove();
						scope.dispose();
					}
				}
		});

		it(`retains scalar SVG and custom-property styles during hydration in ${JSON.stringify(compileOptions)}`, () => {
			const container = document.createElement('div');
			container.innerHTML = renderToString(renderedServer.PlainSvgStyles, { offset: 5 }).html;
			const host = container.querySelector('svg')!;
			const root = hydrateRoot(container, compiled.PlainSvgStyles, { offset: 5 });
			try {
				flushSync(() => root.render(compiled.PlainSvgStyles, { offset: 0 }));
				expect(container.querySelector('svg')).toBe(host);
				expect(host.namespaceURI).toBe('http://www.w3.org/2000/svg');
				expect([host.style.opacity, host.style.getPropertyValue('--position')]).toEqual(['0', '0']);
			} finally {
				root.unmount();
			}
		});

		it(`routes pending and failed scalar reads through their boundary in ${JSON.stringify(compileOptions)}`, async () => {
			for (const failed of [false, true]) {
				const scope = createScope({ scopeKey: `scalar-style-boundary-${failed}` });
				let resolve!: (value: number) => void;
				let reject!: (error: Error) => void;
				const request = query(
					'position',
					() =>
						new Promise<number>((done, fail) => {
							resolve = done;
							reject = fail;
						}),
				);
				const source$ = createResource(scope, 'position', () => request(undefined));
				const root = mount(compiled.GuardedReadStyles, { source$ });
				try {
					expect(root.find('p').textContent).toBe('waiting');
					await act(() => (failed ? reject(new Error('expected style failure')) : resolve(15)));
					if (failed) expect(root.find('p').textContent).toBe('failed');
					else expect((root.find('div') as HTMLElement).style.marginTop).toBe('15px');
				} finally {
					root.unmount();
					scope.dispose();
				}
			}
		});

		it(`reads handles returned by opaque get calls in ${JSON.stringify(compileOptions)}`, () => {
			for (const name of [
				'ReturnedHandleStyles',
				'ConditionalReturnedHandleStyles',
				'LogicalReturnedHandleStyles',
				'SequenceReturnedHandleStyles',
				'OptionalReturnedHandleStyles',
				'InheritedHandleStyles',
			] as const) {
				const scope = createScope({ scopeKey: 'returned-style-handle' });
				const source$ = scope.signal$('position', 5);
				const return$ = () => source$;
				const palette = Object.fromEntries([['get', return$]]) as { get: typeof return$ };
				const rendered = mount(compiled[name], { palette, enabled: true, source$ });
				try {
					const host = rendered.find('div') as HTMLElement;
					expect(host.style.marginTop).toBe('5px');
					flushSync(() => source$.set(9));
					expect(host.style.marginTop).toBe('9px');
					expect(rendered.find('div')).toBe(host);
				} finally {
					rendered.unmount();
					scope.dispose();
				}
			}
		});

		it(`replaces nested handle sources in ${JSON.stringify(compileOptions)}`, () => {
			const scope = createScope({ scopeKey: 'nested-style-handle' });
			const first$ = scope.signal$('first', 5);
			const next$ = scope.signal$('next', 12);
			const outer$ = scope.signal$('outer', first$);
			const rendered = mount(compiled.NestedHandleStyles, { outer$ });
			try {
				const host = rendered.find('div') as HTMLElement;
				expect(host.style.marginTop).toBe('5px');
				flushSync(() => first$.set(9));
				expect(host.style.marginTop).toBe('9px');
				flushSync(() => outer$.set(next$));
				expect(host.style.marginTop).toBe('12px');
				flushSync(() => first$.set(30));
				expect(host.style.marginTop).toBe('12px');
				flushSync(() => next$.set(15));
				expect(host.style.marginTop).toBe('15px');
				expect(rendered.find('div')).toBe(host);
				rendered.unmount();
				flushSync(() => next$.set(50));
				expect(host.style.marginTop).toBe('15px');
			} finally {
				rendered.unmount();
				scope.dispose();
			}
		});
	}
});

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
			const initial$ = createResource(scope, 'initial', () => request(undefined));
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
		const pending$ = createResource(scope, 'pending', () => request(undefined));
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
			const right$ = createResource(scope, 'right', () => request(key$.get()));
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
				expect(hosts.map((host) => host.style.left)).toEqual(['2px', '10px']);
				expect(key$.get()).toBe('first');
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
		const left$ = createResource(scope, 'left', () => request(undefined));
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

	it('still delivers typed input to a signal after its binding transition was superseded', async () => {
		const scope = createScope({ scopeKey: 'control-supersede' });
		const trans$ = scope.signal$('trans', 'trans-initial');
		const urgent$ = scope.signal$('urgent', 'urgent-initial');
		const initial = Promise.resolve('A') as any;
		initial.status = 'fulfilled';
		initial.value = 'A';
		const transP = (() => {
			let resolve!: (value: string) => void;
			const promise = new Promise<string>((accept) => (resolve = accept));
			return { promise, resolve };
		})();
		const urgentP = Promise.resolve('C') as any;
		urgentP.status = 'fulfilled';
		urgentP.value = 'C';
		const rendered = mount(client.SignalControlSupersede, {
			initialPromise: initial,
			transitionPromise: transP.promise,
			urgentPromise: urgentP,
			initial: 'plain',
			transition: trans$,
			urgent: urgent$,
		});
		try {
			await act(() => {});
			const input = rendered.find('#control') as HTMLInputElement;
			rendered.click('#swap-trans');
			expect(rendered.find('#control')).toBe(input);
			rendered.click('#swap-urgent');
			expect(rendered.find('#value').textContent).toBe('C');
			input.value = 'typed';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			expect(urgent$.get()).toBe('typed');
			await act(() => {
				transP.resolve('B');
			});
			expect(rendered.find('#value').textContent).toBe('C');
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
		// A fixed-field factory owns class and style as one native read, including
		// values passed into a compiled dynamic style function.
		for (const dev of [false, true]) {
			const source = `import * as styles from 'binding-styles';
export function Styled(props) @{ <div sx={styles[props.variant$](props.height$)}><span>child</span></div> }
export function Guarded(props) @{ @try { <Styled height$={props.height$} variant$={props.variant$} /> } @catch { <p>failed</p> } }`;
			const options = {
				id: `/native-projection-${dev}.tsrx`,
				compileOptions: {
					dev,
					hmr: false,
					knownAttributeSpreads: [
						{
							source: 'binding-styles',
							imported: '*',
							members: ['props'],
							fields: ['className', 'style', 'data-style-src'],
							style: 'object',
							jsxAttribute: 'sx',
						},
					],
				},
				runtimeModules: {
					'octane/internal/signal-read': SignalRead,
					'binding-styles': {
						props: (value: unknown) => value,
						doubled: (value: number | null) => ({
							className: 'double',
							style: { height: value === null ? null : value * 2 },
						}),
						height: (value: number | null) => ({
							className: value === null ? null : value === -1 ? 'invalid' : 'height',
							style:
								value === null
									? null
									: {
											height:
												value === -1
													? {
															toString() {
																throw new Error('invalid height');
															},
														}
													: value,
											opacity: 0.5,
										},
							'data-style-src': dev ? 'source' : undefined,
						}),
					},
				},
			};
			const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const scope = createScope({ scopeKey: `projection-${dev}` });
			const first$ = scope.signal$<number | null>('first', 4);
			const replacement$ = scope.signal$<number | null>('replacement', 12);
			const variant$ = scope.signal$('variant', 'height');
			const container = document.createElement('div');
			document.body.appendChild(container);
			container.innerHTML = renderToString(server.Styled, { height$: first$, variant$ }).html;
			const host = container.querySelector('div')!;
			const child = container.querySelector('span');
			expect([host.className, host.style.height, host.style.opacity]).toEqual([
				'height',
				'4px',
				'0.5',
			]);
			const root = hydrateRoot(container, client.Styled, { height$: first$, variant$ });
			try {
				flushSync(() => first$.set(8));
				expect(host.style.height).toBe('8px');
				expect(container.querySelector('div')).toBe(host);
				expect(container.querySelector('span')).toBe(child);
				expect(host.getAttribute('data-style-src')).toBe(dev ? 'source' : null);
				flushSync(() => variant$.set('doubled'));
				expect([host.className, host.style.height]).toEqual(['double', '16px']);
				flushSync(() => variant$.set('height'));
				expect([host.className, host.style.height]).toEqual(['height', '8px']);
				flushSync(() => root.render(client.Styled, { height$: replacement$, variant$ }));
				flushSync(() => first$.set(99));
				expect(host.style.height).toBe('12px');
				flushSync(() => replacement$.set(null));
				expect(host.getAttribute('class')).toBeNull();
				expect(host.style.cssText).toBe('');
				root.unmount();
				flushSync(() => replacement$.set(100));
				expect(host.style.cssText).toBe('');
				const guarded = mount(client.Guarded, { height$: replacement$, variant$ });
				try {
					const retained = guarded.find('div') as HTMLElement;
					expect(retained.style.height).toBe('100px');
					flushSync(() => replacement$.set(-1));
					expect(guarded.container.textContent).toBe('failed');
					expect(retained.className).toBe('height');
					expect(retained.style.height).toBe('100px');
				} finally {
					guarded.unmount();
				}
			} finally {
				root.unmount();
				container.remove();
				scope.dispose();
			}
		}
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
			'packages/octane/tests/_fixtures/signals-dom-bindings.tsrx',
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
