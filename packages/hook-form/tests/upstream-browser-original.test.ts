import { it } from 'vitest';
import { verifyUpstreamBrowser } from './upstream-browser-suite';

// @parity-case pristine:hook-form-browser-application
it('runs every pinned upstream browser registration against React', async () => {
	await verifyUpstreamBrowser('pristine');
}, 360_000);
