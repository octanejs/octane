import assert from 'node:assert/strict';
import test from 'node:test';
import { runRequiredBindingLanes } from './check-lib.mjs';

const options = (execFile) => ({
	relativeFile: 'packages/example/audit/react-parity.json',
	harnessPath: '/repo/scripts/react-parity/harness.mjs',
	repo: '/repo',
	execFile,
});

test('runs required lanes without conditioning execution on verification status', () => {
	const calls = [];
	runRequiredBindingLanes(options((...args) => calls.push(args)));
	assert.deepEqual(calls[0][1], [
		'/repo/scripts/react-parity/harness.mjs',
		'run-required',
		'--manifest',
		'packages/example/audit/react-parity.json',
	]);
});

test('propagates a required lane failure to the global check', () => {
	assert.throws(
		() =>
			runRequiredBindingLanes(
				options(() => {
					throw new Error('lane failed');
				}),
			),
		/lane failed/,
	);
});
