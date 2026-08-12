import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';
import { SpringValue } from '../../src/index';
import type { IParallax } from '../../src/parallax';
import { AnimatedSsrFixture } from '../_fixtures/animated-host.tsrx';
import { ParallaxFixture } from '../_fixtures/parallax.tsrx';

describe('React Spring server rendering', () => {
	it('serializes deterministic animated host initial values', () => {
		const props = { left: new SpringValue(12), opacity: new SpringValue(0.4) };
		const first = renderToString(AnimatedSsrFixture, props).html;
		const second = renderToString(AnimatedSsrFixture, props).html;
		expect(second).toBe(first);
		expect(first).toContain('id="animated-ssr"');
		expect(first).toContain('left:12px');
		expect(first).toContain('opacity:0.4');
	});

	it('serializes deterministic Parallax structure without browser capabilities', () => {
		const props = {
			api: { current: null as IParallax | null },
			horizontal: false,
			enabled: true,
		};
		const first = renderToString(ParallaxFixture, props).html;
		expect(renderToString(ParallaxFixture, props).html).toBe(first);
		expect(first).toContain('id="parallax"');
		expect(first).toContain('id="normal-layer"');
		expect(first).toContain('id="sticky-layer"');
	});
});
