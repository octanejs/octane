import { beforeEach, describe, expect, it } from 'vitest';
import { flushSync } from 'octane';
import { currentValue } from '@octanejs/dnd-kit/utilities';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import { subSlot } from '../../src/internal';
import { HooksFixture, sharedSignal } from '../_fixtures/hooks.tsrx';

describe('public hook utilities', () => {
	beforeEach(() => {
		sharedSignal.value = 1;
	});

	it('keeps repeated hook call sites isolated and tracks signals and latest values', () => {
		const log: string[] = [];
		const latest: string[] = [];
		const firstElement = document.createElement('div');
		firstElement.id = 'first';
		const props = {
			value: 'one',
			multiplier: 2,
			synchronous: true,
			deepEnabled: true,
			element: firstElement,
			log(value: string) {
				log.push(value);
			},
			captureLatest(value: string) {
				latest.push(value);
			},
		};
		const mounted = mount(HooksFixture, props);
		flushEffects();

		expect(mounted.find('#read-latest').getAttribute('data-first')).toBe('first');
		expect(mounted.find('#read-latest').getAttribute('data-second')).toBe('second');
		expect(mounted.find('#computed').textContent).toBe('2');
		expect(mounted.find('#deep').textContent).toBe('1');
		expect(log.filter((entry) => entry.startsWith('constant:'))).toEqual([
			'constant:first',
			'constant:second',
		]);

		const secondElement = document.createElement('div');
		secondElement.id = 'second';
		mounted.update(HooksFixture, {
			...props,
			value: 'two',
			multiplier: 3,
			deepEnabled: false,
			element: secondElement,
		});
		flushEffects();
		mounted.click('#read-latest');
		expect(latest).toEqual(['two']);
		expect(mounted.find('#computed').textContent).toBe('3');
		expect(mounted.find('#maybe-deep').textContent).toBe('none');
		expect(log).toEqual(
			expect.arrayContaining(['immediate:two', 'layout:two', 'value:one->two', 'element:second']),
		);
		expect(log.filter((entry) => entry.startsWith('constant:'))).toHaveLength(2);

		flushSync(() => {
			sharedSignal.value = 4;
		});
		flushEffects();
		flushSync(() => {});
		expect(mounted.find('#computed').textContent).toBe('12');
		expect(mounted.find('#deep').textContent).toBe('4');
		mounted.unmount();
	});
});

describe('currentValue', () => {
	it('normalizes direct values, refs, null, and undefined', () => {
		const element = document.createElement('div');
		expect(currentValue(element)).toBe(element);
		expect(currentValue({ current: element })).toBe(element);
		expect(currentValue({ current: null })).toBeUndefined();
		expect(currentValue(null)).toBeUndefined();
		expect(currentValue(undefined)).toBeUndefined();
	});
});

describe('manual hook slots', () => {
	it('derives stable slots without colliding on symbol descriptions', () => {
		const first = Symbol('same-description');
		const second = Symbol('same-description');
		expect(subSlot(first, 'state')).toBe(subSlot(first, 'state'));
		expect(subSlot(first, 'state')).not.toBe(subSlot(first, 'effect'));
		expect(subSlot(first, 'state')).not.toBe(subSlot(second, 'state'));
		expect(subSlot(undefined, 'state')).toBeUndefined();
	});
});
