import ts from 'typescript';
import { hasRuntimeDependency } from './scoped-store-contract.js';
import { skipWrappers } from './expression-wrappers.js';
import { hasEval } from './forwarded-props.js';
import { componentTagOrExport, localUses } from './local-uses.js';
import { bind, nativeReactCompat, withoutJsxIndentation } from './transform.js';

export function importsReactBridge(source: string) {
	return (
		((source.includes('ReactCompat') && source.includes('octane/react')) ||
			source.includes('\\')) &&
		ts
			.preProcessFile(source)
			.importedFiles.some(
				({ fileName }) => fileName === 'octane/react' || fileName === 'octane/react/server',
			)
	);
}

async function bindIsland(file: string, source: string) {
	let code = source;
	if (file.endsWith('.tsrx')) {
		const { compileToVolarMappings } = await import('octane/compiler/volar');
		try {
			code = compileToVolarMappings(source, file, { loose: true }).code;
		} catch (error) {
			// Project-wide inspection also encounters unfinished files outside the selected inputs.
			if (error instanceof SyntaxError) return;
			throw error;
		}
	}
	return bind(file.endsWith('.tsrx') ? file + '.tsx' : file, code);
}

function imported(checker: ts.TypeChecker, node: ts.Node) {
	const ref = ts.isPropertyAccessExpression(node) ? node.expression : node;
	if (!ts.isIdentifier(ref)) return;
	const decl = checker.getSymbolAtLocation(ref)?.declarations?.[0];
	if (!decl) return;
	const name = ts.isPropertyAccessExpression(node)
		? ts.isNamespaceImport(decl) && node.name.text
		: ts.isImportSpecifier(decl) && !decl.isTypeOnly
			? (decl.propertyName ?? decl.name).text
			: ts.isImportClause(decl) && 'default';
	const imp = name && ts.findAncestor(decl, ts.isImportDeclaration);
	if (
		imp &&
		!imp.attributes &&
		!imp.importClause?.isTypeOnly &&
		ts.isStringLiteral(imp.moduleSpecifier)
	)
		return { name, module: imp.moduleSpecifier.text };
}

/** Original imported components handed directly to an authored React island. */
export async function islandComponents(
	file: string,
	source: string,
	original: (module: string) => boolean,
) {
	const bound = await bindIsland(file, source);
	if (!bound) return [];
	const { sf, checker } = bound;
	const components = new Set<string>();
	function component(expr: ts.Expression) {
		const node = skipWrappers(expr);
		if (ts.isConditionalExpression(node)) {
			component(node.whenTrue);
			component(node.whenFalse);
			return;
		}
		if (ts.isBinaryExpression(node)) {
			const op = node.operatorToken.kind;
			if (op === ts.SyntaxKind.AmpersandAmpersandToken) component(node.right);
			else if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
				component(node.left);
				component(node.right);
			}
			return;
		}
		const ref = ts.isJsxElement(node)
			? node.openingElement.tagName
			: ts.isJsxSelfClosingElement(node)
				? node.tagName
				: node;
		const entry = imported(checker, ref);
		if (entry) components.add(entry.module);
	}
	function visit(n: ts.Node) {
		if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
			const tag = imported(checker, n.tagName);
			if (tag && nativeReactCompat(tag.module, tag.name) && original(tag.module)) {
				const prop = n.attributes.properties.find(
					(a) => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === 'component',
				);
				if (
					prop &&
					ts.isJsxAttribute(prop) &&
					prop.initializer &&
					ts.isJsxExpression(prop.initializer) &&
					prop.initializer.expression
				)
					component(prop.initializer.expression);
				if (ts.isJsxOpeningElement(n)) {
					for (const child of n.parent.children) {
						if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) component(child);
						else if (ts.isJsxExpression(child) && child.expression) component(child.expression);
					}
				}
			}
		}
		ts.forEachChild(n, visit);
	}
	visit(sf);
	return [...components];
}

function* directExportReturns({ sf, checker }: ReturnType<typeof bind>) {
	const module = checker.getSymbolAtLocation(sf);
	if (!module || hasEval(sf)) return;
	const uses = localUses(sf, checker);
	for (const symbol of checker.getExportsOfModule(module)) {
		const decl = symbol.valueDeclaration;
		if (!decl || !(ts.isFunctionDeclaration(decl) || ts.isVariableDeclaration(decl))) continue;
		if (ts.isVariableDeclaration(decl) && !(ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const))
			continue;
		const name = decl.name;
		if (name && (!ts.isIdentifier(name) || !uses(name).every(componentTagOrExport))) continue;
		const output = returnedJsx(decl);
		if (output) yield { name: symbol.name, output };
	}
}

