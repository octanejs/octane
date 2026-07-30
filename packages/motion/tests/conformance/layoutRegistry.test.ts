import { afterEach, describe, expect, it } from 'vitest';
import { layoutCellsForTests, recordLayoutCell, takeLayoutCell } from '../../src/layout';

const box = { left: 0, top: 0, width: 100, height: 100 };

afterEach(() => {
	layoutCellsForTests.reset();
});

describe('layoutId snapshot registry', () => {
	it('keeps the registry bounded during a large synchronous deletion', () => {
		for (let i = 0; i < layoutCellsForTests.maxSize + 20; i++) {
			recordLayoutCell(`hero-${i}`, box);
		}

		expect(layoutCellsForTests.size()).toBe(layoutCellsForTests.maxSize);
		expect(takeLayoutCell('hero-0')).toBeUndefined();
		expect(takeLayoutCell(`hero-${layoutCellsForTests.maxSize + 19}`)).toEqual(box);
	});

	it('clears unclaimed snapshots at the next microtask', async () => {
		recordLayoutCell('hero', box);
		expect(layoutCellsForTests.size()).toBe(1);

		await Promise.resolve();

		expect(layoutCellsForTests.size()).toBe(0);
		expect(takeLayoutCell('hero')).toBeUndefined();
	});
});
