import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/bin.js');

/**
 * This package is a bin and nothing else: the scaffold itself is `octane
 * create`, in the CLI. So the only thing there is to test is the handoff, and
 * the only way to test it is to run the file the way npm will.
 */
describe('create-octane', () => {
	it('runs the CLI scaffold rather than the CLI itself', async () => {
		// The CLI dispatches on the first argument, so a bin that forwarded argv
		// untouched would land on the root help, or read a project name as a
		// command that does not exist.
		const { stdout } = await run(process.execPath, [bin, '--help']);

		expect(stdout).toContain('--template');
		expect(stdout).toContain('directory');
		// The root help would list the other commands instead.
		expect(stdout).not.toContain('Diagnose an Octane project');
	});

	it('reports a bad template through the CLI rather than crashing', async () => {
		// Proves the forwarded argv reaches the command's own parsing, not just
		// that the process starts.
		const failure = await run(process.execPath, [bin, 'my-app', '--template', 'islands']).catch(
			(/** @type {any} */ error) => error,
		);

		expect(failure.code).toBe(2);
		expect(`${failure.stderr}`).toContain('spa, fullstack');
	});
});
