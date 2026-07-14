import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = join(packageRoot, '..', '..');
const packageBuildTimeoutMs = 30_000;
const packageImportTimeoutMs = 10_000;

describe('package runtime', () => {
	it('builds and self-imports every public entry point in plain Node', () => {
		execFileSync('pnpm', ['--filter', '@octanejs/evals', 'build'], {
			cwd: repositoryRoot,
			stdio: 'pipe',
			timeout: packageBuildTimeoutMs,
			killSignal: 'SIGKILL',
		});

		const entryPoints = [
			'@octanejs/evals',
			'@octanejs/evals/dataset',
			'@octanejs/evals/digest',
			'@octanejs/evals/jsonl',
			'@octanejs/evals/schema',
			'@octanejs/evals/reporting',
			'@octanejs/evals/runner',
		];
		const imported = execFileSync(
			process.execPath,
			[
				'--input-type=module',
				'--eval',
				`const entries = ${JSON.stringify(entryPoints)}; for (const entry of entries) await import(entry); process.stdout.write(JSON.stringify(entries));`,
			],
			{
				cwd: packageRoot,
				encoding: 'utf8',
				timeout: packageImportTimeoutMs,
				killSignal: 'SIGKILL',
			},
		);

		expect(JSON.parse(imported)).toEqual(entryPoints);
	}, 45_000);
});
