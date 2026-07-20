import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(__dirname, 'package.json'))('@playwright/test');
import { spawn } from 'node:child_process';

const child = spawn('pnpm', ['dev', '--port', '4177'], {
	cwd: path.join(__dirname, 'octane'),
	env: { ...process.env, BENCH_DEFER_MS: '30' },
	stdio: 'ignore',
	detached: true,
});
await new Promise((r) => setTimeout(r, 12000));
const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => {
	if (m.text().includes('[probe')) logs.push(m.text());
});
try {
	await page.goto('http://localhost:4177/posts', { waitUntil: 'load' });
	await page.waitForSelector('[data-testid="posts-parent-hydration-counter"]', { timeout: 20000 });
	logs.push('──── navigating to /posts/3 ────');
	await page.click('a[href="/posts/3"]');
	await page.waitForSelector('h4', { timeout: 15000 });
	await page.waitForTimeout(400);
} finally {
	console.log(logs.join('\n'));
	await browser.close();
	try {
		process.kill(-child.pid);
	} catch {}
}
