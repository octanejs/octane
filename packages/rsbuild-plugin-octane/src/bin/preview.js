#!/usr/bin/env node
// @ts-check
import { spawn } from 'node:child_process';
import path from 'node:path';

import { loadOctaneConfig, octaneConfigExists } from '@octanejs/app-core/config-loader';

const args = process.argv.slice(2);
let root = process.cwd();
let entryOverride;
for (let index = 0; index < args.length; index++) {
	const arg = args[index];
	if (arg === '--root') {
		const value = args[++index];
		if (!value) throw new Error('--root requires a directory.');
		root = path.resolve(value);
	} else if (arg === '--help' || arg === '-h') {
		console.log('Usage: octane-rsbuild-preview [--root <dir>] [server-entry]');
		process.exit(0);
	} else if (arg.startsWith('-')) {
		throw new Error(`Unknown option: ${arg}`);
	} else if (!entryOverride) {
		entryOverride = arg;
	} else {
		throw new Error(`Unexpected argument: ${arg}`);
	}
}

const config = octaneConfigExists(root) ? await loadOctaneConfig(root) : null;
const entry = entryOverride
	? path.resolve(root, entryOverride)
	: path.resolve(root, config?.build.outDir ?? 'dist', 'server', 'entry.js');
const child = spawn(process.execPath, [entry], {
	cwd: root,
	env: process.env,
	stdio: 'inherit',
});

/** @type {NodeJS.Signals[]} */
const forwardedSignals = ['SIGINT', 'SIGTERM'];
/** @type {Map<NodeJS.Signals, () => void>} */
const signalHandlers = new Map();
for (const signal of forwardedSignals) {
	const handler = () => child.kill(signal);
	signalHandlers.set(signal, handler);
	process.on(signal, handler);
}

function removeSignalHandlers() {
	for (const [signal, handler] of signalHandlers) {
		process.removeListener(signal, handler);
	}
	signalHandlers.clear();
}

child.on('error', (error) => {
	removeSignalHandlers();
	console.error(`[@octanejs/rsbuild-plugin] Unable to start ${entry}:`, error);
	process.exitCode = 1;
});
child.on('exit', (code, signal) => {
	// Remove our forwarding handlers before reproducing a signal exit. Without
	// this, the preview process catches its own signal, forwards it to the
	// already-exited child, and remains alive indefinitely.
	removeSignalHandlers();
	if (signal) process.kill(process.pid, signal);
	else process.exitCode = code ?? 1;
});
