import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { transformSync } from 'esbuild';

const repo = fileURLToPath(new URL('../..', import.meta.url));

test("Shadcn project setup preserves the other project's compiled React cache", async () => {
	const root = mkdtempSync(join(tmpdir(), 'octane-shadcn-cache-'));
	try {
		const tests = join(root, 'tests');
		const differential = join(tests, 'differential');
		mkdirSync(differential, { recursive: true });
		for (const name of ['upstream', 'base-upstream']) {
			cpSync(join(repo, 'packages/shadcn/tests/differential', name), join(differential, name), {
				recursive: true,
			});
		}
		cpSync(
			join(repo, 'packages/shadcn/tests/_fixtures/shadcn-diff'),
			join(tests, '_fixtures/shadcn-diff'),
			{ recursive: true },
		);
		const require = createRequire(join(repo, 'packages/shadcn/package.json'));
		const source = readFileSync(
			join(repo, 'packages/shadcn/tests/differential/_setup.ts'),
			'utf8',
		).replace(
			/from '(@tsrx\/react|esbuild)'/g,
			(_, name) => `from '${pathToFileURL(require.resolve(name)).href}'`,
		);
		const modulePath = join(differential, '_setup.mjs');
		writeFileSync(
			modulePath,
			transformSync(source, { loader: 'ts', format: 'esm', target: 'esnext' }).code,
		);
		const { setup } = await import(pathToFileURL(modulePath).href);
		await setup({ name: 'shadcn-base-ui-differential' });
		const basePath = join(differential, '.react-cache/base-ui/base-select.js');
		const base = readFileSync(basePath, 'utf8');
		await setup({ name: 'shadcn-differential' });
		assert.equal(readFileSync(basePath, 'utf8'), base);
		const radixPath = join(differential, '.react-cache/radix/upstream-button.js');
		const radix = readFileSync(radixPath, 'utf8');
		await setup({ name: 'shadcn-base-ui-differential' });
		assert.equal(readFileSync(radixPath, 'utf8'), radix);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
