import { it } from 'vitest';
import { verifyBrowser } from './browser-suite';

// @parity-case adapted:virtual-browser-suite
it('runs all 44 adapted Virtual browser cases and three end-anchor regressions', () => {
	verifyBrowser('adapted', 47);
}, 180_000);
