import { it } from 'vitest';
import { verifyUpstreamBrowser } from './upstream-browser-suite';

// @parity-case adapted:hook-form-browser-application
it('runs every supported upstream browser registration against Octane', async () => {
	await verifyUpstreamBrowser('adapted');
}, 360_000);
