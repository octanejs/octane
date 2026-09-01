import { createElement as createReactElement } from 'react';
import { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';
import { RocketIcon } from '@octanejs/sanity-icons/Rocket';
import { RocketIcon as ReactRocketIcon } from '@sanity/icons/Rocket';

describe('@octanejs/sanity-icons — SSR', () => {
	it('matches the upstream static SVG markup', () => {
		const props = { id: 'rocket', color: 'navy', width: 32, 'aria-label': 'Launch' };
		const octane = renderToStaticMarkup(RocketIcon, props).html;
		const react = renderReactToStaticMarkup(createReactElement(ReactRocketIcon, props));
		expect(octane).toBe(react);
	});
});
