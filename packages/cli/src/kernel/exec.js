import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';

/**
 * @typedef {Object} ExecResult
 * @property {number} code
 * @property {string} stdout
 * @property {string} stderr
 */

/**
 * @typedef {Object} Exec
 * @property {(bin: string) => string | null} which
 * @property {(file: string, args: string[], options?: { cwd?: string }) => Promise<ExecResult>} run
 */

/**
 * Process access, isolated behind one small interface. This is the only such
 * seam in the kernel: it exists so that commands which shell out to another
 * tool (`claude mcp add`, a package manager install) stay testable without
 * spawning anything. Filesystem work deliberately does *not* go through an
 * adapter, because fixture directories on disk test it more honestly than a
 * mock would.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Exec}
 */
export function createExec(env = process.env) {
	const extensions =
		process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];

	return {
		which(bin) {
			for (const dir of (env.PATH ?? '').split(path.delimiter)) {
				if (!dir) continue;
				for (const ext of extensions) {
					const candidate = path.join(dir, bin + ext);
					try {
						accessSync(candidate, constants.X_OK);
						return candidate;
					} catch {
						// Not here; keep walking PATH.
					}
				}
			}
			return null;
		},

		run(file, args, options = {}) {
			return new Promise((resolve) => {
				execFile(file, args, { cwd: options.cwd, env }, (error, stdout, stderr) => {
					resolve({
						code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
						stdout: String(stdout),
						stderr: String(stderr),
					});
				});
			});
		},
	};
}
