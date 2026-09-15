import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTestIdentities } from './harness-lib.mjs';
import { verifyMaterializedUpstreamEvidence } from './materialized-upstream-lib.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageRoot = join(repo, 'packages/motion');
const oracle = createRequire(join(repo, 'scripts/react-parity/fixtures/motion/package.json'));

export function runPristineUpstreamSuite() {
	verifyMaterializedUpstreamEvidence(repo, 'packages/motion');
	const environment = JSON.parse(
		readFileSync(join(repo, 'scripts/react-parity/fixtures/motion/package.json'), 'utf8'),
	);
	for (const [name, version] of Object.entries(environment.dependencies)) {
		const installed = JSON.parse(readFileSync(oracle.resolve(`${name}/package.json`), 'utf8'));
		if (installed.version !== version)
			throw new Error(`Motion oracle ${name}: expected ${version}, found ${installed.version}`);
	}
	// Jest reports canonical paths. Resolve macOS /var and /private/var aliases
	// before deriving identities so a temporary directory never enters the pin.
	const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'octane-motion-pristine-')));
	const source = join(scratch, 'framer-motion');
	try {
		cpSync(join(packageRoot, 'upstream'), source, { recursive: true });
		cpSync(join(packageRoot, 'upstream-artifact/motion'), join(scratch, 'motion'), {
			recursive: true,
		});
		const output = join(scratch, 'results.json');
		const result = spawnSync(
			process.execPath,
			[
				oracle.resolve('jest/bin/jest'),
				'--config',
				join(packageRoot, 'tests/upstream-jest.config.cjs'),
				'--runInBand',
				'--no-watchman',
				'--json',
				`--outputFile=${output}`,
			],
			{
				cwd: repo,
				env: { ...process.env, OCTANE_MOTION_PRISTINE_ROOT: source },
				encoding: 'utf8',
				maxBuffer: 16 * 1024 * 1024,
			},
		);
		if (result.error) throw result.error;
		const report = JSON.parse(readFileSync(output, 'utf8'));
		const all = report.testResults
			.flatMap((suite) =>
				suite.assertionResults.map((test) => ({
					file: relative(source, suite.name).split('\\').join('/'),
					fullName: test.fullName,
					status: test.status,
				})),
			)
			.sort(compareTestIdentities);
		return {
			status: result.status ?? 1,
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
			report,
			identities: all.filter((test) => !['pending', 'todo'].includes(test.status)),
			skipped: all.filter((test) => ['pending', 'todo'].includes(test.status)),
		};
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}
