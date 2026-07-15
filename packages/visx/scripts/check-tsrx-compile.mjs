import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { transformSync } from 'esbuild';
import { compile } from '../../octane/src/compiler/compile.js';

const sourceRoot = resolve(import.meta.dirname, '../src');

function filesUnder(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? filesUnder(path) : [path];
	});
}

const components = filesUnder(sourceRoot).filter((file) => file.endsWith('.tsrx'));
const failures = [];

for (const file of components) {
	const source = readFileSync(file, 'utf8');
	for (const mode of ['client', 'server']) {
		try {
			const result = compile(source, file, { dev: false, hmr: false, mode });
			transformSync(result.code, { format: 'esm', loader: 'js', target: 'esnext' });
		} catch (error) {
			failures.push(`${file} (${mode})\n${error instanceof Error ? error.stack : error}`);
		}
	}
}

if (failures.length > 0) {
	throw new Error(`Visx TSRX compile failures:\n\n${failures.join('\n\n')}`);
}

console.log(`Visx TSRX compiles for client and server (${components.length} components).`);
