import { createElement as createReactElement } from 'react';
import { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';
import { SanityMonogram } from '@octanejs/sanity-logos';
import { SanityMonogram as ReactSanityMonogram } from '@sanity/logos';

describe('@octanejs/sanity-logos — SSR', () => {
	it('matches the upstream static SVG markup', () => {
		const props = { scheme: 'dark' as const, id: 'brand', 'aria-label': 'Sanity' };
		const octane = renderToStaticMarkup(SanityMonogram, props).html;
		const react = renderReactToStaticMarkup(createReactElement(ReactSanityMonogram, props));
		expect(octane).toBe(react);
	});
});
