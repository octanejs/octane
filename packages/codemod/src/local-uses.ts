import ts from 'typescript';
import { isWrapper, skipWrappers } from './expression-wrappers.js';
import { localCalls, type Invocation, type CallContext } from './local-calls.js';

export function scalar(type: ts.Type): boolean {
	if (type.isUnion()) return type.types.every(scalar);
	// A primitive intersection keeps its runtime representation, e.g. a branded string ID.
	if (type.isIntersection()) return type.types.some(scalar);
	return !!(
		type.flags &
		(ts.TypeFlags.StringLike |
			ts.TypeFlags.NumberLike |
			ts.TypeFlags.BooleanLike |
			ts.TypeFlags.BigIntLike |
			ts.TypeFlags.Null |
			ts.TypeFlags.Undefined)
	);
}

function localSymbol(checker: ts.TypeChecker, id: ts.Identifier) {
	return ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id
		? checker.getShorthandAssignmentValueSymbol(id.parent)
		: ts.isExportSpecifier(id.parent)
			? checker.getExportSpecifierLocalTargetSymbol(id.parent)
			: checker.getSymbolAtLocation(id);
}

type Key = string | undefined; // An unknown computed key can select any member.
function isMember(node: ts.Node): node is ts.PropertyAccessExpression | ts.ElementAccessExpression {
	return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node);
}

