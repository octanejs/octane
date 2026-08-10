import { chromium, firefox, type Browser, type BrowserType, type LaunchOptions } from 'playwright';

export type BrowserName = 'chromium' | 'firefox';

function selectedBrowserName(value: string | undefined): BrowserName {
	if (value === undefined || value === 'chromium') return 'chromium';
	if (value === 'firefox') return 'firefox';
	throw new Error(
		`Unsupported PLAYWRIGHT_BROWSER ${JSON.stringify(value)}. Expected "chromium" or "firefox".`,
	);
}

export const browserName = selectedBrowserName(process.env.PLAYWRIGHT_BROWSER);
export const browserType: BrowserType = browserName === 'chromium' ? chromium : firefox;

export async function launchBrowser(options?: LaunchOptions): Promise<Browser> {
	try {
		return await browserType.launch(options);
	} catch (cause) {
		const detail = cause instanceof Error ? cause.message : String(cause);
		if (
			!/executable (?:doesn't exist|does not exist)|browser.*(?:not found|download)/i.test(detail)
		) {
			throw cause;
		}
		const displayName = browserName === 'chromium' ? 'Chromium' : 'Firefox';
		throw new Error(
			`${displayName} could not be launched. Install the selected browser with \`pnpm exec playwright install ${browserName}\`.`,
			{ cause },
		);
	}
}
