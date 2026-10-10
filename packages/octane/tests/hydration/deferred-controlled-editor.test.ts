import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot, startTransition } from 'octane';
import { initializeHydrationEventCapture } from 'octane/hydration';
import { renderToString } from 'octane/server';
import { flushEffects, mount, nextTask } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import { LayoutReadinessApp } from '../_fixtures/view-transition-matching.tsrx';
import { installViewTransitionMocks } from '../conformance/_helpers/view-transition-mocks.js';
import * as client from './_fixtures/deferred-controlled-editor.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/hydration/_fixtures/deferred-controlled-editor.tsrx',
);

describe('deferred controlled editor', () => {
	let container: HTMLElement;
	let root: ReturnType<typeof hydrateRoot> | undefined;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		root?.unmount();
		root = undefined;
		container.remove();
	});

	it.each([
		{ adoptInLayout: false, send: false },
		{ adoptInLayout: false, send: true },
		{ adoptInLayout: true, send: false },
		{ adoptInLayout: true, send: true },
	])(
		'preserves the adopted draft through queued input and Send events (layout adoption: $adoptInLayout, Send: $send)',
		async ({ adoptInLayout, send }) => {
			container.innerHTML = renderToString(server.DeferredControlledEditor, { adoptInLayout }).html;
			const input = container.querySelector('input')!;
			const button = container.querySelector('button')!;
			const onAdopt = vi.fn();
			const onSend = vi.fn();
			const draft = 'A draft typed before hydration';

			initializeHydrationEventCapture(document);
			input.focus();
			input.value = 'A draft';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.value = draft;
			input.setSelectionRange(3, 8);
			input.dispatchEvent(new Event('input', { bubbles: true }));
			if (send) button.click();

			root = hydrateRoot(container, client.DeferredControlledEditor, {
				adoptInLayout,
				onAdopt,
				onSend,
			});
			flushSync(() => {});
			flushEffects();
			await act(() => {});

			expect(container.querySelector('input')).toBe(input);
			expect(container.querySelector('button')).toBe(button);
			if (adoptInLayout) {
				expect(onAdopt).toHaveBeenCalledWith(draft);
			} else {
				expect(onAdopt).not.toHaveBeenCalled();
			}
			expect(input.value).toBe(draft);
			expect(container.querySelector('#deferred-draft')!.textContent).toBe(draft);
			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([3, 8]);
			if (send) {
				expect(onSend).toHaveBeenCalledExactlyOnceWith(draft);
				expect(container.querySelector('#deferred-submitted')!.textContent).toBe(draft);
			} else {
				expect(onSend).not.toHaveBeenCalled();
				expect(container.querySelector('#deferred-submitted')!.textContent).toBe('');
			}
		},
	);

	it('restores a rejected edit dispatched by a layout effect before the flush returns', () => {
		const view = mount(client.LockedEditor, { dispatchInLayout: true });
		try {
			expect(view.container.querySelector('input')!.value).toBe('locked');
		} finally {
			view.unmount();
		}
	});

	it.each(['checkbox', 'radio', 'select'] as const)(
		'preserves a queued %s choice through layout adoption and Send',
		async (kind) => {
			container.innerHTML = renderToString(server.DeferredControlledChoice, { kind }).html;
			const control = container.querySelector<HTMLInputElement | HTMLSelectElement>(
				'#deferred-choice',
			)!;
			const first = container.querySelector<HTMLInputElement>('#deferred-first-choice');
			const button = container.querySelector('button')!;
			const changed: Array<[boolean, string]> = [];
			const sent: boolean[] = [];
			initializeHydrationEventCapture(document);
			if (kind === 'select') control.value = 'second';
			else (control as HTMLInputElement).checked = true;
			control.dispatchEvent(new Event('input', { bubbles: true }));
			control.dispatchEvent(new Event('input', { bubbles: true }));
			button.click();
			root = hydrateRoot(container, client.DeferredControlledChoice, {
				kind,
				onEdit: (value: boolean, type: string) => changed.push([value, type]),
				onSend: (value: boolean) => sent.push(value),
			});
			await flushEffects();
			expect(container.querySelector('#deferred-choice')).toBe(control);
			expect(container.querySelector('button')).toBe(button);
			expect(kind === 'select' ? control.value : (control as HTMLInputElement).checked).toBe(
				kind === 'select' ? 'second' : true,
			);
			if (first !== null) {
				expect(container.querySelector('#deferred-first-choice')).toBe(first);
				expect(first.checked).toBe(false);
			}
			expect(container.querySelector('output')!.textContent).toBe('second');
			expect(changed).toEqual([
				[true, 'input'],
				[true, 'input'],
			]);
			expect(sent).toEqual([true]);
			if (kind === 'select') control.value = 'first';
			else (control as HTMLInputElement).checked = false;
			control.dispatchEvent(new Event('change', { bubbles: true }));
			button.click();
			expect(container.querySelector('#deferred-choice')).toBe(control);
			expect(container.querySelector('output')!.textContent).toBe('first');
			expect(kind === 'select' ? control.value : (control as HTMLInputElement).checked).toBe(
				kind === 'select' ? 'first' : false,
			);
			if (first !== null) expect(first.checked).toBe(true);
			expect(changed).toEqual([
				[true, 'input'],
				[true, 'input'],
				[false, 'change'],
			]);
			expect(sent).toEqual([true, false]);
		},
	);

	it.each([false, true])(
		'restores the committed edit before dispatch returns while an animation is active (transition update: %s)',
		async (acceptInput) => {
			const transition = installViewTransitionMocks();
			let finish!: () => void;
			const finished = new Promise<void>((resolve) => (finish = resolve));
			let started!: () => void;
			const firstStarted = new Promise<void>((resolve) => (started = resolve));
			let first = true;
			(document as unknown as Record<string, unknown>).startViewTransition = (
				input: (() => unknown) | { update: () => unknown },
			) => {
				const update = typeof input === 'function' ? input : input.update;
				const ready = Promise.resolve(update());
				if (first) {
					first = false;
					started();
					return { ready, finished, skipTransition: finish };
				}
				return { ready, finished: ready, skipTransition() {} };
			};
			let setPage!: (value: number) => void;
			const heard: string[] = [];
			const editor = mount(client.AnimatedControlledEditor, {
				acceptInput,
				expose: (setter: typeof setPage) => (setPage = setter),
				onInput: (value: string) => heard.push(value),
			});
			const input = editor.container.querySelector('input')!;
			try {
				startTransition(() => setPage(1));
				await firstStarted;
				await nextTask();
				expect(editor.container.querySelector('p')!.textContent).toBe('First animated page');
				startTransition(() => setPage(2));
				input.value = 'typed during animation';
				input.dispatchEvent(new Event('input', { bubbles: true }));
				expect(heard).toEqual(['typed during animation']);
				expect(input.value).toBe('locked');
				expect(editor.container.querySelector('output')!.textContent).toBe('locked');
				expect(editor.container.querySelector('p')!.textContent).toBe('First animated page');
				finish();
				await act(async () => {});
				expect(editor.container.querySelector('input')).toBe(input);
				expect(input.value).toBe(acceptInput ? 'typed during animation' : 'locked');
				expect(editor.container.querySelector('output')!.textContent).toBe(input.value);
				expect(editor.container.querySelector('p')!.textContent).toBe('Second animated page');
			} finally {
				finish();
				try {
					await act(async () => {});
				} finally {
					editor.unmount();
					transition.restore();
				}
			}
		},
	);

	it('keeps the native edit visible to a handler that flushes before rejecting it', () => {
		const observed: string[] = [];
		const view = mount(client.LockedEditor, {
			onInput(event: Event) {
				flushSync(() => {});
				observed.push((event.currentTarget as HTMLInputElement).value);
			},
		});
		try {
			const input = view.container.querySelector('input')!;
			input.value = 'rejected edit';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			expect(observed).toEqual(['rejected edit']);
			expect(input.value).toBe('locked');
		} finally {
			view.unmount();
		}
	});

	it('keeps an accepted edit while another root finishes its deferred layout', async () => {
		const transition = installViewTransitionMocks();
		const transitionRoot = createRoot(container);
		let setDraft!: (value: string) => void;
		const editor = mount(client.PendingControlledEditor, {
			expose: (setter: typeof setDraft) => (setDraft = setter),
		});
		const input = editor.container.querySelector('input')!;
		const afterCapture: string[] = [];
		const draft = 'accepted while another root commits';
		(
			document as unknown as {
				startViewTransition: (options: { update: () => unknown }) => unknown;
			}
		).startViewTransition = (options) => {
			// Work queued after preparation belongs to the later root's commit.
			setDraft(draft);
			const ready = Promise.resolve(options.update());
			afterCapture.push(input.value);
			return { ready, finished: ready, skipTransition() {} };
		};
		try {
			const props = {
				events: [] as string[],
				requestFont: () => {},
				onLayout(text: string) {
					if (text === 'after') {
						input.value = draft;
						input.dispatchEvent(new Event('input', { bubbles: true }));
					}
				},
			};
			await act(() => transitionRoot.render(LayoutReadinessApp, { ...props, text: 'before' }));
			await act(() =>
				startTransition(() =>
					transitionRoot.render(LayoutReadinessApp, { ...props, text: 'after' }),
				),
			);
			expect(afterCapture).toEqual([draft]);
			expect(editor.container.querySelector('input')).toBe(input);
			expect(input.value).toBe(draft);
			expect(editor.container.querySelector('output')!.textContent).toBe(draft);
		} finally {
			transitionRoot.unmount();
			editor.unmount();
			transition.restore();
		}
	});

	it.each([
		'another control',
		'the same control',
		'a stopped-bubble control',
		'an earlier stopped edit',
		'a reused stopped event',
	])('restores outside edits after a layout-dispatched edit (%s)', async (target) => {
		const transition = installViewTransitionMocks();
		const transitionRoot = createRoot(container);
		let acceptInput = true;
		let setDraft!: (value: string) => void;
		const captured: string[] = [];
		const editor = mount(client.PendingControlledEditor, {
			expose: (setter: typeof setDraft) => (setDraft = setter),
			acceptInput: () => acceptInput,
			onCapture: (event: Event) => captured.push((event.currentTarget as HTMLInputElement).value),
		});
		const locked = mount(client.LockedEditor, {});
		const input = editor.container.querySelector('input')!;
		const stop = (event: Event) => event.stopPropagation();
		const earlier = target === 'an earlier stopped edit' || target === 'a reused stopped event';
		const stopped = target === 'a stopped-bubble control' || earlier;
		const reused =
			target === 'a reused stopped event' ? new Event('input', { bubbles: true }) : null;
		if (stopped) input.addEventListener('input', stop);
		const rejected =
			target === 'the same control' ? input : locked.container.querySelector('input')!;
		const draft = 'accepted by the layout';
		let finish!: () => void;
		const finished = new Promise<void>((resolve) => (finish = resolve));
		let started!: () => void;
		const entered = new Promise<void>((resolve) => (started = resolve));
		let firstReady!: Promise<unknown>;
		let first = true;
		(document as unknown as Record<string, unknown>).startViewTransition = (options: {
			update: () => unknown;
		}) => {
			if (first) {
				first = false;
				if (earlier) {
					input.value = 'older outside edit';
					input.dispatchEvent(reused ?? new Event('input', { bubbles: true }));
				}
				startTransition(() => setDraft(draft));
				firstReady = Promise.resolve(options.update());
				started();
				return { ready: firstReady, finished, skipTransition() {} };
			}
			const ready = Promise.resolve(options.update());
			return { ready, finished: ready, skipTransition() {} };
		};
		try {
			const props = {
				events: [] as string[],
				requestFont: () => {},
				onLayout(text: string) {
					if (text === 'after') {
						input.value = draft;
						input.dispatchEvent(reused ?? new Event('input', { bubbles: true }));
					}
				},
			};
			await act(() => transitionRoot.render(LayoutReadinessApp, { ...props, text: 'before' }));
			startTransition(() => transitionRoot.render(LayoutReadinessApp, { ...props, text: 'after' }));
			await entered;
			await firstReady;
			await nextTask();
			expect(captured).toEqual(earlier ? ['older outside edit', draft] : [draft]);
			expect(input.value).toBe(draft);
			// The live handler commits immediately; a stopped event leaves the
			// earlier accepted transition pending until the animation finishes.
			expect(editor.container.querySelector('output')!.textContent).toBe(stopped ? '' : draft);
			acceptInput = false;
			rejected.value = 'new rejected edit';
			rejected.dispatchEvent(new Event('input', { bubbles: true }));
			expect(rejected.value).toBe(target === 'the same control' ? draft : 'locked');
			if (target !== 'the same control') expect(input.value).toBe(draft);
			expect(editor.container.querySelector('output')!.textContent).toBe(stopped ? '' : draft);
			finish();
			await act(async () => {});
			expect(editor.container.querySelector('input')).toBe(input);
			expect(input.value).toBe(draft);
			expect(editor.container.querySelector('output')!.textContent).toBe(draft);
		} finally {
			finish();
			try {
				await act(async () => {});
			} finally {
				input.removeEventListener('input', stop);
				transitionRoot.unmount();
				editor.unmount();
				locked.unmount();
				transition.restore();
			}
		}
	});

	it('restores both controls when a stopped event is redispatched to another target', async () => {
		const captured: string[] = [];
		const props = {
			expose: () => {},
			acceptInput: () => false,
			onCapture: (event: Event) => captured.push((event.currentTarget as HTMLInputElement).value),
		};
		const first = mount(client.PendingControlledEditor, props);
		const second = mount(client.PendingControlledEditor, props);
		const inputs = [
			first.container.querySelector('input')!,
			second.container.querySelector('input')!,
		];
		const stop = (event: Event) => event.stopPropagation();
		const event = new Event('input', { bubbles: true });
		try {
			for (const [index, input] of inputs.entries()) {
				input.addEventListener('input', stop);
				input.value = `edit ${index}`;
				input.dispatchEvent(event);
			}
			expect(captured).toEqual(['edit 0', 'edit 1']);
			expect(inputs.map((input) => input.value)).toEqual(['edit 0', 'edit 1']);
			await Promise.resolve();
			expect(inputs.map((input) => input.value)).toEqual(['', '']);
			expect(first.container.querySelector('input')).toBe(inputs[0]);
			expect(second.container.querySelector('input')).toBe(inputs[1]);
		} finally {
			for (const input of inputs) input.removeEventListener('input', stop);
			first.unmount();
			second.unmount();
		}
	});

	it('finishes a stopped input after a later stopped native change', async () => {
		const captured: string[] = [];
		const editor = mount(client.PendingControlledEditor, {
			expose: () => {},
			acceptInput: () => false,
			onCapture: (event: Event) => captured.push(event.type),
		});
		const input = editor.container.querySelector('input')!;
		const stop = (event: Event) => event.stopPropagation();
		input.addEventListener('input', stop);
		input.addEventListener('change', stop);
		try {
			input.value = 'first edit';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.value = 'later edit';
			input.dispatchEvent(new Event('change', { bubbles: true }));
			expect(captured).toEqual(['input']);
			expect(input.value).toBe('later edit');
			await Promise.resolve();
			expect(editor.container.querySelector('input')).toBe(input);
			expect(input.value).toBe('');
		} finally {
			input.removeEventListener('input', stop);
			input.removeEventListener('change', stop);
			editor.unmount();
		}
	});

	it('commits a controlled edit after its capture handler dispatches a newer edit', () => {
		const captured: string[] = [];
		let input: HTMLInputElement;
		const editor = mount(client.PendingControlledEditor, {
			expose: () => {},
			onCapture() {
				captured.push(input.value);
				if (captured.length === 1) {
					input.value = 'nested edit';
					input.dispatchEvent(new Event('input', { bubbles: true }));
				}
			},
		});
		try {
			input = editor.container.querySelector('input')!;
			input.value = 'outer edit';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			expect(captured).toEqual(['outer edit', 'nested edit']);
			expect(editor.container.querySelector('input')).toBe(input);
			expect(input.value).toBe('nested edit');
			expect(editor.container.querySelector('output')!.textContent).toBe('nested edit');
		} finally {
			editor.unmount();
		}
	});

	it('restores a stopped input inside a closed shadow root', async () => {
		const outer = mount(client.PendingControlledEditor, { expose: () => {} });
		const host = document.createElement('div');
		outer.container.append(host);
		const shadow = host.attachShadow({ mode: 'closed' });
		const inner = createRoot(shadow);
		const captured: string[] = [];
		inner.render(client.PendingControlledEditor, {
			expose: () => {},
			acceptInput: () => false,
			onCapture: (event: Event) => captured.push((event.currentTarget as HTMLInputElement).value),
		});
		const input = shadow.querySelector('input')!;
		const stop = (event: Event) => event.stopPropagation();
		input.addEventListener('input', stop);
		try {
			input.value = 'shadow edit';
			input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			expect(captured).toEqual(['shadow edit']);
			expect(input.value).toBe('shadow edit');
			await Promise.resolve();
			expect(shadow.querySelector('input')).toBe(input);
			expect(input.value).toBe('');
		} finally {
			input.removeEventListener('input', stop);
			inner.unmount();
			outer.unmount();
		}
	});

	it.each([false, true])(
		'restores a rejected edit with cleanup root mount: %s',
		async (mountInCleanup) => {
			const transition = installViewTransitionMocks();
			const container = document.createElement('div');
			const foreignContainer = document.createElement('div');
			document.body.append(container, foreignContainer);
			const root = createRoot(container);
			const foreignRoot = createRoot(foreignContainer);
			const locked = mount(client.LockedEditor, {});
			let setDraft!: (value: string) => void;
			const pending = mount(client.PendingControlledEditor, {
				expose: (setter: typeof setDraft) => {
					setDraft = setter;
				},
			});
			const input = locked.container.querySelector('input')!;
			const pendingInput = pending.container.querySelector('input')!;
			const layouts: string[] = [];
			let mutations = 0;
			let armed = false;
			let release!: () => void;
			const fonts = {
				status: 'loaded',
				ready: new Promise<void>((resolve) => {
					release = resolve;
				}),
			};
			const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
			Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
			let started!: () => void;
			const nativeStarted = new Promise<void>((resolve) => {
				started = resolve;
			});
			(document as any).startViewTransition = (options: { update: () => unknown }) => {
				const ready = Promise.resolve(options.update());
				started();
				return { ready, finished: ready, skipTransition() {} };
			};
			const props = {
				requestFont() {
					fonts.status = 'loading';
				},
				layout(text: string) {
					layouts.push(text);
				},
				mutate() {
					if (!armed) return;
					armed = false;
					mutations++;
					if (mountInCleanup) foreignRoot.render(client.LockedEditor, {});
					startTransition(() => setDraft('pending accepted value'));
				},
			};
			try {
				await act(() => root.render(client.ResourceHold, { ...props, text: 'before' }));
				armed = true;
				startTransition(() => root.render(client.ResourceHold, { ...props, text: 'after' }));
				await nativeStarted;
				await nextTask();
				expect(mutations).toBe(1);
				expect(container.textContent).toBe('after');
				expect(layouts).toEqual(['before']);
				expect(foreignContainer.querySelector('input') !== null).toBe(mountInCleanup);
				expect(pending.container.querySelector('output')!.textContent).toBe('');
				input.value = 'outside rejected edit';
				input.dispatchEvent(new Event('input', { bubbles: true }));
				expect(locked.container.querySelector('input')).toBe(input);
				expect(input.value).toBe('locked');
				expect(layouts).toEqual(['before']);
				fonts.status = 'loaded';
				release();
				await act(async () => {});
				expect(layouts).toEqual(['before', 'after']);
				expect(pending.container.querySelector('input')).toBe(pendingInput);
				expect(pendingInput.value).toBe('pending accepted value');
				expect(input.value).toBe('locked');
			} finally {
				armed = false;
				fonts.status = 'loaded';
				release();
				try {
					await act(async () => {});
				} finally {
					root.unmount();
					foreignRoot.unmount();
					locked.unmount();
					pending.unmount();
					container.remove();
					foreignContainer.remove();
					if (previousFonts) Object.defineProperty(document, 'fonts', previousFonts);
					else Reflect.deleteProperty(document, 'fonts');
					transition.restore();
				}
			}
		},
	);

	it('preserves an accepted edit dispatched while another root first renders', async () => {
		const editor = mount(client.PendingControlledEditor, { expose() {} });
		const input = editor.container.querySelector('input')!;
		const observed: string[] = [];
		const draft = 'accepted during first render';
		root = createRoot(container);
		try {
			root.render(() => {
				input.value = draft;
				input.dispatchEvent(new Event('input', { bubbles: true }));
				observed.push(input.value);
				return 'mounted';
			});
			expect(observed).toEqual([draft]);
			await act(() => {});
			expect(container.textContent).toBe('mounted');
			expect(editor.container.querySelector('input')).toBe(input);
			expect(input.value).toBe(draft);
			expect(editor.container.querySelector('output')!.textContent).toBe(draft);
		} finally {
			editor.unmount();
		}
	});

	it('restores a surviving editor when the layout that dispatched its edit throws', () => {
		const editor = mount(client.LockedEditor, {});
		const input = editor.container.querySelector('input')!;
		const error = new Error('layout failed after dispatch');
		const onUncaughtError = vi.fn();
		root = createRoot(container, { onUncaughtError });
		try {
			flushSync(() =>
				root!.render(client.FailingLayout, {
					dispatch() {
						input.value = 'rejected edit';
						input.dispatchEvent(new Event('input', { bubbles: true }));
					},
					error,
				}),
			);
			expect(onUncaughtError).toHaveBeenCalledExactlyOnceWith(error);
			expect(input.isConnected).toBe(true);
			expect(input.value).toBe('locked');
		} finally {
			editor.unmount();
		}
	});

	it.each(['sync', 'scheduled'])(
		'preserves the render error and restores an edit in a surviving root (%s flush)',
		async (mode) => {
			const editor = mount(client.LockedEditor, {});
			const input = editor.container.querySelector('input')!;
			const error = new Error('render failed after layout dispatch');
			root = createRoot(container);
			try {
				const render = () =>
					root!.render(client.FailingLayout, {
						dispatch() {
							input.value = 'rejected edit';
							input.dispatchEvent(new Event('input', { bubbles: true }));
						},
						error,
						failDuringRender: true,
					});
				if (mode === 'sync') {
					expect(() => flushSync(render)).toThrow(error);
				} else {
					await expect(
						act(async () => {
							render();
							await Promise.resolve();
						}),
					).rejects.toThrow(error);
				}
				expect(input.isConnected).toBe(true);
				expect(input.value).toBe('locked');
			} finally {
				editor.unmount();
			}
		},
	);
});
