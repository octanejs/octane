import '@testing-library/jest-dom/vitest';
import { cleanup } from '@octanejs/testing-library';
import { afterEach, beforeEach } from 'vitest';

import { mockResizeObserver } from './utils/mockResizeObserver';
import { mockScrollTo } from './utils/mockScrollTo';

let unmockResizeObserver: (() => void) | null = null;
let unmockScrollTo: (() => void) | null = null;

beforeEach(() => {
	unmockResizeObserver = mockResizeObserver();
	unmockScrollTo = mockScrollTo();
});

afterEach(() => {
	cleanup();
	unmockResizeObserver?.();
	unmockScrollTo?.();
});
