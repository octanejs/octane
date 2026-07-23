import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = path.join(packageRoot, 'dist');
await mkdir(distDirectory, { recursive: true });
const require = createRequire(import.meta.url);

await build({
	entryPoints: [require.resolve('octane/compiler/volar')],
	outfile: path.join(distDirectory, 'compiler.cjs'),
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node22',
	minifySyntax: true,
	sourcemap: false,
	logLevel: 'warning',
});

await build({
	entryPoints: [path.join(packageRoot, 'src/tsserver-plugin.cjs')],
	outfile: path.join(distDirectory, 'tsserver-plugin.cjs'),
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node22',
	minifySyntax: true,
	sourcemap: false,
	logLevel: 'warning',
});
