import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './helpers/fixture.js';

/** @type {string[]} */
const roots = [];

/** A directory with nothing in it, which is what this command starts from. */
function workspace() {
	const root = mkdtempSync(path.join(tmpdir(), 'octane-create-'));
	roots.push(root);
	return root;
}

afterEach(() => {
	while (roots.length > 0) {
		rmSync(/** @type {string} */ (roots.pop()), { recursive: true, force: true });
	}
});

/**
 * `--yes` answers the one confirm the scaffold asks. Without it a run with no
 * terminal is a usage error rather than a silent assumption, which two of the
 * tests below rely on.
 *
 * @param {string[]} argv
 * @param {Parameters<typeof runCli>[1]} [options]
 */
const create = (argv, options) => runCli(['create', ...argv], options);

/**
 * @param {string} root
 * @param {string} file
 */
const read = (root, file) => readFileSync(path.join(root, file), 'utf8');

describe('octane create', () => {
	it('creates a client-only app that has something to render', async () => {
		const cwd = workspace();

		const result = await create([
			'my-app',
			'--cwd',
			cwd,
			'--template',
			'spa',
			'--yes',
			'--no-install',
		]);
		const app = path.join(cwd, 'my-app');

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(read(app, 'package.json')).name).toBe('my-app');
		expect(read(app, 'vite.config.ts')).toContain('from "octane/compiler/vite"');
		expect(read(app, 'index.html')).toContain('<script type="module" src="/src/main.ts">');
		// The starter never reuses its root, so a chained mount lets production
		// builds discard the generic reusable-root machinery.
		expect(read(app, 'src/main.ts')).toContain(
			'createRoot(document.getElementById("root")!).render(App)',
		);
		expect(read(app, 'src/App.tsrx')).toContain('export function App()');
		// The landing page is the app: it links into the documentation rather than
		// leaving a placeholder to delete, and it mounts standalone, because this
		// template has one page and so no shared frame to route through.
		expect(read(app, 'src/App.tsrx')).toContain('https://octanejs.dev/docs/quick-start');
		expect(read(app, 'src/App.tsrx')).not.toContain('Layout.tsrx');
		// The theme tokens the page reads, and the shell tag that resolves them.
		// Linked rather than imported: a CSS import is injected by JavaScript in
		// dev, so the tokens would land after the markup that reads them.
		expect(read(app, 'src/styles.css')).toContain('--accent');
		expect(read(app, 'index.html')).toContain('<link rel="stylesheet" href="/src/styles.css" />');
		// The SSR files belong to the other template.
		expect(existsSync(path.join(app, 'octane.config.ts'))).toBe(false);
		expect(existsSync(path.join(app, 'src/Layout.tsrx'))).toBe(false);
		expect(existsSync(path.join(app, 'src/Counter.tsrx'))).toBe(false);
		expect(existsSync(path.join(app, 'src/server/health.ts'))).toBe(false);
	});

	it('creates a routed, server-rendered app whose template carries the SSR markers', async () => {
		const cwd = workspace();

		const result = await create([
			'my-app',
			'--cwd',
			cwd,
			'--template',
			'fullstack',
			'--yes',
			'--no-install',
		]);
		const app = path.join(cwd, 'my-app');
		const html = read(app, 'index.html');

		expect(result.exitCode).toBe(0);
		expect(html).toContain('<!--ssr-head-->');
		expect(html).toContain('<!--ssr-body-->');
		// The plugin injects hydration itself, so a hand-written entry here would
		// be a second, competing one.
		expect(html).not.toContain('<script type="module"');
		expect(existsSync(path.join(app, 'src/main.ts'))).toBe(false);

		// Every route the config declares resolves to a file that exports what the
		// route names. A route entry naming a missing export renders the wrong
		// component or fails at request time, and `octane doctor` reports exactly
		// this pairing, so the scaffold has to satisfy it on the way out.
		const config = read(app, 'octane.config.ts');
		expect(config).toContain('new RenderRoute({ path: "/", entry: ["App", "/src/App.tsrx"] })');
		expect(config).toContain(
			'new RenderRoute({ path: "/counter", entry: ["Counter", "/src/Counter.tsrx"] })',
		);
		expect(config).toContain('new ServerRoute({ path: "/api/health", handler: health })');
		expect(read(app, 'src/App.tsrx')).toContain('export function App()');
		expect(read(app, 'src/Counter.tsrx')).toContain('export function Counter()');
		expect(read(app, 'src/server/health.ts')).toContain('export function health()');

		// Both pages render through the one frame, which is why it is scaffolded
		// at all — writing either without it leaves an import that cannot resolve.
		expect(read(app, 'src/Layout.tsrx')).toContain('export function Layout(');
		expect(read(app, 'src/App.tsrx')).toContain('from "./Layout.tsrx"');
		expect(read(app, 'src/Counter.tsrx')).toContain('from "./Layout.tsrx"');

		expect(read(app, 'src/styles.css')).toContain('--accent');
		expect(html).toContain('<link rel="stylesheet" href="/src/styles.css" />');
	});

	it('scaffolds inside a working tree that has unrelated changes', async () => {
		// `init` refuses a dirty tree so `git diff` stays a usable review of what
		// it wrote. That reasoning is about a project someone already has, and a
		// directory made a moment ago holds nothing of theirs to review.
		const cwd = workspace();
		writeFileSync(path.join(cwd, 'dirty.txt'), 'uncommitted\n');

		const result = await create([
			'my-app',
			'--cwd',
			cwd,
			'--template',
			'spa',
			'--yes',
			'--no-install',
		]);

		expect(result.exitCode).toBe(0);
		expect(existsSync(path.join(cwd, 'my-app/index.html'))).toBe(true);
	});

	it('reports a name that lands on a file instead of throwing ENOTDIR', async () => {
		const cwd = workspace();
		writeFileSync(path.join(cwd, 'my-app'), 'not a directory\n');

		const result = await create([
			'my-app',
			'--cwd',
			cwd,
			'--template',
			'spa',
			'--yes',
			'--no-install',
		]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain('is not a directory');
		expect(read(cwd, 'my-app')).toBe('not a directory\n');
	});

	it('scaffolds into a directory holding nothing but a fresh repository', async () => {
		// `mkdir app && cd app && git init` is a common way to start, and a
		// repository with nothing in it holds no work of theirs to protect.
		const cwd = workspace();
		mkdirSync(path.join(cwd, 'my-app/.git'), { recursive: true });

		const result = await create([
			'my-app',
			'--cwd',
			cwd,
			'--template',
			'spa',
			'--yes',
			'--no-install',
		]);

		expect(result.exitCode).toBe(0);
		expect(existsSync(path.join(cwd, 'my-app/index.html'))).toBe(true);
		expect(existsSync(path.join(cwd, 'my-app/.git'))).toBe(true);
	});

	it('creates the parents a nested name needs', async () => {
		const cwd = workspace();

		const result = await create([
			'apps/web',
			'--cwd',
			cwd,
			'--template',
			'spa',
			'--yes',
			'--no-install',
		]);

		expect(result.exitCode).toBe(0);
		expect(existsSync(path.join(cwd, 'apps/web/index.html'))).toBe(true);
		// The manifest is named for the directory, not for the path to it.
		expect(JSON.parse(read(path.join(cwd, 'apps/web'), 'package.json')).name).toBe('web');
	});

	it('leaves nothing behind, including the parents it made', async () => {
		// `--dry-run` is the reachable half of "nothing was written": it reports
		// the plan and applies none of it, the same state declining the confirm
		// leaves. Undoing only the leaf would leave `apps` standing and empty,
		// which is not nothing, and would make the obvious retry harder to reason
		// about than a clean directory.
		const cwd = workspace();

		const result = await create(['apps/web', '--cwd', cwd, '--template', 'spa', '--dry-run']);

		expect(result.exitCode).toBe(0);
		expect(readdirSync(cwd)).toEqual([]);
	});

	it('refuses a directory that already has something in it', async () => {
		const cwd = workspace();
		mkdirSync(path.join(cwd, 'my-app'), { recursive: true });
		writeFileSync(path.join(cwd, 'my-app/keep.txt'), 'mine\n');

		const result = await create([
			'my-app',
			'--cwd',
			cwd,
			'--template',
			'spa',
			'--yes',
			'--no-install',
		]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain('is not empty');
		expect(read(cwd, 'my-app/keep.txt')).toBe('mine\n');
	});

	it('keeps the scaffold when only the install failed', async () => {
		// The files are written before anything is installed, so a failed install
		// leaves a project that needs one command to finish. Removing it because
		// the exit code was non-zero would throw that away.
		const cwd = workspace();
		const failing = {
			which: () => '/usr/bin/npm',
			run: async () => ({ code: 1, stdout: '', stderr: 'network is down' }),
		};

		const result = await create(['my-app', '--cwd', cwd, '--template', 'spa', '--yes'], {
			exec: failing,
		});

		expect(result.exitCode).not.toBe(0);
		expect(existsSync(path.join(cwd, 'my-app/index.html'))).toBe(true);
		expect(existsSync(path.join(cwd, 'my-app/src/App.tsrx'))).toBe(true);
	});

	it('installs with the package manager that ran it', async () => {
		// The directory is new, so there is no lockfile to read. Left to the
		// fallback, `pnpm create` would install through npm and answer with the
		// wrong kind of lockfile.
		const cwd = workspace();
		/** @type {string[][]} */
		const ran = [];
		const exec = {
			which: () => '/usr/bin/pnpm',
			run: async (/** @type {string} */ file, /** @type {string[]} */ args) => {
				ran.push([file, ...args]);
				return { code: 0, stdout: '', stderr: '' };
			},
		};

		const result = await create(['my-app', '--cwd', cwd, '--template', 'spa', '--yes'], {
			env: { npm_config_user_agent: 'pnpm/9.1.0 npm/? node/v22.0.0 darwin arm64' },
			exec,
		});

		expect(result.exitCode).toBe(0);
		expect(ran.map(([file]) => file)).toEqual(['pnpm', 'pnpm']);
		// `add`, not `install`: that is how pnpm spells it.
		expect(ran[0]).toContain('add');
		expect(result.stdout).toContain('pnpm run dev');
	});

	it('falls back to npm when nothing says which manager ran it', async () => {
		const cwd = workspace();

		const result = await create([
			'my-app',
			'--cwd',
			cwd,
			'--template',
			'spa',
			'--yes',
			'--no-install',
		]);

		expect(result.stdout).toContain('npm run dev');
	});

	it('offers no install that would install nothing', async () => {
		// Dependencies are recorded by handing them to the package manager, so
		// skipping that leaves the manifest with none in it. A bare `install` then
		// resolves an empty manifest and the dev server fails on a missing octane.
		const cwd = workspace();

		const result = await create([
			'my-app',
			'--cwd',
			cwd,
			'--template',
			'spa',
			'--yes',
			'--no-install',
		]);

		expect(JSON.parse(read(path.join(cwd, 'my-app'), 'package.json')).dependencies).toBeUndefined();
		const next = result.stdout.slice(result.stdout.indexOf('Next'));
		expect(next).not.toMatch(/^\s*(?:npm|pnpm|yarn|bun) install$/m);
		// The packages to install were already named in the report above.
		expect(result.stdout).toContain('Do this by hand');
	});

	it('quotes a directory name that a shell would not survive', async () => {
		// The name is whatever they typed, and this command accepts spaces in it.
		// An unquoted `cd My App!` is a next step that fails when pasted.
		const cwd = workspace();

		const result = await create([
			'My App!',
			'--cwd',
			cwd,
			'--template',
			'spa',
			'--yes',
			'--no-install',
		]);

		expect(result.stdout).toContain("cd 'My App!'");
	});

	it('writes a dash-prefixed name so cd reads it as a name', async () => {
		// `cd` parses its argument for options before anything else, so quoting is
		// not enough here: `cd '-app'` fails exactly like `cd -app`, and a lone
		// `cd -` quietly goes to the previous directory instead.
		const cwd = workspace();

		const result = await create(['-', '--cwd', cwd, '--template', 'spa', '--yes', '--no-install']);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('cd ./-');
		expect(result.stdout).not.toMatch(/cd -$/m);
	});

	it('turns a directory name npm would reject into one it accepts', async () => {
		const cwd = workspace();

		await create(['My App!', '--cwd', cwd, '--template', 'spa', '--yes', '--no-install']);

		expect(JSON.parse(read(path.join(cwd, 'My App!'), 'package.json')).name).toBe('my-app');
	});

	it('takes the offered default when there is no name and nobody to ask', async () => {
		const cwd = workspace();

		const result = await create(['--cwd', cwd, '--template', 'spa', '--yes', '--no-install']);

		expect(result.exitCode).toBe(0);
		expect(existsSync(path.join(cwd, 'octane-app/index.html'))).toBe(true);
	});

	it('answers every question with --yes on a terminal, not just the confirm', async () => {
		// `--yes` is documented as accepting every prompt with its default. It
		// reached the confirm and stopped there, so on a real terminal this still
		// blocked on the name and the template, which is the one place people
		// type the flag by hand. Without the fix this test hangs rather than
		// fails.
		const cwd = workspace();

		const result = await create(['--cwd', cwd, '--yes', '--no-install'], {
			tty: true,
			env: { NO_COLOR: '', CI: '' },
		});

		expect(result.exitCode).toBe(0);
		// The offered name, and the offered template with it.
		expect(existsSync(path.join(cwd, 'octane-app/index.html'))).toBe(true);
		expect(existsSync(path.join(cwd, 'octane-app/octane.config.ts'))).toBe(false);
	});

	it('asks for a directory rather than guessing one', async () => {
		// Without `--yes` there is nothing standing in for the answer, and picking
		// a name on someone's behalf is not this command's call.
		const result = await create(['--cwd', workspace(), '--template', 'spa', '--no-install']);

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain('<directory>');
	});

	it('will not hang on a prompt where nobody can answer it', async () => {
		const result = await create(['my-app', '--cwd', workspace(), '--no-install']);

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain('--template');
	});

	it('rejects a template it does not have', async () => {
		const result = await create([
			'my-app',
			'--cwd',
			workspace(),
			'--template',
			'islands',
			'--yes',
			'--no-install',
		]);

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain('spa, fullstack');
	});

	it('rejects a second directory instead of taking it for a flag value', async () => {
		const result = await create([
			'my-app',
			'other',
			'--cwd',
			workspace(),
			'--template',
			'spa',
			'--yes',
			'--no-install',
		]);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain('other');
	});
});
