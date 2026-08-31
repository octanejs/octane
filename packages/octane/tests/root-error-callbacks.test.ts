// React 19 root option parity: createRoot/hydrateRoot accept onCaughtError and
// onUncaughtError (reporting callbacks; Octane passes only the error — there is
// no errorInfo/componentStack channel). Providing a callback changes REPORTING
// only:
//   - onCaughtError fires after a boundary (@try/@catch, <ErrorBoundary>)
//     claims an error from the render, passive-effect, or ref-attach channel.
//   - onUncaughtError replaces the default report for an error no boundary
//     claims (the flush rethrow for render errors, console.error for effect
//     channels). Recovery semantics are unchanged: an uncaught render error
//     still unmounts the failed root's tree.
// Roots created WITHOUT the options keep today's behavior byte-for-byte; the
// control tests below pin that.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'octane/server';
import { loadServerFixture } from './_server-fixture.js';
import {
	act,
	Activity,
	createRoot,
	createContext,
	createElement,
	ErrorBoundary,
	hydrateRoot,
	flushSync,
} from '../src/index.js';
import {
	CaughtHost,
	UncaughtHost,
	CaughtEffectHost,
	UncaughtEffectHost,
	MountThrower,
	ClickCounter,
	CleanupThrower,
	CleanupHost,
	CaughtCleanupHost,
	RefCleanupHost,
	ParentDrivenCaughtHost,
	LiteralCaughtParentError,
	DescriptorCaughtParentError,
	InlineCaughtParentError,
	PassthroughCaughtRoot,
	CaughtRenderFallback,
	LayoutResetCaughtHost,
	HiddenInlineCaughtHost,
	SuspenseReparkCaughtHost,
	InterruptedActivityCaughtHost,
	type ParentErrorProps,
	type HiddenCaughtActions,
	type ReparkCaughtActions,
	triggerRenderThrow,
	triggerEffectThrow,
	triggerCleanupThrowerRemoval,
} from './_fixtures/root-error-callbacks.tsrx';

function visibleText(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
	if (node instanceof HTMLElement && (node.hidden || node.style.display === 'none')) return '';
	return [...node.childNodes].map(visibleText).join('');
}

function observeCaughtCommit(container: HTMLElement) {
	const fallbackRef = { current: null as HTMLSpanElement | null };
	let layoutDone = false;
	const observedCommit: Array<{
		content: string;
		refConnected: boolean;
		layoutDone: boolean;
	}> = [];
	const onFallbackLayout = vi.fn(() => {
		layoutDone = true;
	});
	const onCaughtError = vi.fn((_reported: unknown) => {
		observedCommit.push({
			content: visibleText(container),
			refConnected: fallbackRef.current?.isConnected === true,
			layoutDone,
		});
	});
	const onUncaughtError = vi.fn();
	return { fallbackRef, onFallbackLayout, onCaughtError, onUncaughtError, observedCommit };
}

