import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { octane } from 'octane/compiler/vite';
import type { ProbeOptions, RuntimeName, SameRootScenario } from './main.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, '../../_fixtures/event-boundaries.tsrx');
const REACT_FIXTURE_ID = '\0event-boundaries-react-fixture';
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
let page: Page | undefined;
let pageFailures: string[] = [];

function reactFixturePlugin(): Plugin {
	return {
		name: 'event-boundaries-react-fixture',
		enforce: 'pre',
		resolveId(id) {
			if (id === 'virtual:event-boundaries-react-fixture') return REACT_FIXTURE_ID;
		},
		load(id) {
			if (id !== REACT_FIXTURE_ID) return;
			const result = compileToReact(readFileSync(FIXTURE, 'utf8'), FIXTURE);
			if (result.errors?.length)
				throw new Error(result.errors.map((error: Error) => error.message).join('\n'));
			return transformSync(result.code, {
				loader: 'tsx',
				jsx: 'automatic',
				jsxImportSource: 'react',
				target: 'esnext',
				format: 'esm',
				sourcefile: FIXTURE,
			}).code;
		},
	};
}

beforeAll(async () => {
	server = await createServer({
		configFile: false,
		root: HERE,
		logLevel: 'error',
		cacheDir: resolve(HERE, '../../../../../node_modules/.vite/octane-event-boundaries'),
		plugins: [reactFixturePlugin(), octane()],
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('No Vite TCP port');
	baseUrl = `http://127.0.0.1:${address.port}`;
	browser = await launchBrowser({ headless: true });
});

afterEach(async () => {
	const failures = pageFailures;
	await page?.close();
	page = undefined;
	pageFailures = [];
	expect(failures).toEqual([]);
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
});

async function openCase(options: ProbeOptions): Promise<Page> {
	page = await browser.newPage();
	page.on('pageerror', (error) => pageFailures.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'warning' || message.type() === 'error')
			pageFailures.push(message.text());
	});
	await page.goto(baseUrl);
	await page.waitForFunction(() => Boolean(window.__eventBoundaries));
	await page.evaluate((options) => window.__eventBoundaries.mount(options), options);
	return page;
}

async function click(page: Page, runtime: RuntimeName): Promise<string[]> {
	// Coordinates also exercise closed shadow roots with trusted browser input.
	const point = await page.evaluate(
		(runtime) => window.__eventBoundaries.clickPoint(runtime),
		runtime,
	);
	await page.mouse.click(point.x, point.y);
	const records = await page.evaluate((runtime) => window.__eventBoundaries.logs[runtime], runtime);
	expect(records.every(({ trusted }) => trusted)).toBe(true);
	return records.map(({ label }) => label);
}

describe.sequential('trusted event propagation across native listener and root boundaries', () => {
	// React tracks logical cancellation separately from native cancelBubble:
	// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/SyntheticEvent.js#L81
	// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/DOMPluginEventSystem.js#L266
	// Native target cancellation also has upstream coverage in
	// testNativeStopPropagationInInnerBubblePhase:
	// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom/src/__tests__/ReactDOMEventPropagation-test.js#L2690
	const captured = ['parent:capture', 'target:capture'];
	const nativeTarget = ['native:target:first', 'native:target:second'];
	const beforeBubble = [...captured, ...nativeTarget, 'native:root:before'];
	const sameRootCases: Array<{ scenario: SameRootScenario; expected: string[] }> = [
		{
			scenario: 'baseline',
			expected: [
				...beforeBubble,
				'target:bubble',
				'parent:bubble',
				'native:root:after',
				'native:document',
			],
		},
		{
			scenario: 'framework-stop',
			expected: [...beforeBubble, 'target:bubble', 'native:root:after'],
		},
		{
			scenario: 'framework-native-immediate',
			expected: [...beforeBubble, 'target:bubble', 'parent:bubble'],
		},
		{
			scenario: 'framework-stop-and-immediate',
			expected: [...beforeBubble, 'target:bubble'],
		},
		{
			scenario: 'root-bubble-stop',
			expected: [...beforeBubble, 'target:bubble', 'parent:bubble', 'native:root:after'],
		},
		{
			scenario: 'root-bubble-immediate',
			expected: beforeBubble,
		},
		{
			scenario: 'root-capture-stop',
			expected: ['native:root:before', ...captured, 'native:root:after'],
		},
		{
			scenario: 'root-capture-immediate',
			expected: ['native:root:before'],
		},
		{
			scenario: 'target-stop',
			expected: [...captured, ...nativeTarget],
		},
		{
			scenario: 'target-immediate',
			expected: [...captured, 'native:target:first'],
		},
	];

	for (const { scenario, expected } of sameRootCases) {
		it(`preserves native listener and logical handler cancellation for ${scenario}`, async () => {
			const page = await openCase({ kind: 'same-root', scenario });
			const react = await click(page, 'react');
			expect(react).toEqual(expected);
			expect(await click(page, 'octane')).toEqual(react);
			if (
				scenario === 'framework-native-immediate' ||
				scenario === 'root-bubble-stop' ||
				scenario === 'root-capture-stop'
			) {
				const label = scenario === 'root-capture-stop' ? 'target:capture' : 'parent:bubble';
				// Continuing logical delivery must not clear the browser's native stop flag.
				expect(
					await page.evaluate(
						(label) =>
							window.__eventBoundaries.logs.octane.find((entry) => entry.label === label)
								?.nativeStopped,
						label,
					),
				).toBe(true);
			}
		});
	}

	for (const stop of [false, true]) {
		it(`interleaves native listeners between nested roots${stop ? ' without crossing a native stop' : ''}`, async () => {
			const page = await openCase({ kind: 'nested', stop });
			const react = await click(page, 'react');
			expect(react).toEqual([
				'outer:capture',
				'native:middle:capture',
				'inner:capture',
				'inner:bubble',
				'native:middle:bubble',
				...(stop ? [] : ['outer:bubble']),
			]);
			expect(await click(page, 'octane')).toEqual(react);
		});
	}

	for (const mode of ['open', 'closed'] as const) {
		it(`propagates through a custom element's ${mode} shadow root while preserving target retargeting`, async () => {
			const page = await openCase({ kind: 'shadow', mode });
			expect(await click(page, 'octane')).toEqual([
				'outer:capture',
				'inner:capture',
				'inner:bubble',
				'outer:bubble',
			]);
			const records = await page.evaluate(() => window.__eventBoundaries.logs.octane);
			expect(records.map(({ currentTarget, target }) => [currentTarget, target])).toEqual([
				['outer', 'host'],
				['inner', 'target'],
				['inner', 'target'],
				['outer', 'host'],
			]);
		});
	}

	it('propagates through a native slot and its shadow ancestors in capture and bubble order', async () => {
		const page = await openCase({ kind: 'slot' });
		expect(await page.evaluate(() => window.__eventBoundaries.slotDistributesTarget())).toBe(true);
		expect(await click(page, 'octane')).toEqual([
			'outer:capture',
			'inner:capture',
			'light:capture',
			'light:bubble',
			'inner:bubble',
			'outer:bubble',
		]);
		const records = await page.evaluate(() => window.__eventBoundaries.logs.octane);
		expect(records.map(({ currentTarget, target }) => [currentTarget, target])).toEqual([
			['outer', 'light'],
			['inner', 'light'],
			['light', 'light'],
			['light', 'light'],
			['inner', 'light'],
			['outer', 'light'],
		]);
	});
});

