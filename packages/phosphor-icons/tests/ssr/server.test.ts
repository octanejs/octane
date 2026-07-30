import { createElement as createReactElement } from 'react';
import { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';
import { Camera } from '@octanejs/phosphor-icons';
import { SSR as ReactPhosphor } from '@phosphor-icons/react';

describe('@octanejs/phosphor-icons — server rendering', () => {
	for (const weight of ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'] as const) {
		it(`matches Phosphor React for the ${weight} weight`, () => {
			const props = {
				alt: 'Camera',
				color: 'navy',
				size: 36,
				weight,
				mirrored: true,
				'data-icon': 'camera',
			};
			const octane = renderToStaticMarkup(Camera, props).html;
			const react = renderReactToStaticMarkup(createReactElement(ReactPhosphor.Camera, props));
			expect(octane).toBe(react);
		});
	}
});
