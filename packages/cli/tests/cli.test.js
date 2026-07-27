import { rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../src/kernel/registry.js';
import { createFixture, runCli } from './helpers/fixture.js';

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

	it('shows the mark on the root, but never on a subcommand or under --json', async () => {
		// The one way decoration can actually break something is by preceding a
		// JSON document, so that case is pinned rather than eyeballed.
		const mark = '&&&';
		for (const argv of [['--help'], []]) {
			const { stdout } = await runCli(argv);
			expect(stdout, String(argv)).toContain(mark);
			expect(stdout, String(argv)).toContain('OCTANE CLI');
		}

		expect((await runCli(['doctor', '--help'])).stdout).not.toContain(mark);
		const json = await runCli(['--json']);
		expect(json.stdout).not.toContain(mark);
		expect(json.stdout).not.toContain('OCTANE CLI');
		expect(() => JSON.parse(json.stdout)).not.toThrow();
	});

	it('exposes the command list to agents under --json', async () => {
		const result = await runCli(['--json']);
		expect(result.json().commands.map((/** @type {any} */ c) => c.name)).toEqual(
			COMMANDS.map((entry) => entry.name),
		);
	});

	it('falls back to help for a command group when it cannot prompt', async () => {
		// Interactively `octane mcp` opens a submenu; with no TTY it must print
		// that group's commands rather than hang waiting for a selection.
		const result = await runCli(['mcp']);
		expect(result.exitCode).toBe(0);
		for (const name of ['add', 'status', 'remove']) expect(result.stdout).toContain(name);

		const json = await runCli(['mcp', '--json']);
		expect(json.json().commands.map((/** @type {any} */ c) => c.name)).toEqual([
			'add',
			'status',
			'remove',
		]);
	});

	it('rejects a --cwd that does not exist', async () => {
		// Otherwise the commands report on a phantom empty project, which reads
		// as a real result rather than a typo.
		const result = await runCli(['doctor', '--cwd', '/definitely/not/here', '--json']);
		expect(result.exitCode).toBe(2);
		expect(JSON.parse(result.stderr).error).toMatch(/--cwd directory does not exist/);
	});

	it('refuses to run a project-writing command outside a package.json', async () => {
		const { root } = createFixture({ 'src/App.tsrx': 'export function App() @{ <div /> }\n' });
		try {
			for (const argv of [
				['init', '--mode', 'spa', '--cwd', root, '--yes'],
				['add', 'zustand', '--cwd', root],
			]) {
				const result = await runCli(argv, {
					exec: { which: () => null, run: async () => ({ code: 0, stdout: '', stderr: '' }) },
				});
				expect(result.exitCode, argv[0]).toBe(1);
				expect(result.stderr, argv[0]).toMatch(/No package\.json found/);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('rejects an unknown command with a usage exit code', async () => {
		const result = await runCli(['banana']);
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toMatch(/Unknown command: banana/);
	});

	it('reports errors as JSON when --json is set, in either spelling', async () => {
		for (const flag of ['--json', '--json=true']) {
			const result = await runCli(['banana', flag]);
			expect(result.exitCode, flag).toBe(2);
			expect(JSON.parse(result.stderr), flag).toMatchObject({ ok: false });
		}
	});

	it('prints the version, and does so on a subcommand too', async () => {
		// Help lists --version under "Global options" for every command, so it has
		// to answer there rather than silently running the command instead.
		const root = await runCli(['--version']);
		expect(root.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
		expect((await runCli(['doctor', '--version'])).stdout.trim()).toBe(root.stdout.trim());
		expect((await runCli(['mcp', 'add', '--version'])).stdout.trim()).toBe(root.stdout.trim());
	});
});
