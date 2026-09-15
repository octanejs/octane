import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from './_helpers';
import {
	addTransitionType,
	createRoot,
	flushSync,
	startTransition,
	type Root,
} from '../src/index.js';
import {
	installViewTransitionMocks,
	type ViewTransitionMocks,
} from './conformance/_helpers/view-transition-mocks';
import {
	HandlerRelayApp,
	DeferredOwnershipApp,
	LayoutReadinessApp,
	MatchingApp,
	MultiHostLayoutApp,
	NestedShareApp,
} from './_fixtures/view-transition-matching.tsrx';

function holdFonts() {
	let resolve!: () => void;
	const fonts = {
		status: 'loaded',
		ready: new Promise<void>((done) => {
			resolve = done;
		}),
	};
	const previous = Object.getOwnPropertyDescriptor(document, 'fonts');
	Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
	return {
		request: () => {
			fonts.status = 'loading';
		},
		release: () => {
			fonts.status = 'loaded';
			resolve();
		},
		restore: () => {
			resolve();
			if (previous === undefined) delete (document as any).fonts;
			else Object.defineProperty(document, 'fonts', previous);
		},
	};
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('ViewTransition activation and matching', () => {
	let mocks: ViewTransitionMocks;
	let root: Root;
	let container: HTMLDivElement;
	let captures: Array<{ old: string[]; next: string[] }>;
	const capture = () =>
		Array.from(container.querySelectorAll<HTMLElement>('[data-vt-target]'), (el) =>
			el.style.getPropertyValue('view-transition-class'),
		);

	beforeEach(() => {
		mocks = installViewTransitionMocks();
		container = document.createElement('div');
		document.body.append(container);
		root = createRoot(container);
		captures = [];
		(document as any).startViewTransition = (input: (() => void) | { update: () => void }) => {
			const old = capture();
			(typeof input === 'function' ? input : input.update)();
			captures.push({ old, next: capture() });
			return { ready: Promise.resolve(), finished: Promise.resolve(), skipTransition() {} };
		};
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		mocks.restore();
	});

	it('combines classes from every active transition type', async () => {
		const transition = { update: { forward: 'slide', slow: 'slow' } };
		await act(() => root.render(MatchingApp, { text: 'before', transition }));
		await act(() =>
			startTransition(() => {
				addTransitionType('forward');
				addTransitionType('slow');
				root.render(MatchingApp, { text: 'after', transition });
			}),
		);
		expect(captures.at(-1)?.next).toEqual(['slide slow']);
	});

	it('falls back to the boundary default when an event map has no matching type', async () => {
		const transition = { default: 'fallback', update: { back: 'reverse' } };
		await act(() => root.render(MatchingApp, { text: 'before', transition }));
		await act(() =>
			startTransition(() => {
				addTransitionType('forward');
				root.render(MatchingApp, { text: 'after', transition });
			}),
		);
		expect(captures.at(-1)?.next).toEqual(['fallback']);
	});

	it('lets any matching none type suppress the update callback', async () => {
		const calls: string[] = [];
		const transition = {
			update: { forward: 'slide', silent: 'none' },
			onUpdate: () => {
				calls.push('updated');
			},
		};
		await act(() => root.render(MatchingApp, { text: 'before', transition }));
		await act(() =>
			startTransition(() => {
				addTransitionType('forward');
				addTransitionType('silent');
				root.render(MatchingApp, { text: 'after', transition });
			}),
		);
		expect(container.textContent).toBe('afterafter');
		expect(calls).toEqual([]);
	});

	it('uses the update class despite different exit and share classes', async () => {
		const transition = { name: 'target', update: 'pulse', exit: 'leave', share: 'morph' };
		await act(() => root.render(MatchingApp, { text: 'before', transition }));
		await act(() => startTransition(() => root.render(MatchingApp, { text: 'after', transition })));
		expect(captures.at(-1)?.next).toEqual(['pulse']);
	});

	it('restores authored transition styles after an update', async () => {
		const transition = { update: 'pulse' };
		const style = { 'view-transition-name': 'authored', 'view-transition-class': 'authored-class' };
		await act(() => root.render(MatchingApp, { text: 'before', transition, style }));
		await act(() =>
			startTransition(() => root.render(MatchingApp, { text: 'after', transition, style })),
		);
		const target = container.querySelector<HTMLElement>('[data-vt-target]')!;
		expect(target.style.getPropertyValue('view-transition-name')).toBe('authored');
		expect(target.style.getPropertyValue('view-transition-class')).toBe('authored-class');
	});

	it('shares with a named descendant of a newly entering boundary', async () => {
		const events: string[] = [];
		const handlers = {
			onShare: () => {
				events.push('share');
			},
			onExit: () => {
				events.push('exit');
			},
		};
		await act(() => root.render(NestedShareApp, { page: false, ...handlers }));
		await act(() =>
			startTransition(() => root.render(NestedShareApp, { page: true, ...handlers })),
		);
		expect(container.textContent).toBe('New hero');
		expect(events).toEqual(['share']);
		expect(captures.at(-1)?.next).toEqual(['hero-share']);
	});

	it('detects layout movement in a later top-level host', async () => {
		const measure = Element.prototype.getBoundingClientRect;
		Element.prototype.getBoundingClientRect = function () {
			return this.getAttribute('data-vt-target') === 'second'
				? new DOMRect(0, Number(document.getElementById('layout-driver')?.textContent), 80, 20)
				: measure.call(this);
		};
		const events: string[] = [];
		const onUpdate = () => {
			events.push('update');
		};
		await act(() => root.render(MultiHostLayoutApp, { offset: '0', onUpdate }));
		await act(() =>
			startTransition(() => root.render(MultiHostLayoutApp, { offset: '40', onUpdate })),
		);
		expect(container.querySelector('#layout-driver')?.textContent).toBe('40');
		expect(events).toEqual(['update']);
	});

	it('suppresses ordinary offscreen enter and exit callbacks', async () => {
		Element.prototype.getBoundingClientRect = () => new DOMRect(-1000, -1000, 50, 20);
		const events: string[] = [];
		const transition = {
			onEnter: () => {
				events.push('enter');
			},
			onExit: () => {
				events.push('exit');
			},
		};
		await act(() => root.render(MatchingApp, { text: 'before', show: false, transition }));
		await act(() =>
			startTransition(() => root.render(MatchingApp, { text: 'after', show: true, transition })),
		);
		await act(() =>
			startTransition(() => root.render(MatchingApp, { text: 'done', show: false, transition })),
		);
		expect(container.textContent).toBe('done');
		expect(events).toEqual([]);
	});

	it('relays handler-only parent activations despite an unrelated none default', async () => {
		const events: string[] = [];
		const handlers = {
			onEnter: () => {
				events.push('enter');
			},
			onExit: () => {
				events.push('exit');
			},
		};
		await act(() => root.render(HandlerRelayApp, { show: false, ...handlers }));
		await act(() =>
			startTransition(() => root.render(HandlerRelayApp, { show: true, ...handlers })),
		);
		await act(() =>
			startTransition(() => root.render(HandlerRelayApp, { show: false, ...handlers })),
		);
		expect(events).toEqual(['enter', 'exit']);
	});

	it('finishes mutation cleanup before fonts load and attaches refs before deferred layout effects', async () => {
		const events: string[] = [];
		let resolveFont!: () => void;
		const fonts = {
			status: 'loaded',
			ready: new Promise<void>((resolve) => {
				resolveFont = resolve;
			}),
		};
		const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
		Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
		(document as any).startViewTransition = (
			input: (() => unknown) | { update: () => unknown },
		) => {
			const ready = Promise.resolve((typeof input === 'function' ? input : input.update)());
			return { ready, updateCallbackDone: ready, finished: ready, skipTransition() {} };
		};
		const requestFont = () => {
			fonts.status = 'loading';
		};
		try {
			await act(() => root.render(LayoutReadinessApp, { text: 'before', events, requestFont }));
			events.length = 0;
			let pendingEvents: string[] = [];
			let pendingText = '';
			await act(async () => {
				startTransition(() =>
					root.render(LayoutReadinessApp, { text: 'after', events, requestFont }),
				);
				await new Promise<void>((resolve) => setTimeout(resolve, 0));
				pendingEvents = events.slice();
				pendingText = container.textContent!;
				fonts.status = 'loaded';
				resolveFont();
			});
			expect(pendingText).toBe('after');
			expect(pendingEvents).toEqual(['insertion:after', 'destroy:before', 'detach:before']);
			expect(events).toEqual([
				'insertion:after',
				'destroy:before',
				'detach:before',
				'attach:after',
				'layout:after',
			]);
		} finally {
			resolveFont();
			if (previousFonts !== undefined) Object.defineProperty(document, 'fonts', previousFonts);
			else delete (document as any).fonts;
		}
	});

	it('completes deferred layout once before an urgent update interrupts the font wait', async () => {
		const events: string[] = [];
		let resolveFont!: () => void;
		const fonts = {
			status: 'loaded',
			ready: new Promise<void>((resolve) => {
				resolveFont = resolve;
			}),
		};
		const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
		Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
		(document as any).startViewTransition = (
			input: (() => unknown) | { update: () => unknown },
		) => {
			const ready = Promise.resolve((typeof input === 'function' ? input : input.update)());
			return { ready, updateCallbackDone: ready, finished: ready, skipTransition() {} };
		};
		const requestFont = () => {
			fonts.status = 'loading';
		};
		try {
			await act(() => root.render(LayoutReadinessApp, { text: 'before', events, requestFont }));
			events.length = 0;
			let afterUrgent: string[] = [];
			await act(async () => {
				startTransition(() =>
					root.render(LayoutReadinessApp, { text: 'after', events, requestFont }),
				);
				await new Promise<void>((resolve) => setTimeout(resolve, 0));
				flushSync(() => root.render(LayoutReadinessApp, { text: 'urgent', events, requestFont }));
				afterUrgent = events.slice();
				fonts.status = 'loaded';
				resolveFont();
			});
			expect(container.textContent).toBe('urgent');
			expect(afterUrgent).toEqual([
				'insertion:after',
				'destroy:before',
				'detach:before',
				'attach:after',
				'layout:after',
				'insertion:urgent',
				'destroy:after',
				'detach:after',
				'attach:urgent',
				'layout:urgent',
			]);
			expect(events).toEqual(afterUrgent);
		} finally {
			resolveFont();
			if (previousFonts !== undefined) Object.defineProperty(document, 'fonts', previousFonts);
			else delete (document as any).fonts;
		}
	});

	it('keeps a later foreign-root transition queued through the first animation', async () => {
		const fonts = holdFonts();
		const otherContainer = document.createElement('div');
		document.body.append(otherContainer);
		const otherRoot = createRoot(otherContainer);
		let finish!: () => void;
		const firstFinished = new Promise<void>((resolve) => {
			finish = resolve;
		});
		let calls = 0;
		(document as any).startViewTransition = (input: { update: () => unknown }) => {
			const first = ++calls === 1;
			const ready = Promise.resolve(input.update());
			return { ready, finished: first ? firstFinished : ready, skipTransition() {} };
		};
		try {
			await act(() => {
				root.render(LayoutReadinessApp, { text: 'before', events: [], requestFont: fonts.request });
				otherRoot.render(MatchingApp, { text: 'zero', transition: {} });
			});
			let duringFirst = '';
			await act(async () => {
				startTransition(() =>
					root.render(LayoutReadinessApp, {
						text: 'after',
						events: [],
						requestFont: fonts.request,
					}),
				);
				await nextTask();
				startTransition(() => otherRoot.render(MatchingApp, { text: 'later', transition: {} }));
				await nextTask();
				fonts.release();
				await nextTask();
				duringFirst = otherContainer.textContent!;
				finish();
			});
			expect(duringFirst).toBe('zerozero');
			expect(otherContainer.textContent).toBe('laterlater');
			expect(calls).toBe(2);
		} finally {
			finish();
			fonts.restore();
			otherRoot.unmount();
			otherContainer.remove();
		}
	});

	it('holds passive effects from layout cascades until the native animation finishes', async () => {
		const events: string[] = [];
		let finish!: () => void;
		const finished = new Promise<void>((resolve) => {
			finish = resolve;
		});
		(document as any).startViewTransition = (input: { update: () => unknown }) => {
			const ready = Promise.resolve(input.update());
			return { ready, finished, skipTransition() {} };
		};
		await act(() => root.render(DeferredOwnershipApp, { generation: 0, cascade: true, events }));
		events.length = 0;
		let duringAnimation: string[] = [];
		await act(async () => {
			startTransition(() =>
				root.render(DeferredOwnershipApp, { generation: 1, cascade: true, events }),
			);
			await nextTask();
			duringAnimation = events.slice();
			finish();
		});
		expect(container.textContent).toBe('11');
		expect(duringAnimation).toEqual(['layout:1:0', 'layout:1:1']);
		expect(events).toContain('passive:1:1');
	});

	it('runs deferred deletion subscription cleanup synchronously on public root unmount', async () => {
		const fonts = holdFonts();
		const events: string[] = [];
		(document as any).startViewTransition = (input: { update: () => unknown }) => {
			const ready = Promise.resolve(input.update());
			return { ready, finished: ready, skipTransition() {} };
		};
		try {
			await act(() =>
				root.render(DeferredOwnershipApp, {
					generation: 0,
					subscription: true,
					events,
					requestFont: fonts.request,
				}),
			);
			events.length = 0;
			let afterUnmount: string[] = [];
			await act(async () => {
				startTransition(() =>
					root.render(DeferredOwnershipApp, {
						generation: 1,
						subscription: false,
						events,
						requestFont: fonts.request,
					}),
				);
				await nextTask();
				root.unmount();
				afterUnmount = events.slice();
				fonts.release();
			});
			expect(afterUnmount).toContain('unsubscribe');
			expect(events.filter((event) => event === 'unsubscribe')).toHaveLength(1);
		} finally {
			fonts.restore();
		}
	});

	it('completes pending layout before a synchronous root replacement mutates its DOM', async () => {
		const fonts = holdFonts();
		const observations: string[] = [];
		const props = {
			events: [],
			requestFont: fonts.request,
			onLayout: (text: string) => observations.push(text + ':' + container.textContent),
		};
		(document as any).startViewTransition = (input: { update: () => unknown }) => {
			const ready = Promise.resolve(input.update());
			return { ready, finished: ready, skipTransition() {} };
		};
		try {
			await act(() => root.render(LayoutReadinessApp, { ...props, text: 'before' }));
			observations.length = 0;
			await act(async () => {
				startTransition(() => root.render(LayoutReadinessApp, { ...props, text: 'after' }));
				await nextTask();
				root.render(MatchingApp, { text: 'replacement', transition: {} });
				fonts.release();
			});
			expect(observations).toEqual(['after:after']);
			expect(container.textContent).toBe('replacementreplacement');
		} finally {
			fonts.restore();
		}
	});
});
