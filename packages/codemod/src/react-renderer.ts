import ts from 'typescript';

/** A closed callback in an inline options object. Its React caller owns the argument. */
export function reactRenderer(property: ts.ObjectLiteralElementLike) {
	if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) return;
	const arrow = property.initializer;
	if (
		!ts.isArrowFunction(arrow) ||
		arrow.modifiers ||
		arrow.type ||
		arrow.typeParameters ||
		arrow.parameters.length > 1
	)
		return;
	const param = arrow.parameters[0];
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
	let body = arrow.body;
	while (ts.isParenthesizedExpression(body)) body = body.expression;
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
		args:
			JSON.stringify(tag.tagName.text) +
			', { ' +
			props.join(', ') +
			' }' +
			(key === undefined ? '' : ', ' + key),
	};
}
