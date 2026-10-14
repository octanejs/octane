import ts from 'typescript';

/**
 * Locate an authored value argument without pinning a compiler helper or its
 * arity: a runtime call takes the expression itself, or a local the same block
 * initializes with it (a binding that compares before it records).
 */
export function hasRuntimeValueArgument(code: string, expression: string): boolean {
	const ast = ts.createSourceFile('compiled.ts', code, ts.ScriptTarget.Latest, true);
	const imports = new Set<string>();
	for (const statement of ast.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			!ts.isStringLiteral(statement.moduleSpecifier) ||
			!/^octane(?:\/|$)/.test(statement.moduleSpecifier.text)
		)
			continue;
		const bindings = statement.importClause?.namedBindings;
		if (bindings !== undefined && ts.isNamedImports(bindings)) {
			for (const binding of bindings.elements) imports.add(binding.name.text);
		}
	}
	const passes = (root: ts.Node, text: string): boolean => {
		let found = false;
		const visit = (node: ts.Node): void => {
			if (
				ts.isCallExpression(node) &&
				ts.isIdentifier(node.expression) &&
				imports.has(node.expression.text) &&
				node.arguments.some((argument) => argument.getText(ast) === text)
			)
				found = true;
			if (!found) ts.forEachChild(node, visit);
		};
		visit(root);
		return found;
	};
	if (passes(ast, expression)) return true;
	let found = false;
	const visit = (node: ts.Node): void => {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer?.getText(ast) === expression
		) {
			let block: ts.Node = node;
			while (!ts.isBlock(block) && !ts.isSourceFile(block)) block = block.parent;
			found = passes(block, node.name.text);
		}
		if (!found) ts.forEachChild(node, visit);
	};
	visit(ast);
	return found;
}
