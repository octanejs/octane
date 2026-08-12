#!/usr/bin/env node
/**
 * Emit Vitest `--project` flags for every project that declares
 * `testExecution.group: 'heavy-browser'` in vitest.config.js.
 *
 * Parses the config source rather than importing it so the discovery helper
 * stays free of the config's TypeScript graph.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const configPath = resolve(import.meta.dirname, '../vitest.config.js');
const source = readFileSync(configPath, 'utf8');
const projects = [];
const blockPattern =
	/testExecution\s*:\s*\{\s*group\s*:\s*['"]heavy-browser['"]\s*\}[\s\S]*?name\s*:\s*['"]([^'"]+)['"]/g;
let match;
while ((match = blockPattern.exec(source)) !== null) {
	projects.push(match[1]);
}
projects.sort();

if (projects.length === 0) {
	console.error('discover-heavy-browser: no projects declare testExecution.group heavy-browser');
	process.exit(1);
}

if (process.argv.includes('--names')) {
	process.stdout.write(projects.join('\n') + '\n');
	process.exit(0);
}

const args = projects.flatMap(function toProjectFlag(name) {
	return ['--project', name];
});
process.stdout.write(args.join(' ') + '\n');
