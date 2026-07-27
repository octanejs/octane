import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixture, runCli } from './helpers/fixture.js';

/** @type {{ cleanup: () => void }[]} */
const fixtures = [];

/**
 * @param {Record<string, string | object>} [files]
 */
function fixture(files = {}) {
	const created = createFixture({ 'package.json': { name: 'app', type: 'module' }, ...files });
	fixtures.push(created);
	return created;
}

afterEach(() => {
	while (fixtures.length > 0) fixtures.pop()?.cleanup();
});

/**
 * `git` reports whatever the test wants, and nothing is ever spawned.
 *
 * @param {{ dirty?: boolean }} [options]
 */
function gitExec({ dirty = false } = {}) {
	return {
		which: (/** @type {string} */ bin) => (bin === 'git' ? '/usr/bin/git' : null),
		run: async () => ({ code: 0, stdout: dirty ? ' M src/App.tsrx\n' : '', stderr: '' }),
	};
}

/**
 * @param {string} root
 * @param {string} file
 */
const read = (root, file) => readFileSync(path.join(root, file), 'utf8');

describe('octane init', () => {
	it('scaffolds a client-only app', async () => {
		const { root } = fixture();

		const result = await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install'], {
			exec: gitExec(),
		});

		expect(result.exitCode).toBe(0);
		expect(read(root, 'vite.config.ts')).toContain("from 'octane/compiler/vite'");
		expect(JSON.parse(read(root, 'tsconfig.json')).compilerOptions).toMatchObject({
			jsxImportSource: 'octane',
			plugins: [{ name: '@tsrx/typescript-plugin' }],
		});
		expect(JSON.parse(read(root, 'package.json')).scripts.typecheck).toContain('tsrx-tsc');
		// The SSR-only files belong to the other mode.
		expect(existsSync(path.join(root, 'octane.config.ts'))).toBe(false);
	});

	it('scaffolds a routed, server-rendered app with a matching entry file', async () => {
		const { root } = fixture();

		await runCli(['init', '--cwd', root, '--mode', 'fullstack', '--yes', '--no-install'], {
			exec: gitExec(),
		});

		expect(read(root, 'vite.config.ts')).toContain("from '@octanejs/vite-plugin'");
		expect(read(root, 'octane.config.ts')).toContain("entry: ['App', '/src/App.tsrx']");
		expect(existsSync(path.join(root, 'src/App.tsrx'))).toBe(true);
	});

	it('leaves the project doctor-clean apart from the packages it did not install', async () => {
		const { root } = fixture();
		await runCli(['init', '--cwd', root, '--mode', 'fullstack', '--yes', '--no-install'], {
			exec: gitExec(),
		});

		const report = (await runCli(['doctor', '--cwd', root, '--json'])).json();
		const failing = report.checks
			.filter((/** @type {any} */ c) => c.status === 'fail')
			.map((/** @type {any} */ c) => c.id);

		expect(failing).toEqual(['deps.octane-installed', 'deps.tsrx-toolchain']);
	});

	it('patches an existing tsconfig without discarding its comments', async () => {
		const { root } = fixture({
			'tsconfig.json': '{\n\t// keep this\n\t"compilerOptions": {\n\t\t"strict": true\n\t}\n}\n',
		});

		await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install'], {
			exec: gitExec(),
		});

		const tsconfig = read(root, 'tsconfig.json');
		expect(tsconfig).toContain('// keep this');
		expect(tsconfig).toContain('"strict": true');
		expect(tsconfig).toContain('"jsxImportSource": "octane"');
	});

	it('never overwrites a script the project already defines', async () => {
		const { root } = fixture({
			'package.json': { name: 'app', scripts: { build: 'my-custom-build' } },
		});

		await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install'], {
			exec: gitExec(),
		});

		const scripts = JSON.parse(read(root, 'package.json')).scripts;
		expect(scripts.build).toBe('my-custom-build');
		expect(scripts.dev).toBe('vite');
	});

	it('reports the edit for an existing bundler config instead of rewriting it', async () => {
		// An arbitrary user config cannot be rewritten reliably, so init states
		// the change and leaves the file alone.
		const original =
			"import react from '@vitejs/plugin-react';\nexport default { plugins: [react()] };\n";
		const { root } = fixture({ 'vite.config.ts': original });

		const result = await runCli(
			['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install', '--json'],
			{
				exec: gitExec(),
			},
		);

		expect(read(root, 'vite.config.ts')).toBe(original);
		expect(result.json().manual.join(' ')).toContain('octane/compiler/vite');
	});

	it("advises the plugin for the project's own bundler, not always Vite", async () => {
		// Naming the Vite plugin at an Rspack project wires the wrong plugin into
		// the wrong bundler.
		for (const [bundler, specifier] of [
			['rspack', '@octanejs/rspack-plugin'],
			['rsbuild', '@octanejs/rsbuild-plugin'],
			['vite', '@octanejs/vite-plugin'],
		]) {
			const { root } = fixture({ [`${bundler}.config.ts`]: 'export default { plugins: [] };\n' });
			const result = await runCli(
				['init', '--cwd', root, '--mode', 'fullstack', '--yes', '--no-install', '--json'],
				{ exec: gitExec() },
			);
			expect(result.json().manual.join(' '), bundler).toContain(specifier);
		}
	});

	it('scaffolds only what is correct for a non-Vite bundler', async () => {
		// @octanejs/rspack-plugin exports no defineConfig/RenderRoute, so an
		// octane.config.ts written for it cannot resolve; `vite`/`vite build`
		// scripts would also be wrong with no vite installed.
		const { root } = fixture({ 'rspack.config.ts': 'export default {};\n' });

		const result = await runCli(
			['init', '--cwd', root, '--mode', 'fullstack', '--yes', '--no-install', '--json'],
			{ exec: gitExec() },
		);

		expect(existsSync(path.join(root, 'octane.config.ts'))).toBe(false);
		const scripts = JSON.parse(read(root, 'package.json')).scripts;
		expect(scripts.typecheck).toContain('tsrx-tsc');
		expect(scripts.dev).toBeUndefined();
		expect(scripts.build).toBeUndefined();
		expect(result.json().manual.join(' ')).toContain('build-tools');
	});

	it('is idempotent', async () => {
		const { root } = fixture();
		const argv = ['init', '--cwd', root, '--mode', 'fullstack', '--yes', '--no-install', '--json'];

		await runCli(argv, { exec: gitExec() });
		const before = read(root, 'tsconfig.json');
		const second = await runCli(argv, { exec: gitExec() });

		expect(second.json().changes).toEqual([]);
		expect(read(root, 'tsconfig.json')).toBe(before);
	});

	it('refuses to write into a dirty tree without --force', async () => {
		const { root } = fixture();

		const result = await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes'], {
			exec: gitExec({ dirty: true }),
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch(/uncommitted changes/);
		expect(existsSync(path.join(root, 'vite.config.ts'))).toBe(false);
	});

	it('writes nothing under --dry-run', async () => {
		const { root } = fixture();

		const result = await runCli(['init', '--cwd', root, '--mode', 'spa', '--dry-run', '--json'], {
			exec: gitExec({ dirty: true }),
		});

		expect(result.json().dryRun).toBe(true);
		expect(existsSync(path.join(root, 'vite.config.ts'))).toBe(false);
	});

	it('requires --mode when it cannot prompt', async () => {
		const { root } = fixture();
		const result = await runCli(['init', '--cwd', root], { exec: gitExec() });

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toMatch(/--mode is required/);
	});
});
