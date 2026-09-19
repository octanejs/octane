import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const hook = fileURLToPath(new URL('./package-test-reporter-hook.mjs', import.meta.url));

for (const runner of ['vitest', 'jest']) {
	test(`${runner} instrumentation leaves child runner reports intact`, (t) => {
		const root = mkdtempSync(path.join(tmpdir(), 'package-reporter-nesting-'));
		t.after(() => rmSync(root, { recursive: true, force: true }));
		const reports = path.join(root, 'reports');
		mkdirSync(reports);
		const entry = path.join(root, `${runner}.mjs`);
		const childReport = path.join(root, 'pristine.json');
		writeFileSync(
			entry,
			`
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const output = process.argv.findLast(value => value.startsWith('--outputFile=')).slice('--outputFile='.length);
if (!process.argv.includes('--child')) {
  const result = spawnSync(process.execPath, [${JSON.stringify(entry)}, '--child', '--outputFile=' + ${JSON.stringify(childReport)}], {env: process.env});
  if (result.status !== 0) throw new Error(result.stderr.toString());
}
writeFileSync(output, JSON.stringify({child: process.argv.includes('--child')}));
`,
		);
		const result = spawnSync(process.execPath, [entry], {
			env: {
				...process.env,
				NODE_OPTIONS: `--import=${hook}`,
				REACT_PORT_TEST_REPORT_DIR: reports,
			},
			encoding: 'utf8',
		});
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(JSON.parse(readFileSync(childReport)), { child: true });
		const invocations = readdirSync(reports).filter((file) => file.endsWith('.invocation.json'));
		assert.equal(invocations.length, 1);
		const invocation = JSON.parse(readFileSync(path.join(reports, invocations[0])));
		assert.equal(invocation.runner, runner);
		assert.deepEqual(JSON.parse(readFileSync(path.join(reports, invocation.reportFile))), {
			child: false,
		});
	});
}
