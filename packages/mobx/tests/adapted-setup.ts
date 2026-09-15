import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@octanejs/testing-library';
import { configure, _getGlobalState, _resetGlobalState } from 'mobx';

// jest-mock-console uses the injected Jest mock API.
Object.assign(globalThis, { jest: vi, __DEV__: true });

function resetMobxTestState() {
	_resetGlobalState();
	_getGlobalState().spyListeners = [];
	configure({
		enforceActions: 'never',
		computedRequiresReaction: false,
		reactionRequiresObservable: false,
		observableRequiresReaction: false,
		disableErrorBoundaries: false,
		safeDescriptors: true,
	});
}

beforeEach(resetMobxTestState);
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	resetMobxTestState();
});
