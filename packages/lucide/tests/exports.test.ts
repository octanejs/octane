import { describe, expect, it } from 'vitest';
import * as octaneLucide from '@octanejs/lucide';
import * as reactLucide from 'lucide-react';
import octaneDynamicImports from '@octanejs/lucide/dynamicIconImports';
import reactDynamicImports from 'lucide-react/dynamicIconImports';
import {
	AlertCircle,
	CircleAlert,
	CircleEuro,
	CircleEuroSign,
	CircleEuroSignIcon,
	LucideCircleEuroSign,
	icons,
} from '@octanejs/lucide';

const compatibilityExports = new Set([
	'CircleEuroSign',
	'CircleEuroSignIcon',
	'LucideCircleEuroSign',
]);

describe('@octanejs/lucide — published surface', () => {
	it('matches every lucide-react root runtime export', () => {
		const reactExports = Object.keys(reactLucide).filter(
			(name) => name !== 'default' && name !== 'module.exports',
		);
		expect(
			Object.keys(octaneLucide)
				.filter((name) => !compatibilityExports.has(name))
				.sort(),
		).toEqual(reactExports.sort());
	});

	it('matches the canonical icons namespace', () => {
		expect(
			Object.keys(icons)
				.filter((name) => name !== 'CircleEuroSign')
				.sort(),
		).toEqual(Object.keys(reactLucide.icons).sort());
	});

	it('matches dynamic icon names and import targets', () => {
		expect(Object.keys(octaneDynamicImports).filter((name) => name !== 'circle-euro-sign')).toEqual(
			Object.keys(reactDynamicImports),
		);
	});

	it('preserves alias identity', () => {
		expect(AlertCircle).toBe(CircleAlert);
	});
});

it('preserves existing circle-euro-sign imports and node data', async () => {
	const direct = await import('@octanejs/lucide/icons/circle-euro-sign');
	const dynamic = await octaneDynamicImports['circle-euro-sign']();
	expect(CircleEuroSign).toBe(CircleEuro);
	expect(CircleEuroSignIcon).toBe(CircleEuro);
	expect(LucideCircleEuroSign).toBe(CircleEuro);
	expect(icons.CircleEuroSign).toBe(CircleEuro);
	expect(direct.default).toBe(CircleEuro);
	expect(dynamic.default).toBe(CircleEuro);
	// Both module data exports are published consumer contracts.
	expect(direct.__iconNode).toBe(direct.__iconData.node);
	expect(dynamic.__iconNode).toBe(dynamic.__iconData.node);
});
