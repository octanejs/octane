import ts from 'typescript';
import { contains, renderUses } from './forwarded-props.js';
import { localUses } from './local-uses.js';
import { skipWrappers } from './expression-wrappers.js';

function literalDeclaration(declaration: ts.VariableDeclaration) {
	if (!ts.isIdentifier(declaration.name) || declaration.parent.flags & ts.NodeFlags.Using)
		return false;
	if (!declaration.initializer) return true;
	const value = skipWrappers(declaration.initializer);
	return (
		ts.isLiteralExpression(value) ||
		value.kind === ts.SyntaxKind.TrueKeyword ||
		value.kind === ts.SyntaxKind.FalseKeyword ||
		value.kind === ts.SyntaxKind.NullKeyword
	);
}

/** A direct initialization in an ordinary component returning a native host. */
export function nativeSetupHook(
	ref: ts.Identifier,
	uses: ReturnType<typeof localUses>,
	diagnostic?: {
		calleeName(callee: ts.Expression): string | null;
		nativeOutput(element: ts.JsxElement | ts.JsxSelfClosingElement): boolean;
	},
) {
	const call = ref.parent;
	if (!ts.isCallExpression(call) || call.expression !== ref) return false;
	const decl = call.parent;
	if (
		!ts.isVariableDeclaration(decl) ||
		decl.initializer !== call ||
		!ts.isVariableDeclarationList(decl.parent) ||
		!ts.isVariableStatement(decl.parent.parent)
	)
		return false;
	const statement = decl.parent.parent;
	const block = statement.parent;
	if (!ts.isBlock(block)) return false;
	const position = block.statements.indexOf(statement);
	if (!diagnostic) {
		if (position !== 0) return false;
	} else {
		const declarations = decl.parent.declarations;
		if (
			!block.statements
				.slice(0, position)
				.every(
					(prior) =>
						ts.isVariableStatement(prior) &&
						prior.declarationList.declarations.every(literalDeclaration),
				) ||
			!declarations.slice(0, declarations.indexOf(decl)).every(literalDeclaration)
		)
			return false;
	}
	const fn = block.parent;
	if (
		!(ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) ||
		fn.asteriskToken ||
		fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
	)
		return false;
	let owner: ts.FunctionDeclaration | ts.VariableStatement;
	let name: ts.Identifier | undefined;
	if (ts.isFunctionDeclaration(fn)) {
		owner = fn;
		name = fn.name;
	} else {
		if (!diagnostic || (ts.isFunctionExpression(fn) && fn.name && renderUses(uses(fn.name)).length))
			return false;
		let value: ts.Expression = fn;
		while (
			ts.isCallExpression(value.parent) &&
			value.parent.arguments[0] === value &&
			/^(?:memo|forwardRef)$/.test(diagnostic.calleeName(value.parent.expression) ?? '')
		)
			value = value.parent;
		const holder = value.parent;
		if (
			!ts.isVariableDeclaration(holder) ||
			holder.initializer !== value ||
			!ts.isIdentifier(holder.name) ||
			!ts.isVariableDeclarationList(holder.parent) ||
			(holder.parent.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const ||
			!ts.isVariableStatement(holder.parent.parent)
		)
			return false;
		owner = holder.parent.parent;
		name = holder.name;
	}
	if (
		!name ||
		!/^[A-Z]/.test(name.text) ||
		!ts.isSourceFile(owner.parent) ||
		!owner.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ||
		renderUses(uses(name)).some((ref) => {
			const tag = ref.parent;
			return !(
				diagnostic &&
				(ts.isJsxOpeningElement(tag) ||
					ts.isJsxClosingElement(tag) ||
					ts.isJsxSelfClosingElement(tag)) &&
				tag.tagName === ref &&
				diagnostic.nativeOutput(ts.isJsxSelfClosingElement(tag) ? tag : tag.parent)
			);
		})
	)
		return false;
	const last = block.statements.at(-1);
	if (!last || !ts.isReturnStatement(last) || !last.expression) return false;
	const value = skipWrappers(last.expression);
	const tag = ts.isJsxElement(value)
		? value.openingElement.tagName
		: ts.isJsxSelfClosingElement(value)
			? value.tagName
			: undefined;
	return !!tag && ts.isIdentifier(tag) && /^[a-z]/.test(tag.text);
}

/** Only a call in the first evaluated statement witnesses a hook in this export.
 * An import used by a sibling or a deferred callback says nothing about it. */
export function directReactHooks(sf: ts.SourceFile, checker: ts.TypeChecker) {
	const hooks = new Map<string, string>();
	if (contains(sf, (n) => ts.isIdentifier(n) && n.text === 'eval')) return hooks;
	const uses = localUses(sf, checker);
	for (const fn of sf.statements) {
		if (
			!ts.isFunctionDeclaration(fn) ||
			!fn.name ||
			!fn.body ||
			fn.asteriskToken ||
			fn.modifiers?.length !== 1 ||
			fn.modifiers[0].kind !== ts.SyntaxKind.ExportKeyword ||
			fn.parameters.some((p) => !ts.isIdentifier(p.name) || p.initializer)
		)
			continue;
		const first = fn.body.statements[0];
		if (!first) continue;
		const value = ts.isVariableStatement(first)
			? first.declarationList.declarations[0]?.initializer
			: ts.isReturnStatement(first) || ts.isExpressionStatement(first)
				? first.expression
				: undefined;
		if (!value || !ts.isCallExpression(value) || !ts.isIdentifier(value.expression)) continue;
		const binding = checker.getSymbolAtLocation(value.expression)?.declarations?.[0];
		if (!binding || !ts.isImportSpecifier(binding) || binding.isTypeOnly) continue;
		const clause = binding.parent.parent;
		const imp = clause.parent;
		if (
			clause.isTypeOnly ||
			!ts.isImportDeclaration(imp) ||
			imp.attributes ||
			!ts.isStringLiteral(imp.moduleSpecifier) ||
			imp.moduleSpecifier.text !== 'react'
		)
			continue;
		const hook = (binding.propertyName ?? binding.name).text;
		if (hook !== 'useState' && hook !== 'useSyncExternalStore') continue;
		// A local write can replace the exported function before the importer calls it.
		if (
			renderUses(uses(fn.name)).some(
				(ref) => !ts.isCallExpression(ref.parent) || ref.parent.expression !== ref,
			)
		)
			continue;
		hooks.set(fn.name.text, hook);
	}
	return hooks;
}
