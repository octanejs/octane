import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main } from '../../src/kernel/main.js';

/**
 * Build a throwaway project on disk.
 *
 * Doctor reads real files, resolves real `node_modules`, and rewrites real
 * tsconfigs, so the tests give it a real directory rather than a mocked
 * filesystem. Values that are objects are written as JSON.
 *
 * @param {Record<string, string | object>} files
 * @returns {{ root: string, write: (file: string, body: string | object) => void, cleanup: () => void }}
 */
export function createFixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), 'octane-cli-'));

	/** @type {(file: string, body: string | object) => void} */
	const write = (file, body) => {
		const target = path.join(root, file);
		mkdirSync(path.dirname(target), { recursive: true });
		writeFileSync(target, typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`);
	};

	for (const [file, body] of Object.entries(files)) write(file, body);

	return { root, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * A minimal installed package, enough for the dependency checks to resolve it.
 * Spread into a fixture's file map.
 *
 * @param {string} name
 * @param {string} version
 * @param {object} [extra] extra manifest fields, e.g. `peerDependencies`
 * @param {string} [under] owner package, to nest the copy in its own node_modules
 * @returns {Record<string, object>}
 */
export function installed(name, version, extra = {}, under = '') {
	const prefix = under ? `node_modules/${under}/node_modules` : 'node_modules';
	return { [`${prefix}/${name}/package.json`]: { name, version, ...extra } };
}

/**
 * @typedef {Object} RunResult
 * @property {number} exitCode
 * @property {string} stdout
 * @property {string} stderr
 * @property {() => any} json
 */

/**
 * Run the CLI exactly as the bin does, capturing both streams. `tty: false`
 * pins the non-interactive path so a test can never block on a prompt.
 *
 * @param {string[]} argv
 * @param {{ env?: NodeJS.ProcessEnv, exec?: import('../../src/kernel/exec.js').Exec,
 *   tty?: boolean }} [options]
 * @returns {Promise<RunResult>}
 */
export async function runCli(argv, options = {}) {
	let stdout = '';
	let stderr = '';

	// HOME always points somewhere disposable. Commands that resolve a user-scope
	// config must never be able to reach the real `~/.claude.json` from a test.
	const home = options.env?.HOME ?? mkdtempSync(path.join(tmpdir(), 'octane-cli-home-'));

	const exitCode = await main(argv, {
		// `tty: true` is how a test reaches the interactive branches. Anything
		// that would then block on a prompt has to be answered by a flag.
		tty: options.tty ?? false,
		env: { ...options.env, HOME: home, USERPROFILE: home },
		exec: options.exec,
		stdout: /** @type {any} */ ({ write: (/** @type {string} */ chunk) => (stdout += chunk) }),
		stderr: /** @type {any} */ ({ write: (/** @type {string} */ chunk) => (stderr += chunk) }),
	});

	return { exitCode, stdout, stderr, json: () => JSON.parse(stdout || stderr) };
}
