#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vitestConfig from '../vitest.config.js';

// Heavy-integration browser lane discovery: declaratively heavy projects and
// every packages/*/tests/browser suite participate unless another execution
// group already owns the standard browser root. A project can narrow itself to
// Chromium without adding another runner. New bindings need no workflow edit,
// including projects whose browser harness has a nonstandard location.
const EXCLUDED = new Set(['rspeedy-plugin-octane']);
const parityOwnedRoots = new Set();
const specs = new Set();
for (const project of vitestConfig.test.projects) {
	const group = project.testExecution?.group;
	if (group === 'react-parity') {
		const includes = project.testExecution.include ?? project.test?.include ?? [];
		for (const pattern of includes) {
			if (typeof pattern !== 'string' || pattern.startsWith('!')) continue;
			const match = /^packages\/([^/]+)\/tests\/browser\//.exec(pattern);
			if (match) parityOwnedRoots.add(join('packages', match[1], 'tests/browser'));
		}
	}
	if (group === 'heavy-browser') {
		const browsers = project.testExecution.browsers;
		if (browsers && !browsers.includes('chromium')) {
			continue;
		}
		const includes = project.testExecution.include ?? project.test?.include ?? [];
		for (const pattern of includes) {
			if (typeof pattern !== 'string' || pattern.startsWith('!')) continue;
			const globIndex = pattern.search(/[?*[{]/);
			const spec = (globIndex === -1 ? pattern : pattern.slice(0, globIndex)).replace(/\/+$/, '');
			if (spec) specs.add(spec);
		}
	}
}
const packagesRoot = new URL('../packages/', import.meta.url);
const entries = readdirSync(packagesRoot, { withFileTypes: true });
for (const entry of entries) {
	if (!entry.isDirectory() || EXCLUDED.has(entry.name)) {
		continue;
	}
	const relative = join('packages', entry.name, 'tests/browser');
	if (parityOwnedRoots.has(relative)) {
		continue;
	}
	if (existsSync(new URL(`../${relative}`, import.meta.url))) {
		specs.add(relative);
	}
}
const sortedSpecs = [...specs].sort();
if (sortedSpecs.length === 0) {
	console.error('discover-heavy-browser-specs: no browser suites found');
	process.exit(1);
}
process.stdout.write(`${sortedSpecs.join(' ')}\n`);
