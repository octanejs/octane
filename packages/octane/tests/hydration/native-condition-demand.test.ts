import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, hydrateRoot, useContext, type Root } from 'octane';
import * as Client from 'octane';
import { condition } from 'octane/hydration';
import { renderToString } from 'octane/server';
import * as Server from 'octane/server';
import { createScope, type Scope, type WritableSignal } from 'octane/signals';
import { loadServerFixture } from '../_server-fixture.js';
import * as client from './_fixtures/native-condition-demand.tsrx';
import * as childClient from './_fixtures/native-condition-child.tsrx';
const childServer = loadServerFixture(
	'packages/octane/tests/hydration/_fixtures/native-condition-child.tsrx',
	{ compileOptions: { strong: true, requireDirective: true, hmr: false } },
);
const server = loadServerFixture<typeof client>(
	'packages/octane/tests/hydration/_fixtures/native-condition-demand.tsrx',
	{
		compileOptions: { strong: true, requireDirective: true, hmr: false },
		runtimeModules: { './native-condition-child.tsrx': childServer },
	},
);
type DescriptorRuntime = Pick<
	typeof Client,
	'createElement' | 'createContext' | 'Hydrate' | 'memo' | 'useContext'
>;
type ActivationReceipts = Pick<
	ReturnType<typeof setupReceipts>,
	'button' | 'onHydrated' | 'onEffect' | 'onCleanup' | 'onClick'
