import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';

const playgroundRoot = resolve(import.meta.dirname, '../../../../playground/octane');

async function exerciseJourney(browser, url) {
	const page = await browser.newPage();
	const diagnostics = [];
	page.on('console', (message) => {
		if (message.type() === 'error') diagnostics.push(message.text());
	});
	page.on('pageerror', (error) => diagnostics.push(error.message));
	try {
		await page.goto(`${url}/#/react-dropzone`);
		await page.getByRole('heading', { name: 'React Dropzone on Octane' }).waitFor();
		const requests = [];
		page.on('request', (request) => requests.push(request.url()));

		const zone = page.locator('section.panel');
		const [chooser] = await Promise.all([page.waitForEvent('filechooser'), zone.click()]);
		await chooser.setFiles({
			name: 'chosen.png',
			mimeType: 'image/png',
			buffer: Buffer.from('chosen'),
		});
		await page.getByText('chosen.png', { exact: true }).waitFor();

		await zone.evaluate((root) => {
			const transfer = new DataTransfer();
			transfer.items.add(new File(['drop'], 'private-drop.jpg', { type: 'image/jpeg' }));
			root.dispatchEvent(
				new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
			);
		});
		await page.getByText('Checking files…', { exact: true }).waitFor();
		await page.getByText(/private-drop\.jpg: Remove/).waitFor();

		await zone.evaluate((root) => {
			const transfer = new DataTransfer();
			transfer.items.add(new File(['paste'], 'pasted.jpeg', { type: 'image/jpeg' }));
			const event = new Event('paste', { bubbles: true, cancelable: true });
			Object.defineProperty(event, 'clipboardData', { value: transfer });
			root.dispatchEvent(event);
		});
		await page.getByText('pasted.jpeg', { exact: true }).waitFor();

		const openCalls = await page.evaluate(async () => {
			const input = document.querySelector('input[type=file]');
			if (!(input instanceof HTMLInputElement)) throw new Error('missing file input');
			let calls = 0;
			input.click = () => {
				calls += 1;
			};
			const button = [...document.querySelectorAll('button')].find((candidate) =>
				candidate.textContent?.includes('Choose files programmatically'),
			);
			if (!(button instanceof HTMLButtonElement)) throw new Error('missing open button');
			button.click();
			await Promise.resolve();
			return calls;
		});
		assert.equal(openCalls, 1);
		assert.deepEqual(requests, [], 'file journeys must not call a network or upload service');
		assert.deepEqual(diagnostics, []);
	} finally {
		await page.close();
	}
}

test(
	'playground route exercises local file-acquisition journeys in development and production',
	{ timeout: 120_000 },
	async () => {
		const devServer = await createServer({ root: playgroundRoot });
		await devServer.listen(0);
		const devAddress = devServer.httpServer?.address();
		assert.ok(devAddress && typeof devAddress !== 'string');
		const browser = await chromium.launch({ headless: true });
		let previewServer;
		try {
			await exerciseJourney(browser, `http://127.0.0.1:${devAddress.port}`);
			await build({ root: playgroundRoot, logLevel: 'silent' });
			previewServer = await preview({
				root: playgroundRoot,
				logLevel: 'silent',
				preview: { host: '127.0.0.1', port: 0 },
			});
			const previewAddress = previewServer.httpServer.address();
			assert.ok(previewAddress && typeof previewAddress !== 'string');
			await exerciseJourney(browser, `http://127.0.0.1:${previewAddress.port}`);
		} finally {
			previewServer?.httpServer.close();
			await browser.close();
			await devServer.close();
		}
	},
);
