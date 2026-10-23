// The production hydrate entry ships only what its client graph uses: a void
// root when every page and layout is a proven void `@{}` body, and no root
// boundary, independent island or streamed signal code the build never compiled.
// Controls keep the general entry whenever a proof or a feature is missing.
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build, type Plugin } from 'vite';
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
	router: {
		routes: [
			new RenderRoute({ path: '/', entry: ['Page', '/src/Page.tsrx'] }),
			new RenderRoute({ path: '/bare', entry: '/src/Bare.tsrx' }),
		],
	},
});`,
	'src/Page.tsrx': `import { useState } from 'octane';
export function Page({ url }) @{
  const [count, setCount] = useState(0);
  <button type="button" data-url={url as string} onClick={() => setCount(count + 1)}>{\`Count \${count}\`}</button>
}`,
	'src/Bare.tsrx': `export default function Bare() @{
  <p>{'Bare'}</p>
}`,
};

type Graph = Map<string, { rendered: string[]; dynamicImports: string[]; facade: string | null }>;

async function buildProject(overrides: Record<string, string> = {}) {
	const project = createTempProject('octane-vite-hydrate-entry');
	projects.push(project);
	const root = project.root;
	for (const [file, contents] of Object.entries({ ...files, ...overrides })) {
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
	const graph: Graph = new Map();
	const probe: Plugin = {
		name: 'hydrate-entry-probe',
		generateBundle(_options, bundle) {
			if (this.environment?.config?.consumer === 'server') return;
			for (const output of Object.values(bundle)) {
				if (output.type !== 'chunk') continue;
				graph.set(output.fileName, {
					rendered: Object.entries(output.modules)
						.filter(([, module]) => module.renderedLength > 0)
						.map(([id]) => id),
					dynamicImports: output.dynamicImports,
					facade: output.facadeModuleId,
				});
			}
		},
	};
	await build({ root, logLevel: 'silent', plugins: [probe] });
	const renders = (module: RegExp) =>
		[...graph.values()].some((chunk) => chunk.rendered.some((id) => module.test(id)));
	return { root, graph, renders };
}

const returnReconciliation = /packages\/octane\/src\/runtime\/child-slots\.ts$/;
const streamedSignals = /packages\/octane\/src\/hydration\/streamed-signals\.ts$/;
const independentHydration = /packages\/octane\/src\/hydration\/independent[^/]*\.ts$/;

// Load `/` and `/bare` from the production server: the server button is adopted
// and live, its page props arrive, and nothing logs an error.
async function expectHydrates(root: string, buttonSelector: string) {
	const { handler } = await import(pathToFileURL(path.join(root, 'dist/server/entry.js')).href);
	const server: Server = createNodeServer(handler, {
		staticDir: path.join(root, 'dist/client'),
	}).listen(0);
	await once(server, 'listening');
	const browser = await launchBrowser({ headless: true });
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		const address = server.address();
		const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
		await page.goto(origin + '/', { waitUntil: 'networkidle' });
		const button = page.locator(buttonSelector);
		await button.evaluate((element) => ((globalThis as any).__serverButton = element));
		await button.click();
		await expect.poll(() => button.textContent()).toBe('Count 1');
		// Hydration adopted the server button rather than replacing it.
		expect(await button.evaluate((element) => element === (globalThis as any).__serverButton)).toBe(
			true,
		);
		expect(await button.getAttribute('data-url')).toBe('/');
		await page.goto(origin + '/bare', { waitUntil: 'networkidle' });
		expect(await page.locator('p').textContent()).toBe('Bare');
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
		await new Promise((resolve) => server.close(resolve));
	}
}

describe('production hydrate entry features', { timeout: 180_000 }, () => {
	it('hydrates proven void pages without optional runtime code', async () => {
		const { root, graph, renders } = await buildProject();
		expect(renders(returnReconciliation)).toBe(false);
		expect(renders(streamedSignals)).toBe(false);
		expect(renders(independentHydration)).toBe(false);
		// The entry lazily loads only the app's own route modules.
		const entry = [...graph.values()].find((chunk) => chunk.facade === '\0virtual:octane-hydrate')!;
		expect(
			entry.dynamicImports.map((file) => graph.get(file)?.facade?.replace(root, '')).sort(),
		).toEqual(['/src/Bare.tsrx', '/src/Page.tsrx']);

		await expectHydrates(root, 'button');
	});

	it('hydrates a page through its layout on a void root', async () => {
		const { root } = await buildProject({
			'octane.config.ts': `import { defineConfig, RenderRoute } from '@octanejs/vite-plugin';
export default defineConfig({
	router: {
		routes: [
			new RenderRoute({ path: '/', entry: ['Page', '/src/Page.tsrx'], layout: '/src/Layout.tsrx' }),
			new RenderRoute({ path: '/bare', entry: '/src/Bare.tsrx', layout: '/src/Layout.tsrx' }),
		],
	},
});`,
			'src/Layout.tsrx': `export default function Layout({ children }) @{
  <main>{children}</main>
}`,
		});
		await expectHydrates(root, 'main > button');
	});

	it('keeps return reconciliation when any routed component returns a value', async () => {
		const { renders } = await buildProject({
			'src/Bare.tsrx': `export default function Bare() {
  return 'Bare';
}`,
		});
		expect(renders(returnReconciliation)).toBe(true);
	});

	// The external import also proves the build walks past modules it cannot load.
	it('keeps streamed signal hydration when a compiled module declares signals', async () => {
		const { renders } = await buildProject({
			'src/state.tsrx': `import 'https://cdn.example.test/analytics.js';
import { signal$ } from 'octane/signals';
export const count$ = signal$(1);`,
			'src/Bare.tsrx': `import { count$ } from './state.tsrx';
export default function Bare() @{
  <p>{\`\${count$.get()}\`}</p>
}`,
		});
		expect(renders(streamedSignals)).toBe(true);
	});
});
