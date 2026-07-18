import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { octane } from 'octane/compiler/vite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, '../../_fixtures/native-change-matrix.tsrx');
const REACT_FIXTURE_ID = '\0native-change-react-fixture';

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
let page: Page | undefined;
let pageFailures: string[] = [];

function reactFixturePlugin(): Plugin {
	return {
		name: 'native-change-react-fixture',
		enforce: 'pre',
		resolveId(id) {
			if (id === 'virtual:native-change-react-fixture') return REACT_FIXTURE_ID;
		},
		load(id) {
			if (id !== REACT_FIXTURE_ID) return;
			const source = readFileSync(FIXTURE, 'utf8');
			const result = compileToReact(source, FIXTURE);
			if (result.errors?.length) {
				throw new Error(result.errors.map((error: Error) => error.message).join('\n'));
			}
			const transformed = transformSync(result.code, {
				loader: 'tsx',
				jsx: 'automatic',
				jsxImportSource: 'react',
				target: 'esnext',
				format: 'esm',
				sourcefile: FIXTURE,
			});
			return transformed.code.replace(/from\s+["']octane["']/g, 'from "react"');
		},
	};
}

beforeAll(async () => {
	server = await createServer({
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [reactFixturePlugin(), octane()],
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
			`Chromium is required for native event evidence (run \`pnpm --filter octane exec playwright install chromium\`): ${String(error)}`,
		);
	}
});

afterEach(async () => {
	expect(pageFailures).toEqual([]);
	await page?.close();
	page = undefined;
	pageFailures = [];
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
});

async function openCase(name: string): Promise<Page> {
	page = await browser.newPage();
	pageFailures = [];
	page.on('pageerror', (error) => pageFailures.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			pageFailures.push(`${message.type()}: ${message.text()}`);
		}
	});
	await page.goto(baseUrl);
	await page.waitForFunction(() => Boolean((window as any).__nativeChangeMatrix));
	await page.evaluate((entry) => (window as any).__nativeChangeMatrix.mount(entry), name);
	await page.waitForSelector('#octane-root input');
	await page.waitForSelector('#react-root input');
	if (pageFailures.length) throw new Error(pageFailures.join('\n'));
	return page;
}

async function logs(runtime: 'octane' | 'react'): Promise<any[]> {
	return page!.evaluate((side) => (window as any).__nativeChangeMatrix.logs[side], runtime);
}

async function state(runtime: 'octane' | 'react'): Promise<any> {
	return page!.evaluate((side) => (window as any).__nativeChangeMatrix.state(side), runtime);
}

