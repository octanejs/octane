import { localUses, portableArguments, scalar } from './local-uses.js';
import ts from 'typescript';

const scalarMethods = new Set([
	'formatDate',
	'formatTime',
	'formatDateTimeRange',
	'formatRelativeTime',
	'formatNumber',
	'formatPlural',
	'formatDisplayName',
]);
const descriptor = new Set(['id', 'description', 'defaultMessage', 'ignoreTag']);

/** Select whole named imports that the shared adapter can replace without changing renderer-owned values. */
export function intlImports(
	file: ts.SourceFile,
	checker: ts.TypeChecker,
	typeOf: (expression: ts.Expression) => ts.Type,
	isComponent: (
		functionNode: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
	) => boolean,
	inReact: (element: ts.JsxElement | ts.JsxSelfClosingElement) => boolean,
	canPassToReact: (element: ts.JsxElement | ts.JsxSelfClosingElement) => boolean,
): Set<ts.ImportSpecifier> {
	const candidates = file.statements.filter(ts.isImportDeclaration).flatMap((decl) => {
		const named = decl.importClause?.namedBindings;
		if (
			!ts.isStringLiteral(decl.moduleSpecifier) ||
			decl.moduleSpecifier.text !== 'react-intl' ||
			decl.attributes ||
			decl.importClause?.isTypeOnly ||
			!named ||
			!ts.isNamedImports(named) ||
			/\/\*|\/\//.test(decl.getText(file))
		)
			return [];
		return named.elements.filter(
			(item) =>
				!item.isTypeOnly &&
				['useIntl', 'IntlProvider', 'RawIntlProvider', 'FormattedMessage'].includes(
					(item.propertyName ?? item.name).text,
				),
		);
	});
	const selected = new Set<ts.ImportSpecifier>();
	if (!candidates.length) return selected;
	const uses = localUses(file, checker);
	// Even without substitution values a provider can format rich text into React elements.
	// Follow const aliases only when every consumer explicitly coerces or compares the result.
	const knownSinks = new Map<ts.Expression, boolean>();
	function textSink(value: ts.Expression): boolean {
		const cached = knownSinks.get(value);
		if (cached !== undefined) return cached;
		knownSinks.set(value, false); // A cycle cannot establish safe use.
		const safe = checkSink(value);
		knownSinks.set(value, safe);
		return safe;
	}
	function checkSink(value: ts.Expression): boolean {
		const use = value.parent;
		if (
			ts.isParenthesizedExpression(use) ||
			ts.isAsExpression(use) ||
			ts.isNonNullExpression(use) ||
			ts.isSatisfiesExpression(use)
		)
			return textSink(use);
		if (
			(ts.isTemplateSpan(use) && !ts.isTaggedTemplateExpression(use.parent.parent)) ||
			ts.isTypeOfExpression(use) ||
			ts.isVoidExpression(use) ||
			(ts.isPrefixUnaryExpression(use) && use.operator === ts.SyntaxKind.ExclamationToken)
		)
			return true;
		if (
			ts.isCallExpression(use) &&
			use.arguments.length === 1 &&
			use.arguments[0] === value &&
			ts.isIdentifier(use.expression) &&
			use.expression.text === 'String' &&
			checker
				.getSymbolAtLocation(use.expression)
				?.declarations?.every((d) => d.getSourceFile().hasNoDefaultLib)
		)
			return true;
		if (ts.isConditionalExpression(use)) return use.condition === value || textSink(use);
		if (ts.isBinaryExpression(use)) {
			return (
				[
					ts.SyntaxKind.EqualsEqualsEqualsToken,
					ts.SyntaxKind.ExclamationEqualsEqualsToken,
					ts.SyntaxKind.EqualsEqualsToken,
					ts.SyntaxKind.ExclamationEqualsToken,
				].includes(use.operatorToken.kind) ||
				(use.operatorToken.kind === ts.SyntaxKind.PlusToken &&
					(ts.isStringLiteralLike(use.left) || ts.isStringLiteralLike(use.right)))
			);
		}
		if (
			ts.isVariableDeclaration(use) &&
			use.initializer === value &&
			ts.isIdentifier(use.name) &&
			ts.getCombinedNodeFlags(use) & ts.NodeFlags.Const
		)
			return uses(use.name).every(textSink);
		if (ts.isJsxExpression(use) && ts.isJsxAttribute(use.parent)) {
			const attr = use.parent;
			const tag = attr.parent.parent;
			return (
				(ts.isJsxOpeningElement(tag) || ts.isJsxSelfClosingElement(tag)) &&
				ts.isIdentifier(tag.tagName) &&
				/^[a-z][a-z0-9]*$/.test(tag.tagName.text) &&
				ts.isIdentifier(attr.name) &&
				(attr.name.text === 'title' ||
					attr.name.text.startsWith('aria-') ||
					(attr.name.text === 'placeholder' && ['input', 'textarea'].includes(tag.tagName.text)) ||
					(attr.name.text === 'alt' && ['img', 'input', 'area'].includes(tag.tagName.text)) ||
					(attr.name.text === 'label' &&
						['option', 'optgroup', 'track'].includes(tag.tagName.text)) ||
					attr.name.text.startsWith('data-'))
			);
		}
		return false;
	}

	function closedChild(child: ts.JsxChild): boolean {
		if (ts.isJsxText(child)) return true;
		if (ts.isJsxExpression(child)) return !child.expression || scalar(typeOf(child.expression));
		if (ts.isJsxFragment(child)) return child.children.every(closedChild);
		if (!ts.isJsxElement(child) && !ts.isJsxSelfClosingElement(child)) return false;
		const opening = ts.isJsxElement(child) ? child.openingElement : child;
		if (!ts.isIdentifier(opening.tagName) || !/^[a-z]/.test(opening.tagName.text)) return false;
		return (
			opening.attributes.properties.every(
				(p) => ts.isJsxAttribute(p) && p.name.getText(file) !== 'children',
			) &&
			(!ts.isJsxElement(child) || child.children.every(closedChild))
		);
	}
	// A substitution object is shared with the installed React formatter. Check
	// its data properties before any JSX in this module changes renderer.
	const portable = portableArguments(checker, typeOf);
	function scalarValues(values: ts.Expression): boolean {
		return (
			ts.isObjectLiteralExpression(values) &&
			values.properties.every((property) => {
				const value = ts.isShorthandPropertyAssignment(property)
					? property.name
					: ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name)
						? property.initializer
						: undefined;
				if (!value || !portable(value)) return false;
				let source = value;
				while (
					ts.isAsExpression(source) ||
					ts.isNonNullExpression(source) ||
					ts.isParenthesizedExpression(source) ||
					ts.isSatisfiesExpression(source)
				)
					source = source.expression;
				return scalar(typeOf(source));
			})
		);
	}
	function readsScalar(receiver: ts.Expression): boolean {
		const access = receiver.parent;
		if (
			!ts.isPropertyAccessExpression(access) ||
			access.expression !== receiver ||
			access.questionDotToken
		)
			return false;
		if (access.name.text === 'locale') {
			const use = access.parent;
			return (
				!(
					ts.isBinaryExpression(use) &&
					use.left === access &&
					use.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
					use.operatorToken.kind <= ts.SyntaxKind.LastAssignment
				) &&
				!ts.isDeleteExpression(use) &&
				!ts.isPostfixUnaryExpression(use) &&
				!(
					ts.isPrefixUnaryExpression(use) &&
					[ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(use.operator)
				)
			);
		}
		const call = access.parent;
		if (!ts.isCallExpression(call) || call.expression !== access) return false;
		if (scalarMethods.has(access.name.text)) return true;
		if (
			access.name.text !== 'formatMessage' ||
			call.arguments.length < 1 ||
			call.arguments.length > 3 ||
			call.arguments.some(ts.isSpreadElement) ||
			!textSink(call)
		)
			return false;
		const values = call.arguments[1];
		return !values || scalarValues(values);
	}
	function readsIntl(id: ts.Identifier) {
		const call = id.parent;
		if (!ts.isCallExpression(call) || call.expression !== id || call.arguments.length) return false;
		const owner = ts.findAncestor(call, ts.isFunctionLike);
		if (
			!owner ||
			!(
				ts.isFunctionDeclaration(owner) ||
				ts.isFunctionExpression(owner) ||
				ts.isArrowFunction(owner)
			) ||
			!isComponent(owner)
		)
			return false;
		if (readsScalar(call)) return true;
		const decl = call.parent;
		return (
			ts.isVariableDeclaration(decl) &&
			decl.initializer === call &&
			ts.isIdentifier(decl.name) &&
			!!(ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const) &&
			uses(decl.name).every(readsScalar)
		);
	}
	for (const item of candidates) {
		const name = (item.propertyName ?? item.name).text;
		const locations = uses(item.name);
		if (!locations.length) continue;
		const supported = locations.every((id) => {
			if (name === 'useIntl') return readsIntl(id);
			const tag = id.parent;
			if (ts.isJsxClosingElement(tag)) return tag.tagName === id && name !== 'FormattedMessage';
			if ((!ts.isJsxSelfClosingElement(tag) && !ts.isJsxOpeningElement(tag)) || tag.tagName !== id)
				return false;
			if (inReact(ts.isJsxOpeningElement(tag) ? tag.parent : tag)) return false;
			if (name === 'FormattedMessage' && !ts.isJsxSelfClosingElement(tag)) return false;
			if (
				name !== 'FormattedMessage' &&
				ts.isJsxOpeningElement(tag) &&
				!(ts.isJsxElement(tag.parent) && tag.parent.children.every(closedChild))
			)
				return false;
			return tag.attributes.properties.every(
				(attr) =>
					ts.isJsxAttribute(attr) &&
					ts.isIdentifier(attr.name) &&
					(name === 'FormattedMessage'
						? descriptor.has(attr.name.text) ||
							(attr.name.text === 'values' &&
								!!attr.initializer &&
								ts.isJsxExpression(attr.initializer) &&
								!!attr.initializer.expression &&
								scalarValues(attr.initializer.expression) &&
								ts.isJsxSelfClosingElement(tag) &&
								canPassToReact(tag))
						: !['ref', 'children', 'defaultRichTextElements', 'textComponent'].includes(
								attr.name.text,
							)),
			);
		});
		if (supported) selected.add(item);
	}
	return selected;
}
