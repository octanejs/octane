/** @jsxImportSource octane */
import * as PopperJs from '@popperjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManagedPopperHarness } from '../runtime/_fixtures/Harness.tsrx';
import { createRootTracker, settle } from './_helpers';

const { tracked, cleanup } = createRootTracker();
afterEach(function cleanupPopperSuite() {
	cleanup();
	vi.restoreAllMocks();
});

// Ported from packages/popper/upstream/tag/src/Popper.test.js
describe('Popper component', function popperSuite() {
	it('renders the expected markup', async function rendersExpectedMarkup() {
		const referenceElement = document.createElement('div');
		const root = tracked(ManagedPopperHarness, { referenceElement });
		settle();
		await Promise.resolve();
		settle();
		const popper = root.find('#popper') as HTMLElement;
		const arrow = root.find('#arrow') as HTMLElement;
		expect(popper.getAttribute('data-placement')).toBe('bottom');
		expect(popper.style.position).toBe('absolute');
		expect(popper.style.left).toBe('0px');
		expect(popper.style.top).toBe('0px');
		expect(popper.style.transform).toBe('translate(0px, 0px)');
		expect(arrow.style.position).toBe('absolute');
		expect(arrow.style.left).toBe('0px');
		expect(arrow.style.transform).toBe('translate(0px, 0px)');
	});

	it('handles changing refs gracefully', function handlesChangingRefsGracefully() {
		const referenceElement = document.createElement('div');
		expect(function mountTwice() {
			const first = tracked(ManagedPopperHarness, { referenceElement });
			settle();
			first.unmount();
			tracked(ManagedPopperHarness, { referenceElement });
			settle();
		}).not.toThrow();
	});

	it('accepts a ref function', async function acceptsRefFunction() {
		const myRef = vi.fn();
		const referenceElement = document.createElement('div');
		const root = tracked(ManagedPopperHarness, {
			referenceElement,
			innerRef: myRef,
		});
		settle();
		await Promise.resolve();
		settle();
		expect(myRef).toHaveBeenCalledWith(root.find('#popper'));
	});

	it('accepts a ref object', async function acceptsRefObject() {
		const myRef = { current: null as HTMLElement | null };
		const referenceElement = document.createElement('div');
		const root = tracked(ManagedPopperHarness, {
			referenceElement,
			innerRef: myRef,
		});
		settle();
		await Promise.resolve();
		settle();
		expect(myRef.current).toBe(root.find('#popper'));
	});

	it('accepts a `referenceElement` property', async function acceptsReferenceElementProperty() {
		const spy = vi.spyOn(PopperJs, 'createPopper');
		const virtualReferenceElement = {
			getBoundingClientRect: function getBoundingClientRect() {
				return {
					top: 10,
					left: 10,
					bottom: 20,
					right: 100,
					width: 90,
					height: 10,
					x: 10,
					y: 10,
					toJSON: function toJSON() {
						return {};
					},
				};
			},
		};
		tracked(ManagedPopperHarness, { referenceElement: virtualReferenceElement });
		settle();
		await Promise.resolve();
		settle();
		expect(spy.mock.calls[0][0]).toBe(virtualReferenceElement);
	});

	it('should update placement when property is changed', function shouldUpdatePlacementWhenPropertyIsChanged() {
		const referenceElement = document.createElement('div');
		const root = tracked(ManagedPopperHarness, {
			referenceElement,
			placement: 'top',
		});
		settle();
		expect(root.find('#popper').getAttribute('data-placement')).toBe('top');
		const popper = root.find('#popper');
		root.update(ManagedPopperHarness, {
			referenceElement,
			placement: 'bottom',
		});
		settle();
		expect(root.find('#popper')).toBe(popper);
		expect(popper.getAttribute('data-placement')).toBe('bottom');
	});
});
