import { expect, it } from 'vitest';
import { setNonce } from '@octanejs/colorful';
import { HexHarness } from './_fixtures/RuntimeHarness.tsrx';
import { mountTracked, settle } from './_helpers';

// Per packages/react-colorful/upstream/tag/tests/csp.test.js

it('Signs the `style` element with a nonce', async function signsStyleNonce() {
	setNonce('some-hash');
	mountTracked(HexHarness, { color: '#F00' });
	settle();
	await new Promise(function wait(resolve) {
		setTimeout(resolve, 0);
	});
	const styleElement = document.head.querySelector('style');
	expect(styleElement).not.toBeNull();
	expect(styleElement?.getAttribute('nonce')).toBe('some-hash');
});
