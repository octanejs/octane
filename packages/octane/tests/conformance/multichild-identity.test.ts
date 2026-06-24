/**
 * Keyed child-reconciliation identity battery — ports the renderer-agnostic
 * behaviors from facebook/react's ReactMultiChildReconcile-test.js, which pins
 * which keyed children keep their instance vs get remounted across reorders,
 * inserts and removes.
 *
 * Octane keeps its LIS reconciler (minimal moves) — see
 * docs/react-parity-migration-plan.md §6.1 — so the physical move *sequence*
 * intentionally differs from React's lastPlacedIndex pass. The contract these
 * tests assert is the part both runtimes share: survivor node-identity
 * preservation + final order. The harness (../_helpers/identity) never inspects
 * which nodes physically moved.
 */
import { describe, it, expect } from 'vitest';
import { flushSync } from '../../src/index.js';
import { mount } from '../_helpers';
import { IdentityList, StatefulIdentityList } from '../_fixtures/multichild-identity.tsrx';
import { snapshotKeyed, diffIdentity } from './_helpers/identity';

type Item = { id: number; label: string };
const items = (...ids: number[]): Item[] =>
	ids.map((id) => ({ id, label: String.fromCharCode(96 + id) }));

describe('keyed reconciliation — identity preservation', () => {
	// Per ReactMultiChildReconcile-test.js:612 "should reverse the order of two
	// children" + :630 (more than two). A full reverse moves every node but
	// remounts none.
	it('reverse preserves all instances (pure moves)', () => {
		const r = mount(IdentityList, { items: items(1, 2, 3, 4) });
		const before = snapshotKeyed(r.container);
		r.update(IdentityList, { items: items(4, 3, 2, 1) });
		const after = snapshotKeyed(r.container);

		expect(after.order).toEqual(['4', '3', '2', '1']);
		expect(diffIdentity(before, after).remounted).toEqual([]);
		// Spot-check actual node identity survived the reverse.
		expect(after.byKey.get('1')).toBe(before.byKey.get('1'));
		expect(after.byKey.get('4')).toBe(before.byKey.get('4'));
		r.unmount();
	});

	// Per ReactMultiChildReconcile-test.js:650 "cycle order correctly". Rotating
	// [1,2,3,4] -> [2,3,4,1] preserves every instance.
	it('cycle/rotate preserves all instances', () => {
		const r = mount(IdentityList, { items: items(1, 2, 3, 4) });
		const before = snapshotKeyed(r.container);
		r.update(IdentityList, { items: items(2, 3, 4, 1) });
		const after = snapshotKeyed(r.container);

		expect(after.order).toEqual(['2', '3', '4', '1']);
		expect(diffIdentity(before, after).remounted).toEqual([]);
		r.unmount();
	});

	// Per ReactMultiChildReconcile-test.js:921/:940 "insert ... new child in the
	// middle". Only the new key mounts; existing keys keep identity regardless of
	// insert position.
	it('inserting in the middle preserves existing instances', () => {
		const r = mount(IdentityList, { items: items(1, 2, 4) });
		const before = snapshotKeyed(r.container);
		r.update(IdentityList, { items: items(1, 2, 3, 4) });
		const after = snapshotKeyed(r.container);

		const d = diffIdentity(before, after);
		expect(after.order).toEqual(['1', '2', '3', '4']);
		expect(d.remounted).toEqual([]);
		expect(d.added).toEqual(['3']);
		r.unmount();
	});

	// Per ReactMultiChildReconcile-test.js:784/:823 "append/prepend children".
	// Survivors keep identity whether new children arrive at the front or back.
	it('prepend + append preserve existing instances', () => {
		const r = mount(IdentityList, { items: items(2, 3) });
		const before = snapshotKeyed(r.container);
		r.update(IdentityList, { items: items(1, 2, 3, 4) });
		const after = snapshotKeyed(r.container);

		const d = diffIdentity(before, after);
		expect(after.order).toEqual(['1', '2', '3', '4']);
		expect(d.remounted).toEqual([]);
		expect(d.added.slice().sort()).toEqual(['1', '4']);
		r.unmount();
	});

	// Per ReactMultiChildReconcile-test.js:576/:594 "remove nulled out children".
	// Removing a key unmounts only it; survivors keep identity.
	it('removing a child preserves the surviving instances', () => {
		const r = mount(IdentityList, { items: items(1, 2, 3, 4) });
		const before = snapshotKeyed(r.container);
		r.update(IdentityList, { items: items(1, 3, 4) });
		const after = snapshotKeyed(r.container);

		const d = diffIdentity(before, after);
		expect(after.order).toEqual(['1', '3', '4']);
		expect(d.remounted).toEqual([]);
		expect(d.removed).toEqual(['2']);
		r.unmount();
	});
});

describe('keyed reconciliation — identity reset', () => {
	// Per ReactMultiChildReconcile-test.js:311 "should reset internal state if
	// removed then readded". A key absent for a commit and re-added later gets a
	// NEW instance — identity is not cached across absence.
	it('a key removed then re-added is remounted (new instance)', () => {
		let setItems!: (v: Item[]) => void;
		const r = mount(StatefulIdentityList, {
			initial: items(1, 2, 3),
			expose: (s: (v: Item[]) => void) => (setItems = s),
		});
		const before = snapshotKeyed(r.container); // 1,2,3

		flushSync(() => setItems(items(1, 3))); // drop key 2
		flushSync(() => setItems(items(1, 2, 3))); // re-add key 2

		const after = snapshotKeyed(r.container);
		const d = diffIdentity(before, after);

		expect(after.order).toEqual(['1', '2', '3']);
		// 1 and 3 survived the whole sequence; 2 was remounted.
		expect(d.preserved.slice().sort()).toEqual(['1', '3']);
		expect(d.remounted).toEqual(['2']);
		r.unmount();
	});
});
