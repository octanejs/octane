#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import * as jsonc from 'jsonc-parser';

const tsc = path.join(
	path.dirname(createRequire(import.meta.url).resolve('typescript-native/package.json')),
	'bin/tsc',
);

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

function declaredOptions(project, seen = new Set()) {
	if (seen.has(project)) return {};
	seen.add(project);
	const config = jsonc.parse(readFileSync(project, 'utf8')) ?? {};
	const bases = [config.extends ?? []].flat().filter((base) => base.startsWith('.'));
	const inherited = bases.map((base) => {
		const resolved = path.resolve(path.dirname(project), base);
		return declaredOptions(resolved.endsWith('.json') ? resolved : `${resolved}.json`, seen);
	});
	return Object.assign({}, ...inherited, config.compilerOptions);
}

// TypeScript 7 changed two defaults that tsrx-tsc (TypeScript 5.9) relied on:
// `types` now defaults to none instead of every @types package, and unresolved
// side-effect imports such as './styles.css' are errors. Projects that never
// chose either keep the 5.9 behavior they were written against.
function compatibilityOptions(project) {
	const declared = declaredOptions(project);
	return {
		...(declared.types === undefined ? { types: ['*'] } : {}),
		...(declared.noUncheckedSideEffectImports === undefined
			? { noUncheckedSideEffectImports: false }
			: {}),
	};
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
			contentMappers: [
				{
					package: '@tsrx/content-mapper',
					extensions: ['.tsrx'],
					options: { compiler: 'octane/compiler/volar' }, // auto-detection prefers @tsrx/react, which bindings install for parity tests
				},
			],
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
			? [tsc, '--showConfig', '-p', wrappers[0], '--runExternalCode']
			: [
					tsc,
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
