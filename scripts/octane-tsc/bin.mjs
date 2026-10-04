#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import { compatibilityOptions, NATIVE_TSC, TSRX_CONTENT_MAPPER } from './native.mjs';

const projects = [];
const passthrough = [];
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
	if (args[index] === '-p' || args[index] === '--project')
		projects.push(path.resolve(args[++index]));
	else if (args[index] !== '--noEmit') passthrough.push(args[index]);
}
if (projects.length === 0) {
	console.error('Usage: octane-tsc -p <tsconfig> [-p <tsconfig> ...] [tsc build options]');
	process.exit(2);
}

// The mapper is enabled from a generated sibling wrapper rather than the
// project's own tsconfig: contentMappers is an error without --runExternalCode,
// so editors and every other TypeScript would reject it. The wrapper must sit in
// the project's directory because the root config decides type-root lookup.
const buildInfoDir = mkdtempSync(path.join(tmpdir(), 'octane-tsc-'));
const wrappers = [...new Set(projects)].map((project, index) => {
	const wrapper = path.join(
		path.dirname(project),
		`.octane-tsc-${process.pid}.${path.basename(project)}`,
	);
	writeFileSync(
		wrapper,
		JSON.stringify({
			extends: `./${path.basename(project)}`,
			compilerOptions: {
				...compatibilityOptions(project),
				tsBuildInfoFile: path.join(buildInfoDir, `${index}.tsbuildinfo`), // --build records build state even with --noEmit
			},
			contentMappers: [TSRX_CONTENT_MAPPER],
		}),
	);
	return wrapper;
});

const showConfig = passthrough.includes('--showConfig');
if (showConfig && wrappers.length !== 1) {
	console.error('octane-tsc --showConfig takes exactly one -p <tsconfig>');
	process.exit(2);
}

let result;
try {
	result = spawnSync(
		process.execPath,
		showConfig
			? [NATIVE_TSC, '--showConfig', '-p', wrappers[0], '--runExternalCode']
			: [
					NATIVE_TSC,
					'--build',
					...wrappers,
					'--noEmit',
					'--runExternalCode',
					'--builders',
					String(availableParallelism()),
					'--checkers',
					'1',
					...passthrough,
				],
		{ stdio: 'inherit' },
	);
} finally {
	for (const wrapper of wrappers) rmSync(wrapper, { force: true });
	rmSync(buildInfoDir, { recursive: true, force: true });
}
if (result.error) throw result.error;
process.exit(result.status ?? 1);
