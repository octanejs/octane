import ts from 'typescript';
import { componentTagOrExport } from './local-uses.js';

function declaration(statement: ts.Statement) {
	if (!ts.isVariableStatement(statement)) return;
	const list = statement.declarationList;
	if (list.flags & ts.NodeFlags.Const && list.declarations.length === 1)
		return list.declarations[0];
}

function negated(expr: ts.Expression) {
	return ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken
		? expr.operand
		: undefined;
}

function ungroup(expr: ts.Expression): ts.Expression {
	return ts.isParenthesizedExpression(expr) ? ungroup(expr.expression) : expr;
}

/** A false-to-true update that returns null on the old pass before retrying this exact prelude. */
export function linkedRenderState(
	owner: ts.FunctionDeclaration,
	checker: ts.TypeChecker,
	uses: (name: ts.Identifier) => ts.Identifier[],
	isReactState: (expr: ts.Expression) => boolean,
	isBooleanValue: (expr: ts.Expression) => boolean,
) {
	if (
		!owner.body ||
		owner.asteriskToken ||
		owner.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ||
		owner.parameters.length !== 1 ||
		owner.parameters[0].initializer ||
		owner.parameters[0].dotDotDotToken ||
		!ts.isIdentifier(owner.parameters[0].name)
	)
		return;
	const body = owner.body.statements;
	if (body.length !== 3 && body.length !== 4) return;
	const [state, guard, output] = body.slice(-3);
	const decl = declaration(state);
	const hook = decl?.initializer;
	if (
		!decl ||
		decl.type ||
		!hook ||
		!ts.isCallExpression(hook) ||
		hook.questionDotToken ||
		hook.arguments.length !== 1 ||
		hook.typeArguments ||
		!isReactState(hook.expression) ||
		!ts.isArrayBindingPattern(decl.name) ||
		decl.name.elements.length !== 2
	)
		return;
	const [value, setter] = decl.name.elements;
	if (
		!ts.isBindingElement(value) ||
		!ts.isIdentifier(value.name) ||
		value.initializer ||
		value.dotDotDotToken ||
		!ts.isBindingElement(setter) ||
		!ts.isIdentifier(setter.name) ||
		setter.initializer ||
		setter.dotDotDotToken
	)
		return;
	const same = (expr: ts.Node | undefined, name: ts.Identifier) =>
		!!expr &&
		ts.isIdentifier(expr) &&
		checker.getSymbolAtLocation(expr) === checker.getSymbolAtLocation(name);
	if (
		!ts.isIfStatement(guard) ||
		guard.elseStatement ||
		!ts.isBinaryExpression(guard.expression) ||
		guard.expression.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken ||
		!same(negated(guard.expression.right), value.name)
	)
		return;
	const branch = guard.thenStatement;
	const update =
		ts.isBlock(branch) && branch.statements.length === 1 ? branch.statements[0] : branch;
	if (!ts.isExpressionStatement(update) || !ts.isCallExpression(update.expression)) return;
	const call = update.expression;
	if (
		!same(call.expression, setter.name) ||
		call.questionDotToken ||
		call.arguments.length !== 1 ||
		call.arguments[0].kind !== ts.SyntaxKind.TrueKeyword ||
		uses(setter.name).length !== 1
	)
		return;
	const ret =
		ts.isReturnStatement(output) && output.expression ? ungroup(output.expression) : undefined;
	if (
		!ret ||
		!ts.isConditionalExpression(ret) ||
		!same(ret.condition, value.name) ||
		ungroup(ret.whenFalse).kind !== ts.SyntaxKind.NullKeyword ||
		uses(value.name).length !== 2
	)
		return;
	if (owner.name && !uses(owner.name).every(componentTagOrExport)) return;
	const positive = ungroup(ret.whenTrue);
	if (!ts.isJsxElement(positive) && !ts.isJsxSelfClosingElement(positive)) return;
	const source = owner.getSourceFile();
	if (/\/[*/]/.test(source.text.slice(state.getStart(source), guard.end))) return;
	const parameter = owner.parameters[0].name;
	const prop = (expr: ts.Expression): expr is ts.PropertyAccessExpression =>
		ts.isPropertyAccessExpression(expr) &&
		!expr.questionDotToken &&
		same(expr.expression, parameter) &&
		ts.isIdentifier(expr.name);
	const flag = ungroup(guard.expression.left);
	const initial = ungroup(hook.arguments[0]);
	if (body.length === 3) {
		const once = negated(initial);
		const read = (once && negated(once)) ?? initial;
		if (
			prop(read) &&
			prop(flag) &&
			read.name.text === flag.name.text &&
			// A raw callable prop would run as a React state initializer.
			(read !== initial || isBooleanValue(initial))
		) {
			return { state, guard, name: value.name.text, flag, eager: initial, replay: [read, flag] };
		}
	} else {
		const local = declaration(body[0]);
		const prelude = local?.initializer;
		const nonNull = (expr: ts.Expression) =>
			ts.isBinaryExpression(expr) &&
			expr.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken &&
			prop(expr.left) &&
			expr.right.kind === ts.SyntaxKind.NullKeyword;
		if (
			local &&
			!local.type &&
			ts.isIdentifier(local.name) &&
			prelude &&
			ts.isBinaryExpression(prelude) &&
			prelude.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
			nonNull(prelude.left) &&
			nonNull(prelude.right) &&
			same(initial, local.name) &&
			same(flag, local.name) &&
			uses(local.name).length === 2 &&
			!/\/[*/]/.test(prelude.getText())
		) {
			return { state, guard, name: value.name.text, flag, eager: undefined, replay: [prelude] };
		}
	}
}