function returnedJsx(declaration: ts.Declaration) {
	const fn = ts.isVariableDeclaration(declaration) ? declaration.initializer : declaration;
	if (
		!fn ||
		!(ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn) || ts.isArrowFunction(fn)) ||
		fn.asteriskToken ||
		fn.modifiers?.some((item) => item.kind === ts.SyntaxKind.AsyncKeyword)
	)
		return;
	let value: ts.Expression | undefined;
	if (fn.body && ts.isBlock(fn.body)) {
		const [statement, extra] = fn.body.statements;
		if (!statement || extra || !ts.isReturnStatement(statement)) return;
		value = statement.expression;
	} else value = fn.body;
	const output = value && skipWrappers(value);
	if (output && (ts.isJsxElement(output) || ts.isJsxSelfClosingElement(output))) return output;
}

function openingTag(element: ts.JsxElement | ts.JsxSelfClosingElement) {
	return ts.isJsxElement(element) ? element.openingElement : element;
}

function hostedLeaf(output: ts.JsxElement | ts.JsxSelfClosingElement) {
	const attrs = openingTag(output).attributes.properties;
	const seen = new Set<string>();
	let component: ts.Expression | undefined;
	for (const attr of attrs) {
		if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) return;
		const name = attr.name.text;
		if (seen.has(name) || !['component', 'props', 'key'].includes(name)) return;
		seen.add(name);
		if (name === 'component') {
			const value = attr.initializer;
			if (!value || !ts.isJsxExpression(value) || !value.expression || value.dotDotDotToken) return;
			component = skipWrappers(value.expression);
		}
	}
	if (component) return ts.isJsxSelfClosingElement(output) ? component : undefined;
	if (seen.has('props') || !ts.isJsxElement(output)) return;
	const [child, extra] = withoutJsxIndentation(output.children);
	if (!extra && child && ts.isJsxSelfClosingElement(child)) return child.tagName;
}

/** Runtime imports that an explicit server host returns directly. */
export function hostedServerComponents(file: string, source: string) {
	if (
		/@jsx(?:Runtime|Frag)?\b/.test(source) ||
		[...source.matchAll(/@jsxImportSource\s+(\S+)/g)].some(([, name]) => name !== 'react')
	)
		return [];
	const bound = bind(file, source);
	const { sf, checker } = bound;
	const edges = [];
	for (const { output } of directExportReturns(bound)) {
		const host = imported(checker, openingTag(output).tagName);
		if (host?.module !== 'octane/react/server' || host.name !== 'OctaneCompat') continue;
		const ref = hostedLeaf(output);
		const leaf = ref && imported(checker, ref);
		if (leaf)
			edges.push({ ...leaf, line: sf.getLineAndCharacterOfPosition(output.getStart(sf)).line + 1 });
	}
	return edges;
}

/** Inspect the emitted local export before assigning a reverse island to a server host. */
export async function reverseIslandExports(
	file: string,
	source: string,
	original: (module: string) => boolean,
) {
	const names = new Set<string>();
	if (!importsReactBridge(source)) return names;
	const bound = await bindIsland(file, source);
	if (!bound) return names;
	for (const { name, output } of directExportReturns(bound)) {
		const island = imported(bound.checker, openingTag(output).tagName);
		if (island && nativeReactCompat(island.module, island.name) && original(island.module))
			names.add(name);
	}
	return names;
}

/** Declaration-level type imports disappear even with verbatimModuleSyntax. */
export function executableImports(file: string, source: string, verbatim: boolean) {
	const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
	const imports: string[] = [];
	function visit(node: ts.Node) {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			if (
				hasRuntimeDependency(node, verbatim) &&
				node.moduleSpecifier &&
				ts.isStringLiteral(node.moduleSpecifier)
			)
				imports.push(node.moduleSpecifier.text);
			return;
		}
		if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments[0] &&
			ts.isStringLiteralLike(node.arguments[0])
		)
			imports.push(node.arguments[0].text);
		ts.forEachChild(node, visit);
	}
	visit(sf);
	return imports;
}
