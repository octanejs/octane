import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import type { Browser, Page } from 'playwright';
import type {} from './main.js';

const here = fileURLToPath(new URL('.', import.meta.url));
export const packageRoot = path.resolve(here, '../../..');
let server: ViteDevServer | undefined;

export async function closeHostStateServer(): Promise<void> {
	await server?.close();
	server = undefined;
}

/** Exercise renderer preparation/commit with Chromium's native form state. */
export async function openStagePage(
	browser: Browser,
	selectedPackage = packageRoot,
): Promise<Page> {
	if (server === undefined) {
		const packageRequire = createRequire(path.join(selectedPackage, 'package.json'));
		server = await createServer({
			cacheDir: path.resolve(here, '../../../../../node_modules/.vite/octane-vt-host-state'),
			configFile: false,
			root: here,
			logLevel: 'error',
			plugins: [
				{
					name: 'view-transition-package',
					enforce: 'pre',
					resolveId(id) {
						if (id === 'octane' || id.startsWith('octane/')) return packageRequire.resolve(id);
						return null;
					},
				},
				octane({ hmr: false }),
			],
			server: {
				host: '127.0.0.1',
				port: 0,
				hmr: false,
				fs: { allow: [path.resolve(here, '../../../../..'), selectedPackage] },
			},
		});
		await server.listen();
	}
	const page = await browser.newPage();
	try {
		const address = server.httpServer!.address();
		if (address === null || typeof address === 'string') throw new Error('Vite has no TCP port');
		await page.goto(`http://127.0.0.1:${address.port}/`);
		await page.waitForFunction(() => Boolean(window.octaneHostState));
		return page;
	} catch (error) {
		await page.close();
		throw error;
	}
}
