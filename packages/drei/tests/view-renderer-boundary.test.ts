import { createRoot as createOctaneDomRoot } from 'octane';
import { describe, expect, it } from 'vitest';
import { View } from '../src/web/View.three.tsrx';
import { ViewDomBoundary } from './_fixtures/view-dom-boundary.tsrx';

describe('View renderer boundary', () => {
	// @parity-case ordinary:view-renderer-boundary
	it('documents the outside-DOM renderer boundary while keeping View.Port callable', () => {
		const root = createOctaneDomRoot(document.createElement('div'));
		expect(() => root.render(ViewDomBoundary, {})).toThrow(
			'Universal hooks may only run while a universal component is rendering.',
		);
		expect(View.Port).toBeTypeOf('function');
		expect(() => View.Port({})).not.toThrow();
		root.unmount();
	});
});
