// packages/octane/tests/devtools-hook.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import {
	__devtoolsRegisterRoot,
	__devtoolsUnregisterRoot,
	__devtoolsNotifyFlush,
	__devtoolsSetNameResolver,
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
		children: [],
		$$ctxValues: null,
		...partial,
	} as DevtoolsScopeLike;
}

afterEach(() => {
	delete (globalThis as any).__OCTANE_DEVTOOLS__;
});

describe('devtools hook registry', () => {
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
		const hook = (globalThis as any).__OCTANE_DEVTOOLS__!;
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
