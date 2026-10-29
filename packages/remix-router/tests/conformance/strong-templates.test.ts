import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compile } from 'octane/compiler';
import { createOctaneCompiler } from 'octane/compiler/bundler';
import { expect, it } from 'vitest';

const source = resolve(__dirname, '../../src');
const compiler = createOctaneCompiler({ root: source });
const templates = readdirSync(source, { recursive: true }).filter((file) => file.endsWith('.tsrx'));

it.each(templates)('authors %s in Strong mode for client and server', (file) => {
	const path = join(source, file);
	const template = readFileSync(path, 'utf8');
	expect(compiler.strongModuleStatus(template, path).directive).toBe(true);
	for (const mode of ['client', 'server'] as const) {
		compile(template, file, { mode, dev: false });
	}
});
