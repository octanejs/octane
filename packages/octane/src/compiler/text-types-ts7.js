/**
 * Text type facts on TypeScript 7, whose compiler runs in a native process
 * behind `typescript/unstable/sync`.
 *
 * TypeScript 7 cannot run Octane's compiler in-process the way the classic
 * backend's Volar language service does. Instead, the API's file system
 * callbacks serve each authored `X.tsrx` as a virtual `X.tsrx.tsx` holding the
 * same virtual TSX, compiled with the same options as the classic backend.
 * TypeScript resolves `./X.tsrx` to it by appending `.tsx`, the way it resolves
 * any unrecognized extension. An extensionless `./X` (which Vite resolves to
 * `X.tsrx`) reaches a virtual `X.ts` that re-exports it, so both spellings
 * name one module. No external process or content mapper runs project code.
 *
 * The checked program is a synthetic program over the tsconfig's options and
 * root files, so roots added by snapshots need no tsconfig on disk. Every
 * change yields a new API snapshot; the native process keeps unchanged files.
 */

import { readdirSync, readFileSync, realpathSync, statSync, existsSync } from 'node:fs';
import nodePath from 'node:path';
import { FileMap, SourceMap } from '@volar/language-core';
import { normalizeRendererConfig } from './renderers.js';
import { normalizeTextTypeFilename, textTypeSourceVersion } from './text-type-facts.js';
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

/** @typedef {{ source: string, version: string }} SourceRecord */

const VIRTUAL_SUFFIX = '.tsx';

/** Whether the file system folds case, tested the way TypeScript does. */
function fileSystemIsCaseSensitive() {
	const file = import.meta.filename;
	const swapped = file.replace(/\w/g, (character) => {
		const upper = character.toUpperCase();
		return character === upper ? character.toLowerCase() : upper;
	});
	return swapped === file || !existsSync(swapped);
}

/**
 * @param {{ sync: any, ast: any, is: any }} typescript
 * @returns {import('./text-types-shared.js').TextTypeHost}
 */
function nativeTextTypeHost(typescript) {
	return {
		is: typescript.is,
		TypeFlags: typescript.sync.TypeFlags,
		forEachChild: (node, visit) => node.forEachChild(visit),
		unionMembersOf: (type) => (type.isUnionType() ? type.getTypes() : undefined),
		intersectionMembersOf: (type) => (type.isIntersectionType() ? type.getTypes() : undefined),
	};
}

/**
 * @param {{ version: string, sync: any, ast: any, is: any }} typescript
 * @param {import('./typescript.js').TextTypeProjectOptions} options
 * @returns {import('./typescript.js').TextTypeProject}
 */
