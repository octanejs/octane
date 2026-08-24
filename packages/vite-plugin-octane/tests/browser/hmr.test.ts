import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
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

	it.each([
		{ extension: 'tsx', exportKind: 'named' },
		{ extension: 'tsx', exportKind: 'default' },
		{ extension: 'tsrx', exportKind: 'named' },
		{ extension: 'tsrx', exportKind: 'default' },
	])(
		'applies repeated $exportKind .$extension saves while preserving state and updating events',
		async ({ extension, exportKind }) => {
			const project = createTempProject('octane-vite-hmr');
			const componentPath = join(project.root, `Counter.${extension}`);
			let server: ViteDevServer | undefined;
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
				writeFileSync(join(project.root, 'package.json'), '{"type":"module"}');
				writeFileSync(
					join(project.root, 'index.html'),
					'<!doctype html><html><body><div id="root"></div><script type="module" src="/main.ts"></script></body></html>',
				);
				writeFileSync(
					join(project.root, 'main.ts'),
					`import { createRoot } from 'octane';
					import ${exportKind === 'default' ? 'Counter' : '{ Counter }'} from './Counter.${extension}';
					createRoot(document.getElementById('root')!).render(Counter);`,
				);
				writeFileSync(componentPath, counterSource(extension, exportKind, 0));

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

				const button = page.getByRole('button');
				await expect.poll(() => page.locator('#revision').textContent()).toBe('Revision 0');
				await button.click();
				let count = 1;
				await expect.poll(() => button.textContent()).toBe(`Count: ${count}`);

				for (let revision = 1; revision <= 3; revision++) {
					writeFileSync(componentPath, counterSource(extension, exportKind, revision));
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
						writeFileSync(
							componentPath,
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
				expect(errors).toEqual([]);
			} finally {
				await page.close();
				await server?.close();
				project.dispose();
			}
		},
		60_000,
	);
});
