import htmlToDOM from 'html-dom-parser';
import type { ElementDescriptor } from 'octane';
import { describe, expect, it } from 'vitest';

import domToReact from '../../src/dom-to-react';
import { html } from '../data';
import { render } from '../helpers';

describe('domToReact', function domToReactSuite() {
	describe('when React version is 15', function legacyVersion() {
		it('removes unknown attributes', function preservesInOctane() {
			const element = domToReact(htmlToDOM(html.customElement)) as ElementDescriptor;
			// OCTANE DIVERGENCE: Octane's own version is 0.x, but its DOM
			// attribute behavior matches React 16+, so the version-15 branch is
			// deliberately unreachable and the custom attribute is preserved.
			expect(element.props['custom-attribute']).toBe('value');
			expect(render(element)).toContain('custom-attribute="value"');
		});
	});
});
