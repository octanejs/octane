import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import config from './browser-playwright.config';

const mode = process.env.OCTANE_VIRTUAL_BROWSER_MODE ?? 'pristine';
if (mode !== 'pristine' && mode !== 'adapted') throw new Error(`Unknown replay mode: ${mode}`);

export default {
	...config,
	testMatch: ['tests/browser-diagnostics/scroll-replay.spec.ts'],
	outputDir: resolve(tmpdir(), `octane-virtual-replay-${mode}-${Date.now()}`),
};
