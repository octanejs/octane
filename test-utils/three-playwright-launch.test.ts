import { describe, expect, it } from 'vitest';
import { webglLaunchOptions } from '../packages/three/tests/browser/_playwright.js';

describe('Three WebGL browser launch normalization', () => {
	it('supplies the Chromium WebGL process flags', () => {
		expect(webglLaunchOptions()).toEqual({
			headless: true,
			args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
		});
	});
});
