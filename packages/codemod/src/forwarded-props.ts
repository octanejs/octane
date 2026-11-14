import ts from 'typescript';
import { isWrapper, skipWrappers } from './expression-wrappers.js';
import { localUses } from './local-uses.js';

export function contains(node: ts.Node, matches: (node: ts.Node) => boolean): boolean {
	return (
		matches(node) ||
		ts.forEachChild(node, (child) => contains(child, matches) || undefined) === true
	);
}

export function hasEval(file: ts.SourceFile) {
	return contains(file, (node) => ts.isIdentifier(node) && node.text === 'eval');
}

export function hasPrototypeAccess(file: ts.SourceFile) {
	return contains(
		file,
		(node) =>
			(ts.isIdentifier(node) || ts.isStringLiteralLike(node)) &&
			['prototype', '__proto__', 'getPrototypeOf'].includes(node.text),
	);
}

/** The DOM attributes whose renderer stringifies the supplied value. */
function hostText(tag: ts.JsxTagNameExpression, prop: string) {
	return (
		ts.isIdentifier(tag) &&
		/^[a-z][a-z0-9]*$/.test(tag.text) &&
		(prop === 'title' ||
			prop.startsWith('aria-') ||
			prop.startsWith('data-') ||
			(prop === 'placeholder' && ['input', 'textarea'].includes(tag.text)) ||
			(prop === 'alt' && ['img', 'input', 'area'].includes(tag.text)) ||
			(prop === 'label' && ['option', 'optgroup', 'track'].includes(tag.text)))
	);
}

function hostAttribute(attr: ts.JsxAttributeLike, prop: string) {
	return (
		hostText(attr.parent.parent.tagName, prop) &&
		attr.parent.properties.every(
			(a) =>
				a === attr ||
				(ts.isJsxAttribute(a) && a.name.getText() !== prop && a.name.getText() !== 'is'),
		)
	);
}

function directAttribute(value: ts.Node) {
	const expr = value.parent;
	if (!ts.isJsxExpression(expr) || !ts.isJsxAttribute(expr.parent)) return false;
	const attr = expr.parent;
	return ts.isIdentifier(attr.name) && hostAttribute(attr, attr.name.text);
}

function memberKey(ref: ts.Identifier) {
	const use = ref.parent;
	if (ts.isPropertyAccessExpression(use) && use.expression === ref) return use.name.text;
	if (
		ts.isElementAccessExpression(use) &&
		use.expression === ref &&
		ts.isStringLiteral(use.argumentExpression)
	)
		return use.argumentExpression.text;
}

/** Find the single binding that receives this property, or the rest bag containing it. */
function incoming(param: ts.ParameterDeclaration, prop: string) {
	if (param.dotDotDotToken || param.initializer) return null;
	if (ts.isIdentifier(param.name)) return { name: param.name, bag: true };
	if (!ts.isObjectBindingPattern(param.name)) return null;
	let direct: ts.BindingElement | undefined, rest: ts.BindingElement | undefined;
	for (const field of param.name.elements) {
		const key = field.propertyName ?? field.name;
		if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) return null;
		if (field.dotDotDotToken) rest = field;
		else if (key.text === prop) {
			if (direct) return null;
			direct = field;
		}
	}
	const field = direct ?? rest;
	return field && !field.initializer && ts.isIdentifier(field.name)
		? { name: field.name, bag: !!field.dotDotDotToken }
		: null;
}

