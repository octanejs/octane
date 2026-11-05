import { forwardedTextProps } from './forwarded-text.js';
import type { TransformOptions } from './types.js';
import { localUses, scalar } from './local-uses.js';
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
	const forwards = forwardedTextProps(file, checker, uses);
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
			return uses(use.name).every((ref) => textSink(ref, allowForwarding));
		if (ts.isJsxExpression(use) && ts.isJsxAttribute(use.parent)) {
			const attr = use.parent;
			const tag = attr.parent.parent;
			if (!ts.isIdentifier(attr.name) || !ts.isIdentifier(tag.tagName)) return false;
			const prop = attr.name.text;
			if (/^[a-z]/.test(tag.tagName.text))
				return prop === 'title' || prop === 'aria-label' || prop.startsWith('data-');
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
					!!importedText?.(module.text, (decl.propertyName ?? decl.name).text, prop)
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
				call.arguments.length === 1 &&
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
		return (
			!values ||
			(ts.isObjectLiteralExpression(values) &&
				values.properties.every((p) =>
					ts.isPropertyAssignment(p)
						? scalar(typeOf(p.initializer))
						: ts.isShorthandPropertyAssignment(p) && scalar(typeOf(p.name)),
				))
		);
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
						? descriptor.has(attr.name.text)
						: !['ref', 'children', 'defaultRichTextElements', 'textComponent'].includes(
								attr.name.text,
							)),
			);
		});
		if (supported) selected.add(item);
	}
	return selected;
}
