// @vitest-environment node

import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { describe, it, expect } from 'vitest';
import { version } from '../src/index.js';
import pkg from '../package.json' with { type: 'json' };

describe('version', () => {
	it('exported version is sourced from package.json (no drift)', () => {
		expect(version).toBe(pkg.version);
		expect(version).toMatch(/^\d+\.\d+\.\d+/);
	});

	it('bundles the public version without retaining the package manifest', async () => {
		const result = await build({
			stdin: {
				contents: `export { version } from 'octane';`,
				loader: 'js',
				resolveDir: resolve(import.meta.dirname, '..'),
				sourcefile: 'version-consumer.js',
			},
			bundle: true,
			format: 'esm',
			logLevel: 'silent',
			metafile: true,
			minify: true,
			platform: 'browser',
			target: 'esnext',
			treeShaking: true,
			write: false,
		});
		const output = result.outputFiles[0];
		const bundled = (await import(
			`data:text/javascript;base64,${Buffer.from(output.contents).toString('base64')}`
		)) as { version: string };
		const retainedManifest = Object.entries(Object.values(result.metafile.outputs)[0].inputs).some(
			([input, metadata]) =>
				metadata.bytesInOutput > 0 && input.split(sep).join('/').endsWith('/octane/package.json'),
		);

		expect(bundled.version).toBe(pkg.version);
		expect(retainedManifest).toBe(false);
	});

	it('rejects a stale generated version and does not rewrite unchanged source', () => {
		const directory = mkdtempSync(join(tmpdir(), 'octane-version-'));
		const sourceFile = join(directory, 'src', 'version.ts');
		const generator = join(directory, 'scripts', 'generate-version.mjs');

		try {
			mkdirSync(join(directory, 'src'));
			mkdirSync(join(directory, 'scripts'));
			writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: '1.2.3-test.4' }));
			writeFileSync(sourceFile, `export const version = '0.0.0';\n`);
			copyFileSync(resolve(import.meta.dirname, '../scripts/generate-version.mjs'), generator);

			const stale = spawnSync(process.execPath, [generator, '--check'], { encoding: 'utf8' });
			expect(stale.status).toBe(1);
			expect(stale.stderr).toContain('pnpm sync');

			execFileSync(process.execPath, [generator]);
			execFileSync(process.execPath, [generator, '--check']);
			const modifiedAt = statSync(sourceFile, { bigint: true }).mtimeNs;
			execFileSync(process.execPath, [generator]);
			expect(statSync(sourceFile, { bigint: true }).mtimeNs).toBe(modifiedAt);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
