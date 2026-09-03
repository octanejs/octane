import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('keeps React imports out of the authored Tiptap binding and adapted type probes', () => {
	// Octane owns the React type basis of its migration aliases. A global
	// resolution poison would also block that legitimate transitive dependency.
	const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
	const violations: string[] = [];
	for (const directory of ['src', 'typetests/adapted']) {
		for (const file of readdirSync(join(packageRoot, directory), { recursive: true })) {
			if (!/\.(?:ts|tsx|tsrx|js)$/.test(file)) continue;
			const source = readFileSync(join(packageRoot, directory, file), 'utf8');
			for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
				if (/^(?:react|react-dom|@tiptap\/react)(?:\/|$)/.test(imported.fileName)) {
					violations.push(`${directory}/${file}: ${imported.fileName}`);
				}
			}
		}
	}
	expect(violations).toEqual([]);
});
