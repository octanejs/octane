// A config `data` module: the server opens one store per request, renders the
// route inside it, and seeds its loaded values before </body>; the browser opens
// its store from that seed, so hydration asks for nothing. Production build and
// dev server both.
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import { createTempProject } from '../../../octane/tests/_temp-project.js';
import { createNodeServer } from '../../../app-core/src/server/node-http.js';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const repoRoot = path.resolve(packageRoot, '../..');
const projects: Array<ReturnType<typeof createTempProject>> = [];

afterAll(() => {
	for (const project of projects) project.dispose();
});

const files = {
	'index.html': `<!doctype html>
<html><head><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div></body></html>`,
	'vite.config.ts': `import { defineConfig } from 'vite';
import { octane } from '@octanejs/vite-plugin';
export default defineConfig({ plugins: [octane()], logLevel: 'silent' });`,
	'octane.config.ts': `import { defineConfig, RenderRoute } from '@octanejs/vite-plugin';
export default defineConfig({
	data: '/src/data.ts',
	router: { routes: [new RenderRoute({ path: '/', entry: '/src/Notes.tsrx' })] },
});`,
	'src/data.ts': `import { createDataStore, read, type DataStore, type StandardSchema } from 'octane/data';

const list: StandardSchema<unknown, string[]> = {
	'~standard': { version: 1, vendor: 'fixture', validate: (value) => ({ value: value as string[] }) },
};
export const notes = read({ name: 'notes', output: list });

const fixture = globalThis as typeof globalThis & { __fixtureDataRequests?: string[] };

export default function open(seed: string | null): DataStore {
	return createDataStore({
		seed,
		transport: async (request) => {
			(fixture.__fixtureDataRequests ??= []).push(request.name);
			return { ok: true, value: ['Tides', 'Kelp'] };
		},
	});
}
`,
	'src/Notes.tsrx': `import { useState } from 'octane';
import { useRead } from 'octane/data/octane';
import { notes } from './data.ts';

function List() @{
	const list = useRead(notes);
	<ul data-notes="">
		@for (const note of list; key note) {
			<li>{note}</li>
		}
	</ul>
}

export function Notes() @{
	const [clicks, setClicks] = useState(0);
	<main>
		<button data-clicks="" onClick={() => setClicks((count) => count + 1)}>{'clicks ' + clicks}</button>
		@try {
			<List />
		} @pending {
			<p>{'Loading'}</p>
		}
	</main>
}
`,
};

function createProject() {
	const project = createTempProject('octane-vite-route-data');
	projects.push(project);
	const root = project.root;
	for (const [file, contents] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		fs.writeFileSync(path.join(root, file), contents);
	}
	const link = (name: string, target: string) => {
		const destination = path.join(root, 'node_modules', name);
		fs.mkdirSync(path.dirname(destination), { recursive: true });
		fs.symlinkSync(target, destination, 'dir');
	};
	link('octane', path.join(repoRoot, 'packages/octane'));
	link('@octanejs/vite-plugin', packageRoot);
	link('vite', path.join(packageRoot, 'node_modules/vite'));
	return root;
}

/** The page server-renders its notes with their seed, then hydrates from it. */
async function expectSeededHydration(origin: string) {
	const html = await (await fetch(origin + '/')).text();
	expect(html).toContain('<li>Tides</li>');
	const seedAt = html.indexOf('<script id="__octane_seed:data" type="application/json">');
	expect(seedAt).toBeGreaterThan(html.indexOf('<li>Kelp</li>'));
	expect(seedAt).toBeLessThan(html.lastIndexOf('</body>'));

	const browser = await launchBrowser({ headless: true });
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		await page.goto(origin + '/', { waitUntil: 'networkidle' });
		const button = page.locator('[data-clicks]');
		await button.click();
		await expect.poll(() => button.textContent()).toBe('clicks 1');
		expect(await page.locator('[data-notes] li').allTextContents()).toEqual(['Tides', 'Kelp']);
		// The browser's store started from the seed, so it asked for nothing.
		expect(
			await page.evaluate(
				() => (globalThis as { __fixtureDataRequests?: string[] }).__fixtureDataRequests,
			),
		).toBeUndefined();
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}

describe('config data module', { timeout: 180_000 }, () => {
	it('seeds the page from the per-request store and hydrates from it in a production build', async () => {
		const root = createProject();
		await build({ root, logLevel: 'silent' });
		const { handler } = await import(pathToFileURL(path.join(root, 'dist/server/entry.js')).href);
		const server: Server = createNodeServer(handler, {
			staticDir: path.join(root, 'dist/client'),
		}).listen(0);
		await once(server, 'listening');
		try {
			const address = server.address();
			await expectSeededHydration(
				`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`,
			);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	it('does the same from the dev server', async () => {
		const root = createProject();
		const server = await createServer({
			root,
			logLevel: 'silent',
			server: { host: '127.0.0.1', port: 0 },
		});
		await server.listen();
		try {
			const address = server.httpServer!.address();
			await expectSeededHydration(
				`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`,
			);
		} finally {
			await server.close();
		}
	});
});
