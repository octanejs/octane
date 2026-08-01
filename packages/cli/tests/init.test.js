import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixture, installed, runCli } from './helpers/fixture.js';

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
		expect(read(root, 'vite.config.ts')).toContain('from "octane/compiler/vite"');
		expect(JSON.parse(read(root, 'tsconfig.json')).compilerOptions).toMatchObject({
			jsxImportSource: 'octane',
			plugins: [{ name: '@tsrx/typescript-plugin' }],
		});
		expect(JSON.parse(read(root, 'package.json')).scripts.typecheck).toContain('tsrx-tsc');
		// A wired-up bundler still serves nothing without a page and an entry to
		// mount, so `vite` has to have something to open.
		expect(read(root, 'index.html')).toContain('<script type="module" src="/src/main.ts">');
		expect(read(root, 'src/main.ts')).toContain('createRoot');
		expect(read(root, 'src/App.tsrx')).toContain('export function App()');
		// The SSR-only files belong to the other mode.
		expect(existsSync(path.join(root, 'octane.config.ts'))).toBe(false);
	});

	it('scaffolds a routed, server-rendered app with a matching entry file', async () => {
		const { root } = fixture();

		await runCli(['init', '--cwd', root, '--mode', 'fullstack', '--yes', '--no-install'], {
			exec: gitExec(),
		});

		expect(read(root, 'vite.config.ts')).toContain('from "@octanejs/vite-plugin"');
		// The route entry the config names has to exist, or the build resolves
		// nothing.
		expect(read(root, 'octane.config.ts')).toContain('entry: ["App", "/src/App.tsrx"]');
		expect(existsSync(path.join(root, 'src/App.tsrx'))).toBe(true);

		// The production build refuses to run without a template, and refuses a
		// template that does not carry both markers.
		const html = read(root, 'index.html');
		expect(html).toContain('<!--ssr-head-->');
		expect(html).toContain('<!--ssr-body-->');
		// The plugin owns hydration, so a second entry script here would compete
		// with the one it injects.
		expect(html).not.toContain('<script type="module"');
		expect(existsSync(path.join(root, 'src/main.ts'))).toBe(false);
	});

	it('states the markers an existing page is missing instead of editing it', async () => {
		const { root } = fixture({
			'index.html':
				'<!doctype html>\n<html>\n\t<body>\n\t\t<div id="root"></div>\n\t</body>\n</html>\n',
		});

		const result = await runCli(
			['init', '--cwd', root, '--mode', 'fullstack', '--yes', '--no-install', '--json'],
			{ exec: gitExec() },
		);

		// Splicing markers into someone's own HTML is the same guesswork as
		// rewriting their bundler config, so init says what to add and stops.
		expect(read(root, 'index.html')).not.toContain('ssr-head');
		expect(result.json().manual.join(' ')).toContain('<!--ssr-head-->');
	});

	it('adds no orphan component to a client project that already has its own page', async () => {
		// The project's own index.html names its own entry, so a component this
		// command invented would sit there unreferenced.
		const { root } = fixture({
			'index.html':
				'<!doctype html>\n<html>\n\t<body>\n\t\t<div id="app"></div>\n\t\t<script type="module" src="/src/boot.ts"></script>\n\t</body>\n</html>\n',
		});

		await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install'], {
			exec: gitExec(),
		});

		expect(existsSync(path.join(root, 'src/App.tsrx'))).toBe(false);
		expect(existsSync(path.join(root, 'src/main.ts'))).toBe(false);
	});

	it('keeps a client entry the project already has', async () => {
		// A project can have lost its index.html and still own the entry that used
		// to be loaded from it, and overwriting that is not a scaffold's call.
		const original = "import { mount } from './mine';\nmount();\n";
		const { root } = fixture({ 'src/main.ts': original });

		await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install'], {
			exec: gitExec(),
		});

		expect(read(root, 'src/main.ts')).toBe(original);
	});

	it('recognises every config name Prettier itself resolves', async () => {
		// Missing one means writing a second config that shadows theirs, since
		// `.prettierrc` wins the search order over most of the others.
		for (const file of ['.prettierrc.toml', '.prettierrc.mts', 'prettier.config.cts']) {
			const { root } = fixture({ [file]: '# theirs\n' });

			await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install'], {
				exec: gitExec(),
			});

			expect(existsSync(path.join(root, '.prettierrc')), file).toBe(false);
		}
	});

	it('leaves TypeScript to the toolchain that carries its own', async () => {
		// Naming it installs the newest release, which is not necessarily one
		// `tsrx-tsc` can start under, and nothing in a scaffolded project reads a
		// workspace copy: the typechecker and the Prettier plugin each bring one.
		const { root } = fixture();

		const result = await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes', '--json'], {
			exec: gitExec(),
		});

		expect(result.json().installed).not.toContain('typescript');
	});

	it('registers the Prettier plugin, without which .tsrx cannot be parsed', async () => {
		const { root } = fixture();

		const result = await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes', '--json'], {
			exec: gitExec(),
		});

		expect(JSON.parse(read(root, '.prettierrc')).plugins).toEqual(['@tsrx/prettier-plugin']);
		expect(result.json().installed).toEqual(
			expect.arrayContaining(['prettier', '@tsrx/prettier-plugin']),
		);
	});

	it('states the Prettier edit for a project that already has its own config', async () => {
		// Formatting config comes in JSON, YAML and JavaScript, so rewriting it is
		// the same guesswork as rewriting a bundler config.
		const original = '{\n\t"singleQuote": true\n}\n';
		const { root } = fixture({ '.prettierrc': original });

		const result = await runCli(
			['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install', '--json'],
			{ exec: gitExec() },
		);

		expect(read(root, '.prettierrc')).toBe(original);
		expect(result.json().manual.join(' ')).toContain('@tsrx/prettier-plugin');
	});

	it('stays quiet when the Prettier plugin is already registered', async () => {
		const { root } = fixture({
			'.prettierrc': '{\n\t"plugins": ["@tsrx/prettier-plugin"]\n}\n',
		});

		const result = await runCli(
			['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install', '--json'],
			{ exec: gitExec() },
		);

		expect(result.json().manual.join(' ')).not.toContain('Prettier plugins');
	});

	it('honours --yes on a terminal, where people actually type it', async () => {
		// It used to be consulted only off-TTY, so the flag did nothing in a real
		// shell, and anything wanting an unattended run had to pretend there was
		// no terminal. Without the fix this blocks on the confirm prompt.
		const { root } = fixture();

		const result = await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install'], {
			exec: gitExec(),
			tty: true,
			env: { NO_COLOR: '', CI: '' },
		});

		expect(result.exitCode).toBe(0);
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
