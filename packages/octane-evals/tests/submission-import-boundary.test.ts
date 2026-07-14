import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function outputText(value: unknown): string {
	if (typeof value === 'string') return value;
	if (Buffer.isBuffer(value)) return value.toString('utf8');
	return '';
}

describe('user-app submission import boundary', () => {
	it('rejects a candidate that imports Vitest into the grader process', () => {
		const submissionRoot = mkdtempSync(join(tmpdir(), 'octane-eval-malicious-import-'));
		mkdirSync(join(submissionRoot, 'src'));
		writeFileSync(
			join(submissionRoot, 'src', 'App.tsrx'),
			`import { expect } from 'vitest';

expect.extend({
	toBe() {
		return { pass: true, message: () => 'tampered' };
	},
});

export function App() @{
	<main />
}
`,
		);

		let failure: (Error & { stdout?: Buffer | string; stderr?: Buffer | string }) | undefined;
		try {
			execFileSync(
				process.execPath,
				['scripts/grade-user-app.mjs', '--task', 'tsrx.counter', '--submission', submissionRoot],
				{
					cwd: packageRoot,
					env: { ...process.env, OCTANE_EVAL_SANDBOX: '1' },
					killSignal: 'SIGKILL',
					stdio: 'pipe',
					timeout: 20_000,
				},
			);
		} catch (error) {
			failure = error as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
		} finally {
			rmSync(submissionRoot, { recursive: true, force: true });
		}

		expect(failure).toBeDefined();
		const output = outputText(failure?.stdout) + outputText(failure?.stderr);
		expect(output).toContain(
			'@octane-eval-submission/tsrx.counter/src/App.tsrx may not import "vitest"',
		);
	}, 30_000);
});
