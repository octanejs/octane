/**
 * Child-reconciliation remount-vs-reuse triad — ports facebook/react's
 * ReactMultiChild-test.js reconciliation suite plus the implicit/explicit-key
 * type-change cases from ReactIncrementalSideEffects-test.js.
 *
 * The contract under test (renderer-agnostic): for a child at a given position,
 *   - SAME element type + SAME key across renders => update IN PLACE (no remount,
 *     mount effect runs exactly once, no cleanup);
 *   - changing the element TYPE at that position => REMOUNT (old node + its mount
 *     effect torn down, fresh node + mount effect for the new type);
 *   - changing the KEY (same type) => unmount-old + mount-new.
 *
 * Node identity is decided through the shared identity harness (`data-k`), and
 * mount/cleanup lifecycle is observed through a `log` prop wired to each
 * fixture's useEffect. `update(Comp, props)` drives the prop-only re-renders.
 */
import { describe, it, expect } from 'vitest';
import { mount, flushEffects, createLog } from '../_helpers';
import {
	TypedLeaf,
	StableLeaf,
	KeyHost,
	ImplicitTypeChange,
	ExplicitTypeChange,
} from '../_fixtures/multichild-remount.tsrx';
import { snapshotKeyed, diffIdentity } from './_helpers/identity';

describe('child reconciliation — same type + same key updates in place', () => {
	// Per ReactMultiChild-test.js:28 'should update children when possible' —
	// re-rendering the same element type at the same position runs an update,
	// never a mount or unmount (componentDidMount once, componentWillUnmount never).
	it('re-rendering the same type + key updates in place (no remount, mount once)', () => {
		const log = createLog();
		const r = mount(StableLeaf, { text: 'one', log: log.push });
		flushEffects();
		expect(log.drain()).toEqual(['mount']);

		const before = snapshotKeyed(r.container);
		r.update(StableLeaf, { text: 'two', log: log.push });
		flushEffects();
		const after = snapshotKeyed(r.container);

		// Mount effect ran exactly once across both renders; no cleanup.
		expect(log.drain()).toEqual([]);
		// Same DOM node carried key "leaf"; content updated in place.
		const d = diffIdentity(before, after);
		expect(d.preserved).toEqual(['leaf']);
		expect(d.remounted).toEqual([]);
		expect(before.byKey.get('leaf')).toBe(after.byKey.get('leaf'));
		expect((after.byKey.get('leaf') as HTMLElement).textContent).toBe('two');
		r.unmount();
	});
});

describe('child reconciliation — changing element type forces a remount', () => {
	// Per ReactMultiChild-test.js:74 'should replace children with different
	// constructors' — swapping the host element TYPE at one position tears the old
	// node down and builds a fresh one (the data-k="leaf" node is a new instance).
	it('flipping the host element type at one position remounts the node', () => {
		const r = mount(TypedLeaf, { tag: 'span' });
		flushEffects();
		const before = snapshotKeyed(r.container);
		expect((before.byKey.get('leaf') as Element).getAttribute('data-tag')).toBe('span');

		r.update(TypedLeaf, { tag: 'div' });
		flushEffects();
		const after = snapshotKeyed(r.container);

		const d = diffIdentity(before, after);
		// Same key "leaf" still present, but a DIFFERENT DOM node => remount.
		expect(d.remounted).toEqual(['leaf']);
		expect(d.preserved).toEqual([]);
		expect(before.byKey.get('leaf')).not.toBe(after.byKey.get('leaf'));
		expect((after.byKey.get('leaf') as Element).getAttribute('data-tag')).toBe('div');
		r.unmount();
	});
});

describe('child reconciliation — changing the key forces unmount-old + mount-new', () => {
	// Per ReactMultiChild-test.js:158 'should replace children with different
	// keys' — same component type but a new key is a brand-new child: the old
	// instance unmounts (componentWillUnmount) and a new one mounts
	// (componentDidMount). Mount fires twice total, unmount once.
	it('changing a keyed child component key unmounts the old and mounts the new', () => {
		const log = createLog();
		const r = mount(KeyHost, { k: 'keyA', log: log.push });
		flushEffects();
		expect(log.drain()).toEqual(['mount:keyA']);

		const before = snapshotKeyed(r.container);
		expect(before.order).toEqual(['keyA']);

		r.update(KeyHost, { k: 'keyB', log: log.push });
		flushEffects();
		const after = snapshotKeyed(r.container);

		// Old key gone, new key mounted: cleanup of keyA then mount of keyB.
		expect(log.drain()).toEqual(['cleanup:keyA', 'mount:keyB']);
		const d = diffIdentity(before, after);
		expect(after.order).toEqual(['keyB']);
		expect(d.removed).toEqual(['keyA']);
		expect(d.added).toEqual(['keyB']);
		r.unmount();
	});
});

