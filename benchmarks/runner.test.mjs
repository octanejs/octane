import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = path.dirname(fileURLToPath(import.meta.url));

// Run the actual CLI with a cheap harness that implements BENCH_JSON. This
// exercises process isolation, output/record/compare and failure propagation
// without making a wall-clock threshold part of the test suite.
function fixture(t) {
	const root = mkdtempSync(path.join(tmpdir(), 'octane-runner-test-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const bench = path.join(root, 'benchmarks');
	mkdirSync(path.join(bench, 'lib'), { recursive: true });
	mkdirSync(path.join(bench, 'js-framework'));
	for (const file of ['bench.mjs', 'lib/stats.mjs', 'lib/repeat-results.mjs', 'lib/run-lock.mjs']) {
		copyFileSync(path.join(source, file), path.join(bench, file));
	}
	writeFileSync(
		path.join(bench, 'js-framework/run.mjs'),
		`
import fs from 'node:fs';
const counter = new URL('./count', import.meta.url);
const count = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0;
fs.writeFileSync(counter, String(count + 1));
if (process.env.FIXTURE_MODE === 'missing') process.exit(0);
const score = [10, 100, 12][count % 3];
const result = {
  suite: 'js-framework', iterations: Number(process.argv[2]),
  targets: [{ name: 'fixture', ops: { work: { score, median: score, min: score - 1, p95: score + 2 } }, meta: { pid: process.pid } }],
};
if (process.env.FIXTURE_MODE === 'failed') result.failed = 'incorrect DOM';
fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(result));
`,
	);
	return {
		root,
		run(args = [], mode = '') {
			return spawnSync(
				process.execPath,
				[path.join(bench, 'bench.mjs'), 'js-framework', '--servers=none', ...args],
				{
					cwd: root,
					env: { ...process.env, TMPDIR: root, TMP: root, TEMP: root, FIXTURE_MODE: mode },
					encoding: 'utf8',
				},
			);
		},
		read(file = 'results/js-framework.json') {
			return JSON.parse(readFileSync(path.join(bench, file), 'utf8'));
		},
	};
}

test('repeat runs fresh harnesses, retains every distribution and records the median', (t) => {
	const f = fixture(t);
	const run = f.run(['--repeat=3', '--record']);
	assert.equal(run.status, 0, run.stderr);
	const result = f.read();
	assert.equal(result.repetitions, 3);
	assert.equal(result.targets[0].ops.work.score, 12);
	assert.deepEqual(result.targets[0].ops.work.betweenRuns.scores, [10, 100, 12]);
	assert.equal(new Set(result.runs.map((run) => run.targets[0].meta.pid)).size, 3);
	for (let i = 0; i < 3; i++) {
		assert.deepEqual(f.read(`results/js-framework.run-${i + 1}.json`), result.runs[i]);
	}
	assert.deepEqual(f.read('baselines/local/js-framework.json'), result);
	assert.match(run.stderr, /Median of 3/);
	const comparison = f.run(['--repeat=3', '--compare']);
	assert.equal(comparison.status, 0, comparison.stderr);
});

test('default stays single-run and comparing a different repetition protocol fails', (t) => {
	const f = fixture(t);
	assert.equal(f.run(['--record']).status, 0);
	assert.equal(f.read().repetitions, undefined);
	const comparison = f.run(['--repeat=3', '--compare']);
	assert.equal(comparison.status, 1);
	assert.match(comparison.stderr, /baseline repetition count differs/);
});

test('a correctness failure with exit zero stops repeats and cannot overwrite a baseline', (t) => {
	const f = fixture(t);
	assert.equal(f.run(['--repeat=3', '--record']).status, 0);
	const baseline = f.read('baselines/local/js-framework.json');
	const run = f.run(['--repeat=3', '--record'], 'failed');
	assert.equal(run.status, 1);
	assert.match(f.read().failed, /incorrect DOM/);
	assert.equal(f.read().runs.length, 1);
	assert.equal(existsSync(path.join(f.root, 'benchmarks/results/js-framework.run-2.json')), false);
	assert.deepEqual(f.read('baselines/local/js-framework.json'), baseline);
});

test('a harness that exits zero without JSON fails and retains its failed repetition', (t) => {
	const f = fixture(t);
	assert.equal(f.run(['--repeat=3']).status, 0);
	const run = f.run(['--repeat=3', '--record'], 'missing');
	assert.equal(run.status, 1);
	assert.match(f.read('results/js-framework.run-1.json').failed, /no targets/);
	assert.equal(existsSync(path.join(f.root, 'benchmarks/results/js-framework.json')), false);
	assert.equal(
		existsSync(path.join(f.root, 'benchmarks/baselines/local/js-framework.json')),
		false,
	);
});

test('invalid repeat counts fail before any harness starts', (t) => {
	const f = fixture(t);
	for (const argument of [
		'--repeat',
		'--repeat=0',
		'--repeat=-1',
		'--repeat=1.5',
		'--repeat=NaN',
	]) {
		const run = f.run([argument]);
		assert.notEqual(run.status, 0);
		assert.match(run.stderr, /positive integer/);
	}
	assert.equal(existsSync(path.join(f.root, 'benchmarks/js-framework/count')), false);
});

for (const { name, signalDelay, shutdownTimeout } of [
	{
		name: 'consecutive suites wait for their previous preview to release a shared port',
		signalDelay: 400,
		shutdownTimeout: false,
	},
	{
		name: 'a preview shutdown timeout stops subsequent suites',
		signalDelay: 60_000,
		shutdownTimeout: true,
	},
]) {
	test(name, async (t) => {
		const f = fixture(t);
		const reservation = createServer();
		reservation.listen(0);
		await once(reservation, 'listening');
		const port = reservation.address().port;
		await new Promise((resolve, reject) =>
			reservation.close((error) => (error ? reject(error) : resolve())),
		);
		const bench = path.join(f.root, 'benchmarks');
		const runner = path.join(bench, 'bench.mjs');
		// Change only the fixture's manifest metadata; run the real CLI lifecycle.
		writeFileSync(
			runner,
			readFileSync(runner, 'utf8').replaceAll(
				"{ filter: 'react-jsbench', port: 5175 }",
				`{ filter: 'react-jsbench', port: ${port} }`,
			),
		);
		copyFileSync(
			path.join(bench, 'js-framework/run.mjs'),
			path.join(bench, 'js-framework/run-reorder.mjs'),
		);
		const bin = path.join(f.root, 'bin');
		mkdirSync(bin);
		const serverPids = path.join(f.root, 'server-pids');
		writeFileSync(
			path.join(bin, 'pnpm'),
			`#!/usr/bin/env node
const fs = require('node:fs');
const http = require('node:http');
if (process.argv.at(-1) === 'preview') {
  const server = http.createServer((request, response) => response.end('ready'));
  server.listen(Number(process.env.FIXTURE_PORT), () => {
    fs.appendFileSync(process.env.FIXTURE_SERVER_PIDS, process.pid + '\\n');
  });
  setTimeout(() => process.exit(1), 15000).unref();
}
`,
			{ mode: 0o755 },
		);
		const delayedSignals = path.join(f.root, 'delayed-signals.mjs');
		writeFileSync(
			delayedSignals,
			`const kill = process.kill.bind(process);
process.kill = (pid, signal) => {
  if (pid < 0 && signal === 'SIGKILL') {
    setTimeout(() => {
      try { kill(pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }, ${signalDelay});
    return true;
  }
  return kill(pid, signal);
};
`,
		);
		try {
			const run = spawnSync(
				process.execPath,
				[
					'--import',
					delayedSignals,
					runner,
					'js-framework',
					'js-framework-reorder',
					'--servers=react-jsbench',
				],
				{
					cwd: f.root,
					env: {
						...process.env,
						TMPDIR: f.root,
						TMP: f.root,
						TEMP: f.root,
						PATH: `${bin}${path.delimiter}${process.env.PATH}`,
						FIXTURE_PORT: String(port),
						FIXTURE_SERVER_PIDS: serverPids,
						FIXTURE_MODE: '',
					},
					encoding: 'utf8',
					timeout: 20_000,
				},
			);
			assert.equal(run.error, undefined);
			assert.equal(f.read('results/js-framework.json').harnessExit, 0);
			if (shutdownTimeout) {
				assert.equal(run.status, 1, run.stderr);
				assert.match(run.stderr, /preview ports did not close after shutdown/);
				assert.doesNotMatch(run.stderr, /=== js-framework-reorder ===/);
				assert.equal(existsSync(path.join(bench, 'results/js-framework-reorder.json')), false);
				assert.equal(readFileSync(serverPids, 'utf8').trim().split('\n').length, 1);
			} else {
				assert.equal(run.status, 0, run.stderr);
				assert.equal(f.read('results/js-framework-reorder.json').harnessExit, 0);
				assert.equal(readFileSync(serverPids, 'utf8').trim().split('\n').length, 2);
			}
		} finally {
			// The reproduction fails before queued signals run, so independently
			// clean up only the child PIDs recorded by our own preview fixtures.
			if (existsSync(serverPids)) {
				for (const pid of readFileSync(serverPids, 'utf8').trim().split('\n')) {
					try {
						process.kill(Number(pid), 'SIGKILL');
					} catch (error) {
						if (error.code !== 'ESRCH') throw error;
					}
				}
			}
		}
	});
}
