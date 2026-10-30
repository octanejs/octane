import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { expect } from 'vitest';
import { octane } from '../../../octane/src/compiler/vite.js';

type Browser = import('playwright').Browser;
type Page = import('playwright').Page;
export type Framework = 'octane' | 'react';

const testRoot = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(testRoot, 'harness');
const bindingSource = resolve(testRoot, '../../src/react.ts');
const octaneSource = resolve(testRoot, '../../../octane/src/index.ts');

function freePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createNetServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as import('node:net').AddressInfo;
			server.close(() => resolvePort(port));
		});
	});
}

// The React page runs the same `.tsrx` scenarios through @tsrx/react, so both lists
// render one authored fixture; only the list implementation and renderer differ.
function tsrxReact(): Plugin {
	return {
		name: 'legendapp-list-tsrx-react',
		enforce: 'pre',
		transform(code, id) {
			if (!id.endsWith('.tsrx')) return;
			const compiled = compileToReact(code, id);
			if (compiled.errors?.length) {
				throw new Error(`@tsrx/react failed for ${id}: ${JSON.stringify(compiled.errors)}`);
			}
			const output = transformSync(compiled.code, {
				format: 'esm',
				jsx: 'automatic',
				jsxImportSource: 'react',
				loader: 'tsx',
				sourcefile: id,
				target: 'es2022',
			}).code.replace(/from\s+["']octane["']/g, 'from "react"');
			return { code: output, map: null };
		},
	};
}

async function serve(framework: Framework): Promise<{ origin: string; server: ViteDevServer }> {
	const port = await freePort();
	const mount = resolve(harnessRoot, `mount-${framework}.ts`);
	const server = await createServer({
		root: harnessRoot,
		configFile: false,
		logLevel: 'error',
		cacheDir: resolve(testRoot, `../../node_modules/.vite-browser-${framework}`),
		server: { host: '127.0.0.1', port, strictPort: true },
		plugins: framework === 'octane' ? [octane()] : [tsrxReact()],
		optimizeDeps:
			framework === 'react'
				? {
						entries: [],
						include: [
							'react',
							'react/jsx-runtime',
							'react-dom/client',
							'@legendapp/list/react',
							'@tsrx/react/runtime/iterable',
						],
					}
				: { entries: [] },
		resolve: {
			dedupe: ['react', 'react-dom', 'octane'],
			alias: [
				{ find: /^legend-harness-mount$/, replacement: mount },
				{
					find: /^legend-list-under-test$/,
					replacement: framework === 'octane' ? bindingSource : '@legendapp/list/react',
				},
				...(framework === 'octane' ? [{ find: /^octane$/, replacement: octaneSource }] : []),
			],
		},
	});
	await server.listen();
	return { origin: `http://127.0.0.1:${port}`, server };
}

export interface Lane {
	framework: Framework;
	page: Page;
	errors: string[];
}

export class Differential {
	private browser!: Browser;
	private servers: { origin: string; server: ViteDevServer }[] = [];
	private open: Lane[] = [];

	async start() {
		const { chromium } = await import('playwright');
		this.browser = await chromium.launch({ headless: true });
		this.servers = await Promise.all([serve('octane'), serve('react')]);
	}

	async stop() {
		await this.browser?.close().catch(() => {});
		await Promise.all(this.servers.map(({ server }) => server.close().catch(() => {})));
	}

	/** Opens the scenario on both pages and waits for each list to settle. */
	async mount(scenario: string, query = ''): Promise<Lane[]> {
		const lanes = await Promise.all(
			(['octane', 'react'] as const).map(async (framework, index) => {
				const context = await this.browser.newContext({ viewport: { width: 800, height: 700 } });
				const page = await context.newPage();
				const errors: string[] = [];
				page.on('pageerror', (error) => errors.push(error.message));
				page.on('console', (message) => {
					if (message.type() === 'error') errors.push(message.text());
				});
				await page.goto(`${this.servers[index].origin}/?scenario=${scenario}${query}`);
				await page.waitForFunction(() => window.__ready && window.__legend.ref.current !== null);
				return { framework, page, errors };
			}),
		);
		this.open = lanes;
		await Promise.all(lanes.map(({ page }) => settle(page)));
		return lanes;
	}

	async close() {
		await Promise.all(this.open.map(({ page }) => page.context().close()));
		this.open = [];
	}

	/**
	 * Runs one step on both pages, then requires identical settled observations.
	 * `order` also compares DOM order, which is only defined once the debounced
	 * reorder has run; `unorderedLog` compares the log as a multiset where sibling
	 * row effects run in DOM order on Octane and slot order on React.
	 */
	async step(
		name: string,
		action: (page: Page) => Promise<unknown>,
		{ wait = 0, order = false, unorderedLog = false, expectedErrors = 0 } = {},
	) {
		for (const { page } of this.open) await action(page);
		if (wait) await Promise.all(this.open.map(({ page }) => page.waitForTimeout(wait)));
		await Promise.all(this.open.map(({ page }) => settle(page)));
		const [octaneLane, reactLane] = this.open;
		const [octaneView, reactView] = (
			await Promise.all(this.open.map(({ page }) => observe(page)))
		).map((view) => normalize(view, { order, unorderedLog }));
		expect(octaneLane.errors, `${name}: Octane page errors`).toHaveLength(expectedErrors);
		expect(reactLane.errors, `${name}: React page errors`).toHaveLength(expectedErrors);
		expect(octaneView, name).toEqual(reactView);
		return octaneView as Observation;
	}
}

export type Observation = Record<string, any>;

function normalize(
	view: Observation,
	{ order, unorderedLog }: { order: boolean; unorderedLog: boolean },
) {
	const { domOrder, log, ...rest } = view;
	return {
		...rest,
		...(order ? { domOrder } : {}),
		log: unorderedLog ? [...log].map((entry) => JSON.stringify(entry)).sort() : log,
	};
}

function observe(page: Page) {
	return page.evaluate(() => window.__snapshot());
}

// Settled means 24 consecutive animation frames (about 400ms, past the 300ms MVCP
// anchor lock and the 200ms scroll-end fallback) observe the same list state.
async function settle(page: Page) {
	await page.evaluate(async () => {
		const frame = () => new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
		let previous = '';
		let stable = 0;
		for (let index = 0; index < 600 && stable < 24; index++) {
			await frame();
			const next = JSON.stringify(window.__snapshot());
			stable = next === previous ? stable + 1 : 0;
			previous = next;
		}
	});
}

export function scrollTo(offset: number, axis: 'top' | 'left' = 'top') {
	return (page: Page) =>
		page.evaluate(
			([value, side]) => {
				const node = window.__legend.ref.current.getScrollableNode() as HTMLElement;
				if (side === 'top') node.scrollTop = value as number;
				else node.scrollLeft = value as number;
			},
			[offset, axis] as const,
		);
}

export function callRef(method: string, ...args: unknown[]) {
	return (page: Page) =>
		page.evaluate(
			([name, values]) => window.__legend.ref.current[name as string](...(values as unknown[])),
			[method, args] as const,
		);
}

export function act(action: string, ...args: unknown[]) {
	return (page: Page) =>
		page.evaluate(
			([name, values]) => window.__legend.actions[name as string](...(values as unknown[])),
			[action, args] as const,
		);
}
