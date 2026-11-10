import { forwardedTextProps, hasPrototypeAccess } from './forwarded-text.js';
import type { TransformOptions } from './types.js';
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
	importedText: TransformOptions['forwardedText'],
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
	const ordinaryCaller = !hasPrototypeAccess(file);
	const forwards = forwardedTextProps(file, checker, uses, ordinaryCaller);
	// Even without substitution values a provider can format rich text into React elements.
	// Follow const aliases only when every consumer explicitly coerces or compares the result.
	const localSinks = new Map<ts.Expression, boolean>();
	const forwardingSinks = new Map<ts.Expression, boolean>();
	function textSink(value: ts.Expression, allowForwarding: boolean): boolean {
		const knownSinks = allowForwarding ? forwardingSinks : localSinks;
		const cached = knownSinks.get(value);
		if (cached !== undefined) return cached;
		knownSinks.set(value, false); // A cycle cannot establish safe use.
		const safe = checkSink(value, allowForwarding);
		knownSinks.set(value, safe);
		return safe;
	}
	function checkSink(value: ts.Expression, allowForwarding: boolean): boolean {
		const use = value.parent;
		if (
			ts.isParenthesizedExpression(use) ||
			ts.isAsExpression(use) ||
			ts.isNonNullExpression(use) ||
			ts.isSatisfiesExpression(use)
		)
			return textSink(use, allowForwarding);
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
		if (ts.isConditionalExpression(use))
			return use.condition === value || textSink(use, allowForwarding);
		if (ts.isBinaryExpression(use)) {
			const op = use.operatorToken.kind;
			if (
				op === ts.SyntaxKind.AmpersandAmpersandToken ||
				op === ts.SyntaxKind.BarBarToken ||
				op === ts.SyntaxKind.QuestionQuestionToken
			)
				return textSink(use, allowForwarding);
			return (
				[
					ts.SyntaxKind.EqualsEqualsEqualsToken,
					ts.SyntaxKind.ExclamationEqualsEqualsToken,
					ts.SyntaxKind.EqualsEqualsToken,
					ts.SyntaxKind.ExclamationEqualsToken,
				].includes(op) ||
				(op === ts.SyntaxKind.PlusToken &&
					(ts.isStringLiteralLike(use.left) || ts.isStringLiteralLike(use.right)))
			);
		}
		if (
			ts.isVariableDeclaration(use) &&
			use.initializer === value &&
			ts.isIdentifier(use.name) &&
			ts.getCombinedNodeFlags(use) & ts.NodeFlags.Const
		)
			return uses(use.name).every((ref) => textSink(ref, allowForwarding));
		if (ts.isJsxExpression(use) && ts.isJsxAttribute(use.parent)) {
			const attr = use.parent;
			const tag = attr.parent.parent;
			if (!ts.isIdentifier(attr.name) || !ts.isIdentifier(tag.tagName)) return false;
			const prop = attr.name.text;
			if (/^[a-z][a-z0-9]*$/.test(tag.tagName.text))
				return (
					prop === 'title' ||
					prop.startsWith('aria-') ||
					(prop === 'placeholder' && ['input', 'textarea'].includes(tag.tagName.text)) ||
					(prop === 'alt' && ['img', 'input', 'area'].includes(tag.tagName.text)) ||
					(prop === 'label' && ['option', 'optgroup', 'track'].includes(tag.tagName.text)) ||
					prop.startsWith('data-')
				);
			if (
				!allowForwarding ||
				!/^[A-Z]/.test(tag.tagName.text) ||
				tag.attributes.properties.some(
					(a) =>
						ts.isJsxSpreadAttribute(a) || (ts.isJsxAttribute(a) && a.name.getText(file) === 'is'),
				)
			)
				return false;
			const symbol = checker.getSymbolAtLocation(tag.tagName);
			const decl = symbol?.declarations?.[0];
			if (decl && ts.isImportSpecifier(decl)) {
				const module = decl.parent.parent.parent.moduleSpecifier;
				return (
					ts.isStringLiteral(module) &&
					!!importedText?.(module.text, (decl.propertyName ?? decl.name).text, prop, ordinaryCaller)
				);
			}
			return forwards(symbol, prop);
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
			!textSink(
				call,
				call.arguments.length <= 2 &&
					ts.isObjectLiteralExpression(call.arguments[0]) &&
					call.arguments[0].properties.every(
						(field) =>
							ts.isPropertyAssignment(field) &&
							(ts.isIdentifier(field.name) || ts.isStringLiteral(field.name)) &&
							descriptor.has(field.name.text) &&
							ts.isStringLiteralLike(field.initializer),
					),
			)
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
