import ts from 'typescript';
import { hasRuntimeDependency } from './scoped-store-contract.js';
import { skipWrappers } from './expression-wrappers.js';
import { bind, nativeReactCompat } from './transform.js';

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

/** Original imported components handed directly to an authored React island. */
export async function islandComponents(
	file: string,
	source: string,
	original: (module: string) => boolean,
) {
	let code = source;
	if (file.endsWith('.tsrx')) {
		const { compileToVolarMappings } = await import('octane/compiler/volar');
		try {
			code = compileToVolarMappings(source, file, { loose: true }).code;
		} catch (error) {
			// Project-wide inspection also encounters unfinished files outside the selected inputs.
			if (error instanceof SyntaxError) return [];
			throw error;
		}
	}
	const { sf, checker } = bind(file.endsWith('.tsrx') ? file + '.tsx' : file, code);
	const components = new Set<string>();
	function imported(node: ts.Node) {
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
	function component(expr: ts.Expression) {
		const node = skipWrappers(expr);
		if (ts.isConditionalExpression(node)) {
			component(node.whenTrue);
			component(node.whenFalse);
			return;
		}
		const ref = ts.isJsxElement(node)
			? node.openingElement.tagName
			: ts.isJsxSelfClosingElement(node)
				? node.tagName
				: node;
		const entry = imported(ref);
		if (entry) components.add(entry.module);
	}
	function visit(n: ts.Node) {
		if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
			const tag = imported(n.tagName);
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
