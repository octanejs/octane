import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { parseModule } = await import(pathToFileURL(require.resolve('@tsrx/core')).href);
const { createLexicalAnalysis, forEachRuntimeAstChild } = await import(
	pathToFileURL(path.join(repo, 'packages/octane/src/compiler/compile-universal.js')).href
);
const { collectReassignedBindings } = await import(
	pathToFileURL(path.join(repo, 'packages/octane/src/compiler/hook-deps.js')).href
);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clean = (id) => id.split('?')[0];
const inside = (id, directory) => id === directory || id.startsWith(directory + path.sep);
const position = (node) => ({ line: node.loc?.start?.line ?? null, offset: node.start ?? null });

function walk(node, visit) {
	if (!node || typeof node !== 'object') return;
	if (visit(node) === false) return;
	forEachRuntimeAstChild(node, (child) => walk(child, visit));
}

function importBindings(ast) {
	const bindings = new Map();
	const imports = [];
	for (const node of ast.body ?? []) {
		if (node.type !== 'ImportDeclaration' || node.importKind === 'type') continue;
		const request = node.source?.value;
		if (typeof request !== 'string') continue;
		const item = { request, sideEffectOnly: node.specifiers.length === 0, resolvedId: null };
		imports.push(item);
		for (const specifier of node.specifiers ?? []) {
			if (specifier.importKind === 'type' || !specifier.local?.name) continue;
			const imported =
				specifier.type === 'ImportDefaultSpecifier'
					? 'default'
					: specifier.type === 'ImportNamespaceSpecifier'
						? '*'
						: (specifier.imported?.name ?? specifier.imported?.value);
			if (typeof imported === 'string') bindings.set(specifier.local.name, { item, imported });
		}
	}
	return { bindings, imports };
}

function componentDefinitions(ast) {
	const definitions = new Map();
	const exports = new Map();
	const unstable = new Set();
	const writes = collectReassignedBindings(ast);
	function exported(local, name) {
		if (!local) return;
		if (!exports.has(local)) exports.set(local, []);
		exports.get(local).push(name);
	}
	for (const statement of ast.body ?? []) {
		const declaration = statement.declaration ?? statement;
		const isExported =
			statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration';
		if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) {
			definitions.set(declaration.id.name, declaration);
			if (writes.has(declaration.id)) unstable.add(declaration.id.name);
			if (isExported)
				exported(
					declaration.id.name,
					statement.type === 'ExportDefaultDeclaration' ? 'default' : declaration.id.name,
				);
		} else if (declaration?.type === 'VariableDeclaration') {
			for (const binding of declaration.declarations ?? []) {
				if (
					binding.id?.type !== 'Identifier' ||
					!['ArrowFunctionExpression', 'FunctionExpression'].includes(binding.init?.type)
				)
					continue;
				definitions.set(binding.id.name, binding.init);
				if (declaration.kind !== 'const' || writes.has(binding.id)) unstable.add(binding.id.name);
				if (isExported) exported(binding.id.name, binding.id.name);
			}
		}
		if (statement.type === 'ExportNamedDeclaration' && !statement.source) {
			for (const specifier of statement.specifiers ?? [])
				exported(specifier.local?.name, specifier.exported?.name ?? specifier.exported?.value);
		}
		if (
			statement.type === 'ExportDefaultDeclaration' &&
			statement.declaration?.type === 'Identifier'
		)
			exported(statement.declaration.name, 'default');
	}
	for (const [name, fn] of definitions) {
		let jsx = false;
		walk(fn.body, (node) => {
			if (node.type === 'JSXElement' || node.type === 'JSXFragment' || node.type === 'JSXCodeBlock')
				jsx = true;
		});
		if (!jsx) definitions.delete(name);
	}
	return { definitions, exports, unstable };
}

function topLevelExecution(ast) {
	const reasons = new Set();
	for (const statement of ast.body ?? []) {
		const node = statement.declaration ?? statement;
		if (node?.type === 'ImportDeclaration' && node.specifiers.length === 0)
			reasons.add('side-effect-only-import');
		if (node?.type === 'ExpressionStatement' && !node.directive)
			reasons.add('top-level-expression');
		if (node?.type === 'VariableDeclaration') {
			for (const item of node.declarations ?? []) {
				if (
					item.init &&
					!['Literal', 'ArrowFunctionExpression', 'FunctionExpression'].includes(item.init.type)
				)
					reasons.add('nontrivial-top-level-initializer');
			}
		}
		if (node?.type === 'ClassDeclaration') reasons.add('class-evaluation-not-analyzed');
	}
	return [...reasons].sort();
}

