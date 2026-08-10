import type { LaunchOptions } from 'playwright';
import { browserName, type BrowserName } from '../../../../test-utils/playwright-browser.js';

const CHROMIUM_WEBGL_ARGS = ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'];

// Firefox exposes WebGL and WebGL2 without Chromium's process flags. Keep the
// browser assertions shared while normalizing only the engine-specific launch.
export function webglLaunchOptions(engine: BrowserName = browserName): LaunchOptions {
	return engine === 'chromium' ? { headless: true, args: CHROMIUM_WEBGL_ARGS } : { headless: true };
}
