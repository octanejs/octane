/**
 * Optional, Node-only TypeScript evidence for authored JSX child expressions.
 *
 * The ordinary compiler remains synchronous, browser-safe, and independent of a
 * TypeScript project. This entry owns the expensive typed virtual-TSX graph and
 * hands the compiler only source-bound, serializable ranges. Callers must keep
 * one project alive for a build, invalidate changed inputs explicitly, and use
 * the same returned facts for client and server compilation.
 */

import nodePath from 'node:path';
import ts from 'typescript';
import { createLanguage, FileMap, SourceMap } from '@volar/language-core';
import { createLanguageServiceHost, resolveFileLanguageId } from '@volar/typescript';
import { normalizeRendererConfig } from './renderers.js';
import {
	TEXT_TYPE_FACTS_VERSION,
	normalizeTextTypeFilename,
	textTypeSourceVersion,
} from './text-type-facts.js';
import { compileToVolarMappings } from './volar.js';
export { validateNativeSignalNames } from './native-read-types.js';

/** @typedef {import('typescript').SourceFile} SourceFile */
/** @typedef {import('typescript').Program} Program */
/** @typedef {{ source: string, version: string, snapshot: import('typescript').IScriptSnapshot }} SourceRecord */
/** @typedef {{ start: number, end: number, containerStart: number, containerEnd: number }} AuthoredChild */

const TSRX_EXTENSIONS = [
	{ extension: 'tsrx', isMixedContent: false, scriptKind: ts.ScriptKind.Deferred },
];
const WALK_SKIP = new Set(['metadata', 'loc', 'parent', 'css']);

function absoluteFilename(filename, directory) {
	if (typeof filename !== 'string' || filename.length === 0) {
		throw new TypeError('Octane text type projects require a non-empty filename.');
	}
	return normalizeTextTypeFilename(
		nodePath.resolve(directory, normalizeTextTypeFilename(filename)),
	);
}

function rendererFilename(filename, directory) {
	const relative = nodePath.relative(directory, filename);
	return relative !== '..' &&
		!relative.startsWith('..' + nodePath.sep) &&
		!nodePath.isAbsolute(relative)
		? '/' + normalizeTextTypeFilename(relative)
		: filename;
}

/** Stable JSON for TypeScript's data-only compiler options, excluding its AST. */
function stableJson(value) {
	return JSON.stringify(value, (key, entry) => {
		if (key === 'configFile') return undefined;
		if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
			return Object.fromEntries(
				Object.keys(entry)
					.sort()
					.map((name) => [name, entry[name]]),
			);
		}
		return entry;
	});
}

function sourceRecord(source) {
	return {
		source,
		version: textTypeSourceVersion(source),
		snapshot: ts.ScriptSnapshot.fromString(source),
	};
}

function validRange(start, end, length) {
	return (
		Number.isSafeInteger(start) &&
		Number.isSafeInteger(end) &&
		start >= 0 &&
		start < end &&
		end <= length
	);
}

/**
 * Select actual authored children, not attributes, dynamic tag names, or an
 * arbitrary expression elsewhere in the module. ESTree offsets and TS offsets
 * are both half-open UTF-16 code-unit ranges.
 * @param {unknown} ast
 * @param {string} source
 * @returns {AuthoredChild[]}
 */
function authoredChildren(ast, source) {
	const children = [];
	const seen = new WeakSet();
	const visit = (node, parent, key) => {
		if (!node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child, parent, key);
			return;
		}
		// The type-only parser preserves grouping parentheses for editor mappings;
		// the runtime parser intentionally does not. Facts name the expression the
		// runtime compiler will actually adopt, while the full container still owns
		// the exact mapping used below.
		let expression = node.expression;
		while (expression?.type === 'ParenthesizedExpression') expression = expression.expression;
		if (
			node.type === 'JSXExpressionContainer' &&
			(key === 'children' || (parent?.type === 'JSXCodeBlock' && key === 'render')) &&
			expression?.type !== 'JSXEmptyExpression' &&
			validRange(expression?.start, expression?.end, source.length) &&
			validRange(node.start, node.end, source.length) &&
			source[node.start] === '{' &&
			source[node.end - 1] === '}'
		) {
			children.push({
				start: expression.start,
				end: expression.end,
				containerStart: node.start,
				containerEnd: node.end,
			});
		}
		for (const property in node) {
			if (!WALK_SKIP.has(property)) visit(node[property], node, property);
		}
	};
	visit(ast, null, null);
	return children;
}

