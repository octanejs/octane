import path from 'node:path';
import ts from 'typescript';

// Read runner selectors from immutable configuration without importing or executing it.
// A project keeps its own exclusions; exclusions from one project must never hide
// a file selected by another project.
export function configuredTestSelectors(
	source,
	fileName,
	{ runner, scope = '', modules = new Map(), vitestVersion } = {},
) {
	const unknown = Symbol('unresolved configuration');
	const unresolvedSpread = Symbol('unresolved configuration base');
	function readModule(source, fileName, exportName = 'default', activeModules = new Set()) {
		if (activeModules.has(fileName)) return unknown;
		const nextModules = new Set(activeModules).add(fileName);
		if (fileName.endsWith('.json')) return JSON.parse(source);
		const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
		const bindings = new Map();
		const exported = [];
		const imports = new Map();
		const namedExports = new Map();
		for (const statement of file.statements) {
			if (ts.isVariableStatement(statement)) {
				for (const declaration of statement.declarationList.declarations) {
					if (ts.isIdentifier(declaration.name)) {
						bindings.set(declaration.name.text, declaration.initializer);
						if (
							statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
						)
							namedExports.set(declaration.name.text, declaration.initializer);
					}
				}
			} else if (
				ts.isImportDeclaration(statement) &&
				ts.isStringLiteralLike(statement.moduleSpecifier)
			) {
				const specifier = statement.moduleSpecifier.text;
				if (statement.importClause?.name)
					imports.set(statement.importClause.name.text, { specifier, name: 'default' });
				const named = statement.importClause?.namedBindings;
				if (named && ts.isNamedImports(named))
					for (const item of named.elements)
						imports.set(item.name.text, {
							specifier,
							name: item.propertyName?.text ?? item.name.text,
						});
			} else if (ts.isFunctionDeclaration(statement) && statement.name) {
				bindings.set(statement.name.text, statement);
			} else if (ts.isExportAssignment(statement)) exported.push(statement.expression);
			else if (ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression)) {
				const expression = statement.expression;
				if (
					expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
					expression.left.getText(file) === 'module.exports'
				)
					exported.push(expression.right);
			}
		}
		function resolve(node, active = new Set()) {
			if (!node || active.has(node)) return unknown;
			const next = new Set(active).add(node);
			if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node))
				return node.text;
			if (
				ts.isParenthesizedExpression(node) ||
				ts.isAsExpression(node) ||
				ts.isSatisfiesExpression(node)
			)
				return resolve(node.expression, next);
			if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
			if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
			if (ts.isIdentifier(node)) {
				const imported = imports.get(node.text);
				if (imported) return readImport(imported.specifier, imported.name);
				return resolve(bindings.get(node.text), next);
			}
			if (ts.isPropertyAccessExpression(node)) {
				const value = resolve(node.expression, next);
				return value && typeof value === 'object' && Object.hasOwn(value, node.name.text)
					? value[node.name.text]
					: unknown;
			}
			if (ts.isArrayLiteralExpression(node)) {
				return node.elements.flatMap((element) => {
					const value = resolve(ts.isSpreadElement(element) ? element.expression : element, next);
					return ts.isSpreadElement(element) && Array.isArray(value) ? value : [value];
				});
			}
			if (ts.isObjectLiteralExpression(node)) {
				const object = Object.create(null);
				for (const property of node.properties) {
					if (ts.isSpreadAssignment(property)) {
						const spread = resolve(property.expression, next);
						if (spread && typeof spread === 'object' && !Array.isArray(spread))
							Object.assign(object, spread);
						else object[unresolvedSpread] = true;
					} else if (ts.isShorthandPropertyAssignment(property)) {
						object[property.name.text] = resolve(property.name, next);
					} else if (
						ts.isPropertyAssignment(property) &&
						(ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))
					) {
						object[property.name.text] = resolve(property.initializer, next);
					}
				}
				return object;
			}
			if (
				ts.isArrowFunction(node) ||
				ts.isFunctionExpression(node) ||
				ts.isFunctionDeclaration(node)
			) {
				if (!node.body) return unknown;
				if (!ts.isBlock(node.body)) return resolve(node.body, next);
				const alternatives = [];
				const visit = (child) => {
					if (ts.isReturnStatement(child)) alternatives.push(resolve(child.expression, next));
					else if (!ts.isFunctionLike(child)) ts.forEachChild(child, visit);
				};
				visit(node.body);
				return alternatives.flat();
			}
			if (ts.isCallExpression(node)) {
				const imported = ts.isIdentifier(node.expression)
					? imports.get(node.expression.text)
					: undefined;
				if (
					imported?.name === 'mergeConfig' &&
					['vite', 'vitest/config'].includes(imported.specifier)
				) {
					const values = node.arguments.map((argument) => resolve(argument, next));
					if (
						values.length !== 2 ||
						values.some((value) => !value || typeof value !== 'object' || Array.isArray(value))
					)
						return unknown;
					return mergeConfiguration(values[0], values[1]);
				}
				if (
					ts.isIdentifier(node.expression) &&
					node.expression.text === 'require' &&
					node.arguments.length === 1 &&
					ts.isStringLiteralLike(node.arguments[0])
				)
					return readImport(node.arguments[0].text, 'default');
				if (ts.isIdentifier(node.expression)) {
					const binding = bindings.get(node.expression.text);
					if (
						binding &&
						(ts.isArrowFunction(binding) ||
							ts.isFunctionExpression(binding) ||
							ts.isFunctionDeclaration(binding))
					)
						return resolve(binding, next);
				}
				const arguments_ = node.arguments
					.map((argument) => resolve(argument, next))
					.filter((value) => value !== unknown);
				return arguments_.length === 0
					? unknown
					: arguments_.length === 1
						? arguments_[0]
						: arguments_;
			}
			return unknown;
		}
		function readImport(specifier, name) {
			if (specifier === 'vitest/config') {
				const defaults = vitestSelectorDefaults(vitestVersion);
				if (name === 'configDefaults') return defaults ?? unknown;
				if (name === 'defaultInclude') return defaults?.include ?? unknown;
				if (name === 'defaultExclude') return defaults?.exclude ?? unknown;
			}
			const target = resolveConfigurationImport(fileName, specifier, modules);
			return target ? readModule(modules.get(target), target, name, nextModules) : unknown;
		}
		if (exportName !== 'default') return resolve(namedExports.get(exportName));
		if (exported.length === 0) return unknown;
		return exported.length === 1
			? resolve(exported[0])
			: exported.map((expression) => resolve(expression));
	}
	const selectorKeys = new Set([
		'root',
		'rootDir',
		'roots',
		'dir',
		'testDir',
		'testMatch',
		'testRegex',
		'testPathIgnorePatterns',
		'include',
		'exclude',
	]);
	const selectors = [];
	function mergeConfiguration(base, override) {
		const result = { ...base, ...override };
		for (const key of Object.keys(override)) {
			if (Array.isArray(base[key]) && Array.isArray(override[key]))
				result[key] = [...base[key], ...override[key]];
			else if (
				base[key] &&
				override[key] &&
				typeof base[key] === 'object' &&
				typeof override[key] === 'object' &&
				!Array.isArray(base[key]) &&
				!Array.isArray(override[key])
			)
				result[key] = mergeConfiguration(base[key], override[key]);
		}
		return result;
	}
	function collect(value, inheritedRoot) {
		if (Array.isArray(value)) {
			if (value.length === 0)
				selectors.push({ runner, root: inheritedRoot, scope, fileName, testMatch: [] });
			for (const entry of value) collect(entry, inheritedRoot);
			return;
		}
		if (!value || typeof value !== 'object')
			throw new Error(`Cannot resolve upstream test configuration or project ${fileName}`);
		if (value[unresolvedSpread])
			throw new Error(`Cannot resolve upstream test configuration base ${fileName}`);
		for (const key of [...selectorKeys, 'test', 'projects', 'extends']) {
			if (value[key] === unknown || (Array.isArray(value[key]) && value[key].includes(unknown)))
				throw new Error(`Cannot resolve upstream test selector ${fileName}:${key}`);
		}
		if (runner === 'vitest' && typeof value.extends === 'string')
			throw new Error(`Cannot resolve upstream test project base ${fileName}:${value.extends}`);
		const root = typeof value.root === 'string' ? value.root : inheritedRoot;
		if ('projects' in value) {
			if ((runner === 'playwright' || runner === 'vitest') && Array.isArray(value.projects)) {
				const { projects, ...shared } = value;
				collect(
					projects.map((project) =>
						project && typeof project === 'object' && !Array.isArray(project)
							? runner === 'playwright'
								? { ...shared, ...project }
								: project.extends === true
									? { ...project, test: mergeConfiguration(shared, project.test ?? {}) }
									: project
							: project,
					),
					root,
				);
			} else collect(value.projects, root);
			return;
		}
		if ('test' in value) {
			collect(value.test, root);
			return;
		}
		const relevant = [...selectorKeys].some((key) => key in value);
		if (!relevant && !runner) return;
		selectors.push({ ...value, runner, root: root ?? '', scope, fileName });
	}
	collect(readModule(source, fileName), '');
	return selectors;
}

