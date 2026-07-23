'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const {
	createLanguageServicePlugin,
} = require('@volar/typescript/lib/quickstart/createLanguageServicePlugin.js');

const OCTANE_TSRX_LANGUAGE_ID = 'octane-tsrx';
const TSRX_EXTENSION = '.tsrx';
const compilerCache = new Map();
/** @type {((source: string, filename?: string, options?: { loose?: boolean }) => any) | undefined} */
let bundledCompiler;

function loadBundledCompiler() {
	if (bundledCompiler) return bundledCompiler;
	const dynamicRequire = /** @type {NodeRequire} */ (eval('require'));
	let module;
	try {
		module = dynamicRequire(path.join(__dirname, '../../../dist/compiler.cjs'));
	} catch {
		// Development path before the package bundle exists.
		module = dynamicRequire('octane/compiler/volar');
	}
	bundledCompiler = module.compileToVolarMappings ?? module.compile_to_volar_mappings;
	if (typeof bundledCompiler !== 'function') {
		throw new TypeError('The bundled Octane TSRX compiler is invalid.');
	}
	return bundledCompiler;
}

/** @param {string | { fsPath: string }} fileNameOrUri */
function normalizeFileName(fileNameOrUri) {
	return typeof fileNameOrUri === 'string'
		? fileNameOrUri
		: fileNameOrUri.fsPath.replace(/\\/g, '/');
}

/**
 * Resolve an explicit TSRX compiler from the nearest tsconfig when present.
 * This is intentionally a small, synchronous cold path; successful resolutions
 * are cached for the lifetime of the TypeScript server process.
 *
 * @param {typeof import('typescript')} ts
 * @param {string} fileName
 */
function resolveConfiguredCompiler(ts, fileName) {
	const configPath = ts.findConfigFile(path.dirname(fileName), fs.existsSync);
	if (!configPath) return undefined;

	const result = ts.readConfigFile(configPath, ts.sys.readFile);
	const specifier = result.config?.tsrx?.compiler;
	if (typeof specifier !== 'string' || specifier.trim() === '') return undefined;

	return createRequire(configPath).resolve(specifier.trim());
}

/** @param {string} fileName */
function resolveWorkspaceCompiler(fileName) {
	try {
		return createRequire(path.join(path.dirname(fileName), '__octane_language__.cjs')).resolve(
			'octane/compiler/volar',
		);
	} catch {
		return undefined;
	}
}

/**
 * Project compiler wins for version fidelity. The dependency bundled in this
 * extension is the deterministic fallback for loose files and incomplete
 * workspaces.
 *
 * @param {typeof import('typescript')} ts
 * @param {string} fileName
 */
function loadCompiler(ts, fileName) {
	const configured = resolveConfiguredCompiler(ts, fileName);
	const compilerPath = configured ?? resolveWorkspaceCompiler(fileName);
	if (!compilerPath) {
		return loadBundledCompiler();
	}
	let compiler = compilerCache.get(compilerPath);
	if (!compiler) {
		const module = require(compilerPath);
		compiler = module.compileToVolarMappings ?? module.compile_to_volar_mappings;
		if (typeof compiler !== 'function') {
			throw new TypeError(`Invalid TSRX compiler at ${compilerPath}`);
		}
		compilerCache.set(compilerPath, compiler);
	}
	return compiler;
}

