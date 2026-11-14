import ts from 'typescript';
import { REACT_MODULES } from './mappings.js';
import { inTypeNode } from './local-uses.js';

function constantStatement(decl: ts.Node) {
	if (
		ts.isVariableDeclaration(decl) &&
		ts.isVariableDeclarationList(decl.parent) &&
		ts.isVariableStatement(decl.parent.parent) &&
		(decl.parent.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const &&
		decl.parent.declarations.length === 1
	)
		return decl.parent.parent;
}

/** A direct, unconsumed React DOM server stream and its later full-body read. */
export function unreadServerStream(
	wait: ts.AwaitExpression,
	declarationOf: (name: ts.Identifier) => ts.Declaration | null,
	uses: (name: ts.Identifier) => ts.Identifier[],
	original: (module: string) => boolean,
) {
	const access = wait.expression;
	if (
		!ts.isPropertyAccessExpression(access) ||
		access.name.text !== 'allReady' ||
		!ts.isExpressionStatement(wait.parent) ||
		!ts.isBlock(wait.parent.parent) ||
		ts.isOptionalChain(access) ||
		!ts.isIdentifier(access.expression)
	)
		return false;
	const stream = declarationOf(access.expression);
	if (!stream || !ts.isVariableDeclaration(stream) || !ts.isIdentifier(stream.name)) return false;
	const statement = constantStatement(stream);
	const initializer = stream.initializer;
	if (
		statement?.parent !== wait.parent.parent ||
		statement.end > wait.pos ||
		!initializer ||
		!ts.isAwaitExpression(initializer) ||
		!ts.isCallExpression(initializer.expression) ||
		ts.isOptionalChain(initializer.expression) ||
		!initializer.expression.arguments.length ||
		initializer.expression.arguments.some(ts.isSpreadElement) ||
		!ts.isIdentifier(initializer.expression.expression)
	)
		return false;
	const refs = uses(stream.name).filter((ref) => !inTypeNode(ref));
	if (refs.length !== 2 || refs[0] !== access.expression) return false;
	const response = refs[1].parent;
	if (
		!ts.isNewExpression(response) ||
		response.arguments?.length !== 1 ||
		!ts.isIdentifier(response.expression) ||
		response.expression.text !== 'Response' ||
		declarationOf(response.expression)
	)
		return false;
	const text = response.parent;
	if (
		!ts.isPropertyAccessExpression(text) ||
		text.name.text !== 'text' ||
		!ts.isCallExpression(text.parent) ||
		ts.isOptionalChain(text.parent) ||
		text.parent.arguments.length ||
		!ts.isAwaitExpression(text.parent.parent)
	)
		return false;
	const read = ts.findAncestor(
		text.parent.parent,
		(node) => ts.isStatement(node) || ts.isFunctionLike(node),
	);
	if (read?.parent !== statement.parent || read.pos < wait.parent.end) return false;

	const factory = declarationOf(initializer.expression.expression);
	if (!factory) return false;
	let module: ts.Expression | undefined;
	if (ts.isImportSpecifier(factory)) {
		const clause = factory.parent.parent;
		if (factory.isTypeOnly || clause.isTypeOnly || clause.parent.attributes) return false;
		if ((factory.propertyName ?? factory.name).text !== 'renderToReadableStream') return false;
		module = clause.parent.moduleSpecifier;
	} else if (ts.isBindingElement(factory) && ts.isObjectBindingPattern(factory.parent)) {
		const key = factory.propertyName ?? factory.name;
		const binding = factory.parent.parent;
		const load = ts.isVariableDeclaration(binding) && constantStatement(binding);
		const init = load && binding.initializer;
		if (
			!load ||
			load.parent !== statement.parent ||
			load.end > statement.pos ||
			factory.parent.elements.length !== 1 ||
			factory.initializer ||
			factory.dotDotDotToken ||
			!ts.isIdentifier(key) ||
			key.text !== 'renderToReadableStream' ||
			!init ||
			!ts.isAwaitExpression(init) ||
			!ts.isCallExpression(init.expression) ||
			init.expression.expression.kind !== ts.SyntaxKind.ImportKeyword ||
			init.expression.arguments.length !== 1
		)
			return false;
		module = init.expression.arguments[0];
	}
	return (
		!!module &&
		ts.isStringLiteral(module) &&
		REACT_MODULES[module.text] === 'octane/server' &&
		original(module.text)
	);
}

/** The props object for a self-closing React element with closed literal attributes. */
export function staticReactProps(element: ts.JsxSelfClosingElement) {
	if (element.typeArguments) return null;
	const props: string[] = [];
	const seen = new Set(['key', 'ref', '__proto__', '__self', '__source']);
	for (const attr of element.attributes.properties) {
		if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name) || seen.has(attr.name.text))
			return null;
		seen.add(attr.name.text);
		const init = attr.initializer;
		let value: string;
		if (!init) value = 'true';
		else if (ts.isStringLiteral(init) && !/[&\r\n]/.test(init.text))
			value = JSON.stringify(init.text);
		else if (ts.isJsxExpression(init) && init.expression && !init.dotDotDotToken) {
			const expr = init.expression;
			if (!(
				ts.isStringLiteralLike(expr) ||
				ts.isNumericLiteral(expr) ||
				expr.kind === ts.SyntaxKind.TrueKeyword ||
				expr.kind === ts.SyntaxKind.FalseKeyword ||
				expr.kind === ts.SyntaxKind.NullKeyword
			))
				return null;
			value = ts.isStringLiteralLike(expr) ? JSON.stringify(expr.text) : expr.getText();
		} else return null;
		props.push(JSON.stringify(attr.name.text) + ': ' + value);
	}
	return '{ ' + props.join(', ') + ' }';
}

