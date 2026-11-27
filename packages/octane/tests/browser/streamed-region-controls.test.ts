import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import type * as StreamReceiver from '../../src/hydration/stream-receiver.js';
import type { StreamFrameIdentity } from '../../src/streamed-signals-protocol.js';

declare global {
	interface Window {
		OctaneStreamReceiver: typeof StreamReceiver;
		retiredForm: WeakRef<HTMLFormElement>;
		commitRangeUpdate(): Promise<{
			sameNode: boolean;
			fields: [string, FormDataEntryValue][];
			defaultValue: string;
		}>;
	}
}

const identity: StreamFrameIdentity = {
	protocol: 1,
	buildId: 'build',
	documentId: 'document',
	ownerKey: 'owner',
	instanceKey: 'form',
	nodeKey: 'control',
	selectionKey: 'form',
	selectionGeneration: 0,
	attempt: 0,
};

async function buildReceiver() {
	const { outputFiles } = await build({
		entryPoints: [
			fileURLToPath(new URL('../../src/hydration/stream-receiver.ts', import.meta.url)),
		],
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		globalName: 'OctaneStreamReceiver',
		define: { 'process.env.NODE_ENV': '"production"' },
	});
	return outputFiles[0].text;
}

it.each(['keyboard', 'eventless'])(
	'keeps the %s range value allowed by the new minimum and step',
	async (edit) => {
		const content = await buildReceiver();
		const browser = await launchBrowser({ headless: true });
		try {
			const page = await browser.newPage();
			await page.addScriptTag({ content });
			await page.evaluate(async (identity) => {
				const { createStreamedRegionReceiver } = window.OctaneStreamReceiver;
				const receiver = createStreamedRegionReceiver(identity);
				const form = document.createElement('form');
				const start = document.createComment('[');
				const end = document.createComment(']');
				form.append(start, end);
				document.body.append(form);
				receiver.registerSelection(identity);
				receiver.registerRegion({
					identity,
					start,
					end,
					contentRevision: 0,
					isActive: () => false,
					loadStyles() {},
					adoptHistoricalFrame: () => ({ release() {} }),
				});
				const place = (sequence: number, html: string) =>
					receiver.receive({
						identity,
						sequence,
						channel: 'placement',
						kind: 'html',
						mode: 'full',
						contentRevision: sequence + 1,
						html: '<!--[-->' + html + '<!--]-->',
						historicalFrame: { version: 1, scopeKey: identity.ownerKey, entries: [] },
						styles: [],
					});
				await place(
					0,
					'<input name="level" data-octane-input="level" type="range" min="1" step="4" value="9">',
				);
				const original = form.querySelector('input')!;
				window.commitRangeUpdate = async () => {
					await place(
						1,
						'<input name="level" data-octane-input="level" type="range" min="0" step="1" value="8">',
					);
					return {
						sameNode: form.querySelector('input') === original,
						fields: [...new FormData(form)],
						defaultValue: original.defaultValue,
					};
				};
			}, identity);
			const slider = page.getByRole('slider');
			if (edit === 'keyboard') await slider.press('ArrowRight');
			else
				await slider.evaluate((input: HTMLInputElement) => {
					input.value = '13';
				});
			expect(await slider.inputValue()).toBe('13');
			expect(await page.evaluate(() => window.commitRangeUpdate())).toEqual({
				sameNode: true,
				fields: [['level', '13']],
				defaultValue: '8',
			});
		} finally {
			await browser.close();
		}
	},
);

it('releases a removed form after its reset control moves out of a live streamed region', async () => {
	const content = await buildReceiver();
	const browser = await launchBrowser({ headless: true });
	try {
		const page = await browser.newPage();
		await page.addScriptTag({ content });
		const resetValue = await page.evaluate(async (identity) => {
			const retired = document.createElement('form');
			retired.id = 'retired';
			const current = document.createElement('form');
			const start = document.createComment('[');
			const end = document.createComment(']');
			const select = document.createElement('select');
			select.setAttribute('data-octane-input', 'choice');
			select.setAttribute('form', retired.id);
			select.innerHTML = '<option>a</option><option>b</option>';
			document.body.append(retired, current, start, select, end);
			const receiver = window.OctaneStreamReceiver.createStreamedRegionReceiver(identity);
			receiver.registerSelection(identity);
			receiver.registerRegion({
				identity,
				start,
				end,
				contentRevision: 0,
				isActive: () => false,
				loadStyles() {},
				adoptHistoricalFrame: () => ({ release() {} }),
			});
			select.value = 'b';
			select.dispatchEvent(new Event('input', { bubbles: true }));
			retired.reset();
			select.removeAttribute('form');
			current.append(select);
			retired.remove();
			window.retiredForm = new WeakRef(retired);
			// Cross a host task so any observation of the final reset has settled.
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			return select.value;
		}, identity);
		expect(resetValue).toBe('a');

		const session = await page.context().newCDPSession(page);
		await session.send('HeapProfiler.collectGarbage');
		await session.send('HeapProfiler.collectGarbage');
		expect(await page.evaluate(() => window.retiredForm.deref() === undefined)).toBe(true);
	} finally {
		await browser.close();
	}
});