// Raw-text and void HTML elements do not render ordinary child elements.
const nonElementHosts =
	/^(?:textarea|title|script|style|option|noscript|iframe|noembed|noframes|xmp|plaintext|area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/;
const hookName = /^use(?:[A-Z0-9]|$)/;

export function rendersElementChildren(element: ts.JsxOpeningLikeElement) {
	return (
		ts.isIdentifier(element.tagName) &&
		!nonElementHosts.test(element.tagName.text) &&
		!element.attributes.properties.some(
			(attr) => ts.isJsxAttribute(attr) && attr.name.getText() === 'dangerouslySetInnerHTML',
		)
	);
}

// A scalar assertion can turn a child into a text binding. Require a member
// that the compiler cannot classify as primitive text, even through aliases.
function renderType(type: ts.Type) {
	const members = type.isUnion() ? type.types : [type];
	return members.some((t) => !!(t.flags & (ts.TypeFlags.Object | ts.TypeFlags.BooleanLike)));
}

// Type queries and type-only exports cannot hand a component or its children to a renderer.
export function renderUses(refs: ts.Identifier[]) {
	return refs.filter((ref) => {
		let name: ts.EntityName = ref;
		while (ts.isQualifiedName(name.parent)) name = name.parent;
		return !ts.isTypeQueryNode(name.parent) && !ts.isTypeOnlyExportDeclaration(ref.parent);
	});
}

type RenderTypes = {
	typeOf: (node: ts.Node) => ts.Type;
	text: (node: ts.Node) => boolean;
};

/** Follow the value being rendered all the way to its containing component's return. */
export function nativeOutputOwner(
	value: ts.Node,
	slot: (tag: ts.Identifier, prop: string) => boolean,
	{ typeOf, text }: RenderTypes,
) {
	for (;;) {
		const parent = value.parent;
		if (ts.isReturnStatement(parent)) {
			const fn = ts.findAncestor(parent, ts.isFunctionLike);
			return fn &&
				(ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))
				? fn
				: undefined;
		}
		if (ts.isArrowFunction(parent) && parent.body === value) return parent;
		if (ts.isJsxElement(parent) || ts.isJsxAttribute(parent)) {
			const attr = ts.isJsxAttribute(parent) ? parent : undefined;
			const element = ts.isJsxElement(parent) ? parent.openingElement : parent.parent.parent;
			if (!(ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element))) return;
			const tag = element.tagName;
			if (!ts.isIdentifier(tag)) return;
			if (
				attr
					? attr.initializer !== value || !ts.isIdentifier(attr.name)
					: ts.isJsxElement(parent) && !parent.children.some((child) => child === value)
			)
				return;
			if (/^[a-z]/.test(tag.text)) {
				if (attr || !rendersElementChildren(element)) return;
			} else {
				const key = attr ? attr.name.getText() : 'children';
				if (
					(attr &&
						key === 'children' &&
						ts.isJsxOpeningElement(element) &&
						element.parent.children.length) ||
					element.attributes.properties.some(
						(a) =>
							!ts.isJsxAttribute(a) ||
							!ts.isIdentifier(a.name) ||
							a.name.text === '__proto__' ||
							(a !== attr && a.name.text === key),
					) ||
					!slot(tag, key)
				)
					return;
			}
			value = ts.isJsxOpeningElement(element) ? element.parent : element;
			continue;
		}
		if (isWrapper(parent) && !ts.isParenthesizedExpression(parent)) {
			if (
				parent.expression !== value ||
				!renderType(typeOf(parent)) ||
				(ts.isSatisfiesExpression(parent) && !renderType(typeOf(parent.type)))
			)
				return;
			value = parent;
			continue;
		}
		if (!(
			ts.isJsxFragment(parent) ||
			(ts.isJsxExpression(parent) &&
				!parent.dotDotDotToken &&
				(ts.isJsxAttribute(parent.parent) || !text(value))) ||
			ts.isParenthesizedExpression(parent) ||
			(ts.isConditionalExpression(parent) && parent.condition !== value) ||
			(ts.isBinaryExpression(parent) &&
				parent.right === value &&
				(parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
					parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken))
		))
			return;
		value = parent;
	}
}

// Logical operators can return the original value. Follow them to the test
// that consumes it, or to a rendered && whose left operand only gates its right.
function testsPresence(value: ts.Node, rendered: (node: ts.Node) => boolean): boolean {
	for (;;) {
		const parent = value.parent;
		if (ts.isBinaryExpression(parent)) {
			const op = parent.operatorToken.kind;
			if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) {
				if (
					op === ts.SyntaxKind.AmpersandAmpersandToken &&
					parent.left === value &&
					rendered(parent)
				)
					return true;
			} else {
				const other = parent.left === value ? parent.right : parent.left;
				return (
					other.kind === ts.SyntaxKind.NullKeyword &&
					(op === ts.SyntaxKind.EqualsEqualsToken ||
						op === ts.SyntaxKind.ExclamationEqualsToken ||
						op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
						op === ts.SyntaxKind.ExclamationEqualsEqualsToken)
				);
			}
		} else if (!ts.isParenthesizedExpression(parent)) {
			return (
				(ts.isPrefixUnaryExpression(parent) &&
					parent.operator === ts.SyntaxKind.ExclamationToken) ||
				(ts.isConditionalExpression(parent) && parent.condition === value) ||
				(ts.isIfStatement(parent) && parent.expression === value)
			);
		}
		value = parent;
	}
}