function isLogical(node: ts.Node): node is ts.BinaryExpression {
	return (
		ts.isBinaryExpression(node) &&
		(node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
			node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
			node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
	);
}

// A rest target owns a shallow copy. For array rest, offset is the first copied index.
type Selection = Key | { offset?: number };
type AssignmentSource = { source: ts.Expression; selection: Selection[] };
type VisitSource = (source: ts.Expression, frame?: CallContext, path?: Key[]) => boolean;

function sourcePath(selection: Selection[], path: Key[], writing: boolean): Key[] | undefined {
	for (let i = selection.length - 1; i >= 0; i--) {
		const step = selection[i];
		if (typeof step !== 'object') {
			path = [step, ...path];
		} else {
			if (writing && !path.length) return;
			if (step.offset !== undefined && path.length) {
				const index = path[0];
				path = [
					index !== undefined && /^(0|[1-9]\d*)$/.test(index)
						? String(step.offset + Number(index))
						: undefined,
					...path.slice(1),
				];
			}
		}
	}
	return path;
}

// Bound the number of distinct nested call paths explored for a write or returned value.
const MAX_CALL_CONTEXTS = 64;

type LocalWrites = {
	calls: ReturnType<typeof localCalls>;
	bindings: Map<ts.Symbol, AssignmentSource[]>;
	bindingStep: (d: ts.BindingElement) => Selection;
	selected: (source: ts.Expression, path: Key[]) => ts.Expression | null | undefined;
	arguments: (
		node: ts.Identifier,
		d: ts.Declaration,
		frame: CallContext,
		visit: VisitSource,
	) => boolean | undefined;
	members: (node: ts.Node, visit: VisitSource, frame?: CallContext, path?: Key[]) => boolean;
	hasMemberWrite: (name: ts.Identifier) => boolean;
};
// A file can be queried once per island or store argument. Index its writes once
// for the checker that owns its symbols, and release them with the source file.
const writesByFile = new WeakMap<ts.SourceFile, { checker: ts.TypeChecker; writes: LocalWrites }>();

function localWrites(file: ts.SourceFile, checker: ts.TypeChecker): LocalWrites {
	const cached = writesByFile.get(file);
	if (cached?.checker === checker) return cached.writes;
	const bindings = new Map<ts.Symbol, AssignmentSource[]>();
	const bindingDefaults = new Set<ts.Node>();
	const calls = localCalls(file, checker, (symbol) => bindings.has(symbol));
	const possibleCalls: ts.CallExpression[] = [];
	const members = new Map<
		ts.Symbol,
		(AssignmentSource & { path: Key[]; frame?: CallContext; instance?: CallContext })[]
	>();
	const mutationOnly = new Set<ts.Symbol>();
	const pending: {
		receiver: ts.Expression;
		key: Key | null; // A shallow copy preserves the source's field names.
		source: ts.Expression | undefined;
		selection: Selection[];
	}[] = [];
	const assigns = new Set<ts.CallExpression>();

	function keyOf(node: ts.Expression): Key {
		if (isWrapper(node)) return keyOf(node.expression);
		if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
		if (ts.isIdentifier(node)) {
			const d = localSymbol(checker, node)?.valueDeclaration;
			if (
				d &&
				ts.isVariableDeclaration(d) &&
				d.initializer &&
				ts.isVariableDeclarationList(d.parent) &&
				d.parent.flags & ts.NodeFlags.Const &&
				d.end <= node.pos
			)
				return keyOf(d.initializer);
		}
	}

	function memberKey(node: ts.PropertyAccessExpression | ts.ElementAccessExpression) {
		return ts.isPropertyAccessExpression(node) ? node.name.text : keyOf(node.argumentExpression);
	}

	function bindingStep(d: ts.BindingElement): Selection {
		const index = ts.isArrayBindingPattern(d.parent) ? d.parent.elements.indexOf(d) : undefined;
		if (d.dotDotDotToken) return { offset: index };
		return index === undefined ? propertyName(d.propertyName ?? d.name) : String(index);
	}

	function definitelyPresent(value: ts.Expression): boolean {
		if (isWrapper(value)) return definitelyPresent(value.expression);
		if (ts.isIdentifier(value)) {
			const d = localSymbol(checker, value)?.valueDeclaration;
			return (
				!!d &&
				ts.isVariableDeclaration(d) &&
				!!d.initializer &&
				d.end <= value.pos &&
				ts.isVariableDeclarationList(d.parent) &&
				!!(d.parent.flags & ts.NodeFlags.Const) &&
				definitelyPresent(d.initializer)
			);
		}
		return (
			ts.isLiteralExpression(value) ||
			ts.isObjectLiteralExpression(value) ||
			ts.isArrayLiteralExpression(value) ||
			ts.isNewExpression(value) ||
			ts.isFunctionExpression(value) ||
			ts.isArrowFunction(value) ||
			value.kind === ts.SyntaxKind.TrueKeyword ||
			value.kind === ts.SyntaxKind.FalseKeyword ||
			value.kind === ts.SyntaxKind.NullKeyword
		);
	}

	function inputs(
		d: ts.ParameterDeclaration,
		call: ts.CallExpression,
		path: Key[],
		writing: boolean,
		visit: (arg: ts.Expression, path: Key[]) => boolean,
		fallback: () => boolean,
	): boolean {
		const fn = calls.targets.get(call)!;
		const offset = fn.parameters[0]?.name.getText(file) === 'this' ? 1 : 0;
		let index = fn.parameters.indexOf(d) - offset;
		if (index < 0) return false;
		let many = false;
		if (d.dotDotDotToken) {
			if (!path.length && writing) return false;
			const key = path[0];
			if (key === undefined) many = true;
			else if (/^(0|[1-9]\d*)$/.test(key)) index += Number(key);
			else return false;
			path = path.slice(1);
		}
		let position = 0;
		let uncertain = false;
		let present = false;
		function actual(arg: ts.Expression): boolean {
			if (ts.isSpreadElement(arg)) {
				if (ts.isArrayLiteralExpression(arg.expression))
					return arg.expression.elements.some(actual);
				// An unknown iterable can supply any remaining slot, including none.
				uncertain = true;
				return (many || position <= index) && visit(arg.expression, [undefined, ...path]);
			}
			const slot = position++;
			if (d.initializer && !uncertain && slot === index) present = definitelyPresent(arg);
			const matches = many
				? uncertain || slot >= index
				: slot === index || (uncertain && slot < index);
			return matches && visit(arg, path);
		}
		return call.arguments.some(actual) || (!!d.initializer && !present && fallback());
	}

	function argumentSources(
		node: ts.Identifier,
		declaration: ts.Declaration,
		frame: CallContext,
		visit: VisitSource,
	): boolean | undefined {
		let d = declaration;
		let path: Key[] | undefined = [];
		let ref: ts.Node = node;
		while (
			(isMember(ref.parent) && ref.parent.expression === ref) ||
			(isWrapper(ref.parent) && ref.parent.expression === ref)
		) {
			ref = ref.parent;
			if (isMember(ref)) path.push(memberKey(ref));
		}
		const defaults: ts.Expression[] = [];
		while (path && ts.isBindingElement(d)) {
			if (d.initializer) defaults.push(d.initializer);
			path = sourcePath([bindingStep(d)], path, false);
			d = d.parent.parent;
		}
		if (!path || !ts.isParameter(d)) return;
		if (defaults.some((value) => visit(value, frame))) return true;
		const invocation = calls.enclosing(frame, d.parent);
		const read = (call: ts.CallExpression) =>
			inputs(
				d,
				call,
				path!,
				false,
				(arg, keys) => visit(arg, invocation?.outer ?? null, keys),
				() => visit(d.initializer!, frame),
			);
		return invocation ? read(invocation.call) : calls.sites(d.parent).some(read);
	}

	// Visit the storage locations a local reference may name, including a binding's
	// initializer and subsequent assignments. Unknown computed keys match any field.
	function locations(
		node: ts.Node,
		path: Key[],
		writing: boolean,
		match: (root: ts.Symbol, path: Key[], instance?: CallContext) => boolean,
		initial?: CallContext,
		unbound?: (fn: ts.SignatureDeclaration) => void,
	): boolean {
		const states = new Map<
			CallContext,
			{ active: Set<ts.Symbol>; visited: Map<ts.Symbol, Set<string>> }
		>();
		const activeReturns = new Set<ts.CallExpression>();
		const joinedReturns = new Map<ts.CallExpression, Set<string>>();
		let returnVisits = 0;
		function trace(node: ts.Node, path: Key[], frame: CallContext): boolean {
			if (isWrapper(node)) return trace(node.expression, path, frame);
			if (isMember(node)) {
				return trace(node.expression, [memberKey(node), ...path], frame);
			}
			if (ts.isCallExpression(node) && assigns.has(node)) {
				// Object.assign returns the target. Its source objects only share nested values.
				return node.arguments.some(
					(arg, i) => (i === 0 || path.length > 0) && trace(arg, path, frame),
				);
			}
			if (ts.isCallExpression(node)) {
				const fn = calls.targets.get(node);
				if (fn && !activeReturns.has(node)) {
					const joined = frame === null || ++returnVisits > MAX_CALL_CONTEXTS;
					if (joined) {
						const key = JSON.stringify(path);
						let paths = joinedReturns.get(node);
						if (paths?.has(key)) return false;
						if (!paths) joinedReturns.set(node, (paths = new Set()));
						paths.add(key);
					}
					activeReturns.add(node);
					const next = joined ? null : calls.frame(node, frame);
					const found = calls.returns(fn).some((result) => trace(result, path, next));
					activeReturns.delete(node);
					return found;
				}
			}
			if (ts.isConditionalExpression(node))
				return trace(node.whenTrue, path, frame) || trace(node.whenFalse, path, frame);
			if (isLogical(node)) return trace(node.left, path, frame) || trace(node.right, path, frame);
			if ((path.length || !writing) && ts.isArrayLiteralExpression(node)) {
				const [index, ...rest] = path;
				if (index === undefined || node.elements.some(ts.isSpreadElement)) {
					return node.elements.some((el) =>
						ts.isSpreadElement(el)
							? trace(el.expression, [undefined, ...rest], frame)
							: trace(el, rest, frame),
					);
				}
				const item = /^(0|[1-9]\d*)$/.test(index) && node.elements[Number(index)];
				return !!item && trace(item, rest, frame);
			}
			if ((path.length || !writing) && ts.isObjectLiteralExpression(node)) {
				const [key, ...rest] = path;
				return node.properties.some((field) => {
					if (ts.isSpreadAssignment(field)) return trace(field.expression, path, frame);
					if (!ts.isPropertyAssignment(field) && !ts.isShorthandPropertyAssignment(field))
						return false;
					const name = propertyName(field.name);
					return (
						(key === undefined || name === undefined || key === name) &&
						trace(ts.isPropertyAssignment(field) ? field.initializer : field.name, rest, frame)
					);
				});
			}
			if (!ts.isIdentifier(node)) return false;
			const symbol = localSymbol(checker, node);
			let state = states.get(frame);
			if (!state) {
				state = { active: new Set(), visited: new Map() };
				states.set(frame, state);
			}
			const { active, visited } = state;
			if (!symbol || active.has(symbol)) return false;
			// Conditional aliases can name exponentially many paths. After 64 distinct
			// paths on one binding, keep the first field and depth and allow any nested keys.
			let paths = visited.get(symbol);
			if (!paths) {
				paths = new Set();
				visited.set(symbol, paths);
			}
			const exact = JSON.stringify(path);
			const group = path.length + ':' + JSON.stringify(path[0]);
			if (paths.has(exact) || paths.has(group)) return false;
			if (paths.size >= 64 && path.length > 1) {
				paths.add(group);
				path = [path[0], ...Array<Key>(path.length - 1).fill(undefined)];
			} else paths.add(exact);
			let d = symbol.valueDeclaration;
			const invocation = frame && d && calls.enclosing(frame, calls.owner(d));
			// A helper's parameters and locals are fresh at each invocation.
			if (match(symbol, path, invocation)) return true;
			if (d?.getSourceFile() !== file) return false;
			active.add(symbol);
			let from: Key[] | undefined = path;
			while (from && ts.isBindingElement(d)) {
				if (d.initializer && trace(d.initializer, from, frame)) return true;
				from = sourcePath([bindingStep(d)], from, writing);
				d = d.parent.parent;
			}
			let found = false;
			if (from && (ts.isVariableDeclaration(d) || ts.isParameter(d))) {
				if (ts.isParameter(d)) {
					const parameter = d;
					if (invocation)
						found = inputs(
							parameter,
							invocation.call,
							from,
							writing,
							(arg, keys) => trace(arg, keys, invocation.outer),
							() => trace(parameter.initializer!, from!, frame),
						);
					else {
						if (frame === null) {
							found = calls.sites(d.parent).some((call) =>
								inputs(
									parameter,
									call,
									from!,
									writing,
									(arg, keys) => trace(arg, keys, null),
									() => trace(parameter.initializer!, from!, null),
								),
							);
						} else unbound?.(d.parent);
						if (d.initializer) found ||= trace(d.initializer, from, frame);
					}
				} else if (d.initializer) found = trace(d.initializer, from, frame);
				const list = d.parent;
				if (ts.isVariableDeclarationList(list) && ts.isForOfStatement(list.parent))
					found ||= trace(list.parent.expression, [undefined, ...from], frame);
			}
			found ||= !!bindings.get(symbol)?.some(({ source, selection }) => {
				const origin = sourcePath(selection, path, writing);
				return origin !== undefined && trace(source, origin, frame);
			});
			active.delete(symbol);
			return found;
		}
		return trace(node, path, initial);
	}

	function propertyName(name: ts.PropertyName | ts.BindingName): Key {
		if (ts.isComputedPropertyName(name)) return keyOf(name.expression);
		if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name))
			return name.text;
	}

	// Only direct statement copies consume the RHS without exposing it as the
	// result of an assignment expression. Its statement also pins execution order.
	function copyStatement(read: ts.Node, objectOnly = false): ts.Statement | undefined {
		while (isWrapper(read.parent)) read = read.parent;
		const copy = read.parent;
		if (
			ts.isVariableDeclaration(copy) &&
			copy.initializer === read &&
			(ts.isObjectBindingPattern(copy.name) || (!objectOnly && ts.isArrayBindingPattern(copy.name)))
		) {
			return ts.isVariableStatement(copy.parent.parent) ? copy.parent.parent : undefined;
		}
		if (
			!ts.isBinaryExpression(copy) ||
			copy.right !== read ||
			copy.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
			!(
				ts.isObjectLiteralExpression(copy.left) ||
				(!objectOnly && ts.isArrayLiteralExpression(copy.left))
			)
		)
			return;
		let result: ts.Node = copy;
		while (isWrapper(result.parent)) result = result.parent;
		return ts.isExpressionStatement(result.parent) ? result.parent : undefined;
	}

	// A local array can have a custom iterator, and a missing key can be inherited.
	// Narrow those reads only while the literal stays in tracked data operations.
	let references: ReturnType<typeof localUses> | undefined;
	// Prototype access and eval can change what these locals expose without a
	// statically visible use of the receiver.
	let dynamicAccess = false;
	function plainField(field: ts.ObjectLiteralElementLike): boolean {
		if (!ts.isPropertyAssignment(field) && !ts.isShorthandPropertyAssignment(field)) return false;
		const name = propertyName(field.name);
		return name !== undefined && name !== '__proto__';
	}
	function confined(literal: ts.Expression, read: ts.Node, seen = new Set<ts.Node>()): boolean {
		if (dynamicAccess || !copyStatement(read)) return false;
		function local(value: ts.Node): boolean {
			if (value === read || seen.has(value)) return true;
			seen.add(value);
			const parent = value.parent;
			if (isWrapper(parent)) return local(parent);
			if (isMember(parent) && parent.expression === value) {
				const key = memberKey(parent);
				return key !== undefined && !(key in Object.prototype) && key !== 'length' && local(parent);
			}
			if (
				ts.isBinaryExpression(parent) &&
				parent.left === value &&
				isMember(value) &&
				parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
			)
				return true;
			if (
				(ts.isPropertyAssignment(parent) && parent.initializer === value) ||
				(ts.isShorthandPropertyAssignment(parent) && parent.name === value)
			)
				return (
					ts.isObjectLiteralExpression(parent.parent) &&
					parent.parent.properties.every(plainField) &&
					local(parent.parent)
				);
			if (
				ts.isVariableDeclaration(parent) &&
				parent.initializer === value &&
				ts.isIdentifier(parent.name) &&
				ts.isVariableDeclarationList(parent.parent) &&
				parent.parent.flags & ts.NodeFlags.Const &&
				!(ts.getCombinedModifierFlags(parent) & ts.ModifierFlags.Export)
			) {
				references ??= localUses(file, checker);
				return references(parent.name).every(local);
			}
			return false;
		}
		if (local(literal)) return true;
		// Discard tentative paths when any use of this literal escaped.
		seen.clear();
		return false;
	}

	// A parent replacement can supply a child. Return its value, null for a
	// missing property, or undefined to inspect the whole source when the read is opaque.
	function selected(
		source: ts.Expression,
		path: Key[],
		read?: ts.Expression,
		confinedNodes?: Set<ts.Node>,
	): ts.Expression | null | undefined {
		const origin = read ?? source;
		function selectMember(
			access: ts.PropertyAccessExpression | ts.ElementAccessExpression,
			rest: Key[],
		) {
			return selected(
				access.expression,
				[memberKey(access), ...rest],
				origin,
				(confinedNodes ??= new Set()),
			);
		}
		function scalarField(annotation: ts.TypeNode, start: number): boolean {
			let type = checker.getTypeAtLocation(annotation);
			for (let i = start; i < path.length; i++) {
				const key = path[i];
				const field = key === undefined ? undefined : type.getProperty(key);
				if (!field) return false;
				type = checker.getTypeOfSymbolAtLocation(field, annotation);
			}
			return scalar(type);
		}
		for (const [i, key] of path.entries()) {
			if (key === undefined) return;
			while (isWrapper(source) || ts.isIdentifier(source)) {
				if (isWrapper(source)) {
					if (
						'type' in source &&
						!ts.isConstTypeReference(source.type) &&
						!scalarField(source.type, i)
					)
						return;
					source = source.expression;
					continue;
				}
				const symbol = localSymbol(checker, source);
				const d = symbol?.valueDeclaration;
				if (
					!symbol ||
					!d ||
					!ts.isVariableDeclaration(d) ||
					!d.initializer ||
					d.getSourceFile() !== file ||
					d.end > source.pos ||
					!ts.isVariableDeclarationList(d.parent) ||
					!(d.parent.flags & ts.NodeFlags.Const) ||
					bindings.has(symbol) ||
					(d.type && !scalarField(d.type, i))
				)
					return;
				source = d.initializer;
			}
			if (isMember(source)) return selectMember(source, path.slice(i));
			if (ts.isArrayLiteralExpression(source)) {
				if (
					!/^(0|[1-9]\d*)$/.test(key) ||
					source.elements.some(ts.isSpreadElement) ||
					!confined(source, origin, confinedNodes)
				)
					return;
				const item = source.elements[Number(key)];
				if (!item || ts.isOmittedExpression(item)) return;
				source = item;
				continue;
			}
			if (
				!ts.isObjectLiteralExpression(source) ||
				(read && !confined(source, origin, confinedNodes))
			)
				return;
			let value: ts.Expression | undefined;
			for (const field of source.properties) {
				if (!ts.isPropertyAssignment(field) && !ts.isShorthandPropertyAssignment(field)) return;
				const name = propertyName(field.name);
				if (name === undefined) return;
				if (name === key) value = ts.isPropertyAssignment(field) ? field.initializer : field.name;
			}
			if (!value) {
				if (
					i === path.length - 1 &&
					!(key in Object.prototype) &&
					confined(source, origin, confinedNodes)
				)
					return null;
				return;
			}
			source = value;
		}
		if (isMember(source)) {
			const projected = selectMember(source, []);
			if (projected !== undefined) return projected;
		}
		return source;
	}

	function consumingUse(node: ts.Node): boolean {
		// Check a reference at its consuming use. Its receiver or alias initializer
		// alone would select the whole object and incorrectly include sibling writes.
		let outer: ts.Node = node;
		// Follow only value-bearing edges. Conditions and computed property names are
		// separate reads, and an opaque call can consume its entire argument.
		for (;;) {
			const parent = outer.parent;
			if (
				(ts.isPropertyAssignment(parent) && parent.initializer === outer) ||
				(ts.isShorthandPropertyAssignment(parent) &&
					parent.name === outer &&
					!parent.objectAssignmentInitializer)
			)
				outer = parent.parent;
			else if (
				(isWrapper(parent) && parent.expression === outer) ||
				(ts.isCallExpression(parent) &&
					((assigns.has(parent) && parent.arguments[0] === outer) ||
						calls.forwardedArgument(parent) === outer)) ||
				ts.isArrayLiteralExpression(parent) ||
				isLogical(parent) ||
				(ts.isConditionalExpression(parent) &&
					(parent.whenTrue === outer || parent.whenFalse === outer))
			)
				outer = parent;
			else break;
		}
		const p = outer.parent;
		return !(
			(isMember(p) && p.expression === outer) ||
			ts.isVariableDeclaration(p) ||
			ts.isParameter(p) ||
			ts.isBindingElement(p) ||
			bindingDefaults.has(outer) ||
			(ts.isBinaryExpression(p) &&
				p.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
				ts.isIdentifier(p.left) &&
				ts.isExpressionStatement(p.parent))
		);
	}

	// A field replacement cannot change a scalar already copied from a fresh
	// receiver in this execution. Shared receivers can survive another iteration or call.
	function afterSnapshot(
		root: ts.Symbol,
		read: ts.Node,
		key: string,
		source: ts.Expression,
		projected: boolean,
	): boolean {
		const write = source.parent;
		if (
			!ts.isBinaryExpression(write) ||
			write.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
			write.right !== source ||
			!isMember(write.left) ||
			!ts.isExpressionStatement(write.parent)
		)
			return false;
		if (!projected) {
			const d = ts.isIdentifier(read) && localSymbol(checker, read)?.valueDeclaration;
			if (!d || !ts.isBindingElement(d) || d.initializer || bindingStep(d) !== key) return false;
			const owner = d.parent.parent;
			if (
				!ts.isVariableDeclaration(owner) ||
				!owner.initializer ||
				!ts.isVariableDeclarationList(owner.parent) ||
				!(owner.parent.flags & ts.NodeFlags.Const) ||
				!ts.isIdentifier(owner.initializer) ||
				localSymbol(checker, owner.initializer) !== root
			)
				return false;
			read = owner.initializer;
		}
		if (write.pos <= read.end) return false;
		const scope = write.parent.parent;
		const d = root.valueDeclaration;
		if (
			!d ||
			!ts.isVariableDeclaration(d) ||
			!d.initializer ||
			!ts.isObjectLiteralExpression(d.initializer) ||
			!ts.isVariableDeclarationList(d.parent) ||
			!(d.parent.flags & ts.NodeFlags.Const) ||
			bindings.has(root) ||
			!ts.isVariableStatement(d.parent.parent) ||
			d.parent.parent.parent !== scope
		)
			return false;
		if (copyStatement(read, true)?.parent !== scope || !confined(d.initializer, read)) return false;
		const value = selected(d.initializer, [key]);
		return !!value && scalar(checker.getTypeAtLocation(skipWrappers(value)));
	}

	function memberSources(
		node: ts.Node,
		visit: VisitSource,
		frame?: CallContext,
		selectionPath?: Key[],
	): boolean {
		if (!members.size || (!selectionPath && !consumingUse(node))) return false;

		return locations(
			node,
			selectionPath ?? [],
			false,
			(root, read, instance) =>
				!!members
					.get(root)
					?.some(({ path, source, selection, frame: originFrame, instance: written }) => {
						const sourceFrame = calls.atRead(originFrame, written, instance);
						if (sourceFrame === false) return false;
						if (
							!path.every((key, i) => key === undefined || read[i] === undefined || key === read[i])
						)
							return false;
						if (
							(!selectionPath || selectionPath.length === 1) &&
							read.length === 1 &&
							path.length === 1 &&
							path[0] !== undefined &&
							path[0] === read[0] &&
							afterSnapshot(root, node, path[0], source, !!selectionPath)
						)
							return false;
						const origin = sourcePath(selection, read.slice(path.length), false)!;
						return visit(source, sourceFrame === undefined ? frame : sourceFrame, origin);
					}),
			frame,
		);
	}

	function record(target: ts.Node, source: ts.Expression | undefined, selection: Selection[]) {
		if (ts.isIdentifier(target)) {
			if (!source) return;
			const symbol = localSymbol(checker, target);
			if (symbol) {
				const values = bindings.get(symbol);
				if (values) values.push({ source, selection });
				else bindings.set(symbol, [{ source, selection }]);
			}
		} else if (isMember(target)) {
			pending.push({ receiver: target.expression, key: memberKey(target), source, selection });
		} else if (ts.isArrayLiteralExpression(target)) {
			target.elements.forEach((entry, index) => {
				if (ts.isSpreadElement(entry))
					record(entry.expression, source, [...selection, { offset: index }]);
				else record(entry, source, [...selection, String(index)]);
			});
		} else if (ts.isObjectLiteralExpression(target)) {
			for (const field of target.properties) {
				if (ts.isSpreadAssignment(field)) record(field.expression, source, [...selection, {}]);
				else if (ts.isPropertyAssignment(field))
					record(field.initializer, source, [...selection, propertyName(field.name)]);
				else if (ts.isShorthandPropertyAssignment(field)) {
					record(field.name, source, [...selection, field.name.text]);
					if (field.objectAssignmentInitializer) {
						bindingDefaults.add(field.objectAssignmentInitializer);
						record(field.name, field.objectAssignmentInitializer, []);
					}
				}
			}
		} else if (
			ts.isBinaryExpression(target) &&
			target.operatorToken.kind === ts.SyntaxKind.EqualsToken
		) {
			// scan also visits the default and records its right side as a binding source.
			if (ts.isIdentifier(target.left)) bindingDefaults.add(target.right);
			record(target.left, source, selection);
		} else if (isWrapper(target)) {
			record(target.expression, source, selection);
		}
	}

	function recordObjectWrite(node: ts.CallExpression) {
		const method = skipWrappers(node.expression);
		const receiver = node.arguments[0];
		if (!receiver || !isMember(method)) return;
		const object = skipWrappers(method.expression);
		if (!ts.isIdentifier(object) || (object.text !== 'Object' && object.text !== 'Reflect')) return;
		const methodName = memberKey(method);
		const symbol = localSymbol(checker, object);
		const builtin = symbol?.valueDeclaration?.getSourceFile().hasNoDefaultLib;
		if (
			(object.text === 'Object' &&
				builtin &&
				(methodName === 'defineProperty' ||
					methodName === 'defineProperties' ||
					methodName === 'setPrototypeOf')) ||
			(object.text === 'Reflect' &&
				(!symbol || builtin) &&
				(methodName === 'set' ||
					methodName === 'defineProperty' ||
					methodName === 'deleteProperty' ||
					methodName === 'setPrototypeOf'))
		) {
			pending.push({ receiver, key: null, source: undefined, selection: [] });
			if (object.text === 'Reflect' && methodName === 'set' && node.arguments[3])
				pending.push({ receiver: node.arguments[3], key: null, source: undefined, selection: [] });
			return;
		}
		if (object.text !== 'Object' || methodName !== 'assign' || !builtin) return;
		assigns.add(node);
		function copy(source: ts.Expression) {
			source = skipWrappers(source);
			if (!ts.isObjectLiteralExpression(source)) {
				pending.push({ receiver, key: null, source, selection: [] });
				return;
			}
			for (const field of source.properties) {
				if (ts.isSpreadAssignment(field)) copy(field.expression);
				else {
					const key = propertyName(field.name);
					const value = ts.isPropertyAssignment(field)
						? field.initializer
						: ts.isShorthandPropertyAssignment(field)
							? field.name
							: source;
					pending.push({ receiver, key, source: value, selection: [] });
				}
			}
		}
		for (let i = 1; i < node.arguments.length; i++) copy(node.arguments[i]);
	}

	function scan(node: ts.Node) {
		if (!dynamicAccess && (ts.isIdentifier(node) || ts.isStringLiteralLike(node))) {
			dynamicAccess =
				node.text === 'eval' ||
				node.text === 'prototype' ||
				node.text === '__proto__' ||
				node.text === 'getPrototypeOf';
		}
		if (ts.isCallExpression(node)) {
			possibleCalls.push(node);
			recordObjectWrite(node);
		}
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
			node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
		) {
			record(node.left, node.right, []);
		} else if (ts.isDeleteExpression(node)) {
			record(node.expression, undefined, []);
		} else if (
			(ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
			(node.operator === ts.SyntaxKind.PlusPlusToken ||
				node.operator === ts.SyntaxKind.MinusMinusToken)
		) {
			record(node.operand, undefined, []);
		} else if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
			// for-in supplies string keys, but defaults in its binding pattern can still run.
			if (!ts.isVariableDeclarationList(node.initializer))
				record(node.initializer, ts.isForOfStatement(node) ? node.expression : undefined, [
					undefined,
				]);
		}
		ts.forEachChild(node, scan);
	}
	scan(file);
	if (pending.length) for (const call of possibleCalls) calls.scan(call);
	for (const { receiver, key, source, selection } of pending) {
		const indexed = new Set<CallContext>();
		function append(frame: Invocation | undefined, call: ts.CallExpression): Invocation {
			return frame ? calls.frame(frame.call, append(frame.outer, call)) : calls.frame(call);
		}
		function index(frame?: CallContext) {
			if (indexed.has(frame)) return;
			// One pair of helpers can call each other on exponentially many paths.
			// Join their possible arguments when exact call-site indexing exceeds the file budget.
			if (frame?.outer && indexed.size >= MAX_CALL_CONTEXTS) {
				index(null);
				return;
			}
			indexed.add(frame);
			const missing = new Set<ts.CallExpression>();
			locations(
				receiver,
				[],
				true,
				(root, location, instance) => {
					if (!source) {
						mutationOnly.add(root);
						return false;
					}
					const path = key === null ? location : [...location, key];
					const values = members.get(root);
					const entry = { path, source, selection, frame, instance };
					if (values) values.push(entry);
					else members.set(root, [entry]);
					return false;
				},
				frame,
				(fn) => {
					if (calls.enclosing(frame, fn)) return;
					for (const call of calls.sites(fn)) missing.add(call);
				},
			);
			for (const call of missing) index(append(frame ?? undefined, call));
		}
		const owner = calls.owner(receiver);
		const sites = owner && calls.sites(owner);
		if (sites?.length) for (const call of sites) index(calls.frame(call));
		else index();
	}
	const writes = {
		calls,
		selected,
		bindingStep,
		arguments: argumentSources,
		bindings,
		members: memberSources,
		hasMemberWrite: (name: ts.Identifier) =>
			(members.size > 0 || mutationOnly.size > 0) &&
			locations(name, [], false, (root) => members.has(root) || mutationOnly.has(root)),
	};
	writesByFile.set(file, { checker, writes });
	return writes;
}

