import { createElement as createReactElement } from 'react';
import { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createElement, renderToStaticMarkup } from 'octane/server';
import { Camera, LucideProvider } from '@octanejs/lucide';
import { Camera as ReactCamera } from 'lucide-react';

describe('@octanejs/lucide — server rendering', () => {
	it('matches lucide-react static SVG markup', () => {
		const props = { size: 36, color: 'navy', strokeWidth: 1, 'aria-label': 'Camera' };
		const octane = renderToStaticMarkup(Camera, props).html;
		const react = renderReactToStaticMarkup(createReactElement(ReactCamera, props));
		expect(octane).toBe(react);
	});

	it('applies provider defaults on the server', () => {
		const App = () =>
			createElement(LucideProvider, {
				size: 18,
				color: 'tomato',
				children: createElement(Camera, { 'aria-label': 'Provided camera' }),
			});
		const { html } = renderToStaticMarkup(App);
		expect(html).toContain('width="18"');
		expect(html).toContain('stroke="tomato"');
	});
});