function patterns(value) {
	return typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
}
function glob(file, pattern) {
	// Jest's micromatch accepts bare alternation groups in addition to extglobs.
	const normalized = pattern.replace(/(?<![?*+@!])\(([^()]+\|[^()]+)\)/g, '@($1)');
	return path.posix.matchesGlob(file, normalized);
}

export function selectedByTestConfiguration(relativePath, selector, conventional) {
	const root = path.posix
		.normalize(path.posix.join(selector.root || '.', selector.rootDir || '.'))
		.replace(/^\.\//, '');
	const token = (value) => value.replaceAll('<rootDir>', root || '.').replace(/^\.\//, '');
	const roots = patterns(selector.roots).length ? patterns(selector.roots).map(token) : [root];
	const within = (prefix) =>
		!prefix ||
		prefix === '.' ||
		relativePath === prefix ||
		relativePath.startsWith(`${prefix.replace(/\/$/, '')}/`);
	if (!roots.some(within)) return false;
	if (selector.dir && !within(token(selector.dir))) return false;
	const projectPath = path.posix.relative(root || '.', relativePath);
	const regexPath = `/${path.posix.join(selector.scope, relativePath)}`;
	if (
		patterns(selector.testPathIgnorePatterns).some((pattern) =>
			new RegExp(token(pattern)).test(regexPath),
		)
	)
		return false;
	if (
		patterns(selector.exclude).some((pattern) =>
			glob(selector.runner === 'vitest' ? projectPath : relativePath, token(pattern)),
		)
	)
		return false;
	if (selector.testDir) {
		const configDirectory = path.posix.relative(
			selector.scope || '.',
			path.posix.dirname(selector.fileName),
		);
		if (!within(path.posix.normalize(path.posix.join(configDirectory, selector.testDir))))
			return false;
	}
	if (selector.testMatch !== undefined || selector.include !== undefined) {
		return patterns(selector.testMatch ?? selector.include).some((pattern) => {
			const expanded = token(pattern);
			// Playwright prepends **/ to filename and path globs before matching.
			return glob(
				selector.runner === 'vitest' ? projectPath : relativePath,
				selector.runner === 'playwright' && !expanded.startsWith('**/')
					? `**/${expanded}`
					: expanded,
			);
		});
	}
	if (selector.testRegex !== undefined) {
		return patterns(selector.testRegex).some((pattern) =>
			new RegExp(token(pattern)).test(regexPath),
		);
	}
	if (selector.runner === 'playwright')
		return glob(relativePath, '**/*.@(spec|test).?(c|m)[jt]s?(x)');
	return conventional(relativePath, { runner: selector.runner });
}

// Resolve only repository-relative modules. A missing or dynamic dependency stays
// unresolved; the selector reader decides whether it affects the suite boundary.
export function resolveConfigurationImport(fileName, specifier, available) {
	if (!specifier.startsWith('.')) return undefined;
	const base = path.posix.normalize(path.posix.join(path.posix.dirname(fileName), specifier));
	if (base === '..' || base.startsWith('../') || path.posix.isAbsolute(base)) return undefined;
	const candidates = [
		base,
		...['.js', '.ts', '.mjs', '.mts', '.cjs', '.cts', '.json'].map((extension) => base + extension),
		base + '/index.js',
		base + '/index.ts',
	];
	return candidates.find((candidate) => available.has(candidate));
}

// Vitest 3 and 4/5 have different selector defaults. Unknown versions must not
// inherit the locally installed runner's selectors during immutable intake.
function vitestSelectorDefaults(version) {
	const major = /^[~^]?([345])\.\d+\.\d+$/.exec(version ?? '')?.[1];
	if (!major) return undefined;
	return {
		include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
		exclude:
			major !== '3'
				? ['**/node_modules/**', '**/.git/**']
				: [
						'**/node_modules/**',
						'**/dist/**',
						'**/cypress/**',
						'**/.{idea,git,cache,output,temp}/**',
						'**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
					],
	};
}
