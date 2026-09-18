import { it } from 'vitest';
import { verifyBrowser } from './browser-suite';

// @parity-case adapted:virtual-browser-suite
it('runs all 35 adapted Virtual browser cases and both direct DOM prepend regressions', () => {
	verifyBrowser('adapted', 37);
}, 180_000);