function analyzeSource(source, id) {
	let ast;
	try {
		ast = parseModule(source, id);
	} catch (error) {
		return {
			id,
			sourceSha256: sha256(source),
			parseError: String(error?.message ?? error),
			imports: [],
			roots: [],
			components: [],
			routeHints: [],
		};
	}
	const lexical = createLexicalAnalysis(ast);
	const { bindings, imports } = importBindings(ast);
	const { definitions, exports, unstable } = componentDefinitions(ast);
	const moduleBound = (node, name) =>
		lexical.resolveBinding(lexical.nodeScopes.get(node) ?? lexical.rootScope, name)?.scope ===
		lexical.rootScope;
	const reference = (node) => {
		if (node?.type !== 'Identifier' && node?.type !== 'JSXIdentifier')
			return { status: 'unknown', reason: 'dynamic-or-member-target' };
		const name = node.name;
		if (!moduleBound(node, name))
			return { status: 'unknown', name, reason: 'local-shadow-or-dynamic-binding' };
		if (definitions.has(name))
			return unstable.has(name)
				? { status: 'unknown', name, reason: 'mutable-or-reassigned-component-binding' }
				: { status: 'local', name };
		const binding = bindings.get(name);
		if (binding && binding.imported !== '*')
			return { status: 'import', name, request: binding.item.request, imported: binding.imported };
		return {
			status: 'unknown',
			name,
			reason: binding ? 'namespace-import' : 'unresolved-module-binding',
		};
	};
	const roots = [];
	walk(ast, (node) => {
		if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier') return;
		const binding = bindings.get(node.callee.name);
		if (
			!binding ||
			binding.item.request !== 'octane' ||
			binding.imported !== 'hydrateRoot' ||
			!moduleBound(node.callee, node.callee.name)
		)
			return;
		let target = node.arguments?.[1];
		if (target?.type === 'JSXElement') target = target.openingElement?.name;
		roots.push({ ...position(node), target: reference(target) });
	});
	const components = [];
	for (const [name, fn] of definitions) {
		const traits = new Set();
		const sites = [];
		walk(fn.body, (node) => {
			if (node.type === 'JSXElement') {
				const tag = node.openingElement?.name;
				const intrinsic = tag?.type === 'JSXIdentifier' && /^[a-z]/.test(tag.name);
				if (!intrinsic) {
					sites.push({
						...position(node),
						tag: source.slice(tag?.start ?? 0, tag?.end ?? 0),
						target: reference(tag),
					});
				}
				for (const attribute of node.openingElement?.attributes ?? []) {
					if (attribute.type === 'JSXSpreadAttribute') traits.add('spread-props-unknown');
					const prop = attribute.name?.name;
					if (prop === 'ref') traits.add('ref');
					if (intrinsic && typeof prop === 'string' && /^on[A-Z]/.test(prop))
						traits.add('native-event-handler');
					if (!intrinsic && typeof prop === 'string' && /^on[A-Z]/.test(prop))
						traits.add('component-callback-prop');
				}
			}
			if (
				node.type === 'JSXExpressionContainer' &&
				node.expression &&
				!['Literal', 'JSXEmptyExpression'].includes(node.expression.type)
			)
				traits.add('dynamic-expression');
			if (/^JSX(?:If|For|Try|Switch)/.test(node.type)) traits.add('template-control-flow');
			if (node.type === 'CallExpression') {
				if (node.callee?.type === 'Identifier') {
					const local = node.callee.name;
					const binding = bindings.get(local);
					const imported = binding && moduleBound(node.callee, local) ? binding.imported : null;
					if (imported && binding.item.request === 'octane' && /^use(?:$|[A-Z])/.test(imported))
						traits.add('octane-hook-or-use');
					else if (/^(?:use[A-Z][\w$]*|[a-zA-Z_$][\w$]*\$)$/.test(local))
						traits.add('possible-custom-hook-or-signal');
					else traits.add('calls-not-proven-pure');
				} else traits.add('calls-not-proven-pure');
			}
		});
		const active =
			traits.has('native-event-handler') || traits.has('ref') || traits.has('octane-hook-or-use');
		components.push({
			name,
			exports: exports.get(name) ?? [],
			stableDefinition: !unstable.has(name),
			...position(fn),
			traits: [...traits].sort(),
			classification: active
				? 'observed-client-activity'
				: traits.size
					? 'further-analysis-needed'
					: 'static-markup-lead',
			reasons: active
				? ['direct-event-ref-or-octane-hook']
				: ['no-absence-proof-for-updates-remount-effects-or-reactivity'],
			sites,
		});
	}
	const routeHints = [];
	if (id.includes('virtual:octane-hydrate')) {
		walk(ast, (node) => {
			if (node.type !== 'VariableDeclarator' || node.id?.name !== 'routeModules') return;
			walk(node.init, (item) => {
				if (item.type === 'ImportExpression' && typeof item.source?.value === 'string')
					routeHints.push({ request: item.source.value, ...position(item), resolvedId: null });
			});
		});
	}
	return {
		id,
		sourceSha256: sha256(source),
		imports,
		roots,
		components,
		routeHints,
		topLevelExecution: topLevelExecution(ast),
	};
}

