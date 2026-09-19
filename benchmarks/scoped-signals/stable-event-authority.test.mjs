import assert from 'node:assert/strict';
import test from 'node:test';
import { measureStableEventAuthority } from './stable-event-authority.mjs';
for (const dev of [false, true]) {
	test(`stable event authority avoids redundant writes (${dev ? 'dev' : 'prod'})`, async () => {
		const result = await measureStableEventAuthority({ dev });
		assert.equal(
			result.mountWrites,
			result.rows * 4,
			'Every new native slot must publish its initial invocation.',
		);
		assert.equal(
			result.retainedWrites,
			0,
			'Retained callbacks under the same invocation must not rewrite authority.',
		);
		assert.equal(
			result.changedCaptureWrites,
			0,
			'Changed callback data must retain its unchanged authority.',
		);
	});
}
