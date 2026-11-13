// @vitest-environment node

// `octane({ dataWorker })` forwards to the bundled compiler plugin, which emits
// the app's `octane/data` worker at the stable `/_octane/data-worker.js` path.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { octane } from '../src/index.js';

describe('octane({ dataWorker })', () => {
	it('emits the data worker at its stable path', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-vite-data-worker-'));
		try {
			await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
			await writeFile(join(root, 'page.js'), 'globalThis.page = 1;\n');
			await writeFile(join(root, 'worker.js'), "self.postMessage('data worker');\n");
			await build({
				root,
				configFile: false,
				logLevel: 'silent',
				plugins: [octane({ hmr: false, dataWorker: 'worker.js' })],
				build: { outDir: 'dist', minify: false, rolldownOptions: { input: join(root, 'page.js') } },
			});
			const worker = await readFile(join(root, 'dist/_octane/data-worker.js'), 'utf8');
			expect(worker).toContain('data worker');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
