// @vitest-environment node

/**
 * The Vite plugin's `dataWorker` option: client builds emit the app's data
 * worker at the stable path every deploy's tabs construct, and the dev server
 * serves it there.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, createServer } from 'vite';
import { octane } from '../../src/compiler/vite.js';
import { createTempProject, type TempProject } from '../_temp-project.js';

const projects: TempProject[] = [];
afterEach(() => {
	for (const project of projects.splice(0)) project.dispose();
	Reflect.deleteProperty(globalThis, 'self');
});

/** A page and a worker sharing a module whose dynamic import depends on another chunk. */
function fixture(): string {
	const project = createTempProject('octane-data-worker-vite');
	projects.push(project);
	const files: Record<string, string> = {
		'package.json': JSON.stringify({ type: 'module' }),
		// `prefix.js` is a chunk of its own, so loading `lazy.js` preloads two files.
		'page.js':
			"import { load } from './shared.js';\nimport { prefix } from './prefix.js';\nglobalThis.page = [load, prefix];\n",
		'prefix.js': "export const prefix = 'loaded';\n",
		'shared.js': "export const load = () => import('./lazy.js');\n",
		'lazy.js':
			"import { prefix } from './prefix.js';\nexport const value = `${prefix} in the worker`;\n",
		'worker.js':
			"import { load } from './shared.js';\nload().then(({ value }) => self.postMessage(value));\n",
	};
	for (const [file, source] of Object.entries(files))
		writeFileSync(join(project.root, file), source);
	return project.root;
}

describe('the Vite plugin’s data worker', () => {
	it('emits it at its stable path, loading its dynamic imports without a document', async () => {
		const root = fixture();
		await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [octane({ hmr: false, dataWorker: 'worker.js' })],
			build: { outDir: 'dist', minify: false, rolldownOptions: { input: join(root, 'page.js') } },
		});
		// Node has no document, as a worker has none.
		const messages: unknown[] = [];
		Object.assign(globalThis, {
			self: { postMessage: (message: unknown) => messages.push(message) },
		});
		await import(pathToFileURL(join(root, 'dist/_octane/data-worker.js')).href);
		await vi.waitFor(() => expect(messages).toEqual(['loaded in the worker']));
	});

	it('serves it at its stable path from the dev server', async () => {
		const root = fixture();
		const server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [octane({ dataWorker: 'worker.js' })],
			server: { port: 0, host: '127.0.0.1' },
		});
		try {
			await server.listen();
			const origin = server.resolvedUrls!.local[0]!.replace(/\/$/, '');
			const entry = await fetch(`${origin}/_octane/data-worker.js`);
			expect(entry.headers.get('content-type')).toContain('javascript');
			const imported = (await entry.text()).match(/^import "([^"]+)";/)?.[1];
			expect(imported).toBeDefined();
			const worker = await fetch(origin + imported);
			expect(worker.status).toBe(200);
			expect(await worker.text()).toContain('postMessage');
		} finally {
			await server.close();
		}
	});
});
