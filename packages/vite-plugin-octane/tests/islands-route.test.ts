// Islands-only routes (#1514): a `hydrate: 'islands'` RenderRoute serves its
// server-rendered shell with a renderer-free bootstrap. A real production
// build must keep the renderer out of that bootstrap's static graph, keep the
// shell's CSS, never preload the shell's JavaScript, and reject a shell that
// needs client work.
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build, createLogger, createServer, type Plugin } from 'vite';
import { createTempProject } from '../../octane/tests/_temp-project.js';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
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
		preHydrate: '/src/pre-hydrate.ts',
		routes: [
			new RenderRoute({ path: '/', entry: ['App', '/src/App.tsrx'], hydrate: 'islands' }),
			new RenderRoute({ path: '/full', entry: ['App', '/src/App.tsrx'] }),
		],
	},
});`,
	'src/styles.css': `.shell { color: rgb(1, 2, 3); }`,
	'src/pre-hydrate.ts': `export default function preHydrate() { (globalThis as any).__islandsPreHydrate = true; }`,
	'src/state.tsrx': `import { signal$ } from 'octane/signals';
export const count$ = signal$(1);
export function increment() { count$.set((n) => n + 1); }`,
	'src/Counter.tsrx': `import { count$, increment } from './state.tsrx';
export function Counter() @{
  'use dom bindings';
  <button type="button" onClick={increment}>{count$}</button>
}`,
	// Static output may interpolate plain-module values and assets.
	'src/copy.ts': `export const tagline = 'Server-rendered shell';`,
	'src/logo.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>`,
	'src/Header.tsrx': `import { tagline } from './copy.ts';
import logo from './logo.svg';
export function Header() @{
  <header><img src={logo} alt="" /><h1>Islands</h1><p>{tagline as string}</p></header>
}`,
	'src/App.tsrx': `import { Hydrate } from 'octane';
import { interaction } from 'octane/hydration';
import { Counter } from './Counter.tsrx';
import { Header } from './Header.tsrx';
import './styles.css';
export function App() @{
  <main class="shell">
    <Header />
    <Hydrate independent when={interaction()}><Counter /></Hydrate>
  </main>
}`,
};

interface BuiltGraph {
	chunks: Map<string, { imports: string[]; modules: string[]; facade: string | null }>;
}

function writeProject(overrides: Record<string, string> = {}) {
	const project = createTempProject('octane-vite-islands');
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
	return root;
}

async function buildProject(overrides: Record<string, string> = {}) {
	const root = writeProject(overrides);
	const graph: BuiltGraph = { chunks: new Map() };
	// Observe the client graph the browser would load; the server build is separate.
	const probe: Plugin = {
		name: 'islands-graph-probe',
		generateBundle(_options, bundle) {
			if (this.environment?.config?.consumer === 'server') return;
			for (const output of Object.values(bundle)) {
				if (output.type !== 'chunk') continue;
				graph.chunks.set(output.fileName, {
					imports: output.imports,
					modules: output.moduleIds,
					facade: output.facadeModuleId,
				});
			}
		},
	};
	await build({ root, logLevel: 'silent', plugins: [probe] });
	return { root, graph };
}

