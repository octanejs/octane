import { hasEval, nativeOutputOwner, renderUses } from './forwarded-props.js';
import {
	componentTagOrExport,
	localSymbol,
	localUses,
	portableArguments,
	scalar,
	valueReads,
} from './local-uses.js';
import { literalCondition, skipWrappers } from './expression-wrappers.js';
import type { StoreInputCheck } from './store-inputs.js';
import ts from 'typescript';

type ResultCheck = {
	item: ts.ImportSpecifier;
	imported: StoreInputCheck;
	known: Map<ts.Expression, boolean>;
	descriptors: (elements: ts.JsxSelfClosingElement[]) => boolean;
	unchangedHelper?: (module: string, name: string) => boolean;
	retainedArgument?: (module: string, name: string) => boolean;
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

/** A later spread or unknown key may replace the selected own data property. */
function finalOwnField(source: ts.ObjectLiteralExpression, key: string) {
	if (key === '__proto__') return;
	for (let i = source.properties.length - 1; i >= 0; i--) {
		const field = source.properties[i];
		if (!field.name || !(ts.isIdentifier(field.name) || ts.isStringLiteralLike(field.name))) return;
		if (field.name.text !== key) continue;
		if (ts.isPropertyAssignment(field)) return field.initializer;
		if (ts.isShorthandPropertyAssignment(field) && !field.objectAssignmentInitializer)
			return field.name;
		return;
	}
}

/** A final, defined own property in an inline object prevents its binding default from running. */
function suppliesBinding(binding: ts.BindingElement) {
	const pattern = binding.parent;
	const decl = pattern.parent;
	// Reading an earlier binding can invoke a getter that mutates the object.
	if (
		!ts.isObjectBindingPattern(pattern) ||
		pattern.elements[0] !== binding ||
		!ts.isVariableDeclaration(decl) ||
		!decl.initializer
	)
		return false;
	const source = skipWrappers(decl.initializer);
	const key = binding.propertyName ?? binding.name;
	if (
		!ts.isObjectLiteralExpression(source) ||
		!(ts.isIdentifier(key) || ts.isStringLiteralLike(key))
	)
		return false;
	const value = finalOwnField(source, key.text);
	return !!value && (literal(value) || literalCondition(value) === 'truthy');
}

/** Only follow one ordinary const record which cannot be changed through another reader. */
function selectedRecordField(
	d: ts.BindingElement,
	checker: ts.TypeChecker,
	uses: ReturnType<typeof localUses>,
) {
	const pattern = d.parent;
	const key = d.propertyName ?? d.name;
	if (
		d.dotDotDotToken ||
		!ts.isObjectBindingPattern(pattern) ||
		!(ts.isIdentifier(key) || ts.isStringLiteralLike(key))
	)
		return;
	const decl = pattern.parent;
	function constant(
		node: ts.Node | undefined,
	): node is ts.VariableDeclaration & { initializer: ts.Expression } {
		return (
			!!node &&
			ts.isVariableDeclaration(node) &&
			!!node.initializer &&
			ts.isVariableDeclarationList(node.parent) &&
			(node.parent.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const
		);
	}
	if (!constant(decl)) return;
	let record = skipWrappers(decl.initializer);
	if (ts.isIdentifier(record)) {
		const source = checker.getSymbolAtLocation(record)?.valueDeclaration;
		if (
			!constant(source) ||
			!ts.isIdentifier(source.name) ||
			source.end > decl.pos ||
			!ts.isVariableStatement(source.parent.parent) ||
			source.parent.parent.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ||
			!renderUses(uses(source.name)).every((ref) => ref === record)
		)
			return;
		record = skipWrappers(source.initializer);
	}
	if (!ts.isObjectLiteralExpression(record)) return;
	const file = d.getSourceFile();
	if ((file.text.includes('eval') || file.text.includes('\\u')) && hasEval(file)) return;
	// A getter or default in an earlier binding could change the selected field.
	for (const entry of pattern.elements) {
		if (entry === d) return finalOwnField(record, key.text);
		const earlier = entry.propertyName ?? entry.name;
		if (
			!ts.isIdentifier(entry.name) ||
			entry.initializer ||
			entry.dotDotDotToken ||
			!(ts.isIdentifier(earlier) || ts.isStringLiteralLike(earlier)) ||
			!finalOwnField(record, earlier.text)
		)
			return;
	}
}

/** A bare SVG's default export can switch from a component to an asset URL for a .tsrx issuer. */
export function isBareSvgTag(
	tag: ts.JsxTagNameExpression,
	checker: ts.TypeChecker,
	imports: Set<ts.Node>,
	uses: ReturnType<typeof localUses>,
): boolean {
	if (!ts.isPropertyAccessExpression(tag) && (!ts.isIdentifier(tag) || /^[a-z]|-/.test(tag.text)))
		return false;
	function isSvgNamespace(value: ts.Expression) {
		value = skipWrappers(value);
		const declaration = ts.isIdentifier(value) && localSymbol(checker, value)?.declarations?.[0];
		return !!declaration && ts.isNamespaceImport(declaration) && imports.has(declaration);
	}
	const seen = new Set<ts.Symbol>();
	function fromSvg(value: ts.Expression): boolean {
		value = skipWrappers(value);
		if (ts.isPropertyAccessExpression(value))
			return value.name.text === 'default' && isSvgNamespace(value.expression);
		if (ts.isElementAccessExpression(value)) {
			const key = skipWrappers(value.argumentExpression);
			return (
				ts.isStringLiteralLike(key) && key.text === 'default' && isSvgNamespace(value.expression)
			);
		}
		if (ts.isConditionalExpression(value)) {
			const condition = literalCondition(value.condition);
			if (condition !== undefined)
				return fromSvg(condition === 'truthy' ? value.whenTrue : value.whenFalse);
			return fromSvg(value.whenTrue) || fromSvg(value.whenFalse);
		}
		if (ts.isBinaryExpression(value)) {
			const op = value.operatorToken.kind;
			const left = literalCondition(value.left);
			// A component or asset URL is truthy; the left side of && only tests it.
			if (op === ts.SyntaxKind.AmpersandAmpersandToken)
				return (left === undefined || left === 'truthy') && fromSvg(value.right);
			if (op === ts.SyntaxKind.BarBarToken)
				return fromSvg(value.left) || (left !== 'truthy' && fromSvg(value.right));
			if (op === ts.SyntaxKind.QuestionQuestionToken)
				return (
					fromSvg(value.left) ||
					((left === undefined || left === 'nullish') && fromSvg(value.right))
				);
		}
		if (!ts.isIdentifier(value)) return false;
		const symbol = localSymbol(checker, value);
		if (!symbol || seen.has(symbol)) return false;
		seen.add(symbol);
		const d = symbol.declarations?.[0];
		if (!d) return false;
		if (ts.isBindingElement(d) && ts.isIdentifier(d.name)) {
			const key = d.propertyName ?? d.name;
			const pattern = d.parent;
			const declaration = pattern.parent;
			if (
				!d.dotDotDotToken &&
				(ts.isIdentifier(key) || ts.isStringLiteralLike(key)) &&
				key.text === 'default' &&
				ts.isObjectBindingPattern(pattern) &&
				ts.isVariableDeclaration(declaration) &&
				declaration.initializer &&
				ts.isVariableDeclarationList(declaration.parent) &&
				declaration.parent.flags & ts.NodeFlags.Const &&
				isSvgNamespace(declaration.initializer)
			)
				return true;
			if (d.initializer) return !suppliesBinding(d) && fromSvg(d.initializer);
			const field = selectedRecordField(d, checker, uses);
			return !!field && fromSvg(field);
		}
		if (ts.isParameter(d) && ts.isIdentifier(d.name) && d.initializer)
			return fromSvg(d.initializer);
		if (
			ts.isVariableDeclaration(d) &&
			d.initializer &&
			ts.isVariableDeclarationList(d.parent) &&
			d.parent.flags & ts.NodeFlags.Const
		)
			return fromSvg(d.initializer);
		return !ts.isNamespaceImport(d) && imports.has(d);
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
	typeOf: (node: ts.Node) => ts.Type,
) {
	// Direct eval can reference the hook or a local result by spelling alone.
	if (file.text.includes('eval') || file.text.includes('\\u')) {
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
			!statement.attributes &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			statement.moduleSpecifier.text === 'react' &&
			names.includes((item.propertyName ?? item.name).text)
		);
	}
	function effectCallback(fn: ts.Node) {
		const call = fn.parent;
		return (
			ts.isCallExpression(call) &&
			!call.questionDotToken &&
			call.arguments[0] === fn &&
			reactHook(call.expression, ['useEffect', 'useLayoutEffect'])
		);
	}
	function sameEffectSetup(call: ts.CallExpression, hook: ts.CallExpression) {
		const effect = ts.findAncestor(call, effectBoundary);
		return (
			!!effect &&
			ts.isFunctionLike(effect) &&
			effectCallback(effect) &&
			ts.findAncestor(effect.parent, effectBoundary) === ts.findAncestor(hook, effectBoundary)
		);
	}
	function clickHandler(value: ts.Node, hook: ts.CallExpression) {
		let outer = value;
		while (ts.isParenthesizedExpression(outer.parent)) outer = outer.parent;
		const hole = outer.parent;
		if (!ts.isJsxExpression(hole) || !ts.isJsxAttribute(hole.parent)) return false;
		const attr = hole.parent;
		const host = attr.parent.parent;
		return (
			ts.isIdentifier(host.tagName) &&
			/^[a-z][a-z0-9]*$/.test(host.tagName.text) &&
			ts.isIdentifier(attr.name) &&
			/^onClick(?:Capture)?$/.test(attr.name.text) &&
			nativeOutputOwner(ts.isJsxOpeningElement(host) ? host.parent : host, () => false, {
				typeOf,
				text: (node) => scalar(typeOf(node)),
			}) === ts.findAncestor(hook, ts.isFunctionLike)
		);
	}
	function effectSetup(fn: ts.Node) {
		if (effectCallback(fn)) return fn;
		let cleanup = fn;
		while (ts.isParenthesizedExpression(cleanup.parent)) cleanup = cleanup.parent;
		const parent = cleanup.parent;
		const setup =
			ts.isArrowFunction(parent) && parent.body === cleanup
				? parent
				: ts.isReturnStatement(parent) && parent.expression === cleanup
					? ts.findAncestor(parent, ts.isFunctionLike)
					: undefined;
		if (setup && effectCallback(setup)) return setup;
	}
	function effectBoundary(node: ts.Node) {
		return ts.isFunctionLike(node) || ts.isClassLike(node);
	}
	function effectEventCallback(fn: ts.Node, hook: ts.CallExpression, use: ts.Node) {
		const event = fn.parent;
		if (
			!ts.isCallExpression(event) ||
			event.questionDotToken ||
			event.arguments[0] !== fn ||
			!reactHook(event.expression, ['useEffectEvent'])
		)
			return false;
		const declaration = event.parent;
		const owner = ts.findAncestor(hook, ts.isFunctionLike);
		if (
			!owner ||
			ts.findAncestor(event, effectBoundary) !== owner ||
			ts.findAncestor(use, effectBoundary) !== fn ||
			!ts.isVariableDeclaration(declaration) ||
			declaration.initializer !== event ||
			!ts.isIdentifier(declaration.name) ||
			!(ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const)
		)
			return false;
		// Every reference must be a direct call in this component's effects.
		const refs = uses(declaration.name);
		return (
			refs.length > 0 &&
			refs.every((ref) => {
				const call = ref.parent;
				if (!ts.isCallExpression(call) || call.expression !== ref || call.questionDotToken)
					return false;
				const caller = ts.findAncestor(call, effectBoundary);
				const setup = caller && ts.isFunctionLike(caller) && effectSetup(caller);
				return !!setup && ts.findAncestor(setup.parent, effectBoundary) === owner;
			})
		);
	}
	function runsAfterRender(use: ts.Node, hook: ts.CallExpression) {
		let owner = use.parent;
		for (let child = use; owner && !ts.isFunctionLike(owner); child = owner, owner = owner.parent) {
			// An instance initializer can run in another renderer if the class escapes.
			if (
				ts.isPropertyDeclaration(owner) &&
				owner.initializer === child &&
				!(ts.getCombinedModifierFlags(owner) & ts.ModifierFlags.Static)
			)
				return false;
		}
		return (
			!!owner &&
			(!!effectSetup(owner) || clickHandler(owner, hook) || effectEventCallback(owner, hook, use))
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
		return !name || renderUses(uses(name)).every(componentTagOrExport);
	}
	const portable = portableArguments(checker, typeOf);
	function argument(expr: ts.Expression, check: ResultCheck, allowShared = false) {
		return portable(expr, (module, name, selection) => {
			const input = check.imported(module, name, selection);
			// A scalar key can still dispatch to renderer-owned code through the store.
			return input === 'opaque' ? 'reject' : allowShared && input;
		});
	}
	function sharedHandle(expr: ts.Expression, imported: StoreInputCheck) {
		if (!ts.isIdentifier(expr)) return false;
		const d = checker.getSymbolAtLocation(expr)?.declarations?.[0];
		if (!d || !ts.isImportSpecifier(d) || d.isTypeOnly || d.parent.parent.isTypeOnly) return false;
		const spec = d.parent.parent.parent.moduleSpecifier;
		return (
			!d.parent.parent.parent.attributes &&
			ts.isStringLiteral(spec) &&
			imported(spec.text, (d.propertyName ?? d.name).text)
		);
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
	function originalReceiver(
		value: ts.Expression,
		check: ResultCheck,
		direct = false,
	): ts.CallExpression | undefined {
		if (
			ts.isParenthesizedExpression(value) ||
			ts.isNonNullExpression(value) ||
			ts.isSatisfiesExpression(value)
		)
			return originalReceiver(value.expression, check, direct);
		if (!direct && ts.isPropertyAccessExpression(value))
			return originalReceiver(value.expression, check);
		if (ts.isCallExpression(value)) {
			if (
				(!direct || !value.questionDotToken) &&
				ts.isIdentifier(value.expression) &&
				checker.getSymbolAtLocation(value.expression)?.declarations?.[0] === check.item &&
				value.arguments.every((arg) => plainData(arg) || sharedHandle(arg, check.imported) === true)
			)
				return value;
			return;
		}
		if (!ts.isIdentifier(value)) return;
		const d = checker.getSymbolAtLocation(value)?.valueDeclaration;
		if (
			d &&
			ts.isVariableDeclaration(d) &&
			ts.isIdentifier(d.name) &&
			d.initializer &&
			d.end <= value.pos &&
			ts.isVariableDeclarationList(d.parent) &&
			d.parent.flags & ts.NodeFlags.Const
		)
			return originalReceiver(d.initializer, check, direct);
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
			sharedHandle(read.arguments[0], check.imported) === true &&
			ts.isPropertyAccessExpression(read.expression) &&
			named(read.expression) &&
			!!originalReceiver(read.expression.expression, check, true)
		);
	}
	// The same helper can use React APIs if called during render. Preserve
	// calls that are already deferred to an effect or a host click.
	function passesOriginalStore(call: ts.CallExpression, value: ts.Expression, check: ResultCheck) {
		if (
			!check.unchangedHelper ||
			call.questionDotToken ||
			!(ts.isExpressionStatement(call.parent) || ts.isVoidExpression(call.parent)) ||
			!ts.isIdentifier(call.expression) ||
			!call.arguments.includes(value)
		)
			return false;
		const item = checker.getSymbolAtLocation(call.expression)?.declarations?.[0];
		if (!item || !ts.isImportSpecifier(item) || item.isTypeOnly || item.parent.parent.isTypeOnly)
			return false;
		const statement = item.parent.parent.parent;
		const hook = originalReceiver(value, check, true);
		return (
			!statement.attributes &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			!!hook &&
			runsAfterRender(call, hook) &&
			call.arguments.every((arg) => arg === value || plainData(arg) || literalOptions(arg)) &&
			check.unchangedHelper(statement.moduleSpecifier.text, (item.propertyName ?? item.name).text)
		);
	}
	function readsStoreDuringRender(value: ts.Expression, use: ts.Node, check: ResultCheck) {
		return valueReads(
			value,
			checker,
			[],
			() => false,
			(node) =>
				ts.isCallExpression(node) &&
				!node.questionDotToken &&
				ts.isIdentifier(node.expression) &&
				checker.getSymbolAtLocation(node.expression)?.declarations?.[0] === check.item &&
				!runsAfterRender(use, node),
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
		) {
			return (
				!p.type &&
				(ts.isIdentifier(p.name) || !readsStoreDuringRender(value, p, check)) &&
				bound(p.name, check)
			);
		}
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
		if (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) {
			if (p.expression !== value) return false;
			// The provider owns the member. Even retrieving it can execute a getter.
			return (
				!readsStoreDuringRender(value, p, check) &&
				(!ts.isElementAccessExpression(p) || argument(p.argumentExpression, check)) &&
				safe(p, check)
			);
		}
		if (
			ts.isArrayLiteralExpression(p) &&
			ts.isCallExpression(p.parent) &&
			p.parent.arguments[1] === p &&
			reactHook(p.parent.expression, ['useEffect', 'useLayoutEffect', 'useMemo', 'useCallback'])
		)
			return true;
		if (ts.isCallExpression(p)) {
			if (p.expression === value) {
				if (p.arguments.every((arg) => argument(arg, check))) return safe(p, check);
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
				if (
					check.retainedArgument &&
					handle &&
					!p.questionDotToken &&
					ts.isPropertyAccessExpression(value) &&
					!value.questionDotToken &&
					(ts.isExpressionStatement(p.parent) || ts.isVoidExpression(p.parent))
				) {
					const receiver = originalReceiver(value.expression, check, true);
					if (
						receiver &&
						sameEffectSetup(p, receiver) &&
						p.arguments.slice(1).every((arg) => argument(arg, check)) &&
						sharedHandle(handle, check.retainedArgument) === true
					)
						return true;
				}
				return (
					ts.isPropertyAccessExpression(value) &&
					!!originalReceiver(value.expression, check) &&
					!!handle &&
					sharedHandle(handle, check.imported) === true &&
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
			return passesOriginalStore(p, value, check);
		}
		return false;
	}
	return (
		item: ts.ImportSpecifier,
		imported: StoreInputCheck,
		descriptors: ResultCheck['descriptors'],
		unchangedHelper?: ResultCheck['unchangedHelper'],
		retainedArgument?: ResultCheck['retainedArgument'],
	) => {
		const check: ResultCheck = {
			item,
			imported,
			known: new Map(),
			descriptors,
			unchangedHelper,
			retainedArgument,
		};
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
					call.arguments.every((arg) => argument(arg, check, true)) &&
					safe(call, check)
				);
			})
		);
	};
}
