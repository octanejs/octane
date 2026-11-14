import { createScopedStorePlanner, runtimeTargets } from './scoped-store-contract.js';
import { parseStaticSvg } from './path-svg.js';
import { resourceHints, retainedLiteralExports, storeSources } from './store-inputs.js';
import type {
	CodemodOptions,
	CodemodResult,
	Compiler,
	FileResult,
	Note,
	TransformOptions,
	TransformResult,
} from './types.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { findRoot, readInstalled, scanSourceFiles } from '@octanejs/cli';
import { DATA } from '@octanejs/cli/data';
import { parseSync } from '@tsrx/oxc/parser';
import ts from 'typescript';
import { finding, loadCompiler, thrown } from './compiler.js';
import { isReactMotion, PORTED_PACKAGES } from './mappings.js';
import { strengthen } from './strong.js';
import {
	bind,
	CONTEXT_ALIAS,
	CONTEXT_PROVIDER_GETTER,
	MAP_CALLBACK_SCOPE,
	MAP_PARAMETER_TDZ,
	MAP_PARAMETER_WRITE,
	projectTypeAt,
	textKind,
	transformModule,
} from './transform.js';
import { directRendererCalls, nativeExternalStore } from './local-react-hook.js';
import { forwardedProps } from './forwarded-props.js';
import {
	importsReactBridge,
	islandComponents,
	executableImports,
	hostedServerComponents,
	intrinsicReactExports,
	octaneRootComponents,
	reactServerComponents,
	retainedReactComponentReturns,
	reverseIslandExports,
} from './react-island-sources.js';

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const ADAPTER_OCTANE_VERSION = /^0\.(?:16\.(?:[7-9]|[1-9]\d+)|1[78]\.(?:0|[1-9]\d*))$/;
// React Intl 7.1.14. Both entry points re-export a hook that calls React.useContext.
const INTL_HOOK_FILES = {
	'index.js': '8f5854dadcd055f066234e13a344bd0b102aea2d50ddfd2f0cf12e9f48116059',
	'lib/index.js': '208130dc122cbb84cbc0d4cce54fd7f458954f45d2cd5dc505d7263686ca6093',
	'src/components/useIntl.js': '7f26c3c5aebaf874aa2ee7f56952358530c246382f7ca9e729a3ee33d196d6c8',
	'lib/src/components/useIntl.js':
		'36bb0433939586c08e79a211372987b4173c73552f75d2ae66b6250bdf1f3b8c',
};
/** React packages and the Octane entry point that replaces each. */
const CATALOG = { ...DATA.reactPackages, ...PORTED_PACKAGES };
const MOTION_BINDING = '@octanejs/motion';
const MOTION_VERSION = DATA.bindings.find(({ name }) => name === MOTION_BINDING)!.version;
const MOTION_EXPORTS = new Set(DATA.motionExports);
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];
/** A package that, by its name, renders through React. */
const REACT_PACKAGE = /^(?:react-|@[^/]+\/react(?:-|\/|$)|[^/]+\/react$)|-react(?:\/|$)/;

/**
 * Migrate every React module under `paths`.
 *
 * Two passes: the first decides which modules become `.tsrx`, the second
 * rewrites every module with that rename map in hand, so an import of a
 * renamed module is updated wherever it is.
 */
