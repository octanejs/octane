/** @jsxImportSource octane */
// Adapted from react-intersection-observer@10.1.0 src/__tests__/observe.test.ts
import { beforeEach, expect, test, vi } from 'vitest';
import { observe } from '../../src/index';
import { optionsToId } from '../../src/observe';
import {
	intersectionMockInstance,
	mockIsIntersecting,
	setupIntersectionMocking,
} from '../../src/test-utils';

beforeEach(function setupMocks() {
	setupIntersectionMocking(vi.fn);
});

// Per upstream/src/__tests__/observe.test.ts:5.
test('should be able to use observe', function shouldBeAbleToUseObserve() {
	const element = document.createElement('div');
	const cb = vi.fn();
	const unmount = observe(element, cb, { threshold: 0.1 });

	mockIsIntersecting(element, true);
	expect(cb).toHaveBeenCalled();

	// should be unmounted after unmount
	unmount();
	expect(function findMissing() {
		return intersectionMockInstance(element);
	}).toThrowErrorMatchingInlineSnapshot(
		`[Error: Failed to find IntersectionObserver for element. Is it being observed?]`,
	);
});

// Per upstream/src/__tests__/observe.test.ts:22.
test('should convert options to id', function shouldConvertOptionsToId() {
	expect(
		optionsToId({
			root: document.createElement('div'),
			rootMargin: '10px 10px',
			threshold: [0, 1],
		}),
	).toMatchInlineSnapshot(`"root_1,rootMargin_10px 10px,threshold_0,1"`);
	expect(
		optionsToId({
			root: null,
			rootMargin: '10px 10px',
			threshold: 1,
		}),
	).toMatchInlineSnapshot(`"root_0,rootMargin_10px 10px,threshold_1"`);
	expect(
		optionsToId({
			threshold: 0,
			trackVisibility: true,
			delay: 500,
		}),
	).toMatchInlineSnapshot(`"delay_500,threshold_0,trackVisibility_true"`);
	expect(
		optionsToId({
			threshold: 0,
		}),
	).toMatchInlineSnapshot(`"threshold_0"`);
	expect(
		optionsToId({
			scrollMargin: '10px 20px',
			threshold: [0, 0.5, 1],
		}),
	).toMatchInlineSnapshot(`"scrollMargin_10px 20px,threshold_0,0.5,1"`);
});
