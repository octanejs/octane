import path from 'node:path';
import ts from 'typescript';

// Read runner selectors from immutable configuration without importing or executing it.
// A project keeps its own exclusions; exclusions from one project must never hide
// a file selected by another project.
export function configuredTestSelectors(source, fileName, { runner, scope = '' } = {}) {
	const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
	const bindings = new Map();
	const exported = [];
	for (const statement of file.statements) {
		if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (ts.isIdentifier(declaration.name))
					bindings.set(declaration.name.text, declaration.initializer);
			}
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
	const unknown = Symbol('unresolved configuration');
	const unresolvedSpread = Symbol('unresolved configuration base');
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
	function resolve(node, active = new Set()) {
		if (!node || active.has(node)) return unknown;
		const next = new Set(active).add(node);
		if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
		if (
			ts.isParenthesizedExpression(node) ||
			ts.isAsExpression(node) ||
			ts.isSatisfiesExpression(node)
		)
			return resolve(node.expression, next);
		if (ts.isIdentifier(node)) return resolve(bindings.get(node.text), next);
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
	const selectors = [];
	function collect(value, inheritedRoot) {
		if (Array.isArray(value)) {
			for (const entry of value) collect(entry, inheritedRoot);
			return;
		}
		if (!value || typeof value !== 'object') return;
		for (const key of [...selectorKeys, 'test', 'projects']) {
			if (value[key] === unknown || (Array.isArray(value[key]) && value[key].includes(unknown)))
				throw new Error(`Cannot resolve upstream test selector ${fileName}:${key}`);
		}
		const root = typeof value.root === 'string' ? value.root : inheritedRoot;
		if ('projects' in value) {
			collect(value.projects, root);
			return;
		}
		if ('test' in value) {
			collect(value.test, root);
			return;
		}
		const relevant = [...selectorKeys].some((key) => key in value);
		if (!relevant && !runner) return;
		// An unresolved base cannot establish an exhaustive suite boundary.
		if (
			value[unresolvedSpread] &&
			!('testMatch' in value || 'testRegex' in value || 'include' in value)
		)
			throw new Error(`Cannot resolve upstream test configuration base ${fileName}`);
		selectors.push({ ...value, runner, root: root ?? '', scope, fileName });
	}
	for (const expression of exported) collect(resolve(expression), '');
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
	const regexPath = `/${path.posix.join(selector.scope, relativePath)}`;
	if (
		patterns(selector.testPathIgnorePatterns).some((pattern) =>
			new RegExp(token(pattern)).test(regexPath),
		)
	)
		return false;
	if (patterns(selector.exclude).some((pattern) => glob(relativePath, token(pattern))))
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
		return patterns(selector.testMatch ?? selector.include).some((pattern) =>
			glob(relativePath, token(pattern)),
		);
	}
	if (selector.testRegex !== undefined) {
		return patterns(selector.testRegex).some((pattern) =>
			new RegExp(token(pattern)).test(regexPath),
		);
	}
	return conventional(relativePath, { runner: selector.runner });
}
