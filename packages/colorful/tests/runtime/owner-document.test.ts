import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, flushSync } from 'octane';
import { HexHarness } from './_fixtures/RuntimeHarness.tsrx';

const cleanups: Array<() => void> = [];

afterEach(function cleanup() {
	for (const cleanupFn of cleanups.splice(0)) cleanupFn();
});

// Octane-only framework contract: ownerDocument outside the ambient document.
describe('@octanejs/colorful — owner document', function ownerDocumentSuite() {
	it('uses an iframe-like owner document instead of the ambient document', function usesOwnerDocument() {
		const frameDocument = document.implementation.createHTMLDocument('frame');
		const container = frameDocument.createElement('div');
		frameDocument.body.appendChild(container);
		const root = createRoot(container);
		root.render(HexHarness, {});
		flushSync(function flush() {});
		cleanups.push(function unmount() {
			root.unmount();
		});

		expect(frameDocument.head.querySelectorAll('style')).toHaveLength(1);
		expect(frameDocument.head.querySelector('style')?.textContent).toContain('.react-colorful');
		expect(container.querySelector('.react-colorful')).not.toBeNull();
	});
});
