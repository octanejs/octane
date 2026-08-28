#!/usr/bin/env node
// Shared CLI for the pristine-upstream runners. Each entry maps a package
// directory name to its runtime module (which may itself be config-driven via
// audit/pristine-suite.json) and the display label its lane reports under.
// This replaces the per-package scripts/run-pristine-upstream.mjs wrappers,
// which were byte-identical apart from these two strings.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const runners = new Map([
	['alien-signals', { module: './alien-signals-pristine-runtime.mjs', label: 'Alien Signals' }],
	['draggable', { module: './react-draggable-pristine-runtime.mjs', label: 'react-draggable' }],
	['floating-ui', { module: './floating-ui-pristine-runtime.mjs', label: '@floating-ui/react' }],
	['livestore', { module: './livestore-pristine-runtime.mjs', label: 'LiveStore' }],
	[
		'monaco-editor',
		{ module: './monaco-editor-pristine-runtime.mjs', label: '@monaco-editor/react' },
	],
	['solana-kit', { module: './solana-kit-pristine-runtime.mjs', label: '@solana/react' }],
	['tanstack-store', { module: './tanstack-store-pristine-runtime.mjs', label: 'TanStack Store' }],
	['zag', { module: './zag-pristine-runtime.mjs', label: 'Zag' }],
]);

const isMain =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
	const name = process.argv[2];
	const runner = runners.get(name);
	if (!runner) {
		console.error(
			`usage: run-pristine.mjs <package>\nknown packages: ${[...runners.keys()].join(', ')}`,
		);
		process.exit(2);
	}
	const { runPristineUpstreamSuite } = await import(runner.module);
	const result = runPristineUpstreamSuite();
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	const passed = result.identities.filter(function isPassed(test) {
		return test.status === 'passed';
	}).length;
	const failed = result.identities.filter(function isFailed(test) {
		return test.status !== 'passed';
	}).length;
	console.log(`${runner.label} pristine upstream: ${passed} passed, ${failed} non-passing.`);
	process.exitCode = result.status;
}
