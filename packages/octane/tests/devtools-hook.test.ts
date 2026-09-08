// packages/octane/tests/devtools-hook.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import {
	__devtoolsRegisterRoot,
	__devtoolsUnregisterRoot,
	__devtoolsNotifyFlush,
	__devtoolsSetNameResolver,
	__devtoolsSetChildWalker,
	__devtoolsSetNativeReadInspector,
	__devtoolsSetTransitionCount,
	__devtoolsSetBoundaryState,
	__devtoolsClearBoundary,
	installDevtoolsGlobal,
	DEVTOOLS_HOOK_VERSION,
	type DevtoolsScopeLike,
} from '../src/devtools-hook';

// A structural fake scope — mirrors the fields the walker reads. Using fakes
// (not the real runtime) keeps this a focused unit of the walk/registry logic;
// the real end-to-end walk is covered behaviorally in Task 2.
function scope(partial: Partial<DevtoolsScopeLike>): DevtoolsScopeLike {
	return {
		kind: undefined,
		body: undefined,
		hooks: null,
		effectSlots: null,
		// The runtime allocates `children` lazily, so a scope with no child scopes has null
		// here — not an empty array. The fake mirrors that so the walk is exercised as shipped.
		children: null,
		$$ctxValues: null,
		...partial,
	} as DevtoolsScopeLike;
}

afterEach(() => {
	__devtoolsSetChildWalker(null);
	__devtoolsSetNativeReadInspector(null);
	delete (globalThis as any).__OCTANE_DEVTOOLS__;
});

