import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
	act,
	createElement,
	createRoot,
	ViewTransition,
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
import {
	HeldOwnerButton,
	OwnerBubble,
	OwnerButton,
	OwnerCapture,
} from './_fixtures/event-signal-owner.tsrx';
import { StrongOwnerButton } from './_fixtures/event-signal-owner-strong.tsrx';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
import { installViewTransitionMocks } from './conformance/_helpers/view-transition-mocks.js';

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

// Disable HMR through the public compiler so both runtime modes exercise
// compiler-lifted block handlers rather than development closure replacements.
const bundleSource = readFileSync(
	'packages/octane/tests/_fixtures/event-signal-owner.tsrx',
	'utf8',
);
const bundleModules = [false, true].map((strong) =>
	loadCompiledFixtureSource<typeof import('./_fixtures/event-signal-owner.tsrx')>(
		(strong ? "'use strong';\n" : '') + bundleSource,
		{
			id: `event-signal-owner-bundles-${strong ? 'strong' : 'normal'}.tsrx`,
			mode: 'client',
			compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod', hmr: false },
		},
	),
);
const [bundles, strongBundles] = bundleModules;
const [serverBundles, strongServerBundles] = [false, true].map((strong) =>
	loadCompiledFixtureSource<typeof import('./_fixtures/event-signal-owner.tsrx')>(
		(strong ? "'use strong';\n" : '') + bundleSource,
		{
			id: `event-signal-owner-bundles-${strong ? 'strong' : 'normal'}.tsrx`,
			mode: 'server',
			compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod', hmr: false },
		},
	),
);
const bundleCases = [
	{
		kind: 'zero',
		Button: bundles.BundleOwner0,
		ServerButton: serverBundles.BundleOwner0,
		args: [],
	},
	{
		kind: 'one',
		Button: bundles.BundleOwner1,
		ServerButton: serverBundles.BundleOwner1,
		args: ['value'],
	},
	{
		kind: 'two',
		Button: bundles.BundleOwner2,
		ServerButton: serverBundles.BundleOwner2,
		args: ['value', 'other'],
	},
	{
		kind: 'many',
		Button: bundles.BundleOwnerN,
		ServerButton: serverBundles.BundleOwnerN,
		args: ['value', 'other', 'last'],
	},
	{
		kind: 'event-one',
		Button: bundles.BundleOwner1e,
		ServerButton: serverBundles.BundleOwner1e,
		args: ['click'],
	},
	{
		kind: 'event-two',
		Button: bundles.BundleOwner2e,
		ServerButton: serverBundles.BundleOwner2e,
		args: ['click', 'value'],
	},
	{
		kind: 'strong-zero',
		Button: strongBundles.BundleOwner0,
		ServerButton: strongServerBundles.BundleOwner0,
		args: [],
	},
	{
		kind: 'strong-event-two',
		Button: strongBundles.BundleOwner2e,
		ServerButton: strongServerBundles.BundleOwner2e,
		args: ['click', 'value'],
	},
];

function bundleProps(invoke: (...values: unknown[]) => void, wait = () => {}) {
	return { invoke, value: 'value', other: 'other', last: 'last', wait };
}

