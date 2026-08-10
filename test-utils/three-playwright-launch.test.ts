import { describe, expect, it } from 'vitest';
import { webglLaunchOptions } from '../packages/three/tests/browser/_playwright.js';

describe('Three WebGL browser launch normalization', () => {
	it('supplies the Chromium-only WebGL process flags to Chromium', () => {
		expect(webglLaunchOptions('chromium')).toEqual({
			headless: true,
			args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
		});
	});

	it('launches Firefox without Chromium process flags', () => {
		expect(webglLaunchOptions('firefox')).toEqual({ headless: true });
	});
});
