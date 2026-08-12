import { afterEach, describe, expect, it } from 'vitest';

import { mount } from '../../../octane/tests/_helpers';
import {
	BoundaryFixture,
	boundaryEvents,
	resetBoundaryEvents,
} from '../_fixtures/renderer-boundary.tsrx';

let unmount: (() => void) | undefined;

afterEach(() => {
	unmount?.();
	unmount = undefined;
	resetBoundaryEvents();
});

describe('react-window renderer feasibility boundary', () => {
	it('keeps keyed dynamic row-component state independent across sibling lists', () => {
		const result = mount(BoundaryFixture);
		unmount = result.unmount;

		const left = result.find('[data-row="left-0"]');
		const right = result.find('[data-row="right-0"]');
		result.click('[data-row="left-0"]');

		expect(left).toBe(result.find('[data-row="left-0"]'));
		expect(result.find('[data-row="left-0"]').textContent).toBe('left:0:1');
		expect(right).toBe(result.find('[data-row="right-0"]'));
		expect(result.find('[data-row="right-0"]').textContent).toBe('right:0:0');
	});

	it('forwards exact style, ARIA, caller props, and stable outer imperative refs', () => {
		const result = mount(BoundaryFixture);
		unmount = result.unmount;

		const row = result.find('[data-row="left-0"]') as HTMLElement;
		expect(row.getAttribute('role')).toBe('listitem');
		expect(row.getAttribute('aria-posinset')).toBe('1');
		expect(row.style.transform).toBe('translateY(0px)');
		expect(row.style.height).toBe('20px');
		// Each imperative ref first detaches the handle created before the outer
		// element existed, then attaches the element-backed handle.
		expect(boundaryEvents.refValues).toEqual([null, null, 'left', 'right']);

		result.update(BoundaryFixture);
		expect(boundaryEvents.refValues).toEqual([null, null, 'left', 'right']);
		result.unmount();
		unmount = undefined;
		expect(boundaryEvents.refValues).toEqual([null, null, 'left', 'right', null, null]);
	});
});