// A hook can require a different renderer before the receiver reaches its template.
function callsHook(node: ts.Node, checker: ts.TypeChecker) {
	if (!ts.isCallExpression(node)) return false;
	let callee = skipWrappers(node.expression);
	const seen = new Set<ts.Node>();
	while (ts.isIdentifier(callee)) {
		if (hookName.test(callee.text)) return true;
		const decl = checker.getSymbolAtLocation(callee)?.declarations?.[0];
		if (!decl || seen.has(decl)) return false;
		if (ts.isImportSpecifier(decl)) return hookName.test((decl.propertyName ?? decl.name).text);
		if (
			!ts.isVariableDeclaration(decl) ||
			!(ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const) ||
			!decl.initializer
		)
			return false;
		seen.add(decl);
		callee = skipWrappers(decl.initializer);
	}
	if (ts.isPropertyAccessExpression(callee)) return hookName.test(callee.name.text);
	return (
		ts.isElementAccessExpression(callee) &&
		ts.isStringLiteralLike(callee.argumentExpression) &&
		hookName.test(callee.argumentExpression.text)
	);
}

export function literalJsxAttribute(attr: ts.JsxAttributeLike) {
	if (!ts.isJsxAttribute(attr)) return false;
	const value = attr.initializer;
	return (
		!value ||
		ts.isStringLiteral(value) ||
		(ts.isJsxExpression(value) &&
			(value.expression?.kind === ts.SyntaxKind.TrueKeyword ||
				value.expression?.kind === ts.SyntaxKind.FalseKeyword))
	);
}

function standaloneWrite(node: ts.Node): node is ts.BinaryExpression {
	return (
		ts.isBinaryExpression(node) &&
		node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
		ts.isExpressionStatement(node.parent)
	);
}

/** Follow one stored SVG value to its only runtime read, inside the same component body. */
export function svgLocalReads(
	checker: ts.TypeChecker,
	uses: ReturnType<typeof localUses>,
	typeOf: RenderTypes['typeOf'],
	reactNode: (annotation: ts.TypeNode) => boolean,
) {
	const reads = new Map<ts.VariableDeclaration, ts.Identifier | undefined>();
	const eligibleBodies = new Map<ts.Block, boolean>();

	function outlet(decl: ts.VariableDeclaration, name: ts.Identifier) {
		const list = decl.parent;
		if (
			!ts.isVariableDeclarationList(list) ||
			!(list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) ||
			list.flags & ts.NodeFlags.Using ||
			!ts.isVariableStatement(list.parent)
		)
			return;
		const body = list.parent.parent;
		if (!ts.isBlock(body) || !ts.isFunctionLike(body.parent)) return;
		const fn = body.parent;
		const annotation = decl.type ?? ts.getJSDocType(decl);
		if (annotation && !renderType(typeOf(annotation)) && !reactNode(annotation)) return;

		let read: ts.Identifier | undefined;
		for (const ref of renderUses(uses(name))) {
			if (ts.findAncestor(ref, ts.isFunctionLike) !== fn) return;
			if (standaloneWrite(ref.parent) && ref.parent.left === ref) continue;
			if (read) return;
			read = ref;
		}
		if (!read) return;
		if (!eligibleBodies.has(body)) {
			const last = body.statements.at(-1);
			// Early returns can split mutable locals across compiler-generated functions.
			eligibleBodies.set(
				body,
				!!last &&
					ts.isReturnStatement(last) &&
					!contains(
						fn,
						(node) =>
							callsHook(node, checker) ||
							(ts.isReturnStatement(node) &&
								node !== last &&
								ts.findAncestor(node, ts.isFunctionLike) === fn),
					),
			);
		}
		return eligibleBodies.get(body) ? read : undefined;
	}

	return (element: ts.JsxSelfClosingElement) => {
		let value: ts.Node = element;
		while (ts.isParenthesizedExpression(value.parent)) value = value.parent;
		const parent = value.parent;
		// A chained assignment or call can receive the element independently of the local.
		const name =
			ts.isVariableDeclaration(parent) && parent.initializer === value
				? parent.name
				: standaloneWrite(parent) && parent.right === value
					? parent.left
					: undefined;
		if (!name || !ts.isIdentifier(name)) return;
		// Literal props have the same value at assignment and at the render outlet.
		if (!element.attributes.properties.every(literalJsxAttribute)) return;
		const symbol = checker.getSymbolAtLocation(name);
		const decl = symbol?.valueDeclaration;
		if (
			!decl ||
			symbol.declarations?.length !== 1 ||
			!ts.isVariableDeclaration(decl) ||
			!ts.isIdentifier(decl.name)
		)
			return;
		if (!reads.has(decl)) reads.set(decl, outlet(decl, decl.name));
		return reads.get(decl);
	};
}