describe.sequential('commit timing at the delegated dispatch boundary', () => {
	// React's batchedUpdates defers a non-controlled discrete update to the
	// sync-lane microtask. For a browser-dispatched click that microtask
	// checkpoint runs before the next native listener, so a document listener
	// already observes the committed DOM; a script-dispatched click keeps the JS
	// stack busy, so the same listener observes the pre-commit DOM and the update
	// lands once the dispatching script yields. Octane and React must agree.
	// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/ReactDOMUpdateBatching.js
	for (const runtime of ['octane', 'react'] as const) {
		it(`${runtime}: a trusted click commits before a later native listener runs`, async () => {
			const page = await openCase({ kind: 'commit-timing' });
			const labels = await click(page, runtime);
			expect(labels).toEqual(['inner:bubble', 'native:document:1']);
			expect(await page.evaluate((r) => window.__eventBoundaries.targetText(r), runtime)).toBe('1');
		});

		it(`${runtime}: a script click commits only after the dispatching script yields`, async () => {
			const page = await openCase({ kind: 'commit-timing' });
			const observed = await page.evaluate(async (r) => {
				const api = window.__eventBoundaries;
				api.scriptClick(r);
				const duringScript = api.targetText(r);
				const labels = api.logs[r].map(({ label }) => label);
				await new Promise<void>((resolve) => setTimeout(resolve, 0));
				return { duringScript, labels, afterYield: api.targetText(r) };
			}, runtime);
			expect(observed).toEqual({
				duringScript: '0',
				labels: ['inner:bubble', 'native:document:0'],
				afterYield: '1',
			});
		});
	}
});

describe.sequential('controlled text input under a capture-phase handler', () => {
	// A browser-dispatched keystroke reaches the root's capture listener first,
	// and the browser runs a microtask checkpoint after every native listener.
	// Nothing deferred from that capture segment may restore the controlled value
	// before the target's own listeners and the root's bubble listener have run,
	// or every typed character snaps back to the rendered value before onInput
	// can commit it. Octane and React must both accept the edit, and an outside
	// native listener on the input must observe the user's text.
	async function type(page: Page, runtime: RuntimeName, text: string): Promise<string[]> {
		await page.locator(`#${runtime}-root [data-target]`).click();
		await page.keyboard.type(text);
		const records = await page.evaluate((r) => window.__eventBoundaries.logs[r], runtime);
		expect(records.every(({ trusted }) => trusted)).toBe(true);
		return records.map(({ label }) => label);
	}

	for (const runtime of ['octane', 'react'] as const) {
		it(`${runtime}: commits trusted keystrokes that pass an onInputCapture ancestor`, async () => {
			const page = await openCase({ kind: 'controlled-capture', stop: false });
			expect(await type(page, runtime, 'ab')).toEqual([
				'form:capture',
				'native:target:a',
				'target:bubble',
				'form:capture',
				'native:target:ab',
				'target:bubble',
			]);
			expect(await page.evaluate((r) => window.__eventBoundaries.fieldState(r), runtime)).toEqual({
				value: 'ab',
				output: 'ab',
				selectionStart: 2,
				selectionEnd: 2,
				focused: true,
			});
		});
	}

	it('octane: reverts a keystroke whose bubble segment a native listener stopped', async () => {
		// OCTANE DIVERGENCE: React never restores an edit its root bubble listener
		// did not see. Octane closes the capture segment's window once the browser
		// has finished propagating the event, so the rendered value wins — but only
		// after the outside listener has observed the typed text.
		const page = await openCase({ kind: 'controlled-capture', stop: true });
		expect(await type(page, 'octane', 'a')).toEqual(['form:capture', 'native:target:a']);
		await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
		expect(await page.evaluate(() => window.__eventBoundaries.fieldState('octane'))).toEqual({
			value: '',
			output: '',
			selectionStart: 0,
			selectionEnd: 0,
			focused: true,
		});
	});
});
