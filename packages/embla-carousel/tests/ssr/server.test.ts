import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';
import { ServerCarousel, ServerHydrationCarousel } from '../_fixtures/carousel.tsrx';

describe('@octanejs/embla-carousel server behavior', () => {
	// @parity-case embla:ssr:no-construction
	it('renders without DOM globals and leaves the carousel uninitialized', () => {
		const output = renderToString(ServerCarousel).html;
		expect(output).toContain('data-api="pending"');
		expect(output).toContain('server');
	});

	it('emits the hydration carousel shell without constructing Embla', () => {
		const html = renderToString(ServerHydrationCarousel).html;
		expect(html).toContain('data-api="pending"');
		expect(html).toContain('data-viewport="initial"');
		expect(html).toContain('One');
		expect(html).toContain('Two');
	});
});
