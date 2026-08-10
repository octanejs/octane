import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, devices, type Browser, type Page } from 'playwright';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { renderToString } from 'octane/server';
import { octane } from 'octane/compiler/vite';
import { interaction } from 'octane/hydration';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerFixture } from '../../_server-fixture.js';
import {
	expectedHydrationReplayMetadata,
	hydrationInteractionPreventsDefault,
	HYDRATION_INTERACTION_EVENT_CASES,
	HYDRATION_INTERACTION_EVENT_TYPES,
} from '../../hydration/_hydration-interaction-event-matrix.js';
import type { HydrationReplayRecord } from '../../hydration/_hydration-interaction-event-matrix.js';
import * as client from '../../hydration/_fixtures/deferred-hydration-event-replay.tsrx';
import * as editorClient from '../../hydration/_fixtures/deferred-hydration-contract.tsrx';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = 'packages/octane/tests/hydration/_fixtures/deferred-hydration-event-replay.tsrx';
const serverFixture = loadServerFixture<typeof client>(FIXTURE);
const EDITOR_FIXTURE = 'packages/octane/tests/hydration/_fixtures/deferred-hydration-contract.tsrx';
const editorServerFixture = loadServerFixture<typeof editorClient>(EDITOR_FIXTURE);

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
let page: Page | undefined;
let pageFailures: string[] = [];

