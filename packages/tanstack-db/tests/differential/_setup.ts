import { compile } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function setup() {
	const source = resolve(import.meta.dirname, '../_fixtures/database.tsrx');
	const compiled = compile(readFileSync(source, 'utf8'), source);
	if (compiled.errors?.length) throw new Error(JSON.stringify(compiled.errors));
	const { code } = transformSync(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: source,
	});
	let hash = 5381;
	for (let i = 0; i < source.length; i++) hash = ((hash << 5) + hash + source.charCodeAt(i)) | 0;
	const cache = resolve(import.meta.dirname, '.react-cache');
	mkdirSync(cache, { recursive: true });
	writeFileSync(
		resolve(cache, `database-${Math.abs(hash).toString(36)}.js`),
		code
			.replace(/from\s+["']@octanejs\/tanstack-db["']/g, 'from "@tanstack/react-db"')
			.replace(/from\s+["']octane["']/g, 'from "react"'),
	);
}