describe('explicit ownership of compiler-lifted native handlers', () => {
	it.each(bundleCases.flatMap((entry) => [false, true].map((hydrate) => ({ ...entry, hydrate }))))(
		'refreshes ownership even when callback and captures are unchanged ($kind, hydrate=$hydrate)',
		({ Button, ServerButton, args, hydrate }) => {
			const owner = createScope({ scopeKey: 'unchanged-first-owner' });
			const otherOwner = createScope({ scopeKey: 'unchanged-other-owner' });
			const container = document.createElement('div');
			document.body.append(container);
			let root: Root | undefined;
			const seen: { owner: SignalOwner | null; values: unknown[] }[] = [];
			const invoke = (...values: unknown[]) => seen.push({ owner: currentSignalOwner(), values });
			const props = bundleProps(invoke);
			try {
				let adopted: Element | null = null;
				if (hydrate) {
					container.innerHTML = renderToString(ServerButton, props).html;
					adopted = container.querySelector('button');
				}
				runWithSignalOwner(owner, () => {
					if (hydrate) root = hydrateRoot(container, Button, props);
					else {
						root = createRoot(container);
						root!.render(Button, props);
					}
				});
				if (hydrate) expect(container.querySelector('button')).toBe(adopted);
				const button = container.querySelector('button')!;
				button.click();
				runWithSignalOwner(otherOwner, () =>
					flushSync(() => root!.render(Button, { ...props, wait: () => {} })),
				);
				expect(container.querySelector('button')).toBe(button);
				button.click();
				flushSync(() => root!.render(Button, { ...props, wait: () => {} }));
				button.click();
				expect(seen).toEqual([
					{ owner, values: args },
					{ owner: otherOwner, values: args },
					{ owner: null, values: args },
				]);
				expect(currentSignalOwner()).toBeNull();
			} finally {
				root?.unmount();
				expect(container.childNodes.length).toBe(0);
				owner.dispose();
				otherOwner.dispose();
				container.remove();
			}
		},
	);
	it.each(
		bundleCases.flatMap((entry) =>
			[false, true].map((initialOwner) => ({ ...entry, initialOwner })),
		),
	)(
		'publishes changed bundle captures with their precise ownership (%s)',
		({ Button, args, initialOwner }) => {
			const owner = createScope({ scopeKey: 'bundle-first-owner' });
			const otherOwner = createScope({ scopeKey: 'bundle-other-owner' });
			const container = document.createElement('div');
			document.body.append(container);
			const root = createRoot(container);
			const seen: { owner: SignalOwner | null; values: unknown[] }[] = [];
			const callback = (...values: unknown[]) => seen.push({ owner: currentSignalOwner(), values });
			try {
				if (initialOwner)
					runWithSignalOwner(owner, () => root.render(Button, bundleProps(callback)));
				else root.render(Button, bundleProps(callback));
				const button = container.querySelector('button')!;
				button.click();
				runWithSignalOwner(otherOwner, () =>
					flushSync(() =>
						root.render(
							Button,
							bundleProps((...values) => callback(...values)),
						),
					),
				);
				expect(container.querySelector('button')).toBe(button);
				button.click();
				flushSync(() =>
					root.render(
						Button,
						bundleProps((...values) => callback(...values)),
					),
				);
				button.click();
				expect(seen).toEqual([
					{ owner: initialOwner ? owner : null, values: args },
					{ owner: otherOwner, values: args },
					{ owner: null, values: args },
				]);
				expect(currentSignalOwner()).toBeNull();
			} finally {
				root.unmount();
				expect(container.childNodes.length).toBe(0);
				owner.dispose();
				otherOwner.dispose();
				container.remove();
			}
		},
	);

	it.each(bundleCases)(
		'keeps a bundle and its authority committed across abandoned preparation ($kind)',
		async ({ Button, args }) => {
			const owner = createScope({ scopeKey: 'held-bundle-owner' });
			const otherOwner = createScope({ scopeKey: 'held-bundle-other-owner' });
			const container = document.createElement('div');
			document.body.append(container);
			const root = createRoot(container);
			const seen: { owner: SignalOwner | null; values: unknown[] }[] = [];
			let release!: () => void;
			const pending = new Promise<void>((resolve) => {
				release = resolve;
			});
			let waited = false;
			const callback = (...values: unknown[]) => seen.push({ owner: currentSignalOwner(), values });
			try {
				runWithSignalOwner(owner, () => root.render(Button, bundleProps(callback)));
				const button = container.querySelector('button')!;
				await act(() =>
					runWithSignalOwner(otherOwner, () =>
						startTransition(() =>
							root.render(
								Button,
								bundleProps(
									() => {
										throw new Error('unpublished bundle');
									},
									() => {
										waited = true;
										use(pending);
									},
								),
							),
						),
					),
				);
				expect(waited).toBe(true);
				expect(container.querySelector('button')).toBe(button);
				expect(container.querySelector('p')).toBeNull();
				button.click();
				expect(seen).toEqual([{ owner, values: args }]);
				runWithSignalOwner(owner, () =>
					flushSync(() =>
						root.render(
							Button,
							bundleProps((...values) => callback(...values)),
						),
					),
				);
				await act(() => release());
				button.click();
				expect(seen).toEqual([
					{ owner, values: args },
					{ owner, values: args },
				]);
				expect(container.querySelector('button')).toBe(button);
			} finally {
				release();
				root.unmount();
				owner.dispose();
				otherOwner.dispose();
				container.remove();
			}
		},
	);

	it.each([
		{ kind: 'bare-bubble', View: OwnerBubble },
		{ kind: 'bundle-bubble', View: bundles.BundleOwnerBubble },
		{ kind: 'bare-capture', View: OwnerCapture },
		{ kind: 'bundle-capture', View: bundles.BundleOwnerCapture },
		{ kind: 'strong-bundle-bubble', View: strongBundles.BundleOwnerBubble },
		{ kind: 'strong-bundle-capture', View: strongBundles.BundleOwnerCapture },
	])(
		'keeps queued handler authority when an earlier slot publishes a replacement ($kind)',
		({ View }) => {
			const owner = createScope({ scopeKey: 'queued-event-owner' });
			const otherOwner = createScope({ scopeKey: 'queued-event-other-owner' });
			const container = document.createElement('div');
			document.body.append(container);
			const root = createRoot(container);
			const seen: { callback: string; owner: SignalOwner | null }[] = [];
			try {
				runWithSignalOwner(owner, () =>
					root.render(View, {
						remove() {
							seen.push({ callback: 'target', owner: currentSignalOwner() });
							runWithSignalOwner(otherOwner, () =>
								flushSync(() =>
									root.render(View, {
										remove: () =>
											seen.push({ callback: 'new-target', owner: currentSignalOwner() }),
										bubble: () =>
											seen.push({ callback: 'new-queued', owner: currentSignalOwner() }),
									}),
								),
							);
							container
								.querySelector('button')!
								.dispatchEvent(new MouseEvent('click', { bubbles: true }));
						},
						bubble: () => seen.push({ callback: 'queued', owner: currentSignalOwner() }),
					}),
				);
				const button = container.querySelector('button')!;
				button.click();
				expect(seen).toEqual([
					{ callback: 'target', owner },
					{ callback: 'new-target', owner: otherOwner },
					{ callback: 'new-queued', owner: otherOwner },
					{ callback: 'queued', owner },
				]);
				expect(container.querySelector('button')).toBe(button);
				button.click();
				expect(seen).toEqual([
					{ callback: 'target', owner },
					{ callback: 'new-target', owner: otherOwner },
					{ callback: 'new-queued', owner: otherOwner },
					{ callback: 'queued', owner },
					{ callback: 'new-target', owner: otherOwner },
					{ callback: 'new-queued', owner: otherOwner },
				]);
			} finally {
				root.unmount();
				owner.dispose();
				otherOwner.dispose();
				container.remove();
			}
		},
	);
});

