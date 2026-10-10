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
	for (const scenario of [
		'query',
		'queries',
		'derived',
		'actions',
		'islands',
		'rpc',
		'renderer',
		'deferred',
	] as const) {
		it(`preserves trusted input and every ${scenario} result`, async () => {
			const result = await measureBacklog(browser, server.url, scenario);
			results.push(result);
			if (scenario !== 'actions' && scenario !== 'deferred')
				expect(result.inputsDuringWork).toBeGreaterThan(0);
			expect(result.completionMs).toBeGreaterThan(0);
			console.info(JSON.stringify(result));
		});
	}
	for (const [scenario, options] of [
		['query', { count: 8, mode: 'cold', producers: 3, roots: 'many' }],
		['derived', { count: 20, producers: 12, roots: 'many' }],
		['rpc', { count: 8, mode: 'cold', chunks: 'fragmented' }],
		['renderer', { count: 8, chunks: 'fragmented', producers: 3 }],
	] as const) {
		it(`preserves ${scenario} across ${JSON.stringify(options)}`, async () => {
			results.push(await measureBacklog(browser, server.url, scenario, 'octane', options));
		});
	}
	for (const scenario of ['actions', 'deferred'] as const)
		it(`runs the equivalent ${scenario} workload in React`, async () => {
			const result = await measureBacklog(browser, server.url, scenario, 'react');
			results.push(result);
			expect(result.values).toBe(scenario === 'actions' ? 100 : 1);
			console.info(JSON.stringify(result));
		});
});
