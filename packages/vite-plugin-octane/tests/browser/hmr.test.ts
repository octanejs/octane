import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'vite';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import { createTempProject } from '../../../octane/tests/_temp-project.js';
import { octane } from '../../src/index.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

function counterSource(
	extension: string,
	exportKind: string,
	revision: number,
	componentName = 'Counter',
): string {
	const body = `
		<main>
			<p id="revision">Revision ${revision}</p>
			<button onClick={() => setCount((value) => value + ${revision + 1})}>
				{'Count: ' + count}
			</button>
		</main>`;
	return `
		${extension === 'tsx' ? '/** @jsxImportSource octane */' : ''}
		import { useState } from 'octane';
		export ${exportKind === 'default' ? 'default ' : ''}function ${componentName}() ${extension === 'tsrx' ? '@{' : '{'}
			const [count, setCount] = useState(0);
			${extension === 'tsx' ? `return (${body});` : body}
		}
	`;
}

describe('plain Vite component HMR', () => {
	let browser: Browser;

	beforeAll(async () => {
		browser = await launchBrowser({ headless: true });
	}, 30_000);

	afterAll(async () => {
		await browser?.close();
	});

	/** Serves `files` beside an index page that loads `main.ts`, and opens it. */
	async function openProject(
		files: Record<string, string>,
		run: (page: Page, write: (file: string, source: string) => void) => Promise<void>,
	): Promise<void> {
		const project = createTempProject('octane-vite-hmr');
		const write = (file: string, source: string) => writeFileSync(join(project.root, file), source);
		let server: Awaited<ReturnType<typeof createServer>> | undefined;
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		try {
			mkdirSync(join(project.root, 'node_modules'));
			symlinkSync(
				join(repoRoot, 'packages/octane'),
				join(project.root, 'node_modules/octane'),
				'dir',
			);
			write('package.json', '{"type":"module"}');
			write(
				'index.html',
				'<!doctype html><html><body><div id="root"></div><script type="module" src="/main.ts"></script></body></html>',
			);
			for (const [file, source] of Object.entries(files)) write(file, source);

			server = await createServer({
				root: project.root,
				configFile: false,
				logLevel: 'silent',
				plugins: [octane()],
				server: { host: '127.0.0.1', port: 0 },
			});
			await server.listen();
			const address = server.httpServer?.address();
			if (!address || typeof address !== 'object') throw new Error('dev server has no address');
			await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' });
			await run(page, write);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
			await server?.close();
			project.dispose();
		}
	}

	it.each([
		{ extension: 'tsx', exportKind: 'named' },
		{ extension: 'tsx', exportKind: 'default' },
		{ extension: 'tsrx', exportKind: 'named' },
		{ extension: 'tsrx', exportKind: 'default' },
	])(
		'applies repeated $exportKind .$extension saves while preserving state and updating events',
		async ({ extension, exportKind }) => {
			const componentFile = `Counter.${extension}`;
			await openProject(
				{
					'main.ts': `import { createRoot } from 'octane';
						import ${exportKind === 'default' ? 'Counter' : '{ Counter }'} from './${componentFile}';
						createRoot(document.getElementById('root')!).render(Counter);`,
					[componentFile]: counterSource(extension, exportKind, 0),
				},
				async (page, write) => {
					const button = page.getByRole('button');
					await expect.poll(() => page.locator('#revision').textContent()).toBe('Revision 0');
					await button.click();
					let count = 1;
					await expect.poll(() => button.textContent()).toBe(`Count: ${count}`);

					for (let revision = 1; revision <= 3; revision++) {
						write(componentFile, counterSource(extension, exportKind, revision));
						await expect
							.poll(() => page.locator('#revision').textContent(), { timeout: 10_000 })
							.toBe(`Revision ${revision}`);
						expect(await button.textContent()).toBe(`Count: ${count}`);
						await button.click();
						count += revision + 1;
						await expect.poll(() => button.textContent()).toBe(`Count: ${count}`);
					}
					if (exportKind === 'default') {
						// Changing the component name resets its hook identity, but the
						// default export must remain a working boundary on later saves.
						count = 0;
						for (let revision = 4; revision <= 5; revision++) {
							write(
								componentFile,
								counterSource(extension, exportKind, revision, 'RenamedCounter'),
							);
							await expect
								.poll(() => page.locator('#revision').textContent(), { timeout: 10_000 })
								.toBe(`Revision ${revision}`);
							expect(await button.textContent()).toBe(`Count: ${count}`);
							await button.click();
							count += revision + 1;
							await expect.poll(() => button.textContent()).toBe(`Count: ${count}`);
						}
					}
				},
			);
		},
		60_000,
	);

	it('updates an importer that reads a value exported beside a component', async () => {
		const counterSource = (label: string) =>
			`export const label = '${label}';
			export function Counter() @{ <p id="direct">{label as string}</p> }`;
		await openProject(
			{
				'main.ts': `import { createRoot } from 'octane';
					import { App } from './App.tsrx';
					createRoot(document.getElementById('root')!).render(App);`,
				'App.tsrx': `import { useState } from 'octane';
					import { Counter, label } from './Counter.tsrx';
					export function App() @{
						const [count, setCount] = useState(0);
						<main>
							<Counter />
							<p id="imported">{label as string}</p>
							<button onClick={() => setCount((n) => n + 1)}>{count as string}</button>
						</main>
					}`,
				'Counter.tsrx': counterSource('v1'),
			},
			async (page, write) => {
				const button = page.getByRole('button');
				await expect.poll(() => page.locator('#imported').textContent()).toBe('v1');
				for (const [index, label] of ['v2', 'v3', 'v4'].entries()) {
					write('Counter.tsrx', counterSource(label));
					for (const id of ['#direct', '#imported']) {
						await expect
							.poll(() => page.locator(id).textContent(), { timeout: 10_000 })
							.toBe(label);
					}
					// The importer refreshes through its own boundary, keeping its state.
					expect(await button.textContent()).toBe(String(index));
					await button.click();
					await expect.poll(() => button.textContent()).toBe(String(index + 1));
				}
			},
		);
	}, 60_000);
});
