import { describe, expect, it } from 'vitest';
import * as octaneLucide from '@octanejs/lucide';
import * as reactLucide from 'lucide-react';
import octaneDynamicImports from '@octanejs/lucide/dynamicIconImports';
import reactDynamicImports from 'lucide-react/dynamicIconImports';
import { AlertCircle, CircleAlert, icons } from '@octanejs/lucide';

describe('@octanejs/lucide — published surface', () => {
	it('matches every lucide-react root runtime export', () => {
		const reactExports = Object.keys(reactLucide).filter(
			(name) => name !== 'default' && name !== 'module.exports',
		);
		expect(Object.keys(octaneLucide).sort()).toEqual(reactExports.sort());
	});

	it('matches the canonical icons namespace', () => {
		expect(Object.keys(icons).sort()).toEqual(Object.keys(reactLucide.icons).sort());
	});

	it('matches dynamic icon names and import targets', () => {
		expect(Object.keys(octaneDynamicImports)).toEqual(Object.keys(reactDynamicImports));
	});

	it('preserves alias identity', () => {
		expect(AlertCircle).toBe(CircleAlert);
	});
});