/** The returned native tree must own the element before its props can reach another renderer. */
export function returnedTextReceiver(
	tag: ts.JsxOpeningLikeElement,
	types: RenderTypes,
	uses: ReturnType<typeof localUses>,
) {
	const element = ts.isJsxOpeningElement(tag) ? tag.parent : tag;
	const owner = nativeOutputOwner(element, () => false, types);
	return owner &&
		ts.isFunctionDeclaration(owner) &&
		!owner.asteriskToken &&
		!owner.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) &&
		ts.isSourceFile(owner.parent) &&
		owner.name &&
		ts.findAncestor(element, ts.isFunctionLike) === owner &&
		uses(owner.name).every(
			(ref) =>
				(ts.isJsxOpeningElement(ref.parent) ||
					ts.isJsxClosingElement(ref.parent) ||
					ts.isJsxSelfClosingElement(ref.parent)) &&
				ref.parent.tagName === ref,
		)
		? owner
		: undefined;
}

/** A competing prop, custom element, or spread can change which receiver observes the value. */
export function closedForwardedAttribute(attr: ts.JsxAttribute) {
	return attr.parent.properties.every(
		(a) =>
			ts.isJsxAttribute(a) &&
			ts.isIdentifier(a.name) &&
			!['key', 'ref', 'children', '__proto__', 'is'].includes(a.name.text) &&
			(a === attr || a.name.text !== attr.name.getText()),
	);
}

type TextPath = RenderTypes & { next?: (module: string, name: string, prop: string) => boolean };

