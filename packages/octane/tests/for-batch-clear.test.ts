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
	LargeRefRows,
	PortalRows,
	OwnedParentRows,
	OwnedParentEmptyRows,
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

	it('runs every ref cleanup when a large owned-parent list clears', () => {
		const r = mount(LargeRefRows);
		expect(r.findAll('li')).toHaveLength(1000);
		resetLog();

		r.click('#clear');
		expect(r.findAll('li')).toHaveLength(0);
		expect(log.filter((entry) => entry === 'ref:cleanup')).toHaveLength(1000);
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

describe('forBlock — owned-parent clear', () => {
	it('keeps the @empty branch mounted while removing a large owned list', () => {
		const r = mount(OwnedParentEmptyRows, {});
		const parent = r.find('ul');
		const oldRows = r.findAll('li.row');
		expect(oldRows).toHaveLength(1000);
		r.click('#clear');
		expect(r.find('ul')).toBe(parent);
		expect(r.findAll('li.row')).toHaveLength(0);
		expect(oldRows[0].isConnected).toBe(false);
		expect(r.find('li.empty').textContent).toBe('No rows');
		r.click('#append');
		expect(r.findAll('li.empty')).toHaveLength(0);
		expect(r.findAll('li.row').map((row) => row.textContent)).toEqual(['d', 'e', 'f']);
		r.unmount();
	});

	it('restores a large owned list when the root suspends after mounting @empty', async () => {
		let resolve!: (value: string) => void;
		const suspended = new Promise<string>((done) => {
			resolve = done;
		});
		const r = mount(OwnedParentEmptyRows, { suspendOnClear: suspended });
		const original = r.findAll('li.row');
		r.click('#clear');
		const retained = r.findAll('li.row');
		expect(retained).toHaveLength(1000);
		expect(retained[0]).toBe(original[0]);
		expect(retained[999]).toBe(original[999]);
		expect(r.findAll('li.empty')).toHaveLength(0);
		resolve('ready');
		await suspended;
		await Promise.resolve();
		flushEffects();
		expect(r.findAll('li.row')).toHaveLength(0);
		expect(r.find('li.empty').textContent).toBe('No rows');
		r.unmount();
	});

	it('clears and fills the same list again without replacing its parent', () => {
		const r = mount(OwnedParentRows, {});
		const parent = r.find('ul');
		expect(r.findAll('li.row')).toHaveLength(1000);
		expect(r.findAll('li.row')[0].textContent).toBe('row-0');

		r.click('#clear');
		expect(r.find('ul')).toBe(parent);
		expect(r.findAll('li.row')).toHaveLength(0);
		r.click('#append');
		expect(r.find('ul')).toBe(parent);
		expect(r.findAll('li.row').map((row) => row.textContent)).toEqual(['d', 'e', 'f']);
		r.unmount();
	});

	it('restores connected rows when a later part of the root suspends', async () => {
		let resolve!: (value: string) => void;
		const suspended = new Promise<string>((done) => {
			resolve = done;
		});
		const r = mount(OwnedParentRows, { suspendOnClear: suspended });
		const original = r.findAll('li.row');

		r.click('#clear');
		expect(r.findAll('li.row')).toHaveLength(1000);
		expect(r.findAll('li.row')[0]).toBe(original[0]);
		expect(r.findAll('li.row')[999]).toBe(original[999]);
		expect(original.every((row) => row.isConnected)).toBe(true);

		resolve('ready');
		await suspended;
		await Promise.resolve();
		flushEffects();
		expect(r.findAll('li.row')).toHaveLength(0);
		r.click('#append');
		expect(r.findAll('li.row').map((row) => row.textContent)).toEqual(['d', 'e', 'f']);
		r.unmount();
	});

	it('keeps a foreign node added during the clear render', () => {
		const r = mount(OwnedParentRows, { insertForeignOnClear: true });
		r.click('#clear');
		expect(r.findAll('li.row')).toHaveLength(0);
		expect(r.find('#foreign').textContent).toBe('external');
		r.unmount();
	});

	it('restores the original rows after two clearing updates suspend together', async () => {
		let resolve!: (value: string) => void;
		const suspended = new Promise<string>((done) => {
			resolve = done;
		});
		const r = mount(OwnedParentRows, {
			suspendOnClear: suspended,
			clearTwiceOnSuspend: true,
		});
		const original = r.findAll('li.row');
		r.click('#clear');
		const retained = r.findAll('li.row');
		expect(retained).toHaveLength(1000);
		expect(retained[0]).toBe(original[0]);
		expect(retained[999]).toBe(original[999]);
		resolve('ready');
		await suspended;
		await Promise.resolve();
		flushEffects();
		expect(r.findAll('li.row')).toHaveLength(0);
		r.click('#append');
		expect(r.findAll('li.row').map((row) => row.textContent)).toEqual(['d', 'e', 'f']);
		r.unmount();
	});

	it('restores the original order after a reorder and clear suspend in the same root attempt', async () => {
		let resolve!: (value: string) => void;
		const suspended = new Promise<string>((done) => {
			resolve = done;
		});
		const r = mount(OwnedParentRows, {
			suspendOnClear: suspended,
			reorderBeforeClearOnSuspend: true,
		});
		const original = r.findAll('li.row');
		r.click('#clear');
		const retained = r.findAll('li.row');
		expect(retained).toHaveLength(1000);
		expect(retained[0]).toBe(original[0]);
		expect(retained[999]).toBe(original[999]);
		resolve('ready');
		await suspended;
		await Promise.resolve();
		flushEffects();
		expect(r.findAll('li.row')).toHaveLength(0);
		r.click('#append');
		expect(r.findAll('li.row').map((row) => row.textContent)).toEqual(['d', 'e', 'f']);
		r.unmount();
	});

	it('reuses the original keyed rows when a later update supersedes a suspended clear', async () => {
		let resolve!: (value: string) => void;
		const suspended = new Promise<string>((done) => {
			resolve = done;
		});
		const r = mount(OwnedParentRows, { suspendOnClear: suspended });
		const original = r.findAll('li.row');
		r.click('#clear');
		r.click('#reverse');
		const rows = r.findAll('li.row');
		expect(rows).toHaveLength(1000);
		expect(rows[0]).toBe(original[999]);
		expect(rows[999]).toBe(original[0]);
		resolve('ready');
		await suspended;
		await Promise.resolve();
		flushEffects();
		expect(r.findAll('li.row')[0]).toBe(original[999]);
		r.unmount();
	});

	it('keeps refilled rows when clearing queues another update', () => {
		const r = mount(OwnedParentRows, { refillDuringClear: true });
		r.click('#clear');
		expect(r.findAll('li.row').map((row) => row.textContent)).toEqual(['d', 'e', 'f']);
		r.unmount();
	});
});
