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
import { DEFAULT_DIRECTORY, create, parseArgv } from '../src/create.js';

/** @type {string[]} */
const roots = [];

function workspace() {
	const root = mkdtempSync(path.join(tmpdir(), 'create-octane-'));
	roots.push(root);
	return root;
}

afterEach(() => {
	while (roots.length > 0) {
		rmSync(/** @type {string} */ (roots.pop()), { recursive: true, force: true });
	}
});

/** A writable that keeps what was written to it. */
function sink() {
	const chunks = { text: '' };
	return {
		chunks,
		stream: /** @type {any} */ ({
			write: (/** @type {string} */ chunk) => {
				chunks.text += chunk;
				return true;
			},
		}),
	};
}

/**
 * Run the command against a throwaway directory, capturing both streams.
 * `tty: false` pins the CLI's non-interactive path, so a missing flag can never
 * block the suite on a prompt.
 *
 * @param {string[]} argv
 * @param {string} cwd
 */
async function run(argv, cwd, overrides = {}) {
	const out = sink();
	const err = sink();

	const exitCode = await create(argv, {
		cwd,
		// Pinned rather than inherited: neither the terminal the suite happens to
		// run on nor a CI variable in its environment may decide which path is
		// under test.
		tty: false,
		env: {},
		stdout: out.stream,
		stderr: err.stream,
		cli: { tty: false, stdout: out.stream, stderr: err.stream },
		...overrides,
	});

	return { exitCode, stdout: out.chunks.text, stderr: err.chunks.text };
}

/**
 * Answers the questions without a terminal, and records what was asked.
 *
 * @param {{ text?: string | null, select?: string | null }} answers
 */
function fakePrompts(answers) {
	/** @type {string[]} */
	const asked = [];
	return {
		asked,
		prompts: {
			cancel: () => {},
			text: async (/** @type {{ message: string }} */ options) => {
				asked.push(options.message);
				return answers.text ?? null;
			},
			select: async (/** @type {{ message: string }} */ options) => {
				asked.push(options.message);
				return answers.select ?? null;
			},
		},
	};
}

/**
 * @param {string} root
 * @param {string} file
 */
const read = (root, file) => readFileSync(path.join(root, file), 'utf8');

