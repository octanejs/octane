#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runStaleReceiptLanes } from './react-parity/receipts-lib.mjs';
import {
	parityManifestsForTestSelection,
	vitestArgumentsForTestSelection,
} from './run-tests-lib.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const explicitConfig = args.some((value) => value === '--config' || value.startsWith('--config='));
const passthroughOnly = explicitConfig || args.includes('--help');
const vitestArgs = [
	'node_modules/vitest/vitest.mjs',
	'run',
	...vitestArgumentsForTestSelection(args),
];

if (!passthroughOnly) {
	const manifestPaths = await parityManifestsForTestSelection({ root, args });
	const results = await runStaleReceiptLanes({ root, manifestPaths });
	for (const result of results) {
		console.log(
			result.skipped
				? `React parity receipt current: ${result.manifestPath}`
				: `React parity receipt recorded: ${result.manifestPath} (${result.laneIds.join(', ')})`,
		);
	}
}

const exitCode = await new Promise((resolveExit, reject) => {
	const child = spawn(process.execPath, vitestArgs, { cwd: root, stdio: 'inherit' });
	child.on('error', reject);
	child.on('close', (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
});
process.exitCode = exitCode;