describe('child reconciliation — type change at one position, implicit keys', () => {
	// Per ReactIncrementalSideEffects-test.js:185 'can delete a child that changes
	// type - implicit keys'. The conditional slot swaps ClassLike -> FunctionLike
	// -> text -> nothing with NO explicit keys, followed by a constant "Trail"
	// sibling. Each type change remounts the slot (old cleanup, new mount); the
	// trailing node is preserved across the whole sequence.
	it('swapping the slot type (implicit keys) remounts the slot, preserves the trailing sibling', () => {
		const log = createLog();
		const r = mount(ImplicitTypeChange, { useClass: true, log: log.push });
		flushEffects();
		expect(log.drain()).toEqual(['mount:Class']);

		const s0 = snapshotKeyed(r.container);
		expect(s0.order).toEqual(['slot', 'trail']);
		expect((s0.byKey.get('slot') as Element).getAttribute('data-prop')).toBe('Class');

		// Class -> Function: Class unmounts, Function mounts. Trail untouched.
		r.update(ImplicitTypeChange, { useFunction: true, log: log.push });
		flushEffects();
		const s1 = snapshotKeyed(r.container);
		expect(log.drain()).toEqual(['cleanup:Class', 'mount:Function']);
		expect((s1.byKey.get('slot') as Element).getAttribute('data-prop')).toBe('Function');
		expect(s1.byKey.get('trail')).toBe(s0.byKey.get('trail')); // sibling preserved

		// Function -> text: Function unmounts (no component => no mount log).
		r.update(ImplicitTypeChange, { useText: true, log: log.push });
		flushEffects();
		const s2 = snapshotKeyed(r.container);
		expect(log.drain()).toEqual(['cleanup:Function']);
		expect((s2.byKey.get('slot') as Element).getAttribute('data-prop')).toBe('Text');
		expect(s2.byKey.get('trail')).toBe(s0.byKey.get('trail'));

		// -> nothing: slot empties, Trail still there.
		r.update(ImplicitTypeChange, { log: log.push });
		flushEffects();
		const s3 = snapshotKeyed(r.container);
		expect(log.drain()).toEqual([]);
		expect(s3.byKey.has('slot')).toBe(false);
		expect(s3.order).toEqual(['trail']);
		expect(s3.byKey.get('trail')).toBe(s0.byKey.get('trail'));
		r.unmount();
	});
});

describe('child reconciliation — type change at one position, explicit keys', () => {
	// Per ReactIncrementalSideEffects-test.js:247 'can delete a child that changes
	// type - explicit keys'. ClassLike key="a" -> FunctionLike key="a": even with
	// a matching explicit key, a differing element TYPE still forces a remount
	// (cleanup old, mount new). Trailing sibling preserved.
	it('swapping the slot type with matching explicit keys still remounts', () => {
		const log = createLog();
		const r = mount(ExplicitTypeChange, { useClass: true, log: log.push });
		flushEffects();
		expect(log.drain()).toEqual(['mount:Class']);

		const s0 = snapshotKeyed(r.container);
		expect(s0.order).toEqual(['slot', 'trail']);
		expect((s0.byKey.get('slot') as Element).getAttribute('data-prop')).toBe('Class');

		r.update(ExplicitTypeChange, { useFunction: true, log: log.push });
		flushEffects();
		const s1 = snapshotKeyed(r.container);
		// Same key "a" but different type => remount.
		expect(log.drain()).toEqual(['cleanup:Class', 'mount:Function']);
		const d = diffIdentity(s0, s1);
		expect(d.remounted).toEqual(['slot']);
		expect((s1.byKey.get('slot') as Element).getAttribute('data-prop')).toBe('Function');
		expect(s1.byKey.get('trail')).toBe(s0.byKey.get('trail'));

		r.update(ExplicitTypeChange, { log: log.push });
		flushEffects();
		const s2 = snapshotKeyed(r.container);
		expect(log.drain()).toEqual(['cleanup:Function']);
		expect(s2.byKey.has('slot')).toBe(false);
		expect(s2.order).toEqual(['trail']);
		expect(s2.byKey.get('trail')).toBe(s0.byKey.get('trail'));
		r.unmount();
	});
});
