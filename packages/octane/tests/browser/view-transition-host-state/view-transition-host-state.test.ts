import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { openStagePage } from './harness.js';

let browser: Browser;
beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
});

it('reads committed scroll geometry until queued scrolling is published', async () => {
	const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		const observed = await page.evaluate(() => {
			const host = document.createElement('div');
			host.style.cssText = 'width:100px;height:100px;overflow:scroll';
			host.innerHTML = '<div style="height:1000px;width:1000px">content</div>';
			document.body.appendChild(host);
			host.scrollTop = 120;
			host.scrollLeft = 80;
			const stage = new window.OctaneStage.DOMStage();
			const prepared = stage.view(host);
			prepared.scrollTop = 480;
			prepared.scrollLeft = 360;
			const before = [host.scrollTop, host.scrollLeft, prepared.scrollTop, prepared.scrollLeft];
			stage.commit();
			return { before, after: [host.scrollTop, host.scrollLeft] };
		});
		expect(observed.before).toEqual([120, 80, 120, 80]);
		expect(observed.after).toEqual([480, 360]);
	} finally {
		await page.close();
	}
});

it('keeps an external radio associated with the original form through projected changes', async () => {
	const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		const observed = await page.evaluate(() => {
			document.body.innerHTML =
				'<form id="owner"><input type="radio" name="choice" checked></form><input type="radio" name="choice" form="owner">';
			const form = document.querySelector('form')!;
			const first = form.querySelector('input')!;
			const external = document.body.lastElementChild as HTMLInputElement;
			const stage = new window.OctaneStage.DOMStage();
			stage.view(external).checked = true;
			const prepared = {
				owner: stage.view(external).form === form,
				members: [...stage.view(form).elements].every(
					(node, index) => node === [first, external][index],
				),
				selected: [stage.view(first).checked, stage.view(external).checked],
			};
			const before = [first.checked, external.checked];
			stage.commit();
			return { prepared, before, after: [first.checked, external.checked] };
		});
		expect(observed).toEqual({
			prepared: { owner: true, members: true, selected: [false, true] },
			before: [true, false],
			after: [false, true],
		});
	} finally {
		await page.close();
	}
});