/** A React-owned value or renderer in an inline options object. */
export function reactRenderer(property: ts.ObjectLiteralElementLike) {
	if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) return;
	const initializer = property.initializer;
	const arrow = ts.isArrowFunction(initializer) ? initializer : null;
	if (
		arrow &&
		(arrow.modifiers || arrow.type || arrow.typeParameters || arrow.parameters.length > 1)
	)
		return;
	const param = arrow?.parameters[0];
	if (
		param &&
		(!ts.isIdentifier(param.name) ||
			param.type ||
			param.dotDotDotToken ||
			param.initializer ||
			param.questionToken ||
			param.modifiers)
	)
		return;
	let body = arrow?.body ?? initializer;
	while (ts.isParenthesizedExpression(body)) body = body.expression;
	if (!arrow && !ts.isJsxSelfClosingElement(body)) return;
	const tag = ts.isJsxElement(body)
		? body.openingElement
		: ts.isJsxSelfClosingElement(body)
			? body
			: null;
	if (!tag || !ts.isIdentifier(tag.tagName) || !/^[a-z][a-z0-9]*$/.test(tag.tagName.text)) return;
	const props: string[] = [];
	let key: string | undefined;
	for (const attr of tag.attributes.properties) {
		if (
			!ts.isJsxAttribute(attr) ||
			!ts.isIdentifier(attr.name) ||
			!attr.initializer ||
			!ts.isStringLiteral(attr.initializer) ||
			/[&\r\n]/.test(attr.initializer.text) ||
			!/^[a-z][a-zA-Z0-9-]*$/.test(attr.name.text) ||
			/^(?:ref|children|dangerouslySetInnerHTML|is|style)$|^on/i.test(attr.name.text)
		)
			return;
		const value = JSON.stringify(attr.initializer.text);
		if (attr.name.text === 'key') key = value;
		else props.push(JSON.stringify(attr.name.text) + ': ' + value);
	}
	if (ts.isJsxElement(body)) {
		// JSX discards indentation on empty lines, but a space beside a child is visible.
		const children = body.children.filter(
			(child) => !(ts.isJsxText(child) && /^[ \t\r\n]*[\r\n][ \t\r\n]*$/.test(child.text)),
		);
		const [child] = children;
		if (
			!param ||
			children.length !== 1 ||
			!ts.isJsxExpression(child) ||
			child.dotDotDotToken ||
			!child.expression ||
			!ts.isIdentifier(child.expression) ||
			child.expression.text !== (param.name as ts.Identifier).text
		)
			return;
		props.push('children: ' + child.expression.text);
	} else if (param) return;
	return {
		body,
		value: arrow === null,
		args:
			JSON.stringify(tag.tagName.text) +
			', { ' +
			props.join(', ') +
			' }' +
			(key === undefined ? '' : ', ' + key),
	};
}
