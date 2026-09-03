// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const FIXTURE_DIRECTORY = resolve('packages/octane/tests/_fixtures/register-hook');

describe('direct server script compilation', () => {
	it('preserves compiler registration when its side-effect-only preload is bundled', async () => {
		const bundle = await build({
			stdin: {
				contents: "import 'octane/compiler/register';",
				loader: 'js',
				resolveDir: resolve(import.meta.dirname, '..'),
				sourcefile: 'bundled-server-preload.js',
			},
			bundle: true,
			external: ['@tsrx/core', 'oxc-tsrx', 'esrap', 'esrap/*', 'es-module-lexer'],
			format: 'esm',
			logLevel: 'silent',
			minify: true,
			platform: 'node',
			treeShaking: true,
			write: false,
		});
		const entry = pathToFileURL(resolve(FIXTURE_DIRECTORY, 'entry.ts')).href;
		const result = spawnSync(process.execPath, ['--no-warnings', '--input-type=module'], {
			cwd: FIXTURE_DIRECTORY,
			encoding: 'utf8',
			input: `${bundle.outputFiles[0].text}\nawait import(${JSON.stringify(entry)});\n`,
		});

		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(result.stdout).toBe('<main>Hello, Octane!</main>');
	});

	it('prerenders an extensionless TypeScript component import through the public preload', () => {
		const result = spawnSync(
			process.execPath,
			['--no-warnings', '--import', 'octane/compiler/register', 'entry.ts'],
			{
				cwd: FIXTURE_DIRECTORY,
				encoding: 'utf8',
			},
		);

		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(result.stdout).toBe('<main>Hello, Octane!</main>');
	});

	it('targets the server runtime inside pass-through manual-slot packages', () => {
		const result = spawnSync(
			process.execPath,
			['--no-warnings', '--import', 'octane/compiler/register', 'entry-manual.ts'],
			{
				cwd: FIXTURE_DIRECTORY,
				encoding: 'utf8',
			},
		);

		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(result.stdout).toBe('<main>Hello from a package, Octane!</main>');
	});
});
