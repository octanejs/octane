import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createRoot,
	createElement,
	Activity,
	ViewTransition,
	flushSync,
	startTransition,
	type Root,
	type ViewTransitionInstance,
} from '../src/index.js';
import { act } from './_helpers';
import {
	installViewTransitionMocks,
	type ViewTransitionMocks,
} from './conformance/_helpers/view-transition-mocks';
import {
	ScopedEffectsApp,
	ScopeShapeApp,
	ScopedPortalApp,
	ScopedImageApp,
	ScopedPortalMoveApp,
	ForeignScopedPortalApp,
	ClippedScopeApp,
} from './_fixtures/view-transition-scoped-effects.tsrx';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

interface Capture {
	owner: Element | Document;
	oldNames: string[];
	update: () => void | Promise<void>;
	ready: ReturnType<typeof deferred>;
	finished: ReturnType<typeof deferred>;
	skipped: boolean;
}

describe('element-scoped ViewTransition commit lifetimes', () => {
	let mocks: ViewTransitionMocks;
	let container: HTMLDivElement;
	let root: Root;
	let originalElementStart: PropertyDescriptor | undefined;
	const captures: Capture[] = [];
	const events: string[] = [];
	const controls: Record<string, (value: string) => void> = {};
	let onEffect: ((id: string, value: string) => void) | undefined;

	beforeEach(async () => {
		mocks = installViewTransitionMocks();
		captures.length = 0;
		events.length = 0;
		for (const key of Object.keys(controls)) delete controls[key];
		const start = function (
			this: Element | Document,
			input: { update: () => void | Promise<void> },
		) {
			const ready = deferred();
			const finished = deferred();
			const capture: Capture = {
				owner: this,
				oldNames:
					this instanceof Element
						? [this, ...this.querySelectorAll('*')]
								.map((el) => (el as HTMLElement).style.getPropertyValue('view-transition-name'))
								.filter(Boolean)
						: [],
				update: input.update,
				ready,
				finished,
				skipped: false,
			};
			captures.push(capture);
			return {
				ready: ready.promise,
				finished: finished.promise,
				skipTransition() {
					capture.skipped = true;
					ready.resolve();
					finished.resolve();
				},
			};
		};
		originalElementStart = Object.getOwnPropertyDescriptor(
			Element.prototype,
			'startViewTransition',
		);
		Object.defineProperty(Element.prototype, 'startViewTransition', {
			configurable: true,
			value: start,
		});
		Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
		container = document.createElement('div');
		document.body.append(container);
		root = createRoot(container);
		onEffect = undefined;
		await act(() =>
			root.render(ScopedEffectsApp, {
				controls,
				events,
				onEffect: (id: string, value: string) => onEffect?.(id, value),
			}),
		);
		events.length = 0;
	});

	afterEach(async () => {
		flushSync(() => root.unmount());
		for (const capture of captures) {
			capture.ready.resolve();
			capture.finished.resolve();
		}
		await Promise.resolve();
		await Promise.resolve();
		container.remove();
		if (originalElementStart !== undefined)
			Object.defineProperty(Element.prototype, 'startViewTransition', originalElementStart);
		else Reflect.deleteProperty(Element.prototype, 'startViewTransition');
		mocks.restore();
		vi.restoreAllMocks();
	});

	const text = (id: string) => container.querySelector('[data-value="' + id + '"]')!.textContent;
	const owner = (id: string) => container.querySelector('[data-scope="' + id + '"]')!;
	const nextCapture = async (id: string, after = 0): Promise<Capture> => {
		let capture: Capture | undefined;
		await vi.waitFor(() => {
			capture = captures.slice(after).find((entry) => entry.owner === owner(id));
			expect(capture, `Missing capture for ${id}`).toBeDefined();
		});
		return capture!;
	};
	const updateAndReady = async (capture: Capture) => {
		await capture.update();
		capture.ready.resolve();
		await Promise.resolve();
		await Promise.resolve();
	};

	it('lets a sibling capture and finish its effects while another scope still animates', async () => {
		startTransition(() => controls.left('left changed'));
		const left = await nextCapture('left');
		await updateAndReady(left);
		expect(text('left')).toBe('left changed');
		expect(events).not.toContain('left:left changed');
		startTransition(() => controls.right('right changed'));
		const right = await nextCapture('right');
		await updateAndReady(right);
		expect(text('right')).toBe('right changed');
		expect(left.skipped).toBe(false);
		right.finished.resolve();
		await vi.waitFor(() => expect(events).toContain('right:right changed'));
		expect(events).not.toContain('left:left changed');
		left.finished.resolve();
		await vi.waitFor(() => expect(events).toContain('left:left changed'));
	});

	it('keeps the next scope behind an unfinished capture, then releases it before animation ends', async () => {
		startTransition(() => controls.left('left changed'));
		const left = await nextCapture('left');
		startTransition(() => controls.right('right changed'));
		await Promise.resolve();
		expect(text('left')).toBe('initial');
		expect(text('right')).toBe('initial');
		expect(captures.some((capture) => capture.owner === owner('right'))).toBe(false);
		await updateAndReady(left);
		const right = await nextCapture('right');
		await updateAndReady(right);
		expect(text('left')).toBe('left changed');
		expect(text('right')).toBe('right changed');
		expect(left.skipped).toBe(false);
	});
	it('activates an unchanged clipping scope when only a nested boundary changes', async () => {
		const scopeEvents: string[] = [];
		await act(() => root.render(ClippedScopeApp, { controls, events, scopeEvents }));
		startTransition(() => controls.child('changed'));
		const capture = await nextCapture('left');
		await updateAndReady(capture);
		expect(text('child')).toBe('changed');
		expect(scopeEvents).toEqual(['clipped']);
	});

	it('waits an atomic update that touches both a busy and a free scope', async () => {
		startTransition(() => controls.left('first'));
		const first = await nextCapture('left');
		await updateAndReady(first);
		const previous = captures.length;
		startTransition(() => {
			controls.left('second');
			controls.right('second');
		});
		await Promise.resolve();
		expect(text('left')).toBe('first');
		expect(text('right')).toBe('initial');
		expect(captures.slice(previous)).toEqual([]);
		first.finished.resolve();
		const left = await nextCapture('left', previous);
		const right = await nextCapture('right', previous);
		await Promise.all([left.update(), right.update()]);
		left.ready.resolve();
		right.ready.resolve();
		expect(text('left')).toBe('second');
		expect(text('right')).toBe('second');
	});

	it('captures a scope whose update a pre-render passive effect schedules', async () => {
		// A passive left pending after a sync commit runs at the start of the next
		// transition flush; the update it schedules renders in that same commit,
		// so its scope must join the batch rather than change without a capture.
		onEffect = (id, value) => {
			if (id === 'right' && value === 'trigger')
				startTransition(() => controls.right('from-effect'));
		};
		flushSync(() => controls.right('trigger'));
		startTransition(() => controls.left('left changed'));
		const left = await nextCapture('left');
		const right = await nextCapture('right');
		await Promise.all([left.update(), right.update()]);
		left.ready.resolve();
		right.ready.resolve();
		expect(text('left')).toBe('left changed');
		expect(text('right')).toBe('from-effect');
	});

	it.each([false, true])(
		'includes sibling work from a nested sync commit passive before a reveal (urgent=%s)',
		async (urgent) => {
			const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
			const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
			let resolve!: (value: string) => void;
			const promise = new Promise<string>((done) => {
				resolve = done;
			});
			await act(() =>
				root.render(ScopedEffectsApp, {
					controls,
					events,
					promise,
					onEffect: (id: string, value: string) => onEffect?.(id, value),
				}),
			);
			onEffect = (id, value) => {
				if (id !== 'outside') return;
				if (value === 'trigger') {
					flushSync(() => controls.outside('nested'));
					startTransition(() => controls.outside('queued'));
				} else if (value === 'nested') {
					if (urgent) controls.left('from nested effect');
					else startTransition(() => controls.left('from nested effect'));
				}
			};
			const waiting = container.querySelector('[data-value="right"]')!;
			flushSync(() => controls.outside('trigger'));
			clock.mockReturnValue(1000);
			resolve('revealed');
			if (urgent) {
				await vi.waitFor(() => expect(text('right')).toBe('revealed'));
				expect(captures).toEqual([]);
			} else {
				const right = await nextCapture('right');
				const left = await nextCapture('left');
				expect(text('left')).toBe('initial');
				expect(waiting.isConnected).toBe(true);
				expect(waiting.textContent).toBe('waiting');
				await Promise.all([left.update(), right.update()]);
				left.ready.resolve();
				right.ready.resolve();
			}
			expect(text('left')).toBe('from nested effect');
			expect(text('right')).toBe('revealed');
			expect(text('outside')).toBe('queued');
			expect(warning.mock.calls).toEqual(
				process.env.NODE_ENV === 'production'
					? []
					: [[expect.stringContaining('flushSync was called')]],
			);
		},
	);

	it('finishes a long finite passive cascade while revealing suspended content', async () => {
		const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
		const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		await act(() =>
			root.render(ScopedEffectsApp, {
				controls,
				events,
				promise,
				onEffect: (id: string, value: string) => onEffect?.(id, value),
			}),
		);
		// Independent widgets can hand a finite initialization sequence to each
		// other. The whole sequence must finish if animation preparation yields.
		onEffect = (id, value) => {
			if ((id !== 'left' && id !== 'outside') || !value.startsWith('step:')) return;
			const step = Number(value.slice(5));
			if (step < 64) {
				const next = id === 'left' ? 'outside' : 'left';
				flushSync(() => controls[next]('step:' + (step + 1)));
			} else {
				events.push('cascade complete');
			}
		};
		const waiting = container.querySelector('[data-value="right"]')!;
		flushSync(() => controls.outside('step:0'));
		clock.mockReturnValue(1000);
		resolve('revealed');
		const advanced = new Set<Capture>();
		await vi.waitFor(async () => {
			// Let the native callbacks proceed if a valid capture strategy chooses
			// to animate part of the sequence; only the eventual public result matters.
			const pending = captures.filter((capture) => !advanced.has(capture));
			for (const capture of pending) advanced.add(capture);
			await Promise.all(pending.map((capture) => capture.update()));
			for (const capture of pending) {
				capture.ready.resolve();
				capture.finished.resolve();
			}
			expect(events).toContain('cascade complete');
			expect(waiting.isConnected).toBe(false);
		});
		expect(text('left')).toBe('step:63');
		expect(text('outside')).toBe('step:64');
		expect(text('right')).toBe('revealed');
		expect(
			warning.mock.calls.every(
				([message]) => typeof message === 'string' && message.includes('flushSync was called'),
			),
		).toBe(true);
	});

	it('commits without animation when a pre-render passive adds urgent sibling work', async () => {
		onEffect = (id, value) => {
			if (id === 'right' && value === 'trigger') controls.right('urgent from effect');
		};
		flushSync(() => controls.right('trigger'));
		startTransition(() => controls.left('left changed'));
		await Promise.resolve();
		expect(captures).toEqual([]);
		expect(text('left')).toBe('left changed');
		expect(text('right')).toBe('urgent from effect');
	});

	it('runs unrelated urgent effects without skipping an animating scope', async () => {
		startTransition(() => controls.left('left changed'));
		const left = await nextCapture('left');
		await updateAndReady(left);
		controls.outside('urgent outside');
		await vi.waitFor(() => expect(events).toContain('outside:urgent outside'));
		expect(text('outside')).toBe('urgent outside');
		expect(left.skipped).toBe(false);
		expect(events).not.toContain('left:left changed');
	});

	it('skips only the scope affected by an urgent update after both captures complete', async () => {
		startTransition(() => controls.left('left changed'));
		const left = await nextCapture('left');
		await updateAndReady(left);
		startTransition(() => controls.right('right changed'));
		const right = await nextCapture('right');
		await updateAndReady(right);
		controls.left('urgent left');
		await vi.waitFor(() => expect(text('left')).toBe('urgent left'));
		expect(left.skipped).toBe(true);
		expect(right.skipped).toBe(false);
		await vi.waitFor(() => expect(events).toContain('left:urgent left'));
		expect(events).not.toContain('right:right changed');
	});
	it('reveals resolved Suspense in a sibling scope while the first scope animates', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		await act(() => root.render(ScopedEffectsApp, { controls, events, promise }));
		expect(text('right')).toBe('waiting');
		startTransition(() => controls.left('left changed'));
		const left = await nextCapture('left');
		await updateAndReady(left);
		resolve('revealed');
		const right = await nextCapture('right');
		await updateAndReady(right);
		expect(text('right')).toBe('revealed');
		expect(left.skipped).toBe(false);
		right.finished.resolve();
		await vi.waitFor(() => expect(events).toContain('right:revealed'));
		expect(events).not.toContain('left:left changed');
	});

	it('commits an invalid multiple-host scope without promoting it to a document animation', async () => {
		const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
		await act(() => root.render(ScopeShapeApp, { value: 'initial', shape: 'multiple' }));
		startTransition(() => root.render(ScopeShapeApp, { value: 'changed', shape: 'multiple' }));
		await vi.waitFor(() => expect(container.textContent).toBe('changedsecond host'));
		expect(captures).toEqual([]);
		const invalid = warning.mock.calls.filter(([message]) =>
			String(message).includes('requires exactly one host element'),
		);
		expect(invalid).toHaveLength(process.env.NODE_ENV === 'production' ? 0 : 1);
	});
	it.each([false, true])(
		'commits an invalid local scope without waiting for or skipping an unrelated animation (urgent=%s)',
		async (urgent) => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			await act(() => root.render(ScopedEffectsApp, { controls, events, invalidScope: true }));
			startTransition(() => controls.left('animating'));
			const left = await nextCapture('left');
			await updateAndReady(left);
			if (urgent) controls.invalid('changed');
			else startTransition(() => controls.invalid('changed'));
			await vi.waitFor(() => expect(text('invalid')).toBe('changed'));
			expect(left.skipped).toBe(false);
			expect(captures).toEqual([left]);
		},
	);
	it('does not diagnose a valid scope whose Activity is hidden', async () => {
		const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
		await act(() =>
			root.render(
				createElement(
					Activity,
					{ mode: 'hidden' },
					createElement(
						ViewTransition,
						{ scope: 'element' },
						createElement('section', null, 'hidden'),
					),
				),
			),
		);
		expect(
			warning.mock.calls.filter(([message]) =>
				String(message).includes('requires exactly one host element'),
			),
		).toEqual([]);
	});

	it('commits scope host replacement without capturing the disconnected old host', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await act(() => root.render(ScopeShapeApp, { value: 'initial', shape: 'one' }));
		const previousHost = container.querySelector('section')!;
		startTransition(() => root.render(ScopeShapeApp, { value: 'changed', shape: 'replacement' }));
		await vi.waitFor(() => expect(container.querySelector('article')?.textContent).toBe('changed'));
		expect(previousHost.isConnected).toBe(false);
		expect(captures).toEqual([]);
	});

	it('commits portal content outside a declared scope without giving it another animation owner', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const portal = document.createElement('div');
		document.body.append(portal);
		const clicks: string[] = [];
		try {
			await act(() => root.render(ScopedPortalApp, { value: 'initial', portal, clicks }));
			startTransition(() => root.render(ScopedPortalApp, { value: 'changed', portal, clicks }));
			await vi.waitFor(() => {
				if (captures.length === 0) expect(portal.textContent).toBe('changed');
				else
					expect(captures.every((capture) => capture.owner === owner('portal-parent'))).toBe(true);
			});
			await Promise.all(captures.map((capture) => capture.update()));
			for (const capture of captures) capture.ready.resolve();
			expect(portal.textContent).toBe('changed');
			expect(
				captures.some((capture) => capture.owner === document || capture.owner === portal),
			).toBe(false);
			portal.querySelector('button')!.click();
			expect(clicks).toEqual(['changed']);
		} finally {
			flushSync(() => root.unmount());
			portal.remove();
		}
	});
	it('publishes passive effects when the native scope API throws before creating a handle', async () => {
		Object.defineProperty(Element.prototype, 'startViewTransition', {
			configurable: true,
			value() {
				throw new Error('native scope unavailable');
			},
		});
		startTransition(() => controls.left('committed'));
		await vi.waitFor(() => expect(text('left')).toBe('committed'));
		await vi.waitFor(() => expect(events).toContain('left:committed'));
	});

	it.each([false, true])(
		'waits only for images inside participating scopes (inside=%s)',
		async (inside) => {
			vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false);
			await act(() => root.render(ScopedImageApp, { value: 'initial', inside }));
			startTransition(() => root.render(ScopedImageApp, { value: 'changed', inside }));
			const left = await nextCapture('left');
			let updated = false;
			const updating = Promise.resolve(left.update()).then(() => {
				updated = true;
			});
			await act(async () => {});
			expect(container.querySelector('img')!.getAttribute('src')).toBe('changed.png');
			expect(updated).toBe(!inside);
			container.querySelector('img')!.dispatchEvent(new Event('load'));
			await updating;
			left.ready.resolve();
		},
	);

	it('keeps the outgoing ref and callback on its old scope when a portal moves', async () => {
		const refs: Array<ViewTransitionInstance | null> = [];
		const exits: ViewTransitionInstance[] = [];
		const enters: ViewTransitionInstance[] = [];
		const targets: unknown[] = [];
		const animate = vi.spyOn(Element.prototype, 'animate');
		const hosts: Record<string, Element> = {};
		const callbacks = {
			hosts,
			onRef: (instance: ViewTransitionInstance | null) => {
				refs.push(instance);
			},
			onExit: (instance: ViewTransitionInstance) => {
				exits.push(instance);
				instance.old.animate({ opacity: [1, 0] }, 100);
				targets.push(animate.mock.contexts.at(-1));
			},
			onEnter: (instance: ViewTransitionInstance) => {
				enters.push(instance);
				instance.new.animate({ opacity: [0, 1] }, 100);
				targets.push(animate.mock.contexts.at(-1));
			},
		};
		await act(() => root.render(ScopedPortalMoveApp, { ...callbacks, value: 'initial' }));
		await act(() =>
			root.render(ScopedPortalMoveApp, { ...callbacks, value: 'initial', portal: hosts.left }),
		);
		const oldInstance = refs.at(-1)!;
		const leftOwner = owner('left');
		const rightOwner = owner('right');
		startTransition(() =>
			root.render(ScopedPortalMoveApp, { ...callbacks, value: 'moved', portal: hosts.right }),
		);
		const left = await nextCapture('left');
		const right = await nextCapture('right');
		await Promise.all([left.update(), right.update()]);
		const newInstance = refs.at(-1)!;
		expect(newInstance).not.toBe(oldInstance);
		left.ready.resolve();
		right.ready.resolve();
		await vi.waitFor(() => expect(exits).toEqual([oldInstance]));
		expect(enters).toEqual([newInstance]);
		expect(targets).toEqual([leftOwner, rightOwner]);
		expect(leftOwner.textContent).toBe('');
		expect(rightOwner.textContent).toBe('moved');
		left.finished.resolve();
		right.finished.resolve();
		await act(async () => {});
		await act(() =>
			root.render(ScopedPortalMoveApp, { ...callbacks, value: 'later', portal: hosts.right }),
		);
		expect(refs.at(-1)).toBe(newInstance);
		expect(rightOwner.textContent).toBe('later');
	});
	it.each([false, true])(
		'preserves existing destination boundaries when a separate root inserts a portal (moving=%s)',
		async (moving) => {
			const source = document.createElement('div');
			document.body.append(source);
			const portalRoot = createRoot(source);
			const scopeEvents: string[] = [];
			try {
				await act(() => root.render(ScopedEffectsApp, { controls, events, scopeEvents }));
				await act(() =>
					portalRoot.render(ForeignScopedPortalApp, {
						portal: moving ? owner('left') : null,
						value: 'before',
					}),
				);
				startTransition(() =>
					portalRoot.render(ForeignScopedPortalApp, { portal: owner('right'), value: 'after' }),
				);
				const right = await nextCapture('right');
				const left = moving ? await nextCapture('left') : undefined;
				expect.soft(right.oldNames).toEqual(['right-scope', 'item']);
				await Promise.all([left?.update(), right.update()]);
				left?.ready.resolve();
				right.ready.resolve();
				await vi.waitFor(() => expect(scopeEvents).toEqual(['update:right']));
				expect(owner('left').textContent).not.toContain('before');
				expect(owner('right').textContent).toContain('after');
				expect(captures.some((capture) => capture.owner === document)).toBe(false);
			} finally {
				flushSync(() => portalRoot.unmount());
				source.remove();
			}
		},
	);
	it.each([false, true])(
		'waits for a newly discovered busy portal destination and permits urgent interruption (urgent=%s)',
		async (urgent) => {
			const source = document.createElement('div');
			document.body.append(source);
			const portalRoot = createRoot(source);
			const scopeEvents: string[] = [];
			try {
				await act(() => root.render(ScopedEffectsApp, { controls, events, scopeEvents }));
				await act(() =>
					portalRoot.render(ForeignScopedPortalApp, { portal: owner('left'), value: 'before' }),
				);
				startTransition(() => controls.right('busy'));
				const busy = await nextCapture('right');
				await updateAndReady(busy);
				scopeEvents.length = 0;
				const previous = captures.length;
				let prepared = false;
				startTransition(() =>
					portalRoot.render(ForeignScopedPortalApp, {
						portal: owner('right'),
						value: 'after',
						onRender: () => {
							prepared = true;
						},
					}),
				);
				await vi.waitFor(() => expect(prepared).toBe(true));
				expect(owner('left').textContent).toContain('before');
				expect(owner('right').textContent).not.toContain('after');
				expect(captures.slice(previous)).toEqual([]);
				expect(busy.skipped).toBe(false);
				if (urgent) {
					controls.outside('urgent');
					await vi.waitFor(() => expect(text('outside')).toBe('urgent'));
					expect(owner('left').textContent).not.toContain('before');
					expect(owner('right').textContent).toContain('after');
					expect(busy.skipped).toBe(true);
					await Promise.resolve();
					expect(captures.slice(previous)).toEqual([]);
				} else {
					busy.finished.resolve();
					const left = await nextCapture('left', previous);
					const right = await nextCapture('right', previous);
					expect.soft(right.oldNames).toEqual(['right-scope', 'item']);
					await Promise.all([left.update(), right.update()]);
					left.ready.resolve();
					right.ready.resolve();
					await vi.waitFor(() => expect(scopeEvents).toEqual(['update:right']));
					expect(owner('left').textContent).not.toContain('before');
					expect(owner('right').textContent).toContain('after');
				}
			} finally {
				flushSync(() => portalRoot.unmount());
				source.remove();
			}
		},
	);
});
