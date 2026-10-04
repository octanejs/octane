import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { flushSync, startTransition, type ComponentBody } from '../src/index.js';
import { act, mount, nextPaint } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import type { SupersededArmProps } from './_fixtures/suspense-superseded-arm.tsrx';
import {
	ConditionalArmRootSuspensionApp,
	DescriptorRootSuspensionAfterSiblingApp,
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
	RootSuspensionAfterSiblingApp,
	RawRootSuspensionAfterSiblingApp,
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

function setupNestedPortal(onDetach?: (mounted: ReturnType<typeof mount>) => void) {
	const inner = deferred<string>();
	const outer = deferred<string>();
	const portalTarget = document.createElement('div');
	document.body.appendChild(portalTarget);
	const store = makeStore();
	const log: string[] = [];
	let mounted!: ReturnType<typeof mount>;
	const portalRef = vi.fn((node: Element | null) => {
		if (node === null) onDetach?.(mounted);
	});
	const common = { portalTarget, store, log, portalRef };
	mounted = mount(NestedPortalPreservation, {
		...common,
		innerPromise: fulfilled('inner-a'),
		outerPromise: fulfilled('outer-a'),
	});
	const portal = portalTarget.querySelector('#preserved-portal') as HTMLElement;
	expect(portal).toBeTruthy();
	expect(portalRef.mock.calls.map(([node]) => node)).toEqual([portal]);
	return {
		mounted,
		inner,
		outer,
		portal,
		portalTarget,
		portalRef,
		store,
		hide() {
			mounted.update(NestedPortalPreservation, {
				...common,
				innerPromise: inner.promise,
				outerPromise: outer.promise,
			});
		},
		dispose() {
			onDetach = undefined;
			try {
				mounted.unmount();
			} finally {
				portalTarget.remove();
			}
		},
	};
}

describe('Suspense preserves committed host DOM', () => {
	it('abandons a suspended new conditional arm before growing and replacing the accepted arm', async () => {
		const pending = deferred<string>();
		const initial = fulfilled('A');
		const accepted = fulfilled('C');
		const root = mount(ConditionalArmRootSuspensionApp, { active: false, promise: initial });
		try {
			const shell = root.find('#conditional-arm-root-shell');
			const content = root.find('#conditional-arm-content');
			const replacement = root.find('#conditional-arm-replacement');
			const reader = root.find('#root-suspension-reader');

			root.update(ConditionalArmRootSuspensionApp, { active: true, promise: pending.promise });
			expect(root.find('#conditional-arm-root-shell')).toBe(shell);
			expect(root.find('#conditional-arm-content')).toBe(content);
			expect(root.find('#conditional-arm-replacement')).toBe(replacement);
			expect(root.findAll('#conditional-arm-expand')).toHaveLength(0);
			expect(root.findAll('#conditional-arm-detail')).toHaveLength(0);
			expect(root.find('#root-suspension-reader')).toBe(reader);
			expect(reader.textContent).toBe('resource:A');

			root.update(ConditionalArmRootSuspensionApp, { active: true, promise: accepted });
			const expand = root.find('#conditional-arm-expand');
			expect(content.textContent).toBe('expandreplacement');
			expect(root.find('#root-suspension-reader')).toBe(reader);
			expect(reader.textContent).toBe('resource:C');
			root.click('#conditional-arm-expand');
			expect(root.find('#conditional-arm-expand')).toBe(expand);
			expect(root.findAll('#conditional-arm-detail')).toHaveLength(1);
			expect(content.textContent).toBe('expanddetailreplacement');

			root.update(ConditionalArmRootSuspensionApp, { active: false, promise: accepted });
			expect(root.find('#conditional-arm-replacement')).toBe(replacement);
			expect(root.findAll('#conditional-arm-expand')).toHaveLength(0);
			expect(root.findAll('#conditional-arm-detail')).toHaveLength(0);
			expect(content.textContent).toBe('replacement');

			await act(() => pending.resolve('B'));
			expect(root.find('#conditional-arm-root-shell')).toBe(shell);
			expect(root.find('#conditional-arm-content')).toBe(content);
			expect(root.find('#conditional-arm-replacement')).toBe(replacement);
			expect(root.findAll('#conditional-arm-expand')).toHaveLength(0);
			expect(root.findAll('#conditional-arm-detail')).toHaveLength(0);
			expect(root.find('#root-suspension-reader')).toBe(reader);
			expect(reader.textContent).toBe('resource:C');
		} finally {
			root.unmount();
		}
	});

	it('restores externally edited descriptor text when a later sibling suspends', async () => {
		const pending = deferred<string>();
		let value: string | null = 'A';
		const read = () => {
			if (value === null) throw pending.promise;
			return value;
		};
		const root = mount(DescriptorRootSuspensionAfterSiblingApp, { label: 'original', read });
		try {
			const label = root.find('#raw-root-suspension-label');
			const text = label.firstChild!;
			text.nodeValue = 'external text';
			value = null;
			root.update(DescriptorRootSuspensionAfterSiblingApp, { label: 'replacement', read });
			expect(root.find('#raw-root-suspension-label')).toBe(label);
			expect(label.firstChild).toBe(text);
			expect(text.nodeValue).toBe('external text');
			expect(root.find('#raw-root-suspension-reader').textContent).toBe('resource:A');

			value = 'B';
			await act(() => pending.resolve('ready'));
			expect(root.find('#raw-root-suspension-label')).toBe(label);
			expect(label.firstChild).toBe(text);
			expect(text.nodeValue).toBe('replacement');
			expect(root.find('#raw-root-suspension-reader').textContent).toBe('resource:B');
		} finally {
			root.unmount();
		}
	});

	it('keeps committed siblings when a previously synchronous reader throws its first thenable', async () => {
		const pending = deferred<string>();
		let value: string | null = 'A';
		const read = () => {
			if (value === null) throw pending.promise;
			return value;
		};
		const root = mount(RawRootSuspensionAfterSiblingApp, { label: 'original', read });
		try {
			const shell = root.find('#raw-root-suspension-shell');
			const label = root.find('#raw-root-suspension-label');
			const reader = root.find('#raw-root-suspension-reader');
			value = null;
			root.update(RawRootSuspensionAfterSiblingApp, { label: 'replacement', read });
			expect(root.find('#raw-root-suspension-shell')).toBe(shell);
			expect(root.find('#raw-root-suspension-label')).toBe(label);
			expect(label.textContent).toBe('original');
			expect(label.getAttribute('title')).toBe('original');
			expect(root.find('#raw-root-suspension-reader')).toBe(reader);
			expect(reader.textContent).toBe('resource:A');

			value = 'B';
			await act(() => pending.resolve('ready'));
			expect(root.find('#raw-root-suspension-shell')).toBe(shell);
			expect(root.find('#raw-root-suspension-label')).toBe(label);
			expect(label.textContent).toBe('replacement');
			expect(root.find('#raw-root-suspension-reader')).toBe(reader);
			expect(reader.textContent).toBe('resource:B');
		} finally {
			root.unmount();
		}
	});

	it('keeps earlier sibling writes and an edited input intact while a root props refresh suspends', async () => {
		const pending = deferred<string>();
		const root = mount(RootSuspensionAfterSiblingApp, {
			label: 'original',
			promise: fulfilled('A'),
		});
		try {
			const shell = root.find('#root-suspension-shell');
			const label = root.find('#root-suspension-label');
			const reader = root.find('#root-suspension-reader');
			const draft = root.find('#root-suspension-draft') as HTMLInputElement;
			draft.value = 'edited';
			draft.focus();
			draft.setSelectionRange(2, 4);
			// An external owner may have changed live DOM since Octane's last commit.
			// A suspended write must put that exact browser state back.
			label.firstChild!.nodeValue = 'external text';
			label.setAttribute('title', 'external title');

			root.update(RootSuspensionAfterSiblingApp, {
				label: 'replacement',
				promise: pending.promise,
			});
			expect(root.find('#root-suspension-shell')).toBe(shell);
			expect(root.find('#root-suspension-label')).toBe(label);
			expect(label.textContent).toBe('external text');
			expect(label.getAttribute('title')).toBe('external title');
			expect(root.find('#root-suspension-reader')).toBe(reader);
			expect(reader.textContent).toBe('resource:A');
			expect(root.find('#root-suspension-draft')).toBe(draft);
			expect(draft.value).toBe('edited');
			expect(document.activeElement).toBe(draft);
			expect([draft.selectionStart, draft.selectionEnd]).toEqual([2, 4]);

			await act(() => pending.resolve('B'));
			expect(root.find('#root-suspension-shell')).toBe(shell);
			expect(root.find('#root-suspension-label')).toBe(label);
			expect(label.textContent).toBe('replacement');
			expect(label.getAttribute('title')).toBe('replacement');
			expect(root.find('#root-suspension-reader')).toBe(reader);
			expect(reader.textContent).toBe('resource:B');
			expect(root.find('#root-suspension-draft')).toBe(draft);
			expect(draft.value).toBe('edited');
		} finally {
			root.unmount();
		}
	});

	it.each([
		{ state: 'absent', title: null },
		{ state: 'empty', title: '' },
	])(
		'preserves an externally $state title through successive suspended refreshes',
		async ({ title }) => {
			const pending = deferred<string>();
			const root = mount(RootSuspensionAfterSiblingApp, {
				label: 'original',
				promise: fulfilled('A'),
			});
			try {
				const label = root.find('#root-suspension-label');
				const text = label.firstChild!;
				if (title === null) label.removeAttribute('title');
				else label.setAttribute('title', title);
				text.nodeValue = 'first external text';
				root.update(RootSuspensionAfterSiblingApp, {
					label: 'first replacement',
					promise: pending.promise,
				});
				expect(root.find('#root-suspension-label')).toBe(label);
				expect(label.firstChild).toBe(text);
				expect(text.nodeValue).toBe('first external text');
				expect(label.getAttribute('title')).toBe(title);
				expect(label.hasAttribute('title')).toBe(title !== null);

				// Each attempt restores its immediately preceding DOM, including an edit
				// made while the same resource is already holding the committed screen.
				text.nodeValue = 'second external text';
				const nextTitle = title === null ? '' : null;
				if (nextTitle === null) label.removeAttribute('title');
				else label.setAttribute('title', nextTitle);
				root.update(RootSuspensionAfterSiblingApp, {
					label: 'latest replacement',
					promise: pending.promise,
				});
				expect(root.find('#root-suspension-label')).toBe(label);
				expect(label.firstChild).toBe(text);
				expect(text.nodeValue).toBe('second external text');
				expect(label.getAttribute('title')).toBe(nextTitle);
				expect(label.hasAttribute('title')).toBe(nextTitle !== null);

				await act(() => pending.resolve('B'));
				expect(root.find('#root-suspension-label')).toBe(label);
				expect(label.firstChild).toBe(text);
				expect(text.nodeValue).toBe('latest replacement');
				expect(label.getAttribute('title')).toBe('latest replacement');
				expect(root.find('#root-suspension-reader').textContent).toBe('resource:B');
			} finally {
				root.unmount();
			}
		},
	);

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

	it('keeps a nested portal hidden when the outer boundary resolves first', async () => {
		const t = setupNestedPortal();
		try {
			t.hide();
			expect(t.portalRef.mock.calls.map(([node]) => node)).toEqual([t.portal, null]);
			await act(() => t.outer.resolve('outer-b'));
			expect(t.mounted.findAll('#outer-fallback')).toHaveLength(0);
			expect(t.mounted.find('#inner-fallback')).toBeTruthy();
			expect(t.portalTarget.querySelector('#preserved-portal')).toBe(t.portal);
			expect(t.portal.style.display).toBe('none');
			expect(t.portalRef.mock.calls.map(([node]) => node)).toEqual([t.portal, null]);
			await act(() => t.inner.resolve('inner-b'));
			expect(t.mounted.findAll('#inner-fallback')).toHaveLength(0);
			expect(t.portalTarget.querySelector('#preserved-portal')).toBe(t.portal);
			expect(t.portal.style.display).toBe('');
			expect(t.portalRef.mock.calls.map(([node]) => node)).toEqual([t.portal, null, t.portal]);
		} finally {
			t.dispose();
		}
	});

	it('reconnects a nested portal once when both hidden boundaries resolve together', async () => {
		const t = setupNestedPortal();
		try {
			t.hide();
			expect(t.portalRef.mock.calls.map(([node]) => node)).toEqual([t.portal, null]);
			await act(() => {
				t.inner.resolve('inner-b');
				t.outer.resolve('outer-b');
			});
			expect(t.mounted.findAll('#outer-fallback')).toHaveLength(0);
			expect(t.mounted.findAll('#inner-fallback')).toHaveLength(0);
			expect(t.portalTarget.querySelector('#preserved-portal')).toBe(t.portal);
			expect(t.portal.style.display).toBe('');
			expect(t.portalRef.mock.calls.map(([node]) => node)).toEqual([t.portal, null, t.portal]);
		} finally {
			t.dispose();
		}
	});

	it.each(['unmount', 'replace'] as const)(
		'stops nested publication when the portal detach callback requests %s',
		async (request) => {
			const Replacement = () => 'replacement';
			const t = setupNestedPortal((mounted) => {
				if (request === 'unmount') mounted.root.unmount();
				else mounted.root.render(Replacement);
			});
			try {
				expect(() => t.hide()).not.toThrow();
				expect(t.portalRef.mock.calls.map(([node]) => node)).toEqual([t.portal, null]);
				expect(t.portalTarget.childNodes).toHaveLength(0);
				expect(t.mounted.container.textContent).toBe(request === 'replace' ? 'replacement' : '');
				await act(() => {
					t.inner.resolve('inner-b');
					t.outer.resolve('outer-b');
				});
				expect(t.portalRef.mock.calls.map(([node]) => node)).toEqual([t.portal, null]);
				expect(t.portalTarget.childNodes).toHaveLength(0);
				expect(t.mounted.container.textContent).toBe(request === 'replace' ? 'replacement' : '');
				expect(t.store.listenerCount()).toBe(0);
			} finally {
				t.dispose();
			}
		},
	);

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

// A parent render can reveal a pending boundary and then roll back because a
// later sibling suspends the root. The rollback restores the fallback screen, and
// the boundary must still be pending on its committed inputs afterwards, so the
// next commit or its own wakeable can reveal it. A later fallback or catch arm
// must also come from the committed render, not the abandoned one.
const ROLLED_BACK_REVEAL = `
import { ErrorBoundary, memo, Suspense, use, useLinkedState, useState } from 'octane';
function Next(props) @{ use(props.next); <s>{'next'}</s> }
function Hold(props) @{
  use(props.wait);
  <>
    <i>{'ready'}</i>
    @if (props.next) { <Next next={props.next} /> }
  </>
}
function Gate(props) @{ if (props.gate) use(props.gate); <u>{'gate'}</u> }
export function App(props) @{
  <main>
    <b>{props.selection as string}</b>
    @try {
      <>
        <span>{props.selection as string}</span>
        @if (props.wait) { <Hold wait={props.wait} next={props.next} /> }
      </>
    } @pending { <p>{'pending'}</p> }
    <Gate gate={props.gate} />
  </main>
}
function SelfSuspending(props) @{
  const [wait, setWait] = useState(null);
  props.controls.setWait = setWait;
  if (wait !== null) use(wait);
  <s>{'self'}</s>
}
export function JsxApp(props) @{
  <main>
    <b>{props.selection as string}</b>
    <Suspense fallback={<p>{('pending ' + props.selection) as string}</p>}>
      <span>{props.selection as string}</span>
      @if (props.wait) { <Hold wait={props.wait} /> }
      <SelfSuspending controls={props.controls} />
    </Suspense>
    <Gate gate={props.gate} />
  </main>
}
function Fails(props) @{
  const [failed, setFailed] = useState(false);
  props.controls.fail = () => setFailed(true);
  if (failed) throw new Error('boom');
  <q>{'ok'}</q>
}
export function CatchApp(props) @{
  <main>
    <b>{props.selection as string}</b>
    <ErrorBoundary key="boundary" fallback={<p>{('caught ' + props.selection) as string}</p>}>
      <Fails controls={props.controls} />
    </ErrorBoundary>
    <Gate gate={props.gate} />
  </main>
}
export function StatefulApp(props) @{
  const [view, setView] = useState(() => props.initial);
  props.controls.setView = setView;
  <App selection={view.selection} wait={view.wait} gate={view.gate} />
}

function LinkedValue(props) @{
  const [source, setSource] = useState('A');
  const [value, , getValue] = useLinkedState(source, (next) => next);
  props.controls.setSource = setSource;
  props.controls.getValue = getValue;
  <em>{value as string}</em>
}
const MemoLinkedValue = memo(LinkedValue);
function Sibling(props) @{
  const [resource, setResource] = useState(null);
  props.controls.setResource = setResource;
  if (!props.ready && resource !== null) use(resource);
  <i>{'ready'}</i>
}
export function LinkedApp(props) @{
  <main>
    @try {
      <>
        <MemoLinkedValue controls={props.controls} />
        <Sibling controls={props.controls} ready={props.ready} />
      </>
    } @pending { <p>{'pending'}</p> }
    <Gate gate={props.gate} />
  </main>
}
`;

describe.each([false, true])('Boundaries after a rolled-back root render (dev=%s)', (dev) => {
	const { App, JsxApp, CatchApp, StatefulApp, LinkedApp } = loadCompiledFixtureSource<
		Record<'App' | 'JsxApp' | 'CatchApp' | 'StatefulApp' | 'LinkedApp', any>
	>(ROLLED_BACK_REVEAL, {
		id: `/src/rolled-back-reveal-${dev ? 'dev' : 'prod'}.tsrx`,
		mode: 'client',
		compileOptions: { strong: true, dev, hmr: false },
	});

	const never = () => new Promise<never>(() => {});

	function screen(root: ReturnType<typeof mount>) {
		const visible = (node: Element) => (node as HTMLElement).style.display !== 'none';
		return {
			selection: root.find('b').textContent,
			primary: root
				.findAll('span, i, s')
				.filter(visible)
				.map((node) => node.textContent),
			fallback: root.findAll('p').map((node) => node.textContent),
		};
	}

	const pendingB = { selection: 'B', primary: [], fallback: ['pending'] };

	it('keeps the fallback through the rolled-back reveal and reveals on the next update', () => {
		const root = mount(App, { selection: 'A' });
		try {
			root.update(App, { selection: 'B', wait: never() });
			const primary = root.find('span');
			expect(screen(root)).toEqual(pendingB);

			root.update(App, { selection: 'A', gate: never() });
			expect(screen(root)).toEqual(pendingB);
			expect(root.find('span')).toBe(primary);

			root.update(App, { selection: 'C' });
			expect(screen(root)).toEqual({ selection: 'C', primary: ['C'], fallback: [] });
			expect(root.find('span')).toBe(primary);
		} finally {
			root.unmount();
		}
	});

	it('reveals when the sibling that rolled back the reveal resolves', async () => {
		const gate = deferred<void>();
		const root = mount(App, { selection: 'A' });
		try {
			root.update(App, { selection: 'B', wait: never() });
			root.update(App, { selection: 'A', gate: gate.promise });
			expect(screen(root)).toEqual(pendingB);

			await act(() => gate.resolve());
			expect(screen(root)).toEqual({ selection: 'A', primary: ['A'], fallback: [] });
			expect(root.find('u').textContent).toBe('gate');
		} finally {
			root.unmount();
		}
	});

	it('resumes with the committed inputs when its own wakeable settles', async () => {
		const wait = deferred<void>();
		const root = mount(App, { selection: 'A' });
		try {
			root.update(App, { selection: 'B', wait: wait.promise });
			root.update(App, { selection: 'X', gate: never() });
			expect(screen(root)).toEqual(pendingB);

			await act(() => wait.resolve());
			expect(screen(root)).toEqual({ selection: 'B', primary: ['B', 'ready'], fallback: [] });
		} finally {
			root.unmount();
		}
	});

	it('resumes JSX Suspense children from the committed render', async () => {
		const controls = {};
		const wait = deferred<void>();
		const root = mount(JsxApp, { selection: 'A', controls });
		try {
			root.update(JsxApp, { selection: 'B', wait: wait.promise, controls });
			root.update(JsxApp, { selection: 'X', gate: never(), controls });
			expect(screen(root)).toEqual({ selection: 'B', primary: [], fallback: ['pending B'] });

			await act(() => wait.resolve());
			expect(screen(root)).toEqual({
				selection: 'B',
				primary: ['B', 'ready', 'self'],
				fallback: [],
			});
		} finally {
			root.unmount();
		}
	});

	it('mounts the committed JSX fallback when a child suspends after a rolled-back render', () => {
		const controls = {} as { setWait(wait: Promise<unknown>): void };
		const root = mount(JsxApp, { selection: 'A', controls });
		try {
			root.update(JsxApp, { selection: 'X', gate: never(), controls });
			flushSync(() => controls.setWait(never()));
			expect(screen(root)).toEqual({ selection: 'A', primary: [], fallback: ['pending A'] });
		} finally {
			root.unmount();
		}
	});

	it('mounts the committed ErrorBoundary fallback when a child throws after a rolled-back render', () => {
		const controls = {} as { fail(): void };
		const root = mount(CatchApp, { selection: 'A', controls });
		try {
			root.update(CatchApp, { selection: 'X', gate: never(), controls });
			expect(root.find('b').textContent).toBe('A');
			flushSync(() => controls.fail());
			expect(root.findAll('p').map((node) => node.textContent)).toEqual(['caught A']);
		} finally {
			root.unmount();
		}
	});

	it('mounts a fresh primary after a rolled-back restart of a never-revealed boundary', () => {
		const root = mount(App, { selection: 'A', wait: never() });
		try {
			expect(screen(root)).toEqual({ selection: 'A', primary: [], fallback: ['pending'] });

			root.update(App, { selection: 'B', gate: never() });
			expect(screen(root)).toEqual({ selection: 'A', primary: [], fallback: ['pending'] });

			root.update(App, { selection: 'C' });
			expect(screen(root)).toEqual({ selection: 'C', primary: ['C'], fallback: [] });
			expect(root.findAll('span')).toHaveLength(1);
		} finally {
			root.unmount();
		}
	});

	it('keeps a resumed restart hidden while it suspends again', async () => {
		const wait = deferred<void>();
		const next = deferred<void>();
		const root = mount(App, { selection: 'A', wait: wait.promise, next: next.promise });
		try {
			root.update(App, { selection: 'B', gate: never() });
			expect(screen(root)).toEqual({ selection: 'A', primary: [], fallback: ['pending'] });

			// The retry renders the committed inputs and suspends on `next`.
			await act(() => wait.resolve());
			expect(screen(root)).toEqual({ selection: 'A', primary: [], fallback: ['pending'] });

			await act(() => next.resolve());
			expect(screen(root)).toEqual({
				selection: 'A',
				primary: ['A', 'ready', 'next'],
				fallback: [],
			});
			expect(root.findAll('span')).toHaveLength(1);
		} finally {
			root.unmount();
		}
	});

	it('keeps the fallback when a transition reveal is held at the root', async () => {
		const gate = deferred<void>();
		const controls = {} as { setView(view: object): void };
		const root = mount(StatefulApp, { controls, initial: { selection: 'A' } });
		try {
			flushSync(() => controls.setView({ selection: 'B', wait: never() }));
			flushSync(() =>
				startTransition(() => controls.setView({ selection: 'A', gate: gate.promise })),
			);
			expect(screen(root)).toEqual(pendingB);

			await act(() => gate.resolve());
			expect(screen(root)).toEqual({ selection: 'A', primary: ['A'], fallback: [] });
		} finally {
			root.unmount();
		}
	});

	it('reveals on an urgent update after a held transition reveal', () => {
		const controls = {} as { setView(view: object): void };
		const root = mount(StatefulApp, { controls, initial: { selection: 'A' } });
		try {
			flushSync(() => controls.setView({ selection: 'B', wait: never() }));
			flushSync(() => startTransition(() => controls.setView({ selection: 'A', gate: never() })));
			expect(screen(root)).toEqual(pendingB);

			flushSync(() => controls.setView({ selection: 'C' }));
			expect(screen(root)).toEqual({ selection: 'C', primary: ['C'], fallback: [] });
		} finally {
			root.unmount();
		}
	});

	it('still publishes a linked draft parked on the boundary', () => {
		const controls = {} as {
			setSource(next: string): void;
			getValue(): string;
			setResource(next: Promise<unknown>): void;
		};
		const root = mount(LinkedApp, { controls });
		try {
			// The draft completes in its own render, then a sibling suspends the
			// boundary. The draft stays visible but uncommitted until the reveal.
			flushSync(() => {
				controls.setSource('B');
				controls.setResource(never());
			});
			expect(root.findAll('p')).toHaveLength(1);
			expect(root.find('em').textContent).toBe('B');
			expect(controls.getValue()).toBe('A');

			root.update(LinkedApp, { controls, ready: true, gate: never() });
			expect(root.findAll('p')).toHaveLength(1);
			expect(controls.getValue()).toBe('A');

			// The memoized draft does not render again, so only the parked
			// publication can commit it.
			root.update(LinkedApp, { controls, ready: true });
			expect(root.findAll('p')).toHaveLength(0);
			expect(root.find('em').textContent).toBe('B');
			expect(controls.getValue()).toBe('B');
		} finally {
			root.unmount();
		}
	});
});

const supersededArmPath = 'packages/octane/tests/_fixtures/suspense-superseded-arm.tsrx';

// Strong development and production output reach these runtime paths through
// different emitted code, so the fixture compiles explicitly in both modes.
function loadSupersededArmFixture(dev: boolean) {
	return loadCompiledFixtureSource<typeof import('./_fixtures/suspense-superseded-arm.tsrx')>(
		readFileSync(supersededArmPath, 'utf8'),
		{
			id: supersededArmPath,
			mode: 'client',
			compileOptions: { strong: true, dev, hmr: false },
		},
	);
}

type Priority = 'urgent' | 'transition';

function mountSupersededArm(App: ComponentBody<SupersededArmProps>) {
	const mounted = mount(App, { selection: 'A' });
	return {
		mounted,
		render(props: SupersededArmProps, priority: Priority = 'urgent') {
			return act(() => {
				if (priority === 'transition') startTransition(() => mounted.root.render(App, props));
				else mounted.root.render(App, props);
			});
		},
		content() {
			return mounted
				.findAll('b, span, i, p')
				.map((node) => `${node.localName}:${node.textContent}`);
		},
	};
}

for (const dev of [true, false]) {
	describe(`a pending arm superseded beside a replaced sibling (${dev ? 'dev' : 'prod'})`, () => {
		const fixture = loadSupersededArmFixture(dev);
		const siblings = {
			'keyed component': fixture.KeyedComponentSibling,
			'keyed @for row': fixture.KeyedForSibling,
			'@if/@else arm': fixture.BranchSibling,
		};
		const orders: Array<[Priority, Priority]> = [
			['urgent', 'urgent'],
			['urgent', 'transition'],
			['transition', 'transition'],
			['transition', 'urgent'],
		];

		for (const [sibling, App] of Object.entries(siblings)) {
			for (const [pendingPriority, finalPriority] of orders) {
				for (const final of ['A', 'C']) {
					it(`keeps the ${sibling} when a ${finalPriority} update to ${final} supersedes a ${pendingPriority} suspended B`, async () => {
						const app = mountSupersededArm(App);
						try {
							expect(app.content()).toEqual(['b:A', 'span:A']);
							await app.render({ selection: 'B', wait: new Promise(() => {}) }, pendingPriority);
							if (pendingPriority === 'urgent') {
								expect(app.mounted.find('b').textContent).toBe('B');
								expect(app.mounted.find('p').textContent).toBe('pending');
							} else {
								// The boundary holds its committed primary instead.
								expect(app.mounted.findAll('p')).toHaveLength(0);
								expect(app.mounted.find('span').textContent).toBe('A');
							}

							await app.render({ selection: final }, finalPriority);
							expect(app.content()).toEqual([`b:${final}`, `span:${final}`]);
						} finally {
							app.mounted.unmount();
						}
					});
				}
			}
		}

		for (const sibling of ['keyed component', '@if/@else arm'] as const) {
			it(`bounds a still-suspended arm after the ${sibling} before it is replaced`, async () => {
				const app = mountSupersededArm(siblings[sibling]);
				const pending = deferred<void>();
				try {
					await app.render({ selection: 'B', wait: pending.promise });
					expect(app.mounted.find('p').textContent).toBe('pending');
					// The replacement commits while the arm is still pending.
					await app.render({ selection: 'C', wait: pending.promise });
					expect(app.mounted.find('p').textContent).toBe('pending');

					await act(() => pending.resolve());
					expect(app.content()).toEqual(['b:C', 'span:C', 'i:ready']);
					await app.render({ selection: 'D' });
					expect(app.content()).toEqual(['b:D', 'span:D']);
				} finally {
					app.mounted.unmount();
				}
			});
		}

		it('rolls back a root update that superseded the arm, then applies the next update', () => {
			const mounted = mount(fixture.RootGatedSibling, { selection: 'A' });
			const content = () => mounted.html().replace(/<!--[^>]*-->/g, '');
			try {
				mounted.update(fixture.RootGatedSibling, { selection: 'B', wait: new Promise(() => {}) });
				const pendingScreen = content();
				expect(mounted.find('p').textContent).toBe('pending');

				// The arm is superseded and A staged while the boundary stays pending on
				// another arm. A later sibling then suspends the root, so the whole
				// update is discarded.
				const never = new Promise(() => {});
				mounted.update(fixture.RootGatedSibling, { selection: 'A', second: never, gate: never });
				expect(content()).toBe(pendingScreen);

				mounted.update(fixture.RootGatedSibling, { selection: 'C' });
				expect(mounted.findAll('b, span, i, p, u').map((node) => node.textContent)).toEqual([
					'C',
					'C',
					'gate',
				]);
			} finally {
				mounted.unmount();
			}
		});

		it('removes the content an arm retry inserted before it suspended again', async () => {
			const app = mountSupersededArm(fixture.PartialRetryArm);
			const first = deferred<void>();
			try {
				await app.render({ selection: 'B', wait: first.promise, second: new Promise(() => {}) });
				expect(app.mounted.find('p').textContent).toBe('pending');
				await act(() => first.resolve());
				expect(app.mounted.find('p').textContent).toBe('pending');

				await app.render({ selection: 'C' });
				expect(app.content()).toEqual(['b:C', 'span:C']);
			} finally {
				app.mounted.unmount();
			}
		});
	});
}
