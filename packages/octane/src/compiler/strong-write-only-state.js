// A state tuple whose value and getter are never read has one observable
// effect: its setter schedules a render. That is a hand-rolled external-store
// subscription without useSyncExternalStore's tearing check, subscription-time
// re-check, or server snapshot. This read-only source check uses the shared
// Strong hook graph, so hook aliases, namespace imports, and shadowing agree
// with every other Strong analysis.

export const STRONG_WRITE_ONLY_STATE = 'OCTANE_STRONG_WRITE_ONLY_STATE';

const STATE_HOOKS = new Set(['useState', 'useReducer', 'useLinkedState']);
const TRANSPARENT = new Set([
	'ChainExpression',
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSInstantiationExpression',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);
const SKIP_KEYS = new Set([
	'type',
	'start',
	'end',
	'loc',
	'range',
	'parent',
	'metadata',
	'comments',
	'tokens',
	'typeAnnotation',
	'returnType',
	'typeParameters',
]);
const MESSAGE =
	'Strong mode does not allow write-only state. Nothing reads this state value or its getter, so the setter only forces a re-render. Subscribe to external data with useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) and render its snapshot, or remove the unused state.';

function unwrap(node) {
	let value = node;
	while (value && TRANSPARENT.has(value.type)) value = value.expression;
	return value;
}

function resolveBinding(scope, name) {
	for (let current = scope; current != null; current = current.parent) {
		const binding = current.bindings.get(name);
		if (binding !== undefined) return binding;
	}
	return null;
}

// Tuple positions spelled as literal keys: `[1]`, `{ 1: set }`, or `{ '1': set }`.
function staticIndex(node, computed) {
	const key = unwrap(node);
	const value = key?.type === 'Literal' ? key.value : computed ? undefined : key?.name;
	for (const index of [0, 1, 2]) if (value === index || value === String(index)) return index;
	return null;
}

/**
 * @param {any} ast
 * @param {{ analysis: any, callNames: Map<any, string> }} strongHookAnalysis
 * @param {(code: string, node: any, message: string) => any} diagnostic
 */
export function analyzeStrongWriteOnlyState(ast, strongHookAnalysis, diagnostic) {
	const { analysis, callNames } = strongHookAnalysis;
	const bindingOf = (pattern, bindings) => {
		const identifier = pattern?.type === 'AssignmentPattern' ? pattern.left : pattern;
		if (identifier?.type !== 'Identifier') return undefined;
		return bindings.find((entry) => entry.pattern === identifier)?.binding ?? null;
	};
	const candidates = [];
	for (const { decl, bindings } of analysis.declarators) {
		const init = unwrap(decl.init);
		const call = unwrap(init?.type === 'MemberExpression' ? init.object : init);
		if (call?.type !== 'CallExpression' || !STATE_HOOKS.has(callNames.get(call))) continue;
		const id = decl.id;
		// Each role is absent, a binding to check, or an arbitrary read (undefined).
		let value = null;
		let setter;
		let getter = null;
		if (init !== call) {
			// `useState(0)[1]` discards the value and the getter.
			if (id?.type !== 'Identifier' || staticIndex(init.property, init.computed) !== 1) continue;
			setter = bindingOf(id, bindings);
		} else if (id?.type === 'ArrayPattern') {
			const elements = id.elements ?? [];
			if (elements.some((element) => element?.type === 'RestElement')) continue;
			value = elements[0] == null ? null : bindingOf(elements[0], bindings);
			setter = elements[1] == null ? undefined : bindingOf(elements[1], bindings);
			getter = elements[2] == null ? null : bindingOf(elements[2], bindings);
		} else if (id?.type === 'ObjectPattern') {
			let unknown = false;
			for (const property of id.properties ?? []) {
				const index =
					property.type === 'Property' ? staticIndex(property.key, property.computed) : null;
				if (index === 0) value = bindingOf(property.value, bindings);
				else if (index === 1) setter = bindingOf(property.value, bindings);
				else if (index === 2) getter = bindingOf(property.value, bindings);
				else unknown = true;
			}
			if (unknown) continue;
		} else {
			continue;
		}
		if (setter == null || value === undefined || getter === undefined) continue;
		candidates.push({ node: id, decl, value, setter, getter, read: false, written: false });
	}
	if (candidates.length === 0) return [];

	const roles = new Map();
	const names = new Set();
	for (const candidate of candidates) {
		for (const binding of [candidate.setter, candidate.value, candidate.getter]) {
			if (binding === null) continue;
			roles.set(binding, { candidate, setter: binding === candidate.setter });
			names.add(binding.name);
		}
	}
	const roleOf = (identifier) =>
		roles.get(resolveBinding(analysis.nodeScopes.get(identifier), identifier.name));

	// Reads inside the tuple's own setter arguments only compute the next write.
	// A tuple whose setter is never referenced is unused, not write-only.
	function scan(node, parent, key, writing) {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) scan(child, parent, key, writing);
			return;
		}
		if (node.type?.startsWith('TS') && !TRANSPARENT.has(node.type)) return;
		if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
			if (
				names.has(node.name) &&
				(node.type === 'Identifier' ? reference(parent, key) : jsxReference(node, parent, key))
			) {
				const role = roleOf(node);
				if (role?.setter) role.candidate.written = true;
				else if (role !== undefined && !writing?.has(role.candidate)) role.candidate.read = true;
			}
			return;
		}
		if (node.type === 'CallExpression') {
			const callee = unwrap(node.callee);
			const role =
				callee?.type === 'Identifier' && names.has(callee.name) ? roleOf(callee) : undefined;
			if (role?.setter) {
				role.candidate.written = true;
				const nested = new Set(writing);
				nested.add(role.candidate);
				scan(node.arguments, node, 'arguments', nested);
				return;
			}
		}
		for (const child in node) {
			if (!SKIP_KEYS.has(child) && !child.startsWith('_octane'))
				scan(node[child], node, child, writing);
		}
	}
	// A tuple's bindings are visible only inside the function that declares it.
	const owners = new Map(analysis.functions.map((record) => [record.scope, record.node]));
	const roots = new Set();
	for (const candidate of candidates) {
		let owner = ast;
		for (let scope = analysis.nodeScopes.get(candidate.decl); scope != null; scope = scope.parent) {
			if (owners.has(scope)) {
				owner = owners.get(scope);
				break;
			}
		}
		roots.add(owner);
	}
	for (const root of roots) scan(root.body, root, 'body', null);

	const diagnostics = [];
	for (const candidate of candidates) {
		if (candidate.written && !candidate.read)
			diagnostics.push(diagnostic(STRONG_WRITE_ONLY_STATE, candidate.node, MESSAGE));
	}
	return diagnostics;
}

// Property names, labels, and declaration names are not reads. Declaration
// patterns have no lexical scope entry, so they never resolve to a candidate.
function reference(parent, key) {
	if (parent == null) return true;
	if (parent.type === 'MemberExpression' && key === 'property') return parent.computed === true;
	if (
		(parent.type === 'Property' ||
			parent.type === 'MethodDefinition' ||
			parent.type === 'PropertyDefinition') &&
		key === 'key'
	) {
		return parent.computed === true;
	}
	if (parent.type === 'LabeledStatement' || parent.type === 'MetaProperty') return false;
	if (parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return false;
	return (
		!(parent.type === 'ExportSpecifier' && key === 'exported') && !parent.type.startsWith('Import')
	);
}

// `<Value />` reads a binding; lowercase names are intrinsic elements.
function jsxReference(node, parent, key) {
	if (parent?.type === 'JSXMemberExpression') return key === 'object';
	return (
		(parent?.type === 'JSXOpeningElement' || parent?.type === 'JSXClosingElement') &&
		key === 'name' &&
		!/^[a-z]/.test(node.name) &&
		!node.name.includes('-')
	);
}
