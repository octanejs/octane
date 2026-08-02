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

/** Records what the CLI asked the package manager to install, and succeeds. */
function recordingExec() {
	/** @type {string[][]} */
	const args = [];
	return {
		args,
		exec: {
			which: (/** @type {string} */ bin) => (bin === 'git' ? '/usr/bin/git' : `/usr/bin/${bin}`),
			run: async (/** @type {string} */ file, /** @type {string[]} */ argv) => {
				if (file !== 'git') args.push(argv);
				return { code: 0, stdout: '', stderr: '' };
			},
		},
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

	it('scaffolds no pages into a project that brought its own route config', async () => {
		// The pages exist to serve the routes this command declares. A project with
		// its own octane.config.ts keeps it, and that config names its own entries,
		// so writing these files would leave components nothing routes to — and a
		// shared layout whose nav links to /counter and /api/health, two routes
		// that config never declared, so both 404. The rest of the wiring is
		// correct everywhere and still runs.
		const { root } = fixture({
			'octane.config.ts':
				'import { defineConfig, RenderRoute } from "@octanejs/vite-plugin";\n\n' +
				'export default defineConfig({\n' +
				'  router: { routes: [new RenderRoute({ path: "/", entry: ["App", "/src/App.tsrx"] })] },\n' +
				'});\n',
		});

		await runCli(['init', '--cwd', root, '--mode', 'fullstack', '--yes', '--no-install'], {
			exec: gitExec(),
		});

		for (const file of [
			'src/App.tsrx',
			'src/Layout.tsrx',
			'src/Counter.tsrx',
			'src/server/health.ts',
		]) {
			expect(existsSync(path.join(root, file)), file).toBe(false);
		}
		// Theirs, untouched.
		expect(read(root, 'octane.config.ts')).not.toContain('/counter');
		// The parts that are correct whatever the routing looks like still land.
		expect(read(root, 'vite.config.ts')).toContain('from "@octanejs/vite-plugin"');
		expect(JSON.parse(read(root, 'package.json')).scripts.typecheck).toContain('tsrx-tsc');
		// The shell is still written, because routing requires one — so the
		// stylesheet it links has to be written with it. See the case below.
		expect(read(root, 'index.html')).toContain('/src/styles.css');
		expect(existsSync(path.join(root, 'src/styles.css'))).toBe(true);
	});

	// The shell always links the stylesheet, so writing one without the other
	// leaves a tag pointing at a file that does not exist. The two paths that
	// reach it write no page at all, which is why guarding the stylesheet on the
	// pages alone is not enough.
	it.each([
		{
			name: 'fullstack keeps the project’s routing',
			mode: 'fullstack',
			files: {
				'octane.config.ts':
					'import { defineConfig, RenderRoute } from "@octanejs/vite-plugin";\n\n' +
					'export default defineConfig({\n' +
					'  router: { routes: [new RenderRoute({ path: "/", entry: ["App", "/src/App.tsrx"] })] },\n' +
					'});\n',
			},
		},
		{
			name: 'spa keeps the project’s entry component',
			mode: 'spa',
			files: { 'src/App.tsrx': 'export function App() @{\n  <main>theirs</main>\n}\n' },
		},
	])('writes the stylesheet its new shell links when $name', async ({ mode, files }) => {
		const { root } = fixture(files);

		await runCli(['init', '--cwd', root, '--mode', mode, '--yes', '--no-install'], {
			exec: gitExec(),
		});

		expect(read(root, 'index.html')).toContain('/src/styles.css');
		expect(read(root, 'src/styles.css')).toContain('--accent');
	});

	// The whole invariant rather than another single case: every scaffolded
	// component reads the theme tokens, so whenever `init` writes one of them the
	// stylesheet has to land too. The cases below vary which files the project
	// already owns, which is what decides the subset `init` still writes — and
	// each subset has been a separate escape at some point.
	it.each([
		{ name: 'an empty project', mode: 'fullstack', files: {} },
		{ name: 'an empty spa project', mode: 'spa', files: {} },
		{
			name: 'only the counter is missing',
			mode: 'fullstack',
			files: {
				'index.html':
					'<!doctype html>\n<html><head><!--ssr-head--></head>' +
					'<body><div id="root"><!--ssr-body--></div></body></html>\n',
				'src/App.tsrx': 'export function App() @{\n  <main>theirs</main>\n}\n',
				'src/Layout.tsrx': 'export function Layout(props) @{\n  <div>{props.children}</div>\n}\n',
			},
		},
		{
			name: 'the project owns the page but not the shell',
			mode: 'fullstack',
			files: { 'src/App.tsrx': 'export function App() @{\n  <main>theirs</main>\n}\n' },
		},
	])(
		'writes the theme tokens alongside any component it scaffolds, given $name',
		async ({ mode, files }) => {
			const { root } = fixture(files);

			await runCli(['init', '--cwd', root, '--mode', mode, '--yes', '--no-install'], {
				exec: gitExec(),
			});

			const components = ['src/App.tsrx', 'src/Layout.tsrx', 'src/Counter.tsrx'].filter(
				(file) => !(file in files) && existsSync(path.join(root, file)),
			);
			// The scenario has to actually scaffold something, or it proves nothing.
			expect(components.length, 'scaffolded no component').toBeGreaterThan(0);
			expect(existsSync(path.join(root, 'src/styles.css')), components.join(', ')).toBe(true);
		},
	);

	it('states the stylesheet tag to add when the project keeps its own page', async () => {
		// fullstack writes its entry component whether or not it writes the shell,
		// so on a project that already has an index.html the scaffolded page would
		// otherwise read theme tokens that nothing declares — every colour, border
		// and surface on it resolving to nothing. The stylesheet is still written;
		// only the tag linking it is the project's own file to edit.
		const { root } = fixture({
			'index.html':
				'<!doctype html>\n<html>\n\t<head>\n\t\t<!--ssr-head-->\n\t</head>\n' +
				'\t<body>\n\t\t<div id="root"><!--ssr-body--></div>\n\t</body>\n</html>\n',
		});

		const result = await runCli(
			['init', '--cwd', root, '--mode', 'fullstack', '--yes', '--no-install', '--json'],
			{ exec: gitExec() },
		);

		expect(read(root, 'src/styles.css')).toContain('--accent');
		expect(read(root, 'index.html')).not.toContain('stylesheet');
		expect(result.json().manual.join(' ')).toContain(
			'<link rel="stylesheet" href="/src/styles.css" />',
		);
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

	it('adds no component when it is keeping the entry that would import it', async () => {
		// The entry it writes is the one that imports App.tsrx. Keeping theirs
		// means keeping whatever theirs imports, so writing the component anyway
		// leaves a file nothing references.
		const { root } = fixture({ 'src/main.ts': "import { mount } from './mine';\nmount();\n" });

		await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install'], {
			exec: gitExec(),
		});

		expect(existsSync(path.join(root, 'src/App.tsrx'))).toBe(false);
		// The page it needed is still missing, and that one it does write.
		expect(read(root, 'index.html')).toContain('src="/src/main.ts"');
	});

	it('installs with the manager it was told to use', async () => {
		// Detection reads a lockfile, and a project that has never been installed
		// has none. Without a way to say so, the fallback writes the wrong kind of
		// lockfile into a brand-new project.
		const { root } = fixture();
		/** @type {string[][]} */
		const ran = [];
		const exec = {
			which: (/** @type {string} */ bin) => (bin === 'git' ? '/usr/bin/git' : `/usr/bin/${bin}`),
			run: async (/** @type {string} */ file, /** @type {string[]} */ args) => {
				if (file !== 'git') ran.push([file, ...args]);
				return { code: 0, stdout: '', stderr: '' };
			},
		};

		await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes', '--package-manager', 'pnpm'], {
			exec,
		});

		expect(ran.length).toBeGreaterThan(0);
		expect(ran.every(([file]) => file === 'pnpm')).toBe(true);
		// `add`, not `install`: that is how pnpm spells it.
		expect(ran[0]).toContain('add');
	});

	it('rejects a package manager it cannot drive', async () => {
		const { root } = fixture();

		const result = await runCli(
			['init', '--cwd', root, '--mode', 'spa', '--yes', '--package-manager', 'cargo'],
			{ exec: gitExec() },
		);

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain('pnpm, npm, yarn, bun');
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

	it('installs TypeScript at the range the toolchain declares', async () => {
		// `typescript` is a required peer of the plugin that ships `tsrx-tsc`, and
		// nothing in the toolchain carries a compiler of its own. npm and pnpm
		// install a required peer themselves, so this is redundant there; yarn
		// does not, and without it `yarn create octane` leaves a project whose
		// typecheck script dies on `Cannot find module 'typescript'`.
		const { root } = fixture(
			installed('@tsrx/typescript-plugin', '0.3.118', {
				peerDependencies: { typescript: '^5.9.3' },
			}),
		);
		const recorder = recordingExec();

		await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes'], { exec: recorder.exec });

		const requested = recorder.args.flat();
		expect(requested).toContain('typescript@^5.9.3');
		// Never bare: that resolves to the newest major, which `tsrx-tsc` cannot
		// start under, which is how a fresh scaffold ends up unable to typecheck.
		expect(requested).not.toContain('typescript');
	});

	it('leaves a TypeScript the project already declares alone', async () => {
		const { root } = fixture({
			'package.json': {
				name: 'app',
				type: 'module',
				devDependencies: { typescript: '5.9.3' },
			},
			...installed('@tsrx/typescript-plugin', '0.3.118', {
				peerDependencies: { typescript: '^5.9.3' },
			}),
		});
		const recorder = recordingExec();

		await runCli(['init', '--cwd', root, '--mode', 'spa', '--yes'], { exec: recorder.exec });

		// Matched as a whole argument: `@tsrx/typescript-plugin` is on every one of
		// these lines and contains the word.
		expect(recorder.args.flat().filter((arg) => /^typescript(@|$)/.test(arg))).toEqual([]);
	});

	it('names TypeScript in the manual list when it installs nothing', async () => {
		// The range lives inside a plugin that was never installed, so it cannot
		// be quoted here. Saying the name without it would send people to the
		// major that cannot run.
		const { root } = fixture();

		const result = await runCli(
			['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install', '--json'],
			{ exec: gitExec() },
		);

		expect(result.json().manual.join(' ')).toContain('typescript');
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

	it('follows the prettier field of package.json to the config it points at', async () => {
		// The field holds either the settings or a path to them. Searching the
		// path itself for the plugin name asks the wrong file, which both misses a
		// plugin that is registered and names a package.json field to add it to.
		const { root } = fixture({
			'package.json': { name: 'app', type: 'module', prettier: './config/prettier.json' },
			'config/prettier.json': { plugins: ['@tsrx/prettier-plugin'] },
		});

		const result = await runCli(
			['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install', '--json'],
			{ exec: gitExec() },
		);

		expect(result.json().manual.join(' ')).not.toContain('Prettier plugins');
	});

	it('names the file to edit, not the field that points at it', async () => {
		const { root } = fixture({
			'package.json': { name: 'app', type: 'module', prettier: './config/prettier.json' },
			'config/prettier.json': { singleQuote: true },
		});

		const result = await runCli(
			['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install', '--json'],
			{ exec: gitExec() },
		);

		const note = result
			.json()
			.manual.find((/** @type {string} */ line) => line.includes('@tsrx/prettier-plugin'));
		expect(note).toContain(path.join('config', 'prettier.json'));
		expect(note).not.toContain('package.json');
	});

	it('picks the config file Prettier would, when a project has several', async () => {
		// The first name in the list that exists is the one Prettier reads, so the
		// list has to be in its order. `.prettierrc.js` beats `.prettierrc.toml`,
		// which sorts last of all of them rather than with the other data formats.
		const withPlugin = 'plugins: ["@tsrx/prettier-plugin"]\n';

		// Reading the wrong file here means staying quiet about a project whose
		// active config cannot parse .tsrx.
		const quiet = fixture({
			'.prettierrc.toml': '# theirs\n',
			'.prettierrc.js': `export default { ${withPlugin} };\n`,
		});
		const quietResult = await runCli(
			['init', '--cwd', quiet.root, '--mode', 'spa', '--yes', '--no-install', '--json'],
			{ exec: gitExec() },
		);
		expect(quietResult.json().manual.join(' ')).not.toContain('Prettier plugins');

		// And the other way: the instruction has to name the file that is actually
		// in force, not whichever one happens to be found first.
		const noisy = fixture({
			'.prettierrc.toml': withPlugin,
			'.prettierrc.js': 'export default { singleQuote: true };\n',
		});
		const noisyResult = await runCli(
			['init', '--cwd', noisy.root, '--mode', 'spa', '--yes', '--no-install', '--json'],
			{ exec: gitExec() },
		);
		expect(noisyResult.json().manual.join(' ')).toContain('.prettierrc.js');
	});

	it('reads the config Prettier would, when a project has two', async () => {
		// package.json comes first in Prettier's search order, ahead of every
		// config file. Reading the file instead approves a config Prettier never
		// loads and leaves .tsrx unparseable by the one it does.
		const { root } = fixture({
			'package.json': { name: 'app', type: 'module', prettier: { singleQuote: true } },
			'.prettierrc': '{\n\t"plugins": ["@tsrx/prettier-plugin"]\n}\n',
		});

		const result = await runCli(
			['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install', '--json'],
			{ exec: gitExec() },
		);

		expect(result.json().manual.join(' ')).toContain('the prettier field of package.json');
	});

	it('says it cannot check a shared config rather than guessing at one', async () => {
		// Resolving a bare specifier is the package manager's job. Claiming the
		// plugin is missing would be a guess, and so would staying quiet.
		const { root } = fixture({
			'package.json': { name: 'app', type: 'module', prettier: '@acme/prettier-config' },
		});

		const result = await runCli(
			['init', '--cwd', root, '--mode', 'spa', '--yes', '--no-install', '--json'],
			{ exec: gitExec() },
		);

		expect(result.json().manual.join(' ')).toContain('@acme/prettier-config');
		expect(existsSync(path.join(root, '.prettierrc'))).toBe(false);
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