describe('staged compiler-lifted event ownership', () => {
	it.each(
		bundleCases.flatMap((entry) => [false, true].map((unchanged) => ({ ...entry, unchanged }))),
	)(
		'publishes a projected bundle and authority together at the native update ($kind, unchanged=$unchanged)',
		async ({ Button, args, unchanged }) => {
			const restoreCarrier = installCarrier(true)!;
			const mocks = installViewTransitionMocks();
			const owner = createScope({ scopeKey: 'staged-bundle-owner' });
			const otherOwner = createScope({ scopeKey: 'staged-bundle-other-owner' });
			const container = document.createElement('div');
			document.body.append(container);
			const root = createRoot(container);
			const seen: { callback: string; owner: SignalOwner | null; values: unknown[] }[] = [];
			let update: (() => void | Promise<void>) | undefined;
			let release!: () => void;
			const done = new Promise<void>((resolve) => {
				release = resolve;
			});
			(
				document as unknown as {
					startViewTransition: (input: { update: () => void | Promise<void> }) => object;
				}
			).startViewTransition = (input) => {
				update = input.update;
				return { ready: done, finished: done, skipTransition() {} };
			};
			const stableCallback = (...values: unknown[]) =>
				seen.push({ callback: 'committed', owner: currentSignalOwner(), values });
			const view = (phase: string, callback: string) =>
				createElement(ViewTransition, {
					name: 'event-owner',
					children: createElement(
						'div',
						null,
						createElement(
							Button,
							bundleProps(
								unchanged
									? stableCallback
									: (...values) => seen.push({ callback, owner: currentSignalOwner(), values }),
							),
						),
						createElement('span', null, phase),
					),
				});
			try {
				await act(() => runWithSignalOwner(owner, () => root.render(view('before', 'committed'))));
				const button = container.querySelector('button')!;
				runWithSignalOwner(otherOwner, () =>
					startTransition(() => root.render(view('after', 'published'))),
				);
				await vi.waitFor(() => expect(update).toBeTypeOf('function'));
				expect(container.querySelector('span')!.textContent).toBe('before');
				button.click();
				expect(seen).toEqual([{ callback: 'committed', owner, values: args }]);
				await update!();
				expect(container.querySelector('button')).toBe(button);
				expect(container.querySelector('span')!.textContent).toBe('after');
				button.click();
				expect(seen).toEqual([
					{ callback: 'committed', owner, values: args },
					{ callback: unchanged ? 'committed' : 'published', owner: otherOwner, values: args },
				]);
				release();
				await act(() => done);
			} finally {
				release();
				flushSync(() => root.unmount());
				await Promise.resolve();
				owner.dispose();
				otherOwner.dispose();
				container.remove();
				mocks.restore();
				restoreCarrier();
			}
		},
	);
});
