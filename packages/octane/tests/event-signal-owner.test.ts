import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it } from 'vitest';
import {
	act,
	createRoot,
	flushSync,
	hydrateRoot,
	startTransition,
	use,
	type Root,
} from '../src/index.js';
import { renderToString } from '../src/server/index.js';
import {
	ScopeDisposedError,
	createScope,
	currentSignalOwner,
	installSignalOwnerEnvironment,
	runWithSignalOwner,
	signal$,
	type SignalOwner,
} from '../src/signals/index.js';
import { HeldOwnerButton, OwnerBubble, OwnerButton } from './_fixtures/event-signal-owner.tsrx';
import { StrongOwnerButton } from './_fixtures/event-signal-owner-strong.tsrx';
import { loadServerFixture } from './_server-fixture.js';

function installCarrier(carrier: boolean) {
	if (!carrier) return undefined;
	const storage = new AsyncLocalStorage<SignalOwner>();
	return installSignalOwnerEnvironment({
		current: () => storage.getStore() ?? null,
		run: (owner, callback) => storage.run(owner, callback),
		capture: (owner) => (callback) => storage.run(owner, callback),
	});
}

describe('explicit native event ownership', () => {
	it('keeps a carrier without an active owner empty for plain native handlers', () => {
		const restore = installCarrier(true)!;
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		const seen: (SignalOwner | null)[] = [];
		try {
			root.render(OwnerButton, { invoke: () => seen.push(currentSignalOwner()) });
			container.querySelector('button')!.click();
			expect(seen).toEqual([null]);
		} finally {
			root.unmount();
			restore();
			container.remove();
		}
	});

	it.each(
		[false, true].flatMap((carrier) =>
			[false, true].flatMap((hydrate) =>
				[false, true].map((strong) => ({ carrier, hydrate, strong })),
			),
		),
	)(
		'retains explicit ownership for a plain button before signal bindings activate (%j)',
		(entry) => {
			const { carrier, hydrate, strong } = entry;
			const restore = installCarrier(carrier);
			const owner = createScope({ scopeKey: 'plain-event-owner' });
			const otherOwner = createScope({ scopeKey: 'other-event-owner' });
			const count$ = signal$(0, { key: 'g:plain-event-count' });
			const notifications: number[] = [];
			const stop = runWithSignalOwner(owner, () =>
				count$.subscribe(() => notifications.push(count$.get())),
			);
			const container = document.createElement('div');
			document.body.append(container);
			const Button = strong ? StrongOwnerButton : OwnerButton;
			let root: Root | undefined;
			const seen: (SignalOwner | null)[] = [];
			const errors: unknown[] = [];
			const props = {
				invoke() {
					seen.push(currentSignalOwner());
					try {
						count$.set(count$.get() + 1);
					} catch (error) {
						errors.push(error);
					}
				},
			};
			try {
				let serverButton: HTMLButtonElement | undefined;
				if (hydrate) {
					const server = loadServerFixture(
						`packages/octane/tests/_fixtures/event-signal-owner${strong ? '-strong' : ''}.tsrx`,
						{
							compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod', hmr: false },
						},
					);
					container.innerHTML = renderToString(
						strong ? server.StrongOwnerButton : server.OwnerButton,
						props,
					).html;
					serverButton = container.querySelector('button')!;
					root = runWithSignalOwner(owner, () => hydrateRoot(container, Button, props));
				} else {
					root = createRoot(container);
					runWithSignalOwner(owner, () => root!.render(Button, props));
				}
				const button = container.querySelector('button')!;
				if (hydrate) expect(button).toBe(serverButton);
				button.click();
				expect(seen).toEqual([owner]);
				expect(errors).toEqual([]);
				expect(notifications).toEqual([1]);
				expect(runWithSignalOwner(owner, () => count$.get())).toBe(1);
				expect(runWithSignalOwner(otherOwner, () => count$.get())).toBe(0);
				expect(currentSignalOwner()).toBeNull();
				runWithSignalOwner(otherOwner, () =>
					flushSync(() => root!.render(Button, { invoke: () => props.invoke() })),
				);
				expect(container.querySelector('button')).toBe(button);
				button.click();
				expect(seen).toEqual([owner, otherOwner]);
				expect(errors).toEqual([]);
				expect(runWithSignalOwner(otherOwner, () => count$.get())).toBe(1);
				expect(notifications).toEqual([1]);
				flushSync(() => root!.render(Button, { invoke: () => seen.push(currentSignalOwner()) }));
				expect(container.querySelector('button')).toBe(button);
				button.click();
				expect(seen).toEqual([owner, otherOwner, null]);
				root.unmount();
				root = undefined;
				expect(container.textContent).toBe('');
				stop();
				runWithSignalOwner(owner, () => count$.set(2));
				expect(notifications).toEqual([1]);
			} finally {
				root?.unmount();
				stop();
				owner.dispose();
				otherOwner.dispose();
				restore?.();
				container.remove();
			}
		},
	);

	it.each([false, true])(
		'keeps committed handler authority when a suspended replacement is abandoned (carrier=%s)',
		async (carrier) => {
			const restore = installCarrier(carrier);
			const owner = createScope({ scopeKey: 'held-event-owner' });
			const container = document.createElement('div');
			document.body.append(container);
			const root = createRoot(container);
			const seen: (SignalOwner | null | string)[] = [];
			let release!: () => void;
			const pending = new Promise<void>((resolve) => {
				release = resolve;
			});
			let waited = false;
			const invoke = () => seen.push(currentSignalOwner());
			try {
				runWithSignalOwner(owner, () => root.render(HeldOwnerButton, { invoke, wait() {} }));
				const button = container.querySelector('button')!;
				await act(() =>
					startTransition(() =>
						root.render(HeldOwnerButton, {
							invoke: () => seen.push('unpublished handler'),
							wait() {
								waited = true;
								use(pending);
							},
						}),
					),
				);
				expect(waited).toBe(true);
				expect(container.querySelector('button')).toBe(button);
				expect(container.querySelector('p')).toBeNull();
				button.click();
				expect(seen).toEqual([owner]);
				runWithSignalOwner(owner, () =>
					flushSync(() =>
						root.render(HeldOwnerButton, {
							invoke: () => invoke(),
							wait() {},
						}),
					),
				);
				await act(() => release());
				expect(container.querySelector('button')).toBe(button);
				button.click();
				expect(seen).toEqual([owner, owner]);
				expect(currentSignalOwner()).toBeNull();
			} finally {
				release();
				root.unmount();
				owner.dispose();
				restore?.();
				container.remove();
			}
		},
	);

	it.each([false, true])(
		'preserves retired explicit authority during native bubbling (carrier=%s)',
		(carrier) => {
			const restore = installCarrier(carrier);
			const owner = createScope({ scopeKey: 'removed-event-owner' });
			const count$ = signal$(0, { key: 'g:removed-event-count' });
			const container = document.createElement('div');
			document.body.append(container);
			let root: Root | undefined = createRoot(container);
			const seen: (SignalOwner | null)[] = [];
			const failures: unknown[] = [];
			try {
				runWithSignalOwner(owner, () =>
					root!.render(OwnerBubble, {
						remove() {
							seen.push(currentSignalOwner());
							owner.dispose();
							root!.unmount();
							root = undefined;
						},
						bubble() {
							seen.push(currentSignalOwner());
							try {
								count$.get();
							} catch (error) {
								failures.push(error);
							}
						},
					}),
				);
				container.querySelector('button')!.click();
				expect(seen).toEqual([owner, owner]);
				expect(failures).toHaveLength(1);
				expect(failures[0]).toBeInstanceOf(ScopeDisposedError);
				expect(container.textContent).toBe('');
				expect(currentSignalOwner()).toBeNull();
			} finally {
				root?.unmount();
				owner.dispose();
				restore?.();
				container.remove();
			}
		},
	);
});
