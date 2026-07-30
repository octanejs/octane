import { describe, expect, it } from 'vitest';
import * as core from '@phosphor-icons/core';
import * as phosphor from '@octanejs/phosphor-icons';
import * as reactPhosphor from '@phosphor-icons/react';
import CameraDefault, {
	Camera,
	CameraIcon,
	__iconWeights,
} from '@octanejs/phosphor-icons/icons/camera';

describe('@octanejs/phosphor-icons — published surface', () => {
	it('exports every canonical core icon and its Icon alias', () => {
		for (const icon of core.icons) {
			expect(phosphor).toHaveProperty(icon.pascal_name);
			expect(phosphor).toHaveProperty(`${icon.pascal_name}Icon`);
			expect(phosphor[icon.pascal_name as keyof typeof phosphor]).toBe(
				phosphor[`${icon.pascal_name}Icon` as keyof typeof phosphor],
			);
			if (icon.alias) {
				expect(phosphor[`${icon.alias.pascal_name}Icon` as keyof typeof phosphor]).toBe(
					phosphor[icon.pascal_name as keyof typeof phosphor],
				);
			}
		}
	});

	it('matches the React runtime export names except for the documented SSR namespace', () => {
		const reactNames = Object.keys(reactPhosphor).filter((name) => name !== 'SSR');
		const octaneNames = Object.keys(phosphor).filter((name) => name !== 'icons');
		expect(octaneNames.sort()).toEqual(reactNames.sort());
	});

	it('supports stable per-icon default and named imports', () => {
		expect(CameraDefault).toBe(Camera);
		expect(Camera).toBe(CameraIcon);
		expect(Object.keys(__iconWeights)).toEqual([
			'thin',
			'light',
			'regular',
			'bold',
			'fill',
			'duotone',
		]);
	});
});