export async function runCodemod(
	paths: string[],
	options: CodemodOptions = {},
): Promise<CodemodResult> {
	const write = options.write !== false;
	const target = options.target ?? 'tsrx';
	const strong = options.strong === true && target === 'tsrx';
	const first = path.resolve(paths[0] ?? '.');
	const root = path.resolve(
		options.root ??
			findRoot(
				fs.statSync(first, { throwIfNoEntry: false })?.isFile() ? path.dirname(first) : first,
			),
	);
	const known = new Set(paths.flatMap((entry) => collect(path.resolve(entry))));
	const files = [...known];
	const renames: Map<string, string> = new Map();
	const exports: Map<string, TransformResult['exports']> = new Map();
	const owners: Map<string, string> = new Map();
	const outputDirectories = new Map<string, string>();
	function entryKey(file: string) {
		// A symlinked parent can name the same output. Keep the last path component
		// lexical because the write owns that directory entry, not a symlink target.
		const dir = path.dirname(file);
		let physical = outputDirectories.get(dir);
		if (physical === undefined) {
			// On macOS the native lookup also returns the stored Unicode spelling.
			physical = process.platform === 'darwin' ? fs.realpathSync.native(dir) : fs.realpathSync(dir);
			outputDirectories.set(dir, physical);
		}
		return path.join(physical, path.basename(file));
	}
	function outputKey(file: string) {
		const output = entryKey(file);
		return ts.sys.useCaseSensitiveFileNames ? output : output.toLowerCase();
	}
	const normalizedOwners =
		process.platform === 'darwin' && files.some((file) => /[^\x00-\x7F]/.test(path.basename(file)))
			? new Map<string, string[]>()
			: undefined;
	function normalizedOwner(key: string, file: string) {
		if (!normalizedOwners) return;
		const group = path.join(path.dirname(key), path.basename(key).normalize('NFC'));
		let candidates = normalizedOwners.get(group);
		if (!candidates) normalizedOwners.set(group, (candidates = []));
		// Use an ordinary existing entry to probe the other stem without following leaf links.
		const regularFile = (name: string) => fs.lstatSync(name, { throwIfNoEntry: false })?.isFile();
		const sameStem = (source: string, other: string) => {
			const alternate = other.slice(0, -path.extname(other).length) + path.extname(source);
			return (
				regularFile(source) &&
				regularFile(alternate) &&
				fs.realpathSync.native(source) === fs.realpathSync.native(alternate)
			);
		};
		const previous = candidates.filter(
			(candidate) => sameStem(candidate, file) || sameStem(file, candidate),
		);
		if (previous.length === 0 || !previous.some(regularFile)) candidates.push(file);
		return previous;
	}
	const conflicts: Map<string, FileResult> = new Map();
	const conflictFor = (file: string, source: string, output: string, reason: string) =>
		unchangedFile(path.relative(root, file), source, {
			rule: 'rename-conflict',
			severity: 'error',
			line: 1,
			message: `Cannot migrate to ${path.relative(root, output)} because it ${reason}.`,
		});
	for (const file of files) {
		const source = fs.readFileSync(file, 'utf8');
		const result = transformModule(source, file, { target });
		exports.set(file, result.exports);
		if (!result.template) continue;
		const output = file.replace(/\.(?:jsx?|tsx)$/, '.tsrx');
		if (output === file) continue;
		const key = outputKey(output);
		const direct = owners.get(key);
		const normalized = normalizedOwner(key, file);
		const previous = direct ?? normalized?.[0];
		if (!direct) owners.set(key, previous ?? file);
		if (previous || fs.lstatSync(output, { throwIfNoEntry: false })) {
			const reason = previous
				? `is also the target of ${path.relative(root, previous)}`
				: 'already exists';
			const conflict = conflictFor(file, source, output, reason);
			if (write) return blockedWrite(root, conflict);
			conflicts.set(file, conflict);
			for (const owner of new Set([previous, ...(normalized ?? [])])) {
				const ownerOutput = owner && renames.get(owner);
				if (owner && ownerOutput) {
					conflicts.set(
						owner,
						conflictFor(
							owner,
							fs.readFileSync(owner, 'utf8'),
							ownerOutput,
							`is also the target of ${path.relative(root, file)}`,
						),
					);
					renames.delete(owner);
				}
			}
			continue;
		}
		renames.set(file, output);
	}
	// A colliding source remains in place, so its imports and export contracts
	// must not participate in the preview as if it had been migrated.
	for (const file of conflicts.keys()) exports.delete(file);
	const config = tsconfigOptions(root);
	const strictConfig = (config?.strictNullChecks ?? config?.strict) ? config : null;
	let program: ts.Program | undefined;
	function typesOf(file: string): TransformOptions['types'] {
		if (!strictConfig || options.projectTypes === false) return;
		// Even one input can import a large graph. Bind it only for a rewrite that needs its types.
		program ??= ts.createProgram(
			files.filter((name) => /\.[cm]?tsx?$/.test(name)),
			{ ...strictConfig, noEmit: true, noUncheckedIndexedAccess: true },
		);
		const sourceFile = program.getSourceFile(file);
		if (sourceFile) return { sourceFile, checker: program.getTypeChecker() };
	}
	const contextsOf = contextIndex(exports, known);
	const contextPaths = Object.keys(config?.paths ?? {}).map((pattern) => pattern.split('*'));
	const renamed = renamedImports(root, config, renames);
	const foldNames = process.platform === 'darwin';
	const leafKey = (file: string) => {
		const name = path.basename(file);
		return foldNames ? name.toLowerCase() : name;
	};
	const sourceNames = new Set([...renames.keys()].map(leafKey));
	const sourceEntries = new Map([...renames.keys()].map((file) => [entryKey(file), file]));
	const foldedSources = new Map<string, string[]>();
	if (foldNames) {
		for (const [entry, source] of sourceEntries) {
			const key = path.join(path.dirname(entry), leafKey(entry));
			const group = foldedSources.get(key);
			if (group) group.push(source);
			else foldedSources.set(key, [source]);
		}
	}
	function linkedRename(file: string) {
		if (renames.has(path.normalize(file))) return;
		const name = leafKey(file);
		if (!sourceNames.has(name) || !fs.existsSync(file)) return;
		const entry = entryKey(file);
		const selected = sourceEntries.get(entry);
		if (selected) return selected;
		const folded = foldNames && foldedSources.get(path.join(path.dirname(entry), name));
		if (!folded) return;
		// APFS reports the stored spelling. A leaf symlink or hard link must
		// remain a distinct entry even when it reaches the same file.
		if (!fs.lstatSync(file, { throwIfNoEntry: false })?.isFile()) return;
		const actual = fs.realpathSync.native(file);
		return folded.find(
			(source) =>
				fs.lstatSync(source, { throwIfNoEntry: false })?.isFile() &&
				fs.realpathSync.native(source) === actual,
		);
	}
	const resolveRename = (from: string, specifier: string) =>
		renamed(from, specifier)?.specifier ?? null;
	const propChecks = new Map<string, ReturnType<typeof propsOf>>();
	function forwardedProp(
		from: string,
		specifier: string,
		name: string,
		prop: string,
		destination: PropDestination,
		ordinaryCaller?: boolean,
		depth = 0,
	) {
		if (
			destination === 'forwarded-text' &&
			ts.findConfigFile(path.dirname(from), ts.sys.fileExists) !== rootProject
		)
			return false;
		const match = renamed(from, specifier);
		if (!match || (!specifier.startsWith('.') && match.specifier.startsWith('.'))) return false;
		if (
			destination !== 'text' &&
			(!match.file.startsWith(root + path.sep) ||
				match.file.split(path.sep).includes('node_modules') ||
				fs.realpathSync(match.file) !==
					path.join(fs.realpathSync(root), path.relative(root, match.file)) ||
				ts.findConfigFile(path.dirname(match.file), ts.sys.fileExists) !== rootProject)
		)
			return false;
		let inspect = propChecks.get(match.file);
		if (!inspect) {
			inspect = propsOf(
				match.file,
				(module, name, slot, depth) =>
					forwardedProp(match.file, module, name, slot, 'render', true, depth),
				(module, name, prop) => forwardedProp(match.file, module, name, prop, 'host-text', true),
				() => typesOf(match.file),
			);
			propChecks.set(match.file, inspect);
		}
		return inspect(destination, name, prop, ordinaryCaller, depth);
	}

	// resolveRename returns only an on-disk source that actually won import resolution.
	const elementExports = new Map<string, Set<string>>();
	const descriptorExports = new Map<string, Set<string>>();
	for (const [from, to] of renames) {
		const record = exports.get(from);
		if (record?.elementChildren) {
			elementExports.set(
				to,
				new Set(record.elementChildren.flatMap((d) => (d.exported ? [d.exported] : []))),
			);
		}
		if (record?.descriptorChildren) descriptorExports.set(to, new Set(record.descriptorChildren));
	}
	const verify = options.verify !== false;
	const compiler = verify || strong ? await loadCompiler(root) : null;
	const packages: Map<string, string> = new Map();
	const missing: Map<string, CodemodResult['missing'][number]> = new Map();
	// `ReactCompat` hosts a component from a package with no port in a React
	// root, from 19.2 within the React 19 series it supports.
	const reactCompat = ['react', 'react-dom'].every((name) =>
		/^19\.(?:[2-9]|\d{2,})\./.test(readInstalled(root, name)?.version ?? ''),
	);
	const rootProject = ts.findConfigFile(root, ts.sys.fileExists);
	function automaticReactJsx(file: string) {
		// A nested project can compile the same file with another JSX factory.
		return (
			config?.jsx === ts.JsxEmit.ReactJSX &&
			!config.jsxFactory &&
			!config.jsxFragmentFactory &&
			(!config.jsxImportSource || config.jsxImportSource === 'react') &&
			ts.findConfigFile(path.dirname(file), ts.sys.fileExists) === rootProject
		);
	}
	function reactStoreComponent(file: string, specifier: string) {
		if (!reactCompat || !unportedName(specifier, file) || !automaticReactJsx(file)) return false;
		const dir = path.dirname(file);
		const name = packageName(specifier);
		const lib = readInstalled(dir, name);
		if (
			!lib ||
			lib.manifest.name !== name ||
			!['peerDependencies', 'dependencies'].some(
				(field) => record(lib.manifest[field]).react !== undefined,
			)
		)
			return false;
		// A linked workspace package can itself migrate. A paths alias can also shadow
		// the installed component or the JSX runtime, even when their packages exist.
		const pkg = fs.realpathSync(lib.dir);
		if (!pkg.split(path.sep).includes('node_modules')) return false;
		return [specifier, 'react/jsx-runtime'].every((module) => {
			const target = originalModule(file, module);
			return (
				!!target &&
				(module !== specifier ||
					fs.realpathSync(target.resolvedFileName).startsWith(pkg + path.sep))
			);
		});
	}
	function originalModule(file: string, module: string, options = config) {
		const bindings = { moduleResolution: ts.ModuleResolutionKind.Bundler, ...options };
		const target = ts.resolveModuleName(module, file, bindings, ts.sys).resolvedModule;
		const original = ts.resolveModuleName(
			module,
			file,
			{ ...bindings, paths: undefined, baseUrl: undefined },
			ts.sys,
		).resolvedModule;
		return target?.resolvedFileName === original?.resolvedFileName ? (target ?? null) : undefined;
	}
	function installedReact(file: string, module: 'react' | 'react-dom' = 'react') {
		const dir = path.dirname(file);
		if (ts.findConfigFile(dir, ts.sys.fileExists) !== rootProject) return false;
		const target = originalModule(file, module);
		if (!target || ![module, `@types/${module}`].includes(target.packageId?.name ?? ''))
			return false;
		// TypeScript can resolve declarations even when the runtime is missing or linked locally.
		const runtime = readInstalled(dir, module);
		return (
			runtime?.manifest.name === module &&
			fs.realpathSync(runtime.dir).split(path.sep).includes('node_modules') &&
			fs.realpathSync(target.resolvedFileName).split(path.sep).includes('node_modules')
		);
	}
	let physicalRoot: string | undefined;
	const retainedStoreArguments = new Map<string, ReadonlySet<string> | null>();
	const descriptorModules = new Map<string, ReadonlySet<string> | null>();
	function retainedStoreArgument(file: string, source: string, name: string) {
		const key = file + '\0' + source;
		let retained = retainedStoreArguments.get(key);
		if (retained === undefined) {
			retained = retainsPackageTarget(file, source);
			retainedStoreArguments.set(key, retained);
		}
		return retained?.has(name) ?? false;
	}
	function retainsPackageTarget(file: string, source: string) {
		if (resolveRename(file, source) || catalogName(source) !== null || unportedName(source, file))
			return null;
		const target = originalModule(file, source);
		if (!target?.isExternalLibraryImport || !installedReact(file)) return null;
		try {
			const runtime = createRequire(file).resolve(source);
			if (!path.isAbsolute(runtime)) return null;
			const real = fs.realpathSync(runtime);
			if (known.has(real) || known.has(target.resolvedFileName)) return null;
			const authored = path.relative((physicalRoot ??= fs.realpathSync(root)), real);
			if (
				!authored.startsWith('..' + path.sep) &&
				!path.isAbsolute(authored) &&
				!authored.split(path.sep).includes('node_modules')
			)
				return null;
			const [entry] = runtimeTargets(source, real, file, true);
			if (
				fs.realpathSync(target.resolvedFileName) !== real ||
				!entry ||
				fs.realpathSync(entry) !== real
			)
				return null;
			let descriptors = descriptorModules.get(real);
			if (descriptors === undefined) {
				descriptors = retainedLiteralExports(real);
				descriptorModules.set(real, descriptors);
			}
			return descriptors;
		} catch {
			return null;
		}
	}
	const inlineCompatDirs = new Map<string, boolean>();
	function supportsInlineReactCompat(file: string) {
		const issuer = path.dirname(file);
		if (ts.findConfigFile(issuer, ts.sys.fileExists) !== rootProject) return false;
		const installed = readInstalled(issuer, 'octane');
		if (installed?.manifest.name !== 'octane') return false;
		const dir = fs.realpathSync(installed.dir);
		if (compiler) {
			try {
				if (createRequire(file).resolve('octane/compiler') !== compiler.from) return false;
			} catch {
				return false;
			}
		}
		const exports = record(installed.manifest.exports);
		return ['react', 'react/server'].every((name) => {
			const entry = exports['./' + name];
			const conditions = record(entry);
			const types = typeof entry === 'string' ? entry : conditions.types;
			const target = originalModule(file, 'octane/' + name)?.resolvedFileName;
			if (
				typeof types !== 'string' ||
				!target ||
				fs.realpathSync(target) !== path.resolve(dir, types)
			)
				return false;
			if (typeof entry !== 'string' && typeof conditions.default !== 'string') return false;
			// Published packages resolve types separately from the Node and bundler code.
			const entries = typeof entry === 'string' ? [entry] : Object.values(conditions);
			return entries.every((value) => {
				if (typeof value !== 'string' || !value.startsWith('./')) return false;
				const file = path.resolve(dir, value);
				if (!ts.sys.fileExists(file) || !fs.realpathSync(file).startsWith(dir + path.sep))
					return false;
				const source = ts.createSourceFile(
					file,
					fs.readFileSync(file, 'utf8'),
					ts.ScriptTarget.Latest,
				);
				return source.statements.some(
					(statement) =>
						ts.isExportDeclaration(statement) &&
						!statement.isTypeOnly &&
						statement.exportClause &&
						ts.isNamedExports(statement.exportClause) &&
						statement.exportClause.elements.some(
							(item) => !item.isTypeOnly && item.name.text === 'ReactCompatInline',
						),
				);
			});
		});
	}
	function bindingOptions(file: string) {
		const dir = path.dirname(file);
		return ts.findConfigFile(dir, ts.sys.fileExists) === rootProject
			? config
			: tsconfigOptions(dir);
	}
	const installedMotionExports = new Map<string, ReadonlySet<string> | null>();
	const motionExportsByIssuer = new Map<string, ReadonlySet<string> | null>();
	function motionExports(file: string): ReadonlySet<string> | null {
		const dir = path.dirname(file);
		const known = motionExportsByIssuer.get(dir);
		if (known !== undefined) return known;
		const installed = readInstalled(dir, MOTION_BINDING);
		const declarations = bindingDeclarations(root, dir, MOTION_BINDING);
		let actual: ReadonlySet<string> | null = null;
		if (
			installed &&
			!declarations.some(
				(spec) =>
					typeof spec === 'string' &&
					/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i.test(spec) &&
					spec !== installed.version,
			)
		) {
			const physical = fs.realpathSync(installed.dir);
			const cached = installedMotionExports.get(physical);
			actual = cached === undefined ? readMotionExports(installed.manifest, physical) : cached;
			installedMotionExports.set(physical, actual);
		} else if (
			!installed &&
			declarations.every((spec) => catalogBindingVersion(spec, MOTION_VERSION))
		) {
			actual = MOTION_EXPORTS;
		}
		motionExportsByIssuer.set(dir, actual);
		return actual;
	}
	function bindingExports(file: string, from: string, to: string) {
		return to === MOTION_BINDING && isReactMotion(from)
			? (motionExports(file) ?? undefined)
			: undefined;
	}
	const bindingProject = {
		root,
		motionExports,
		original(file: string, module: string, options = bindingOptions(file)) {
			return (
				(!options?.paths && !options?.baseUrl) ||
				originalModule(file, module, options) !== undefined
			);
		},
	};
	// One shared context per project, including separate file-by-file migrations.
	const sourceDir = path.join(root, 'src');
	const adapter = path.join(
		fs.lstatSync(sourceDir, { throwIfNoEntry: false })?.isDirectory() ? sourceDir : root,
		'octane-react-intl.tsrx',
	);
	const adapterName = path.relative(root, adapter);
	const intlDirs = new Map<string, boolean>();
	let adapterSource: string | undefined;
	let adapterError: string | undefined;
	let adapterState: AdapterState | undefined;
	const intlPath = (file: string) => {
		const dir = path.dirname(file);
		let supported = intlDirs.get(dir);
		if (supported === undefined) {
			const base = path.dirname(adapter);
			const lib = readInstalled(base, 'react-intl');
			const octane = readInstalled(base, 'octane')?.version ?? '';
			const bindings = config ?? { moduleResolution: ts.ModuleResolutionKind.Bundler };
			const original = ts.resolveModuleName(
				'react-intl',
				adapter,
				{ ...bindings, paths: undefined, baseUrl: undefined },
				ts.sys,
			).resolvedModule;
			supported =
				!!lib &&
				lib.manifest.name === 'react-intl' &&
				/^7\./.test(lib.version) &&
				ADAPTER_OCTANE_VERSION.test(octane) &&
				['react', 'react-dom'].every((name) =>
					/^19\.(?:[2-9]|\d{2,})\./.test(readInstalled(base, name)?.version ?? ''),
				) &&
				[file, adapter].every((source) => {
					const options = bindingOptions(source);
					if (!bindingProject.original(source, 'react-intl', options)) return false;
					const conditions = options?.customConditions;
					if (conditions?.length && hasRuntimeExportCondition(lib.manifest.exports, conditions))
						return false;
					const resolved = ts.resolveModuleName(
						'react-intl',
						source,
						bindings,
						ts.sys,
					).resolvedModule;
					return (
						original &&
						resolved &&
						fs.realpathSync(resolved.resolvedFileName) ===
							fs.realpathSync(original.resolvedFileName) &&
						fs
							.realpathSync(original.resolvedFileName)
							.startsWith(fs.realpathSync(lib.dir) + path.sep)
					);
				}) &&
				['react-intl', 'react', 'react-dom', 'octane', 'octane/react'].every((name) => {
					try {
						return createRequire(file).resolve(name) === createRequire(adapter).resolve(name);
					} catch {
						return false;
					}
				});
			intlDirs.set(dir, supported);
		}
		if (!supported) return undefined;
		if (adapterSource === undefined) {
			adapterSource = fs.readFileSync(
				new URL('../templates/react-intl.tsrx', import.meta.url),
				'utf8',
			);
			adapterState = inspectAdapter(adapter, adapterSource, PREVIOUS_INTL_HASHES);
			if (adapterState.kind === 'conflict' || owners.has(outputKey(adapter))) {
				adapterError = `Cannot generate the React Intl adapter because ${adapterName} is already in use.`;
			} else if (
				compiler &&
				compile(compiler, adapterSource, adapter, true).some((d) => d.severity === 'error')
			) {
				adapterError = 'The project compiler cannot compile the React Intl adapter.';
			}
		}
		const specifier = path.relative(dir, adapter).split(path.sep).join('/');
		return specifier.startsWith('.') ? specifier : './' + specifier;
	};
	const helperDir = path.dirname(adapter);
	const storeBridge = path.join(helperDir, 'octane-store-context.tsrx');
	const storeSlots = path.join(helperDir, 'octane-store-hooks.ts');
	const planStoreHook =
		target === 'tsrx' &&
		compiler &&
		reactCompat &&
		ADAPTER_OCTANE_VERSION.test(readInstalled(helperDir, 'octane')?.version ?? '')
			? createScopedStorePlanner(helperDir, storeBridge, config ?? undefined)
			: null;
	function unchangedStoreInput(file: string, source: string) {
		if (
			renames.has(file) ||
			ts.findConfigFile(path.dirname(file), ts.sys.fileExists) !== rootProject ||
			rewriteModulePaths(source, file, root, renames, resolveRename)
		)
			return false;
		if (!known.has(file) || conflicts.has(file)) return true;
		// A plain helper selected in a directory run can still have its imports ported.
		return !transformModule(source, file, {
			target,
			strong,
			reactIntlAdapter: reactCompat && source.includes('react-intl') ? intlPath(file) : undefined,
			strictNullChecks: strictConfig !== null,
			get types() {
				return typesOf(file);
			},
			resolveSpecifier: (specifier) =>
				resolveRename(file, specifier) ??
				resolveBinding(specifier, file, bindingProject, new Map(), []),
			bindingExports: (from, to) => bindingExports(file, from, to),
		}).changed;
	}
	const { inputFactory, changedJsxExport, helperFunction, localFile, exportsConstObject } =
		storeSources(root, config, unchangedStoreInput, (file) => renames.has(file));
	const localHints = new Map<string, Map<string, string>>();
	function initializerResourceHint(from: string, module: string, name: string) {
		const file = localFile(from, module);
		if (
			!file ||
			ts.findConfigFile(path.dirname(file), ts.sys.fileExists) !== rootProject ||
			!installedReact(from)
		)
			return;
		let calls = localHints.get(file);
		if (!calls) {
			calls = new Map();
			const source = fs.readFileSync(file, 'utf8');
			if (
				(source.includes('react-dom') || source.includes('\\')) &&
				installedReact(file, 'react-dom')
			) {
				const { sf, checker } = bind(file, source);
				calls = directRendererCalls(sf, checker, 'react-dom', (api) => resourceHints.has(api));
			}
			localHints.set(file, calls);
		}
		return calls.get(name);
	}

	const localHooks = new Map<
		string,
		{ direct: Map<string, string>; privateContexts: Set<string> }
	>();
	const intlHookPackages = new Map<string, boolean>();
	function originalIntlHook(file: string) {
		const types = originalModule(file, 'react-intl');
		if (types?.packageId?.name !== 'react-intl') return false;
		const installed = readInstalled(path.dirname(file), 'react-intl');
		if (
			installed?.manifest.name !== 'react-intl' ||
			installed.version !== '7.1.14' ||
			installed.manifest.browser ||
			installed.manifest.exports ||
			installed.manifest.main !== 'index.js' ||
			installed.manifest.module !== 'lib/index.js'
		)
			return false;
		try {
			const dir = fs.realpathSync(installed.dir);
			const entry = path.join(dir, 'index.js');
			const issuer = createRequire(file);
			if (
				!dir.split(path.sep).includes('node_modules') ||
				fs.realpathSync(types.resolvedFileName) !== path.join(dir, 'index.d.ts') ||
				issuer.resolve('react-intl') !== entry ||
				readInstalled(path.dirname(file), 'react')?.manifest.name !== 'react'
			)
				return false;
			const react = issuer.resolve('react');
			if (
				!['src', 'lib/src'].every(
					(prefix) =>
						createRequire(path.join(dir, prefix, 'components/useIntl.js')).resolve('react') ===
						react,
				)
			)
				return false;
			let verified = intlHookPackages.get(dir);
			if (verified === undefined) {
				// An extra executable can shadow an extensionless import before its verified .js.
				verified =
					['src', 'lib/src'].every((prefix) =>
						['', '.mjs', '.mts', '.ts', '.jsx', '.tsx'].every(
							(ext) =>
								!fs.lstatSync(path.join(dir, prefix, 'components/useIntl' + ext), {
									throwIfNoEntry: false,
								}),
						),
					) &&
					Object.entries(INTL_HOOK_FILES).every(([name, hash]) => {
						const executable = path.join(dir, name);
						const stat = fs.lstatSync(executable, { throwIfNoEntry: false });
						return (
							stat?.isFile() &&
							stat.size < 16_384 &&
							fs.realpathSync(executable) === executable &&
							createHash('sha256').update(fs.readFileSync(executable)).digest('hex') === hash
						);
					});
				intlHookPackages.set(dir, verified);
			}
			return verified;
		} catch {
			return false;
		}
	}
	let selectedInPlace: Set<string> | undefined;
	function localReactHook(from: string, module: string, name: string, nativeOnly: boolean) {
		if (
			catalogName(module) !== null ||
			resolveRename(from, module) ||
			/[!%?#\\]/.test(module) ||
			ts.findConfigFile(path.dirname(from), ts.sys.fileExists) !== rootProject
		)
			return;
		const file = localFile(from, module);
		if (
			!file ||
			known.has(file) ||
			path.basename(file) === 'index.ts' ||
			fs.existsSync(file.slice(0, -3) + '.tsrx') ||
			(path.extname(module) && !module.endsWith('.ts')) ||
			fs.realpathSync(file) !== path.join(fs.realpathSync(root), path.relative(root, file)) ||
			ts.findConfigFile(path.dirname(file), ts.sys.fileExists) !== rootProject
		)
			return;
		let hooks = localHooks.get(file);
		if (!hooks) {
			const source = fs.readFileSync(file, 'utf8');
			hooks = { direct: new Map(), privateContexts: new Set() };
			const escaped = source.includes('\\u');
			const react =
				(/\b(?:useCallback|useContext|useEffect|useEffectEvent|useState|useSyncExternalStore)\b/.test(
					source,
				) ||
					(source.includes('\\') && source.includes('createContext')) ||
					escaped) &&
				originalModule(file, 'react') &&
				readInstalled(path.dirname(file), 'react')?.manifest.name === 'react';
			const intl = (source.includes('useIntl') || escaped) && originalIntlHook(file);
			if (react || intl) {
				const existing = program?.getSourceFile(file);
				const bound =
					existing && program
						? { sf: existing, checker: program.getTypeChecker() }
						: bind(file, source);
				if (react)
					hooks.direct = directRendererCalls(
						bound.sf,
						bound.checker,
						'react',
						(name) =>
							name === 'useCallback' ||
							name === 'useContext' ||
							name === 'useState' ||
							name === 'useSyncExternalStore',
						hooks.privateContexts,
					);
				if (intl)
					for (const [name, hook] of directRendererCalls(
						bound.sf,
						bound.checker,
						'react-intl',
						(name) => name === 'useIntl',
					))
						hooks.direct.set(name, hook);
			}
			localHooks.set(file, hooks);
		}
		const hook = hooks.direct.get(name);
		if ((!hook && !hooks.privateContexts.has(name)) || fs.statSync(file).nlink > 1) return;
		// Writing an unrenamed selection through a symlink changes its physical target.
		selectedInPlace ??= new Set(
			[...known].filter((f) => !renames.has(f) && !conflicts.has(f)).map((f) => fs.realpathSync(f)),
		);
		if (selectedInPlace.has(fs.realpathSync(file))) return;
		if (!hook) return { privateContext: true } as const;
		if (
			nativeOnly &&
			compiler &&
			hook === 'useSyncExternalStore' &&
			originalModule(file, 'octane')
		) {
			try {
				const issuer = createRequire(from);
				const owner = createRequire(file);
				if (
					issuer.resolve('octane/compiler') !== compiler.from ||
					issuer.resolve('octane') !== owner.resolve('octane') ||
					!originalModule(from, 'octane')
				)
					return hook;
			} catch {
				return hook;
			}
			const code = nativeExternalStore(file, fs.readFileSync(file, 'utf8'), name, (specifier) => {
				const leaf = localFile(file, specifier);
				if (
					!leaf ||
					known.has(leaf) ||
					selectedInPlace!.has(fs.realpathSync(leaf)) ||
					ts.findConfigFile(path.dirname(leaf), ts.sys.fileExists) !== rootProject
				)
					return;
				return bind(leaf, fs.readFileSync(leaf, 'utf8'));
			});
			const output = file.slice(0, -3) + '.octane.ts';
			if (
				code &&
				!compile(compiler, code, output, true).some((finding) => finding.severity === 'error') &&
				!checkHelper(output, code)
			) {
				generatedHelpers.set(output, code);
				return { from: relativeTsImport(from, output) };
			}
		}
		return hook;
	}
	const checkedHelpers = new Map<string, { code: string; state: AdapterState; error?: string }>();
	const generatedHelpers = new Map<string, string>();
	const svgHelpers = new Set<string>();
	const svgHelper = path.join(helperDir, 'octane-path-svg.ts');
	// Null marks unsupported geometry. A parsed asset records whether its root declares xmlns.
	const svgAssets = new Map<string, boolean | null>();
	const svgNamespaceWarnings = new Set<string>();
	let svgHelperCode: string | undefined;
	function nativeSvgModule(asset: string, errors: Set<string>, color?: string): string | null {
		if (
			!asset.startsWith(root + path.sep) ||
			asset.split(path.sep).includes('node_modules') ||
			/[!%?#]/.test(path.relative(root, asset))
		)
			return null;
		let hasXmlns = svgAssets.get(asset);
		if (hasXmlns === undefined) {
			const stat = fs.lstatSync(asset, { throwIfNoEntry: false });
			const svg =
				stat?.isFile() &&
				fs.realpathSync(asset) === path.join(fs.realpathSync(root), path.relative(root, asset))
					? parseStaticSvg(fs.readFileSync(asset, 'utf8'))
					: null;
			hasXmlns = svg ? Object.hasOwn(svg.root, 'xmlns') : null;
			svgAssets.set(asset, hasXmlns);
		}
		if (hasXmlns === null) return null;
		svgHelperCode ??=
			fs.readFileSync(new URL('../templates/octane-path-svg.ts', import.meta.url), 'utf8') +
			'\n' +
			fs.readFileSync(new URL('../src/path-svg.ts', import.meta.url), 'utf8');
		const sidecar = asset + (color ? '.octane-color-' + color.slice(2) : '.octane') + '.ts';
		const code =
			'import source from ' +
			JSON.stringify('./' + path.basename(asset) + '?raw') +
			';\n' +
			'import { pathSvg } from ' +
			JSON.stringify(relativeTsImport(sidecar, svgHelper)) +
			';\n\nexport default pathSvg(source' +
			(color ? ', ' + JSON.stringify('color:var(' + color + ')') : '') +
			');\n';
		let conflict: string | undefined;
		try {
			conflict = checkHelper(svgHelper, svgHelperCode, 'SVG') || checkHelper(sidecar, code, 'SVG');
		} catch (error) {
			if (!color || (error as NodeJS.ErrnoException).code !== 'ENAMETOOLONG') throw error;
			conflict = 'The SVG adapter path is too long: ' + path.relative(root, sidecar);
		}
		if (conflict) {
			errors.add(conflict);
			return null;
		}
		generatedHelpers.set(svgHelper, svgHelperCode);
		generatedHelpers.set(sidecar, code);
		svgHelpers.add(svgHelper);
		svgHelpers.add(sidecar);
		if (hasXmlns) svgNamespaceWarnings.add(asset);
		return sidecar;
	}
	function pathSvgAdapter(file: string, specifier: string, errors: Set<string>, color?: string) {
		if (
			(config?.jsxImportSource && config.jsxImportSource !== 'react') ||
			config?.jsxFactory ||
			config?.jsxFragmentFactory ||
			ts.findConfigFile(path.dirname(file), ts.sys.fileExists) !== rootProject
		)
			return null;
		const asset = svgAsset(root, path.dirname(file), specifier, config);
		const sidecar = asset && nativeSvgModule(asset, errors, color);
		return sidecar ? relativeTsImport(file, sidecar) : null;
	}
	let storeTemplates: ReadonlyMap<string, string> | undefined;
	function checkHelper(output: string, code: string, kind = 'workspace hook') {
		const cached = checkedHelpers.get(output);
		if (cached)
			return cached.code === code
				? cached.error
				: 'Two generated adapters need different code at ' + path.relative(root, output);
		const name = path.relative(root, output);
		const ownerOf = (file: string) => owners.has(outputKey(file));
		// Bundlers can prefer a JavaScript or JSX sibling over our extensionless .ts import.
		const shadowed =
			output.endsWith('.ts') &&
			['', '.js', '.jsx', '.tsx', '.mjs', '.cjs', '.mts', '.cts', '.json', '.tsrx'].some((ext) => {
				const sibling = output.slice(0, -3) + ext;
				return ownerOf(sibling) || fs.lstatSync(sibling, { throwIfNoEntry: false });
			});
		const state: AdapterState =
			shadowed || ownerOf(output)
				? { kind: 'conflict' }
				: inspectAdapter(output, code, output === svgHelper ? PREVIOUS_SVG_HASHES : undefined);
		let error: string | undefined;
		if (state.kind === 'conflict') {
			error = 'The ' + kind + ' adapter path is occupied: ' + name;
		} else {
			const rejected = output.endsWith('.tsrx')
				? compile(compiler!, code, output, true).some((d) => d.severity === 'error')
				: ts
						.transpileModule(code, {
							fileName: output,
							reportDiagnostics: true,
							compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
						})
						.diagnostics?.some((d) => d.category === ts.DiagnosticCategory.Error);
			if (rejected) error = 'The target compiler rejected the ' + kind + ' adapter: ' + name;
		}
		checkedHelpers.set(output, { code, state, error });
		return error;
	}
	const results: FileResult[] = [];
	const storeHookComponents = new Map<string, string[]>();
	if (options.svgPaths && target === 'tsrx') {
		// Explicit SVG inputs prepare a native component even if a caller's renderer is unknown.
		// Directory scans still generate components only for verified JSX uses.
		for (const entry of new Set(
			paths.filter((name) => /\.svg$/i.test(name)).map((name) => path.resolve(name)),
		)) {
			if (fs.lstatSync(entry).isDirectory()) continue;
			const errors = new Set<string>();
			if (nativeSvgModule(entry, errors)) continue;
			const file = unchangedFile(path.relative(root, entry), '', {
				rule: 'svg-paths',
				severity: 'error',
				line: 1,
				message:
					[...errors].join('; ') ||
					'Cannot generate a native SVG component for this asset. Expected supported static SVG geometry inside the project.',
			});
			if (write) return blockedWrite(root, file, compiler?.from);
			results.push(file);
		}
	}

	for (const file of files) {
		const conflict = conflicts.get(file);
		if (conflict) {
			results.push(conflict);
			continue;
		}
		const source = fs.readFileSync(file, 'utf8');
		const extra: Note[] = [];
		const reactStoreComponents = new Map<string, boolean>();
		let installedClsx: boolean | undefined;
		let reactJsx: boolean | undefined;
		const isContext: NonNullable<TransformOptions['isContext']> = (specifier, name, local) => {
			if (!specifier.startsWith('.')) {
				if (
					!contextPaths.length ||
					config?.module !== ts.ModuleKind.ESNext ||
					config.moduleSuffixes ||
					config.rootDirs ||
					ts.findConfigFile(path.dirname(file), ts.sys.fileExists) !== rootProject ||
					!contextPaths.some(([start, end]) =>
						end === undefined
							? specifier === start
							: specifier.startsWith(start) && specifier.endsWith(end),
					)
				)
					return null;
				const source = localFile(file, specifier, true);
				return source &&
					exports.has(source) &&
					ts.findConfigFile(path.dirname(source), ts.sys.fileExists) === rootProject &&
					(exports.get(source)?.contexts.includes(name) ||
						(name === 'default' ? local : name).endsWith('Context'))
					? 'review-alias'
					: null;
			}
			const target = resolveModule(file, specifier, known);
			if (target) return contextsOf(target.file).has(name);
			if (
				!name.endsWith('Context') ||
				config?.module !== ts.ModuleKind.ESNext ||
				config.moduleSuffixes ||
				config.rootDirs ||
				ts.findConfigFile(path.dirname(file), ts.sys.fileExists) !== rootProject
			)
				return null;
			const source = localFile(file, specifier, true);
			if (!source) return null;
			const direct = path.resolve(path.dirname(file), specifier);
			// A bundler can load a sibling file ahead of TypeScript's directory index.
			return (source === direct || source === direct + path.extname(source)) &&
				ts.findConfigFile(path.dirname(source), ts.sys.fileExists) === rootProject &&
				exportsConstObject(source, name)
				? false
				: null;
		};
		const matchesExport = (
			index: Map<string, Set<string>>,
			binding: { module: string; imported: string },
		) => {
			const to = resolveRename(file, binding.module);
			return Boolean(
				to?.startsWith('.') &&
				index.get(path.resolve(path.dirname(file), to))?.has(binding.imported),
			);
		};
		let types: TransformOptions['types'];
		let intl =
			target === 'tsrx' && reactCompat && source.includes('react-intl')
				? intlPath(file)
				: undefined;
		const storeErrors = new Set<string>();
		const svgErrors = new Set<string>();
		let originalReact: boolean | undefined;
		const resolveStoreHook: TransformOptions['resolveStoreHook'] =
			!planStoreHook || !renames.has(file)
				? undefined
				: (module, name, safeUses) => {
						if (!unportedName(module, file)) return null;
						const plan = planStoreHook(module, name, file);
						if (
							!plan ||
							!safeUses(
								(source, name, selection) => {
									if (selection)
										return changedJsxExport(file, source, name, selection) ? 'opaque' : false;
									const input = inputFactory(file, source, name, plan.isSharedExport);
									if (!input) return false;
									if ('opaque' in input) return 'opaque';
									return plan.isSharedExport(input.module, input.name, input.from);
								},
								(source, name) =>
									!resolveRename(file, source) &&
									catalogName(source) === null &&
									(originalReact ??=
										ts.findConfigFile(path.dirname(file), ts.sys.fileExists) === rootProject &&
										!!originalModule(file, 'react')) &&
									helperFunction(file, source, name),
								(source, name) => retainedStoreArgument(file, source, name),
							)
						)
							return null;
						storeTemplates ??= new Map([
							[
								storeBridge,
								fs.readFileSync(
									new URL('../templates/octane-store-context.tsrx', import.meta.url),
									'utf8',
								),
							],
							[
								storeSlots,
								fs.readFileSync(
									new URL('../templates/octane-store-hooks.ts', import.meta.url),
									'utf8',
								),
							],
						]);
						const helpers = new Map([...plan.files, ...storeTemplates]);
						for (const [output, code] of helpers) {
							const error = checkHelper(output, code);
							if (error) {
								storeErrors.add(error);
								return null;
							}
						}
						for (const [output, code] of helpers) generatedHelpers.set(output, code);
						const relative = path
							.relative(path.dirname(file), plan.entry)
							.split(path.sep)
							.join('/')
							.replace(/\.ts$/, '');
						return { from: relative.startsWith('.') ? relative : './' + relative, name: plan.name };
					};
		const svgAdapter =
			options.svgPaths && renames.has(file)
				? (specifier: string, color?: string) => pathSvgAdapter(file, specifier, svgErrors, color)
				: undefined;
		const transform = (
			notes = extra,
			retry?: 'effectReceivers' | 'effectProperties' | 'effectSnapshots' | 'linkedState',
		) =>
			transformModule(source, file, {
				captureEffectReceivers:
					retry === 'effectReceivers' ||
					retry === 'effectProperties' ||
					retry === 'effectSnapshots',
				snapshotEffectProperties: retry === 'effectProperties',
				captureEffectHelpers: retry === 'effectProperties' && installedReact(file),
				captureEffectSnapshots: retry === 'effectSnapshots',
				linkRenderState: retry === 'linkedState' && installedReact(file),
				target,
				reactIntlAdapter: intl,
				forwardedText: (module, name, prop, ordinaryCaller, through) =>
					forwardedProp(
						file,
						module,
						name,
						prop,
						through ? 'forwarded-text' : 'text',
						ordinaryCaller,
					),
				resolveStoreHook,
				get originalReact() {
					return installedReact(file);
				},
				initializerResourceHint: renames.has(file)
					? (module, name) => initializerResourceHint(file, module, name)
					: undefined,
				localReactHook: renames.has(file)
					? (module, name, nativeOnly) => localReactHook(file, module, name, nativeOnly)
					: undefined,
				localReactRootComponent: renames.has(file)
					? (module, name) => {
							const hook = localReactHook(file, module, name, false);
							if (
								typeof hook === 'string' &&
								hook !== 'useEffect' &&
								hook !== 'useEffectEvent' &&
								installedReact(file, 'react-dom') &&
								originalModule(file, 'react-dom/client')
							)
								return hook;
						}
					: undefined,
				strong,
				strictNullChecks: strictConfig !== null,
				get types() {
					return (types ??= typesOf(file));
				},
				resolveSpecifier: (specifier) =>
					resolveRename(file, specifier) ??
					resolveBinding(specifier, file, bindingProject, packages, notes),
				bindingExports: (from, to) => bindingExports(file, from, to),
				recordBindingRewrite: (from, to) => packages.set(from, to),
				isContext,
				elementChild: !elementExports.size
					? undefined
					: (binding) =>
							typeof binding === 'number'
								? (exports.get(file)?.elementChildren?.some((x) => x.start === binding) ?? false)
								: matchesExport(elementExports, binding),
				descriptorChild: descriptorExports.size
					? (binding) => matchesExport(descriptorExports, binding)
					: undefined,
				unported: (specifier) => unportedName(specifier, file),
				reactCompat,
				get reactCompatInline() {
					const dir = path.dirname(file);
					if (!inlineCompatDirs.has(dir))
						inlineCompatDirs.set(dir, supportsInlineReactCompat(file));
					return inlineCompatDirs.get(dir);
				},
				forwardedRender:
					options.svgPaths && renames.has(file)
						? (module, name, prop, depth) =>
								forwardedProp(file, module, name, prop, 'render', true, depth)
						: undefined,
				get automaticReactJsx() {
					return (reactJsx ??=
						!/@jsx(?:ImportSource|Runtime|Frag)?\b/i.test(source) &&
						automaticReactJsx(file) &&
						!!originalModule(file, 'react/jsx-runtime') &&
						installedReact(file));
				},
				get installedClsx() {
					if (installedClsx === undefined) {
						const target = originalModule(file, 'clsx');
						installedClsx =
							target?.packageId?.name === 'clsx' &&
							fs.realpathSync(target.resolvedFileName).split(path.sep).includes('node_modules');
					}
					return installedClsx;
				},
				cssModuleFile: (specifier) => {
					if (!/^\.\.?\/[^!%?#\\]+\.module\.css$/.test(specifier)) return;
					const sheet = path.resolve(path.dirname(file), specifier);
					if (!ts.sys.fileExists(sheet)) return;
					const real = fs.realpathSync(sheet);
					return real.endsWith('.module.css') ? real : undefined;
				},
				pathSvgAdapter: svgAdapter,
				fixedColorSvgAdapter: svgAdapter,
				reactStoreComponent: (specifier) => {
					if (!reactStoreComponents.has(specifier))
						reactStoreComponents.set(specifier, reactStoreComponent(file, specifier));
					return reactStoreComponents.get(specifier)!;
				},
			});
		if (intl && adapterError) {
			// Public utilities such as defineMessages can stay on React Intl without a helper.
			const needsAdapter = transform([]).rules['react-intl'];
			intl = undefined;
			if (needsAdapter) {
				const note: Note = {
					rule: 'react-intl',
					line: 1,
					severity: 'error',
					message: write ? adapterError + ' No changes were written.' : adapterError,
				};
				if (write) {
					return blockedWrite(
						root,
						unchangedFile(path.relative(root, file), source, note),
						compiler?.from,
					);
				}
				extra.push(note);
			}
		}
		const result = transform();
		if (result.exports.storeHookComponents)
			storeHookComponents.set(file, result.exports.storeHookComponents);
		const blockedTransform = result.notes.find(
			(note) =>
				note.rule === MAP_PARAMETER_WRITE ||
				note.rule === MAP_PARAMETER_TDZ ||
				note.rule === MAP_CALLBACK_SCOPE ||
				note.rule === CONTEXT_ALIAS ||
				note.rule === CONTEXT_PROVIDER_GETTER,
		);
		if (write && blockedTransform)
			return blockedWrite(
				root,
				unchangedFile(path.relative(root, file), source, blockedTransform),
				compiler?.from,
			);
		for (const message of [...storeErrors, ...svgErrors]) {
			const note: Note = {
				rule: svgErrors.has(message) ? 'svg-paths' : 'store-hook',
				line: 1,
				severity: 'error',
				message: write ? message + '. No changes were written.' : message,
			};
			if (write)
				return blockedWrite(
					root,
					unchangedFile(path.relative(root, file), source, note),
					compiler?.from,
				);
			extra.push(note);
		}
		if (result.rules['store-hook'])
			extra.push({
				rule: 'store-hook',
				line: 1,
				severity: 'info',
				message:
					'React-hosted consumers inherit their store context. At a standalone Octane root, supply the active context and value with NativeStoreProvider.',
			});

		for (const port of result.unported) {
			const entry = missing.get(port.name) ?? {
				name: port.name,
				modules: 0,
				islands: 0,
				blocked: 0,
			};
			entry.modules++;
			entry.islands += port.islands;
			entry.blocked += port.blocked;
			missing.set(port.name, entry);
		}
		const output = renames.get(file) ?? file;
		let code = result.code;
		let isStrong: boolean | null = null;
		let strongFixes: string[] = [];
		let diagnostics: FileResult['diagnostics'] = [];
		if (compiler && result.changed) {
			if (strong && result.template) {
				const strengthened = strengthen(compiler, code, output, {
					force: options.forceStrong,
					withEffectReceivers: () => transform([], 'effectReceivers').code,
					withEffectProperties: () => transform([], 'effectProperties').code,
					withEffectSnapshots: () => transform([], 'effectSnapshots').code,
					withLinkedState: () => transform([], 'linkedState').code,
				});
				code = strengthened.code;
				isStrong = strengthened.strong;
				strongFixes = strengthened.fixed;
				if (!strengthened.strong) diagnostics.push(...strengthened.blockers);
			}
			if (verify && isCompiled(output, code))
				diagnostics.push(...compile(compiler, code, output, isStrong === true));
		}
		results.push({
			file: path.relative(root, file),
			output: path.relative(root, output),
			changed: result.changed || output !== file,
			rules: result.rules,
			notes: [...result.notes, ...extra],
			strong: isStrong,
			strongFixes,
			diagnostics: dedupe(diagnostics),
			code,
		});
	}

	// TSRX written for React (`@tsrx/react`) is a dialect the TypeScript
	// parser cannot read, so it is reported rather than skipped silently.
	for (const file of paths.flatMap((entry) => collect(path.resolve(entry), isTsrx))) {
		const source = fs.readFileSync(file, 'utf8');
		const react = /^import\b[^;]*?\bfrom\s+['"]react(?:-dom)?(?:\/[^'"]*)?['"]/m.exec(source);
		if (!react || /\bfrom\s+['"]octane(?:\/[^'"]*)?['"]/.test(source)) continue;
		results.push(
			unchangedFile(path.relative(root, file), source, {
				rule: 'tsrx-react',
				severity: 'error',
				line: source.slice(0, react.index).split('\n').length,
				message:
					'This is TSRX written for React (`@tsrx/react`), which the codemod cannot read. Port it by hand: its templates are already TSRX, but its React imports and APIs need the changes the codemod makes to TSX.',
			}),
		);
	}

	// Configs and scripts name modules by path too, such as Vite's
	// `server.warmup.clientFiles`, including those outside the migrated paths.
	const byFile = new Map(results.map((result) => [path.join(root, result.file), result]));
	// React executes imported island components with their original module dependencies.
	const edited = new Set(results.filter((r) => r.changed).map((r) => path.join(root, r.file)));
	const inspected = new Set<string>();
	let physicalEdits: Map<string, FileResult[]> | undefined;
	let islandConflict: FileResult | undefined;
	function originalOctaneBridge(file: string, specifier: string) {
		const installed = readInstalled(path.dirname(file), 'octane');
		const module = originalModule(file, specifier, bindingOptions(file));
		return (
			installed?.manifest.name === 'octane' &&
			module?.packageId?.name === 'octane' &&
			fs.realpathSync(module.resolvedFileName).startsWith(fs.realpathSync(installed.dir) + path.sep)
		);
	}
	function originalOctaneRuntime(file: string, specifier: 'octane' | 'octane/server') {
		const installed = readInstalled(path.dirname(file), 'octane');
		const module = originalModule(file, specifier);
		const adapterRuntime = readInstalled(helperDir, 'octane');
		if (
			installed?.manifest.name !== 'octane' ||
			module?.packageId?.name !== 'octane' ||
			!adapterRuntime
		)
			return false;
		try {
			const source = fs.realpathSync(module.resolvedFileName);
			const directory = fs.realpathSync(installed.dir) + path.sep;
			if (fs.realpathSync(adapterRuntime.dir) + path.sep !== directory) return false;
			const targets = runtimeTargets(specifier, source, file);
			return (
				source.startsWith(directory) &&
				targets.length > 0 &&
				targets.every((target) => fs.realpathSync(target).startsWith(directory))
			);
		} catch {
			return false;
		}
	}
	function storeRootNote({ name, line }: { name: string; line: number }, server: boolean): Note {
		const component = name === 'default' ? 'default export' : name;
		return {
			rule: 'store-hook',
			severity: 'warning',
			line,
			message: server
				? `If this server call runs standalone and reaches the migrated ${component}'s store hook, it may need NativeStoreProvider with its original store context and value.`
				: `If the migrated ${component}'s store hook reads context, this standalone Octane root needs NativeStoreProvider with its original store context and value.`,
		};
	}
	function originalReactEntry(
		file: string,
		name: 'react' | 'react/jsx-runtime' | 'react-dom/server',
	) {
		const packageRoot = name === 'react-dom/server' ? 'react-dom' : 'react';
		const types = originalModule(file, name)?.packageId?.name;
		if (types !== packageRoot && types !== `@types/${packageRoot}`) return false;
		const installed = readInstalled(path.dirname(file), packageRoot);
		try {
			return (
				installed?.manifest.name === packageRoot &&
				fs
					.realpathSync(createRequire(file).resolve(name))
					.startsWith(fs.realpathSync(installed.dir) + path.sep)
			);
		} catch {
			return false;
		}
	}
	const reverseIslands = new Map<string, ReadonlySet<string>>();
	const intrinsicExports = new Map<string, ReturnType<typeof intrinsicReactExports>>();
	const linkedConflicts = new Map<string, string>();
	function checkLinkedRename(file: string, issuer: string) {
		const selected = linkedRename(file);
		if (selected && !linkedConflicts.has(selected)) linkedConflicts.set(selected, issuer);
	}
	const scanRename = (from: string, specifier: string) =>
		renamed(from, specifier, (winner) => checkLinkedRename(winner, from))?.specifier ?? null;
	function protectIslandModule(issuer: string, specifier: string, owner: string) {
		const file = ts.resolveModuleName(
			specifier,
			issuer,
			{ moduleResolution: ts.ModuleResolutionKind.Bundler, ...bindingOptions(issuer) },
			ts.sys,
		).resolvedModule?.resolvedFileName;
		if (!file || /\.d\.[cm]?ts$/.test(file) || !SOURCE.test(file)) return;
		const physical = fs.realpathSync(file);
		if (inspected.has(physical)) return;
		inspected.add(physical);
		// A workspace import and an explicitly selected path may reach the same file through different links.
		if (!physicalEdits) {
			physicalEdits = new Map();
			for (const selected of edited) {
				const real = fs.realpathSync(selected);
				const group = physicalEdits.get(real) ?? [];
				group.push(byFile.get(selected)!);
				physicalEdits.set(real, group);
			}
		}
		for (const result of physicalEdits.get(physical) ?? []) {
			const note: Note = {
				rule: 'react-compat',
				severity: 'error',
				line: 1,
				message: `Keep ${result.file} in React: the authored React island in ${path.relative(root, owner)} uses its original implementation. Exclude this module from the migration.`,
			};
			result.notes.push(note);
			if (write && !islandConflict)
				islandConflict = unchangedFile(result.file, fs.readFileSync(file, 'utf8'), note);
		}
		if (physical.split(path.sep).includes('node_modules')) return;
		for (const module of executableImports(
			file,
			fs.readFileSync(file, 'utf8'),
			!!bindingOptions(file)?.verbatimModuleSyntax,
		))
			protectIslandModule(file, module, owner);
	}
	for (const file of edited.size || renames.size
		? new Set([...collect(root, (name) => SOURCE.test(name) || isTsrx(name)), ...files])
		: []) {
		const source = fs.readFileSync(file, 'utf8');
		if (edited.size && importsReactBridge(source)) {
			for (const module of await islandComponents(file, source, (spec) =>
				bindingProject.original(file, spec),
			))
				protectIslandModule(file, module, file);
		}
		if (islandConflict) return blockedWrite(root, islandConflict, compiler?.from);
		if (!renames.size || linkedRename(file) || conflicts.has(file)) continue;
		const result = byFile.get(file);
		const selected = renames.has(file);
		const specifier = 'octane/react/server';
		const originalServerHost = () =>
			automaticReactJsx(file) &&
			originalOctaneBridge(file, specifier) &&
			originalReactEntry(file, 'react/jsx-runtime');
		const hasServerImport = source.includes(specifier);
		if (
			selected &&
			result &&
			(hasServerImport ||
				(source.includes('\\') &&
					ts.preProcessFile(source).importedFiles.some((entry) => entry.fileName === specifier))) &&
			originalServerHost()
		) {
			const [edge] = hostedServerComponents(file, source);
			if (edge) {
				const note: Note = {
					rule: 'react-compat',
					severity: 'error',
					line: edge.line,
					message:
						'Keep the authored OctaneCompat host in React. Exclude this module from the migration.',
				};
				if (write)
					return blockedWrite(root, unchangedFile(result.file, source, note), compiler?.from);
				result.notes.push(note);
			}
		}
		if (
			selected &&
			storeHookComponents.size &&
			result?.rules['server-render'] &&
			result.rules['root-render'] &&
			automaticReactJsx(file) &&
			originalReactEntry(file, 'react-dom/server') &&
			originalOctaneBridge(file, 'octane/server')
		) {
			for (const edge of reactServerComponents(
				file,
				source,
				(module) => module === 'react/jsx-runtime' && originalReactEntry(file, module),
				true,
			)) {
				const leaf = renamed(file, edge.module)?.file;
				if (
					!leaf ||
					leaf !== path.resolve(path.dirname(file), edge.module) ||
					!storeHookComponents.get(leaf)?.includes(edge.name)
				)
					continue;
				result.notes.push(storeRootNote(edge, true));
			}
		}
		const paths = rewriteModulePaths(
			selected ? source : (result?.code ?? source),
			file,
			root,
			renames,
			scanRename,
			selected ? undefined : checkLinkedRename,
		);
		if (!paths) continue;
		const storeNotes: Note[] = result?.notes ?? [];
		if (
			storeHookComponents.size &&
			SOURCE.test(file) &&
			((source.includes('octane') &&
				(source.includes('createRoot') ||
					source.includes('hydrateRoot') ||
					(source.includes('octane/server') &&
						(source.includes('renderToString') || source.includes('renderToStaticMarkup'))))) ||
				source.includes('\\')) &&
			ts.findConfigFile(path.dirname(file), ts.sys.fileExists) === rootProject
		) {
			const originalRuntimes = new Map<'octane' | 'octane/server', boolean>();
			for (const edge of octaneRootComponents(file, source)) {
				const leaf = renamed(file, edge.module)?.file;
				if (
					!leaf ||
					leaf !== path.resolve(path.dirname(file), edge.module) ||
					!storeHookComponents.get(leaf)?.includes(edge.name)
				)
					continue;
				if (!originalRuntimes.has(edge.runtime))
					originalRuntimes.set(edge.runtime, originalOctaneRuntime(file, edge.runtime));
				if (originalRuntimes.get(edge.runtime))
					storeNotes.push(storeRootNote(edge, edge.runtime === 'octane/server'));
			}
		}
		if (selected) continue;
		const rules = { ...result?.rules, 'module-paths': paths.count };
		const name = path.relative(root, file);
		const host: FileResult = result ?? {
			file: name,
			output: name,
			changed: true,
			rules,
			notes: storeNotes,
			strong: null,
			strongFixes: [],
			diagnostics: [],
			code: paths.code,
		};
		if (result) Object.assign(result, { code: paths.code, changed: true, rules });
		else results.push(host);
		const retainedJsx = !known.has(file) && /\.[jt]sx$/.test(file) && source.includes('<');
		const retainedServer =
			!isTsrx(file) && (source.includes('react-dom/server') || source.includes('\\'));
		if (
			!edited.has(file) &&
			(retainedJsx || retainedServer) &&
			ts.findConfigFile(path.dirname(file), ts.sys.fileExists) === rootProject
		) {
			const edges: (ReturnType<typeof retainedReactComponentReturns>[number] & {
				renderer: 'JSX' | 'server render';
			})[] = [];
			if (retainedJsx && automaticReactJsx(file) && originalReactEntry(file, 'react/jsx-runtime'))
				for (const edge of retainedReactComponentReturns(file, source))
					edges.push({ ...edge, renderer: 'JSX' });
			if (retainedServer && originalReactEntry(file, 'react-dom/server'))
				for (const edge of reactServerComponents(file, source, (module) =>
					module === 'react'
						? installedReact(file)
						: automaticReactJsx(file) && originalReactEntry(file, module),
				))
					edges.push({ ...edge, renderer: 'server render' });
			let installedLazy: boolean | undefined;
			for (const edge of edges) {
				const match = renamed(file, edge.module);
				if (!match) continue;
				const original = path.resolve(path.dirname(file), edge.module);
				const explicit =
					match.file === original && (edge.renderer !== 'JSX' || /\.[jt]sx$/.test(edge.module));
				if (
					!explicit &&
					(edge.renderer !== 'JSX' ||
						!/^\.{1,2}\//.test(edge.module) ||
						/[!%?#\\]/.test(edge.module) ||
						path.extname(edge.module) ||
						config?.rootDirs ||
						config?.moduleSuffixes?.some(Boolean) ||
						!(match.file === original + '.tsx' || match.file === original + '.jsx') ||
						hasModuleSibling(match.file) ||
						['', '.json', '.tsrx'].some((ext) => fs.existsSync(original + ext)))
				)
					continue;
				if (!automaticReactJsx(match.file) || !originalReactEntry(match.file, 'react/jsx-runtime'))
					continue;
				if (edge.lazy && !(installedLazy ??= originalReactEntry(file, 'react'))) continue;
				const leaf = byFile.get(match.file);
				if (!leaf?.output.endsWith('.tsrx')) continue;
				let intrinsic = intrinsicExports.get(match.file);
				if (!intrinsic) {
					intrinsic = intrinsicReactExports(match.file, fs.readFileSync(match.file, 'utf8'));
					intrinsicExports.set(match.file, intrinsic);
				}
				if (!intrinsic.names.has(edge.name) || (edge.lazy && intrinsic.mayExportThen)) continue;
				const note: Note = {
					rule: 'react-compat',
					severity: 'warning',
					line: edge.line,
					message:
						edge.renderer === 'JSX'
							? `The retained React JSX in ${name} renders ${leaf.file} ${edge.lazy ? 'through React.lazy' : 'directly'}. With standard package resolution, migrate the caller too or keep this component in React.`
							: `The retained React server render in ${name} imports ${leaf.file} directly. With standard package resolution, migrate the server entry too or keep this component in React.`,
				};
				host.notes.push(note);
				leaf.notes.push({ ...note, line: 1 });
			}
		}
		if (!edited.has(file) && hasServerImport && originalServerHost()) {
			for (const edge of hostedServerComponents(file, source)) {
				const match = edge.module.startsWith('.') && renamed(file, edge.module);
				if (!match) continue;
				const leaf = byFile.get(match.file);
				if (!leaf?.output.endsWith('.tsrx')) continue;
				let names = reverseIslands.get(match.file);
				if (!names) {
					names = await reverseIslandExports(leaf.output, leaf.code, (module) =>
						originalOctaneBridge(match.file, module),
					);
					reverseIslands.set(match.file, names);
				}
				if (!names.has(edge.name)) continue;
				const note: Note = {
					rule: 'react-compat',
					severity: 'error',
					line: edge.line,
					message: `React SSR cannot render ${leaf.output} inside OctaneCompat because it returns a ReactCompat island.`,
				};
				if (write) return blockedWrite(root, unchangedFile(name, source, note), compiler?.from);
				host.notes.push(note);
				leaf.notes.push({
					...note,
					line: 1,
					message: `${note.message} Server host: ${name}:${edge.line}.`,
				});
			}
		}
	}

	const pages = planEntryPages(
		root,
		paths.map((entry) => path.resolve(entry)),
		renames,
		checkLinkedRename,
	);
	for (const [file, issuer] of linkedConflicts) {
		const conflict = conflictFor(
			file,
			fs.readFileSync(file, 'utf8'),
			renames.get(file)!,
			'would leave a reference in ' +
				path.relative(root, issuer) +
				' pointing to its original name',
		);
		if (write) return blockedWrite(root, conflict, compiler?.from);
		byFile.get(file)?.notes.push(...conflict.notes);
	}
	const intlConsumer = results.find((file) => file.rules['react-intl']);
	const svg = generatedHelpers.has(svgHelper) && checkedHelpers.get(svgHelper);
	if (write) {
		const updates: {
			file: string;
			source: string;
			state: AdapterState;
			previous: readonly string[];
			rule: string;
		}[] = [];
		if (adapterState && adapterSource && intlConsumer)
			updates.push({
				file: adapter,
				source: adapterSource,
				state: adapterState,
				previous: PREVIOUS_INTL_HASHES,
				rule: 'react-intl',
			});
		if (svg)
			updates.push({
				file: svgHelper,
				source: svg.code,
				state: svg.state,
				previous: PREVIOUS_SVG_HASHES,
				rule: 'svg-paths',
			});
		// Check both shared helpers before writing either. Recheck again at publication.
		const conflict =
			updates.find(
				({ file, source, state, previous }) =>
					!canPublishAdapter(inspectAdapter(file, source, previous), state),
			) ??
			updates.find(
				({ file, source, state, previous }) => !publishAdapter(file, source, state, previous),
			);
		if (conflict) {
			const name = path.relative(root, conflict.file);
			return blockedWrite(
				root,
				unchangedFile(name, '', {
					rule: conflict.rule,
					severity: 'error',
					line: 1,
					message: `Cannot update ${name} because it changed during migration. No caller files were written.`,
				}),
				compiler?.from,
			);
		}
	}
	if (adapterState && adapterSource && intlConsumer) {
		if (adapterState.kind === 'missing' || adapterState.kind === 'previous') {
			results.push({
				file: adapterName,
				output: adapterName,
				changed: true,
				code: adapterSource,
				rules: { 'react-intl-adapter': 1 },
				notes:
					adapterState.kind === 'previous'
						? [
								{
									rule: 'react-intl-adapter',
									severity: 'info',
									line: 1,
									message:
										'Update the previously generated React Intl adapter at its existing path.',
								},
							]
						: [],
				diagnostics: [],
				strong: compiler ? true : null,
				strongFixes: [],
			});
		}
	}
	for (const [output, code] of generatedHelpers) {
		const { state } = checkedHelpers.get(output)!;
		if (state.kind !== 'missing' && state.kind !== 'previous') continue;
		const name = path.relative(root, output);
		if (write && output !== svgHelper) fs.writeFileSync(output, code, { flag: 'wx' });
		results.push({
			file: name,
			output: name,
			changed: true,
			code,
			rules: { [svgHelpers.has(output) ? 'svg-paths-adapter' : 'store-hook-adapter']: 1 },
			notes: [],
			diagnostics: [],
			strong: code.startsWith("'use strong'") ? true : null,
			strongFixes: [],
		});
	}
	for (const asset of svgNamespaceWarnings)
		results.push(
			unchangedFile(path.relative(root, asset), '', {
				rule: 'svg-paths',
				severity: 'warning',
				line: 1,
				message:
					'If the React SVG loader forwards the authored xmlns prop, a fresh Octane mount places it in the XMLNS namespace while React uses the null namespace. Review code that reads the attribute namespace.',
			}),
		);
	if (write) for (const [page, next] of pages) fs.writeFileSync(page, next);
	const html = [...pages.keys()].map((page) => path.relative(root, page));
	const dependencies = addBindings(root, packages, write);
	if (write) {
		for (const result of results) {
			if (
				!result.changed ||
				result.rules['react-intl-adapter'] ||
				result.rules['store-hook-adapter'] ||
				result.rules['svg-paths-adapter']
			)
				continue;
			const output = path.join(root, result.output);
			fs.writeFileSync(output, result.code, { flag: result.output === result.file ? 'w' : 'wx' });
			if (result.output !== result.file) fs.rmSync(path.join(root, result.file));
		}
	}
	return {
		root,
		files: results,
		packages: [...packages].map(([from, to]) => ({ from, to })),
		dependencies,
		patched: patchedPackages(root, packages),
		missing: [...missing.values()].sort((a, b) => a.name.localeCompare(b.name)),
		html,
		compiler: compiler?.from ?? null,
	};
}

type AdapterState =
	{ kind: 'missing' | 'current' | 'conflict' } | { kind: 'previous'; mode: number; hash: string };

// Hash only previously shipped helpers. A locally edited file belongs to the application.
const PREVIOUS_INTL_HASHES = ['07ec8e00847ebc6f0bd5ffeb14bc064aa23df42d1d3db5102344c739f54dca98'];

const PREVIOUS_SVG_HASHES = [
	'90bc12d849bbed4f1932e9e7ab5b939242237a4b8876d4c0f01e093a7d5b8c80',
	'9068d68b34a68b8dd4199764d16c174f1cf9cbf79172396b1f8960ddf5217916',
	'893474efdb9186489e6c0113d1dedaaf9b7d2a0443f8b5d04048680610696bdf',
	'88de6c9053abe0f94934ebb7cd54cd681e4d2544b3facab0dbdf3d4c588649a5',
	'62ef936e3ce64cfe809297e08e74538f0c409f0bde6a926ca7b88de93161a38d',
	'a3d611226ba955f4f5601caa4c6987f0a5a943fab97362843d16f02c686c6944',
	'058f232bcee5d0caf24d72ec8f9864152b7eb6a9e882614bff3209ff0d145d00',
	'3becf859871f17914f6f0631e8db8058aa4932fd4a9817718b98eb247a902b24',
	'1dbf34eea75c07c21c8ab3814d54e58115e833aa140fc5f34b5f2cba91d018c3',
	'b53641cfbe77205a174179b4d0de60989b34cf4073690fc98536c22a68ee844a',
];

function inspectAdapter(file: string, source: string, previous?: readonly string[]): AdapterState {
	const stat = fs.lstatSync(file, { throwIfNoEntry: false });
	if (!stat) return { kind: 'missing' };
	if (!stat.isFile()) return { kind: 'conflict' };
	const bytes = fs.readFileSync(file);
	if (bytes.equals(Buffer.from(source))) return { kind: 'current' };
	if (previous) {
		const hash = createHash('sha256').update(bytes).digest('hex');
		if (previous.includes(hash)) return { kind: 'previous', mode: stat.mode & 0o777, hash };
	}
	return { kind: 'conflict' };
}

function canPublishAdapter(current: AdapterState, planned: AdapterState): boolean {
	return (
		current.kind === 'current' ||
		(current.kind === 'missing' && planned.kind === 'missing') ||
		(current.kind === 'previous' &&
			planned.kind === 'previous' &&
			current.mode === planned.mode &&
			current.hash === planned.hash)
	);
}

function publishAdapter(
	file: string,
	source: string,
	planned: AdapterState,
	previous: readonly string[],
): boolean {
	const current = inspectAdapter(file, source, previous);
	if (current.kind === 'current') return true;
	if (!canPublishAdapter(current, planned)) return false;
	if (current.kind === 'missing') {
		try {
			fs.writeFileSync(file, source, { flag: 'wx' });
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
			return inspectAdapter(file, source, previous).kind === 'current';
		}
	}

	if (current.kind !== 'previous') return false;
	const stage = fs.mkdtempSync(path.join(path.dirname(file), '.octane-adapter-'));
	try {
		const next = path.join(stage, 'next');
		fs.writeFileSync(next, source, { mode: 0o600 });
		fs.chmodSync(next, current.mode);
		const latest = inspectAdapter(file, source, previous);
		if (latest.kind !== 'previous') return latest.kind === 'current';
		if (!canPublishAdapter(latest, current)) return false;
		fs.renameSync(next, file);
		return true;
	} finally {
		fs.rmSync(stage, { recursive: true, force: true });
	}
}

/** A write conflict stops the batch before any file, entry page or dependency is updated. */
function blockedWrite(
	root: string,
	conflict: FileResult,
	compiler: string | null = null,
): CodemodResult {
	return {
		root,
		files: [conflict],
		packages: [],
		dependencies: [],
		patched: [],
		missing: [],
		html: [],
		compiler,
	};
}

function unchangedFile(file: string, code: string, note: Note): FileResult {
	return {
		file,
		output: file,
		code,
		changed: false,
		rules: {},
		notes: [note],
		strong: null,
		strongFixes: [],
		diagnostics: [],
	};
}

/**
 * Whether Octane compiles this module: `.tsrx`, JSX, or a module that imports
 * the runtime. A declaration file is only types.
 */
function isCompiled(file: string, code: string) {
	if (file.endsWith('.d.ts')) return false;
	return /\.(?:tsrx|[jt]sx)$/.test(file) || /from\s+['"]octane['"]/.test(code);
}

function compile(compiler: Compiler, code: string, file: string, strong: boolean) {
	try {
		const result = compiler.collectDiagnostics(code, file, strong ? { strong: true } : {});
		const found = result.diagnostics.filter((d) => d.severity !== 'hint').map(finding);
		return result.error == null ? found : [...found, thrown(result.error)];
	} catch (error) {
		return [thrown(error)];
	}
}

function dedupe(diagnostics: FileResult['diagnostics']) {
	const seen = new Set<string>();
	return diagnostics.filter((d) => {
		const key = `${d.code}:${d.line}:${d.message}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * The modules under `entry` that pass `test`: by default, those the codemod
 * migrates.
 */
function collect(entry: string, test: (name: string) => boolean = isSource) {
	if (fs.statSync(entry).isFile()) return test(entry) ? [entry] : [];
	return scanSourceFiles(entry, { limit: Infinity }).filter(test).sort();
}

function isTsrx(name: string) {
	return name.endsWith('.tsrx');
}

/** The compiler options of the tsconfig that governs `root`, or null. */
function tsconfigOptions(root: string): ts.CompilerOptions | null {
	const file = ts.findConfigFile(root, ts.sys.fileExists);
	if (!file) return null;
	const { config } = ts.readConfigFile(file, ts.sys.readFile);
	return ts.parseJsonConfigFileContent(config ?? {}, ts.sys, path.dirname(file)).options;
}

/** Bundler and tool configs belong to `octane init`, not the codemod. */
function isSource(name: string) {
	return SOURCE.test(name) && !/\.config\.[cm]?[jt]s$/.test(name);
}

/**
 * The project module a relative specifier names, trying the extensions and
 * directory indexes a bundler would.
 */
function resolveModule(
	from: string,
	specifier: string,
	files: Set<string>,
): { file: string; index: boolean } | null {
	if (!specifier.startsWith('.')) return null;
	const base = path.resolve(path.dirname(from), specifier);
	const stem = base.replace(/\.(?:[cm]?[jt]sx?)$/, '');
	for (const file of [base, ...['.tsx', '.ts', '.jsx', '.js'].map((ext) => stem + ext)]) {
		if (files.has(file)) return { file, index: false };
	}
	for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
		const file = path.join(base, 'index' + ext);
		if (files.has(file)) return { file, index: true };
	}
	return null;
}

function relativeTsImport(from: string, to: string) {
	const specifier = path.relative(path.dirname(from), to).split(path.sep).join('/').slice(0, -3);
	return specifier.startsWith('.') ? specifier : './' + specifier;
}

/** Only relative assets and unambiguous directory aliases have a local file to inspect. */
function svgAsset(root: string, dir: string, specifier: string, config: ts.CompilerOptions | null) {
	if (!/\.svg$/i.test(specifier) || /[!%?#\\]/.test(specifier)) return null;
	if (specifier.startsWith('./') || specifier.startsWith('../'))
		return path.resolve(dir, specifier);
	const matches = Object.entries(config?.paths ?? {}).filter(([key]) => {
		const star = key.indexOf('*');
		return star < 0
			? key === specifier
			: specifier.startsWith(key.slice(0, star)) && specifier.endsWith(key.slice(star + 1));
	});
	if (matches.length !== 1) return null;
	const [key, targets] = matches[0];
	if (
		key.indexOf('*') !== key.length - 1 ||
		!key.endsWith('/*') ||
		targets.length !== 1 ||
		targets[0].indexOf('*') !== targets[0].length - 1 ||
		!targets[0].endsWith('/*')
	)
		return null;
	const base =
		config?.baseUrl ?? (typeof config?.pathsBasePath === 'string' ? config.pathsBasePath : root);
	return path.resolve(base, targets[0].slice(0, -1), specifier.slice(key.length - 1));
}

/**
 * Resolve against the files on disk before any rename, including modules
 * outside the selected paths that could win an extensionless lookup.
 */
function renamedImports(
	root: string,
	config: ts.CompilerOptions | null,
	renames: Map<string, string>,
) {
	const options = {
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		...config,
		preserveSymlinks: true,
	};
	const cache = ts.createModuleResolutionCache(root, (file) => file, options);
	const pathsBase =
		options.baseUrl ?? (typeof config?.pathsBasePath === 'string' ? config.pathsBasePath : root);
	const aliases = Object.entries(options.paths ?? {}).map(([key, targets]) => {
		const [start, end] = key.split('*');
		const directory =
			key.endsWith('/*') && targets.length === 1 && targets[0].endsWith('/*')
				? path.resolve(pathsBase, targets[0].slice(0, -1)) + path.sep
				: null;
		return { start, end, directory };
	});
	return (from: string, specifier: string, unmatched?: (file: string) => void) => {
		const matches = specifier.startsWith('.')
			? []
			: aliases.filter(({ start, end }) =>
					end === undefined
						? specifier === start
						: specifier.startsWith(start) && specifier.endsWith(end),
				);
		if (!renames.size || (!specifier.startsWith('.') && !matches.length)) return null;
		const resolved = ts.resolveModuleName(specifier, from, options, ts.sys, cache).resolvedModule;
		// TypeScript returns slash-delimited names, including on Windows.
		const file = resolved && path.normalize(resolved.resolvedFileName);
		const target = file && renames.get(file);
		if (!target) {
			if (file) unmatched?.(file);
			return null;
		}
		// Only a single directory alias preserves the specifier's suffix.
		// A fixed alias or fallback list may resolve elsewhere after a rename.
		const alias = matches.length === 1 ? matches[0] : null;
		if (alias?.directory && target.startsWith(alias.directory)) {
			return {
				file,
				specifier: alias.start + target.slice(alias.directory.length).split(path.sep).join('/'),
			};
		}
		const relative = path.relative(path.dirname(from), target).split(path.sep).join('/');
		return {
			file,
			specifier: relative.startsWith('../') ? relative : './' + relative,
		};
	};
}

/** TS can prefer a source file over a separate JS sibling or directory entry. */
function hasModuleSibling(file: string) {
	const stem = file.slice(0, -path.extname(file).length);
	const dir = path.dirname(stem);
	const stems = path.basename(stem) === 'index' ? [stem, dir] : [stem, path.join(stem, 'index')];
	return (
		stems.some((base) =>
			['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'].some(
				(ext) => base + ext !== file && fs.existsSync(base + ext),
			),
		) || fs.existsSync(path.join(path.basename(stem) === 'index' ? dir : stem, 'package.json'))
	);
}

/** Read the selected implementation only when a localized prop needs it. */
type PropDestination = 'text' | 'render' | 'forwarded-text' | 'host-text';
function propsOf(
	file: string,
	importedRender: NonNullable<TransformOptions['forwardedRender']>,
	hostText: (module: string, name: string, prop: string) => boolean,
	types: () => TransformOptions['types'],
): (
	destination: PropDestination,
	name: string,
	prop: string,
	ordinaryCaller?: boolean,
	depth?: number,
) => boolean {
	if (hasModuleSibling(file)) return () => false;
	const { sf, checker } = bind(file, fs.readFileSync(file, 'utf8'));
	const module = checker.getSymbolAtLocation(sf);
	const names = module && new Map(checker.getExportsOfModule(module).map((s) => [s.name, s]));
	const checks = new Map<PropDestination, ReturnType<typeof forwardedProps>>();
	const typeOf = (node: ts.Node) =>
		projectTypeAt(node, types())?.type ?? checker.getTypeAtLocation(node);
	const renderTypes = { typeOf, text: (ref: ts.Node) => textKind(typeOf(ref)) !== 0 };
	return (destination, name, prop, ordinaryCaller, depth) => {
		let accepts = checks.get(destination);
		if (!accepts)
			checks.set(
				destination,
				(accepts = forwardedProps(
					sf,
					checker,
					destination === 'render' ? { imported: importedRender, ...renderTypes } : 'text',
					undefined,
					undefined,
					destination === 'forwarded-text' || destination === 'host-text'
						? { ...renderTypes, next: destination === 'forwarded-text' ? hostText : undefined }
						: undefined,
				)),
			);
		return accepts(names?.get(name), prop, ordinaryCaller, depth);
	};
}

/** Which names each module exports as a context, following `export … from`. */
function contextIndex(
	exports: Map<string, TransformResult['exports']>,
	files: Set<string>,
): (file: string) => Set<string> {
	const resolved: Map<string, Set<string>> = new Map();
	const contextsOf = (file: string) => {
		let names = resolved.get(file);
		if (names) return names;
		names = new Set(exports.get(file)?.contexts);
		// Set before following re-exports, so a cycle ends.
		resolved.set(file, names);
		for (const { specifier, names: pairs } of exports.get(file)?.reexports ?? []) {
			const target = resolveModule(file, specifier, files);
			if (!target) continue;
			const theirs = contextsOf(target.file);
			if (pairs === null) for (const name of theirs) names.add(name);
			else for (const [imported, exported] of pairs) if (theirs.has(imported)) names.add(exported);
		}
		return names;
	};
	return contextsOf;
}

/**
 * The binding that replaces a React package import, recorded so the report
 * can list the dependency changes.
 */
function resolveBinding(
	specifier: string,
	file: string,
	project: {
		root: string;
		original: (file: string, module: string) => boolean;
		motionExports: (file: string) => ReadonlySet<string> | null;
	},
	packages: Map<string, string>,
	notes: Note[],
) {
	if (specifier === 'radix-ui' && !project.original(file, specifier)) {
		notes.push({
			rule: 'bindings',
			severity: 'error',
			line: 1,
			message:
				'`radix-ui` resolves to a different module through a TypeScript alias. Review the local component before migrating this import.',
		});
		return null;
	}
	const name = catalogName(specifier);
	if (name === null) return null;
	const target = CATALOG[name];
	const binding = packageName(target);
	const entry = DATA.bindings.find((candidate) => candidate.name === binding);
	const subpath = target.slice(binding.length) + specifier.slice(name.length);
	const served = entry && entry.exports.some((key) => serves(key, `.${subpath}`));
	const reactMotion = isReactMotion(specifier);
	if (target !== binding || reactMotion) {
		const shadowed = [specifier, binding + subpath].find((name) => !project.original(file, name));
		let message: string | undefined;
		if (shadowed) {
			message = `Resolve \`${shadowed}\` to its original package before migrating this import.`;
		} else if (reactMotion && project.motionExports(file) === null) {
			message = `Could not check the exports of \`${MOTION_BINDING}\`. Install the intended binding version and rerun the codemod.`;
		} else if (
			subpath &&
			(!served || !canUseBindingSubpath(file, project.root, binding, subpath, entry.version))
		) {
			message = `Install a version of \`${binding}\` that exports \`.${subpath}\` before migrating this import.`;
		}
		if (message) {
			notes.push({ rule: 'bindings', severity: 'error', line: 1, message });
			return null;
		}
	}
	// Partial bindings are recorded only after their export check accepts a rewrite.
	if (!reactMotion) packages.set(name, binding);
	// An aggregate binding (`@octanejs/visx`, for `@visx/visx`) serves each
	// package of its scope from a subpath: `@visx/hierarchy` is
	// `@octanejs/visx/hierarchy`.
	const upstream = entry?.upstream?.package;
	const aggregate = upstream?.match(/^@([^/]+)\/\1$/);
	if (
		target === binding &&
		aggregate &&
		name !== upstream &&
		name.startsWith(`@${aggregate[1]}/`)
	) {
		return `${binding}/${name.slice(aggregate[1].length + 2)}${specifier.slice(name.length)}`;
	}
	if (subpath === '' || served) {
		return binding + subpath;
	}
	// A binding outside the catalog has exports the codemod cannot see.
	notes.push(
		entry
			? {
					rule: 'bindings',
					severity: 'error',
					line: 1,
					message: `\`${binding}\` has no \`.${subpath}\` export. Import these names from its root if it exports them there.`,
				}
			: {
					rule: 'bindings',
					severity: 'warning',
					line: 1,
					message: `Check that \`${binding}${subpath}\` exists; the binding may export it from its root.`,
				},
	);
	return binding + subpath;
}

/** Read the published binding's authored ESM root without loading it. */
function readMotionExports(manifest: unknown, dir: string): ReadonlySet<string> | null {
	const pkg = record(manifest);
	const target = record(pkg.exports)['.'];
	if (
		pkg.name !== MOTION_BINDING ||
		pkg.type !== 'module' ||
		typeof target !== 'string' ||
		!target.startsWith('./') ||
		!target.endsWith('.ts') ||
		target.endsWith('.d.ts')
	)
		return null;
	const entry = path.resolve(dir, target);
	if (
		!entry.startsWith(dir + path.sep) ||
		!ts.sys.fileExists(entry) ||
		!fs.realpathSync(entry).startsWith(dir + path.sep)
	)
		return null;
	const program = ts.createProgram([entry], {
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		target: ts.ScriptTarget.ESNext,
		skipLibCheck: true,
		types: [],
	});
	const source = program.getSourceFile(entry);
	if (!source) return null;
	const checker = program.getTypeChecker();
	const module = checker.getSymbolAtLocation(source);
	if (!module) return null;
	return new Set(
		checker
			.getExportsOfModule(module)
			.filter(
				(symbol) =>
					MOTION_EXPORTS.has(symbol.name) &&
					(!(symbol.flags & ts.SymbolFlags.Alias) ||
						checker.getAliasedSymbol(symbol).declarations?.length),
			)
			.map(({ name }) => name),
	);
}

function canUseBindingSubpath(
	file: string,
	root: string,
	binding: string,
	subpath: string,
	version: string,
) {
	const dir = path.dirname(file);
	const installed = readInstalled(dir, binding);
	if (installed) {
		if (installed.manifest.name !== binding) return false;
		const entry = record(installed.manifest.exports)[`.${subpath}`];
		let target = entry;
		if (isRecord(entry)) {
			const conditions = Object.entries(entry);
			if (conditions.some(([key]) => !['types', 'import', 'require', 'default'].includes(key)))
				return false;
			target = conditions.find(([key]) => key === 'import' || key === 'default')?.[1];
		}
		if (typeof target !== 'string' || !target.startsWith('./')) return false;
		const resolved = path.resolve(installed.dir, target);
		return (
			resolved.startsWith(installed.dir + path.sep) &&
			fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()
		);
	}
	// New dependencies use the catalog version. Other pins need an installed export proof.
	return bindingDeclarations(root, dir, binding).every((spec) =>
		catalogBindingVersion(spec, version),
	);
}

function bindingDeclarations(root: string, dir: string, binding: string): unknown[] {
	const versions: unknown[] = [];
	for (const project of new Set([root, findRoot(dir)])) {
		const manifestFile = path.join(project, 'package.json');
		if (!fs.existsSync(manifestFile)) continue;
		const manifest = record(JSON.parse(fs.readFileSync(manifestFile, 'utf8')));
		for (const field of DEPENDENCY_FIELDS) {
			const spec = record(manifest[field])[binding];
			if (spec !== undefined) versions.push(spec);
		}
	}
	return versions;
}

function catalogBindingVersion(spec: unknown, version: string) {
	return spec === version || spec === `^${version}`;
}

/**
 * Whether a package `exports` key serves a subpath, directly or through a
 * `*` pattern such as `./locale/*`.
 */
function serves(key: string, subpath: string) {
	const [head, tail] = key.split('*');
	return tail === undefined ? key === subpath : subpath.startsWith(head) && subpath.endsWith(tail);
}

/**
 * The catalog entry for a package specifier, or null. The catalog keys some
 * bindings by subpath (`better-auth/react`), so the longest matching prefix
 * wins.
 */
function catalogName(specifier: string) {
	if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
	const parts = specifier.split('/');
	for (let length = parts.length; length > 0; length--) {
		const candidate = parts.slice(0, length).join('/');
		if (candidate === 'motion/react' && candidate !== specifier) continue;
		// Lottie's exported view still needs explicit renderer ownership at its callers.
		if (candidate !== 'lottie-react' && candidate in CATALOG) return candidate;
	}
	return null;
}

/**
 * The React package a specifier names when Octane has no binding for it, or
 * null.
 * @param from the importing module
 */
function unportedName(specifier: string, from: string) {
	if (specifier.startsWith('.') || specifier.startsWith('/') || catalogName(specifier) !== null)
		return null;
	const root = packageName(specifier);
	// Any package's `/react` entry renders with React (`@tanstack/markdown/react`).
	if (/\/react(?:\/|$)/.test(specifier.slice(root.length))) return specifier;
	return rendersWithReact(root, from) ? root : null;
}

/**
 * The package a bare specifier imports from: `@pierre/diffs` for
 * `@pierre/diffs/react`.
 */
function packageName(specifier: string) {
	return specifier
		.split('/')
		.slice(0, specifier.startsWith('@') ? 2 : 1)
		.join('/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

/** A shared declaration entry can hide an executable branch from TypeScript resolution. */
function hasRuntimeExportCondition(exports: unknown, conditions: readonly string[]) {
	const map = record(exports);
	const root = Object.keys(map).some((key) => key.startsWith('.')) ? map['.'] : exports;
	function walk(value: unknown, matched: boolean): boolean {
		if (typeof value === 'string' || value === null) return matched;
		if (Array.isArray(value)) return value.some((entry) => walk(entry, matched));
		return Object.entries(record(value)).some(
			([key, entry]) =>
				key !== 'types' &&
				!key.startsWith('types@') &&
				walk(entry, matched || conditions.includes(key)),
		);
	}
	return walk(root, false);
}

/**
 * Add the bindings the migrated code imports to the project's package.json,
 * each at its catalog version and in the field that lists the React package it
 * replaces. TanStack publishes its Octane adapters outside the catalog, so
 * those take `latest`.
 */
function addBindings(
	root: string,
	packages: Map<string, string>,
	write: boolean,
): CodemodResult['dependencies'] {
	const file = path.join(root, 'package.json');
	if (!fs.existsSync(file)) return [];
	const text = fs.readFileSync(file, 'utf8');
	const manifest: unknown = JSON.parse(text);
	if (packages.size === 0) return [];
	if (
		!isRecord(manifest) ||
		DEPENDENCY_FIELDS.some((field) => manifest[field] !== undefined && !isRecord(manifest[field]))
	) {
		throw new Error('Cannot add bindings to malformed package.json dependency fields.');
	}
	const added: CodemodResult['dependencies'] = [];
	for (const [from, to] of packages) {
		if (DEPENDENCY_FIELDS.some((field) => record(manifest[field])[to] !== undefined)) continue;
		const version = DATA.bindings.find((binding) => binding.name === to)?.version;
		const range = version ? `^${version}` : 'latest';
		const field = record(manifest.devDependencies)[packageName(from)]
			? 'devDependencies'
			: 'dependencies';
		manifest[field] = Object.fromEntries(
			Object.entries({ ...record(manifest[field]), [to]: range }).sort(([a], [b]) =>
				a.localeCompare(b),
			),
		);
		added.push({ name: to, range });
	}
	if (write && added.length > 0) {
		const indent = /^[ \t]+/m.exec(text)?.[0] ?? '  ';
		fs.writeFileSync(file, JSON.stringify(manifest, null, indent) + '\n');
	}
	return added;
}

/**
 * The patches a project applies to the React packages the migration replaces,
 * which stop applying once the code imports the binding instead: pnpm's and
 * Bun's `patchedDependencies`, in package.json or pnpm-workspace.yaml, and
 * patch-package's `patches/name+version.patch`. They live where the project
 * installs, so each directory up from `root` is read until a lockfile.
 */
function patchedPackages(root: string, packages: Map<string, string>): CodemodResult['patched'] {
	const replaced = new Set([...packages.keys()].map(packageName));
	const patched: CodemodResult['patched'] = [];
	for (let dir = root; ; dir = path.dirname(dir)) {
		const read = (name: string) => {
			const file = path.join(dir, name);
			return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
		};
		const manifest = record(JSON.parse(read('package.json') ?? '{}'));
		/** `name@version` and its patch */
		const declared = Object.entries({
			...record(record(manifest.pnpm).patchedDependencies),
			...record(manifest.patchedDependencies),
		}).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
		const workspace =
			/^patchedDependencies:[ \t]*\r?\n((?:[ \t]+.*\r?\n?)*)/m.exec(
				read('pnpm-workspace.yaml') ?? '',
			)?.[1] ?? '';
		for (const [, , key, , patch] of workspace.matchAll(
			/^[ \t]+(["']?)(.+?)\1:[ \t]*(["']?)(.+?)\3[ \t]*$/gm,
		)) {
			declared.push([key, patch]);
		}
		const patches = path.join(dir, 'patches');
		for (const name of fs.existsSync(patches) ? fs.readdirSync(patches) : []) {
			const match = /^((?:@[^+]+\+)?[^+]+)\+[^+]+\.patch$/.exec(name);
			if (match) declared.push([match[1].replace('+', '/'), `patches/${name}`]);
		}
		for (const [key, patch] of declared) {
			const name = key.replace(/(?!^)@[^@]*$/, '');
			if (replaced.has(name))
				patched.push({ name, patch: path.relative(root, path.join(dir, patch)) });
		}
		const installed = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb'];
		if (installed.some((name) => fs.existsSync(path.join(dir, name))) || path.dirname(dir) === dir)
			return patched;
	}
}

/**
 * Whether a package renders through React: it declares `react` as a peer or
 * dependency when installed, or its name says so when it is not. A package
 * with a `./react` entry (`@pierre/trees/react`) renders through React there,
 * which the caller matches by subpath; its other entries need no binding. An
 * optional peer alone does not say which entries use React.
 */
function rendersWithReact(name: string, from: string) {
	if (name === 'octane' || name.startsWith('@octanejs/') || name.startsWith('node:')) return false;
	const manifest: unknown = readInstalled(path.dirname(from), name)?.manifest;
	if (!isRecord(manifest)) return REACT_PACKAGE.test(name);
	if (record(manifest.exports)['./react']) return false;
	return ['peerDependencies', 'dependencies'].some(
		(field) => record(manifest[field]).react !== undefined,
	);
}

/**
 * Point `<script src>` in HTML entry pages at renamed modules.
 * @param targets the paths being migrated
 */
function planEntryPages(
	root: string,
	targets: string[],
	renames: Map<string, string>,
	unmatched: (file: string, issuer: string) => void,
) {
	const updated = new Map<string, string>();
	for (const page of findHtml(root, targets)) {
		const html = fs.readFileSync(page, 'utf8');
		const next = html.replace(
			/(<script\b[^>]*\bsrc=)(["'])([^"']+)\2/g,
			(match, open: string, quote: string, src: string) => {
				// Vite serves `/` from the page's own directory, as it does `./`.
				const file = path.join(path.dirname(page), src);
				const renamed = renames.get(file);
				if (!renamed) {
					unmatched(file, page);
					return match;
				}
				return open + quote + src.replace(/\.[jt]sx?$/, '.tsrx') + quote;
			},
		);
		if (next !== html) updated.set(page, next);
	}
	return updated;
}

/**
 * Follow imports outside the migrated paths as well as exact path strings
 * in scripts and configs. Parse TSRX importers with their own grammar so
 * template text that looks like an import remains text.
 */
function rewriteModulePaths(
	code: string,
	file: string,
	root: string,
	renames: Map<string, string>,
	resolveRename: (from: string, specifier: string) => string | null,
	unmatched?: (file: string, issuer: string) => void,
): { code: string; count: number } | null {
	const edits: { start: number; end: number; text: string }[] = [];
	function literal(value: string, start: number, end: number, moduleSource: boolean) {
		if (!moduleSource) {
			const ext = SOURCE.exec(value)?.[0];
			if (ext && code.slice(end - 1 - ext.length, end - 1) === ext) {
				const candidates = [path.dirname(file), root].map((dir) => path.join(dir, value));
				if (candidates.some((candidate) => renames.has(candidate)))
					edits.push({ start: end - 1 - ext.length, end: end - 1, text: '.tsrx' });
				else for (const candidate of candidates) unmatched?.(candidate, file);
			}
			return;
		}
		const next = resolveRename(file, value);
		if (next) {
			const quoted = JSON.stringify(next);
			const text =
				code[start] === "'" ? "'" + quoted.slice(1, -1).replaceAll("'", "\\'") + "'" : quoted;
			edits.push({ start, end, text });
		}
	}
	if (isTsrx(file)) {
		const { program } = parseSync(file, code);
		// TSRX has dialect nodes beyond TypeScript's visitor. Inspect only the fields
		// shared by parsed module sources and recurse through the parser's AST.
		const visit = (node: unknown): void => {
			if (Array.isArray(node)) {
				for (const item of node) visit(item);
				return;
			}
			if (!isRecord(node) || typeof node.type !== 'string') return;
			const source =
				node.source ?? (node.type === 'TSExternalModuleReference' ? node.expression : null);
			if (isRecord(source) && typeof source.start === 'number' && typeof source.end === 'number') {
				if (source.type === 'Literal' && typeof source.value === 'string') {
					literal(source.value, source.start, source.end, true);
				} else if (
					source.type === 'TemplateLiteral' &&
					Array.isArray(source.expressions) &&
					!source.expressions.length &&
					Array.isArray(source.quasis)
				) {
					const quasi: unknown = source.quasis[0];
					if (isRecord(quasi) && isRecord(quasi.value) && typeof quasi.value.cooked === 'string') {
						literal(quasi.value.cooked, source.start, source.end, true);
					}
				}
			}
			for (const child of Object.values(node)) visit(child);
		};
		if (program) visit(program);
	} else {
		const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
		const visit = (node: ts.Node) => {
			if (ts.isStringLiteralLike(node)) {
				const p = node.parent;
				const moduleSource =
					((ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) &&
						p.moduleSpecifier === node) ||
					ts.isExternalModuleReference(p) ||
					(ts.isLiteralTypeNode(p) && ts.isImportTypeNode(p.parent) && p.parent.argument === p) ||
					(ts.isCallExpression(p) &&
						p.expression.kind === ts.SyntaxKind.ImportKeyword &&
						p.arguments[0] === node);
				literal(node.text, node.getStart(sf), node.end, moduleSource);
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
	if (!edits.length) return null;
	for (const { start, end, text } of edits.sort((a, b) => b.start - a.start))
		code = code.slice(0, start) + text + code.slice(end);
	return { code, count: edits.length };
}

/**
 * The HTML pages a Vite or CRA app keeps beside its sources: those in the
 * root, `public/`, `src/`, and each migrated directory.
 */
function findHtml(root: string, targets: string[]) {
	const dirs = new Set([root, path.join(root, 'public'), path.join(root, 'src'), ...targets]);
	return [...dirs]
		.filter((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory())
		.flatMap((dir) =>
			fs
				.readdirSync(dir)
				.filter((name) => name.endsWith('.html'))
				.map((name) => path.join(dir, name)),
		);
}