function isJsxChild(node) {
	return (
		ts.isJsxExpression(node) &&
		!!node.expression &&
		!node.dotDotDotToken &&
		!!node.parent &&
		(ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
	);
}

function unparenthesizedExpression(expression) {
	while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
	return expression;
}

/** @param {SourceFile} sourceFile */
function indexJsxChildren(sourceFile) {
	const children = new Map();
	const visit = (node) => {
		if (isJsxChild(node)) {
			children.set(`${node.getStart(sourceFile)}:${node.end}`, node);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return children;
}

/**
 * A container's exact mapping carries its full generated length, even when the
 * printer reformats a multiline expression. Translating an interior offset
 * linearly would be unsafe in that case. Match the complete generated TS JSX
 * container, then ask about its complete inner expression. Multiple distinct
 * matches are ambiguous and deliberately yield no evidence.
 */
function mappedChild(child, sourceMap, generatedChildren, generatedLength) {
	const matches = new Map();
	for (const [, mapping] of sourceMap.toGeneratedLocation(child.containerStart)) {
		for (let index = 0; index < mapping.sourceOffsets.length; index++) {
			if (
				mapping.sourceOffsets[index] !== child.containerStart ||
				mapping.sourceOffsets[index] + mapping.lengths[index] !== child.containerEnd
			) {
				continue;
			}
			const start = mapping.generatedOffsets[index];
			const end = start + (mapping.generatedLengths?.[index] ?? mapping.lengths[index]);
			if (!validRange(start, end, generatedLength)) continue;
			const key = `${start}:${end}`;
			const node = generatedChildren.get(key);
			if (node !== undefined) matches.set(key, node.expression);
		}
	}
	return matches.size === 1 ? matches.values().next().value : null;
}

/**
 * TypeScript assignability alone is insufficient: `any` and `never` are both
 * assignable to string. Only a primitive-string domain is useful here. Branded
 * string intersections and bounded generic constraints retain that domain;
 * mixed unions, boxed String, and unresolved/error types do not.
 *
 * This is a typed-program contract, not runtime validation of inaccurate
 * declarations or values smuggled through `any`.
 */
function isPrimitiveString(type, checker, seen = new Set()) {
	if (!type || seen.has(type)) return false;
	const flags = type.flags;
	if (
		flags &
		(ts.TypeFlags.Any |
			ts.TypeFlags.Unknown |
			ts.TypeFlags.Never |
			ts.TypeFlags.Void |
			ts.TypeFlags.Undefined |
			ts.TypeFlags.Null)
	) {
		return false;
	}
	if (flags & ts.TypeFlags.StringLike) return true;
	if (seen.size >= 64) return false;
	seen.add(type);
	let result = false;
	if (type.isUnion()) {
		result =
			type.types.length > 0 && type.types.every((part) => isPrimitiveString(part, checker, seen));
	} else if (type.isIntersection()) {
		result = type.types.some((part) => isPrimitiveString(part, checker, seen));
	} else {
		const constraint = checker.getBaseConstraintOfType(type);
		if (constraint && constraint !== type) result = isPrimitiveString(constraint, checker, seen);
	}
	seen.delete(type);
	return result;
}

function overlapsDiagnostic(diagnostic, start, end) {
	if (diagnostic.start === undefined || diagnostic.length === undefined) return true;
	if (diagnostic.length === 0) return diagnostic.start >= start && diagnostic.start <= end;
	return diagnostic.start < end && diagnostic.start + diagnostic.length > start;
}

function freezeFacts(filename, record, projectVersion, ranges) {
	const unique = new Map();
	for (const [start, end] of ranges) unique.set(`${start}:${end}`, [start, end]);
	const sorted = [...unique.values()].sort(
		(left, right) => left[0] - right[0] || left[1] - right[1],
	);
	return Object.freeze({
		version: TEXT_TYPE_FACTS_VERSION,
		filename,
		sourceVersion: record.version,
		projectVersion,
		stringChildRanges: Object.freeze(sorted.map((range) => Object.freeze(range))),
	});
}

/**
 * @param {import('./typescript.js').TextTypeProjectOptions} options
 * @returns {import('./typescript.js').TextTypeProject}
 */
export function createTextTypeProject(options) {
	if (!options || typeof options.tsconfig !== 'string' || options.tsconfig.length === 0) {
		throw new TypeError('createTextTypeProject requires a tsconfig filename.');
	}
	const configFilename = absoluteFilename(options.tsconfig, process.cwd());
	const directory = nodePath.dirname(configFilename);
	const renderers = normalizeRendererConfig(options.renderers);
	const caseSensitive = ts.sys.useCaseSensitiveFileNames;
	const sources = new FileMap(caseSensitive);
	const overrides = new FileMap(caseSensitive);
	const virtualSources = new FileMap(caseSensitive);
	const extraRoots = new Set();
	const factsCache = new FileMap(caseSensitive);
	let generation = 0;
	let disposed = false;
	let config = null;
	let rootFileNames = null;
	let service = null;
	let language = null;
	let scriptRegistry = null;
	let currentProgram = null;
	let currentProjectVersion = null;
	const analyses = new FileMap(caseSensitive);

	const normalize = (filename) => absoluteFilename(filename, directory);
	const assertAlive = () => {
		if (disposed) throw new Error('This Octane text type project has been disposed.');
	};

	/** @returns {SourceRecord | undefined} */
	const readSource = (filename, includeFsFiles = true) => {
		const file = normalize(filename);
		if (overrides.has(file)) return overrides.get(file);
		if (sources.has(file)) return sources.get(file);
		if (!includeFsFiles) return undefined;
		const source = ts.sys.readFile(file);
		const record = source === undefined ? undefined : sourceRecord(source);
		sources.set(file, record);
		return record;
	};

	const system = {
		...ts.sys,
		get version() {
			return generation;
		},
		getCurrentDirectory: () => directory,
		readFile: (filename) => readSource(filename)?.source,
		fileExists: (filename) => {
			const file = normalize(filename);
			return overrides.has(file) || ts.sys.fileExists(file);
		},
		directoryExists: (filename) => {
			if (ts.sys.directoryExists(filename)) return true;
			const prefix = normalize(filename).replace(/\/$/, '') + '/';
			for (const file of overrides.keys()) if (file.startsWith(prefix)) return true;
			return false;
		},
	};

	const loadConfig = () => {
		if (config !== null) return config;
		// Configs (including extends) must be reread after either invalidation
		// form. They must not inherit an unrelated source file's cache lifetime.
		const configSystem = { ...system, readFile: ts.sys.readFile };
		const read = ts.readConfigFile(configFilename, configSystem.readFile);
		if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
		const parsed = ts.parseJsonConfigFileContent(
			read.config,
			configSystem,
			directory,
			undefined,
			configFilename,
			undefined,
			TSRX_EXTENSIONS,
		);
		// An in-memory snapshot may be the project's first file. All other config
		// errors are actionable configuration failures, not failed type proofs.
		const errors = parsed.errors.filter((error) => error.code !== 18002 && error.code !== 18003);
		if (errors.length > 0) {
			throw new Error(
				errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'),
			);
		}
		const fileNames = parsed.fileNames.map(normalize);
		config = {
			...parsed,
			fileNames,
			fileNameSet: new Set(fileNames),
			options: {
				...parsed.options,
				jsx: parsed.options.jsx ?? ts.JsxEmit.Preserve,
				allowArbitraryExtensions: true,
				noEmit: true,
				// Missing array/record entries are not non-null string evidence. This
				// changes only this analysis Program, never the consumer's tsconfig.
				noUncheckedIndexedAccess: true,
			},
		};
		return config;
	};

	const roots = () => {
		if (rootFileNames === null) {
			rootFileNames = [...new Set([...loadConfig().fileNames, ...extraRoots])].sort();
		}
		return rootFileNames;
	};
	const clearProofs = () => {
		factsCache.clear();
		analyses.clear();
		currentProgram = null;
		currentProjectVersion = null;
	};
	const disposeService = () => {
		service?.dispose();
		service = null;
		if (language !== null && scriptRegistry !== null) {
			for (const filename of [...scriptRegistry.keys()]) language.scripts.delete(filename);
		}
		language = null;
		scriptRegistry = null;
		clearProofs();
	};
	const changed = (filename) => {
		generation++;
		virtualSources.delete(filename);
		language?.scripts.delete(filename);
		// Type-only edits and newly-created formerly-missing imports may not change
		// an importer's text. Discard TS's semantic Program as well as our facts;
		// Volar observes system.version and clears its module-resolution cache.
		service?.cleanupSemanticCache();
		clearProofs();
	};

	const virtualCode = (filename, snapshot) => {
		const file = normalize(filename);
		const source = snapshot.getText(0, snapshot.getLength());
		const version = textTypeSourceVersion(source);
		const cached = virtualSources.get(file);
		if (cached?.version === version) return cached.code;
		let compilation = null;
		try {
			compilation = compileToVolarMappings(source, rendererFilename(file, directory), {
				renderers,
			});
		} catch {
			// Broken authored syntax is not evidence. Passing the authored text
			// through lets TypeScript recover normally; no synthetic TS is assembled.
		}
		const code = {
			id: 'tsx',
			languageId: 'typescriptreact',
			snapshot: ts.ScriptSnapshot.fromString(compilation?.code ?? source),
			mappings: compilation?.mappings ?? [],
		};
		virtualSources.set(file, { version, compilation, code });
		return code;
	};

	const ensureService = () => {
		if (service !== null) return service;
		const plugin = {
			getLanguageId: (filename) => (filename.endsWith('.tsrx') ? 'octane' : undefined),
			createVirtualCode: (filename, languageId, snapshot) =>
				languageId === 'octane' ? virtualCode(filename, snapshot) : undefined,
			updateVirtualCode: (filename, _previous, snapshot) => virtualCode(filename, snapshot),
			typescript: {
				extraFileExtensions: TSRX_EXTENSIONS,
				resolveHiddenExtensions: true,
				getServiceScript: (code) => ({
					code,
					extension: '.tsx',
					scriptKind: ts.ScriptKind.TSX,
					preventLeadingOffset: true,
				}),
			},
		};
		scriptRegistry = new FileMap(caseSensitive);
		language = createLanguage(
			[plugin, { getLanguageId: resolveFileLanguageId }],
			scriptRegistry,
			(filename, includeFsFiles) => {
				const record = readSource(filename, includeFsFiles);
				if (record === undefined) language.scripts.delete(filename);
				else language.scripts.set(filename, record.snapshot);
			},
		);
		const { languageServiceHost } = createLanguageServiceHost(ts, system, language, normalize, {
			getCurrentDirectory: () => directory,
			getCompilationSettings: () => loadConfig().options,
			getProjectReferences: () => loadConfig().projectReferences,
			getScriptFileNames: roots,
			getProjectVersion: () => String(generation),
		});
		service = ts.createLanguageService(languageServiceHost);
		return service;
	};

	/** @param {Program} program */
	const projectVersion = (program) => {
		if (currentProgram === program && currentProjectVersion !== null) return currentProjectVersion;
		clearProofs();
		currentProgram = program;
		const inputs = program
			.getSourceFiles()
			.map((file) => [
				normalize(file.fileName),
				readSource(file.fileName)?.version ?? textTypeSourceVersion(file.text),
				file.impliedNodeFormat ?? null,
			])
			.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
		currentProjectVersion = textTypeSourceVersion(
			stableJson({
				typescript: ts.version,
				config: configFilename,
				options: program.getCompilerOptions(),
				references: loadConfig().projectReferences ?? [],
				renderers: renderers.signature,
				roots: roots(),
				inputs,
			}),
		);
		return currentProjectVersion;
	};

	/** @param {Program} program @param {SourceFile} sourceFile */
	const analyzeFile = (program, sourceFile) => {
		const filename = normalize(sourceFile.fileName);
		const cached = analyses.get(filename);
		if (cached !== undefined) return cached;
		const syntaxErrors = program
			.getSyntacticDiagnostics(sourceFile)
			.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
		const analysis = {
			syntaxErrors,
			children: syntaxErrors ? new Map() : indexJsxChildren(sourceFile),
			errors: syntaxErrors
				? []
				: program
						.getSemanticDiagnostics(sourceFile)
						.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error),
		};
		analyses.set(filename, analysis);
		return analysis;
	};

	const snapshot = (filename, source) => {
		assertAlive();
		const file = normalize(filename);
		if (!file.endsWith('.tsrx') && !file.endsWith('.tsx')) {
			throw new TypeError('Octane text type snapshots require a .tsrx or .tsx filename.');
		}
		if (source !== undefined && typeof source !== 'string') {
			throw new TypeError('Octane text type snapshot source must be a string.');
		}
		let record = readSource(file);
		if (source !== undefined && record?.source !== source) {
			record = sourceRecord(source);
			overrides.set(file, record);
			changed(file);
		} else if (source !== undefined) {
			// An explicitly supplied snapshot remains authoritative even if it
			// initially happens to match the cached disk contents.
			overrides.set(file, record);
		}
		if (record === undefined)
			throw new Error(`Cannot read text type source ${JSON.stringify(file)}.`);
		if (!loadConfig().fileNameSet.has(file) && !extraRoots.has(file)) {
			extraRoots.add(file);
			rootFileNames = null;
			changed(file);
		}
		const program = ensureService().getProgram();
		if (program === undefined) throw new Error('TypeScript did not create a text type Program.');
		const version = projectVersion(program);
		const cached = factsCache.get(file);
		// FileMap folds case where the filesystem does, but a public snapshot is
		// bound to the exact clean filename that its caller will pass to compile.
		if (
			cached?.filename === file &&
			cached.sourceVersion === record.version &&
			cached.projectVersion === version
		)
			return cached;
		const ranges = [];
		const compilerOptions = program.getCompilerOptions();
		const strictNullChecks = compilerOptions.strictNullChecks ?? compilerOptions.strict ?? false;
		const sourceFile = program.getSourceFile(file);
		if (strictNullChecks && sourceFile !== undefined) {
			const virtual = file.endsWith('.tsrx') ? virtualSources.get(file) : null;
			const compilation = virtual?.compilation;
			const validSource = virtual
				? virtual.version === record.version &&
					compilation !== null &&
					compilation.errors.length === 0
				: sourceFile.text === record.source;
			if (validSource) {
				const analysis = analyzeFile(program, sourceFile);
				if (!analysis.syntaxErrors) {
					const checker = program.getTypeChecker();
					const accept = (expression, start, end) => {
						if (!expression) return;
						const generatedStart = expression.getStart(sourceFile);
						if (
							analysis.errors.some((error) =>
								overlapsDiagnostic(error, generatedStart, expression.end),
							)
						) {
							return;
						}
						if (isPrimitiveString(checker.getTypeAtLocation(expression), checker))
							ranges.push([start, end]);
					};
					if (compilation) {
						const sourceMap = new SourceMap(compilation.mappings);
						for (const child of authoredChildren(compilation.sourceAst, record.source)) {
							accept(
								mappedChild(child, sourceMap, analysis.children, sourceFile.text.length),
								child.start,
								child.end,
							);
						}
					} else {
						for (const child of analysis.children.values()) {
							const expression = unparenthesizedExpression(child.expression);
							accept(child.expression, expression.getStart(sourceFile), expression.end);
						}
					}
				}
			}
		}
		const facts = freezeFacts(file, record, version, ranges);
		factsCache.set(file, facts);
		return facts;
	};

	const invalidate = (filename) => {
		assertAlive();
		generation++;
		if (filename === undefined) {
			overrides.clear();
			sources.clear();
			virtualSources.clear();
		} else {
			const file = normalize(filename);
			overrides.delete(file);
			sources.delete(file);
			virtualSources.delete(file);
		}
		// Re-reading the config also discovers files newly included by its globs.
		// Recreate Volar's host so changed module-resolution options cannot reuse a
		// cache created for the previous configuration.
		config = null;
		rootFileNames = null;
		disposeService();
	};

	const dispose = () => {
		if (disposed) return;
		disposed = true;
		disposeService();
		overrides.clear();
		sources.clear();
		virtualSources.clear();
		extraRoots.clear();
		config = null;
		rootFileNames = null;
	};

	loadConfig();
	return Object.freeze({ snapshot, invalidate, dispose });
}
