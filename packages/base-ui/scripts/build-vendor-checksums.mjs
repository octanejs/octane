#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../upstream');

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return walk(path);
		return entry.isFile() && entry.name !== 'SHA256SUMS' ? [path] : [];
	});
}

const ledger = walk(root)
	.map((path) => {
		const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
		return `${digest}  ${relative(root, path).split('\\').join('/')}`;
	})
	.sort()
	.join('\n');

writeFileSync(join(root, 'SHA256SUMS'), `${ledger}\n`);
console.log(`packages/base-ui/upstream/SHA256SUMS: ${ledger.split('\n').length} files`);