describe('devtools hook registry', () => {
	it('uses the runtime child walker once per scope and drops obsolete inspection ids', () => {
		const leaf = scope({ body: { name: 'Leaf' } });
		const slotChild = scope({ body: { name: 'SlotChild' } });
		const disposed = scope({ body: { name: 'Disposed' }, disposed: true });
		const root = scope({
			kind: 'root',
			body: { name: 'Root' },
			children: [{ key: 0, scope: leaf }],
		});
		__devtoolsSetNameResolver((candidate) => candidate?.body?.name ?? 'Unknown');
		__devtoolsSetChildWalker((candidate, visit) => {
			if (candidate === root) {
				visit(leaf);
				visit(slotChild);
				visit(disposed);
			}
		});
		__devtoolsRegisterRoot(root);
		try {
			const hook = globalThis.__OCTANE_DEVTOOLS__!;
			const tree = hook.getTree();
			expect(tree[0].children.map((child) => child.name)).toEqual(['Leaf', 'SlotChild']);
			const id = tree[0].children[1].id;
			expect(hook.inspect(id)?.name).toBe('SlotChild');
			__devtoolsUnregisterRoot(root);
			expect(hook.inspect(id)).toBeNull();
		} finally {
			__devtoolsUnregisterRoot(root);
		}
	});

	it('adds native read metadata only through the optional selected-scope inspector', () => {
		const leaf = scope({ body: { name: 'Reader' } });
		const root = scope({
			kind: 'root',
			body: { name: 'Root' },
			children: [{ key: 0, scope: leaf }],
		});
		__devtoolsRegisterRoot(root);
		try {
			const hook = globalThis.__OCTANE_DEVTOOLS__!;
			const tree = hook.getTree();
			const id = tree[0].children[0].id;
			expect(hook.inspect(id)?.nativeReads).toBeUndefined();
			__devtoolsSetNativeReadInspector((candidate) =>
				candidate === leaf
					? {
							block: root,
							committed: {
								mixed: false,
								reads: [{ observedVersion: 1, currentVersion: 2, source: null }],
							},
							pending: [],
							retry: [],
						}
					: null,
			);
			expect(hook.inspect(id)?.nativeReads).toEqual({
				ownerId: tree[0].id,
				committed: {
					mixed: false,
					reads: [{ observedVersion: 1, currentVersion: 2, source: null }],
				},
				pending: [],
				retry: [],
			});
			expect(hook.inspect(tree[0].id)?.nativeReads).toBeUndefined();
		} finally {
			__devtoolsUnregisterRoot(root);
		}
	});

	it('installs a versioned global and enumerates registered roots as a tree', () => {
		__devtoolsSetNameResolver((b) => b?.body?.name ?? 'Unknown');
		const leaf = scope({ body: { name: 'Leaf' } });
		const root = scope({
			kind: 'root',
			body: { name: 'App' },
			children: [{ key: 0, scope: leaf }],
		});
		__devtoolsRegisterRoot(root);

		const hook = (globalThis as any).__OCTANE_DEVTOOLS__ as
			import('../src/devtools-hook').OctaneDevtoolsHook | undefined;
		expect(hook?.version).toBe(DEVTOOLS_HOOK_VERSION);
		const tree = hook!.getTree();
		expect(tree).toHaveLength(1);
		expect(tree[0].name).toBe('App');
		expect(tree[0].kind).toBe('root');
		expect(tree[0].children.map((c) => c.name)).toEqual(['Leaf']);
		__devtoolsUnregisterRoot(root);
	});

	it('drops a root on unregister', () => {
		const root = scope({ kind: 'root', body: { name: 'App' } });
		__devtoolsRegisterRoot(root);
		__devtoolsUnregisterRoot(root);
		const hook = (globalThis as any).__OCTANE_DEVTOOLS__!;
		expect(hook.getTree()).toEqual([]);
	});

	it('inspects a node from the last tree: classifies hook cells structurally', () => {
		__devtoolsSetNameResolver((b) => b?.body?.name ?? 'Unknown');
		const comp = scope({
			kind: 'root',
			body: { name: 'Stateful' },
			hooks: new Map<symbol | number, any>([
				[0, { value: 5, setter() {} }], // state
				[1, { current: null }], // ref
				[2, { deps: [], value: () => {} }], // memo/callback
			]),
			effectSlots: [{ effect: true, phase: 2 } as any],
		});
		__devtoolsRegisterRoot(comp);
		const hook = globalThis.__OCTANE_DEVTOOLS__!;
		const id = hook.getTree()[0].id;
		const detail = hook.inspect(id)!;
		expect(detail.name).toBe('Stateful');
		expect(detail.hooks.map((h) => h.kind).sort()).toEqual(
			['memo-or-callback', 'ref', 'state'].sort(),
		);
		expect(detail.hooks.find((h) => h.kind === 'state')!.value).toBe(5);
		expect(detail.effectCount).toBe(1);
		__devtoolsUnregisterRoot(comp);
	});

	it('notifyFlush fans out to subscribers and unsubscribe stops delivery', () => {
		installDevtoolsGlobal();
		const hook = (globalThis as any).__OCTANE_DEVTOOLS__!;
		let calls = 0;
		const off = hook.subscribe(() => {
			calls++;
		});
		__devtoolsNotifyFlush();
		__devtoolsNotifyFlush();
		off();
		__devtoolsNotifyFlush();
		expect(calls).toBe(2);
	});

	it('previews state without invoking object or array accessors', () => {
		let reads = 0;
		const object = Object.defineProperty({}, 'value', {
			enumerable: true,
			get() {
				reads++;
				return 'secret';
			},
		});
		const array = Object.defineProperty([], '0', {
			enumerable: true,
			get() {
				reads++;
				throw new Error('inspector evaluated an accessor');
			},
		});
		const comp = scope({
			kind: 'root',
			hooks: new Map([
				[0, { value: object, setter() {} }],
				[1, { value: array, setter() {} }],
			]),
		});
		__devtoolsRegisterRoot(comp);
		try {
			const hook = globalThis.__OCTANE_DEVTOOLS__!;
			const detail = hook.inspect(hook.getTree()[0].id)!;
			expect(reads).toBe(0);
			expect(detail.hooks.map((cell) => cell.value)).toEqual([{ value: '[Getter]' }, ['[Getter]']]);
		} finally {
			__devtoolsUnregisterRoot(comp);
		}
	});

	it('tracks transition count and boundary state via the hook', () => {
		installDevtoolsGlobal();
		const hook = (globalThis as any)
			.__OCTANE_DEVTOOLS__ as import('../src/devtools-hook').OctaneDevtoolsHook;
		__devtoolsSetTransitionCount(2);
		const slotA = {};
		__devtoolsSetBoundaryState(slotA, 2, false, 'List'); // pending
		let st = hook.getTransitionState();
		expect(st.pendingCount).toBe(2);
		expect(st.boundaries).toHaveLength(1);
		expect(st.boundaries[0]).toMatchObject({
			branch: 2,
			state: 'pending',
			hasResolved: false,
			label: 'List',
		});
		__devtoolsSetBoundaryState(slotA, 1, true, 'List'); // resolved (same slot → same id, updated in place)
		st = hook.getTransitionState();
		expect(st.boundaries).toHaveLength(1);
		expect(st.boundaries[0]).toMatchObject({ branch: 1, state: 'resolved', hasResolved: true });
		__devtoolsClearBoundary(slotA);
		expect(hook.getTransitionState().boundaries).toEqual([]);
	});
});
