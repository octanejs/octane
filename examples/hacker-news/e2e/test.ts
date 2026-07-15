import { test as base, expect } from '@playwright/test';
import { collectBrowserDiagnostics, settleBrowserFrames } from '../../_shared/e2e/browser.ts';

interface DiagnosticFixtures {
	browserDiagnostics: boolean;
	browserDiagnosticsGate: void;
}

/**
 * Every JavaScript-enabled journey must be free of page errors, console errors,
 * and public hydration-mismatch warnings. Tests can opt out only when they
 * deliberately create a JavaScript-disabled context to prove server output.
 */
export const test = base.extend<DiagnosticFixtures>({
	browserDiagnostics: [true, { option: true }],
	browserDiagnosticsGate: [
		async ({ page, browserDiagnostics }, use, testInfo) => {
			if (!browserDiagnostics) {
				await use();
				return;
			}

			const diagnostics = collectBrowserDiagnostics(page, {
				failOnHydrationWarnings: true,
			});
			try {
				await use();
				await settleBrowserFrames(page);
				diagnostics.assertClean(`${testInfo.project.name}: ${testInfo.title}`);
			} finally {
				diagnostics.stop();
			}
		},
		{ auto: true },
	],
});

export { expect };
