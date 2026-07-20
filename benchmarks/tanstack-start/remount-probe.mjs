import { createRequire } from 'node:module';
const { chromium } = createRequire(process.cwd() + '/package.json')('@playwright/test');
import { serveBoth } from './serve-both.mjs';

const { octane, react, stop } = await serveBoth({ BENCH_DEFER_MS: '30' });
const browser = await chromium.launch();
try {
	for (const flavor of [octane, react]) {
		const page = await browser.newPage();
		await page.goto(flavor.baseURL + '/posts', { waitUntil: 'load' });
		await page.waitForSelector('[data-testid="posts-parent-hydration-counter"]');
		await page.click('[data-testid="posts-parent-hydration-counter"]');
		await page.evaluate(() => {
			document.querySelector('[data-testid="posts-parent-hydration-counter"]').__probe = 'btn';
			document.querySelector('ul').__probe = 'ul';
			document.querySelector('.p-2.flex')
				? (document.querySelector('.p-2.flex').__probe = 'wrap')
				: null;
		});
		await page.click('a[href="/posts/3"]');
		await page.waitForSelector('h4');
		const result = await page.evaluate(() => ({
			counter: document.querySelector('[data-testid="posts-parent-hydration-counter"]').textContent,
			btnSame:
				document.querySelector('[data-testid="posts-parent-hydration-counter"]').__probe === 'btn',
			ulSame: document.querySelector('ul').__probe === 'ul',
			wrapSame: document.querySelector('.p-2.flex')?.__probe === 'wrap',
		}));
		console.log(flavor.name, JSON.stringify(result));
		await page.close();
	}
} finally {
	await browser.close();
	stop();
}