beforeAll(async () => {
	const when = interaction({ events: HYDRATION_INTERACTION_EVENT_TYPES });
	const { html } = renderToString(serverFixture.DeferredHydrationEventReplay, { when });
	const editorHtml = renderToString(editorServerFixture.ActivationSuspendingEditorHydration, {
		when: interaction(),
		suspend: false,
	}).html;
	const shellPlugin: Plugin = {
		name: 'deferred-hydration-event-replay-shell',
		transformIndexHtml(source) {
			return source
				.replace('<!--octane-ssr-->', () => html)
				.replace('<!--octane-editor-ssr-->', () => editorHtml);
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
		await page?.evaluate(() => {
			window.__deferredHydrationEditor?.unmount();
			window.__deferredHydrationEventReplay?.unmount();
		});
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

async function openPage(
	options: { editor?: 'async' | 'sync'; galaxy?: boolean } = {},
): Promise<Page> {
	const galaxy = devices['Galaxy S24'];
	page = await browser.newPage(
		options.galaxy
			? {
					...galaxy,
					userAgent: `${galaxy.userAgent} SamsungBrowser/25.0`,
				}
			: undefined,
	);
	pageFailures = [];
	page.on('pageerror', (error) => pageFailures.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			pageFailures.push(`${message.type()}: ${message.text()}`);
		}
	});
	const query = options.editor === undefined ? '' : `?editor=${options.editor}`;
	await page.goto(`${baseUrl}/${query}`);
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
				dispatched: !hydrationInteractionPreventsDefault(testCase),
				defaultPrevented: hydrationInteractionPreventsDefault(testCase),
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

	for (const galaxy of [false, true]) {
		const platform = galaxy ? 'Galaxy S24 touch emulation' : 'desktop Chromium';
		it(`preserves the first tap, original focused SSR editor, and active IME composition while hydration suspends (${platform})`, async () => {
			const page = await openPage({ editor: 'async', galaxy });
			const editor = page.locator('#activation-editor');
			const initial = await page.evaluate(() => window.__deferredHydrationEditor!.state());
			expect(initial).toMatchObject({
				onHydratedCount: 0,
				same: true,
				connected: true,
				focused: false,
				value: 'Server draft',
			});

			if (galaxy) {
				await editor.tap();
			} else {
				await editor.click();
			}

			let pending = await page.evaluate(() => window.__deferredHydrationEditor!.state());
			expect(pending).toMatchObject({
				onHydratedCount: 0,
				same: true,
				connected: true,
				focused: true,
			});
			expect(pending.trustedEvents.some((event) => event.type === 'pointerdown')).toBe(true);
			if (galaxy) {
				expect(pending.trustedEvents.some((event) => event.type === 'touchstart')).toBe(true);
				expect(pending.trustedEvents.some((event) => event.type === 'touchend')).toBe(true);
			}

			await editor.pressSequentially(' draft');
			await editor.evaluate((node: HTMLInputElement) => node.setSelectionRange(1, 3));
			const cdp = await page.context().newCDPSession(page);
			await cdp.send('Input.imeSetComposition', {
				text: '한',
				selectionStart: 1,
				selectionEnd: 1,
			});

			pending = await page.evaluate(() => window.__deferredHydrationEditor!.state());
			expect(pending).toMatchObject({
				onHydratedCount: 0,
				same: true,
				connected: true,
				focused: true,
			});
			expect(pending.value).toContain('한');
			expect(pending.trustedEvents).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: 'compositionstart',
						constructorName: 'CompositionEvent',
						isTrusted: true,
					}),
					expect.objectContaining({
						type: 'input',
						constructorName: 'InputEvent',
						data: '한',
						isComposing: true,
						isTrusted: true,
					}),
				]),
			);

			await page.evaluate(() => window.__deferredHydrationEditor!.resolve());
			await page.waitForFunction(
				() => window.__deferredHydrationEditor!.state().onHydratedCount === 1,
			);
			const hydrated = await page.evaluate(() => window.__deferredHydrationEditor!.state());
			expect(hydrated).toMatchObject({
				onHydratedCount: 1,
				same: true,
				connected: true,
				focused: true,
				value: pending.value,
				selectionStart: pending.selectionStart,
				selectionEnd: pending.selectionEnd,
			});
			expect(hydrated.handledEvents).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: 'compositionstart',
						constructorName: 'CompositionEvent',
						isTrusted: false,
					}),
					expect.objectContaining({
						type: 'input',
						constructorName: 'InputEvent',
						data: '한',
						isComposing: true,
						isTrusted: false,
					}),
				]),
			);
			expect(hydrated.trustedEvents.some((event) => event.type === 'compositionend')).toBe(false);

			await cdp.send('Input.imeSetComposition', {
				text: '한국',
				selectionStart: 2,
				selectionEnd: 2,
			});
			const continued = await page.evaluate(() => window.__deferredHydrationEditor!.state());
			expect(continued).toMatchObject({ same: true, connected: true, focused: true });
			expect(continued.value).toContain('한국');
			expect(
				continued.trustedEvents.filter((event) => event.type === 'compositionstart'),
			).toHaveLength(1);
			expect(continued.handledEvents).toContainEqual(
				expect.objectContaining({
					type: 'input',
					constructorName: 'InputEvent',
					data: '한국',
					isComposing: true,
					isTrusted: true,
				}),
			);

			await cdp.send('Input.insertText', { text: '한국' });
			const committed = await page.evaluate(() => window.__deferredHydrationEditor!.state());
			expect(committed).toMatchObject({ same: true, connected: true, focused: true });
			expect(committed.handledEvents).toContainEqual(
				expect.objectContaining({
					type: 'compositionend',
					constructorName: 'CompositionEvent',
					data: '한국',
				}),
			);
		});
	}

	it('keeps the original editor focused on the first Galaxy tap when hydration is synchronous', async () => {
		const page = await openPage({ editor: 'sync', galaxy: true });
		await page.locator('#activation-editor').tap();
		await page.waitForFunction(
			() => window.__deferredHydrationEditor!.state().onHydratedCount === 1,
		);
		const state = await page.evaluate(() => window.__deferredHydrationEditor!.state());
		expect(state).toMatchObject({
			onHydratedCount: 1,
			same: true,
			connected: true,
			focused: true,
		});
		expect(state.trustedEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: 'touchstart', isTrusted: true }),
				expect.objectContaining({ type: 'pointerdown', isTrusted: true }),
			]),
		);
	});
});
