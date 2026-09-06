import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { inspectShippedSources } from './evidence-lib.mjs';

test('shipped closure follows package imports through every condition and audits their dependencies', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'react-port-package-imports-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, 'src'));
	await writeFile(
		join(root, 'package.json'),
		JSON.stringify({
			exports: { '.': './src/index.ts' },
			imports: {
				'#script': { browser: './src/browser.ts', default: './src/server.ts' },
				'#external': 'external-runtime/subpath',
			},
		}),
	);
	await writeFile(join(root, 'src/index.ts'), "import '#script'; import '#external';");
	await writeFile(join(root, 'src/browser.ts'), "export const script = ''; ");
	await writeFile(join(root, 'src/server.ts'), "import './nested.ts';");
	await writeFile(join(root, 'src/nested.ts'), "import 'nested-runtime';");
	assert.deepEqual(inspectShippedSources(root), {
		files: ['src/browser.ts', 'src/index.ts', 'src/nested.ts', 'src/server.ts'],
		runtimeDependencies: ['external-runtime', 'nested-runtime'],
	});
});