describe('create-octane', () => {
	it('creates a client-only app that has something to render', async () => {
		const cwd = workspace();

		const result = await run(['my-app', '--template', 'spa', '--no-install'], cwd);
		const app = path.join(cwd, 'my-app');

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(read(app, 'package.json')).name).toBe('my-app');
		expect(read(app, 'vite.config.ts')).toContain('from "octane/compiler/vite"');
		expect(read(app, 'index.html')).toContain('<script type="module" src="/src/main.ts">');
		expect(read(app, 'src/main.ts')).toContain('createRoot');
		expect(read(app, 'src/App.tsrx')).toContain('export function App()');
		// The SSR files belong to the other template.
		expect(existsSync(path.join(app, 'octane.config.ts'))).toBe(false);
	});

	it('creates a routed, server-rendered app whose template carries the SSR markers', async () => {
		const cwd = workspace();

		const result = await run(['my-app', '--template', 'fullstack', '--no-install'], cwd);
		const app = path.join(cwd, 'my-app');
		const html = read(app, 'index.html');

		expect(result.exitCode).toBe(0);
		expect(html).toContain('<!--ssr-head-->');
		expect(html).toContain('<!--ssr-body-->');
		// The plugin injects hydration itself, so a hand-written entry here would
		// be a second, competing one.
		expect(html).not.toContain('<script type="module"');
		expect(existsSync(path.join(app, 'src/main.ts'))).toBe(false);
		expect(read(app, 'octane.config.ts')).toContain('RenderRoute');
		expect(read(app, 'src/App.tsrx')).toContain('export function App()');
	});

	it('scaffolds inside a working tree that has unrelated changes', async () => {
		const cwd = workspace();
		// A directory created a moment ago holds nothing of the user's to review,
		// so uncommitted work elsewhere must not stop the scaffold.
		writeFileSync(path.join(cwd, 'dirty.txt'), 'uncommitted\n');

		const result = await run(['my-app', '--template', 'spa', '--no-install'], cwd);

		expect(result.exitCode).toBe(0);
		expect(existsSync(path.join(cwd, 'my-app/index.html'))).toBe(true);
	});

	it('refuses a directory that already has something in it', async () => {
		const cwd = workspace();
		mkdirSync(path.join(cwd, 'my-app'), { recursive: true });
		writeFileSync(path.join(cwd, 'my-app/keep.txt'), 'mine\n');

		const result = await run(['my-app', '--template', 'spa', '--no-install'], cwd);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain('is not empty');
		expect(read(cwd, 'my-app/keep.txt')).toBe('mine\n');
	});

	it('keeps the scaffold when only the install failed', async () => {
		// init writes the files before it installs anything, so a failed install
		// leaves a project that needs one command to finish. Removing it because
		// the exit code was non-zero would throw that away.
		const cwd = workspace();
		const failing = {
			which: () => '/usr/bin/npm',
			run: async () => ({ code: 1, stdout: '', stderr: 'network is down' }),
		};

		const result = await run(['my-app', '--template', 'spa'], cwd, {
			cli: { tty: false, exec: failing },
		});

		expect(result.exitCode).not.toBe(0);
		expect(existsSync(path.join(cwd, 'my-app/index.html'))).toBe(true);
		expect(existsSync(path.join(cwd, 'my-app/src/App.tsrx'))).toBe(true);
	});

	it('asks for a name and a template when it is given neither', async () => {
		const cwd = workspace();
		const { asked, prompts } = fakePrompts({ text: 'my-app', select: 'fullstack' });

		const result = await run(['--no-install'], cwd, { tty: true, prompts });

		expect(result.exitCode).toBe(0);
		expect(asked).toEqual(['Project name', 'Which template?']);
		// The answers are what got built: fullstack, under the name given.
		expect(existsSync(path.join(cwd, 'my-app/octane.config.ts'))).toBe(true);
	});

	it('takes the offered default when the name is left blank', async () => {
		const cwd = workspace();
		const { prompts } = fakePrompts({ text: '  ', select: 'spa' });

		await run(['--no-install'], cwd, { tty: true, prompts });

		expect(existsSync(path.join(cwd, `${DEFAULT_DIRECTORY}/index.html`))).toBe(true);
	});

	it('does not ask what a flag already answered', async () => {
		const cwd = workspace();
		const { asked, prompts } = fakePrompts({ text: 'ignored' });

		await run(['my-app', '--template', 'spa', '--no-install'], cwd, { tty: true, prompts });

		expect(asked).toEqual([]);
		expect(existsSync(path.join(cwd, 'my-app/index.html'))).toBe(true);
	});

	it('creates nothing when the questions are cancelled', async () => {
		const cwd = workspace();
		const { prompts } = fakePrompts({ text: null });

		const result = await run(['--no-install'], cwd, { tty: true, prompts });

		expect(result.exitCode).toBe(0);
		expect(readdirSync(cwd)).toEqual([]);
	});

	it('does not ask on a terminal nobody is watching', async () => {
		// A TTY is necessary but not sufficient. CI and NO_COLOR are how the CLI
		// already decides this, and answering it differently here left the two
		// halves of one flow disagreeing about whether anyone was there.
		for (const env of [{ CI: 'true' }, { NO_COLOR: '1' }]) {
			const { asked, prompts } = fakePrompts({ text: 'my-app', select: 'spa' });

			const result = await run(['--no-install'], workspace(), { tty: true, env, prompts });

			expect(result.exitCode, JSON.stringify(env)).toBe(2);
			expect(asked, JSON.stringify(env)).toEqual([]);
		}
	});

	it('asks for a directory rather than guessing one', async () => {
		const result = await run(['--template', 'spa', '--no-install'], workspace());

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain('Name the directory');
	});

	it('will not hang on a prompt where nobody can answer it', async () => {
		const result = await run(['my-app', '--no-install'], workspace());

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain('--template');
	});

	it('rejects a template it does not have', async () => {
		const result = await run(['my-app', '--template', 'islands', '--no-install'], workspace());

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain('Unknown template islands');
	});

	it('turns a directory name npm would reject into one it accepts', async () => {
		const cwd = workspace();

		await run(['My App!', '--template', 'spa', '--no-install'], cwd);

		expect(JSON.parse(read(path.join(cwd, 'My App!'), 'package.json')).name).toBe('my-app');
	});

	describe('parseArgv', () => {
		it('reads both spellings of the template flag', () => {
			expect(parseArgv(['app', '--template=fullstack'])).toEqual({
				directory: 'app',
				template: 'fullstack',
			});
			expect(parseArgv(['app', '-t', 'spa'])).toEqual({ directory: 'app', template: 'spa' });
		});

		it('installs unless told not to, because skipping leaves package.json bare', () => {
			expect(parseArgv(['app']).install).toBeUndefined();
			expect(parseArgv(['app', '--no-install']).install).toBe(false);
		});

		it('reports an unknown option instead of taking it for the directory', () => {
			expect(parseArgv(['app', '--install']).error).toContain('--install');
		});

		it('says a template is missing rather than naming an empty one', () => {
			expect(parseArgv(['app', '--template']).error).toContain('(missing)');
			expect(parseArgv(['app', '--template=']).error).toContain('(missing)');
		});
	});
});