describe('root error callbacks — onCaughtError / onUncaughtError', () => {
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		container.remove();
		errSpy.mockRestore();
	});

	it('onCaughtError reports a direct root ErrorBoundary descriptor after its fallback commits', async () => {
		const failure = new Error('direct-root-boom');
		const reportedViews: Array<string | null> = [];
		const onCaughtError = vi.fn((_reported: unknown) => {
			reportedViews.push(container.textContent);
		});
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onCaughtError, onUncaughtError });
		try {
			await act(() => {
				root.render(
					createElement(ErrorBoundary, {
						fallback: 'caught',
						children: createElement(() => {
							throw failure;
						}),
					}),
				);
			});
			expect(container.textContent).toBe('caught');
			expect(onCaughtError).toHaveBeenCalledTimes(1);
			expect(onCaughtError.mock.calls[0][0]).toBe(failure);
			expect(reportedViews).toEqual(['caught']);
			expect(onUncaughtError).not.toHaveBeenCalled();
		} finally {
			root.unmount();
		}
	});

	describe.each([
		['literal ErrorBoundary', LiteralCaughtParentError],
		['createElement ErrorBoundary', DescriptorCaughtParentError],
		['inline @try/@catch', InlineCaughtParentError],
	] as const)('%s', (_name, boundary) => {
		it.each(['first mount', 'parent-owned state update'] as const)(
			'onCaughtError reports a %s error once after the fallback commits',
			async (entry) => {
				const error = new Error('parent-boom');
				const { fallbackRef, onFallbackLayout, onCaughtError, onUncaughtError, observedCommit } =
					observeCaughtCommit(container);
				const root = createRoot(container, { onCaughtError, onUncaughtError });
				try {
					await act(() => {
						root.render(ParentDrivenCaughtHost, {
							boundary,
							error,
							initiallyThrow: entry === 'first mount',
							fallbackRef,
							onFallbackLayout,
						});
					});
					if (entry === 'parent-owned state update') {
						expect(container.textContent).toBe('triggeroktail:ready');
						expect(onCaughtError).not.toHaveBeenCalled();
						await act(() => {
							container
								.querySelector<HTMLButtonElement>('[data-trigger="boundary-error"]')!
								.click();
						});
					}
					expect(container.textContent).toBe('triggercaught:parent-boomtail:failed');
					expect(onCaughtError).toHaveBeenCalledTimes(1);
					expect(onCaughtError.mock.calls[0][0]).toBe(error);
					// Reporting sees the completed fallback commit, including its ref
					// and layout effect, not a partially rendered parent replacement.
					expect(observedCommit).toEqual([
						{
							content: 'triggercaught:parent-boomtail:failed',
							refConnected: true,
							layoutDone: true,
						},
					]);
					expect(onUncaughtError).not.toHaveBeenCalled();
				} finally {
					root.unmount();
				}
			},
		);

		it('reports only the outer catch when an inner error fallback throws', async () => {
			const primaryError = new Error('primary-boom');
			const fallbackError = new Error('fallback-boom');
			const { fallbackRef, onFallbackLayout, onCaughtError, onUncaughtError, observedCommit } =
				observeCaughtCommit(container);
			const NestedBoundary = (props: ParentErrorProps) =>
				createElement(ErrorBoundary, {
					fallback: (error: unknown) =>
						createElement(CaughtRenderFallback, {
							error,
							fallbackRef: props.fallbackRef,
							onFallbackLayout: props.onFallbackLayout,
						}),
					children: createElement(boundary, { ...props, fallbackError }),
				});
			const root = createRoot(container, { onCaughtError, onUncaughtError });
			try {
				await act(() => {
					root.render(ParentDrivenCaughtHost, {
						boundary: NestedBoundary,
						error: primaryError,
						initiallyThrow: true,
						fallbackRef,
						onFallbackLayout,
					});
				});
				expect(container.textContent).toBe('triggercaught:fallback-boomtail:failed');
				expect(onCaughtError).toHaveBeenCalledTimes(1);
				expect(onCaughtError.mock.calls[0][0]).toBe(fallbackError);
				expect(observedCommit).toEqual([
					{
						content: 'triggercaught:fallback-boomtail:failed',
						refConnected: true,
						layoutDone: true,
					},
				]);
				expect(onUncaughtError).not.toHaveBeenCalled();
			} finally {
				root.unmount();
			}
		});
	});

	it('reports the committed error even when its fallback layout requests a reset', async () => {
		const error = new Error('reset-boom');
		const { fallbackRef, onFallbackLayout, onCaughtError, onUncaughtError, observedCommit } =
			observeCaughtCommit(container);
		const root = createRoot(container, { onCaughtError, onUncaughtError });
		try {
			await act(() => root.render(LayoutResetCaughtHost, { error, fallbackRef, onFallbackLayout }));
			expect(container.textContent).toBe('oktail:ready');
			expect(onCaughtError).toHaveBeenCalledTimes(1);
			expect(onCaughtError.mock.calls[0][0]).toBe(error);
			expect(observedCommit).toEqual([
				{ content: 'caught:reset-boomtail:failed', refConnected: true, layoutDone: true },
			]);
			expect(onUncaughtError).not.toHaveBeenCalled();
		} finally {
			root.unmount();
		}
	});

	it('does not report a caught initial render unmounted before its first commit', async () => {
		const onCaughtError = vi.fn();
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onCaughtError, onUncaughtError });
		await act(() => {
			root.render(ParentDrivenCaughtHost, {
				boundary: LiteralCaughtParentError,
				error: new Error('abandoned-boom'),
				initiallyThrow: true,
			});
			root.unmount();
		});
		expect(container.textContent).toBe('');
		expect(onCaughtError).not.toHaveBeenCalled();
		expect(onUncaughtError).not.toHaveBeenCalled();
	});

	it('does not report an inner catch abandoned by a later sibling error', async () => {
		const primaryError = new Error('primary-boom');
		const siblingError = new Error('sibling-boom');
		const { fallbackRef, onFallbackLayout, onCaughtError, onUncaughtError, observedCommit } =
			observeCaughtCommit(container);
		const root = createRoot(container, { onCaughtError, onUncaughtError });
		try {
			await act(() => {
				root.render(
					createElement(ErrorBoundary, {
						fallback: (error: unknown) =>
							createElement(CaughtRenderFallback, { error, fallbackRef, onFallbackLayout }),
						children: createElement(ParentDrivenCaughtHost, {
							boundary: LiteralCaughtParentError,
							error: primaryError,
							initiallyThrow: true,
							tailError: siblingError,
						}),
					}),
				);
			});
			expect(container.textContent).toBe('caught:sibling-boom');
			expect(onCaughtError).toHaveBeenCalledTimes(1);
			expect(onCaughtError.mock.calls[0][0]).toBe(siblingError);
			expect(observedCommit).toEqual([
				{ content: 'caught:sibling-boom', refConnected: true, layoutDone: true },
			]);
			expect(onUncaughtError).not.toHaveBeenCalled();
		} finally {
			root.unmount();
		}
	});

	it.each([
		['literal ErrorBoundary', LiteralCaughtParentError, 'LiteralCaughtParentError'],
		['passthrough @try', PassthroughCaughtRoot, 'PassthroughCaughtRoot'],
	] as const)(
		'onCaughtError reports a client %s hydration catch after its fallback commits',
		async (_kind, body, serverName) => {
			const server = loadServerFixture('packages/octane/tests/_fixtures/root-error-callbacks.tsrx');
			container.innerHTML = renderToString(server[serverName], { error: null }).html;
			expect(container.textContent).toBe('ok');
			const error = new Error('hydration-boom');
			const { fallbackRef, onFallbackLayout, onCaughtError, onUncaughtError, observedCommit } =
				observeCaughtCommit(container);
			let root: ReturnType<typeof hydrateRoot> | undefined;
			try {
				await act(() => {
					root = hydrateRoot(
						container,
						body,
						{ error, fallbackRef, onFallbackLayout },
						{ onCaughtError, onUncaughtError },
					);
				});
				expect(container.textContent).toBe('caught:hydration-boom');
				expect(onCaughtError).toHaveBeenCalledTimes(1);
				expect(onCaughtError.mock.calls[0][0]).toBe(error);
				expect(observedCommit).toEqual([
					{ content: 'caught:hydration-boom', refConnected: true, layoutDone: true },
				]);
				expect(onUncaughtError).not.toHaveBeenCalled();
			} finally {
				root?.unmount();
			}
		},
	);

	it('cancels hidden Activity catches and publishes live siblings once in order', async () => {
		const errors = Array.from({ length: 32 }, (_, index) => new Error(`activity-${index}`));
		const survivors = errors.filter((_, index) => index % 4 === 0);
		const onCaughtError = vi.fn();
		const onUncaughtError = vi.fn();
		const renderCaughtChildren = (current: readonly Error[]) =>
			current.map((error) =>
				createElement(DescriptorCaughtParentError, { key: error.message, error }),
			);
		const root = createRoot(container, { onCaughtError, onUncaughtError });
		try {
			await act(() => {
				root.render(
					createElement(Activity, { mode: 'hidden', children: renderCaughtChildren(errors) }),
				);
			});
			expect(onCaughtError).not.toHaveBeenCalled();

			await act(() => {
				root.render(
					createElement(Activity, { mode: 'hidden', children: renderCaughtChildren(survivors) }),
				);
			});
			expect(onCaughtError).not.toHaveBeenCalled();

			await act(() => {
				root.render(
					createElement(Activity, { mode: 'visible', children: renderCaughtChildren(survivors) }),
				);
			});
			expect(onCaughtError.mock.calls.map(([error]) => error)).toEqual(survivors);
			expect(onUncaughtError).not.toHaveBeenCalled();
		} finally {
			root.unmount();
		}
	});

	it('does not let stale cleanup cancel a later Suspense queue generation', async () => {
		const firstError = new Error('first-generation');
		const secondError = new Error('second-generation');
		let resolveInitial!: (value: string) => void;
		const initial = new Promise<string>((resolve) => {
			resolveInitial = resolve;
		});
		let resolvePending!: (value: string) => void;
		const pending = new Promise<string>((resolve) => {
			resolvePending = resolve;
		});
		const api: ReparkCaughtActions = { wait() {}, replace() {} };
		const onCaughtError = vi.fn();
		const onUncaughtError = vi.fn();
		let reparked = false;
		const onFallbackLayout = vi.fn(() => {
			if (reparked) return;
			reparked = true;
			// First hide the owner, then replace its catch while that new queue
			// generation is live and the first reveal action has not run yet.
			flushSync(() => api.wait());
			flushSync(() => api.replace());
		});
		const root = createRoot(container, { onCaughtError, onUncaughtError });
		try {
			await act(() => {
				root.render(SuspenseReparkCaughtHost, {
					api,
					firstError,
					secondError,
					initial,
					pending,
					onFallbackLayout,
				});
			});
			expect(visibleText(container)).toBe('outer loading');
			expect(onCaughtError).not.toHaveBeenCalled();

			// The first reveal deletes its queue, then its layout effect replaces
			// the caught subtree and suspends the same owner again before reports run.
			await act(() => resolveInitial('initial ready'));
			expect(visibleText(container)).toBe('outer loading');
			expect(onCaughtError).not.toHaveBeenCalled();

			await act(() => resolvePending('second ready'));
			expect(visibleText(container)).toBe('caught:second-generation|second ready');
			expect(onCaughtError.mock.calls.map(([error]) => error)).toEqual([secondError]);
			expect(onUncaughtError).not.toHaveBeenCalled();
		} finally {
			root.unmount();
		}
	});

	it.each([
		['reveal', 'same update'],
		['replacement', 'same update'],
		['unmount', 'same update'],
		['reveal', 'already hidden'],
		['replacement', 'already hidden'],
		['unmount', 'already hidden'],
	] as const)(
		'keeps a catch unreported under a suspended sibling before %s (%s)',
		async (outcome, timing) => {
			const error = new Error('hidden-boom');
			let resolveSibling!: (value: string) => void;
			const pending = new Promise<string>((resolve) => {
				resolveSibling = resolve;
			});
			const api: HiddenCaughtActions = { fail() {}, wait() {} };
			const { fallbackRef, onFallbackLayout, onCaughtError, onUncaughtError, observedCommit } =
				observeCaughtCommit(container);
			const root = createRoot(container, { onCaughtError, onUncaughtError });
			try {
				await act(() => {
					root.render(HiddenInlineCaughtHost, {
						api,
						error,
						initial: Promise.resolve('sibling initial'),
						pending,
						fallbackRef,
						onFallbackLayout,
					});
				});
				expect(visibleText(container)).toBe('ok|sibling initial');
				if (timing === 'already hidden') {
					await act(() => api.wait());
					expect(visibleText(container)).toBe('outer loading');
					await act(() => api.fail());
				} else {
					await act(() => {
						api.fail();
						api.wait();
					});
				}
				expect(visibleText(container)).toBe('outer loading');
				expect(onCaughtError).not.toHaveBeenCalled();
				expect(fallbackRef.current).toBeNull();
				expect(onFallbackLayout).not.toHaveBeenCalled();
				if (outcome === 'replacement') {
					await act(() => root.render(createElement('span', null, 'replacement')));
				} else if (outcome === 'unmount') {
					await act(() => root.unmount());
				}
				await act(() => resolveSibling('sibling ready'));
				if (outcome === 'reveal') {
					expect(visibleText(container)).toBe('caught:hidden-boom|sibling ready');
					expect(onCaughtError).toHaveBeenCalledTimes(1);
					expect(onCaughtError.mock.calls[0][0]).toBe(error);
					expect(observedCommit).toEqual([
						{
							content: 'caught:hidden-boom|sibling ready',
							refConnected: true,
							layoutDone: true,
						},
					]);
				} else {
					expect(visibleText(container)).toBe(outcome === 'replacement' ? 'replacement' : '');
					expect(onCaughtError).not.toHaveBeenCalled();
					expect(onFallbackLayout).not.toHaveBeenCalled();
				}
				expect(onUncaughtError).not.toHaveBeenCalled();
			} finally {
				root.unmount();
			}
		},
	);

	it.each(['reveal', 'replacement', 'unmount'] as const)(
		'keeps an Activity catch unreported while hidden before %s',
		async (outcome) => {
			const error = new Error('activity-boom');
			const { fallbackRef, onFallbackLayout, onCaughtError, onUncaughtError, observedCommit } =
				observeCaughtCommit(container);
			const renderCaughtChild = () =>
				createElement(DescriptorCaughtParentError, {
					error,
					fallbackRef,
					onFallbackLayout,
				});
			const root = createRoot(container, { onCaughtError, onUncaughtError });
			try {
				await act(() => {
					root.render(createElement(Activity, { mode: 'hidden', children: renderCaughtChild() }));
				});
				// Activity prerenders the fallback, but its visible commit has not
				// happened: neither refs, layout effects, nor reports may publish.
				expect(container.querySelector('[data-error-fallback]')).not.toBeNull();
				expect(visibleText(container)).toBe('');
				expect(onCaughtError).not.toHaveBeenCalled();
				expect(fallbackRef.current).toBeNull();
				expect(onFallbackLayout).not.toHaveBeenCalled();
				if (outcome === 'reveal') {
					await act(() => {
						root.render(
							createElement(Activity, { mode: 'visible', children: renderCaughtChild() }),
						);
					});
					expect(visibleText(container)).toBe('caught:activity-boom');
					expect(onCaughtError).toHaveBeenCalledTimes(1);
					expect(onCaughtError.mock.calls[0][0]).toBe(error);
					expect(observedCommit).toEqual([
						{ content: 'caught:activity-boom', refConnected: true, layoutDone: true },
					]);
				} else {
					if (outcome === 'replacement') {
						const replacement = createElement('span', null, 'replacement');
						await act(() => {
							root.render(createElement(Activity, { mode: 'hidden', children: replacement }));
						});
						// The Activity survives; replacing its hidden caught subtree must
						// cancel that subtree's report before the Activity later reveals.
						await act(() => {
							root.render(createElement(Activity, { mode: 'visible', children: replacement }));
						});
					} else {
						await act(() => root.unmount());
					}
					expect(visibleText(container)).toBe(outcome === 'replacement' ? 'replacement' : '');
					expect(onCaughtError).not.toHaveBeenCalled();
					expect(onFallbackLayout).not.toHaveBeenCalled();
				}
				expect(onUncaughtError).not.toHaveBeenCalled();
			} finally {
				root.unmount();
			}
		},
	);

	it.each([
		['inside', 'synchronous'],
		['inside', 'suspending'],
		['outside', 'synchronous'],
		['outside', 'suspending'],
	] as const)(
		'reports a hidden Activity catch once after an interrupted reveal with a sibling %s Activity (%s initial render)',
		async (placement, initialRender) => {
			const error = new Error('activity-interrupted');
			let resolveSibling!: (value: string) => void;
			const pending = new Promise<string>((resolve) => {
				resolveSibling = resolve;
			});
			const { fallbackRef, onFallbackLayout, onCaughtError, onUncaughtError, observedCommit } =
				observeCaughtCommit(container);
			const props = {
				error,
				fallbackRef,
				onFallbackLayout,
				siblingOutside: placement === 'outside',
			};
			const root = createRoot(container, { onCaughtError, onUncaughtError });
			try {
				// The hidden catch may finish synchronously or survive an initial
				// pending sibling; neither path publishes before a visible commit.
				await act(() => {
					root.render(InterruptedActivityCaughtHost, {
						...props,
						mode: 'hidden',
						promise: initialRender === 'suspending' ? Promise.resolve('initial') : null,
					});
				});
				expect(visibleText(container)).toBe(placement === 'inside' ? 'shell|' : 'shell||initial');
				expect(container.querySelector('[data-error-fallback]')).not.toBeNull();
				expect(fallbackRef.current).toBeNull();
				expect(onFallbackLayout).not.toHaveBeenCalled();
				expect(onCaughtError).not.toHaveBeenCalled();

				// The catch already exists in the hidden Activity. Showing it does
				// not commit that catch while its later sibling is still suspended.
				await act(() => {
					root.render(InterruptedActivityCaughtHost, {
						...props,
						mode: 'visible',
						promise: pending,
					});
				});
				expect(visibleText(container)).toBe('outer loading');
				expect(fallbackRef.current).toBeNull();
				expect(onFallbackLayout).not.toHaveBeenCalled();
				expect(onCaughtError).not.toHaveBeenCalled();

				await act(() => resolveSibling('ready'));
				expect(visibleText(container)).toBe('shell|caught:activity-interrupted|ready');
				expect(fallbackRef.current?.isConnected).toBe(true);
				expect(onFallbackLayout).toHaveBeenCalledTimes(1);
				expect(onCaughtError).toHaveBeenCalledTimes(1);
				expect(onCaughtError.mock.calls[0][0]).toBe(error);
				expect(observedCommit).toEqual([
					{
						content: 'shell|caught:activity-interrupted|ready',
						refConnected: true,
						layoutDone: true,
					},
				]);

				await act(() => {
					root.render(InterruptedActivityCaughtHost, {
						...props,
						mode: 'visible',
						promise: pending,
					});
				});
				expect(visibleText(container)).toBe('shell|caught:activity-interrupted|ready');
				expect(fallbackRef.current?.isConnected).toBe(true);
				expect(onCaughtError).toHaveBeenCalledTimes(1);
				expect(onUncaughtError).not.toHaveBeenCalled();
			} finally {
				await act(() => root.unmount());
			}
			expect(container.textContent).toBe('');
			expect(fallbackRef.current).toBeNull();
		},
	);

	it('onCaughtError fires once when a boundary claims a render error', async () => {
		const onCaughtError = vi.fn();
		const root = createRoot(container, { onCaughtError });
		await act(() => root.render(CaughtHost, {}));
		expect(container.textContent).toBe('ok');
		await act(() => triggerRenderThrow());
		expect(container.textContent).toBe('caught:render-boom');
		expect(onCaughtError).toHaveBeenCalledTimes(1);
		expect((onCaughtError.mock.calls[0][0] as Error).message).toBe('render-boom');
		root.unmount();
	});

	it('onCaughtError fires when a boundary claims a passive-effect error', async () => {
		const onCaughtError = vi.fn();
		const root = createRoot(container, { onCaughtError });
		await act(() => root.render(CaughtEffectHost, {}));
		expect(container.textContent).toBe('eok');
		await act(() => triggerEffectThrow());
		expect(container.textContent).toBe('effect-caught');
		expect(onCaughtError).toHaveBeenCalledTimes(1);
		expect((onCaughtError.mock.calls[0][0] as Error).message).toBe('effect-boom');
		root.unmount();
	});

	it('onCaughtError does NOT fire for an uncaught error', async () => {
		const onCaughtError = vi.fn();
		const root = createRoot(container, { onCaughtError });
		await act(() => root.render(UncaughtHost, {}));
		expect(() => flushSync(() => triggerRenderThrow())).toThrow('render-boom');
		expect(onCaughtError).not.toHaveBeenCalled();
	});

	it('onUncaughtError consumes an unclaimed render error; the tree still unmounts', async () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		await act(() => root.render(UncaughtHost, {}));
		expect(container.textContent).toBe('ok');
		expect(() => flushSync(() => triggerRenderThrow())).not.toThrow();
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('render-boom');
		// React 19 contract retained: known-broken UI never stays on screen.
		expect(container.textContent).toBe('');
	});

	it('onUncaughtError does NOT fire for a boundary-claimed error', async () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		await act(() => root.render(CaughtHost, {}));
		await act(() => triggerRenderThrow());
		expect(container.textContent).toBe('caught:render-boom');
		expect(onUncaughtError).not.toHaveBeenCalled();
		root.unmount();
	});

	it('onUncaughtError replaces console.error for an unclaimed passive-effect error', async () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		await act(() => root.render(UncaughtEffectHost, {}));
		errSpy.mockClear();
		await act(() => triggerEffectThrow());
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('effect-boom');
		expect(errSpy).not.toHaveBeenCalled();
		root.unmount();
	});

	it('a throwing callback is reported and does not corrupt recovery', async () => {
		const onUncaughtError = vi.fn(() => {
			throw new Error('handler-boom');
		});
		const root = createRoot(container, { onUncaughtError });
		await act(() => root.render(UncaughtHost, {}));
		expect(() => flushSync(() => triggerRenderThrow())).not.toThrow();
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		// The callback's own throw is reported through console.error, not rethrown.
		expect(errSpy).toHaveBeenCalled();
		expect(container.textContent).toBe('');
	});

	it('onUncaughtError consumes a SYNCHRONOUS first-mount error (first render() mounts sync)', () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		expect(() => root.render(MountThrower, {})).not.toThrow();
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('mount-boom');
		// The failed tree was discarded and the root stays reusable.
		expect(container.textContent).toBe('');
		expect(() => flushSync(() => root.render(CaughtHost, {}))).not.toThrow();
		expect(container.textContent).toBe('ok');
		root.unmount();
	});

	it('preserves an ordinary thrown object whose then getter throws', () => {
		const reason = {
			message: 'opaque render failure',
			get then(): never {
				throw new Error('then accessor is not readable');
			},
		};
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		try {
			root.render(() => {
				throw reason;
			});
			expect(onUncaughtError).toHaveBeenCalledTimes(1);
			// Compare identity without asking assertion formatting to inspect the
			// intentionally opaque value's properties.
			expect(onUncaughtError.mock.calls[0][0] === reason).toBe(true);
			expect(container.textContent).toBe('');
		} finally {
			root.unmount();
		}
	});

	it('control: a synchronous first-mount error without the option still throws', () => {
		const root = createRoot(container);
		expect(() => root.render(MountThrower, {})).toThrow('mount-boom');
		expect(container.textContent).toBe('');
	});

	it('onUncaughtError consumes a hydration render error (unowned root)', async () => {
		container.innerHTML = '<div>server</div>';
		const onUncaughtError = vi.fn();
		let root!: ReturnType<typeof hydrateRoot>;
		expect(() => {
			root = hydrateRoot(container, MountThrower, {}, { onUncaughtError });
		}).not.toThrow();
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('mount-boom');
		// The failed adoption was discarded; the returned root stays usable.
		expect(container.textContent).toBe('');
		await act(() => root.render(ClickCounter, {}));
		expect(container.textContent).toBe('n:0');
		// The recovered root keeps the container's event delegation — a click on
		// freshly rendered content must still reach its handler.
		await act(() => {
			(container.querySelector('#counter') as HTMLElement).click();
		});
		expect(container.textContent).toBe('n:1');
		root.unmount();
	});

	it('a consumed sync-mount error keeps event delegation on the recovered root', async () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		expect(() => root.render(MountThrower, {})).not.toThrow();
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		await act(() => root.render(ClickCounter, {}));
		await act(() => {
			(container.querySelector('#counter') as HTMLElement).click();
		});
		expect(container.textContent).toBe('n:1');
		root.unmount();
	});

	it('control: a hydration render error without the option still throws', () => {
		container.innerHTML = '<div>server</div>';
		expect(() => hydrateRoot(container, MountThrower, {})).toThrow('mount-boom');
	});

	it('onUncaughtError consumes a passive-cleanup throw during root unmount', async () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		await act(() => root.render(CleanupHost, {}));
		errSpy.mockClear();
		await act(() => root.unmount());
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('cleanup-boom');
		expect(errSpy).not.toHaveBeenCalled();
	});

	it('onCaughtError fires when a boundary claims a deletion-phase cleanup throw', async () => {
		const onCaughtError = vi.fn();
		const root = createRoot(container, { onCaughtError });
		await act(() => root.render(CaughtCleanupHost, {}));
		expect(container.querySelector('#ct')).not.toBeNull();
		await act(() => triggerCleanupThrowerRemoval());
		// The deletion's enclosing boundary claimed the error (existing routing)…
		expect(container.textContent).toBe('cleanup-caught');
		// …and the root's reporting callback observed the claim.
		expect(onCaughtError).toHaveBeenCalledTimes(1);
		expect((onCaughtError.mock.calls[0][0] as Error).message).toBe('cleanup-boom');
		root.unmount();
	});

	it('onUncaughtError consumes a ref-cleanup throw during root unmount', async () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		await act(() => root.render(RefCleanupHost, {}));
		errSpy.mockClear();
		await act(() => root.unmount());
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('ref-boom');
		expect(errSpy).not.toHaveBeenCalled();
	});

	it('onUncaughtError consumes a cleanup throw from a Provider children-dialect flip', async () => {
		// A Provider whose `children` prop flips between a value (element) and a
		// function tears the outgoing dialect down MID-RENDER through its own
		// teardown bracket — that path must thread the owner exactly like a
		// normal unmount.
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		const Ctx = createContext(0);
		const App = (props: any) =>
			createElement(Ctx as any, {
				value: 1,
				children: props.fn ? () => null : createElement(CleanupThrower as any, {}),
			});
		await act(() => root.render(App as any, { fn: false }));
		expect(container.textContent).toBe('ct');
		errSpy.mockClear();
		await act(() => root.render(App as any, { fn: true }));
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('cleanup-boom');
		expect(errSpy).not.toHaveBeenCalled();
		root.unmount();
	});

	it('control: teardown throws without the options keep console.error', async () => {
		const root = createRoot(container);
		await act(() => root.render(CleanupHost, {}));
		errSpy.mockClear();
		await act(() => root.unmount());
		expect(errSpy).toHaveBeenCalled();
		expect((errSpy.mock.calls[0][0] as Error).message).toBe('cleanup-boom');
	});

	// ── Controls: roots WITHOUT the options keep the existing contract ──────────

	it('control: without onUncaughtError the flush rethrows and the tree unmounts', async () => {
		const root = createRoot(container);
		await act(() => root.render(UncaughtHost, {}));
		expect(() => flushSync(() => triggerRenderThrow())).toThrow('render-boom');
		expect(container.textContent).toBe('');
	});

	it('control: without onUncaughtError an unclaimed effect error console.errors', async () => {
		const root = createRoot(container);
		await act(() => root.render(UncaughtEffectHost, {}));
		errSpy.mockClear();
		await act(() => triggerEffectThrow());
		expect(errSpy).toHaveBeenCalled();
		expect((errSpy.mock.calls[0][0] as Error).message).toBe('effect-boom');
		root.unmount();
	});
});
