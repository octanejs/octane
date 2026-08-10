import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from '../../../octane/src/compiler/vite.js';

const browserTestRoot = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(browserTestRoot, 'harness');
const colorfulSource = resolve(browserTestRoot, '../../src/index.ts');
const octaneSource = resolve(browserTestRoot, '../../../octane/src/index.ts');

function getFreePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createNetServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as import('node:net').AddressInfo;
			server.close(() => resolvePort(port));
		});
	});
}

let viteServer: ViteDevServer;
let origin = '';

beforeAll(async () => {
	const port = await getFreePort();
	viteServer = await createServer({
		root: harnessRoot,
		logLevel: 'error',
		server: { host: '127.0.0.1', port, strictPort: true },
		plugins: [octane()],
		resolve: {
			alias: [
				{ find: /^@octanejs\/colorful$/, replacement: colorfulSource },
				{ find: /^octane$/, replacement: octaneSource },
			],
		},
	});
	await viteServer.listen();
	origin = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
	await viteServer?.close().catch(() => {});
});

async function dispatchTouch(
	page: import('playwright').Page,
	selector: string,
	type: 'touchstart' | 'touchmove' | 'touchend',
	x: number,
	y: number,
	target: 'element' | 'window' = 'element',
) {
	await page.evaluate(
		({ selector, type, x, y, target }) => {
			const element = document.querySelector(selector)!;
			const point = { identifier: 7, pageX: x, pageY: y, clientX: x, clientY: y };
			const event = new Event(type, { bubbles: true, cancelable: true });
			Object.defineProperties(event, {
				touches: { value: type === 'touchend' ? [] : [point] },
				changedTouches: { value: [point] },
			});
			(target === 'window' ? window : element).dispatchEvent(event);
		},
		{ selector, type, x, y, target },
	);
}

async function runBrowserCase(engine: 'chromium' | 'firefox') {
	const playwright = await import('playwright');
	const browser = await playwright[engine].launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	try {
		await page.goto(origin, { waitUntil: 'networkidle' });
		await page.waitForTimeout(100);
		if ((await page.locator('[data-testid="picker"]').count()) === 0) {
			throw new Error(
				`browser harness did not mount: ${errors.join(' | ')}\n${await page.content()}`,
			);
		}
		const hue = page.locator('[data-testid="picker"] [aria-label="Hue"]');
		const hueBox = await hue.boundingBox();
		expect(hueBox).not.toBeNull();
		await page.mouse.move(hueBox!.x + hueBox!.width / 2, hueBox!.y + hueBox!.height / 2);
		await page.mouse.down();
		await expect.poll(() => page.locator('#color').textContent()).toBe('#00ffff');
		await page.mouse.up();
		await expect.poll(() => page.locator('#commits').textContent()).toBe('1');
		expect(await hue.evaluate((element) => element === document.activeElement)).toBe(true);

		await hue.focus();
		await page.keyboard.down('ArrowRight');
		await expect.poll(() => page.locator('#color').textContent()).toBe('#00b2ff');
		await page.keyboard.up('ArrowRight');
		await expect.poll(() => page.locator('#commits').textContent()).toBe('2');

		const saturation = page.locator('[data-testid="picker"] [aria-label="Color"]');
		const saturationBox = await saturation.boundingBox();
		expect(saturationBox).not.toBeNull();
		await dispatchTouch(
			page,
			'[data-testid="picker"] [aria-label="Color"]',
			'touchstart',
			saturationBox!.x + saturationBox!.width / 4,
			saturationBox!.y + saturationBox!.height / 4,
		);
		await dispatchTouch(
			page,
			'[data-testid="picker"] [aria-label="Color"]',
			'touchmove',
			saturationBox!.x + saturationBox!.width * 0.75,
			saturationBox!.y + saturationBox!.height * 0.25,
			'window',
		);
		await dispatchTouch(
			page,
			'[data-testid="picker"] [aria-label="Color"]',
			'touchend',
			saturationBox!.x + saturationBox!.width * 0.75,
			saturationBox!.y + saturationBox!.height * 0.25,
			'window',
		);
		await expect.poll(() => page.locator('#commits').textContent()).toBe('3');
		const colorAfterTouch = await page.locator('#color').textContent();
		await page.mouse.click(
			saturationBox!.x + saturationBox!.width / 2,
			saturationBox!.y + saturationBox!.height / 2,
		);
		expect(await page.locator('#color').textContent()).toBe(colorAfterTouch);

		const multitouch = await page.evaluate(() => {
			const picker = document.querySelector('[data-testid="hsva-picker"]')!;
			const hue = picker.querySelector('[aria-label="Hue"]')!;
			const alpha = picker.querySelector('[aria-label="Alpha"]')!;
			const hueBox = hue.getBoundingClientRect();
			const alphaBox = alpha.getBoundingClientRect();
			const first = { identifier: 1, pageX: hueBox.left, pageY: hueBox.top };
			const second = { identifier: 2, pageX: alphaBox.left, pageY: alphaBox.top };
			const emit = (
				target: EventTarget,
				type: string,
				touches: object[],
				changedTouches: object[],
			) => {
				const event = new Event(type, { bubbles: true, cancelable: true });
				Object.defineProperties(event, {
					touches: { value: touches },
					changedTouches: { value: changedTouches },
				});
				target.dispatchEvent(event);
			};
			emit(hue, 'touchstart', [first], [first]);
			emit(alpha, 'touchstart', [first, second], [second]);
			emit(
				window,
				'touchmove',
				[
					{ ...first, pageX: hueBox.right },
					{ ...second, pageX: alphaBox.right },
				],
				[],
			);
			return true;
		});
		expect(multitouch).toBe(true);
		await expect
			.poll(() => page.locator('#hsva').textContent())
			.toBe('{"h":360,"s":100,"v":100,"a":1}');

		await page.locator('[data-testid="input"]').evaluate((element) => {
			const input = element as HTMLInputElement;
			input.value = '#abcdef';
			input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
		});
		await expect.poll(() => page.locator('#color').textContent()).toBe('#abcdef');

		await page.click('#mount-shadow');
		await page.click('#mount-frame');
		const ownership = await page.evaluate(() => {
			const shadow = document.querySelector('#shadow-host')!.shadowRoot!;
			const frame = document.querySelector<HTMLIFrameElement>('#frame-host')!;
			return {
				documentStyles: [...document.head.querySelectorAll('style')].filter((style) =>
					style.textContent?.includes('.react-colorful'),
				).length,
				shadowStyles: shadow.querySelectorAll('style').length,
				shadowNonce: shadow.querySelector('style')?.getAttribute('nonce'),
				frameStyles: frame.contentDocument!.head.querySelectorAll('style').length,
				frameNonce: frame.contentDocument!.head.querySelector('style')?.getAttribute('nonce'),
			};
		});
		expect(ownership).toEqual({
			documentStyles: 1,
			shadowStyles: 1,
			shadowNonce: 'browser-colorful',
			frameStyles: 1,
			frameNonce: 'browser-colorful',
		});
		expect(errors).toEqual([]);
	} finally {
		await page.close();
		await browser.close();
	}
}

describe('@octanejs/colorful real-browser parity', () => {
	// @parity-case browser:react-colorful-chromium
	it(
		'chromium: drives native interaction and closest-root styles',
		() => runBrowserCase('chromium'),
		60_000,
	);

	// @parity-case browser:react-colorful-firefox
	it(
		'firefox: drives native interaction and closest-root styles',
		() => runBrowserCase('firefox'),
		60_000,
	);
});
