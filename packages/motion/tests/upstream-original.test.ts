import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';

function findRepoRoot(start: string): string {
	let directory = resolve(start);
	const filesystemRoot = parse(directory).root;
	while (directory !== filesystemRoot) {
		if (
			existsSync(resolve(directory, 'pnpm-workspace.yaml')) &&
			existsSync(resolve(directory, 'packages/motion/package.json'))
		) {
			return directory;
		}
		directory = dirname(directory);
	}
	throw new Error(`Could not locate the Octane repository above ${start}`);
}

function compareIdentities(
	a: { file: string; fullName: string },
	b: { file: string; fullName: string },
): number {
	if (a.file === b.file) return a.fullName.localeCompare(b.fullName);
	return a.file.localeCompare(b.file);
}

const repoRoot = findRepoRoot(process.cwd());
const upstreamRoot = resolve(repoRoot, 'packages/motion/upstream');
const jestBin = createRequire(resolve(repoRoot, 'packages/motion/package.json')).resolve(
	'jest/bin/jest',
);

// @parity-case pristine:motion-use-motion-value-original-suite
it('runs the curated Motion useMotionValue Jest suite unchanged', function () {
	// The pinned bytes verify offline against audit/upstream.lock.json before
	// the suite can run; the lane can only ever execute the pinned commit.
	const check = spawnSync(
		process.execPath,
		[
			resolve(repoRoot, 'scripts/react-port/materialize.mjs'),
			'run',
			'--check',
			'--package-dir',
			resolve(repoRoot, 'packages/motion'),
		],
		{ cwd: repoRoot, encoding: 'utf8' },
	);
	expect(check.status, `${check.stdout}\n${check.stderr}`).toBe(0);
	// The pristine test resolves its library imports through relative paths;
	// port-authored shims map those onto the published motion/react pin. The
	// suite runs from a scratch root assembled from the pinned bytes plus the
	// shims so neither set can masquerade as the other.
	const runRoot = realpathSync(mkdtempSync(join(tmpdir(), 'octane-motion-pristine-root-')));
	cpSync(join(upstreamRoot, 'src'), join(runRoot, 'src'), { recursive: true });
	cpSync(resolve(repoRoot, 'packages/motion/tests/_pristine-shims'), runRoot, {
		recursive: true,
	});
	const report = join(tmpdir(), `octane-motion-pristine-${process.pid}.json`);
	let result;
	try {
		result = spawnSync(
			process.execPath,
			[
				jestBin,
				'--config',
				resolve(repoRoot, 'packages/motion/tests/upstream-jest.config.cjs'),
				'--rootDir',
				runRoot,
				'--runInBand',
				'--no-watchman',
				'--json',
				`--outputFile=${report}`,
			],
			{ cwd: repoRoot, encoding: 'utf8' },
		);
	} finally {
		rmSync(runRoot, { recursive: true, force: true });
	}
	const output = `${result.stdout}\n${result.stderr}`;
	expect(result.status, output).toBe(0);
	const expected = JSON.parse(
		readFileSync(resolve(repoRoot, 'packages/motion/audit/pristine-runtime.json'), 'utf8'),
	).tests;
	expect(output).toMatch(
		new RegExp(`Tests:\\s+${expected.length} passed, ${expected.length} total`),
	);
	const reportJson = JSON.parse(readFileSync(report, 'utf8'));
	const executed = reportJson.testResults
		.flatMap(function mapSuite(suite: {
			name: string;
			assertionResults: Array<{ fullName: string; status: string }>;
		}) {
			return suite.assertionResults.map(function mapTest(test: {
				fullName: string;
				status: string;
			}) {
				return {
					file: relative(runRoot, suite.name).split('\\').join('/'),
					fullName: test.fullName,
					status: test.status,
				};
			});
		})
		.sort(compareIdentities);
	expect(executed).toEqual(expected);
}, 60_000);
