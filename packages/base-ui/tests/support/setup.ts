import { afterEach, vi } from 'vitest';
import { cleanup } from '@octanejs/testing-library';
import setupVitest from '@mui/internal-test-utils/setupVitest';
import '@testing-library/jest-dom/vitest';
import '../upstream/test/addVitestMatchers';
import { reset } from '@octanejs/base-ui-utils/error';
import { resetAnimationFrameScheduler } from '@octanejs/base-ui-utils/useAnimationFrame';
setupVitest();
// Preserve the pinned repository's test/setupVitest.ts animation policy. Suites
// that inspect real transitions explicitly enable animations for their cases.
globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
if (/jsdom/.test(window.navigator.userAgent)) {
	globalThis.requestAnimationFrame = (callback) => {
		setTimeout(() => callback(0), 0);
		return 0;
	};
}
// MUI arms React's global flag; Octane Testing Library owns its own flag so its
// async wrapper can suspend warnings while waiting for user interactions.
(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = false;
afterEach(() => {
	cleanup();
	globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
	reset();
	resetAnimationFrameScheduler();
	vi.restoreAllMocks();
	vi.useRealTimers();
});