export function hasLocalMemberWrite(name: ts.Identifier, checker: ts.TypeChecker) {
	return localWrites(name.getSourceFile(), checker).hasMemberWrite(name);
}

/** Inspect syntax and the declarations and assignments supplying its values in this module.
 * Returning false skips a subtree; undefined follows its children and local values. */
export function walkLocalValues(
	root: ts.Node,
	checker: ts.TypeChecker,
	inspect: (node: ts.Node, visit: (node: ts.Node) => boolean) => boolean | undefined,
): boolean {
	const file = root.getSourceFile();
	const states = new Map<
		CallContext,
		{
			seen: Set<ts.Node>;
			followed: Set<ts.Symbol>;
			selections: Map<ts.Node, Set<string>>;
		}
	>();
	function walk(node: ts.Node, frame?: CallContext, path?: Key[]): boolean {
		let state = states.get(frame);
		if (!state) {
			state = { seen: new Set(), followed: new Set(), selections: new Map() };
			states.set(frame, state);
		}
		const { seen, followed, selections } = state;
		if (path?.length && ts.isExpression(node)) {
			const writes = localWrites(file, checker);
			const value = writes.selected(node, path);
			if (value !== undefined) {
				// A source can supply multiple fields, including through cyclic assignments.
				let paths = selections.get(node);
				if (!paths) selections.set(node, (paths = new Set()));
				// A branching chain of destructuring assignments can supply exponentially
				// many paths. Join them into a whole-object read after 64 selections.
				const key = paths.size < 64 ? JSON.stringify(path) : 'all';
				if (paths.has(key)) return false;
				paths.add(key);
				if (key === 'all') return writes.members(node, walk, frame, []) || walk(node, frame);
				return writes.members(node, walk, frame, path) || (!!value && walk(value, frame));
			}
		}
		const visit = (child: ts.Node) => walk(child, frame);
		if (seen.has(node)) return false;
		seen.add(node);
		const result = inspect(node, visit);
		if (result !== undefined) return result;
		if (ts.isCallExpression(node)) {
			const writes = localWrites(file, checker);
			const fn = writes.calls.targets.get(node);
			if (fn?.body) {
				if (writes.calls.forwardedArgument(node)) return node.arguments.some(visit);
				const context =
					frame === null || states.size > MAX_CALL_CONTEXTS || writes.calls.enclosing(frame, fn)
						? null
						: writes.calls.frame(node, frame);
				return walk(fn.body, context) || node.arguments.some(visit);
			}
		}
		if (ts.isIdentifier(node) || isMember(node)) {
			const writes = localWrites(file, checker);
			if (writes.members(node, walk, frame)) return true;
			if (ts.isIdentifier(node)) {
				const symbol = localSymbol(checker, node);
				const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
				const actual =
					frame !== undefined && declaration
						? writes.arguments(node, declaration, frame, walk)
						: undefined;
				if (actual) return true;
				if (symbol && declaration?.getSourceFile() === file && !followed.has(symbol)) {
					followed.add(symbol);
					if (
						(actual === undefined && visit(declaration)) ||
						writes.bindings
							.get(symbol)
							?.some(({ source, selection }) =>
								walk(source, frame, sourcePath(selection, [], false)),
							)
					)
						return true;
				}
			}
		}
		// Destructuring stores defaults on individual bindings; its value comes from the owner.
		let owner = node;
		let selectedPath: Key[] | undefined;
		while (ts.isBindingElement(owner)) {
			if (owner.initializer && walk(owner.initializer, frame, selectedPath)) return true;
			selectedPath = sourcePath(
				[localWrites(file, checker).bindingStep(owner)],
				selectedPath ?? [],
				false,
			);
			owner = owner.parent.parent;
		}
		if (ts.isVariableDeclaration(owner) || ts.isParameter(owner)) {
			if (owner.initializer && walk(owner.initializer, frame, selectedPath)) return true;
			const list = owner.parent;
			// for-of (including for-await-of) yields iterable values; for-in yields property names.
			if (
				ts.isVariableDeclarationList(list) &&
				ts.isForOfStatement(list.parent) &&
				visit(list.parent.expression)
			)
				return true;
		}
		return !!ts.forEachChild(node, visit);
	}
	return walk(root);
}

