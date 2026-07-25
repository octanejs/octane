import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { renderToString } from 'octane/server';
import { octane } from 'octane/compiler/vite';
import { interaction } from 'octane/hydration';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerFixture } from '../../_server-fixture.js';
import {
	expectedHydrationReplayMetadata,
	HYDRATION_INTERACTION_EVENT_CASES,
	HYDRATION_INTERACTION_EVENT_TYPES,
} from '../../hydration/_hydration-interaction-event-matrix.js';
import type { HydrationReplayRecord } from '../../hydration/_hydration-interaction-event-matrix.js';
import * as client from '../../hydration/_fixtures/deferred-hydration-event-replay.tsrx';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = 'packages/octane/tests/hydration/_fixtures/deferred-hydration-event-replay.tsrx';
const serverFixture = loadServerFixture<typeof client>(FIXTURE);

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
let page: Page | undefined;
let pageFailures: string[] = [];

beforeAll(async () => {
	const when = interaction({ events: HYDRATION_INTERACTION_EVENT_TYPES });
	const { html } = renderToString(serverFixture.DeferredHydrationEventReplay, { when });
	const shellPlugin: Plugin = {
		name: 'deferred-hydration-event-replay-shell',
		transformIndexHtml(source) {
			return source.replace('<!--octane-ssr-->', () => html);
		},
	};
	server = await createServer({
		configFile: false,
		root: HERE,
		logLevel: 'error',
		cacheDir: resolve(HERE, '../../../../../node_modules/.vite/octane-hydration-event-replay'),
		plugins: [shellPlugin, octane()],
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
	baseUrl = `http://127.0.0.1:${address.port}`;
	try {
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			`Chromium is required for deferred hydration event replay evidence (run \`pnpm --filter octane exec playwright install chromium\`): ${String(error)}`,
		);
	}
});

afterEach(async () => {
	const failures = pageFailures.slice();
	try {
		await page?.evaluate(() => window.__deferredHydrationEventReplay?.unmount());
		await page?.close();
	} finally {
		page = undefined;
		pageFailures = [];
	}
	expect(failures).toEqual([]);
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
});

async function openPage(): Promise<Page> {
	page = await browser.newPage();
	pageFailures = [];
	page.on('pageerror', (error) => pageFailures.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			pageFailures.push(`${message.type()}: ${message.text()}`);
		}
	});
	await page.goto(baseUrl);
	await page.waitForFunction(
		() => window.__deferredHydrationEventReplay?.state().onHydratedCount === 1,
	);
	if (pageFailures.length) throw new Error(pageFailures.join('\n'));
	return page;
}

describe.sequential('deferred hydration event replay in a real browser', () => {
	it('preserves every public event family, metadata, order, target, and cancellation', async () => {
		const page = await openPage();
		const state = await page.evaluate(() => window.__deferredHydrationEventReplay.state());

		expect(state.targetSame).toBe(true);
		expect(state.onHydratedCount).toBe(1);
		expect(state.originalOutcomes).toEqual(
			HYDRATION_INTERACTION_EVENT_CASES.map((testCase) => ({
				type: testCase.type,
				dispatched: !(testCase.bubbles && testCase.cancelable),
				defaultPrevented: testCase.bubbles && testCase.cancelable,
			})),
		);

		const targetRecords = state.records.filter(
			(record: HydrationReplayRecord) => record.phase === 'target',
		);
		const parentRecords = state.records.filter(
			(record: HydrationReplayRecord) => record.phase === 'parent',
		);
		expect(targetRecords.map((record: HydrationReplayRecord) => record.type)).toEqual(
			HYDRATION_INTERACTION_EVENT_TYPES,
		);
		const bubblingCases = HYDRATION_INTERACTION_EVENT_CASES.filter((testCase) => testCase.bubbles);
		expect(parentRecords.map((record: HydrationReplayRecord) => record.type)).toEqual(
			bubblingCases.map((testCase) => testCase.type),
		);

		for (let i = 0; i < HYDRATION_INTERACTION_EVENT_CASES.length; i++) {
			const testCase = HYDRATION_INTERACTION_EVENT_CASES[i];
			expect(targetRecords[i]).toMatchObject({
				phase: 'target',
				type: testCase.type,
				targetId: 'hydration-replay-target',
				currentTargetId: 'hydration-replay-target',
				targetIsOriginal: true,
				bubbles: testCase.bubbles,
				cancelable: testCase.cancelable,
				composed: testCase.composed,
				defaultPreventedBefore: false,
				defaultPreventedAfter: testCase.type === 'click',
				...expectedHydrationReplayMetadata(testCase),
			});
		}
		for (let i = 0; i < parentRecords.length; i++) {
			const testCase = bubblingCases[i];
			expect(parentRecords[i]).toMatchObject({
				phase: 'parent',
				type: testCase.type,
				targetId: 'hydration-replay-target',
				currentTargetId: 'hydration-replay-parent',
				targetIsOriginal: true,
				bubbles: true,
				cancelable: testCase.cancelable,
				composed: testCase.composed,
				defaultPreventedBefore: testCase.type === 'click',
				defaultPreventedAfter: testCase.type === 'click',
				...expectedHydrationReplayMetadata(testCase),
			});
		}
		expect(state.hash).toBe('');
	});
});