>;
function setupReceipts(button: HTMLButtonElement) {
	return {
		button,
		onHydrated: vi.fn(),
		onEffect: vi.fn(),
		onCleanup: vi.fn(),
		onClick: vi.fn(),
	};
}
function memoContextFixture(
	runtime: DescriptorRuntime,
	Content: typeof childClient.DeferredContent,
	receipts: ActivationReceipts,
) {
	const context = runtime.createContext('closed');
	// A cached public element retains its boundary props across provider updates.
	const boundary = runtime.createElement(runtime.memo(runtime.Hydrate), {
		when: condition(() => runtime.useContext(context) === 'open'),
		split: false,
		onHydrated: receipts.onHydrated,
		children: runtime.createElement(Content, {
			context,
			label: 'server label',
			onEffect: receipts.onEffect,
			onCleanup: receipts.onCleanup,
			onClick: receipts.onClick,
		}),
	});
	function App(props: { value: string }) {
		return runtime.createElement(context, { value: props.value, children: boundary });
	}
	return { App };
}
describe('native conditions preserve dormant server content', () => {
	let container: HTMLElement;
	let root: Root | undefined;
	const scopes: Scope[] = [];
	let nextScopeKey = 0;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});
	afterEach(() => {
		root?.unmount();
		root = undefined;
		for (const scope of scopes) scope.dispose();
		scopes.length = 0;
		container.remove();
	});
	function setup$(
		options: {
			context?: boolean | 'both';
			constantFalse?: boolean;
			scope?: Scope;
			selector$?: WritableSignal<boolean>;
			alternative$?: WritableSignal<{ open: boolean; revision: number }>;
			predicate$?: (gate$: WritableSignal<{ open: boolean; revision: number }>) => boolean;
		} = {},
	) {
		const scope =
			options.scope ?? createScope({ scopeKey: 'native-condition-demand-' + nextScopeKey++ });
		scopes.push(scope);
		const gate$ = scope.signal$('gate', { open: false, revision: 0 });
		const eager$ = scope.signal$('eager', 'eager');
		const onHydrated = vi.fn();
		const onEffect = vi.fn();
		const onCleanup = vi.fn();
		const onClick = vi.fn();
		const predicate$ = vi.fn(() => {
			if (options.predicate$) return options.predicate$(gate$);
			if (options.context) {
				const context = useContext(client.ProbeContext);
				if (options.context === 'both') return context === 'open' || gate$.get().open;
				return context === 'open';
			}
			return options.constantFalse ? false : gate$.get().open;
		});
		const props = {
			eager$,
			gate$,
			selector$: options.selector$,
			alternative$: options.alternative$,
			when: condition(predicate$),
			label: 'server label',
			contextValue: 'closed',
			ownerRevision: 0,
			onHydrated,
			onEffect,
			onCleanup,
			onClick,
		};
		container.innerHTML = renderToString(server.NativeConditionDemand, props, {
			signalOwner: scope,
		}).html;
		const button = container.querySelector('#deferred-action') as HTMLButtonElement;
		return { scope, gate$, props, button, predicate$, onHydrated, onEffect, onCleanup, onClick };
	}
	async function ready() {
		await act(() => {});
		// Split children resolve through Vite's real asynchronous module graph.
		await vi.dynamicImportSettled();
		await act(() => {});
	}
	function assertDormant(probe: ReturnType<typeof setup$>) {
		expect(container.querySelector('#deferred-action')).toBe(probe.button);
		expect(probe.button.textContent).toBe('server label:closed');
		expect(probe.onHydrated).not.toHaveBeenCalled();
		expect(probe.onEffect).not.toHaveBeenCalled();
		expect(probe.onCleanup).not.toHaveBeenCalled();
	}
	async function assertLive(probe: ActivationReceipts, label = 'server label:closed') {
		await vi.waitFor(async () => {
			await act(() => {});
			expect(probe.onHydrated).toHaveBeenCalled();
		});
		expect(container.querySelector('#deferred-action')).toBe(probe.button);
		expect(probe.button.textContent).toBe(label);
		expect(probe.onHydrated).toHaveBeenCalledOnce();
		expect(probe.onEffect).toHaveBeenCalledOnce();
		expect(probe.onCleanup).not.toHaveBeenCalled();
		await act(() => probe.button.click());
		expect(probe.onClick).toHaveBeenCalledOnce();
	}
	it('keeps a false native predicate dormant across native value publication', async () => {
		const probe = setup$();
		await act(() => {
			root = hydrateRoot(container, client.NativeConditionDemand, probe.props, {
				signalOwner: probe.scope,
			});
		});
		await ready();
		assertDormant(probe);
		await act(() => probe.scope.set(probe.gate$, { open: false, revision: 1 }));
		await ready();
		expect(container.querySelector('#eager-value')?.textContent).toBe('eager1');
		assertDormant(probe);
		await act(() => probe.scope.set(probe.gate$, { open: false, revision: 2 }));
		await ready();
		expect(container.querySelector('#eager-value')?.textContent).toBe('eager2');
		assertDormant(probe);
		await act(() => probe.scope.set(probe.gate$, { open: true, revision: 3 }));
		await assertLive(probe);
		await act(() => root!.unmount());
		root = undefined;
		expect(probe.onCleanup).toHaveBeenCalledOnce();
		expect(container.querySelector('#deferred-action')).toBeNull();
	});
	it('opens a false native predicate when its value becomes true', async () => {
		const probe = setup$();
		await act(() => {
			root = hydrateRoot(container, client.NativeConditionDemand, probe.props, {
				signalOwner: probe.scope,
			});
		});
		await ready();
		assertDormant(probe);
		await act(() => probe.scope.set(probe.gate$, { open: true, revision: 1 }));
		await assertLive(probe);
	});
	it('tracks the current native dependency after a false condition switches signals', async () => {
		const scope = createScope({ scopeKey: 'native-condition-switch-' + nextScopeKey++ });
		const useAlternative$ = scope.signal$('use-alternative', false);
		const alternative$ = scope.signal$('alternative', { open: false, revision: 0 });
		const probe = setup$({
			scope,
			selector$: useAlternative$,
			alternative$,
			predicate$: (gate$) => (useAlternative$.get() ? alternative$.get().open : gate$.get().open),
		});
		await act(() => {
			root = hydrateRoot(container, client.NativeConditionDemand, probe.props, {
				signalOwner: probe.scope,
			});
		});
		await ready();
		assertDormant(probe);
		await act(() => scope.set(useAlternative$, true));
		expect(container.querySelector('#eager-alternative')?.textContent).toBe('alternative:0');
		assertDormant(probe);
		await act(() => scope.set(probe.gate$, { open: true, revision: 1 }));
		expect(container.querySelector('#eager-value')?.textContent).toBe('eager1');
		assertDormant(probe);
		await act(() => scope.set(alternative$, { open: false, revision: 1 }));
		expect(container.querySelector('#eager-alternative')?.textContent).toBe('alternative:1');
		assertDormant(probe);
		await act(() => scope.set(alternative$, { open: true, revision: 2 }));
		await assertLive(probe);
	});
	it('releases a dormant condition without mounting its preserved child', async () => {
		const probe = setup$();
		await act(() => {
			root = hydrateRoot(container, client.NativeConditionDemand, probe.props, {
				signalOwner: probe.scope,
			});
		});
		await ready();
		assertDormant(probe);
		await act(() => probe.scope.set(probe.gate$, { open: false, revision: 1 }));
		assertDormant(probe);
		await act(() => root!.unmount());
		root = undefined;
		probe.predicate$.mockClear();
		await act(() => probe.scope.set(probe.gate$, { open: true, revision: 2 }));
		expect(container.querySelector('#deferred-action')).toBeNull();
		expect(probe.predicate$).not.toHaveBeenCalled();
		expect(probe.onHydrated).not.toHaveBeenCalled();
		expect(probe.onEffect).not.toHaveBeenCalled();
		expect(probe.onCleanup).not.toHaveBeenCalled();
	});
	it('opens preserved content for a genuine changed parent capture', async () => {
		const probe = setup$({ constantFalse: true });
		const onLatestClick = vi.fn();
		await act(() => {
			root = hydrateRoot(container, client.NativeConditionDemand, probe.props, {
				signalOwner: probe.scope,
			});
		});
		await ready();
		assertDormant(probe);
		await act(() =>
			root!.render(client.NativeConditionDemand, {
				...probe.props,
				label: 'latest label',
				onClick: onLatestClick,
			}),
		);
		await assertLive({ ...probe, onClick: onLatestClick }, 'latest label:closed');
		expect(probe.onClick).not.toHaveBeenCalled();
	});
	it('opens preserved content for a genuine parent render with unchanged child capture', async () => {
		const probe = setup$({ constantFalse: true });
		await act(() => {
			root = hydrateRoot(container, client.NativeConditionDemand, probe.props, {
				signalOwner: probe.scope,
			});
		});
		await ready();
		assertDormant(probe);
		await act(() =>
			root!.render(client.NativeConditionDemand, { ...probe.props, ownerRevision: 1 }),
		);
		await assertLive(probe);
		expect(container.querySelector('#boundary-owner')?.getAttribute('data-revision')).toBe('1');
	});
	it('opens preserved content for a genuine changed context while the predicate stays false', async () => {
		const probe = setup$({ context: true });
		await act(() => {
			root = hydrateRoot(container, client.NativeConditionDemand, probe.props, {
				signalOwner: probe.scope,
			});
		});
		await ready();
		assertDormant(probe);
		await act(() =>
			root!.render(client.NativeConditionDemand, { ...probe.props, contextValue: 'still closed' }),
		);
		await assertLive(probe, 'server label:still closed');
	});
	it('opens changed context when a false native predicate has also queued a refresh', async () => {
		const probe = setup$({ context: 'both' });
		await act(() => {
			root = hydrateRoot(container, client.NativeConditionDemand, probe.props, {
				signalOwner: probe.scope,
			});
		});
		await ready();
		assertDormant(probe);
		await act(() => {
			probe.scope.set(probe.gate$, { open: false, revision: 1 });
			root!.render(client.NativeConditionDemand, { ...probe.props, contextValue: 'still closed' });
		});
		await assertLive(probe, 'server label:still closed');
	});
	it('opens memo-wrapped preserved content for changed context with unchanged boundary props', async () => {
		const receipts = setupReceipts(document.createElement('button'));
		const serverFixture = memoContextFixture(
			Server as unknown as DescriptorRuntime,
			childServer.DeferredContent,
			receipts,
		);
		const clientFixture = memoContextFixture(Client, childClient.DeferredContent, receipts);
		container.innerHTML = renderToString(serverFixture.App, { value: 'closed' }).html;
		receipts.button = container.querySelector('#deferred-action') as HTMLButtonElement;
		await act(() => {
			root = hydrateRoot(container, clientFixture.App, { value: 'closed' });
		});
		await ready();
		expect(container.querySelector('#deferred-action')).toBe(receipts.button);
		expect(receipts.button.textContent).toBe('server label:closed');
		expect(receipts.onHydrated).not.toHaveBeenCalled();
		expect(receipts.onEffect).not.toHaveBeenCalled();
		await act(() => root!.render(clientFixture.App, { value: 'still closed' }));
		await assertLive(receipts, 'server label:still closed');
	});
});