/** Collect only source and emitted-graph observations; never alter transformed code. */
export function graphApplicability({ sourceRoots, reportFile, expectedOutDir }) {
	const scopes = sourceRoots.map((root) => path.resolve(root));
	const sources = new Map();
	return {
		name: 'octane-graph-applicability-report',
		enforce: 'pre',
		apply: 'build',
		configResolved(config) {
			if (
				expectedOutDir &&
				path.resolve(config.root, config.build.outDir) !== path.resolve(expectedOutDir)
			) {
				throw new Error(
					`Vite resolved output to ${path.resolve(config.root, config.build.outDir)}, not the requested ${path.resolve(expectedOutDir)}; choose a fresh matching output directory.`,
				);
			}
		},
		transform: {
			order: 'pre',
			async handler(code, id, options) {
				if (options?.ssr) return null;
				const file = clean(id);
				const virtual = id.includes('virtual:octane-hydrate');
				if (
					!virtual &&
					(!/\.(?:[cm]?[jt]s|[jt]sx|tsrx)$/.test(file) ||
						file.includes('/node_modules/') ||
						!scopes.some((root) => inside(file, root)))
				)
					return null;
				let source;
				if (!virtual && id !== file) {
					source = {
						id,
						sourceSha256: sha256(code),
						parseError: 'query-qualified module not analyzed',
						imports: [],
						roots: [],
						components: [],
						routeHints: [],
					};
				} else {
					try {
						source = analyzeSource(code, id);
					} catch (error) {
						source = {
							id,
							sourceSha256: sha256(code),
							parseError: String(error?.message ?? error),
							imports: [],
							roots: [],
							components: [],
							routeHints: [],
						};
					}
				}
				for (const item of [...source.imports, ...source.routeHints]) {
					try {
						const result = await this.resolve(item.request, id, { skipSelf: true });
						item.resolvedId = result?.id ?? null;
					} catch {
						/* unknown stays unknown */
					}
				}
				sources.set(id, source);
				return null;
			},
		},
		generateBundle(_options, bundle) {
			const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
			const chunkByName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
			const owners = new Map();
			for (const entry of chunks.filter((chunk) => chunk.isEntry || chunk.isDynamicEntry)) {
				const seen = new Set();
				function visit(file) {
					if (seen.has(file)) return;
					seen.add(file);
					if (!owners.has(file)) owners.set(file, []);
					owners.get(file).push(entry.fileName);
					for (const dependency of chunkByName.get(file)?.imports ?? [])
						if (chunkByName.has(dependency)) visit(dependency);
				}
				visit(entry.fileName);
			}
			const chunkFacts = chunks.map((chunk) => ({
				file: chunk.fileName,
				isEntry: chunk.isEntry,
				isDynamicEntry: chunk.isDynamicEntry,
				imports: chunk.imports,
				dynamicImports: chunk.dynamicImports,
				entryOwners: owners.get(chunk.fileName) ?? [],
				sharedByEntries: (owners.get(chunk.fileName)?.length ?? 0) > 1,
				css: [...(chunk.viteMetadata?.importedCss ?? [])],
				rawBytes: Buffer.byteLength(chunk.code),
				sha256: sha256(chunk.code),
				modules: Object.fromEntries(
					Object.entries(chunk.modules).map(([id, info]) => [
						id,
						{ renderedLength: info.renderedLength },
					]),
				),
			}));
			const moduleIds = new Set([
				...sources.keys(),
				...chunks.flatMap((chunk) => Object.keys(chunk.modules)),
			]);
			const moduleFacts = [...moduleIds].sort().map((id) => {
				const info = this.getModuleInfo(id);
				const source = sources.get(id);
				return {
					id,
					emittedIn: chunkFacts
						.filter((chunk) => (chunk.modules[id]?.renderedLength ?? 0) > 0)
						.map((chunk) => chunk.file),
					imports: info?.importedIds ?? [],
					dynamicImports: info?.dynamicallyImportedIds ?? [],
					importers: info?.importers ?? [],
					dynamicImporters: info?.dynamicImporters ?? [],
					bundlerModuleSideEffects: info?.moduleSideEffects ?? 'unknown',
					sourceTopLevelExecution: source?.topLevelExecution ?? ['not-analyzed'],
					cssRequests:
						source?.imports
							.filter((item) => /\.css(?:$|\?)/.test(item.request))
							.map((item) => item.request) ?? [],
				};
			});
			const componentById = new Map();
			const exportById = new Map();
			for (const source of sources.values()) {
				for (const component of source.components) {
					const key = `${source.id}#${component.name}`;
					const item = { id: key, moduleId: source.id, ...component, syntacticPathsFromRoots: [] };
					componentById.set(key, item);
					if (component.stableDefinition)
						for (const name of component.exports) exportById.set(`${source.id}#${name}`, key);
				}
			}
			function targetId(source, target) {
				if (target.status === 'local')
					return componentById.has(`${source.id}#${target.name}`)
						? `${source.id}#${target.name}`
						: null;
				if (target.status !== 'import') return null;
				const id = source.imports.find((item) => item.request === target.request)?.resolvedId;
				return id ? (exportById.get(`${id}#${target.imported}`) ?? null) : null;
			}
			for (const component of componentById.values()) {
				const source = sources.get(component.moduleId);
				for (const site of component.sites) {
					site.resolvedComponent = targetId(source, site.target);
					site.resolution = site.resolvedComponent ? 'resolved-direct' : 'unknown-target';
				}
			}
			const roots = [];
			for (const source of sources.values()) {
				for (const root of source.roots) {
					const id = `${source.id}:${root.offset}`;
					const target = targetId(source, root.target);
					roots.push({
						id,
						moduleId: source.id,
						...root,
						resolvedComponent: target,
						resolution: target ? 'resolved-direct' : 'unknown-target',
					});
					if (!target) continue;
					const queue = [target],
						seen = new Set();
					while (queue.length) {
						const componentId = queue.pop();
						if (seen.has(componentId)) continue;
						seen.add(componentId);
						const component = componentById.get(componentId);
						component.syntacticPathsFromRoots.push(id);
						for (const site of component.sites) {
							if (site.resolvedComponent) queue.push(site.resolvedComponent);
						}
					}
				}
			}
			const result = {
				version: 1,
				mode: 'report-only',
				tool: {
					analyzerSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))),
					node: process.version,
				},
				sourceRoots: scopes,
				roots,
				routeHints: [...sources.values()].flatMap((source) =>
					source.routeHints.map((hint) => ({
						moduleId: source.id,
						...hint,
						status: 'bootstrap-module-hint-export-and-hydration-target-unknown',
					})),
				),
				components: [...componentById.values()],
				sources: [...sources.values()].map(({ id, sourceSha256, parseError, imports }) => ({
					id,
					sourceSha256,
					parseError: parseError ?? null,
					imports,
				})),
				modules: moduleFacts,
				chunks: chunkFacts,
				assets: Object.values(bundle)
					.filter((item) => item.type === 'asset')
					.map((asset) => ({
						file: asset.fileName,
						rawBytes:
							typeof asset.source === 'string'
								? Buffer.byteLength(asset.source)
								: asset.source.length,
						sha256: sha256(asset.source),
						css: asset.fileName.endsWith('.css'),
					})),
				limitations: [
					'Observational syntactic leads only: no component is proven safe to omit.',
					'Paths follow syntactic JSX sites, including conditional and uncalled nested functions; they do not establish runtime reach.',
					'No path means no resolved path was observed; dynamic and unanalyzed paths remain unknown.',
					'Module sideEffects is bundler metadata, not a proof that removing an import preserves behavior.',
					'Chunk renderedLength is not compressed transfer cost or per-component savings.',
					'Chunks and assets are a generateBundle snapshot; later generated or moved files including HTML may be absent.',
					'Entry owners follow static chunk imports from emitted entry and dynamic-entry chunks, not runtime network requests.',
					'Only direct calls to a named hydrateRoot import from octane are detected; generated or indirect roots remain unknown.',
					'Source scope, JSX forms, package exports, barrels, dynamic components, root lifetime, props, context, updates and remounts are not fully analyzed.',
				],
			};
			fs.writeFileSync(reportFile, JSON.stringify(result, null, 2) + '\n');
		},
	};
}
