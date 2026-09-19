import { it } from 'vitest';
import { verifyBrowser } from './browser-suite';

// @parity-case pristine:virtual-original-browser-suite
it('runs all 35 pinned Virtual browser cases unchanged against React', () => {
	verifyBrowser('pristine', 35);
}, 180_000);
