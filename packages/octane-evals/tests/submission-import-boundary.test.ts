import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as clientRuntimeBridge from './_client-runtime.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function outputText(value: unknown): string {
	if (typeof value === 'string') return value;
	if (Buffer.isBuffer(value)) return value.toString('utf8');
	return '';
}

type GraderFailure = Error & { stdout?: Buffer | string; stderr?: Buffer | string };

function gradeSubmission(taskId: string, app: string): { failure?: GraderFailure; output: string } {
	const submissionRoot = mkdtempSync(join(tmpdir(), 'octane-eval-submission-'));
	mkdirSync(join(submissionRoot, 'src'));
	writeFileSync(join(submissionRoot, 'src', 'App.tsrx'), app);
	try {
		const stdout = execFileSync(
			process.execPath,
			['scripts/grade-user-app.mjs', '--task', taskId, '--submission', submissionRoot],
			{
				cwd: packageRoot,
				env: { ...process.env, OCTANE_EVAL_SANDBOX: '1' },
				killSignal: 'SIGKILL',
				stdio: 'pipe',
				timeout: 20_000,
			},
		);
		return { output: outputText(stdout) };
	} catch (error) {
		const failure = error as GraderFailure;
		return { failure, output: outputText(failure.stdout) + outputText(failure.stderr) };
	} finally {
		rmSync(submissionRoot, { recursive: true, force: true });
	}
}

describe('user-app submission import boundary', () => {
	it('rejects a candidate that imports Vitest into the grader process', () => {
		const { failure, output } = gradeSubmission(
			'tsrx.counter',
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

		expect(failure).toBeDefined();
		expect(output).toContain(
			'@octane-eval-submission/tsrx.counter/src/App.tsrx may not import "vitest"',
		);
	}, 30_000);

	it('resolves every compiler helper the client runtime bridge re-exports', () => {
		const unresolved = Object.entries(clientRuntimeBridge)
			.filter(([, value]) => value === undefined)
			.map(([name]) => name);
		expect(unresolved).toEqual([]);
	});

	it('grades a correct counter that uses a style spread and a DOM binding view', () => {
		const { failure, output } = gradeSubmission(
			'tsrx.counter',
			`import { useState } from 'octane';

export function SeatCount(props: { count: number }) @{
	'use dom bindings';
	<output aria-label="Seat count">{props.count as number}</output>
}

export function App() @{
	const [count, setCount] = useState(0);
	const emphasis = count === 3 ? { fontWeight: 'bold' } : {};

	<main>
		<h1>{'Seat selector'}</h1>
		<div role="group" aria-label="Seats" style={{ ...emphasis, opacity: count === 0 ? 0.5 : 1 }}>
			<button
				aria-label="Remove seat"
				disabled={count === 0}
				onClick={() => setCount(Math.max(0, count - 1))}
			>{'−'}</button>
			<SeatCount count={count} />
			<button
				aria-label="Add seat"
				disabled={count === 3}
				onClick={() => setCount(Math.min(3, count + 1))}
			>{'+'}</button>
		</div>
		@if (count === 0) {
			<p role="status">{'No seats selected'}</p>
		} @else if (count === 3) {
			<p role="status">{'Selection full'}</p>
		} @else {
			<p role="status">{'Ready to reserve'}</p>
		}
	</main>
}
`,
		);

		expect(failure, output).toBeUndefined();
	}, 30_000);
});