describe('islands-only routes', { timeout: 180_000 }, () => {
	it('serves the shell with a renderer-free bootstrap and keeps full routes unchanged', async () => {
		const { root, graph } = await buildProject();
		const dist = path.join(root, 'dist');
		const islandsEntry = [...graph.chunks].find(
			([, chunk]) => chunk.facade === '\0virtual:octane-islands',
		);
		expect(islandsEntry).toBeDefined();
		const reached = new Set<string>();
		const visit = (file: string) => {
			if (reached.has(file)) return;
			reached.add(file);
			for (const imported of graph.chunks.get(file)?.imports ?? []) visit(imported);
		};
		visit(islandsEntry![0]);
		const renderer = /packages\/octane\/src\/(?:index|runtime|internal\/client)\.ts$/;
		const staticModules = [...reached].flatMap((file) => graph.chunks.get(file)!.modules);
		expect(staticModules.filter((id) => renderer.test(id))).toEqual([]);
		// Control: the full entry of the same build does load the renderer.
		const fullEntry = [...graph.chunks].find(
			([, chunk]) => chunk.facade === '\0virtual:octane-hydrate',
		)!;
		const fullReached = new Set<string>();
		const visitFull = (file: string) => {
			if (fullReached.has(file)) return;
			fullReached.add(file);
			for (const imported of graph.chunks.get(file)?.imports ?? []) visitFull(imported);
		};
		visitFull(fullEntry[0]);
		expect(
			[...fullReached].some((file) =>
				graph.chunks.get(file)!.modules.some((id) => renderer.test(id)),
			),
		).toBe(true);

		const { handler } = await import(pathToFileURL(path.join(dist, 'server/entry.js')).href);
		const islands = await (await handler(new Request('http://localhost/'))).text();
		const full = await (await handler(new Request('http://localhost/full'))).text();
		const entrySource = (html: string) =>
			html.match(/<script\b[^>]*\bdata-octane-hydrate\b[^>]*\bsrc="([^"]+)"/)?.[1] ??
			html.match(/data-octane-hydrate-src="([^"]+)"/)?.[1];
		expect(entrySource(islands)).toBe('/' + islandsEntry![0]);
		expect(entrySource(full)).toBe('/' + fullEntry[0]);
		// The shell's CSS ships with both routes; only the full route preloads the page chunk.
		const stylesheet = (html: string) =>
			[...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((match) => match[1]);
		expect(stylesheet(islands)).toEqual(stylesheet(full));
		expect(stylesheet(islands).length).toBeGreaterThan(0);
		expect(islands).not.toContain('rel="modulepreload"');
		expect(full).toContain('rel="modulepreload"');
		// Both responses render the same server shell and island.
		expect(islands).toContain('<h1>Islands</h1>');
		expect(islands).toContain('Server-rendered shell');
		expect(islands).toContain('data-octane-hydrate-independent');
	});

	it('rejects a shell that needs client work', async () => {
		await expect(
			buildProject({
				'src/Header.tsrx': `export function Header() @{ <header><button onClick={() => {}}>Menu</button></header> }`,
			}),
		).rejects.toThrow(/hydrate: 'islands'.*Header\.tsrx:1:.*"onClick" needs client code/s);
	});

	// Dev serves the route either way; without a warning its interactive shell
	// would be silently inert there until the first production build failed.
	it('warns in dev when a shell needs client work, and keeps serving it', async () => {
		const root = writeProject({
			'src/Header.tsrx': `export function Header() @{ <header><button onClick={() => {}}>Menu</button></header> }`,
		});
		const warnings: string[] = [];
		const logger = createLogger('silent');
		logger.warn = (message) => {
			warnings.push(message);
		};
		const server = await createServer({
			root,
			customLogger: logger,
			server: { host: '127.0.0.1', port: 0, hmr: false, ws: false },
		});
		try {
			await server.listen();
			const address = server.httpServer?.address();
			if (!address || typeof address !== 'object') throw new Error('dev server has no address');
			for (let request = 0; request < 2; request++) {
				const response = await fetch(`http://127.0.0.1:${address.port}/`);
				expect(response.status).toBe(200);
				expect(await response.text()).toContain('Menu');
			}
			// The source check names the build failure; the render witness may also report the site.
			const source = warnings.filter((message) => message.includes('needs client code'));
			expect(source).toHaveLength(1);
			expect(source[0]).toMatch(
				/hydrate: 'islands'.*Header\.tsrx:1:.*"onClick" needs client code/s,
			);
		} finally {
			await server.close();
		}
	});

	// The build checks the shell's source, which cannot follow a plain helper's
	// createElement call. A dev render reaches the element itself and warns,
	// once, while the route keeps serving; the island's own handler and live
	// binding, and the same shell on a full route, stay silent.
	it('warns in dev when a rendered shell needs client work its source hides', async () => {
		const root = writeProject({
			'src/menu.ts': `import { createElement } from 'octane';
export function menuButton(label: string) {
	return createElement('button', { type: 'button', onClick: () => {} }, label);
}`,
			'src/Header.tsrx': `import { menuButton } from './menu.ts';
export function Header() @{ <header><h1>Islands</h1>{menuButton('Menu')}</header> }`,
		});
		const warnings: string[] = [];
		const logger = createLogger('silent');
		logger.warn = (message) => {
			warnings.push(message);
		};
		const server = await createServer({
			root,
			customLogger: logger,
			server: { host: '127.0.0.1', port: 0, hmr: false, ws: false },
		});
		try {
			await server.listen();
			const address = server.httpServer?.address();
			if (!address || typeof address !== 'object') throw new Error('dev server has no address');
			for (const route of ['/', '/', '/full']) {
				const response = await fetch(`http://127.0.0.1:${address.port}${route}`);
				expect(response.status).toBe(200);
				expect(await response.text()).toContain('Menu</button>');
			}
			const witnesses = warnings.filter((message) => message.includes('outside an independent'));
			expect(witnesses).toEqual([
				expect.stringMatching(
					/RenderRoute "\/" uses hydrate: 'islands', but its shell rendered "onClick" on <button> in Header outside an independent <Hydrate>/,
				),
			]);
		} finally {
			await server.close();
		}
	});

	it('rejects a preHydrate hook that reaches the renderer', async () => {
		await expect(
			buildProject({
				'src/pre-hydrate.ts': `import { flushSync } from 'octane';
export default function preHydrate() { flushSync(() => {}); }`,
			}),
		).rejects.toThrow(/islands-only route's bootstrap reaches the Octane renderer/);
	});
});
