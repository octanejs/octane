import { localUses, scalar } from './local-uses.js';
import ts from 'typescript';

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
	// An imported input is forwarded unchanged to the original hook body. For calls
	// on the returned store, require data: a write can publish its payload to React.
	function argument(
		expr: ts.Expression,
		imported?: (module: string, name: string) => boolean,
	): boolean {
		if (ts.isParenthesizedExpression(expr) || ts.isSatisfiesExpression(expr))
			return argument(expr.expression, imported);
		if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr))
			return argument(expr.expression, imported);
		if (ts.isArrayLiteralExpression(expr))
			return expr.elements.every((el) => argument(el, imported));
		if (ts.isObjectLiteralExpression(expr))
			return expr.properties.every(
				(p) =>
					ts.isPropertyAssignment(p) &&
					!ts.isComputedPropertyName(p.name) &&
					argument(p.initializer, imported),
			);
		if (ts.isIdentifier(expr)) {
			const declaration = checker.getSymbolAtLocation(expr)?.valueDeclaration;
			if (declaration && ts.isVariableDeclaration(declaration)) {
				return (
					!!declaration.initializer &&
					declaration.end <= expr.pos &&
					ts.isVariableDeclarationList(declaration.parent) &&
					!!(declaration.parent.flags & ts.NodeFlags.Const) &&
					scalar(typeOf(expr)) &&
					argument(declaration.initializer, imported)
				);
			}
		}
		if (ts.isIdentifier(expr) && imported) {
			const d = checker.getSymbolAtLocation(expr)?.declarations?.[0];
			if (d && ts.isImportSpecifier(d) && !d.isTypeOnly) {
				const spec = d.parent.parent.parent.moduleSpecifier;
				if (ts.isStringLiteral(spec) && imported(spec.text, (d.propertyName ?? d.name).text))
					return true;
			}
		}
		return scalar(typeOf(expr));
	}
	function bound(name: ts.BindingName): boolean {
		if (ts.isIdentifier(name)) return uses(name).every(safe);
		return name.elements.every((el) => ts.isOmittedExpression(el) || bound(el.name));
	}
	const known = new Map<ts.Expression, boolean>();
	function safe(value: ts.Expression): boolean {
		const cached = known.get(value);
		if (cached !== undefined) return cached;
		known.set(value, false);
		const result = sink(value) || scalar(typeOf(value));
		known.set(value, result);
		return result;
	}
	function sink(value: ts.Expression): boolean {
		const p = value.parent;
		if (ts.isParenthesizedExpression(p) || ts.isNonNullExpression(p) || ts.isSatisfiesExpression(p))
			return safe(p);
		if (
			ts.isVariableDeclaration(p) &&
			p.initializer === value &&
			ts.isVariableDeclarationList(p.parent) &&
			p.parent.flags & ts.NodeFlags.Const
		)
			return !p.type && bound(p.name);
		if (ts.isExpressionStatement(p) || ts.isVoidExpression(p) || ts.isTypeOfExpression(p))
			return true;
		if (ts.isIfStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p))
			return p.expression === value;
		if (ts.isConditionalExpression(p)) return p.condition === value || safe(p);
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
			if (op === ts.SyntaxKind.AmpersandAmpersandToken) return p.left === value || safe(p);
			if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken)
				return safe(p);
			return (
				(op >= ts.SyntaxKind.LessThanToken && op <= ts.SyntaxKind.ExclamationEqualsEqualsToken) ||
				(op >= ts.SyntaxKind.PlusToken && op <= ts.SyntaxKind.AsteriskAsteriskToken) ||
				op === ts.SyntaxKind.InKeyword ||
				op === ts.SyntaxKind.InstanceOfKeyword
			);
		}
		if (ts.isPropertyAccessExpression(p)) return p.expression === value && safe(p);
		if (ts.isElementAccessExpression(p))
			return p.expression === value && argument(p.argumentExpression) && safe(p);
		if (
			ts.isArrayLiteralExpression(p) &&
			ts.isCallExpression(p.parent) &&
			p.parent.arguments[1] === p &&
			reactHook(p.parent.expression, ['useEffect', 'useLayoutEffect', 'useMemo', 'useCallback'])
		)
			return true;
		if (ts.isCallExpression(p)) {
			if (p.expression === value) return p.arguments.every((arg) => argument(arg)) && safe(p);
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
	return (item: ts.ImportSpecifier, imported: (module: string, name: string) => boolean) => {
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
					safe(call)
				);
			})
		);
	};
}
