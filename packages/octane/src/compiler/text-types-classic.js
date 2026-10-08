/**
 * Text type facts on the classic TypeScript compiler API (TypeScript 5.9 and 6):
 * a Volar language service over the consumer tsconfig whose `.tsrx` files are
 * Octane's virtual TSX.
 */

import { createLanguage, FileMap, SourceMap } from '@volar/language-core';
import { createLanguageServiceHost, resolveFileLanguageId } from '@volar/typescript';
import { normalizeRendererConfig } from './renderers.js';
import { textTypeSourceVersion } from './text-type-facts.js';
import {
	absoluteFilename,
	assertSnapshotArguments,
	authoredChildren,
	freezeFacts,
	indexJsxChildren,
	mappedChild,
	overlapsDiagnostic,
	primitiveTextKind,
	rendererFilename,
	stableJson,
	textTypeProjectPaths,
	unparenthesizedExpression,
} from './text-types-shared.js';
import { compileToVolarMappings } from './volar.js';

/** @typedef {import('typescript').SourceFile} SourceFile */
/** @typedef {import('typescript').Program} Program */
/** @typedef {{ source: string, version: string, snapshot: import('typescript').IScriptSnapshot }} SourceRecord */

/**
 * @param {typeof import('typescript')} ts
 * @returns {import('./text-types-shared.js').TextTypeHost}
 */
function classicTextTypeHost(ts) {
	return {
		is: ts,
		TypeFlags: ts.TypeFlags,
		forEachChild: ts.forEachChild,
		unionMembersOf: (type) => (type.isUnion() ? type.types : undefined),
		intersectionMembersOf: (type) => (type.isIntersection() ? type.types : undefined),
	};
}

/**
 * @param {typeof import('typescript')} ts
 * @param {import('./typescript.js').TextTypeProjectOptions} options
 * @returns {import('./typescript.js').TextTypeProject}
 */
export function createClassicTextTypeProject(ts, options) {
	const { configFilename, directory, rendererRoot } = textTypeProjectPaths(options);
	const host = classicTextTypeHost(ts);
	const tsrxExtensions = [
		{ extension: 'tsrx', isMixedContent: false, scriptKind: ts.ScriptKind.Deferred },
	];
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

	/** @returns {SourceRecord} */
	const sourceRecord = (source) => ({
		source,
		version: textTypeSourceVersion(source),
		snapshot: ts.ScriptSnapshot.fromString(source),
	});

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
			tsrxExtensions,
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
			compilation = compileToVolarMappings(source, rendererFilename(file, rendererRoot), {
				renderers,
				knownAttributeSpreads: options.knownAttributeSpreads,
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
				extraFileExtensions: tsrxExtensions,
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
				knownAttributeSpreads: options.knownAttributeSpreads,
				rendererRoot,
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
			children: syntaxErrors ? new Map() : indexJsxChildren(host, sourceFile),
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
		assertSnapshotArguments(file, source);
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
		const stringRanges = [];
		const primitiveRanges = [];
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
						const kind = primitiveTextKind(host, checker.getTypeAtLocation(expression), checker);
						if (kind === 1) stringRanges.push([start, end]);
						else if (kind === 2) primitiveRanges.push([start, end]);
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
							const expression = unparenthesizedExpression(host, child.expression);
							accept(child.expression, expression.getStart(sourceFile), expression.end);
						}
					}
				}
			}
		}
		const facts = freezeFacts(file, record, version, stringRanges, primitiveRanges);
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
