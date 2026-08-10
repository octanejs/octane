#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
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
	console.error('run-heavy-browser: no projects declare testExecution.group heavy-browser');
	process.exit(1);
}

const args = ['vitest', 'run', '--maxWorkers=1'];
for (const name of projects) {
	args.push('--project', name);
}

const result = spawnSync('pnpm', args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
