import { afterEach, describe, expect, it } from 'vitest';
import { layoutCellsForTests, recordLayoutCell, takeLayoutCell } from '../../src/layout';

const box = { left: 0, top: 0, width: 100, height: 100 };

afterEach(() => {
	layoutCellsForTests.reset();
});

describe('layoutId snapshot registry', () => {
	it('keeps every same-commit snapshot available until it is claimed', () => {
		const count = 300;
		for (let i = 0; i < count; i++) {
			recordLayoutCell(`hero-${i}`, box);
		}

		expect(layoutCellsForTests.size()).toBe(count);
		for (let i = 0; i < count; i++) {
			expect(takeLayoutCell(`hero-${i}`)).toEqual(box);
		}
		expect(layoutCellsForTests.size()).toBe(0);
	});

	it('clears unclaimed snapshots at the next microtask', async () => {
		recordLayoutCell('hero', box);
		expect(layoutCellsForTests.size()).toBe(1);

		await Promise.resolve();

		expect(layoutCellsForTests.size()).toBe(0);
		expect(takeLayoutCell('hero')).toBeUndefined();
	});
});