/** @param {string} text */
function createSnapshot(text) {
	return {
		/** @param {number} start @param {number} end */
		getText: (start, end) => text.substring(start, end),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
}

/**
 * Restore an incomplete member-access dot after compiling the otherwise valid
 * source. Keeping a separate 1:1 mapping is required when the preceding token
 * expands in virtual TSX.
 *
 * @param {{ code: string, mappings: import('@volar/language-core').CodeMapping[] }} result
 * @param {number} dotPosition
 */
function restoreCompletionDot(result, dotPosition) {
	const anchor = result.mappings.find(
		(mapping) => mapping.sourceOffsets[0] + mapping.lengths[0] === dotPosition,
	);
	if (!anchor) return false;

	const generatedPosition =
		anchor.generatedOffsets[0] + (anchor.generatedLengths?.[0] ?? anchor.lengths[0]);
	result.code =
		result.code.substring(0, generatedPosition) + '.' + result.code.substring(generatedPosition);
	const dotMapping = {
		sourceOffsets: [dotPosition],
		generatedOffsets: [generatedPosition],
		lengths: [1],
		generatedLengths: [1],
		data: { ...anchor.data },
	};
	const anchorIndex = result.mappings.indexOf(anchor);
	result.mappings.splice(anchorIndex + 1, 0, dotMapping);
	for (const mapping of result.mappings) {
		if (mapping === anchor || mapping === dotMapping) continue;
		if (mapping.generatedOffsets[0] >= generatedPosition) mapping.generatedOffsets[0] += 1;
		if (mapping.sourceOffsets[0] >= dotPosition) mapping.sourceOffsets[0] += 1;
	}
	return true;
}

/**
 * @param {(source: string, filename?: string, options?: { loose?: boolean }) => any} compile
 * @param {string} source
 * @param {string} fileName
 */
function compileForLanguageService(compile, source, fileName) {
	try {
		return compile(source, fileName, { loose: true });
	} catch (initialError) {
		const incompleteMember = /[$#_\u200C\u200D\p{ID_Continue}\)\]\}]\.(?=\s*(?:$|[<@}]))/gu;
		const positions = [...source.matchAll(incompleteMember)].map(
			(match) => (match.index ?? 0) + match[0].length - 1,
		);
		for (let index = positions.length - 1; index >= 0; index--) {
			const dotPosition = positions[index];
			const sourceWithoutDot = source.slice(0, dotPosition) + source.slice(dotPosition + 1);
			try {
				const result = compile(sourceWithoutDot, fileName, { loose: true });
				if (result?.code && restoreCompletionDot(result, dotPosition)) return result;
			} catch {
				// Try an earlier incomplete member expression before falling back.
			}
		}
		throw initialError;
	}
}

class OctaneVirtualCode {
	id = 'root';
	languageId = OCTANE_TSRX_LANGUAGE_ID;
	/** @type {import('@volar/language-core').VirtualCode[]} */
	embeddedCodes = [];
	/** @type {import('@volar/language-core').CodeMapping[]} */
	mappings = [];

	/**
	 * @param {typeof import('typescript')} ts
	 * @param {string} fileName
	 * @param {import('@volar/language-core').IScriptSnapshot} snapshot
	 */
	constructor(ts, fileName, snapshot) {
		this.ts = ts;
		this.fileName = fileName;
		this.snapshot = snapshot;
		this.update(snapshot);
	}

	/** @param {import('@volar/language-core').IScriptSnapshot} sourceSnapshot */
	update(sourceSnapshot) {
		const source = sourceSnapshot.getText(0, sourceSnapshot.getLength());
		try {
			const compile = loadCompiler(this.ts, this.fileName);
			const result = compileForLanguageService(compile, source, this.fileName);
			if (!result?.code) throw new TypeError('The Octane compiler returned no virtual code.');
			this.snapshot = createSnapshot(result.code);
			this.mappings = result.mappings ?? [];
		} catch (error) {
			console.error(`[Octane TSRX] Failed to compile ${this.fileName}:`, error);
			this.snapshot = createSnapshot(source);
			this.mappings = [
				{
					sourceOffsets: [0],
					generatedOffsets: [0],
					lengths: [source.length],
					generatedLengths: [source.length],
					data: {
						completion: true,
						verification: false,
						navigation: true,
						semantic: true,
						structure: true,
						format: false,
					},
				},
			];
		}
	}
}

/**
 * @param {typeof import('typescript')} ts
 * @returns {import('@volar/language-core').LanguagePlugin<string | {fsPath: string}> & {
 *   typescript: {
 *     extraFileExtensions: import('typescript').FileExtensionInfo[],
 *     getServiceScript(virtualCode: import('@volar/language-core').VirtualCode): {
 *       code: import('@volar/language-core').VirtualCode,
 *       extension: string,
 *       scriptKind: import('typescript').ScriptKind,
 *     } | undefined,
 *   },
 * }}
 */
function createOctaneLanguagePlugin(ts) {
	return {
		/** @param {string | { fsPath: string }} fileNameOrUri */
		getLanguageId(fileNameOrUri) {
			if (normalizeFileName(fileNameOrUri).endsWith(TSRX_EXTENSION)) {
				return OCTANE_TSRX_LANGUAGE_ID;
			}
		},
		/**
		 * @param {string | { fsPath: string }} fileNameOrUri
		 * @param {string} languageId
		 * @param {import('@volar/language-core').IScriptSnapshot} snapshot
		 */
		createVirtualCode(fileNameOrUri, languageId, snapshot) {
			if (languageId !== OCTANE_TSRX_LANGUAGE_ID) return undefined;
			return new OctaneVirtualCode(ts, normalizeFileName(fileNameOrUri), snapshot);
		},
		/**
		 * @param {string | { fsPath: string }} _fileNameOrUri
		 * @param {import('@volar/language-core').VirtualCode} virtualCode
		 * @param {import('@volar/language-core').IScriptSnapshot} snapshot
		 */
		updateVirtualCode(_fileNameOrUri, virtualCode, snapshot) {
			if (!(virtualCode instanceof OctaneVirtualCode)) return undefined;
			virtualCode.update(snapshot);
			return virtualCode;
		},
		typescript: {
			extraFileExtensions: [
				{ extension: TSRX_EXTENSION.slice(1), isMixedContent: false, scriptKind: 7 },
			],
			/** @param {import('@volar/language-core').VirtualCode} virtualCode */
			getServiceScript(virtualCode) {
				if (virtualCode.languageId !== OCTANE_TSRX_LANGUAGE_ID) return undefined;
				return { code: virtualCode, extension: '.tsx', scriptKind: 4 };
			},
		},
	};
}

module.exports = createLanguageServicePlugin((ts) => ({
	languagePlugins: [createOctaneLanguagePlugin(ts)],
}));

module.exports.OCTANE_TSRX_LANGUAGE_ID = OCTANE_TSRX_LANGUAGE_ID;
module.exports.createOctaneLanguagePlugin = createOctaneLanguagePlugin;
module.exports.loadCompiler = loadCompiler;
