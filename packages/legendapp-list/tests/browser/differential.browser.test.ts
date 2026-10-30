import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, callRef, Differential, scrollTo } from './_driver.ts';

// Real-Chromium differential parity: each scenario renders one `.tsrx` fixture through
// @octanejs/legendapp-list on Octane and through the published @legendapp/list/react
// 3.3.5 on React 19, applies the same steps to both pages, and requires identical
// settled observations: scroll geometry, mounted rows and their offsets, DOM order,
// getState() and the callback log.

const lists = new Differential();

beforeAll(() => lists.start(), 120_000);
afterAll(() => lists.stop());
afterEach(() => lists.close());

// useDOMOrder re-sorts the row elements 500ms after the last position change; DOM
// order is compared once that has run.
const REORDER = { wait: 650, order: true };
// Upstream passes childrenMode through to the scroll element, so React and Octane
// both report the same unknown DOM prop in development.
const CHILDREN_MODE_WARNING = { expectedErrors: 1 };
// After a reorder, sibling rows' effects run in DOM order on Octane and in slot order
// on React (see useDOMOrder), so the log is compared as a multiset.
const AFTER_REORDER = { unorderedLog: true };

describe('LegendList parity with @legendapp/list/react in Chromium', () => {
	// @parity-case differential:legendapp-list-scrolling
	it('virtualizes rows and runs every imperative scroll method', async () => {
		await lists.mount('Basic');
		const mounted = await lists.step('mount', async () => {});
		expect(mounted.rows.length).toBeGreaterThan(5);
		expect(mounted.rows.length).toBeLessThan(40);
		await lists.step('user scroll to 1200', scrollTo(1200), REORDER);
		await lists.step('scrollToIndex 60', callRef('scrollToIndex', { index: 60, animated: false }));
		await lists.step(
			'scrollToIndex with viewOffset and viewPosition',
			callRef('scrollToIndex', { index: 20, viewOffset: 24, viewPosition: 0.5, animated: false }),
		);
		await lists.step(
			'scrollToOffset 300',
			callRef('scrollToOffset', { offset: 300, animated: false }),
		);
		await lists.step('scrollToItem r45', (page) =>
			page.evaluate(() => {
				const list = window.__legend.ref.current;
				list.scrollToItem({ item: list.getState().data[45], animated: false });
			}),
		);
		await lists.step(
			'scrollIndexIntoView 90',
			callRef('scrollIndexIntoView', { index: 90, animated: false }),
		);
		const end = await lists.step(
			'scrollToEnd',
			callRef('scrollToEnd', { animated: false }),
			REORDER,
		);
		expect(end.state.isAtEnd).toBe(true);
		expect(end.log.some(([name]: [string]) => name === 'endReached')).toBe(true);
		await lists.step('append 20 rows at the end', act('append', 20));
		await lists.step(
			'scroll back to the start',
			callRef('scrollToOffset', { offset: 0, animated: false }),
			REORDER,
		);
		const removed = await lists.step('remove ten rows', act('remove', 3, 10));
		expect(removed.strayRows).toEqual([]);
		await lists.step('animated scrollToIndex', callRef('scrollToIndex', { index: 40 }), {
			wait: 1200,
		});
	});

	// @parity-case differential:legendapp-list-chat-follow
	it('opens a chat at the end, follows appends and keeps history steady', async () => {
		await lists.mount('Chat');
		const opened = await lists.step('opens at the end', async () => {});
		expect(opened.state.isAtEnd).toBe(true);
		expect(opened.log.some(([name]: [string]) => name === 'load')).toBe(true);
		await lists.step('append a message while following', act('append', 1, 'n'));
		await lists.step('grow the last message', act('resize', 'n40', 300));
		await lists.step('footer grows', act('footer', 80));
		await lists.step('scroll up into history', scrollTo(600));
		await lists.step('prepend older history', act('prepend', 10));
		await lists.step('a message above the viewport grows', act('resize', 'm5', 200));
		await lists.step('append while scrolled up', act('append', 2, 'q'));
		await lists.step('stop following', act('follow', false));
		await lists.step('scrollToEnd', callRef('scrollToEnd', { animated: false }));
		await lists.step('append after following stopped', act('append', 3, 'z'));
		await lists.step('dataVersion bump', act('bump'));
		await lists.step('replace the thread', act('replace', 25, 't'), REORDER);
	});

	// @parity-case differential:legendapp-list-picker
	it('recycles picker rows with separators, highlight and filtering', async () => {
		await lists.mount('Picker');
		await lists.step('mount', async () => {});
		await lists.step('highlight o3', act('highlight', 'o3'));
		await lists.step('scroll to the middle', scrollTo(700), REORDER);
		await lists.step('highlight o30', act('highlight', 'o30'));
		const filtered = await lists.step('filter down to five', act('remove', 5, 55), REORDER);
		expect(filtered.strayRows).toEqual([]);
		expect(filtered.domOrder).toEqual(['o0', 'o1', 'o2', 'o3', 'o4']);
		const cleared = await lists.step('filter to nothing', act('remove', 0, 5));
		expect(cleared.strayRows).toEqual([]);
		await lists.step('results return', act('replace', 40, 'f'));
	});

	// @parity-case differential:legendapp-list-restore-index
	it('restores an initial index with a view offset and always renders it', async () => {
		await lists.mount('Restore');
		const restored = await lists.step('restored', async () => {});
		expect(restored.rows.some((row: { id: string }) => row.id === 'w30')).toBe(true);
		await lists.step('scroll forward', scrollTo(2400), REORDER);
		await lists.step('prepend above the restored row', act('prepend', 4));
		await lists.step('resize a row above', act('resize', 'w31', 160));
	});

	// @parity-case differential:legendapp-list-anchored-end-space
	it('reserves anchored end space with a content inset adjustment', async () => {
		await lists.mount('Anchored');
		await lists.step('mount', async () => {});
		await lists.step('append the sent message', act('append', 1, 'sent'));
		const anchored = await lists.step('anchor the sent message', act('anchor', 12));
		expect(anchored.scrollHeight).toBeGreaterThan(anchored.clientHeight);
		await lists.step('the reply grows below the anchor', act('append', 1, 'reply'));
		await lists.step('scrollToEnd', callRef('scrollToEnd', { animated: false }));
		await lists.step('release the anchor', act('anchor', null));
	});

	// @parity-case differential:legendapp-list-empty
	it('shows ListEmptyComponent until data arrives', async () => {
		await lists.mount('Empty');
		const empty = await lists.step('empty', async () => {});
		expect(empty.rows).toEqual([]);
		await lists.step('data arrives', act('append', 30));
		await lists.step('data clears', act('remove', 0, 30));
	});

	// @parity-case differential:legendapp-list-horizontal
	it('virtualizes a horizontal list', async () => {
		await lists.mount('Horizontal');
		await lists.step('mount', async () => {});
		await lists.step('scroll left to 900', scrollTo(900, 'left'), REORDER);
		await lists.step('scrollToIndex 40', callRef('scrollToIndex', { index: 40, animated: false }));
		await lists.step('scrollToEnd', callRef('scrollToEnd', { animated: false }));
	});

	// @parity-case differential:legendapp-list-columns
	it('lays out columns with a column gap', async () => {
		await lists.mount('Columns');
		await lists.step('mount', async () => {});
		await lists.step('scroll to 800', scrollTo(800), REORDER);
		await lists.step('resize a row', act('resize', 'c31', 140));
		await lists.step('scrollToIndex 70', callRef('scrollToIndex', { index: 70, animated: false }));
	});

	// @parity-case differential:legendapp-list-sticky
	it('pins sticky headers and reports the active one', async () => {
		await lists.mount('Sticky');
		await lists.step('mount', async () => {});
		await lists.step('scroll past the second header', scrollTo(1400));
		await lists.step('scroll past the third header', scrollTo(2800));
		await lists.step('back to the top', scrollTo(0));
	});

	// @parity-case differential:legendapp-list-snap
	it('places snap anchors at snapToIndices', async () => {
		await lists.mount('Snap');
		const snapped = await lists.step('mount', async () => {});
		expect(snapped.snapAnchors).toHaveLength(4);
		await lists.step('a snapped row resizes', act('resize', 'n5', 200));
		await lists.step('scrollToIndex 20', callRef('scrollToIndex', { index: 20, animated: false }));
	});

	// @parity-case differential:legendapp-list-children
	it('renders children as list items', async () => {
		await lists.mount('Children');
		await lists.step('mount', async () => {}, CHILDREN_MODE_WARNING);
		await lists.step(
			'scrollToEnd',
			callRef('scrollToEnd', { animated: false }),
			CHILDREN_MODE_WARNING,
		);
	});

	// @parity-case differential:legendapp-list-row-hooks
	it('drives the recycling, viewability and last-item hooks', async () => {
		await lists.mount('Hooks');
		await lists.step('mount', async () => {});
		await lists.step('click the first row', (page) => page.click('[data-row="u0"]'));
		await lists.step('scroll so rows recycle', scrollTo(1500), { ...REORDER, ...AFTER_REORDER });
		await lists.step(
			'scroll to the end',
			callRef('scrollToEnd', { animated: false }),
			AFTER_REORDER,
		);
		await lists.step('append past the last row', act('append', 2), AFTER_REORDER);
	});
});
