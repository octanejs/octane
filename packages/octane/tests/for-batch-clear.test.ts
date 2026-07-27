// Regression: batchClearItems (the forBlock bulk-clear fast path, taken when a
// keyed list empties or every key is replaced) must tear down each item's full
// scope — including Blocks stashed on `_slots` (a cross-module `<Row/>` is a
// componentSlot there, NOT on `.children`), cleanup-returning refs, and portals
// in foreign targets. Previously it fired only `scope.cleanups`+`children`
// (gated on an effects-only flag), so component-row effect cleanups, ref-only
// rows, and portal DOM all leaked on clear/replace-all while the scattered
// per-item removal path handled them correctly.
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushEffects } from './_helpers';
import {
	ComponentRows,
	RefRows,
	PortalRows,
	SharedParentRows,
	log,
	resetLog,
} from './_fixtures/for-batch-clear.tsrx';

beforeEach(resetLog);

describe('forBlock — batch-clear disposal', () => {
	it('fires effect cleanups of cross-module component rows on clear', () => {
		const r = mount(ComponentRows);
		flushEffects();
		expect(log.filter((l) => l.startsWith('mount:'))).toEqual(['mount:1', 'mount:2', 'mount:3']);

		r.click('#clear');
		expect(r.findAll('li')).toHaveLength(0);
		// Passive destroys of the cleared rows defer to the passive flush
		// (React defers deletion passive destroys past the sync phase).
		flushEffects();
		expect(log.filter((l) => l.startsWith('cleanup:')).sort()).toEqual([
			'cleanup:1',
			'cleanup:2',
			'cleanup:3',
		]);
		r.unmount();
	});

	it('fires effect cleanups on full key replacement (remount path)', () => {
		const r = mount(ComponentRows);
		flushEffects();
		resetLog();

		r.click('#replace');
		flushEffects();
		expect(r.findAll('li').map((li) => li.textContent)).toEqual(['d', 'e', 'f']);
		expect(log.filter((l) => l.startsWith('cleanup:')).sort()).toEqual([
			'cleanup:1',
			'cleanup:2',
			'cleanup:3',
		]);
		expect(log.filter((l) => l.startsWith('mount:')).sort()).toEqual([
			'mount:4',
			'mount:5',
			'mount:6',
		]);
		r.unmount();
	});

	it('fires callback-ref cleanups on clear when rows have no effects', () => {
		const r = mount(RefRows);
		expect(log.filter((l) => l === 'ref:attach')).toHaveLength(3);

		r.click('#clear');
		expect(log.filter((l) => l === 'ref:cleanup')).toHaveLength(3);
		r.unmount();
	});

	it('removes portal DOM from the foreign target on clear', () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const r = mount(PortalRows, { target });
		expect(target.querySelectorAll('.tip')).toHaveLength(3);

		r.click('#clear');
		expect(r.findAll('li')).toHaveLength(0);
		expect(target.querySelectorAll('.tip')).toHaveLength(0);
		r.unmount();
		target.remove();
	});
});

// A list that OWNS its parent can be cleared by emptying the parent outright;
// one sharing its parent with other JSX may only take the span between its own
// markers. Both list sizes are exercised because the shared-parent clear picks
// its DOM strategy by size — the contract is identical either way: the items
// go, the neighbours stay, in order.
describe('forBlock — shared-parent bulk clear', () => {
	it.each([
		['a small list', 3],
		['a large list', 600],
	])('clears %s without disturbing its interleaved siblings', (_label, size) => {
		const r = mount(SharedParentRows, { size });
		expect(r.findAll('li.row')).toHaveLength(size);

		r.click('#clear');
		expect(r.findAll('li.row')).toHaveLength(0);
		expect(r.findAll('li').map((li) => li.id)).toEqual(['before', 'after']);
		r.unmount();
	});
});
