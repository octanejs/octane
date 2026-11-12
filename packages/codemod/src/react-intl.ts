import {
	closedForwardedAttribute,
	forwardedProps,
	hasEval,
	hasPrototypeAccess,
	renderUses,
} from './forwarded-props.js';
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
	returnedReceiver: (tag: ts.JsxOpeningLikeElement) => boolean,
	originalReact: () => boolean,
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
	const forwards = forwardedProps(file, checker, 'text', uses, ordinaryCaller);
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
				if (!ts.isStringLiteral(module) || !importedText) return false;
				const name = (decl.propertyName ?? decl.name).text;
				if (importedText(module.text, name, prop, ordinaryCaller)) return true;
				return (
					!decl.isTypeOnly &&
					!decl.parent.parent.isTypeOnly &&
					!decl.parent.parent.parent.attributes &&
					ordinaryCaller &&
					!/@jsx(?:ImportSource|Runtime|Frag)?\b/i.test(file.text) &&
					closedForwardedAttribute(attr) &&
					returnedReceiver(tag) &&
					importedText(module.text, name, prop, true, true)
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
	function callsScalarMethod(receiver: ts.Expression): boolean {
		const access = receiver.parent;
		if (
			!ts.isPropertyAccessExpression(access) ||
			access.expression !== receiver ||
			access.questionDotToken
		)
			return false;
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
	function localeView(
		owner: ts.FunctionDeclaration,
		decl: ts.VariableDeclaration,
		name: ts.Identifier,
	) {
		const body = owner.body?.statements;
		const [bind, output] = body ?? [];
		if (
			owner.parameters.length ||
			body?.length !== 2 ||
			!ts.isVariableStatement(bind) ||
			bind.declarationList !== decl.parent ||
			bind.declarationList.declarations.length !== 1 ||
			!ts.isReturnStatement(output) ||
			!output.expression
		)
			return false;
		const view = output.expression;
		const tag = ts.isJsxElement(view) ? view.openingElement : view;
		if (
			(!ts.isJsxOpeningElement(tag) && !ts.isJsxSelfClosingElement(tag)) ||
			!ts.isIdentifier(tag.tagName) ||
			!/^(?:div|span|p|b|strong|em|small|label|output|h[1-6])$/.test(tag.tagName.text)
		)
			return false;
		const readsLocale = (node: ts.JsxExpression) =>
			!node.dotDotDotToken &&
			!!node.expression &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === name.text;
		const [attr, extra] = tag.attributes.properties;
		if (
			extra ||
			(attr &&
				(!ts.isJsxAttribute(attr) ||
					!ts.isIdentifier(attr.name) ||
					attr.name.text !== 'lang' ||
					!attr.initializer ||
					!ts.isJsxExpression(attr.initializer) ||
					!readsLocale(attr.initializer)))
		)
			return false;
		const children = ts.isJsxElement(view)
			? view.children.filter((child) => !ts.isJsxText(child) || child.text.trim())
			: [];
		const [child, sibling] = children;
		return !sibling && (child ? ts.isJsxExpression(child) && readsLocale(child) : !!attr);
	}
	// Only a private component with a closed JSX use can prove its nearest provider.
	function localeProvider(owner: ts.FunctionDeclaration) {
		if (
			!ordinaryCaller ||
			/@jsx(?:ImportSource|Runtime|Frag)?\b/i.test(file.text) ||
			owner.parent !== file ||
			owner.asteriskToken ||
			owner.modifiers ||
			!owner.name
		)
			return;
		const [ref, extra] = renderUses(uses(owner.name));
		const leaf = ref?.parent;
		if (
			extra ||
			!leaf ||
			!ts.isJsxSelfClosingElement(leaf) ||
			leaf.tagName !== ref ||
			leaf.typeArguments ||
			leaf.attributes.properties.length
		)
			return;
		const tree = leaf.parent;
		if (
			!ts.isJsxElement(tree) ||
			inReact(tree) ||
			!tree.children.every((child) => child === leaf || (ts.isJsxText(child) && !child.text.trim()))
		)
			return;
		const { tagName, attributes } = tree.openingElement;
		const closing = tree.closingElement.tagName;
		const [attr, other] = attributes.properties;
		if (
			!ts.isIdentifier(tagName) ||
			!ts.isIdentifier(closing) ||
			other ||
			!attr ||
			!ts.isJsxAttribute(attr) ||
			!ts.isIdentifier(attr.name) ||
			attr.name.text !== 'locale' ||
			!attr.initializer ||
			!ts.isStringLiteral(attr.initializer) ||
			/[&\r\n]/.test(attr.initializer.text)
		)
			return;
		const provider = candidates.find((item) => {
			if ((item.propertyName ?? item.name).text !== 'IntlProvider') return false;
			const refs = renderUses(uses(item.name));
			return refs.length === 2 && refs.includes(tagName) && refs.includes(closing);
		});
		if (!provider || !originalReact()) return;
		let output: ts.Node = tree;
		while (ts.isParenthesizedExpression(output.parent)) output = output.parent;
		if (!ts.isReturnStatement(output.parent)) return;
		const root = ts.findAncestor(output.parent, ts.isFunctionLike);
		if (
			root &&
			(ts.isFunctionDeclaration(root) ||
				ts.isFunctionExpression(root) ||
				ts.isArrowFunction(root)) &&
			!root.asteriskToken &&
			!root.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) &&
			isComponent(root)
		)
			return provider;
	}
	function readsIntl(id: ts.Identifier, allowLocale = false) {
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
		if (callsScalarMethod(call)) return true;
		const access = call.parent;
		const directLocale =
			ts.isPropertyAccessExpression(access) &&
			access.expression === call &&
			!access.questionDotToken &&
			access.name.text === 'locale';
		const initializer = directLocale ? access : call;
		const decl = initializer.parent;
		if (
			!ts.isVariableDeclaration(decl) ||
			decl.initializer !== initializer ||
			!(ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const)
		)
			return false;
		let name: ts.Identifier;
		if (ts.isIdentifier(decl.name)) {
			if (!directLocale) return uses(decl.name).every(callsScalarMethod);
			name = decl.name;
		} else {
			if (directLocale || !ts.isObjectBindingPattern(decl.name) || decl.name.elements.length !== 1)
				return false;
			const [binding] = decl.name.elements;
			const key = binding.propertyName ?? binding.name;
			if (
				binding.dotDotDotToken ||
				binding.initializer ||
				!ts.isIdentifier(binding.name) ||
				(!ts.isIdentifier(key) && !ts.isStringLiteral(key)) ||
				key.text !== 'locale'
			)
				return false;
			name = binding.name;
		}
		// A custom provider can perform React DOM resource work in its locale getter.
		return (
			allowLocale &&
			ts.isFunctionDeclaration(owner) &&
			localeView(owner, decl, name) &&
			(localeProvider(owner) ?? false)
		);
	}
	for (const item of candidates) {
		const name = (item.propertyName ?? item.name).text;
		const locations = uses(item.name);
		if (!locations.length) continue;
		if (name === 'useIntl') {
			// Direct eval can read the imported hook or its formatter through an untracked name.
			if (hasEval(file)) continue;
			const proof =
				locations.length === 1
					? readsIntl(locations[0], true)
					: locations.every((id) => readsIntl(id));
			if (proof) {
				selected.add(item);
				if (proof !== true) selected.add(proof);
			}
			continue;
		}
		const supported = locations.every((id) => {
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
