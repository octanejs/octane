#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Heavy-integration browser lane discovery: every packages/*/tests/browser
// suite participates unless another heavy lane already owns it. New bindings
// with a tests/browser directory need no workflow edit.
const EXCLUDED = new Set(['rspeedy-plugin-octane']);
const packagesRoot = new URL('../packages/', import.meta.url);
const entries = readdirSync(packagesRoot, { withFileTypes: true });
const specs = [];
for (const entry of entries) {
	if (!entry.isDirectory() || EXCLUDED.has(entry.name)) {
		continue;
	}
	const relative = join('packages', entry.name, 'tests/browser');
	if (existsSync(new URL(`../${relative}`, import.meta.url))) {
		specs.push(relative);
	}
}
specs.sort();
if (specs.length === 0) {
	console.error('discover-heavy-browser-specs: no browser suites found');
	process.exit(1);
}
process.stdout.write(`${specs.join(' ')}\n`);
