import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyMaterializedUpstreamEvidence } from './materialized-upstream-lib.mjs';
import { pristineIdentitiesFromReport } from './pristine-suite-lib.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packagePath = 'packages/mobx';

export function runPristineUpstreamSuite() {
	verifyMaterializedUpstreamEvidence(repoRoot, packagePath);
	const packageRoot = resolve(repoRoot, packagePath);
	const require = createRequire(join(packageRoot, 'package.json'));
	const scratch = mkdtempSync(join(tmpdir(), 'octane-mobx-pristine-'));
	try {
		const reportPath = join(scratch, 'report.json');
		const result = spawnSync(
			process.execPath,
			[
				require.resolve('jest/bin/jest'),
				'--config',
				join(packageRoot, 'tests/upstream-jest.config.cjs'),
				'--runInBand',
				'--no-watchman',
				'--json',
				'--outputFile',
				reportPath,
				'--cacheDirectory',
				join(scratch, 'cache'),
			],
			{
				cwd: packageRoot,
				encoding: 'utf8',
				env: { ...process.env, CI: 'true' },
				timeout: 120_000,
			},
		);
		let report;
		try {
			report = JSON.parse(readFileSync(reportPath, 'utf8'));
		} catch (error) {
			throw new Error(
				`MobX pristine runner did not produce a report: ${result.error?.message ?? result.stderr}`,
				{
					cause: error,
				},
			);
		}
		return {
			status: result.status ?? 1,
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
			report,
			identities: pristineIdentitiesFromReport(report, { repoRoot, packagePath }),
		};
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}
