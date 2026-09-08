import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import { extractTestCases } from './inventory-lib.mjs';

const UPSTREAM_TEST_ROOT = 'packages/hook-form/upstream/src/__tests__';
const PORTED_TEST_ROOT = 'packages/hook-form/tests/upstream';

const TITLE_REPLACEMENTS = new Map([
	[
		'useController.test.tsx\0should return a promise-like value from field.onChange',
		'should return a promise-like value from field.onInput',
	],
	[
		'useForm/resolver.test.tsx\0should propagate isDirty to a separate useFormState subscriber when Controller field.onChange is called twice in the same tick',
		'should propagate isDirty to a separate useFormState subscriber when Controller field.onInput is called twice in the same tick',
	],
	[
		'useForm/resolver.test.tsx\0should batch state updates when using trigger',
		'should expose trigger state notifications in commit order',
	],
]);

const PORT_ONLY_CASES = new Map([
	[
		'logic/getDirtyFields.test.ts',
		new Set([
			'should mark an array-valued registered field as dirty with a boolean rather than diffing elements (#13584)',
			'should still diff a field array element-by-element when the array path itself is not a registered leaf',
		]),
	],
	[
		'useForm/formState.test.tsx',
		new Set([
			'should mark an array-valued registered field dirty as a boolean rather than diffing its elements (#13584)',
		]),
	],
]);

function filesBelow(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => resolve(entry.parentPath ?? entry.path, entry.name))
		.sort();
}

function portableRelative(root, file) {
	return relative(root, file).split(sep).join('/');
}

function testArtifacts(root) {
	return filesBelow(root).map((file) => portableRelative(root, file));
}

function testFiles(root) {
	return testArtifacts(root).filter(
		(file) => file.endsWith('.test.ts') || file.endsWith('.test.tsx'),
	);
}

export function verifyHookFormUpstream(repoRoot, { lock = true } = {}) {
	// The adapted suite is regenerated (lock rewrites plus committed patches);
	// materialize it when absent so verification works on a clean checkout.
	if (lock && !existsSync(resolve(repoRoot, PORTED_TEST_ROOT))) {
		execFileSync(
			process.execPath,
			[
				fileURLToPath(new URL('../react-port/materialize.mjs', import.meta.url)),
				'run',
				'--package-dir',
				resolve(repoRoot, 'packages/hook-form'),
			],
			{ stdio: 'pipe' },
		);
	}
	// The committed upstream/ tree verifies offline against the upstream git
	// blob shas in audit/upstream.lock.json. The registration checks below stay
	// independent so semantic drift fails closed even without the lock layer
	// (the negative-control fixtures exercise them with { lock: false }).
	const materialize = fileURLToPath(new URL('../react-port/materialize.mjs', import.meta.url));
	if (lock)
		try {
			execFileSync(
				process.execPath,
				[
					'--',
					materialize,
					'run',
					'--check',
					'--package-dir',
					resolve(repoRoot, 'packages/hook-form'),
				],
				{ stdio: 'pipe' },
			);
		} catch (error) {
			throw new Error(
				`react-hook-form upstream tree drifted from audit/upstream.lock.json: ${error.stdout?.toString() ?? error.message}`,
			);
		}
	const upstreamRoot = resolve(repoRoot, UPSTREAM_TEST_ROOT);
	const portedRoot = resolve(repoRoot, PORTED_TEST_ROOT);
	const upstreamArtifacts = testArtifacts(upstreamRoot);
	const portedArtifacts = testArtifacts(portedRoot);
	if (JSON.stringify(upstreamArtifacts) !== JSON.stringify(portedArtifacts)) {
		throw new Error('react-hook-form adapted suite must account for every upstream test artifact');
	}

	let upstreamCases = 0;
	let portedCases = 0;
	for (const file of testFiles(upstreamRoot)) {
		const upstream = extractTestCases(readFileSync(resolve(upstreamRoot, file), 'utf8'), {
			file,
		}).map(({ title }) => TITLE_REPLACEMENTS.get(`${file}\0${title}`) ?? title);
		const portedSource = readFileSync(resolve(portedRoot, file), 'utf8');
		if (
			/\b(?:fdescribe|fit|xdescribe|xit|xtest)(?:\s*\(|\.each\s*\()|\b(?:describe|it|test)\.(?:failing|only|skip|todo)(?:\s*\(|\.each\s*\()/.test(
				portedSource,
			)
		) {
			throw new Error(
				`${file}: adapted upstream tests must execute without focused, failing, skip, or todo markers`,
			);
		}
		const ported = extractTestCases(portedSource, { file }).map(({ title }) => title);
		const allowedExtras = PORT_ONLY_CASES.get(file) ?? new Set();
		const portedUpstreamCases = ported.filter((title) => !allowedExtras.has(title));
		const observedExtras = ported.filter((title) => allowedExtras.has(title));
		if (JSON.stringify(portedUpstreamCases) !== JSON.stringify(upstream)) {
			throw new Error(`${file}: adapted test registrations drifted from the pinned upstream suite`);
		}
		for (const title of allowedExtras) {
			if (observedExtras.filter((observed) => observed === title).length !== 1) {
				throw new Error(`${file}: expected every recorded Octane regression case to execute once`);
			}
		}
		upstreamCases += upstream.length;
		portedCases += ported.length;
	}

	return {
		artifacts: upstreamArtifacts.length,
		portedCases,
		upstreamCases,
	};
}
