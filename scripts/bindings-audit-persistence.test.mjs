import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runCli } from './bindings-audit.mjs';

function fixture(t) {
	const root = mkdtempSync(path.join(tmpdir(), 'bindings-audit-persistence-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const repository = path.join(root, 'source');
	const files = {
		'package.json': '{"name":"audit-fixture","private":true}',
		'packages/octane/package.json': '{"name":"octane","version":"0.2.0"}',
		'packages/octane/src/index.ts': 'export const runtime = true;',
		'docs/differences-from-react.md': 'Native events.',
		'packages/octane-mcp-server/src/bridge.js':
			'export const KNOWN_BINDINGS = {}; export const KNOWN_NATIVE_BINDINGS = new Set([]); export const KNOWN_VANILLA_CORES = {}; export const REACT_API_MAP = {};',
	};
	for (const [relative, contents] of Object.entries(files)) {
		const file = path.join(repository, relative);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, contents);
	}
	for (const args of [
		['init', '--quiet', '--initial-branch=main'],
		['add', '.'],
		[
			'-c',
			'user.name=Fixture',
			'-c',
			'user.email=fixture@example.test',
			'commit',
			'--quiet',
			'-m',
			'Fixture',
		],
	])
		execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', repository, ...args], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});
	const output = path.join(root, 'reports', 'report.json');
	const invoke = async (args, options = {}) => {
		let stdout = '';
		let stderr = '';
		const code = await runCli(args, {
			checkoutParent: path.join(root, 'checkouts'),
			stdout: {
				write: (value) => {
					stdout += value;
				},
			},
			stderr: {
				write: (value) => {
					stderr += value;
				},
			},
			...options,
		});
		return { code, stdout, stderr };
	};
	const audit = () => invoke(['audit', '--repository', repository, '--all', '--output', output]);
	return { output, invoke, audit };
}

test('CLI persists a complete report and replaces it with the refreshed JSON', async (t) => {
	const f = fixture(t);
	const initial = await f.audit();
	assert.equal(initial.code, 0, initial.stderr);
	assert.equal(readFileSync(f.output, 'utf8'), initial.stdout);
	const refreshed = await f.invoke(['revalidate', '--input', f.output]);
	assert.equal(refreshed.code, 0, refreshed.stderr);
	assert.equal(readFileSync(f.output, 'utf8'), refreshed.stdout);
	assert.ok(JSON.parse(refreshed.stdout).checkedAt);
	assert.notEqual(refreshed.stdout, initial.stdout);
	assert.deepEqual(readdirSync(path.dirname(f.output)), ['report.json']);
});

for (const operation of ['revalidate', 'report']) {
	for (const failure of ['write', 'rename']) {
		test(`${operation} preserves its previous report and cleans up after a ${failure} failure`, async (t) => {
			const f = fixture(t);
			const initial = await f.audit();
			assert.equal(initial.code, 0, initial.stderr);
			const before = readFileSync(f.output);
			const options =
				failure === 'write'
					? {
							writeFileSync(file, json) {
								writeFileSync(file, json.slice(0, 13));
								throw new Error('Simulated disk-full write failure');
							},
						}
					: {
							renameSync() {
								throw new Error('Simulated rename failure');
							},
						};
			const failed = await f.invoke([operation, '--input', f.output], options);
			assert.equal(failed.code, 1, failed.stderr);
			assert.equal(failed.stdout, '');
			assert.match(failed.stderr, /Simulated .* failure/);
			assert.ok(
				readFileSync(f.output).equals(before),
				'A failed refresh must preserve the previous report byte-for-byte',
			);
			assert.deepEqual(readdirSync(path.dirname(f.output)), ['report.json']);
			const recovered = await f.invoke([operation, '--input', f.output]);
			assert.equal(recovered.code, 0, recovered.stderr);
			const report = JSON.parse(readFileSync(f.output, 'utf8'));
			assert.ok(report.checkedAt);
			const previous = JSON.parse(before).baselines[0];
			assert.deepEqual(
				report.baselines[0].receipts.slice(0, previous.receipts.length),
				previous.receipts,
			);
			assert.notEqual(report.baselines[0].currentReceiptId, previous.currentReceiptId);
		});
	}
}
