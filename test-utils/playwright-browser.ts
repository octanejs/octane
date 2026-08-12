import { chromium, devices, type Browser, type LaunchOptions } from 'playwright';

export { devices };

export const browserName = 'chromium' as const;

const CHROMIUM_WEBGL_ARGS = ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'];

export function webglLaunchOptions(): LaunchOptions {
	return { headless: true, args: CHROMIUM_WEBGL_ARGS };
}

export async function launchBrowser(options?: LaunchOptions): Promise<Browser> {
	try {
		return await chromium.launch(options);
	} catch (cause) {
		const detail = cause instanceof Error ? cause.message : String(cause);
		if (
			!/executable (?:doesn't exist|does not exist)|browser.*(?:not found|download)/i.test(detail)
		) {
			throw cause;
		}
		throw new Error(
			'Chromium could not be launched. Install it with `pnpm exec playwright install chromium`.',
			{ cause },
		);
	}
}