describe.sequential('native checkbox and radio browser evidence', () => {
	// React 19.2.7 derives checkable onChange from click:
	// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/plugins/ChangeEventPlugin.js#L233-L260
	// HTML applies checkable pre-activation before click listeners and rolls it
	// back when click is canceled:
	// https://html.spec.whatwg.org/multipage/input.html#the-input-element:legacy-pre-activation-behavior
	// https://html.spec.whatwg.org/multipage/input.html#the-input-element:legacy-canceled-activation-behavior
	it('orders controlled checkbox click, input, and change without hiding the fresh value', async () => {
		const page = await openCase('CheckboxTimeline');
		await page.locator('#octane-root #matrix-checkbox').click();
		await page.locator('#react-root #matrix-checkbox').click();

		expect((await state('octane')).inputs[0].checked).toBe(true);
		expect((await state('react')).inputs[0].checked).toBe(true);
		expect((await state('octane')).output).toBe('checked');
		expect((await state('react')).output).toBe('checked');

		const octaneLogs = await logs('octane');
		const reactLogs = await logs('react');
		expect(octaneLogs.map(({ label, nativeType }) => `${label}:${nativeType}`)).toEqual([
			'click:click',
			'input:input',
			'change:change',
		]);
		expect(octaneLogs.map(({ checked }) => checked)).toEqual([true, true, true]);
		expect(reactLogs.map(({ label, nativeType }) => `${label}:${nativeType}`)).toEqual([
			'click:click',
			'change:click',
			'input:input',
		]);
		expect(reactLogs.map(({ checked }) => checked)).toEqual([true, true, true]);

		await page.locator('#octane-root #matrix-checkbox').click();
		await page.locator('#react-root #matrix-checkbox').click();
		expect((await state('octane')).inputs[0].checked).toBe(false);
		expect((await state('react')).inputs[0].checked).toBe(false);
		expect((await state('octane')).output).toBe('clear');
		expect((await state('react')).output).toBe('clear');
		expect((await logs('octane')).slice(-3).map(({ checked }) => checked)).toEqual([
			false,
			false,
			false,
		]);
		expect((await logs('react')).slice(-3).map(({ checked }) => checked)).toEqual([
			false,
			false,
			false,
		]);
	});

	it('rolls checkable activation back when the cancelable click is prevented', async () => {
		const page = await openCase('CheckboxPreventClick');
		await page.locator('#octane-root #matrix-checkbox-prevent-click').click();
		await page.locator('#react-root #matrix-checkbox-prevent-click').click();

		expect((await state('octane')).inputs[0].checked).toBe(false);
		expect((await state('react')).inputs[0].checked).toBe(false);
		expect((await logs('octane')).map(({ label, nativeType }) => `${label}:${nativeType}`)).toEqual(
			['click:before:click', 'click:after:click'],
		);
		expect((await logs('octane')).at(-1)).toMatchObject({
			cancelable: true,
			defaultPrevented: true,
		});
		expect((await logs('react')).map(({ label, nativeType }) => `${label}:${nativeType}`)).toEqual([
			'click:before:click',
			'click:after:click',
			'change:click',
		]);
		expect((await logs('react')).at(-1)).toMatchObject({
			cancelable: true,
			// React constructs the change event before the preceding synthetic
			// click listener cancels its separate wrapper. The backing click still
			// rolls activation back, but this change wrapper keeps its initial flag.
			defaultPrevented: false,
		});
	});

	it('reasserts a controlled value committed by a click handler after canceled activation', async () => {
		const page = await openCase('CheckboxPreventClickAccept');
		await page.locator('#octane-root #matrix-checkbox-prevent-click-accept').click();
		await page.waitForTimeout(10);

		expect((await state('octane')).inputs[0].checked).toBe(true);
		expect((await state('octane')).output).toBe('checked');
		expect((await logs('octane')).map(({ label }) => label)).toEqual([
			'click:before',
			'click:after',
		]);
	});

	it('restores a controlled checkable when native change propagation never reaches the root', async () => {
		const page = await openCase('CheckboxTimeline');
		await page.locator('#octane-root #matrix-checkbox').evaluate((input) => {
			input.addEventListener('change', (event) => event.stopPropagation());
		});
		await page.locator('#octane-root #matrix-checkbox').click();
		await page.waitForTimeout(10);

		expect((await state('octane')).inputs[0].checked).toBe(false);
		expect((await state('octane')).output).toBe('clear');
		expect((await logs('octane')).map(({ label }) => label)).toEqual(['click', 'input']);
	});

	it('shows why preventDefault in checkable onChange is an intentional divergence', async () => {
		const page = await openCase('CheckboxPreventChange');
		await page.locator('#octane-root #matrix-checkbox-prevent').click();
		await page.locator('#react-root #matrix-checkbox-prevent').click();

		// OCTANE DIVERGENCE: native change is non-cancelable and happens after
		// activation. React's synthetic change is backed by the cancelable click.
		expect((await state('octane')).inputs[0].checked).toBe(true);
		expect((await state('react')).inputs[0].checked).toBe(false);

		const octaneLogs = await logs('octane');
		const reactLogs = await logs('react');
		expect(octaneLogs.map(({ label, nativeType }) => `${label}:${nativeType}`)).toEqual([
			'click:click',
			'input:input',
			'change:before:change',
			'change:after:change',
		]);
		expect(octaneLogs.at(-1)).toMatchObject({ cancelable: false, defaultPrevented: false });
		expect(reactLogs.map(({ label, nativeType }) => `${label}:${nativeType}`)).toEqual([
			'click:click',
			'change:before:click',
			'change:after:click',
		]);
		expect(reactLogs.at(-1)).toMatchObject({ cancelable: true, defaultPrevented: true });
	});

	it('accepts a controlled radio through native change and preserves cousin state', async () => {
		const page = await openCase('RadioAccept');
		await page.locator('#octane-root #matrix-radio-b').click();
		await page.locator('#react-root #matrix-radio-b').click();

		expect((await state('octane')).inputs.map(({ checked }: any) => checked)).toEqual([
			false,
			true,
		]);
		expect((await state('react')).inputs.map(({ checked }: any) => checked)).toEqual([false, true]);
		expect((await logs('octane')).map(({ label, radios }) => [label, radios])).toEqual([
			['b:click', [false, true]],
			['b:input', [false, true]],
			['b:change', [false, true]],
		]);
		expect(
			(await logs('react')).map(({ label, nativeType, radios }) => [label, nativeType, radios]),
		).toEqual([
			['b:click', 'click', [false, true]],
			['b:change', 'click', [false, true]],
			['b:input', 'input', [false, true]],
		]);

		await page.locator('#octane-root #matrix-radio-a').click();
		await page.locator('#react-root #matrix-radio-a').click();
		expect((await state('octane')).inputs.map(({ checked }: any) => checked)).toEqual([
			true,
			false,
		]);
		expect((await state('react')).inputs.map(({ checked }: any) => checked)).toEqual([true, false]);
		expect((await logs('octane')).slice(-3).map(({ label, radios }) => [label, radios])).toEqual([
			['a:click', [true, false]],
			['a:input', [true, false]],
			['a:change', [true, false]],
		]);
	});

	it('restores a rejected radio only after native change observes the activated option', async () => {
		const page = await openCase('RadioReject');
		await page.locator('#octane-root #matrix-radio-reject-b').click();
		await page.locator('#react-root #matrix-radio-reject-b').click();

		expect((await state('octane')).inputs.map(({ checked }: any) => checked)).toEqual([
			true,
			false,
		]);
		expect((await state('react')).inputs.map(({ checked }: any) => checked)).toEqual([true, false]);

		const octaneLogs = await logs('octane');
		expect(octaneLogs.map(({ label, radios }) => [label, radios])).toEqual([
			['b:click', [false, true]],
			['b:input', [false, true]],
			['b:change', [false, true]],
		]);
		const reactLogs = await logs('react');
		expect(reactLogs.map(({ label, radios }) => [label, radios])).toEqual([
			['b:click', [false, true]],
			['b:change', [false, true]],
		]);
		// React restores during its click-derived synthetic change dispatch. In
		// Chromium that leaves no successful activation for native input/change
		// post-steps to report; Octane restores only after its native change above.
	});

	it('clicking the already-selected radio emits click without input or change', async () => {
		const page = await openCase('RadioReject');
		await page.locator('#octane-root #matrix-radio-reject-a').click();
		await page.locator('#react-root #matrix-radio-reject-a').click();

		expect((await logs('octane')).map(({ label }) => label)).toEqual(['a:click']);
		expect((await logs('react')).map(({ label }) => label)).toEqual(['a:click']);
		expect((await state('octane')).inputs.map(({ checked }: any) => checked)).toEqual([
			true,
			false,
		]);
	});

	it('keeps radio native change non-cancelable while React rolls click-backed change back', async () => {
		const page = await openCase('RadioPreventChange');
		await page.locator('#octane-root #matrix-radio-prevent-change').click();
		await page.locator('#react-root #matrix-radio-prevent-change').click();

		expect((await state('octane')).inputs[0].checked).toBe(true);
		expect((await state('react')).inputs[0].checked).toBe(false);
		expect((await logs('octane')).map(({ label, nativeType }) => `${label}:${nativeType}`)).toEqual(
			['click:click', 'input:input', 'change:before:change', 'change:after:change'],
		);
		expect((await logs('octane')).at(-1)).toMatchObject({
			cancelable: false,
			defaultPrevented: false,
		});
		expect((await logs('react')).map(({ label, nativeType }) => `${label}:${nativeType}`)).toEqual([
			'click:click',
			'change:before:click',
			'change:after:click',
		]);
		expect((await logs('react')).at(-1)).toMatchObject({
			cancelable: true,
			defaultPrevented: true,
		});
	});

	it('rolls the clicked radio and its previously selected cousin back when click is canceled', async () => {
		const page = await openCase('RadioPreventClick');
		await page.locator('#octane-root #matrix-radio-prevent-click-b').click();
		await page.locator('#react-root #matrix-radio-prevent-click-b').click();

		expect((await state('octane')).inputs.map(({ checked }: any) => checked)).toEqual([
			true,
			false,
		]);
		expect((await state('react')).inputs.map(({ checked }: any) => checked)).toEqual([true, false]);

		const octaneLogs = await logs('octane');
		expect(octaneLogs.map(({ label, nativeType }) => `${label}:${nativeType}`)).toEqual([
			'b:click:before:click',
			'b:click:after:click',
		]);
		expect(octaneLogs.map(({ radios }) => radios)).toEqual([
			[false, true],
			[false, true],
		]);

		const reactLogs = await logs('react');
		expect(reactLogs.map(({ label, nativeType }) => `${label}:${nativeType}`)).toEqual([
			'b:click:before:click',
			'b:click:after:click',
			'b:change:click',
		]);
		expect(reactLogs.every(({ nativeType }) => nativeType === 'click')).toBe(true);
		expect(reactLogs.map(({ radios }) => radios)).toEqual([
			[false, true],
			[false, true],
			[false, true],
		]);
	});
});

