import { describe, expect, it, vi } from 'vitest';
import { act, mount, nextPaint } from './_helpers';
import {
	HiddenPrimaryRefCatchApp,
	HiddenInsertionCleanupApp,
	IndependentRefApp,
	NestedPortalPreservation,
	NestedAbortedRefApp,
	ReentrantCatchCleanupApp,
	ReentrantResumeCleanupApp,
	SuspenseEffectHistoryOrderApp,
	SuspenseEffectOrderApp,
	SuspensePassiveSurvivalApp,
	TransitionChildWipReentrantUnmountApp,
	TransitionComponentWipReentrantUnmountApp,
	SuspensePreservationApp,
	UrgentChildSlotSuspenseApp,
	UrgentComponentSlotSuspenseApp,
	UrgentReturnKindSuspenseApp,
	UrgentWipReentrantUnmountApp,
} from './_fixtures/suspense-preserves-dom.tsrx';
import { UseInIf } from './conformance/_fixtures/suspense-extra.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function fulfilled<T>(value: T): PromiseLike<T> {
	return { then() {}, status: 'fulfilled', value } as any;
}

function makeStore() {
	let value = 0;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set(next: number) {
			value = next;
			for (const listener of listeners) listener();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		listenerCount: () => listeners.size,
	};
}

function setup(shape: 'same' | 'swap' = 'swap') {
	const pending = deferred<string>();
	const promises = new Map<string, PromiseLike<string>>([
		['A', fulfilled('A')],
		['B', pending.promise],
	]);
	const portalTarget = document.createElement('div');
	document.body.appendChild(portalTarget);
	const store = makeStore();
	const log: string[] = [];
	const renderLog: string[] = [];
	const refLog: Array<Element | null> = [];
	let controls!: { urgent(next: string): void; transition(next: string): void };
	const props = {
		shape,
		promiseFor: (route: string) => promises.get(route)!,
		portalTarget,
		store,
		log,
		renderLog,
		portalRef: (node: Element | null) => refLog.push(node),
		directText: 'direct primary text',
		bind(value: typeof controls) {
			controls = value;
		},
	};
	const root = mount(SuspensePreservationApp, props);
	return { root, pending, portalTarget, store, log, renderLog, refLog, controls: () => controls };
}

