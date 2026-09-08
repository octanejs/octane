import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '../_fixtures');
const cache = join(here, '.react-cache');

function hash(value: string): string {
	let result = 5381;
	for (let index = 0; index < value.length; index++) {
		result = ((result << 5) + result + value.charCodeAt(index)) | 0;
	}
	return Math.abs(result).toString(36);
}

function remapReactImports(source: string): string {
	return source
		.replace(/from\s+['"]@octanejs\/email['"]/g, 'from "@react-email/components"')
		.replace(/from\s+['"]\.\.\/\.\.\/src\/components\.tsrx['"]/g, 'from "@react-email/components"')
		.replace(/from\s+['"]\.\.\/\.\.\/src\/index\.ts['"]/g, 'from "@react-email/components"');
}

export async function setup(): Promise<void> {
	rmSync(cache, { recursive: true, force: true });
	mkdirSync(cache, { recursive: true });

	for (const name of readdirSync(fixtures).filter((entry) => entry.endsWith('.tsrx'))) {
		const path = join(fixtures, name);
		const compiled = compileToReact(readFileSync(path, 'utf8'), path);
		if (compiled.errors?.length) {
			throw new Error(JSON.stringify(compiled.errors));
		}

		const output = transformSync(compiled.code, {
			loader: 'tsx',
			jsx: 'automatic',
			jsxImportSource: 'react',
			target: 'esnext',
			format: 'esm',
			sourcefile: path,
		}).code;

		writeFileSync(
			join(cache, `${basename(path, '.tsrx')}-${hash(path)}.js`),
			remapReactImports(output),
		);
	}
}

export async function teardown(): Promise<void> {}
