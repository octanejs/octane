import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {{ code: string, severity: string, message: string, line: number }} Finding
 *
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

/**
 * @param {any} diagnostic a compiler diagnostic
 * @returns {Finding}
 */
export function finding(diagnostic) {
	return {
		code: diagnostic.code,
		severity: diagnostic.severity,
		message: String(diagnostic.message).replace(`[${diagnostic.code}] `, ''),
		line: diagnostic.start?.line ?? 1,
	};
}

/**
 * @param {any} error what the compiler threw for a module it could not parse
 * @returns {Finding}
 */
export function thrown(error) {
	return {
		code: 'COMPILE_ERROR',
		severity: 'error',
		message: String(error?.message ?? error),
		line: error?.loc?.line ?? 1,
	};
}
