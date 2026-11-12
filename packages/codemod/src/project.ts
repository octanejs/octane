import { createScopedStorePlanner } from './scoped-store-contract.js';
import { parseStaticSvg } from './path-svg.js';
import { storeSources } from './store-inputs.js';
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
import { PORTED_PACKAGES } from './mappings.js';
import { strengthen } from './strong.js';
import { bind, projectTypeAt, textKind, transformModule } from './transform.js';
import { forwardedProps } from './forwarded-props.js';

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
/** React packages and the Octane package that replaces each. */
const CATALOG = { ...DATA.reactPackages, ...PORTED_PACKAGES };
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
		const key = ts.sys.useCaseSensitiveFileNames ? output : output.toLowerCase();
		const previous = owners.get(key);
		if (!previous) owners.set(key, file);
		if (previous || fs.lstatSync(output, { throwIfNoEntry: false })) {
			const reason = previous
				? `is also the target of ${path.relative(root, previous)}`
				: 'already exists';
			const conflict = conflictFor(file, source, output, reason);
			if (write) return blockedWrite(root, conflict);
			conflicts.set(file, conflict);
			const previousOutput = previous && renames.get(previous);
			if (previous && previousOutput) {
				conflicts.set(
					previous,
					conflictFor(
						previous,
						fs.readFileSync(previous, 'utf8'),
						previousOutput,
						`is also the target of ${path.relative(root, file)}`,
					),
				);
				renames.delete(previous);
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
	const renamed = renamedImports(root, config, renames);
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
	function reactStoreComponent(file: string, specifier: string) {
		if (!reactCompat || !unportedName(specifier, file)) return false;
		const dir = path.dirname(file);
		// A nested project and the migration root can both include this file but
		// compile its JSX with different factories or module resolution.
		if (
			config?.jsx !== ts.JsxEmit.ReactJSX ||
			config.jsxFactory ||
			config.jsxFragmentFactory ||
			(config.jsxImportSource && config.jsxImportSource !== 'react') ||
			ts.findConfigFile(dir, ts.sys.fileExists) !== rootProject
		)
			return false;
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
	function originalModule(file: string, module: string) {
		const bindings = { moduleResolution: ts.ModuleResolutionKind.Bundler, ...config };
		const target = ts.resolveModuleName(module, file, bindings, ts.sys).resolvedModule;
		const original = ts.resolveModuleName(
			module,
			file,
			{ ...bindings, paths: undefined, baseUrl: undefined },
			ts.sys,
		).resolvedModule;
		return target?.resolvedFileName === original?.resolvedFileName ? target : undefined;
	}
	function installedReact(file: string) {
		const dir = path.dirname(file);
		if (ts.findConfigFile(dir, ts.sys.fileExists) !== rootProject) return false;
		const target = originalModule(file, 'react');
		if (!target || !['react', '@types/react'].includes(target.packageId?.name ?? '')) return false;
		// TypeScript can resolve @types/react even when the runtime is missing or linked locally.
		const runtime = readInstalled(dir, 'react');
		return (
			runtime?.manifest.name === 'react' &&
			fs.realpathSync(runtime.dir).split(path.sep).includes('node_modules') &&
			fs.realpathSync(target.resolvedFileName).split(path.sep).includes('node_modules')
		);
	}
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
				/^0\.16\.(?:[7-9]|[1-9]\d+)$/.test(octane) &&
				['react', 'react-dom'].every((name) =>
					/^19\.(?:[2-9]|\d{2,})\./.test(readInstalled(base, name)?.version ?? ''),
				) &&
				[file, adapter].every((source) => {
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
			adapterState = inspectAdapter(adapter, adapterSource, PREVIOUS_INTL_SHA256);
			if (
				adapterState.kind === 'conflict' ||
				owners.has(ts.sys.useCaseSensitiveFileNames ? adapter : adapter.toLowerCase())
			) {
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
		/^0\.16\.(?:[7-9]|[1-9]\d+)$/.test(readInstalled(helperDir, 'octane')?.version ?? '')
			? createScopedStorePlanner(helperDir, storeBridge, config ?? undefined)
			: null;
	const { inputFactory, helperFunction } = storeSources(root, config, (file, source) => {
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
				resolveRename(file, specifier) ?? resolveBinding(specifier, new Map(), []),
		}).changed;
	});
	const checkedHelpers = new Map<string, { code: string; state: AdapterState; error?: string }>();
	const generatedHelpers = new Map<string, string>();
	const svgHelpers = new Set<string>();
	const svgHelper = path.join(helperDir, 'octane-path-svg.ts');
	const svgAssets = new Map<string, boolean>();
	let svgHelperCode: string | undefined;
	function nativeSvgModule(asset: string, errors: Set<string>): string | null {
		if (
			!asset.startsWith(root + path.sep) ||
			asset.split(path.sep).includes('node_modules') ||
			/[!%?#]/.test(path.relative(root, asset))
		)
			return null;
		if (!svgAssets.has(asset)) {
			const stat = fs.lstatSync(asset, { throwIfNoEntry: false });
			svgAssets.set(
				asset,
				!!stat?.isFile() &&
					fs.realpathSync(asset) === path.join(fs.realpathSync(root), path.relative(root, asset)) &&
					!!parseStaticSvg(fs.readFileSync(asset, 'utf8')),
			);
		}
		if (!svgAssets.get(asset)) return null;
		svgHelperCode ??=
			fs.readFileSync(new URL('../templates/octane-path-svg.ts', import.meta.url), 'utf8') +
			'\n' +
			fs.readFileSync(new URL('../src/path-svg.ts', import.meta.url), 'utf8');
		const sidecar = asset + '.octane.ts';
		const code =
			'import source from ' +
			JSON.stringify('./' + path.basename(asset) + '?raw') +
			';\n' +
			'import { pathSvg } from ' +
			JSON.stringify(relativeTsImport(sidecar, svgHelper)) +
			';\n\nexport default pathSvg(source);\n';
		const conflict = checkHelper(svgHelper, svgHelperCode) || checkHelper(sidecar, code);
		if (conflict) {
			errors.add(conflict);
			return null;
		}
		generatedHelpers.set(svgHelper, svgHelperCode);
		generatedHelpers.set(sidecar, code);
		svgHelpers.add(svgHelper);
		svgHelpers.add(sidecar);
		return sidecar;
	}
	function pathSvgAdapter(file: string, specifier: string, errors: Set<string>) {
		if (
			(config?.jsxImportSource && config.jsxImportSource !== 'react') ||
			config?.jsxFactory ||
			config?.jsxFragmentFactory ||
			ts.findConfigFile(path.dirname(file), ts.sys.fileExists) !== rootProject
		)
			return null;
		const asset = svgAsset(root, path.dirname(file), specifier, config);
		const sidecar = asset && nativeSvgModule(asset, errors);
		return sidecar ? relativeTsImport(file, sidecar) : null;
	}
	let storeTemplates: ReadonlyMap<string, string> | undefined;
	function checkHelper(output: string, code: string) {
		const cached = checkedHelpers.get(output);
		if (cached)
			return cached.code === code
				? cached.error
				: 'Two generated adapters need different code at ' + path.relative(root, output);
		const name = path.relative(root, output);
		const ownerOf = (file: string) =>
			owners.has(ts.sys.useCaseSensitiveFileNames ? file : file.toLowerCase());
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
				: inspectAdapter(output, code, output === svgHelper ? PREVIOUS_SVG_SHA256 : undefined);
		let error: string | undefined;
		if (state.kind === 'conflict') {
			error =
				'The ' +
				(output === svgHelper || output.endsWith('.svg.octane.ts') ? 'SVG' : 'workspace hook') +
				' adapter path is occupied: ' +
				name;
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
			if (rejected) error = 'The target compiler rejected the workspace hook adapter: ' + name;
		}
		checkedHelpers.set(output, { code, state, error });
		return error;
	}
	const results: FileResult[] = [];
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
		const isContext = (specifier: string, name: string) => {
			if (!specifier.startsWith('.')) return null;
			const target = resolveModule(file, specifier, known);
			return target ? contextsOf(target.file).has(name) : null;
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
								(source, name) => {
									const input = inputFactory(file, source, name);
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
		const transform = (notes = extra, retry?: 'effectReceivers' | 'linkedState') =>
			transformModule(source, file, {
				captureEffectReceivers: retry === 'effectReceivers',
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
				strong,
				strictNullChecks: strictConfig !== null,
				get types() {
					return (types ??= typesOf(file));
				},
				resolveSpecifier: (specifier) =>
					resolveRename(file, specifier) ?? resolveBinding(specifier, packages, notes),
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
				forwardedRender:
					options.svgPaths && renames.has(file)
						? (module, name, prop, depth) =>
								forwardedProp(file, module, name, prop, 'render', true, depth)
						: undefined,
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
				pathSvgAdapter:
					options.svgPaths && renames.has(file)
						? (specifier) => pathSvgAdapter(file, specifier, svgErrors)
						: undefined,
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
	for (const file of renames.size
		? collect(root, (name) => SOURCE.test(name) || isTsrx(name))
		: []) {
		if (renames.has(file) || conflicts.has(file)) continue;
		const result = byFile.get(file);
		const paths = rewriteModulePaths(
			result?.code ?? fs.readFileSync(file, 'utf8'),
			file,
			root,
			renames,
			resolveRename,
		);
		if (!paths) continue;
		const rules = { ...result?.rules, 'module-paths': paths.count };
		if (result) Object.assign(result, { code: paths.code, changed: true, rules });
		else {
			const name = path.relative(root, file);
			results.push({
				file: name,
				output: name,
				changed: true,
				rules,
				notes: [],
				strong: null,
				strongFixes: [],
				diagnostics: [],
				code: paths.code,
			});
		}
	}

	const intlConsumer = results.find((file) => file.rules['react-intl']);
	const svg = generatedHelpers.has(svgHelper) && checkedHelpers.get(svgHelper);
	if (write) {
		const updates: {
			file: string;
			source: string;
			state: AdapterState;
			previous: string;
			rule: string;
		}[] = [];
		if (adapterState && adapterSource && intlConsumer)
			updates.push({
				file: adapter,
				source: adapterSource,
				state: adapterState,
				previous: PREVIOUS_INTL_SHA256,
				rule: 'react-intl',
			});
		if (svg)
			updates.push({
				file: svgHelper,
				source: svg.code,
				state: svg.state,
				previous: PREVIOUS_SVG_SHA256,
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
	const html = rewriteEntryPages(
		root,
		paths.map((entry) => path.resolve(entry)),
		renames,
		write,
	);
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
	{ kind: 'missing' | 'current' | 'conflict' } | { kind: 'previous'; mode: number };

// Hash only previously shipped helpers. A locally edited file belongs to the application.
const PREVIOUS_INTL_SHA256 = '07ec8e00847ebc6f0bd5ffeb14bc064aa23df42d1d3db5102344c739f54dca98';

const PREVIOUS_SVG_SHA256 = '3becf859871f17914f6f0631e8db8058aa4932fd4a9817718b98eb247a902b24';

function inspectAdapter(file: string, source: string, previous?: string): AdapterState {
	const stat = fs.lstatSync(file, { throwIfNoEntry: false });
	if (!stat) return { kind: 'missing' };
	if (!stat.isFile()) return { kind: 'conflict' };
	const bytes = fs.readFileSync(file);
	if (bytes.equals(Buffer.from(source))) return { kind: 'current' };
	if (previous && createHash('sha256').update(bytes).digest('hex') === previous)
		return { kind: 'previous', mode: stat.mode & 0o777 };
	return { kind: 'conflict' };
}

function canPublishAdapter(current: AdapterState, planned: AdapterState): boolean {
	return (
		current.kind === 'current' ||
		(current.kind === 'missing' && planned.kind === 'missing') ||
		(current.kind === 'previous' && planned.kind === 'previous' && current.mode === planned.mode)
	);
}

function publishAdapter(
	file: string,
	source: string,
	planned: AdapterState,
	previous: string,
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
		if (latest.mode !== current.mode) return false;
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
	return (from: string, specifier: string) => {
		const matches = specifier.startsWith('.')
			? []
			: aliases.filter(({ start, end }) =>
					end === undefined
						? specifier === start
						: specifier.startsWith(start) && specifier.endsWith(end),
				);
		if (!renames.size || (!specifier.startsWith('.') && !matches.length)) return null;
		const resolved = ts.resolveModuleName(specifier, from, options, ts.sys, cache).resolvedModule;
		const target = resolved && renames.get(resolved.resolvedFileName);
		if (!target) return null;
		// Only a single directory alias preserves the specifier's suffix.
		// A fixed alias or fallback list may resolve elsewhere after a rename.
		const alias = matches.length === 1 ? matches[0] : null;
		if (alias?.directory && target.startsWith(alias.directory)) {
			return {
				file: resolved.resolvedFileName,
				specifier: alias.start + target.slice(alias.directory.length).split(path.sep).join('/'),
			};
		}
		const relative = path.relative(path.dirname(from), target).split(path.sep).join('/');
		return {
			file: resolved.resolvedFileName,
			specifier: relative.startsWith('../') ? relative : './' + relative,
		};
	};
}

/** Read the selected implementation only when a localized prop needs it. TS may prefer a
 * .tsx source even when the runtime can load a separate .js sibling or directory entry. */
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
	const stem = file.slice(0, -path.extname(file).length);
	const dir = path.dirname(stem);
	const stems = path.basename(stem) === 'index' ? [stem, dir] : [stem, path.join(stem, 'index')];
	if (
		stems.some((base) =>
			['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'].some(
				(ext) => base + ext !== file && fs.existsSync(base + ext),
			),
		) ||
		fs.existsSync(path.join(path.basename(stem) === 'index' ? dir : stem, 'package.json'))
	)
		return () => false;
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
function resolveBinding(specifier: string, packages: Map<string, string>, notes: Note[]) {
	const name = catalogName(specifier);
	if (name === null) return null;
	const binding = CATALOG[name];
	packages.set(name, binding);
	const entry = DATA.bindings.find((candidate) => candidate.name === binding);
	// An aggregate binding (`@octanejs/visx`, for `@visx/visx`) serves each
	// package of its scope from a subpath: `@visx/hierarchy` is
	// `@octanejs/visx/hierarchy`.
	const upstream = entry?.upstream?.package;
	const aggregate = upstream?.match(/^@([^/]+)\/\1$/);
	if (aggregate && name !== upstream && name.startsWith(`@${aggregate[1]}/`)) {
		return `${binding}/${name.slice(aggregate[1].length + 2)}${specifier.slice(name.length)}`;
	}
	const subpath = specifier.slice(name.length);
	if (subpath === '' || entry?.exports.some((key) => serves(key, `.${subpath}`))) {
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
		if (candidate in CATALOG) return candidate;
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
	const fields = ['dependencies', 'devDependencies', 'peerDependencies'];
	if (
		!isRecord(manifest) ||
		fields.some((field) => manifest[field] !== undefined && !isRecord(manifest[field]))
	) {
		throw new Error('Cannot add bindings to malformed package.json dependency fields.');
	}
	const added: CodemodResult['dependencies'] = [];
	for (const [from, to] of packages) {
		if (fields.some((field) => record(manifest[field])[to] !== undefined)) continue;
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
function rewriteEntryPages(
	root: string,
	targets: string[],
	renames: Map<string, string>,
	write: boolean,
) {
	const updated: string[] = [];
	for (const page of findHtml(root, targets)) {
		const html = fs.readFileSync(page, 'utf8');
		const next = html.replace(
			/(<script\b[^>]*\bsrc=)(["'])([^"']+)\2/g,
			(match, open: string, quote: string, src: string) => {
				// Vite serves `/` from the page's own directory, as it does `./`.
				const file = path.join(path.dirname(page), src);
				const renamed = renames.get(file);
				if (!renamed) return match;
				return open + quote + src.replace(/\.[jt]sx?$/, '.tsrx') + quote;
			},
		);
		if (next !== html) {
			updated.push(path.relative(root, page));
			if (write) fs.writeFileSync(page, next);
		}
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
): { code: string; count: number } | null {
	const edits: { start: number; end: number; text: string }[] = [];
	function literal(value: string, start: number, end: number, moduleSource: boolean) {
		if (!moduleSource) {
			const ext = SOURCE.exec(value)?.[0];
			if (
				ext &&
				code.slice(end - 1 - ext.length, end - 1) === ext &&
				[path.dirname(file), root].some((dir) => renames.has(path.join(dir, value)))
			) {
				edits.push({ start: end - 1 - ext.length, end: end - 1, text: '.tsrx' });
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
