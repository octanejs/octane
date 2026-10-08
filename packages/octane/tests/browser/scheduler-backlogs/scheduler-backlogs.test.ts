import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import {
	measureBacklog,
	serveBacklogs,
} from '../../../../../benchmarks/scheduler-responsiveness/browser-backlogs.mjs';

describe.sequential('production backlog responsiveness under 6x CPU throttling', () => {
	const results: Awaited<ReturnType<typeof measureBacklog>>[] = [];
	let browser: Browser;
	let server: Awaited<ReturnType<typeof serveBacklogs>>;
	beforeAll(async () => {
		server = await serveBacklogs();
		browser = await launchBrowser({ headless: true });
	});
	afterAll(async () => {
		await browser?.close();
		await server?.close();
		const output = resolve('benchmarks/results/scheduler-backlogs.json');
		await mkdir(resolve(output, '..'), { recursive: true });
		await writeFile(output, JSON.stringify(results, null, 2) + '\n');
	});
	for (const scenario of ['query', 'derived', 'actions', 'islands']) {
		it(`preserves trusted input and every ${scenario} result`, async () => {
			const result = await measureBacklog(browser, server.url, scenario);
			results.push(result);
			if (scenario !== 'actions') expect(result.inputsDuringWork).toBeGreaterThan(0);
			expect(result.completionMs).toBeGreaterThan(0);
			console.info(JSON.stringify(result));
		});
	}
	it('runs the equivalent ready Action and controlled-input workload in React', async () => {
		const result = await measureBacklog(browser, server.url, 'actions', 'react');
		results.push(result);
		expect(result.values).toBe(100);
		console.info(JSON.stringify(result));
	});
});
