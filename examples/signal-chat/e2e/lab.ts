import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import { collectBrowserDiagnostics, settleBrowserFrames } from '../../_shared/e2e/browser.ts';

export { expect };

export const test = base.extend<{ diagnosticsGate: void }>({
	diagnosticsGate: [
		async ({ page }, use, testInfo) => {
			const diagnostics = collectBrowserDiagnostics(page, {
				failOnConsoleLevels: ['warning', 'error'],
				failOnHydrationWarnings: true,
				hydrationWarningPattern: /hydration.*mismatch|mismatch.*hydrat|recoverable.*hydrat/i,
			});
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

export function configuration(options: Record<string, string | number> = {}, eager = false) {
	const run = randomUUID();
	const search = new URLSearchParams({
		run,
		scenario: 'steady',
		auth: '40',
		answer: '60',
		history: '120',
		interval: '30',
		waves: '6',
		turns: '3',
	});
	for (const [key, value] of Object.entries(options)) search.set(key, String(value));
	return { run, path: `${eager ? '/eager' : '/'}?${search}` };
}

export async function open(page: Page, path: string) {
	await page.goto(path, { waitUntil: 'commit' });
	await expect(page.locator('[data-lab-shell]')).toBeVisible();
}

export async function completedAnswer(page: Page, waves: number) {
	await expect(page.locator('[data-answer]')).toHaveAttribute('data-revision', String(waves));
	await expect(page.getByRole('region', { name: 'Conversation', exact: true })).toHaveAttribute(
		'data-complete',
		'true',
	);
}
