import ts from 'typescript';
import { contains, renderUses } from './forwarded-props.js';
import { localUses } from './local-uses.js';
import { skipWrappers } from './expression-wrappers.js';

/** A direct initialization in an ordinary component returning a native host. */
export function nativeSetupHook(ref: ts.Identifier, uses: ReturnType<typeof localUses>) {
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
	const block = decl.parent.parent.parent;
	if (!ts.isBlock(block) || block.statements[0] !== decl.parent.parent) return false;
	const fn = block.parent;
	if (
		!ts.isFunctionDeclaration(fn) ||
		!fn.name ||
		!/^[A-Z]/.test(fn.name.text) ||
		fn.body !== block ||
		!ts.isSourceFile(fn.parent) ||
		fn.asteriskToken ||
		!fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ||
		renderUses(uses(fn.name)).length ||
		fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
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