describe('Suspense preserves committed host DOM', () => {
	async function expectPreservedHosts(shape: 'same' | 'swap'): Promise<void> {
		const t = setup(shape);
		const panel = t.root.find('#preserved-panel') as HTMLElement;
		const route = t.root.find('#preserved-route');
		const portal = t.portalTarget.querySelector('#preserved-portal') as HTMLElement;
		await nextPaint();

		await act(() => t.controls().urgent('B'));
		expect(t.root.find('#preserved-panel')).toBe(panel);
		expect(panel.isConnected).toBe(true);
		expect(panel.style.getPropertyValue('display')).toBe('none');
		expect(panel.style.getPropertyPriority('display')).toBe('important');
		expect(t.root.find('#preserved-route')).toBe(route);
		expect((route as HTMLElement).isConnected).toBe(true);
		expect((route as HTMLElement).style.display).toBe('none');
		expect(portal.isConnected).toBe(true);
		expect(portal.style.display).toBe('none');
		expect(t.root.container.textContent).not.toContain('direct primary text');
		expect(t.root.find('#preserved-fallback').textContent).toBe('loading');

		await act(() => t.pending.resolve('B'));
		expect(t.root.find('#preserved-panel')).toBe(panel);
		expect(panel.style.getPropertyValue('display')).toBe('grid');
		expect(panel.style.getPropertyPriority('display')).toBe('important');
		expect(t.portalTarget.querySelector('#preserved-portal')).toBe(portal);
		expect(portal.style.display).toBe('');
		expect(t.root.container.textContent).toContain('direct primary text');
		expect(t.root.find('#preserved-route').textContent).toBe('route:B');

		t.root.unmount();
		t.portalTarget.remove();
	}

	it('keeps same-tree primary hosts connected and restores authored display/text', () =>
		expectPreservedHosts('same'));

	it('keeps swap-tree primary hosts connected and restores authored display/text', () =>
		expectPreservedHosts('swap'));

	it('reconnects memoized effects at their source position without re-running the body', async () => {
		const pending = deferred<string>();
		const promises = new Map<string, PromiseLike<string>>([
			['A', fulfilled('A')],
			['B', pending.promise],
		]);
		const orderLog: string[] = [];
		const renderLog: string[] = [];
		let controls!: { suspend(): void };
		const root = mount(SuspenseEffectOrderApp, {
			orderLog,
			renderLog,
			promiseFor: (route: string) => promises.get(route)!,
			bind(value: typeof controls) {
				controls = value;
			},
		});
		await nextPaint();
		expect(renderLog).toEqual(['memo:render', 'updating:render:A']);
		expect(orderLog).toEqual(['memo:layout', 'updating:layout:A']);

		await act(() => controls.suspend());
		expect(root.find('#ordered-effects-fallback')).toBeTruthy();
		expect(renderLog.filter((entry) => entry === 'memo:render')).toHaveLength(1);
		expect(orderLog.slice(-2)).toEqual(['memo:cleanup', 'updating:cleanup:A']);

		await act(() => pending.resolve('B'));
		await nextPaint();
		expect(root.findAll('#ordered-effects-fallback')).toHaveLength(0);
		expect(renderLog.filter((entry) => entry === 'memo:render')).toHaveLength(1);
		// The source-earlier memo bailout reconnects before the normally rendered
		// sibling's changed-dependency effect.
		expect(orderLog.slice(-2)).toEqual(['memo:layout', 'updating:layout:B']);

		root.unmount();
	});

	it('reconnects memo-bailed effects in declaration order after staggered updates', async () => {
		const orderLog: string[] = [];
		const pending = deferred<string>();
		const root = mount(SuspenseEffectHistoryOrderApp, {
			orderLog,
			first: 0,
			second: 0,
			promise: fulfilled('A'),
		});
		await nextPaint();
		expect(orderLog).toEqual(['first:0', 'second:0']);

		root.update(SuspenseEffectHistoryOrderApp, {
			orderLog,
			first: 1,
			second: 0,
			promise: fulfilled('A'),
		});
		await nextPaint();
		expect(orderLog.slice(-2)).toEqual(['cleanup:first:0', 'first:1']);

		root.update(SuspenseEffectHistoryOrderApp, {
			orderLog,
			first: 1,
			second: 0,
			promise: pending.promise,
		});
		expect(root.find('#effect-history-fallback')).toBeTruthy();

		await act(() => pending.resolve('B'));
		await nextPaint();
		expect(orderLog.slice(-2)).toEqual(['first:1', 'second:0']);
		root.unmount();
	});

	it('keeps passive effects connected across hide and reveal', async () => {
		const log: string[] = [];
		const pending = deferred<string>();
		const root = mount(SuspensePassiveSurvivalApp, {
			log,
			promise: fulfilled('A'),
		});
		await nextPaint();
		expect(log).toEqual(['passive:mount']);

		root.update(SuspensePassiveSurvivalApp, { log, promise: pending.promise });
		expect(root.find('#passive-survival-fallback')).toBeTruthy();
		await nextPaint();
		expect(log).toEqual(['passive:mount']);

		await act(() => pending.resolve('B'));
		await nextPaint();
		expect(root.findAll('#passive-survival-fallback')).toHaveLength(0);
		expect(log).toEqual(['passive:mount']);

		root.unmount();
		await nextPaint();
		expect(log).toEqual(['passive:mount', 'passive:cleanup']);
	});

	it('cycles portal lifecycle once and fully tears a hidden primary down', async () => {
		const t = setup();
		await nextPaint();
		expect(t.store.listenerCount()).toBe(1);
		expect(t.log).toEqual(['portal:layout']);
		expect(t.refLog.map((node) => (node ? 'attach' : 'detach'))).toEqual(['attach']);

		await act(() => t.controls().urgent('B'));
		// Passive subscriptions survive a Suspense hide and clean up only when
		// the preserved primary is permanently deleted.
		expect(t.store.listenerCount()).toBe(1);
		expect(t.log).toEqual(['portal:layout', 'portal:cleanup']);
		expect(t.refLog.map((node) => (node ? 'attach' : 'detach'))).toEqual(['attach', 'detach']);

		t.root.unmount();
		await nextPaint();
		expect(t.portalTarget.childNodes).toHaveLength(0);
		expect(t.store.listenerCount()).toBe(0);
		expect(t.refLog.map((node) => (node ? 'attach' : 'detach'))).toEqual(['attach', 'detach']);

		await expect(
			act(() => {
				t.pending.resolve('late');
			}),
		).resolves.toBeUndefined();
		expect(t.portalTarget.childNodes).toHaveLength(0);
		t.portalTarget.remove();
	});

	it('keeps a nested portal hidden when the inner boundary resolves first', async () => {
		const initialInner = fulfilled('inner-a');
		const initialOuter = fulfilled('outer-a');
		const nextInner = deferred<string>();
		const nextOuter = deferred<string>();
		const portalTarget = document.createElement('div');
		document.body.appendChild(portalTarget);
		const store = makeStore();
		const log: string[] = [];
		const portalRef = vi.fn();
		const common = { portalTarget, store, log, portalRef };
		const root = mount(NestedPortalPreservation, {
			...common,
			innerPromise: initialInner,
			outerPromise: initialOuter,
		});
		const portal = portalTarget.querySelector('#preserved-portal') as HTMLElement;
		expect(portal).toBeTruthy();
		expect(portalRef.mock.calls.map(([node]) => (node ? 'attach' : 'detach'))).toEqual(['attach']);

		root.update(NestedPortalPreservation, {
			...common,
			innerPromise: nextInner.promise,
			outerPromise: nextOuter.promise,
		});
		expect(root.find('#outer-fallback')).toBeTruthy();
		expect(portal.style.display).toBe('none');
		expect(portalRef.mock.calls.map(([node]) => (node ? 'attach' : 'detach'))).toEqual([
			'attach',
			'detach',
		]);

		await act(() => nextInner.resolve('inner-b'));
		expect(root.find('#outer-fallback')).toBeTruthy();
		expect(portalTarget.querySelector('#preserved-portal')).toBe(portal);
		expect(portal.style.display).toBe('none');
		expect(portalRef.mock.calls.map(([node]) => (node ? 'attach' : 'detach'))).toEqual([
			'attach',
			'detach',
		]);

		await act(() => nextOuter.resolve('outer-b'));
		expect(root.findAll('#outer-fallback')).toHaveLength(0);
		expect(portalTarget.querySelector('#preserved-portal')).toBe(portal);
		expect(portal.style.display).toBe('');
		expect(portalRef.mock.calls.map(([node]) => (node ? 'attach' : 'detach'))).toEqual([
			'attach',
			'detach',
			'attach',
		]);

		root.unmount();
		portalTarget.remove();
	});

	it('does not detach a hidden primary ref again when its retry enters catch', async () => {
		const rejected = deferred<string>();
		const refLog: string[] = [];
		const primaryRef = (node: Element | null) => {
			if (node === null) {
				refLog.push('detach:null');
				return;
			}
			refLog.push('attach');
			return () => refLog.push('detach:cleanup');
		};
		const root = mount(HiddenPrimaryRefCatchApp, {
			promise: fulfilled('ready'),
			primaryRef,
		});
		expect(refLog).toEqual(['attach']);

		root.update(HiddenPrimaryRefCatchApp, { promise: rejected.promise, primaryRef });
		expect(root.find('#hidden-ref-fallback')).toBeTruthy();
		expect(refLog).toEqual(['attach', 'detach:cleanup']);

		await act(() => rejected.reject(new Error('boom')));
		expect(root.find('#hidden-ref-catch').textContent).toBe('boom');
		expect(refLog).toEqual(['attach', 'detach:cleanup']);
		root.unmount();
	});

	it('does not suppress ref teardown in an independent root during hidden cleanup', () => {
		const refLog: string[] = [];
		const hostRef = (node: Element | null) => {
			if (node === null) {
				refLog.push('detach:null');
				return;
			}
			refLog.push('attach');
			return () => refLog.push('detach:cleanup');
		};
		const independent = mount(IndependentRefApp, { hostRef });
		const pending = deferred<string>();
		const owner = mount(HiddenInsertionCleanupApp, {
			promise: fulfilled('ready'),
			onInsertionCleanup: () => independent.unmount(),
		});

		owner.update(HiddenInsertionCleanupApp, {
			promise: pending.promise,
			onInsertionCleanup: () => independent.unmount(),
		});
		expect(owner.find('#hidden-insertion-fallback')).toBeTruthy();
		owner.unmount();
		expect(refLog).toEqual(['attach', 'detach:cleanup']);
	});

	it('never detaches a completed child from an aborted parent mount', () => {
		const refLog: string[] = [];
		const root = mount(NestedAbortedRefApp, {
			hostRef: (node: Element | null) => refLog.push(node === null ? 'detach' : 'attach'),
		});
		expect(root.find('#nested-aborted-catch').textContent).toBe('abort');
		expect(refLog).toEqual([]);
		root.unmount();
	});

	it('stops a reveal when fallback cleanup unmounts the owning root', async () => {
		const pending = deferred<string>();
		const log: string[] = [];
		let root!: ReturnType<typeof mount>;
		const onCleanup = () => {
			log.push('cleanup:fallback');
			root.unmount();
		};
		root = mount(ReentrantResumeCleanupApp, { promise: pending.promise, onCleanup });
		expect(root.find('#reentrant-resume-fallback')).toBeTruthy();

		await expect(act(() => pending.resolve('ready'))).resolves.toBeUndefined();
		expect(root.container.childNodes).toHaveLength(0);
		expect(log).toEqual(['cleanup:fallback']);
	});

	it('stops a catch commit when primary cleanup unmounts the owning root', () => {
		const log: string[] = [];
		let root!: ReturnType<typeof mount>;
		const onCleanup = () => {
			log.push('cleanup:primary');
			root.unmount();
		};
		root = mount(ReentrantCatchCleanupApp, { fail: false, onCleanup });

		expect(() => root.update(ReentrantCatchCleanupApp, { fail: true, onCleanup })).not.toThrow();
		expect(root.container.childNodes).toHaveLength(0);
		expect(log).toEqual(['cleanup:primary']);
	});

	it('keeps a superseding markerless branch inside the preserved try range', async () => {
		const pendingA = deferred<string>();
		const pendingB = deferred<string>();
		const root = mount(UseInIf, {
			which: 'a',
			pA: pendingA.promise,
			pB: fulfilled('B'),
		});
		expect(root.find('.fallback')).toBeTruthy();

		root.update(UseInIf, {
			which: 'b',
			pA: pendingA.promise,
			pB: fulfilled('B'),
		});
		const branchB = root.find('.b') as HTMLElement;
		expect(branchB.textContent).toBe('B');
		expect(root.findAll('.fallback')).toHaveLength(0);

		await act(() => pendingA.resolve('stale A'));
		expect(root.find('.b')).toBe(branchB);
		expect(root.findAll('.a')).toHaveLength(0);

		root.update(UseInIf, {
			which: 'b',
			pA: pendingA.promise,
			pB: pendingB.promise,
		});
		expect(root.find('.fallback')).toBeTruthy();
		expect(root.find('.b')).toBe(branchB);
		expect(branchB.isConnected).toBe(true);
		expect(branchB.style.display).toBe('none');
		root.unmount();
	});

	async function expectUrgentSlotPreservation(
		App: any,
		oldSelector: string,
		fallbackSelector: string,
	): Promise<void> {
		const pending = deferred<string>();
		const root = mount(App, { pending: false, promise: pending.promise });
		const oldHost = root.find(oldSelector) as HTMLElement;

		root.update(App, { pending: true, promise: pending.promise });
		expect(root.find(fallbackSelector)).toBeTruthy();
		expect(root.find(oldSelector)).toBe(oldHost);
		expect(oldHost.isConnected).toBe(true);
		expect(oldHost.style.display).toBe('none');
		root.unmount();
	}

	it('preserves an urgent componentSlot replacement that suspends', () =>
		expectUrgentSlotPreservation(
			UrgentComponentSlotSuspenseApp,
			'#component-slot-old',
			'#component-slot-fallback',
		));

	it('preserves an urgent childSlot replacement that suspends', () =>
		expectUrgentSlotPreservation(
			UrgentChildSlotSuspenseApp,
			'#child-slot-old',
			'#child-slot-fallback',
		));

	it('preserves an urgent return-slot kind replacement that suspends', () =>
		expectUrgentSlotPreservation(
			UrgentReturnKindSuspenseApp,
			'#return-kind-old',
			'#return-kind-fallback',
		));

	it('does not commit an urgent WIP after old-branch cleanup unmounts the root', async () => {
		const log: string[] = [];
		const incomingRef = (node: Element | null) => {
			if (node !== null) log.push(`ref:new:${node.isConnected ? 'connected' : 'detached'}`);
		};
		let root!: ReturnType<typeof mount>;
		const onCleanup = () => {
			log.push('cleanup:old');
			root.unmount();
		};
		root = mount(UrgentWipReentrantUnmountApp, {
			next: false,
			onCleanup,
			incomingRef,
			log,
		});
		await nextPaint();

		root.update(UrgentWipReentrantUnmountApp, {
			next: true,
			onCleanup,
			incomingRef,
			log,
		});
		await nextPaint();
		expect(root.container.childNodes).toHaveLength(0);
		expect(log).toEqual(['cleanup:old']);
	});

	it('does not commit a transition component WIP after old cleanup unmounts the root', async () => {
		const log: string[] = [];
		const incomingRef = (node: Element | null) => {
			if (node !== null) log.push(`ref:new:${node.isConnected ? 'connected' : 'detached'}`);
		};
		let controls!: { go(): void };
		let root!: ReturnType<typeof mount>;
		const onCleanup = () => {
			log.push('cleanup:old');
			root.unmount();
		};
		root = mount(TransitionComponentWipReentrantUnmountApp, {
			onCleanup,
			incomingRef,
			log,
			bind(value: typeof controls) {
				controls = value;
			},
		});
		await nextPaint();

		await act(() => controls.go());
		await nextPaint();
		expect(root.container.childNodes).toHaveLength(0);
		expect(log).toEqual(['cleanup:old']);
	});

	it('does not commit a transition child WIP after old cleanup unmounts the root', async () => {
		const log: string[] = [];
		const incomingRef = (node: Element | null) => {
			if (node !== null) log.push(`ref:new:${node.isConnected ? 'connected' : 'detached'}`);
		};
		let controls!: { go(): void };
		let root!: ReturnType<typeof mount>;
		const onCleanup = () => {
			log.push('cleanup:old');
			root.unmount();
		};
		root = mount(TransitionChildWipReentrantUnmountApp, {
			onCleanup,
			incomingRef,
			log,
			bind(value: typeof controls) {
				controls = value;
			},
		});
		await nextPaint();

		await act(() => controls.go());
		await nextPaint();
		expect(root.container.childNodes).toHaveLength(0);
		expect(log).toEqual(['cleanup:old']);
	});
});
