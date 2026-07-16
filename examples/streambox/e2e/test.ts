import { test as base, expect } from '@playwright/test';
import { collectBrowserDiagnostics, settleBrowserFrames } from '../../_shared/e2e/browser.ts';

interface DiagnosticFixtures {
	diagnosticsGate: void;
}

export const test = base.extend<DiagnosticFixtures>({
	diagnosticsGate: [
		async ({ page }, use, testInfo) => {
			const diagnostics = collectBrowserDiagnostics(page);
			try {
				await use();
				await settleBrowserFrames(page);
				diagnostics.assertClean(testInfo.title);
			} finally {
				diagnostics.stop();
			}
		},
		{ auto: true },
	],
});

export { expect };