export function createNativeTextTypeProject(typescript, options) {
	const { configFilename, directory, rendererRoot } = textTypeProjectPaths(options);
	const { sync } = typescript;
	const host = nativeTextTypeHost(typescript);
	const renderers = normalizeRendererConfig(options.renderers);
	const caseSensitive = fileSystemIsCaseSensitive();
	const sources = new FileMap(caseSensitive);
	const overrides = new FileMap(caseSensitive);
	const virtualSources = new FileMap(caseSensitive);
	const extraRoots = new Set();
	const factsCache = new FileMap(caseSensitive);
	const analyses = new FileMap(caseSensitive);
	// Paths whose contents the native process may hold from an earlier snapshot.
	const changedPaths = new Set();
	let invalidateAll = false;
	let disposed = false;
	let config = null;
	let rootFileNames = null;
	let api = null;
	let apiSnapshot = null;
	let currentProgram = null;
	let currentProjectVersion = null;

	const normalize = (filename) => absoluteFilename(filename, directory);
	const assertAlive = () => {
		if (disposed) throw new Error('This Octane text type project has been disposed.');
	};
	const virtualName = (file) => (file.endsWith('.tsrx') ? file + VIRTUAL_SUFFIX : file);

	/** @returns {SourceRecord} */
	const sourceRecord = (source) => ({ source, version: textTypeSourceVersion(source) });

	/** @returns {SourceRecord | undefined} */
	const readSource = (filename) => {
		const file = normalize(filename);
		if (overrides.has(file)) return overrides.get(file);
		if (sources.has(file)) return sources.get(file);
		let record;
		try {
			record = sourceRecord(readFileSync(file, 'utf8'));
		} catch {
			record = undefined;
		}
		sources.set(file, record);
		return record;
	};
	const exists = (file) => overrides.has(file) || existsSync(file);

	/** The authored `.tsrx` a virtual `X.tsrx.tsx` stands for, unless one exists on disk. */
	const authoredOf = (file) => {
		if (!file.endsWith('.tsrx' + VIRTUAL_SUFFIX)) return null;
		const authored = file.slice(0, -VIRTUAL_SUFFIX.length);
		return !existsSync(file) && exists(authored) ? authored : null;
	};
	/**
	 * The authored `.tsrx` an extensionless import reaches through a virtual
	 * `X.ts`. TypeScript tries `.ts`, `.tsx`, then `.d.ts`, and Vite prefers both
	 * TypeScript extensions to `.tsrx`, so a real file of either kind wins.
	 */
	const reexportedOf = (file) => {
		if (!file.endsWith('.ts') || file.endsWith('.d.ts')) return null;
		const base = file.slice(0, -3);
		return exists(base + '.tsrx') &&
			!exists(file) &&
			!exists(base + '.tsx') &&
			!exists(base + '.d.ts')
			? base + '.tsrx'
			: null;
	};

	const virtualCode = (file) => {
		const record = readSource(file);
		if (record === undefined) return undefined;
		const cached = virtualSources.get(file);
		if (cached?.version === record.version) return cached;
		let compilation = null;
		try {
			compilation = compileToVolarMappings(record.source, rendererFilename(file, rendererRoot), {
				renderers,
				knownAttributeSpreads: options.knownAttributeSpreads,
			});
		} catch {
			// Broken authored syntax is not evidence. Passing the authored text
			// through lets TypeScript recover normally; no synthetic TS is assembled.
		}
		const virtual = {
			version: record.version,
			compilation,
			code: compilation?.code ?? record.source,
		};
		virtualSources.set(file, virtual);
		return virtual;
	};

	const directoryListing = (directoryName) => {
		const prefix = directoryName.replace(/\/$/, '') + '/';
		const overridden = [...overrides.keys()].filter((file) => file.startsWith(prefix));
		let entries;
		try {
			entries = readdirSync(directoryName, { withFileTypes: true });
		} catch {
			entries = [];
		}
		const named = (extension) => (entry) => entry.name.endsWith(extension);
		if (!entries.some(named('.tsrx')) && overridden.length === 0) return undefined;
		const files = new Set();
		const directories = new Set();
		for (const entry of entries) {
			let kind = entry;
			if (entry.isSymbolicLink()) {
				try {
					kind = statSync(nodePath.join(directoryName, entry.name));
				} catch {
					continue;
				}
			}
			if (kind.isFile()) files.add(entry.name);
			else if (kind.isDirectory()) directories.add(entry.name);
		}
		for (const file of overridden) {
			const [name, ...rest] = file.slice(prefix.length).split('/');
			if (rest.length === 0) files.add(name);
			else directories.add(name);
		}
		for (const name of files) if (name.endsWith('.tsrx')) files.add(name + VIRTUAL_SUFFIX);
		return { files: [...files], directories: [...directories] };
	};

	// TypeScript 7 asks before reading the disk; `undefined` falls back to it.
	const fileSystem = {
		readFile: (filename) => {
			const file = normalize(filename);
			const authored = authoredOf(file);
			if (authored !== null) return virtualCode(authored)?.code ?? null;
			const reexported = reexportedOf(file);
			if (reexported !== null) {
				const specifier = JSON.stringify('./' + nodePath.posix.basename(reexported));
				return `export * from ${specifier};\nexport { default } from ${specifier};\n`;
			}
			return overrides.get(file)?.source;
		},
		fileExists: (filename) => {
			const file = normalize(filename);
			return authoredOf(file) !== null || reexportedOf(file) !== null || overrides.has(file)
				? true
				: undefined;
		},
		directoryExists: (filename) => {
			const prefix = normalize(filename).replace(/\/$/, '') + '/';
			for (const file of overrides.keys()) if (file.startsWith(prefix)) return true;
			return undefined;
		},
		getAccessibleEntries: (filename) => directoryListing(normalize(filename)),
		realpath: (filename) => {
			const file = normalize(filename);
			const authored = authoredOf(file);
			if (authored === null) return undefined;
			try {
				return normalizeTextTypeFilename(realpathSync(authored)) + VIRTUAL_SUFFIX;
			} catch {
				return file;
			}
		},
	};

	const ensureApi = () => {
		api ??= new sync.API({ cwd: directory, fs: fileSystem });
		return api;
	};

	const loadConfig = () => {
		if (config !== null) return config;
		const parsed = ensureApi().parseConfigFile(configFilename);
		// An in-memory snapshot may be the project's first file. All other config
		// errors are actionable configuration failures, not failed type proofs.
		const errors = parsed.errors.filter(
			(error) =>
				error.category === sync.DiagnosticCategory.Error &&
				error.code !== 18002 &&
				error.code !== 18003,
		);
		if (errors.length > 0) throw new Error(errors.map((error) => error.text).join('\n'));
		// TypeScript 7 matches only its own extensions, so match the same specs
		// again with each `.tsrx` pattern naming the virtual `.tsrx.tsx` modules.
		// `raw` holds the merged specs, relative to the tsconfig's directory.
		const specs = { extends: configFilename };
		for (const key of ['files', 'include', 'exclude']) {
			const value = parsed.raw?.[key];
			if (Array.isArray(value)) {
				specs[key] = value.map((spec) =>
					typeof spec === 'string' && spec.endsWith('.tsrx') ? spec + VIRTUAL_SUFFIX : spec,
				);
			}
		}
		const matched = ensureApi().parseJsonConfigFileContent(specs, {
			configDirectory: directory,
		});
		const fileNames = matched.fileNames.map((file) => {
			const name = normalize(file);
			return authoredOf(name) ?? name;
		});
		const { configFilePath: _configFilePath, ...parsedOptions } = parsed.options;
		config = {
			fileNames,
			fileNameSet: new Set(fileNames),
			projectReferences: parsed.projectReferences,
			options: {
				...parsedOptions,
				jsx: parsedOptions.jsx ?? sync.JsxEmit.Preserve,
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
	const releaseSnapshot = () => {
		apiSnapshot?.dispose();
		apiSnapshot = null;
		clearProofs();
	};
	const changed = (file) => {
		virtualSources.delete(file);
		changedPaths.add(file);
		if (file.endsWith('.tsrx')) {
			changedPaths.add(virtualName(file));
			changedPaths.add(file.slice(0, -'.tsrx'.length) + '.ts');
		}
		releaseSnapshot();
	};

	const ensureProgram = () => {
		if (apiSnapshot !== null) return currentProgram;
		const { options: compilerOptions, projectReferences } = loadConfig();
		const fileNotifications = invalidateAll
			? { invalidateAll: true }
			: changedPaths.size > 0
				? { changed: [...changedPaths] }
				: undefined;
		apiSnapshot = ensureApi().createSnapshot({
			fileNotifications,
			createPrograms: [
				{
					rootFiles: roots().map(virtualName),
					compilerOptions,
					options: projectReferences ? { projectReferences } : undefined,
				},
			],
		});
		invalidateAll = false;
		changedPaths.clear();
		currentProgram = apiSnapshot.operation.createdPrograms[0];
		return currentProgram;
	};

	/** The authored file and content version a program file stands for. */
	const programInput = (program, name) => {
		const file = normalize(name);
		const authored = authoredOf(file);
		const reexported = authored === null ? reexportedOf(file) : null;
		const input = authored ?? file;
		const version = reexported
			? `reexport:${readSource(reexported)?.version}`
			: (readSource(input)?.version ?? textTypeSourceVersion(program.getSourceFile(name).text));
		return [input, version, program.getSourceFileMetadata(name)?.impliedNodeFormat ?? null];
	};

	const projectVersion = (program) => {
		if (currentProjectVersion !== null) return currentProjectVersion;
		const inputs = program
			.getSourceFileNames()
			.map((name) => programInput(program, name))
			.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
		currentProjectVersion = textTypeSourceVersion(
			stableJson({
				typescript: `${typescript.version} (native)`,
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

	const isError = (diagnostic) => diagnostic.category === sync.DiagnosticCategory.Error;
	const analyzeFile = (program, file, sourceFile) => {
		const cached = analyses.get(file);
		if (cached !== undefined) return cached;
		const name = virtualName(file);
		const syntaxErrors = program.getSyntacticDiagnostics(name).some(isError);
		const analysis = {
			syntaxErrors,
			children: syntaxErrors ? new Map() : indexJsxChildren(host, sourceFile),
			errors: syntaxErrors
				? []
				: program
						.getSemanticDiagnostics(name)
						.filter(isError)
						.map((diagnostic) => ({
							start: diagnostic.pos,
							length: diagnostic.end - diagnostic.pos,
						})),
		};
		analyses.set(file, analysis);
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
		const program = ensureProgram();
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
		const sourceFile = strictNullChecks ? program.getSourceFile(virtualName(file)) : undefined;
		if (sourceFile !== undefined) {
			const virtual = file.endsWith('.tsrx') ? virtualCode(file) : null;
			const compilation = virtual?.compilation;
			// The native process may only hold the text this backend served it.
			const validSource = virtual
				? virtual.version === record.version &&
					compilation !== null &&
					compilation.errors.length === 0 &&
					sourceFile.text === compilation.code
				: sourceFile.text === record.source;
			if (validSource) {
				const analysis = analyzeFile(program, file, sourceFile);
				if (!analysis.syntaxErrors) {
					const candidates = [];
					const accept = (expression, start, end) => {
						if (!expression) return;
						const generatedStart = expression.getStart(sourceFile);
						if (
							!analysis.errors.some((error) =>
								overlapsDiagnostic(error, generatedStart, expression.end),
							)
						) {
							candidates.push({ expression, start, end });
						}
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
					if (candidates.length > 0) {
						const checker = program.getProject().checker;
						// One request for every child's type; each is a round trip otherwise.
						const types = checker.getTypeAtLocation(
							candidates.map((candidate) => candidate.expression),
						);
						candidates.forEach(({ start, end }, index) => {
							const kind = primitiveTextKind(host, types[index], checker);
							if (kind === 1) stringRanges.push([start, end]);
							else if (kind === 2) primitiveRanges.push([start, end]);
						});
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
		if (filename === undefined) {
			overrides.clear();
			sources.clear();
			virtualSources.clear();
			invalidateAll = true;
		} else {
			const file = normalize(filename);
			overrides.delete(file);
			sources.delete(file);
			changed(file);
		}
		// Re-reading the config also discovers files newly included by its globs.
		config = null;
		rootFileNames = null;
		releaseSnapshot();
	};

	const dispose = () => {
		if (disposed) return;
		disposed = true;
		releaseSnapshot();
		api?.close();
		api = null;
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
