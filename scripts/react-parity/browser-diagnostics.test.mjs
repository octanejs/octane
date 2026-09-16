import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
	collectBrowserResources,
	createDiagnosticWriter,
	diagnosticError,
	diagnosticUrl,
} from './browser-diagnostics-lib.mjs';
import { runBrowserDiagnostics } from './browser-diagnostics.mjs';

function temporary(t) {
	const directory = mkdtempSync(join(tmpdir(), 'browser-diagnostics-test-'));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	return directory;
}

test('diagnostic URLs omit credentials, queries, fragments and non-network content', () => {
	assert.equal(
		diagnosticUrl('ws://user:secret@localhost:123/path?token=private#secret'),
		'ws://localhost:123/path',
	);
	assert.equal(diagnosticUrl('data:text/plain,secret'), 'data:[redacted]');
	assert.equal(diagnosticUrl('broken'), '[invalid URL]');
	assert.equal(
		diagnosticError('failed ws://localhost/path?token=private net::ERR_CONNECTION_RESET'),
		'failed ws://localhost/path net::ERR_CONNECTION_RESET',
	);
});

test('resource sampling reports pressure without serializing command arguments', (t) => {
	const proc = temporary(t);
	writeFileSync(join(proc, 'meminfo'), 'MemTotal: 100 kB\nMemAvailable: 30 kB\nSwapFree: 0 kB\n');
	mkdirSync(join(proc, '12', 'fd'), { recursive: true });
	writeFileSync(join(proc, '12', 'cmdline'), '/bin/chromium\0--type=renderer\0--token=private\0');
	writeFileSync(join(proc, '12', 'status'), 'Name:\tchromium\nVmRSS:\t20 kB\n');
	writeFileSync(join(proc, '12', 'limits'), 'Max open files 65536 65536 files\n');
	writeFileSync(join(proc, '12', 'fd', '1'), '');
	mkdirSync(join(proc, '13')); // An exited process must not lose the other observations.
	const result = collectBrowserResources(proc, proc);
	assert.equal(result.memory.MemAvailable, 30 * 1024);
	assert.deepEqual(result.processes, [
		{
			pid: 12,
			name: 'chromium',
			type: 'renderer',
			openFilesLimit: ['65536', '65536'],
			rss: 20 * 1024,
			fds: 1,
		},
	]);
	assert.ok(result.diskAvailable > 0);
	assert.ok(!JSON.stringify(result).includes('private'));
	assert.equal(collectBrowserResources(join(proc, 'absent'), proc).unavailable[0].metric, 'proc');
});

test('diagnostic output errors do not throw into the test runner', (t) => {
	const warnings = [];
	t.mock.method(console, 'error', (message) => warnings.push(message));
	const record = createDiagnosticWriter(join(temporary(t), 'missing', 'events.jsonl'));
	assert.doesNotThrow(() => {
		record('close');
		record('crash');
	});
	assert.equal(warnings.length, 1);
	t.mock.method(console, 'error', () => {
		throw new Error('stderr is closed');
	});
	assert.doesNotThrow(() =>
		createDiagnosticWriter(join(temporary(t), 'missing', 'events.jsonl'))('close'),
	);
});

test('each diagnostic run has fresh evidence and preserves failure despite sampler errors', async (t) => {
	const outputDir = temporary(t);
	const success = await runBrowserDiagnostics({
		outputDir,
		args: ['-e', 'process.exit(0)'],
		sample: () => ({}),
	});
	const failure = await runBrowserDiagnostics({
		outputDir,
		args: ['-e', 'process.exit(7)'],
		sample: () => {
			throw new Error('probe failed');
		},
	});
	assert.equal(success.code, 0);
	assert.equal(failure.code, 7);
	assert.notEqual(success.directory, failure.directory);
	const events = readFileSync(join(failure.directory, 'browser-resources.jsonl'), 'utf8')
		.trim()
		.split('\n')
		.map(JSON.parse);
	assert.ok(events.some((event) => event.event === 'sampler-error'));
	assert.equal(events.at(-1).code, 7);
});

test(
	'a signalled child remains a failing diagnostic run',
	{ skip: process.platform === 'win32' },
	async (t) => {
		const result = await runBrowserDiagnostics({
			outputDir: temporary(t),
			args: ['-e', 'process.kill(process.pid, "SIGTERM")'],
			sample: () => ({}),
		});
		assert.equal(result.code, 143);
	},
);

test(
	'cancelling diagnostics forwards termination and preserves a failing exit',
	{ skip: process.platform === 'win32', timeout: 15000 },
	async (t) => {
		const outputDir = temporary(t);
		const runner = pathToFileURL(join(import.meta.dirname, 'browser-diagnostics.mjs')).href;
		const program = `import { runBrowserDiagnostics } from ${JSON.stringify(runner)};
const result = await runBrowserDiagnostics({ outputDir: ${JSON.stringify(outputDir)}, args: ['-e', 'process.on("SIGTERM", () => process.exit(0)); console.log("CHILD_READY"); setInterval(() => {}, 1000)'], sample: () => ({}) });
process.exitCode = result.code;`;
		const child = spawn(process.execPath, ['--input-type=module', '-e', program], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		t.after(() => {
			if (child.exitCode === null) child.kill('SIGKILL');
		});
		const closed = once(child, 'close');
		await new Promise((resolveReady, reject) => {
			let output = '';
			child.stdout.on('data', (chunk) => {
				output += chunk;
				if (output.includes('CHILD_READY')) resolveReady();
			});
			child.once('error', reject);
			child.once('exit', () => reject(new Error('diagnostic runner exited before readiness')));
		});
		child.kill('SIGTERM');
		const [code, signal] = await closed;
		assert.equal(signal, null);
		assert.equal(
			code,
			143,
			'even a child that handles cancellation successfully must not make the audit green',
		);
	},
);