/** Values that can cross a renderer boundary, optionally including a verified original store input. */
type ImportedArgument = (module: string, name: string) => boolean | 'reject';

export function portableArguments(
	checker: ts.TypeChecker,
	typeOf: (expr: ts.Expression) => ts.Type,
) {
	function argument(expr: ts.Expression, imported?: ImportedArgument): boolean {
		if (
			ts.isParenthesizedExpression(expr) ||
			ts.isSatisfiesExpression(expr) ||
			ts.isNonNullExpression(expr)
		)
			return argument(expr.expression, imported);
		if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr))
			return argument(expr.expression, imported);
		if (ts.isConditionalExpression(expr))
			return argument(expr.whenTrue, imported) && argument(expr.whenFalse, imported);
		if (ts.isBinaryExpression(expr)) {
			const op = expr.operatorToken.kind;
			if (op === ts.SyntaxKind.AmpersandAmpersandToken)
				return scalar(typeOf(expr.left)) && argument(expr.right, imported);
			if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken)
				return argument(expr.left, imported) && argument(expr.right, imported);
			if (op === ts.SyntaxKind.CommaToken) return argument(expr.right, imported);
		}
		if (ts.isArrayLiteralExpression(expr))
			return expr.elements.every((el) => argument(el, imported));
		if (ts.isObjectLiteralExpression(expr))
			return expr.properties.every((p) =>
				ts.isShorthandPropertyAssignment(p)
					? !p.objectAssignmentInitializer && argument(p.name, imported)
					: ts.isPropertyAssignment(p) &&
						!ts.isComputedPropertyName(p.name) &&
						argument(p.initializer, imported),
			);
		if (ts.isIdentifier(expr)) {
			const symbol = localSymbol(checker, expr);
			const declaration = symbol?.valueDeclaration;
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
			const d = imported && symbol?.declarations?.[0];
			if (
				imported &&
				d &&
				ts.isImportSpecifier(d) &&
				!d.isTypeOnly &&
				!d.parent.parent.isTypeOnly
			) {
				const importDeclaration = d.parent.parent.parent;
				const spec = importDeclaration.moduleSpecifier;
				if (ts.isStringLiteral(spec)) {
					const verdict = imported(spec.text, (d.propertyName ?? d.name).text);
					if (verdict === 'reject') return false;
					if (verdict && !importDeclaration.attributes) return true;
				}
			}
		}
		if (ts.isCallExpression(expr) && !expr.arguments.every((arg) => argument(arg, imported)))
			return false;
		return scalar(typeOf(expr));
	}
	const clean = new Map<ts.Expression, boolean>();
	return (expr: ts.Expression, imported?: ImportedArgument) => {
		if (!argument(expr, imported)) return false;
		let safe = clean.get(expr);
		if (safe === undefined) {
			safe = !walkLocalValues(expr, checker, (n) =>
				ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)
					? true
					: undefined,
			);
			clean.set(expr, safe);
		}
		return safe;
	};
}

export function localUses(file: ts.SourceFile, checker: ts.TypeChecker) {
	const refs = new Map<ts.Symbol, ts.Identifier[]>();

	function visit(node: ts.Node) {
		if (ts.isIdentifier(node)) {
			const binding = localSymbol(checker, node);
			if (binding) {
				const ids = refs.get(binding);
				if (ids) ids.push(node);
				else refs.set(binding, [node]);
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(file);
	return (id: ts.Identifier) =>
		(refs.get(localSymbol(checker, id)!) ?? []).filter((ref) => ref !== id);
}
