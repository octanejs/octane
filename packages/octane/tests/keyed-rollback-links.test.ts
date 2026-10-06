// A held root render rolls a keyed list back to its committed rows. Inserts,
// removals and small displacements record only the rows they relink, and
// rollback walks the old chain through those links (journalForSlotLinks).
// Development builds also keep the full chain and throw when the two disagree,
// so each shape below checks the link record against the full one. Every case
// must keep the committed nodes, in order, until the gate settles, then show
// the last step.
import { describe, expect, it } from 'vitest';
import { flushEffects, mount } from './_helpers';
import { HeldRows, rows, type Row } from './_fixtures/keyed-rollback-links.tsrx';

const base = [1, 2, 3, 4, 5];

async function holdAndSettle(steps: number[][], before?: number[]) {
	let open!: (value: string) => void;
	const gate = new Promise<string>((resolve) => {
		open = resolve;
	});
	const r = mount(HeldRows, {
		initial: rows(base),
		before: before === undefined ? undefined : rows(before),
		steps: steps.map(rows),
		gate,
	});
	if (before !== undefined) r.click('#before');
	const committed = r.findAll('li.row');
	const committedLabels = committed.map((row) => row.textContent);

	r.click('#go');
	const held = r.findAll('li.row');
	expect(held.map((row) => row.textContent)).toEqual(committedLabels);
	expect(held).toHaveLength(committed.length);
	held.forEach((row, i) => expect(row).toBe(committed[i]));

	open('ready');
	await gate;
	await Promise.resolve();
	flushEffects();
	const last = steps[steps.length - 1];
	expect(r.findAll('li.row').map((row) => row.textContent)).toEqual(
		rows(last).map((row: Row) => row.label),
	);
	// Rows that survive the whole sequence keep their nodes.
	for (const row of r.findAll('li.row')) {
		const index = committedLabels.indexOf(row.textContent);
		if (index !== -1) expect(row).toBe(committed[index]);
	}
	r.unmount();
}

describe('keyed list rollback from link records', () => {
	it('restores an append', () => holdAndSettle([[1, 2, 3, 4, 5, 6, 7]]));

	it('restores a prepend', () => holdAndSettle([[0, 1, 2, 3, 4, 5]]));

	it('restores a middle insert', () => holdAndSettle([[1, 2, 9, 3, 4, 5]]));

	it('restores a middle removal', () => holdAndSettle([[1, 2, 4, 5]]));

	it('restores a removal at either end', () => holdAndSettle([[2, 3, 4]]));

	it('restores a removal after a committed reorder left the key map out of order', () =>
		holdAndSettle([[1, 4, 2, 5]], [1, 4, 3, 2, 5]));

	it('restores a two-row swap', () => holdAndSettle([[1, 4, 3, 2, 5]]));

	it('restores a swap after an earlier committed swap', () =>
		holdAndSettle([[4, 1, 3, 2, 5]], [1, 4, 3, 2, 5]));

	it('restores several link reconciles in one held render', () =>
		holdAndSettle([
			[1, 2, 3, 4, 5, 6],
			[1, 2, 4, 5, 6],
			[1, 5, 4, 2, 6],
			[0, 1, 5, 4, 2, 6],
		]));

	it('restores a link reconcile followed by a wholesale reorder', () =>
		holdAndSettle([
			[1, 4, 3, 2, 5],
			[5, 4, 3, 2, 1],
		]));

	it('restores a link reconcile followed by a full replace', () =>
		holdAndSettle([
			[1, 2, 3, 4, 5, 6],
			[10, 11, 12],
		]));
});