/** Prove where a selected component delivers every reference to an incoming prop. */
export function forwardedProps(
	file: ts.SourceFile,
	checker: ts.TypeChecker,
	destination:
		| 'text'
		| (RenderTypes & {
				imported?: (module: string, name: string, prop: string, depth: number) => boolean;
		  }),
	uses = localUses(file, checker),
	ordinaryProps = !hasPrototypeAccess(file),
	textPath?: TextPath,
) {
	// Direct eval may read any local or reassign a component declaration by spelling alone.
	if (
		((destination !== 'text' || textPath) &&
			(/@jsx(?:ImportSource|Runtime|Frag)?\b/i.test(file.text) || !ordinaryProps)) ||
		hasEval(file)
	)
		return () => false;
	const references = destination === 'text' ? uses : (id: ts.Identifier) => renderUses(uses(id));
	const directOnly = new Map<ts.Symbol, Map<string, boolean>>();
	const withSiblings = new Map<ts.Symbol, Map<string, boolean>>();
	function check(symbol: ts.Symbol, prop: string, allowSiblings: boolean, depth: number): boolean {
		const decl = symbol.valueDeclaration;
		if (destination !== 'text' && destination.imported && symbol.declarations?.length === 1) {
			const item = symbol.declarations[0];
			const clause = ts.isImportClause(item)
				? item
				: ts.isImportSpecifier(item) && !item.isTypeOnly
					? item.parent.parent
					: null;
			if (clause) {
				if (
					clause.isTypeOnly ||
					clause.parent.attributes ||
					!ts.isStringLiteral(clause.parent.moduleSpecifier)
				)
					return false;
				const name = ts.isImportSpecifier(item) ? (item.propertyName ?? item.name).text : 'default';
				return destination.imported(clause.parent.moduleSpecifier.text, name, prop, depth);
			}
		}
		if (!decl || decl.getSourceFile() !== file || symbol.declarations?.length !== 1) return false;
		const fn = ts.isFunctionDeclaration(decl)
			? decl
			: ts.isVariableDeclaration(decl) &&
				  ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const &&
				  decl.initializer &&
				  (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
				? decl.initializer
				: null;
		if (!fn?.body || fn.parameters.length !== 1) return false;
		// A function declaration can be reassigned. Be conservative about uses of its binding.
		if (
			(ts.isFunctionDeclaration(decl) ||
				(destination !== 'text' && ts.isVariableDeclaration(decl))) &&
			decl.name &&
			ts.isIdentifier(decl.name) &&
			!references(decl.name).every((ref) => {
				const p = ref.parent;
				if (destination !== 'text' && (ts.isExportSpecifier(p) || ts.isExportAssignment(p)))
					return true;
				return (
					(ts.isJsxOpeningElement(p) ||
						ts.isJsxClosingElement(p) ||
						ts.isJsxSelfClosingElement(p)) &&
					p.tagName === ref
				);
			})
		)
			return false;
		const binding = incoming(fn.parameters[0], prop);
		if (!binding) return false;
		// The arguments object is another way to read the original props.
		if (
			contains(
				fn,
				(node) =>
					(ts.isIdentifier(node) && node.text === 'arguments') ||
					((destination !== 'text' || !!textPath) && callsHook(node, checker)),
			)
		)
			return false;
		const refs = references(binding.name);
		if (textPath) {
			if (binding.bag || !refs.length) return false;
			return refs.every((ref) => {
				const expr = ref.parent;
				if (!ts.isJsxExpression(expr) || !ts.isJsxAttribute(expr.parent)) return false;
				const attr = expr.parent;
				const tag = attr.parent.parent;
				if (!ts.isIdentifier(attr.name) || returnedTextReceiver(tag, textPath, uses) !== fn)
					return false;
				if (hostAttribute(attr, attr.name.text)) return true;
				if (
					!textPath.next ||
					!ts.isIdentifier(tag.tagName) ||
					!/^[A-Z]/.test(tag.tagName.text) ||
					!closedForwardedAttribute(attr)
				)
					return false;
				const declarations = checker.getSymbolAtLocation(tag.tagName)?.declarations;
				const spec = declarations?.length === 1 ? declarations[0] : undefined;
				if (!spec || !ts.isImportSpecifier(spec) || spec.isTypeOnly) return false;
				const clause = spec.parent.parent;
				const imp = clause.parent;
				return (
					!clause.isTypeOnly &&
					!imp.attributes &&
					ts.isStringLiteral(imp.moduleSpecifier) &&
					textPath.next(
						imp.moduleSpecifier.text,
						(spec.propertyName ?? spec.name).text,
						attr.name.text,
					)
				);
			});
		}
		if (destination !== 'text') {
			// Direct destructuring prevents another call from observing this slot through the props object.
			if (
				binding.bag ||
				fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ||
				fn.asteriskToken
			)
				return false;
			const rendered = (node: ts.Node) =>
				nativeOutputOwner(
					node,
					(tag, slot) => accepts(checker.getSymbolAtLocation(tag), slot, true, depth + 1),
					destination,
				) === fn;
			let hasRender = false;
			for (const ref of refs) {
				if (!destination.text(ref) && rendered(ref)) {
					hasRender = true;
					continue;
				}
				// Implicit children can be a truthy render body even when empty.
				// A forwarded slot may have started as children in another component.
				if (
					depth !== 0 ||
					prop === 'children' ||
					!testsPresence(ref, rendered) ||
					ts.findAncestor(ref, ts.isFunctionLike) !== fn
				)
					return false;
			}
			return hasRender;
		}
		return (
			refs.length > 0 &&
			refs.every((ref) => {
				if (!binding.bag) return directAttribute(ref);
				const p = ref.parent;
				const key = memberKey(ref);
				if (key !== undefined) {
					if (key === prop) return directAttribute(p);
					if (!allowSiblings) return false; // An inherited getter can observe the entire receiver.
					if (directAttribute(p)) return true;
					// A test of a sibling does not expose the formatted prop or pass the bag as `this`.
					const test = p.parent;
					return (
						(ts.isIfStatement(test) && test.expression === p) ||
						(ts.isConditionalExpression(test) && test.condition === p) ||
						(ts.isBinaryExpression(test) &&
							test.left === p &&
							test.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
					);
				}
				return ts.isJsxSpreadAttribute(p) && p.expression === ref && hostAttribute(p, prop);
			})
		);
	}
	function accepts(
		symbol: ts.Symbol | undefined,
		prop: string,
		ordinaryCaller = true,
		depth = 0,
	): boolean {
		// An arbitrarily deep or cyclic chain cannot be proved within this analysis budget.
		if (depth >= 32) return false;
		if (
			!symbol ||
			['ref', 'key', 'is', '__proto__'].includes(prop) ||
			(destination === 'text' && prop === 'children')
		)
			return false;
		const allowSiblings = ordinaryCaller && ordinaryProps;
		const proven = allowSiblings ? withSiblings : directOnly;
		let props = proven.get(symbol);
		if (!props) proven.set(symbol, (props = new Map()));
		const key = depth ? depth + ':' + prop : prop;
		if (!props.has(key)) {
			props.set(key, false);
			props.set(key, check(symbol, prop, allowSiblings, depth));
		}
		return props.get(key)!;
	}
	return accepts;
}
