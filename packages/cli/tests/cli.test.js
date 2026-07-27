import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../src/kernel/registry.js';
import { runCli } from './helpers/fixture.js';

describe('the CLI kernel', () => {
	it('lists every registered command in help', async () => {
		const result = await runCli(['--help']);
		for (const entry of COMMANDS) expect(result.stdout).toContain(entry.name);
		expect(result.exitCode).toBe(0);
	});

	it('derives command help from the command spec', async () => {
		const result = await runCli(['doctor', '--help']);
		expect(result.stdout).toContain('--fix');
		expect(result.stdout).toContain('--only <id>');
		expect(result.stdout).toContain('--json');
	});

	it('prints help instead of prompting when there is no TTY', async () => {
		const result = await runCli([]);
		expect(result.stdout).toContain('Usage');
		expect(result.exitCode).toBe(0);
	});

	it('exposes the command list to agents under --json', async () => {
		const result = await runCli(['--json']);
		expect(result.json().commands.map((/** @type {any} */ c) => c.name)).toEqual(
			COMMANDS.map((entry) => entry.name),
		);
	});

	it('rejects an unknown command with a usage exit code', async () => {
		const result = await runCli(['banana']);
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toMatch(/Unknown command: banana/);
	});

	it('reports errors as JSON when --json is set', async () => {
		const result = await runCli(['banana', '--json']);
		expect(result.exitCode).toBe(2);
		expect(JSON.parse(result.stderr)).toMatchObject({ ok: false });
	});

	it('prints the version', async () => {
		const result = await runCli(['--version']);
		expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
	});
});
