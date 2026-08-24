import { describe, expect, it } from 'vitest';

import {
	configureBoneyard,
	getBoneyardConfig,
	getRegisteredSkeleton,
	normalizeBone,
	registerBones,
	registerSkeleton,
	renderBones,
	selectBreakpoint,
} from '../../src/index';

const compact = {
	name: 'card',
	width: 320,
	height: 120,
	bones: [
		[0, 0, 100, 120, 8, true],
		[4, 8, 50, 20, 4],
	] as const,
};

describe('@octanejs/boneyard core', () => {
	it('normalizes compact tuples and validates malformed geometry', () => {
		expect(normalizeBone([1, 2, 3, 4, '50%'])).toEqual({
			x: 1,
			y: 2,
			width: 3,
			height: 4,
			radius: '50%',
			container: false,
		});
		expect(() => normalizeBone([1, 2, 3] as never)).toThrow(/five values/);
	});

	it('selects the largest responsive breakpoint that fits', () => {
		const responsive = {
			breakpoints: {
				'375': compact,
				'768': { ...compact, width: 700, height: 240 },
				'1280': { ...compact, width: 1100, height: 360 },
			},
		};
		expect(selectBreakpoint(responsive, 200).height).toBe(120);
		expect(selectBreakpoint(responsive, 900).height).toBe(240);
		expect(selectBreakpoint(responsive, 1600).height).toBe(360);
	});

	it('supports generated registries and runtime defaults', () => {
		registerSkeleton('card', compact);
		registerBones({ profile: { ...compact, name: 'profile' } });
		configureBoneyard({ color: '#abc', animate: 'solid' });
		expect(getRegisteredSkeleton('card')).toBe(compact);
		expect(getRegisteredSkeleton('profile')).toMatchObject({ name: 'profile' });
		expect(getBoneyardConfig()).toMatchObject({ color: '#abc', animate: 'solid' });
	});

	it('renders portable HTML and omits container bones', () => {
		const html = renderBones(compact, 'hsl(0 0% 90%)');
		expect(html).toContain('height:120px');
		expect(html).toContain('left:4%');
		expect(html).toContain('hsl(0 0% 90%)');
		expect(html.match(/data-boneyard-bone/g)).toBeNull();
		expect(html.match(/aria-hidden/g)).toHaveLength(1);
	});

	// @parity-case differential:boneyard-performance
	it('normalizes generated geometry within a catastrophic-regression budget', () => {
		const startedAt = performance.now();
		for (let index = 0; index < 100_000; index += 1) {
			normalizeBone([index, 2, 3, 4, 5]);
		}
		expect(performance.now() - startedAt).toBeLessThan(1_000);
	});
});
