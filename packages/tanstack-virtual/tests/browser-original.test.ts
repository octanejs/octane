import { it } from 'vitest';
import { verifyBrowser } from './browser-suite';

// @parity-case pristine:virtual-original-browser-suite
it('runs all 44 pinned Virtual browser cases unchanged against React', () => {
	verifyBrowser('pristine', 44);
}, 180_000);
