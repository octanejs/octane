/**
 * Optional, Node-only TypeScript evidence for authored JSX child expressions.
 *
 * The ordinary compiler remains synchronous, browser-safe, and independent of a
 * TypeScript project. This entry owns the expensive typed virtual-TSX graph and
 * hands the compiler only source-bound, serializable ranges. Callers must keep
 * one project alive for a build, invalidate changed inputs explicitly, and use
 * the same returned facts for client and server compilation.
 *
 * Both helpers run on the TypeScript the consumer installed: the classic
 * compiler API of TypeScript 5.9 and 6, or TypeScript 7's native API. The two
 * backends share the analysis and produce the same facts for the same program.
 */

import { readFileSync } from 'node:fs';
import {
	classicNativeReadHost,
	nativeNativeReadHost,
	validateNativeSignalNamesWith,
} from './native-read-types.js';
import { textTypeSourceVersion } from './text-type-facts.js';
import { createClassicTextTypeProject } from './text-types-classic.js';
import {
	absoluteFilename,
	assertSnapshotArguments,
	freezeFacts,
	textTypeProjectPaths,
} from './text-types-shared.js';
import { createNativeTextTypeProject } from './text-types-ts7.js';
import { loadTypeScript } from './typescript-module.js';

/** @type {WeakMap<object, import('./native-read-types.js').NativeReadHost>} */
const nativeReadHosts = new WeakMap();

function requireTypeScript(request, directory) {
	try {
		return loadTypeScript(request, directory);
	} catch (error) {
		throw new Error(
			`octane/compiler/typescript could not load ${request === undefined ? 'the optional `typescript` peer' : JSON.stringify(request)}. Install TypeScript 5.9 or later, or pass the package to use as \`typescript\`.`,
			{ cause: error },
		);
	}
}

/**
 * A TypeScript without a supported API proves nothing. Its facts carry no
 * ranges, so the compiler keeps its untyped output, and the build still runs.
 * @returns {import('./typescript.js').TextTypeProject}
 */
function createUnsupportedTextTypeProject(typescript, options) {
	const { directory } = textTypeProjectPaths(options);
	console.warn(`octane/compiler/typescript: ${typescript.reason}. Text type facts are disabled.`);
	const projectVersion = textTypeSourceVersion(`unsupported typescript ${typescript.version}`);
	const overrides = new Map();
	let disposed = false;
	const assertAlive = () => {
		if (disposed) throw new Error('This Octane text type project has been disposed.');
	};
	return Object.freeze({
		snapshot(filename, source) {
			assertAlive();
			const file = absoluteFilename(filename, directory);
			assertSnapshotArguments(file, source);
			if (source !== undefined) overrides.set(file, source);
			let text = overrides.get(file);
			if (text === undefined) {
				try {
					text = readFileSync(file, 'utf8');
				} catch {
					throw new Error(`Cannot read text type source ${JSON.stringify(file)}.`);
				}
			}
			return freezeFacts(file, { version: textTypeSourceVersion(text) }, projectVersion, [], []);
		},
		invalidate(filename) {
			assertAlive();
			if (filename === undefined) overrides.clear();
			else overrides.delete(absoluteFilename(filename, directory));
		},
		dispose() {
			disposed = true;
			overrides.clear();
		},
	});
}

/**
 * @param {import('./typescript.js').TextTypeProjectOptions} options
 * @returns {import('./typescript.js').TextTypeProject}
 */
export function createTextTypeProject(options) {
	const { directory } = textTypeProjectPaths(options);
	const typescript = requireTypeScript(options.typescript, directory);
	if (typescript.kind === 'classic') return createClassicTextTypeProject(typescript.ts, options);
	if (typescript.kind === 'native') return createNativeTextTypeProject(typescript, options);
	return createUnsupportedTextTypeProject(typescript, options);
}

/**
 * Validate native signal names and known live reads in ordinary memo callbacks
 * against the exact SourceFile of an existing Program: a classic Program, or a
 * TypeScript 7 Program from `typescript/unstable/sync`. Its API must come from
 * the TypeScript `options.typescript` names (resolved from the working
 * directory), by default octane's `typescript` peer.
 * @param {any} program
 * @param {string | any} file
 * @param {{ typescript?: string }} [options]
 * @returns {import('./index.js').CompileDiagnostic[]}
 */
export function validateNativeSignalNames(program, file, options) {
	const typescript = requireTypeScript(options?.typescript, process.cwd());
	if (typescript.kind === 'classic') {
		if (typeof program?.getTypeChecker !== 'function') {
			throw new TypeError(
				`Native signal type validation requires a Program from TypeScript ${typescript.version}.`,
			);
		}
		let host = nativeReadHosts.get(typescript);
		if (host === undefined) {
			host = classicNativeReadHost(typescript.ts);
			nativeReadHosts.set(typescript, host);
		}
		return validateNativeSignalNamesWith(host, program, file);
	}
	if (typescript.kind === 'native') {
		if (!(program instanceof typescript.sync.Program)) {
			throw new TypeError(
				`Native signal type validation requires a Program from the typescript/unstable/sync API of TypeScript ${typescript.version}; pass \`typescript\` to name the package that created it.`,
			);
		}
		let host = nativeReadHosts.get(typescript);
		if (host === undefined) {
			host = nativeNativeReadHost(typescript.sync, typescript.ast, typescript.is);
			nativeReadHosts.set(typescript, host);
		}
		return validateNativeSignalNamesWith(host, program, file);
	}
	throw new TypeError(`${typescript.reason}.`);
}