describe.sequential('trusted text commit browser evidence', () => {
	// React's text branch extracts synthetic change from native input/change and
	// value-tracker transitions:
	// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/plugins/ChangeEventPlugin.js#L277-L342
	it('fires Octane change on focus commit while React derives it from each input', async () => {
		const page = await openCase('TextTimeline');
		for (const runtime of ['octane', 'react'] as const) {
			const input = page.locator(`#${runtime}-root #matrix-text`);
			await input.click();
			await input.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
			await input.pressSequentially('edited');
			await input.press('Tab');
		}

		const octaneLogs = await logs('octane');
		const reactLogs = await logs('react');
		expect(
			octaneLogs
				.filter(({ label }) => label.startsWith('change'))
				.map(({ nativeType }) => nativeType),
		).toEqual(['change', 'change']);
		expect(reactLogs.filter(({ label }) => label.startsWith('change')).length).toBeGreaterThan(0);
		expect(
			reactLogs
				.filter(({ label }) => label.startsWith('change'))
				.every(({ nativeType }) => nativeType === 'input'),
		).toBe(true);
		expect((await state('octane')).inputs[0].value).toBe('edited');
		expect((await state('react')).inputs[0].value).toBe('edited');
	});

	it('preserves accepted candidate text through a CDP-generated composition session', async () => {
		const page = await openCase('CompositionTimeline');
		const cdp = await page.context().newCDPSession(page);

		for (const runtime of ['octane', 'react'] as const) {
			const input = page.locator(`#${runtime}-root #matrix-composition`);
			await input.focus();
			await input.evaluate((element: HTMLInputElement) => element.select());
			await cdp.send('Input.imeSetComposition', {
				text: '候',
				selectionStart: 1,
				selectionEnd: 1,
			});
			await cdp.send('Input.insertText', { text: '候' });
		}

		for (const runtime of ['octane', 'react'] as const) {
			const runtimeLogs = await logs(runtime);
			const labels = runtimeLogs.map(({ label }) => label);
			expect(labels).toContain('compositionstart');
			expect(labels).toContain('compositionupdate');
			expect(labels).toContain('compositionend');
			expect(labels).toContain('input');
			expect((await state(runtime)).inputs[0].value).toContain('候');
		}
	});
});
