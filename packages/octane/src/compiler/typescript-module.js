/**
 * Locate the TypeScript that the optional compiler helpers run on and tell its
 * API apart. TypeScript 5.9 and 6 export the classic compiler API from the
 * package root. TypeScript 7's root exports only its version: its compiler runs
 * in a native process behind `typescript/unstable/sync`. Loading stays
 * synchronous because the helpers are; Node's `require` loads TypeScript 7's
 * ES module API.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import nodePath from 'node:path';

const octaneRequire = createRequire(import.meta.url);
/** @type {Map<string, TypeScriptModule>} */
const modules = new Map();

/**
 * @typedef {{ kind: 'classic', version: string, ts: typeof import('typescript') }
 *   | { kind: 'native', version: string, sync: any, ast: any, is: any }} TypeScriptModule
 */

/**
 * The package.json of the requested TypeScript. Without a request this is the
 * `typescript` peer that octane itself resolves. A bare name resolves from
 * `directory`, so an application can name an aliased install such as
 * `typescript-native`; an absolute path names the package directory itself.
 * @param {string | undefined} request
 * @param {string} directory
 */
function packageJsonFor(request, directory) {
	if (request === undefined) return octaneRequire.resolve('typescript/package.json');
	if (typeof request !== 'string' || request.length === 0) {
		throw new TypeError('The `typescript` option must name a TypeScript package or directory.');
	}
	if (nodePath.isAbsolute(request)) {
		return nodePath.basename(request) === 'package.json'
			? request
			: nodePath.join(request, 'package.json');
	}
	return createRequire(nodePath.join(directory, 'package.json')).resolve(`${request}/package.json`);
}

/**
 * @param {string} packageJson
 * @returns {TypeScriptModule}
 */
function classify(packageJson) {
	const manifest = JSON.parse(readFileSync(packageJson, 'utf8'));
	const packageRequire = createRequire(packageJson);
	// A package resolves its own name through its exports, which is also how an
	// aliased install (installed as `typescript-native`, named `typescript`) is read.
	if (manifest.exports?.['./unstable/sync'] !== undefined) {
		return {
			kind: 'native',
			version: manifest.version,
			sync: packageRequire(`${manifest.name}/unstable/sync`),
			ast: packageRequire(`${manifest.name}/unstable/ast`),
			is: packageRequire(`${manifest.name}/unstable/ast/is`),
		};
	}
	const ts = packageRequire(nodePath.dirname(packageJson));
	if (
		typeof ts.createLanguageService === 'function' &&
		typeof ts.ScriptSnapshot?.fromString === 'function'
	) {
		return { kind: 'classic', version: ts.version, ts };
	}
	throw new Error(
		`TypeScript ${manifest.version} at ${nodePath.dirname(packageJson)} has neither the classic compiler API nor typescript/unstable/sync.`,
	);
}

/**
 * Load (once per package) the TypeScript a helper should use.
 * @param {string | undefined} request
 * @param {string} directory
 * @returns {TypeScriptModule}
 */
export function loadTypeScript(request, directory) {
	const packageJson = packageJsonFor(request, directory);
	let module = modules.get(packageJson);
	if (module === undefined) {
		module = classify(packageJson);
		modules.set(packageJson, module);
	}
	return module;
}
