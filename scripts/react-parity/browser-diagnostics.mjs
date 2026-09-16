#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { constants } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
	collectBrowserResources,
	createDiagnosticWriter,
	diagnosticError,
} from './browser-diagnostics-lib.mjs';
import { parseShard } from './shard-lib.mjs';

export async function runBrowserDiagnostics({
	args,
	outputDir,
	env = process.env,
	sample = collectBrowserResources,
}) {
	mkdirSync(outputDir, { recursive: true });
	const directory = mkdtempSync(join(outputDir, 'run-'));
	const record = createDiagnosticWriter(join(directory, 'browser-resources.jsonl'));
	const started = Date.now();
	const collect = () => {
		try {
			record('resources', { elapsed: Date.now() - started, ...sample() });
		} catch (error) {
			record('sampler-error', { error: diagnosticError(error) });
		}
	};
	record('start', { args, sha: env.GITHUB_SHA, node: process.version, platform: process.platform });
	console.log(`Browser diagnostics: ${directory}`);
	collect();
	const grouped = process.platform !== 'win32';
	const child = spawn(process.execPath, args, {
		stdio: 'inherit',
		detached: grouped,
		env: {
			...env,
			OCTANE_BROWSER_DIAGNOSTICS_DIR: directory,
			REACT_PARITY_BROWSER_DIAGNOSTICS: '1',
			REACT_PARITY_VITEST_REPORT: join(directory, 'browser-test-report.json'),
		},
	});
	const timer = setInterval(collect, 2000);
	let cancelled;
	let escalation;
	const signalChild = (signal) => {
		try {
			if (grouped && child.pid) process.kill(-child.pid, signal);
			else child.kill(signal);
		} catch (error) {
			if (error.code !== 'ESRCH') record('signal-error', { error: diagnosticError(error) });
		}
	};
	const handlers = new Map(
		['SIGINT', 'SIGTERM'].map((signal) => [
			signal,
			() => {
				cancelled = signal;
				record('cancel', { signal });
				signalChild(signal);
				escalation ??= setTimeout(() => signalChild('SIGKILL'), 5000).unref();
			},
		]),
	);
	for (const [signal, handler] of handlers) process.on(signal, handler);
	try {
		const result = await new Promise((resolveResult) => {
			child.once('error', (error) => resolveResult({ code: 1, error: diagnosticError(error) }));
			child.once('close', (code, signal) => resolveResult({ code, signal }));
		});
		collect();
		record('exit', { ...result, cancelled, elapsed: Date.now() - started });
		const signal = cancelled ?? result.signal;
		return {
			directory,
			code: signal ? 128 + (constants.signals[signal] ?? 1) : (result.code ?? 1),
		};
	} finally {
		clearInterval(timer);
		clearTimeout(escalation);
		for (const [signal, handler] of handlers) process.off(signal, handler);
		// A cancelled audit may have exited before its grandchildren; reap the group.
		if (cancelled) signalChild('SIGKILL');
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const { values } = parseArgs({
		options: { shard: { type: 'string', default: '4/4' }, 'output-dir': { type: 'string' } },
	});
	if (!values['output-dir']) throw new Error('--output-dir is required');
	const shard = parseShard(values.shard);
	const result = await runBrowserDiagnostics({
		args: ['scripts/react-parity/check.mjs', '--shard', shard.value],
		outputDir: resolve(values['output-dir']),
	});
	process.exitCode = result.code;
}
