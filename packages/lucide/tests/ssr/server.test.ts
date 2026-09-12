import { createElement as createReactElement } from 'react';
import { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createElement, renderToStaticMarkup } from 'octane/server';
import {
	Camera,
	Icon,
	createLucideIcon,
	icons,
	LucideProvider,
	type LucideIconData,
} from '@octanejs/lucide';
import {
	Camera as ReactCamera,
	Icon as ReactIcon,
	createLucideIcon as createReactLucideIcon,
	icons as reactIcons,
} from 'lucide-react';

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

const wideIcon: LucideIconData = {
	name: 'wide',
	aliases: ['broad'],
	width: 48,
	height: 16,
	node: [['rect', { width: 48, height: 16, key: 'body' }]],
};

describe('@octanejs/lucide — current public icon data', () => {
	it.each([
		{},
		{ size: 32 },
		{ width: 96 },
		{ width: 96, height: 32 },
		{ size: 32, width: 96, height: 64 },
		{ nonScalingStroke: true },
		{ strokeWidth: 3, absoluteStrokeWidth: true, width: 96 },
		{ className: 'custom custom', role: 'img' },
	])('matches rectangular icon data for %j', (props) => {
		const input = { icon: wideIcon, ...props };
		expect(renderToStaticMarkup(Icon, input).html).toBe(
			renderReactToStaticMarkup(createReactElement(ReactIcon, input)),
		);
	});

	it('matches the legacy factory with explicit aliases', () => {
		const Legacy = createLucideIcon('custom_icon', wideIcon.node, ['legacy']);
		const ReactLegacy = createReactLucideIcon('custom_icon', wideIcon.node, ['legacy']);
		expect(renderToStaticMarkup(Legacy, { nonScalingStroke: true }).html).toBe(
			renderReactToStaticMarkup(createReactElement(ReactLegacy, { nonScalingStroke: true })),
		);
	});
});

describe('@octanejs/lucide — complete glyph catalog', () => {
	it('matches every canonical React icon with default and non-scaling strokes', () => {
		for (const [name, Component] of Object.entries(icons)) {
			const ReactComponent =
				reactIcons[(name === 'CircleEuroSign' ? 'CircleEuro' : name) as keyof typeof reactIcons];
			for (const props of [{}, { nonScalingStroke: true, size: 32, strokeWidth: 3 }]) {
				expect(
					renderToStaticMarkup(Component, props).html,
					`${name}: ${JSON.stringify(props)}`,
				).toBe(renderReactToStaticMarkup(createReactElement(ReactComponent, props)));
			}
		}
	});
});
