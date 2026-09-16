import { describe, expect, it } from 'vitest';
import { createElement, flushSync } from 'octane';
import { createLucideIcon, Icon, LucideProvider, type LucideIconData } from '@octanejs/lucide';
import { mount } from '../../octane/tests/_helpers.js';

const badge = {
	name: 'wide-badge',
	aliases: ['badge-wide'],
	width: 48,
	height: 16,
	node: [['g', {}, [['rect', { width: 48, height: 16 }]]]],
} satisfies LucideIconData;

describe('@octanejs/lucide — icon data', () => {
	it('renders rectangular custom data with nested SVG nodes and aliases', () => {
		const Badge = createLucideIcon(badge);
		const mounted = mount(Badge, { width: 96, height: 32, nonScalingStroke: true });
		const svg = mounted.find('svg');
		expect(svg.getAttribute('viewBox')).toBe('0 0 48 16');
		expect(svg.getAttribute('width')).toBe('96');
		expect(svg.getAttribute('height')).toBe('32');
		expect(svg.classList.contains('lucide-wide-badge')).toBe(true);
		expect(svg.classList.contains('lucide-badge-wide')).toBe(true);
		expect(mounted.find('g').getAttribute('vector-effect')).toBe('non-scaling-stroke');
		expect(mounted.find('g rect').getAttribute('width')).toBe('48');
		mounted.unmount();
	});

	it('updates provider stroke defaults while explicit values win', () => {
		const App = ({ nonScalingStroke }: { nonScalingStroke: boolean }) =>
			createElement(LucideProvider, {
				nonScalingStroke,
				children: [
					createElement(Icon, { icon: badge, id: 'provided' }),
					createElement(Icon, { icon: badge, id: 'override', nonScalingStroke: false }),
				],
			});
		const mounted = mount(App, { nonScalingStroke: true });
		expect(mounted.find('#provided g').getAttribute('vector-effect')).toBe('non-scaling-stroke');
		expect(mounted.find('#override g').hasAttribute('vector-effect')).toBe(false);
		flushSync(() => mounted.update(App, { nonScalingStroke: false }));
		expect(mounted.find('#provided g').hasAttribute('vector-effect')).toBe(false);
		mounted.unmount();
	});
});
