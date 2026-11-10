import { localUses, portableArguments, scalar } from './local-uses.js';
import ts from 'typescript';

type SharedInput = (module: string, name: string) => boolean;
type ResultCheck = {
	item: ts.ImportSpecifier;
	imported: SharedInput;
	known: Map<ts.Expression, boolean>;
	descriptors: (elements: ts.JsxSelfClosingElement[]) => boolean;
};

function literal(value: ts.Expression) {
	return (
		ts.isStringLiteralLike(value) ||
		ts.isNumericLiteral(value) ||
		ts.isBigIntLiteral(value) ||
		value.kind === ts.SyntaxKind.TrueKeyword ||
		value.kind === ts.SyntaxKind.FalseKeyword ||
		value.kind === ts.SyntaxKind.NullKeyword
	);
}

function literalOptions(value: ts.Expression): boolean {
	if (ts.isArrayLiteralExpression(value)) return value.elements.every(literalOptions);
	if (ts.isObjectLiteralExpression(value))
		return value.properties.every(
			(p) =>
				ts.isPropertyAssignment(p) &&
				(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
				p.name.text !== '__proto__' &&
				literalOptions(p.initializer),
		);
	return literal(value);
}

/** Bare SVG default imports can switch from a component to an asset URL for a .tsrx issuer. */
export function isBareSvgTag(
	tag: ts.JsxTagNameExpression,
	checker: ts.TypeChecker,
	imports: Set<ts.Node>,
): boolean {
	if (!ts.isIdentifier(tag) || /^[a-z]|-/.test(tag.text)) return false;
	const seen = new Set<ts.Symbol>();
	function fromSvg(value: ts.Node): boolean {
		if (
			ts.isParenthesizedExpression(value) ||
			ts.isAsExpression(value) ||
			ts.isSatisfiesExpression(value) ||
			ts.isNonNullExpression(value)
		)
			return fromSvg(value.expression);
		if (ts.isConditionalExpression(value))
			return fromSvg(value.whenTrue) || fromSvg(value.whenFalse);
		if (!ts.isIdentifier(value)) return false;
		const symbol = checker.getSymbolAtLocation(value);
		if (!symbol || seen.has(symbol)) return false;
		seen.add(symbol);
		const d = symbol.declarations?.[0];
		if (!d) return false;
		if (
			ts.isVariableDeclaration(d) &&
			d.initializer &&
			ts.isVariableDeclarationList(d.parent) &&
			d.parent.flags & ts.NodeFlags.Const
		)
			return fromSvg(d.initializer);
		return imports.has(d);
	}
	return fromSvg(tag);
}

/**
 * A store can contain React elements or objects that carry them. Follow the
 * result of each direct hook call through local bindings to where it is used.
 * A condition or discarded method result is safe even with no project types.
 */
export function storeHookUses(
	file: ts.SourceFile,
	checker: ts.TypeChecker,
	isComponent: (fn: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression) => boolean,
	typeOf: (expression: ts.Expression) => ts.Type,
) {
	// Direct eval can reference the hook or a local result by spelling alone.
	if (file.text.includes('eval')) {
		const directEval = (n: ts.Node): boolean =>
			(ts.isIdentifier(n) && n.text === 'eval') || !!ts.forEachChild(n, directEval);
		if (directEval(file)) return () => false;
	}
	const uses = localUses(file, checker);
	function reactHook(expr: ts.Expression, names: string[]): boolean {
		if (!ts.isIdentifier(expr)) return false;
		const item = checker.getSymbolAtLocation(expr)?.declarations?.[0];
		if (!item || !ts.isImportSpecifier(item) || item.isTypeOnly || item.parent.parent.isTypeOnly)
			return false;
		const statement = item.parent.parent.parent;
		return (
			ts.isStringLiteral(statement.moduleSpecifier) &&
			statement.moduleSpecifier.text === 'react' &&
			names.includes((item.propertyName ?? item.name).text)
		);
	}
	function componentUses(fn: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction) {
		if (!isComponent(fn)) return false;
		const wrapper = fn.parent;
		const outer =
			ts.isCallExpression(wrapper) &&
			wrapper.arguments[0] === fn &&
			reactHook(wrapper.expression, ['memo', 'forwardRef'])
				? wrapper
				: fn;
		let name: ts.Identifier | undefined;
		if (ts.isFunctionDeclaration(outer)) name = outer.name;
		else if (ts.isVariableDeclaration(outer.parent) && ts.isIdentifier(outer.parent.name))
			name = outer.parent.name;
		else if (!ts.isExportAssignment(outer.parent)) return false;
		return (
			!name ||
			uses(name).every((ref) => {
				const p = ref.parent;
				return ts.isJsxOpeningElement(p) ||
					ts.isJsxClosingElement(p) ||
					ts.isJsxSelfClosingElement(p)
					? p.tagName === ref
					: ts.isExportSpecifier(p) || ts.isExportAssignment(p);
			})
		);
	}
	const argument = portableArguments(checker, typeOf);
	function sharedHandle(expr: ts.Expression, imported: SharedInput): boolean {
		if (!ts.isIdentifier(expr)) return false;
		const d = checker.getSymbolAtLocation(expr)?.declarations?.[0];
		if (!d || !ts.isImportSpecifier(d) || d.isTypeOnly || d.parent.parent.isTypeOnly) return false;
		const spec = d.parent.parent.parent.moduleSpecifier;
		return ts.isStringLiteral(spec) && imported(spec.text, (d.propertyName ?? d.name).text);
	}
	// A call using an original handle can publish its other arguments to another renderer.
	// Only literals and constants initialized with literals qualify.
	function plainData(value: ts.Expression): boolean {
		if (ts.isParenthesizedExpression(value) || ts.isSatisfiesExpression(value))
			return plainData(value.expression);
		if (ts.isIdentifier(value)) {
			const d = checker.getSymbolAtLocation(value)?.valueDeclaration;
			return (
				!!d &&
				ts.isVariableDeclaration(d) &&
				!!d.initializer &&
				d.end <= value.pos &&
				ts.isVariableDeclarationList(d.parent) &&
				!!(d.parent.flags & ts.NodeFlags.Const) &&
				plainData(d.initializer)
			);
		}
		return literal(value);
	}
	// A computed key, destructuring default, or intermediate call can evaluate renderer code.
	// Only the original hook result, its named properties and simple const aliases gain handle inputs.
	function originalReceiver(value: ts.Expression, check: ResultCheck, direct = false): boolean {
		if (
			ts.isParenthesizedExpression(value) ||
			ts.isNonNullExpression(value) ||
			ts.isSatisfiesExpression(value)
		)
			return originalReceiver(value.expression, check, direct);
		if (!direct && ts.isPropertyAccessExpression(value))
			return originalReceiver(value.expression, check);
		if (ts.isCallExpression(value)) {
			return (
				(!direct || !value.questionDotToken) &&
				ts.isIdentifier(value.expression) &&
				checker.getSymbolAtLocation(value.expression)?.declarations?.[0] === check.item &&
				value.arguments.every((arg) => plainData(arg) || sharedHandle(arg, check.imported))
			);
		}
		if (!ts.isIdentifier(value)) return false;
		const d = checker.getSymbolAtLocation(value)?.valueDeclaration;
		return (
			!!d &&
			ts.isVariableDeclaration(d) &&
			ts.isIdentifier(d.name) &&
			!!d.initializer &&
			d.end <= value.pos &&
			ts.isVariableDeclarationList(d.parent) &&
			!!(d.parent.flags & ts.NodeFlags.Const) &&
			originalReceiver(d.initializer, check, direct)
		);
	}
	// Only a service read directly from the original store with one verified handle
	// receives descriptor arguments. Other calls retain the ordinary data checks.
	function serviceMethod(method: ts.PropertyAccessExpression, check: ResultCheck) {
		const read = method.expression;
		const named = (member: ts.PropertyAccessExpression) =>
			!member.questionDotToken &&
			ts.isIdentifier(member.name) &&
			!(member.name.text in Function.prototype) &&
			member.name.text !== 'prototype';
		return (
			named(method) &&
			ts.isCallExpression(read) &&
			!read.questionDotToken &&
			read.arguments.length === 1 &&
			sharedHandle(read.arguments[0], check.imported) &&
			ts.isPropertyAccessExpression(read.expression) &&
			named(read.expression) &&
			originalReceiver(read.expression.expression, check, true)
		);
	}
	function bound(name: ts.BindingName, check: ResultCheck): boolean {
		if (ts.isIdentifier(name)) return uses(name).every((use) => safe(use, check));
		return name.elements.every((el) => ts.isOmittedExpression(el) || bound(el.name, check));
	}
	function safe(value: ts.Expression, check: ResultCheck): boolean {
		const cached = check.known.get(value);
		if (cached !== undefined) return cached;
		check.known.set(value, false);
		const result = sink(value, check) || scalar(typeOf(value));
		check.known.set(value, result);
		return result;
	}
	function sink(value: ts.Expression, check: ResultCheck): boolean {
		const p = value.parent;
		if (ts.isParenthesizedExpression(p) || ts.isNonNullExpression(p) || ts.isSatisfiesExpression(p))
			return safe(p, check);
		if (
			ts.isVariableDeclaration(p) &&
			p.initializer === value &&
			ts.isVariableDeclarationList(p.parent) &&
			p.parent.flags & ts.NodeFlags.Const
		)
			return !p.type && bound(p.name, check);
		if (ts.isExpressionStatement(p) || ts.isVoidExpression(p) || ts.isTypeOfExpression(p))
			return true;
		if (ts.isIfStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p))
			return p.expression === value;
		if (ts.isConditionalExpression(p)) return p.condition === value || safe(p, check);
		if (ts.isPrefixUnaryExpression(p))
			return [
				ts.SyntaxKind.ExclamationToken,
				ts.SyntaxKind.PlusToken,
				ts.SyntaxKind.MinusToken,
				ts.SyntaxKind.TildeToken,
			].includes(p.operator);
		if (ts.isTemplateSpan(p)) return !ts.isTaggedTemplateExpression(p.parent.parent);
		if (ts.isBinaryExpression(p)) {
			const op = p.operatorToken.kind;
			if (op === ts.SyntaxKind.AmpersandAmpersandToken) return p.left === value || safe(p, check);
			if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken)
				return safe(p, check);
			return (
				(op >= ts.SyntaxKind.LessThanToken && op <= ts.SyntaxKind.ExclamationEqualsEqualsToken) ||
				(op >= ts.SyntaxKind.PlusToken && op <= ts.SyntaxKind.AsteriskAsteriskToken) ||
				op === ts.SyntaxKind.InKeyword ||
				op === ts.SyntaxKind.InstanceOfKeyword
			);
		}
		if (ts.isPropertyAccessExpression(p)) return p.expression === value && safe(p, check);
		if (ts.isElementAccessExpression(p))
			return p.expression === value && argument(p.argumentExpression) && safe(p, check);
		if (
			ts.isArrayLiteralExpression(p) &&
			ts.isCallExpression(p.parent) &&
			p.parent.arguments[1] === p &&
			reactHook(p.parent.expression, ['useEffect', 'useLayoutEffect', 'useMemo', 'useCallback'])
		)
			return true;
		if (ts.isCallExpression(p)) {
			if (p.expression === value) {
				if (p.arguments.every((arg) => argument(arg))) return safe(p, check);
				if (
					!p.questionDotToken &&
					ts.isPropertyAccessExpression(value) &&
					p.arguments.some(ts.isJsxSelfClosingElement) &&
					serviceMethod(value, check) &&
					p.arguments.every((arg) => ts.isJsxSelfClosingElement(arg) || literalOptions(arg)) &&
					safe(p, check)
				)
					return check.descriptors(p.arguments.filter(ts.isJsxSelfClosingElement));
				const handle = p.arguments[0];
				return (
					ts.isPropertyAccessExpression(value) &&
					originalReceiver(value.expression, check) &&
					!!handle &&
					sharedHandle(handle, check.imported) &&
					p.arguments.slice(1).every(plainData) &&
					safe(p, check)
				);
			}
			if (
				p.arguments.length === 1 &&
				p.arguments[0] === value &&
				ts.isIdentifier(p.expression) &&
				['String', 'Number', 'Boolean'].includes(p.expression.text) &&
				checker
					.getSymbolAtLocation(p.expression)
					?.declarations?.every((d) => d.getSourceFile().hasNoDefaultLib)
			)
				return true;
			return false;
		}
		return false;
	}
	return (
		item: ts.ImportSpecifier,
		imported: SharedInput,
		descriptors: ResultCheck['descriptors'],
	) => {
		const check: ResultCheck = { item, imported, known: new Map(), descriptors };
		const references = uses(item.name);
		return (
			references.length > 0 &&
			references.every((ref) => {
				const call = ref.parent;
				if (!ts.isCallExpression(call) || call.expression !== ref || call.questionDotToken)
					return false;
				const owner = ts.findAncestor(call, ts.isFunctionLike);
				return (
					!!owner &&
					(ts.isFunctionDeclaration(owner) ||
						ts.isArrowFunction(owner) ||
						ts.isFunctionExpression(owner)) &&
					componentUses(owner) &&
					call.arguments.every((arg) => argument(arg, imported)) &&
					safe(call, check)
				);
			})
		);
	};
}
