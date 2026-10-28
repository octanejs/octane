import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {Object} Compiler
 * @property {(source: string, filename: string, options?: object) => { diagnostics: any[], error: unknown }} collectDiagnostics
 * @property {string} from where the compiler was loaded
 */

/**
 * The Octane compiler that judges the migrated code: the project's own when it
 * has one, so the result matches what its build will do, else the copy this
 * package ships with, since a React project has no Octane installed yet.
 *
 * @param {string} root
 * @returns {Promise<Compiler>}
 */
export async function loadCompiler(root) {
	for (const base of [path.join(root, 'noop.js'), import.meta.url]) {
		let entry;
		try {
			entry = createRequire(base).resolve('octane/compiler');
		} catch {
			continue;
		}
		const module = await import(pathToFileURL(entry).href);
		if (typeof module.collectDiagnostics === 'function') {
			return { collectDiagnostics: module.collectDiagnostics, from: entry };
		}
	}
	throw new Error('Could not load `octane/compiler`.');
}
