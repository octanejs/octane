import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { Plugin } from 'vite';

export const packageRoot = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(packageRoot, 'package.json'));
// The pristine shared helpers import core internals. Use the installed core's
// source throughout each parity project so Collection constructor identity agrees.
const coreRoot = dirname(require.resolve('@tanstack/db/package.json'));
const helperRoot = resolve(packageRoot, 'upstream-helpers/db');
export const dbAliases = [
	{ find: /^@tanstack\/db$/, replacement: resolve(coreRoot, 'src/index.ts') },
	{ find: /^\.\.\/\.\.\/db\/tests\/(.*)$/, replacement: `${helperRoot}/tests/$1` },
];
export function dbHelperImports(): Plugin {
	return {
		name: 'db-pinned-helper-core',
		enforce: 'pre',
		resolveId(source, importer) {
			if (!importer?.startsWith(`${helperRoot}/tests/`) || !source.startsWith('.')) return;
			const target = resolve(dirname(importer), source);
			if (!target.startsWith(`${helperRoot}/src/`)) return;
			const installed = resolve(coreRoot, target.slice(helperRoot.length + 1));
			for (const file of [installed, installed.replace(/\.js$/, '.ts'), installed + '.ts']) {
				if (existsSync(file)) return file;
			}
			throw new Error(`Pinned DB test helper refers to missing core source: ${source}`);
		},
	};
}
