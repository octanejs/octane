import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let server: ViteDevServer;
let baseUrl: string;

beforeAll(async () => {
	server = await createServer({
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [octane()],
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
	baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
	await server?.close();
});

for (const [name, engine] of [
	['Chromium', chromium],
	['WebKit', webkit],
] as const) {
	describe.sequential(`${name} externally owned behavior lifecycle`, () => {
		let browser: Browser;
		let page: Page | undefined;
		let failures: string[] = [];

		beforeAll(async () => {
			try {
				browser = await engine.launch({ headless: true });
			} catch (error) {
				throw new Error(`${name} is required for externally owned behavior evidence: ${error}`);
			}
		});

		afterEach(async () => {
			const currentFailures = failures.slice();
			try {
				await page?.evaluate(() => window.__behaviorRootBrowser?.dispose());
				await page?.close();
			} finally {
				page = undefined;
				failures = [];
			}
			expect(currentFailures).toEqual([]);
		});

		afterAll(async () => {
			await browser?.close();
		});

		async function openPage(): Promise<Page> {
			page = await browser.newPage();
			failures = [];
			page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
			page.on('console', (message) => {
				if (message.type() === 'error' || message.type() === 'warning') {
					failures.push(`${message.type()}: ${message.text()}`);
				}
			});
			await page.goto(baseUrl);
			await page.waitForFunction(() => Boolean(window.__behaviorRootBrowser));
			return page;
		}

		it('adopts progressively streamed widgets while preserving server DOM and nested ownership', async () => {
			const page = await openPage();
			await page.evaluate(() => window.__behaviorRootBrowser.mountStreaming());

			const before = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(before.identity).toEqual({
				article: true,
				external: true,
				initialWidget: true,
				mathRow: true,
				nested: true,
				shell: true,
				svgGroup: true,
			});
			expect(before.namespaces).toEqual({
				math: 'http://www.w3.org/1998/Math/MathML',
				svg: 'http://www.w3.org/2000/svg',
			});
			expect(before.patchedBeforeAttachment).toBe(true);
			expect(before.protectedAttributes).toEqual({
				range: 'server-range',
				shell: 'server-shell',
			});

			await page.evaluate(() =>
				window.__behaviorRootBrowser.appendStreamedMarkup([
					{ text: 'Progressively streamed text' },
					{
						html: '<button id="streamed-widget" type="button" data-stream-action>Widget</button>',
					},
					{
						html: '<a id="streamed-annotation" href="#streamed" data-stream-action>Annotation</a>',
					},
					{
						html: '<button id="nested-streamed-widget" type="button" data-stream-action>Nested</button>',
						owner: 'nested',
					},
				]),
			);
			await page.waitForFunction(() => {
				const adopted = window.__behaviorRootBrowser.state().adoptions;
				return adopted.includes('streamed-widget') && adopted.includes('nested-streamed-widget');
			});
			await page.locator('#initial-widget').click();
			await page.locator('#streamed-widget').click();
			await page.locator('#nested-widget').click();
			await page.locator('#nested-streamed-widget').click();
			await page.locator('#streamed-annotation').click();

			const streamed = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(streamed.identity).toEqual(before.identity);
			expect(streamed.namespaces).toEqual(before.namespaces);
			expect(streamed.protectedAttributes).toEqual(before.protectedAttributes);
			expect(streamed.patchedBeforeAttachment).toBe(true);
			expect(streamed.text).toBe('Progressively streamed text');
			expect(streamed.hash).toBe('#streamed');
			expect(streamed.interactions).toEqual([
				{
					id: 'initial-widget',
					nativeDispatches: 1,
					original: true,
					owner: 'stream',
					trusted: true,
					type: 'click',
				},
				{
					id: 'streamed-widget',
					nativeDispatches: 1,
					original: true,
					owner: 'stream',
					trusted: true,
					type: 'click',
				},
				{
					id: 'nested-widget',
					nativeDispatches: 1,
					original: true,
					owner: 'nested',
					trusted: true,
					type: 'click',
				},
				{
					id: 'nested-streamed-widget',
					nativeDispatches: 1,
					original: true,
					owner: 'nested',
					trusted: true,
					type: 'click',
				},
				{
					id: 'streamed-annotation',
					nativeDispatches: 1,
					original: true,
					owner: 'stream',
					trusted: true,
					type: 'click',
				},
			]);

			await page.evaluate(() => window.__behaviorRootBrowser.dispose());
			await page.locator('#streamed-widget').click();
			const disposed = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(disposed.identity).toEqual(before.identity);
			expect(disposed.interactions).toEqual(streamed.interactions);
			expect(disposed.cleanups.toSorted()).toEqual(disposed.adoptions.toSorted());
			await page.evaluate(() => window.__behaviorRootBrowser.dispose());
			expect((await page.evaluate(() => window.__behaviorRootBrowser.state())).cleanups).toEqual(
				disposed.cleanups,
			);
		});

		it('delivers genuine pending interactions without redispatching links or repeated forms', async () => {
			const page = await openPage();
			await page.evaluate(() => window.__behaviorRootBrowser.mountPendingInteractions());

			await page.locator('#initial-widget').click();
			await page.locator('#annotation-link').click();
			await page.locator('#submit-action').click();
			await page.waitForFunction(() => window.__behaviorRootBrowser.state().hashChanges === 1);

			const pending = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(pending.interactions).toEqual([]);
			expect(pending.hash).toBe('#annotation');
			expect(pending.nativeSubmissions).toBe(1);
			expect(pending.trustedSubmissions).toBe(1);
			expect(pending.nativeDispatches).toMatchObject({
				'annotation-link': 1,
				'initial-widget': 1,
				'submit-action': 1,
			});

			await page.evaluate(() => window.__behaviorRootBrowser.resolvePending());
			await page.waitForFunction(
				() => window.__behaviorRootBrowser.state().interactions.length === 3,
			);
			const adopted = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(adopted.interactions).toEqual([
				{
					id: 'initial-widget',
					nativeDispatches: 1,
					original: true,
					owner: 'stream',
					trusted: true,
					type: 'click',
				},
				{
					id: 'annotation-link',
					nativeDispatches: 1,
					original: true,
					owner: 'stream',
					trusted: true,
					type: 'click',
				},
				{
					id: 'submit-action',
					nativeDispatches: 1,
					original: true,
					owner: 'stream',
					trusted: true,
					type: 'click',
				},
			]);
			expect(adopted.hashChanges).toBe(1);
			expect(adopted.nativeSubmissions).toBe(1);

			await page.locator('#submit-action').click();
			const repeated = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(repeated.nativeSubmissions).toBe(2);
			expect(repeated.trustedSubmissions).toBe(2);
			expect(repeated.nativeDispatches['submit-action']).toBe(2);
			expect(repeated.interactions.map((interaction) => interaction.id)).toEqual([
				'initial-widget',
				'annotation-link',
				'submit-action',
				'submit-action',
			]);
		});

		it('updates existing owned widgets as element and ancestor attributes change', async () => {
			const page = await openPage();
			await page.evaluate(() => window.__behaviorRootBrowser.mountChangingSelectors());
			const before = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(before.adoptions).toEqual([]);

			await page.evaluate(() => {
				document.querySelector('#initial-widget')!.setAttribute('data-enhanced-action', 'ready');
				document.querySelector('#annotation-link')!.classList.add('interactive-annotation');
				document.querySelector('#nested-range')!.setAttribute('data-live', 'true');
			});
			await page.waitForFunction(() => window.__behaviorRootBrowser.state().adoptions.length === 3);
			await page.locator('#initial-widget').click();
			await page.locator('#annotation-link').click();
			await page.locator('#nested-widget').click();

			const adopted = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(adopted.identity).toEqual(before.identity);
			expect(adopted.adoptions.toSorted()).toEqual([
				'annotation-link',
				'initial-widget',
				'nested-widget',
			]);
			expect(adopted.interactions).toEqual([
				expect.objectContaining({
					id: 'initial-widget',
					original: true,
					owner: 'stream',
					trusted: true,
				}),
				expect.objectContaining({
					id: 'annotation-link',
					original: true,
					owner: 'stream',
					trusted: true,
				}),
				expect.objectContaining({
					id: 'nested-widget',
					original: true,
					owner: 'nested',
					trusted: true,
				}),
			]);

			await page.evaluate(() => {
				document.querySelector('#initial-widget')!.removeAttribute('data-enhanced-action');
				document.querySelector('#annotation-link')!.classList.remove('interactive-annotation');
				document.querySelector('#nested-range')!.removeAttribute('data-live');
			});
			await page.waitForFunction(() => window.__behaviorRootBrowser.state().cleanups.length === 3);
			const released = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(released.cleanups.toSorted()).toEqual(adopted.adoptions.toSorted());
			expect(released.identity).toEqual(before.identity);
			await page.locator('#initial-widget').click();
			await page.locator('#nested-widget').click();
			expect(
				(await page.evaluate(() => window.__behaviorRootBrowser.state())).interactions,
			).toEqual(adopted.interactions);

			await page.evaluate(() => {
				document.querySelector('#initial-widget')!.setAttribute('data-enhanced-action', 'again');
			});
			await page.waitForFunction(
				() =>
					window.__behaviorRootBrowser.state().adoptions.filter((id) => id === 'initial-widget')
						.length === 2,
			);
			await page.locator('#initial-widget').click();
			const readopted = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(readopted.interactions.at(-1)).toMatchObject({
				id: 'initial-widget',
				nativeDispatches: 3,
				original: true,
				owner: 'stream',
				trusted: true,
			});
			await page.evaluate(() => {
				document.querySelector('#initial-widget')!.removeAttribute('data-enhanced-action');
			});
			await page.waitForFunction(
				() =>
					window.__behaviorRootBrowser.state().cleanups.filter((id) => id === 'initial-widget')
						.length === 2,
			);
			expect((await page.evaluate(() => window.__behaviorRootBrowser.state())).identity).toEqual(
				before.identity,
			);
		});

		it('preserves streaming and genuine queued interactions before and after range readiness', async () => {
			const page = await openPage();
			await page.evaluate(() => window.__behaviorRootBrowser.mountPendingRange());
			await page.evaluate(() =>
				window.__behaviorRootBrowser.appendStreamedMarkup([
					{ text: 'Revealed while the external owner is pending' },
					{
						html: '<button id="pending-range-widget" type="button" data-stream-action>Pending widget</button>',
					},
				]),
			);
			await page.locator('#initial-widget').click();
			await page.locator('#pending-range-widget').click();

			const pending = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(pending.adoptions).toEqual([]);
			expect(pending.interactions).toEqual([]);
			expect(pending.text).toBe('Revealed while the external owner is pending');
			expect(pending.identity).toEqual({
				article: true,
				external: true,
				initialWidget: true,
				mathRow: true,
				nested: true,
				shell: true,
				svgGroup: true,
			});

			await page.evaluate(() => window.__behaviorRootBrowser.resolvePending());
			await page.waitForFunction(
				() => window.__behaviorRootBrowser.state().interactions.length === 2,
			);
			const ready = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(ready.interactions).toEqual([
				{
					id: 'initial-widget',
					nativeDispatches: 1,
					original: true,
					owner: 'stream',
					trusted: true,
					type: 'click',
				},
				{
					id: 'pending-range-widget',
					nativeDispatches: 1,
					original: true,
					owner: 'stream',
					trusted: true,
					type: 'click',
				},
			]);

			await page.evaluate(() =>
				window.__behaviorRootBrowser.appendStreamedMarkup([
					{
						html: '<button id="ready-range-widget" type="button" data-stream-action>Ready widget</button>',
					},
				]),
			);
			await page.locator('#ready-range-widget').click();
			await page.waitForFunction(
				() => window.__behaviorRootBrowser.state().interactions.length === 3,
			);
			const streamed = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(streamed.interactions.at(-1)).toEqual({
				id: 'ready-range-widget',
				nativeDispatches: 1,
				original: true,
				owner: 'stream',
				trusted: true,
				type: 'click',
			});
			expect(streamed.text).toBe('Revealed while the external owner is pending');
		});

		it('rejects ownership conflicts, supports explicit handoff, and scopes replacement documents', async () => {
			const page = await openPage();
			await page.evaluate(() => window.__behaviorRootBrowser.mountStreaming());

			const conflict = await page.evaluate(() => window.__behaviorRootBrowser.conflict());
			expect(conflict).toEqual(expect.any(String));
			await page.evaluate(() => window.__behaviorRootBrowser.handoffNestedOwner());
			await page.locator('#nested-widget').click();
			const handedOff = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(handedOff.interactions).toEqual([
				{
					id: 'nested-widget',
					nativeDispatches: 1,
					original: true,
					owner: 'replacement',
					trusted: true,
					type: 'click',
				},
			]);

			await page.evaluate(() => window.__behaviorRootBrowser.replaceDocumentRoot());
			await page.locator('#initial-widget').click();
			await page.frameLocator('#replacement-document').locator('#replacement-widget').click();

			const replacement = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(replacement.documentScoped).toBe(true);
			expect(replacement.identity).toEqual({
				article: true,
				external: true,
				initialWidget: true,
				mathRow: true,
				nested: true,
				shell: true,
				svgGroup: true,
			});
			expect(replacement.interactions).toEqual([
				...handedOff.interactions,
				{
					id: 'replacement-widget',
					nativeDispatches: 1,
					original: true,
					owner: 'replacement-document',
					trusted: true,
					type: 'click',
				},
			]);
		});

		it('cleans adopted behavior exactly once and ignores interactions after abort', async () => {
			const page = await openPage();
			await page.evaluate(() => window.__behaviorRootBrowser.mountAbortedInteractions());
			await page.waitForFunction(() =>
				window.__behaviorRootBrowser.state().adoptions.includes('initial-widget'),
			);
			await page.locator('#annotation-link').click();
			await page.evaluate(() => {
				window.__behaviorRootBrowser.abort();
				window.__behaviorRootBrowser.resolvePending();
			});
			await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

			const aborted = await page.evaluate(() => window.__behaviorRootBrowser.state());
			expect(aborted.adoptions).toEqual(['initial-widget']);
			expect(aborted.cleanups).toEqual(['initial-widget']);
			expect(aborted.interactions).toEqual([]);
			expect(aborted.hash).toBe('#annotation');
			expect(aborted.nativeDispatches['annotation-link']).toBe(1);
			expect(aborted.streamCanceled).toBe(true);
			expect(aborted.text).toBe('Streamed before cancellation');
			expect(aborted.identity).toEqual({
				article: true,
				external: true,
				initialWidget: true,
				mathRow: true,
				nested: true,
				shell: true,
				svgGroup: true,
			});
		});
	});
}
