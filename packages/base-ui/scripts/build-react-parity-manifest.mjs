#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import ts from 'typescript';
import { summarizeRuntimeInventories } from '../../../scripts/react-parity/harness-lib.mjs';

const root = resolve(import.meta.dirname, '../../..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const digest = (file) =>
	createHash('sha256')
		.update(readFileSync(resolve(root, file)))
		.digest('hex');
const evidence = (file, role = 'support', cases) => ({
	path: file,
	role,
	sha256: digest(file),
	...(cases ? { cases } : {}),
});
const generator = 'packages/base-ui/scripts/build-react-parity-manifest.mjs';
const inventories = 'packages/base-ui/scripts/build-runtime-inventories.mjs';
const collector = 'scripts/react-parity/collect-vitest-tests.mjs';
const skipPolicy = 'packages/base-ui/audit/runtime-skip-policy.json';
const browserSkipPolicy = 'packages/base-ui/audit/browser-runtime-skip-policy.json';

function differentialLane() {
	const file = 'packages/base-ui/tests/differential/parity.test.ts';
	const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
	const inventory = 'packages/base-ui/audit/differential-runtime.json';
	const tests = json(inventory).tests;
	const cases = [];
	const visit = (node) => {
		if (
			ts.isExpressionStatement(node) &&
			ts.isCallExpression(node.expression) &&
			node.expression.expression.getText(source) === 'it'
		) {
			const id = /@parity-case\s+(\S+)/.exec(
				source.text.slice(node.getFullStart(), node.getStart(source)),
			)?.[1];
			if (id) {
				const title = node.expression.arguments[0];
				if (!ts.isStringLiteral(title))
					throw new Error(`Parity marker ${id} needs a literal test title`);
				const matches = tests.filter(
					(test) => test.file === file && test.fullName.endsWith(` ${title.text}`),
				);
				if (matches.length !== 1)
					throw new Error(`Parity marker ${id} must identify one collected test`);
				cases.push({ id, testName: title.text, fullName: matches[0].fullName });
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return {
		id: 'base-ui-differential-full-suite',
		type: 'differential',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'base-ui-differential',
		evidenceOrigin: 'repo-authored',
		notes: 'Runs the complete same-fixture differential suite and rejects test identity drift.',
		execution: { kind: 'vitest-full', inventory },
		files: [
			evidence(inventory),
			evidence(generator),
			evidence(inventories),
			evidence(collector),
			evidence(skipPolicy),
			evidence(file, 'test', cases),
			evidence('packages/base-ui/tests/differential/_setup.ts'),
			evidence('packages/base-ui/tests/_fixtures/base-ui-diff.tsrx'),
		],
	};
}

for (const name of ['base-ui', 'base-ui-utils']) {
	const prefix = `packages/${name}`;
	const lock = json(`${prefix}/audit/upstream.lock.json`);
	const runtimeLane = (mode, browser = false) => {
		const inventory = `${prefix}/audit/${mode}${browser ? '-browser' : ''}-runtime.json`;
		const pristine = mode === 'pristine';
		return {
			id: `${name}-${mode}${browser ? '-browser' : ''}-upstream-full-suite`,
			type: browser ? 'browser' : pristine ? 'pristine-upstream' : 'adapted-octane',
			oracle: 'required',
			environment: 'workspace-node',
			project: `${name}-${mode}${browser ? '-browser' : ''}`,
			...(!browser ? { evidenceOrigin: 'upstream-suite' } : {}),
			notes: `Requires ${json(inventory).tests.length} passes in the ${pristine ? 'pinned React' : 'adapted Octane'} ${browser ? 'Chromium' : 'unit'} environment. The same report must contain exactly ${json(inventory).skippedTests.length} declared skip/todo outcomes; none count as passes. Collection modes and execution identities are checked separately.`,
			execution: { kind: 'vitest-full', inventory, ...(browser ? { fileParallelism: false } : {}) },
			files: [
				evidence(inventory),
				evidence(`${prefix}/audit/upstream.lock.json`),
				evidence(`${prefix}/audit/provenance.json`),
				evidence(`${prefix}/audit/parity-policy.json`),
				evidence(generator),
				evidence(inventories),
				evidence(collector),
				evidence(browser ? browserSkipPolicy : skipPolicy),
				evidence('scripts/react-parity/base-ui-hook-order.ts'),
				evidence(`${prefix}/tests/${pristine ? 'vitest.pristine.config.ts' : 'vitest.config.ts'}`),
				...(browser
					? [
							evidence(
								`${prefix}/tests/${pristine ? 'vitest.pristine.browser.config.ts' : 'vitest.browser.config.ts'}`,
							),
							evidence('patches/@vitest__browser@4.1.10.patch'),
							evidence('patches/@vitest__mocker@4.1.10.patch'),
							...(!pristine ? [evidence(`${prefix}/tests/support/browser-renderer.ts`)] : []),
						]
					: []),
				evidence(
					pristine
						? 'scripts/react-parity/base-ui-pristine-config.mjs'
						: `${prefix}/tests/support/renderer.ts`,
				),
			],
		};
	};
	const typeLane = (mode) => {
		const project = `${prefix}/tsconfig.${mode}-specs.json`;
		const pristine = mode === 'pristine';
		const id = `${name}-${mode}-types`;
		const testName = `complete ${mode} ${lock.identity.packageName} ${lock.identity.version} type suite`;
		return {
			id,
			type: pristine ? 'pristine-types' : 'adapted-types',
			oracle: 'required',
			environment: 'workspace-node',
			project: id,
			evidenceOrigin: 'upstream-suite',
			notes:
				'Compiles every pinned upstream type-test file, preserving the positive assertions and negative controls.',
			execution: {
				kind: 'typescript',
				compiler: pristine ? 'tsc' : 'tsrx-tsc',
				project,
				...(pristine
					? { compilerBins: [`${prefix}/node_modules/typescript-pristine-native/bin/tsc`] }
					: {}),
			},
			files: [
				evidence(project, 'test', [{ id: `types:${id}`, testName, fullName: testName }]),
				evidence(`${prefix}/audit/upstream.lock.json`),
				evidence(generator),
			],
		};
	};
	const artifact = `${prefix}/upstream-artifact/${name === 'base-ui' ? 'react-1.8.0' : 'utils-0.4.0'}.tgz`;
	const manifest = {
		schemaVersion: 1,
		materializedTests: prefix,
		provenance: {
			repo: 'https://github.com/mui/base-ui.git',
			version: lock.identity.version,
			commit: lock.identity.commit,
			sourceRoot: `${lock.identity.repository.subdirectory}/src`,
			testRoot: `${lock.identity.repository.subdirectory}/src; ${lock.identity.repository.subdirectory}/test`,
			license: 'MIT',
			integrity: `sha256:${digest(artifact)}`,
			verification: 'verified',
		},
		upstreamSuites: { runtime: 'present', types: 'present' },
		adaptedRoots: {
			source: {
				roots: [`${prefix}/src`],
				include: ['\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
				exclude: [],
			},
			tests: {
				roots: [`${prefix}/tests/upstream`],
				include: ['\\.test\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
				exclude: [],
			},
		},
		adaptedRuntimeSummary: summarizeRuntimeInventories([
			json(`${prefix}/audit/adapted-runtime.json`),
		]),
		environments: {
			'workspace-node': {
				node: '>=22',
				platform: 'any',
				arch: 'any',
				packageManager: 'pnpm@11.15.1',
				lockfile: 'pnpm-lock.yaml',
				lockfileSha256: digest('pnpm-lock.yaml'),
			},
		},
		lanes: [
			...(name === 'base-ui' ? [differentialLane()] : []),
			runtimeLane('pristine'),
			runtimeLane('adapted'),
			...(name === 'base-ui' ? [runtimeLane('pristine', true), runtimeLane('adapted', true)] : []),
			typeLane('pristine'),
			typeLane('adapted'),
		],
		divergences: json(`${prefix}/audit/parity-policy.json`).divergences.map((entry) => ({
			...entry,
			...(entry.ordinaryEvidence
				? {
						ordinaryEvidence: entry.ordinaryEvidence.map((file) => ({
							...file,
							sha256: digest(file.path),
						})),
					}
				: {}),
		})),
	};
	const destination = resolve(root, prefix, 'audit/react-parity.json');
	const output = await format(JSON.stringify(manifest), {
		...(await resolveConfig(destination)),
		parser: 'json',
	});
	if (process.argv.includes('--check')) {
		if (readFileSync(destination, 'utf8') !== output)
			throw new Error(`Generated parity manifest drift: ${name}`);
	} else writeFileSync(destination, output);
	console.log(`${name}: ${manifest.lanes.length} complete parity lanes`);
}
