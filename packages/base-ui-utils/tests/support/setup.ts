import { afterEach, vi } from 'vitest';
import { cleanup, act } from '@octanejs/testing-library';
import setupVitest from '@mui/internal-test-utils/setupVitest';
import '@testing-library/jest-dom/vitest';
import { reset } from '../../src/error';
import { resetAnimationFrameScheduler } from '../../src/useAnimationFrame';

setupVitest();
// Keep warning ownership with Octane Testing Library's async/sync boundaries.
(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = false;
afterEach(() => {
	cleanup();
	reset();
	resetAnimationFrameScheduler();
	vi.restoreAllMocks();
});
