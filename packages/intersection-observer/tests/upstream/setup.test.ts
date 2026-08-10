/** @jsxImportSource octane */
// Adapted from react-intersection-observer@10.1.0 src/__tests__/setup.test.ts
import { afterEach, expect, test, vi } from 'vitest';
import { mockAllIsIntersecting, setupIntersectionMocking } from '../../src/test-utils';

vi.hoisted(function clearWindowVi() {
	// Clear the `vi` from global, so we can detect if this is a test env
	// @ts-expect-error intentional for the warning probe
	window.vi = undefined;
});

afterEach(function resetMocks() {
	vi.resetAllMocks();
});

// Per upstream/src/__tests__/setup.test.ts:14.
test('should warn if not running in test env', function shouldWarnIfNotRunningInTestEnv() {
	vi.spyOn(console, 'error').mockImplementation(function noop() {});
	// Ensure IntersectionObserver is not a mock for this probe.
	// @ts-expect-error clear mock constructor
	window.IntersectionObserver = undefined;
	mockAllIsIntersecting(true);
	expect(console.error)
		.toHaveBeenCalledWith(`@octanejs/intersection-observer was not configured to handle mocking.
Unlike upstream react-intersection-observer, this binding does not auto-register Vitest/Jest beforeEach/afterEach. Call setupIntersectionMocking() and resetIntersectionMocking() in your test setup file (including under Vitest and Jest).

// test-setup.js
import { resetIntersectionMocking, setupIntersectionMocking } from '@octanejs/intersection-observer/test-utils';

beforeEach(() => {
  setupIntersectionMocking(vi.fn);
});

afterEach(() => {
  resetIntersectionMocking();
});`);
});

// Per upstream/src/__tests__/setup.test.ts:34.
test('should not warn if running in test env with global "vi"', function shouldNotWarnWithGlobalVi() {
	vi.spyOn(console, 'error').mockImplementation(function noop() {});
	setupIntersectionMocking(vi.fn);
	mockAllIsIntersecting(true);
	expect(console.error).not.toHaveBeenCalled();
});
