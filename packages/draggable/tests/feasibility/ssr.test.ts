import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { HtmlAdoption, SvgAdoption } from './_fixtures/adoption.tsrx';

describe('react-draggable feasibility: DOM-global-free SSR', () => {
	it('renders HTML and SVG without document/window/SVGElement reads', () => {
		expect(renderToString(HtmlAdoption).html).toContain('<div');
		expect(renderToString(SvgAdoption).html).toContain('<svg');
	});
});
