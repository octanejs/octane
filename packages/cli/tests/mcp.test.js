import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CLIENTS, spliceTomlSection } from '../src/commands/mcp/clients.js';
import { createFixture, runCli } from './helpers/fixture.js';

/** @type {{ cleanup: () => void }[]} */
const fixtures = [];

/**
 * @param {Record<string, string | object>} [files]
 */
function fixture(files = {}) {
	const created = createFixture({ 'package.json': { name: 'app' }, ...files });
	fixtures.push(created);
	return created;
}

afterEach(() => {
	while (fixtures.length > 0) fixtures.pop()?.cleanup();
});

/**
 * An exec seam that records invocations instead of spawning. Nothing in this
 * suite may run a real `claude` or `codex`.
 *
 * @param {string[]} available binaries to report as on PATH
 */
function fakeExec(available = []) {
	/** @type {{ file: string, args: string[] }[]} */
	const calls = [];
	return {
		calls,
		which: (/** @type {string} */ bin) =>
			available.includes(bin) ? `/usr/local/bin/${bin}` : null,
		run: async (/** @type {string} */ file, /** @type {string[]} */ args) => {
			calls.push({ file, args });
			return { code: 0, stdout: '', stderr: '' };
		},
	};
}

describe('octane mcp add', () => {
	it('prefers the client CLI when it is on PATH', async () => {
		const { root } = fixture();
		const exec = fakeExec(['claude']);

		const result = await runCli(['mcp', 'add', 'claude', '--cwd', root, '--json'], { exec });

		expect(result.exitCode).toBe(0);
		expect(exec.calls).toHaveLength(1);
		expect(exec.calls[0].file).toBe('claude');
		// Asserted as exact argv, not by fragments: `claude` declares
		// `--env <env...>` as variadic, so an `-e` placed before the positional
		// swallows the server name and the CLI rejects it. Only pinning the whole
		// array catches a reordering.
		expect(exec.calls[0].args).toEqual([
			'mcp',
			'add',
			'--scope',
			'user',
			'octane',
			'--',
			'npx',
			'-y',
			'@octanejs/mcp-server',
		]);
		expect(result.json().outcomes[0].method).toBe('cli');
	});

	it('passes the environment after the server name', async () => {
		const checkout = fixture({
			'packages/octane/package.json': { name: 'octane', version: '0.1.17' },
		});
		const exec = fakeExec(['claude']);

		await runCli(['mcp', 'add', 'claude', '--cwd', checkout.root, '--json'], { exec });

		const args = exec.calls[0].args;
		expect(args.indexOf('octane')).toBeLessThan(args.indexOf('-e'));
		expect(args[args.indexOf('-e') + 1]).toBe(`OCTANE_REPO_ROOT=${checkout.root}`);
	});

	it('falls back to merging the config file when no CLI is available', async () => {
		const { root } = fixture();
		const home = fixture().root;

		const result = await runCli(['mcp', 'add', 'claude', '--cwd', root, '--json'], {
			env: { HOME: home },
			exec: fakeExec([]),
		});

		const written = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf8'));
		expect(written.mcpServers.octane).toMatchObject({
			command: 'npx',
			args: ['-y', '@octanejs/mcp-server'],
		});
		expect(result.json().outcomes[0].method).toBe('file');
	});

	it('keeps the other servers already in the file and backs it up', async () => {
		const { root } = fixture();
		const home = fixture({
			'.claude.json': {
				mcpServers: { other: { command: 'other-server' } },
				unrelated: { keep: true },
			},
		}).root;

		await runCli(['mcp', 'add', 'claude', '--cwd', root, '--json'], {
			env: { HOME: home },
			exec: fakeExec([]),
		});

		const written = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf8'));
		expect(written.mcpServers.other).toEqual({ command: 'other-server' });
		expect(written.unrelated).toEqual({ keep: true });
		expect(
			JSON.parse(readFileSync(path.join(home, '.claude.json.octane-backup'), 'utf8')).mcpServers
				.octane,
		).toBeUndefined();
	});

	it('treats an unparseable config as empty instead of crashing', async () => {
		// `~/.cursor/mcp.json` is commonly present but not valid JSON.
		const { root } = fixture();
		const home = fixture({ '.cursor/mcp.json': 'not json at all' }).root;

		const result = await runCli(['mcp', 'add', 'cursor', '--cwd', root, '--json'], {
			env: { HOME: home },
			exec: fakeExec([]),
		});

		expect(result.exitCode).toBe(0);
		expect(
			JSON.parse(readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8')).mcpServers.octane,
		).toBeTruthy();
	});

	it('writes VS Code servers under its own key', async () => {
		const { root } = fixture();
		await runCli(['mcp', 'add', 'vscode', '--scope', 'project', '--cwd', root, '--json'], {
			exec: fakeExec([]),
		});

		const written = JSON.parse(readFileSync(path.join(root, '.vscode', 'mcp.json'), 'utf8'));
		expect(written.servers.octane).toBeTruthy();
		expect(written.mcpServers).toBeUndefined();
		// VS Code discriminates transports on `type`; an entry without it is
		// rejected and the server never registers.
		expect(written.servers.octane.type).toBe('stdio');
	});

	it('does not put the VS Code transport tag in other clients', async () => {
		const { root } = fixture();
		const home = fixture().root;

		await runCli(['mcp', 'add', 'cursor', '--cwd', root, '--json'], {
			env: { HOME: home },
			exec: fakeExec([]),
		});

		const written = JSON.parse(readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8'));
		expect(written.mcpServers.octane.type).toBeUndefined();
	});

	it('is idempotent: a second run leaves the file byte-identical', async () => {
		const { root } = fixture();
		const home = fixture().root;
		const options = { env: { HOME: home }, exec: fakeExec([]) };
		const argv = ['mcp', 'add', 'cursor', '--cwd', root, '--json', '--force'];

		await runCli(argv, options);
		const first = readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8');
		await runCli(argv, options);

		expect(readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8')).toBe(first);
	});

	it('will not replace an existing entry unattended without --force', async () => {
		const { root } = fixture();
		const home = fixture({
			'.cursor/mcp.json': { mcpServers: { octane: { command: 'mine' } } },
		}).root;

		const result = await runCli(['mcp', 'add', 'cursor', '--cwd', root], {
			env: { HOME: home },
			exec: fakeExec([]),
		});

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toMatch(/--force/);
		expect(
			JSON.parse(readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8')).mcpServers.octane
				.command,
		).toBe('mine');
	});

	it('writes nothing under --dry-run', async () => {
		const { root } = fixture();
		const home = fixture().root;

		const result = await runCli(['mcp', 'add', 'cursor', '--cwd', root, '--dry-run', '--json'], {
			env: { HOME: home },
			exec: fakeExec([]),
		});

		expect(result.json().dryRun).toBe(true);
		expect(() => readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8')).toThrow();
	});

	it('rejects an unknown client', async () => {
		const { root } = fixture();
		const result = await runCli(['mcp', 'add', 'emacs', '--cwd', root], { exec: fakeExec([]) });
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toMatch(/Unknown client: emacs/);
	});

	it('sets OCTANE_REPO_ROOT only inside an octane checkout', async () => {
		const outside = fixture();
		const result = await runCli(['mcp', 'add', 'cursor', '--cwd', outside.root, '--json'], {
			exec: fakeExec([]),
		});
		expect(result.json().server.env).toBeUndefined();

		const checkout = fixture({
			'packages/octane/package.json': { name: 'octane', version: '0.1.17' },
		});
		const inside = await runCli(['mcp', 'add', 'cursor', '--cwd', checkout.root, '--json'], {
			exec: fakeExec([]),
		});
		expect(inside.json().server.env.OCTANE_REPO_ROOT).toBe(checkout.root);
	});
});

describe('octane mcp status', () => {
	it('reports where the server is registered', async () => {
		const { root } = fixture();
		const home = fixture({
			'.cursor/mcp.json': { mcpServers: { octane: { command: 'npx' } } },
		}).root;

		const report = (
			await runCli(['mcp', 'status', '--cwd', root, '--json'], {
				env: { HOME: home },
				exec: fakeExec([]),
			})
		).json();

		const cursor = report.clients.find(
			(/** @type {any} */ c) => c.client === 'cursor' && c.scope === 'user',
		);
		expect(cursor.configured).toBe(true);
		expect(report.clients.filter((/** @type {any} */ c) => c.configured)).toHaveLength(1);
	});
});

describe('octane mcp remove', () => {
	it('writes nothing under --dry-run', async () => {
		const { root } = fixture();
		const home = fixture({
			'.cursor/mcp.json': { mcpServers: { octane: { command: 'npx' } } },
		}).root;
		const before = readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8');

		const result = await runCli(['mcp', 'remove', 'cursor', '--cwd', root, '--dry-run', '--json'], {
			env: { HOME: home },
			exec: fakeExec([]),
		});

		expect(result.json().dryRun).toBe(true);
		expect(readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8')).toBe(before);
	});

	it('forwards the scope to the client CLI', async () => {
		// `claude mcp remove` without --scope clears whichever scope the entry
		// happens to be in, which need not be the one we just reported on.
		const { root, write } = fixture();
		write('.mcp.json', { mcpServers: { octane: { command: 'npx' } } });
		const exec = fakeExec(['claude']);

		await runCli(
			['mcp', 'remove', 'claude', '--scope', 'project', '--cwd', root, '--yes', '--json'],
			{
				exec,
			},
		);

		expect(exec.calls).toHaveLength(1);
		expect(exec.calls[0].args).toEqual(['mcp', 'remove', '--scope', 'project', 'octane']);
	});

	it('removes the entry and leaves the rest of the file alone', async () => {
		const { root } = fixture();
		const home = fixture({
			'.cursor/mcp.json': {
				mcpServers: { octane: { command: 'npx' }, other: { command: 'keep' } },
			},
		}).root;

		await runCli(['mcp', 'remove', 'cursor', '--cwd', root, '--yes', '--json'], {
			env: { HOME: home },
			exec: fakeExec([]),
		});

		const written = JSON.parse(readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8'));
		expect(written.mcpServers.octane).toBeUndefined();
		expect(written.mcpServers.other).toEqual({ command: 'keep' });
	});
});

describe('spliceTomlSection', () => {
	const CONFIG = '[tui]\ntheme = "dark"\n\n[projects."/tmp/a"]\ntrust_level = "trusted"\n';

	it('appends a section to a file that has none', () => {
		const next = spliceTomlSection(CONFIG, '[mcp_servers.octane]', ['command = "npx"']);
		expect(next).toContain('[tui]');
		expect(next).toContain('trust_level = "trusted"');
		expect(next.trimEnd().endsWith('command = "npx"')).toBe(true);
	});

	it('replaces an existing section without touching its neighbours', () => {
		const once = spliceTomlSection(CONFIG, '[mcp_servers.octane]', ['command = "old"']);
		const twice = spliceTomlSection(once, '[mcp_servers.octane]', ['command = "new"']);

		expect(twice).toContain('command = "new"');
		expect(twice).not.toContain('command = "old"');
		expect(twice).toContain('theme = "dark"');
		expect(twice.match(/\[mcp_servers\.octane\]/g)).toHaveLength(1);
	});

	it('removes a section', () => {
		const added = spliceTomlSection(CONFIG, '[mcp_servers.octane]', ['command = "npx"']);
		const removed = spliceTomlSection(added, '[mcp_servers.octane]', null);
		expect(removed).not.toContain('mcp_servers');
		expect(removed).toContain('[tui]');
	});

	it('round-trips: adding then removing restores the file byte-for-byte', () => {
		// The strongest guarantee available for a file we edit on the user's
		// behalf: after `mcp add` and `mcp remove`, their config is what it was.
		const added = spliceTomlSection(CONFIG, '[mcp_servers.octane]', ['command = "npx"']);
		const replaced = spliceTomlSection(added, '[mcp_servers.octane]', ['command = "new"']);

		expect(spliceTomlSection(replaced, '[mcp_servers.octane]', null)).toBe(CONFIG);
	});

	it('leaves blank lines inside an unrelated multi-line string alone', () => {
		// Replacing an existing section must not reformat the rest of the file.
		// A whitespace pass over the whole document reaches into this string and
		// silently rewrites user data that has nothing to do with MCP.
		const withBlock =
			'[mcp_servers.octane]\ncommand = "old"\n\n' +
			'[profile]\ninstructions = """\nline one\n\n\n\nline two\n"""\n';

		const next = spliceTomlSection(withBlock, '[mcp_servers.octane]', ['command = "npx"']);

		expect(next).toContain('line one\n\n\n\nline two');
		expect(next).toContain('command = "npx"');
		expect(next).not.toContain('command = "old"');
	});

	it('reads only its own section when a later server carries the key', () => {
		// An octane entry without `command` (an HTTP server, say) must not report
		// the next section's command as its own.
		const config =
			'[mcp_servers.octane]\nurl = "https://example.test/mcp"\n\n' +
			'[mcp_servers.other]\ncommand = "other-bin"\n';
		const codex = CLIENTS.find((entry) => entry.id === 'codex');

		expect(codex?.readServer(config, 'octane')).toEqual({ command: null });
		expect(codex?.readServer(config, 'other')).toEqual({ command: 'other-bin' });
		expect(codex?.readServer(config, 'absent')).toBe(null);
	});
});
