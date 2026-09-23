import {
	createLexicalAnalysis,
	forEachRuntimeAstChild,
	isIdentifierReference,
} from './compile-universal.js';

/** Public root factory → compiler-only root that skips returned-value reconciliation. */
export const VOID_ROOT_HELPERS = {
	createRoot: '__createVoidRoot',
	hydrateRoot: '__hydrateVoidRoot',
};

/** Local names of value imports of `createRoot`/`hydrateRoot` from `octane`. */
export function findRootFactoryImports(ast) {
	const imports = new Map();
	for (const statement of ast.body || []) {
		if (
			statement.type !== 'ImportDeclaration' ||
			statement.source?.value !== 'octane' ||
			statement.importKind === 'type'
		)
			continue;
		for (const specifier of statement.specifiers || []) {
			if (specifier.type !== 'ImportSpecifier' || specifier.importKind === 'type') continue;
			const imported = specifier.imported?.name ?? specifier.imported?.value;
			if (Object.hasOwn(VOID_ROOT_HELPERS, imported) && specifier.local?.name)
				imports.set(specifier.local.name, imported);
		}
	}
	return imports;
}

const isFunction = (node) =>
	node.type === 'FunctionDeclaration' ||
	node.type === 'FunctionExpression' ||
	node.type === 'ArrowFunctionExpression';

const directCall = (member, call) =>
	member?.type === 'MemberExpression' &&
	member.computed !== true &&
	member.optional !== true &&
	member.property?.type === 'Identifier' &&
	call?.type === 'CallExpression' &&
	call.callee === member &&
	call.optional !== true;

/**
 * Prove every root whose complete lifetime renders only statically known
 * component bodies. This pass only reads ASTs; callers own the rewrite.
 *
 * A root is one exact `createRoot(...)`/`hydrateRoot(...)` call of the module's
 * own octane import, in one of three shapes:
 * - `const root = factory(...)` in a function body, or at module scope when the
 *   declaration is not exported, where every reference is a direct
 *   `root.render(...)`/`root.unmount()` call in the declaring scope;
 * - `factory(...).render(...)`, whose root value never reaches a binding; or
 * - a discarded `hydrateRoot(...)` expression statement.
 * Each render target, and hydration's initial target, must be a module-scope
 * binding `component(name)` accepts: a bare identifier with optional props, or
 * a sole JSX element with that tag, which the root unwraps to the same body.
 * `with` makes every lexical proof unsound; unbound direct `eval` can reach
 * every named root.
 *
 * Returns `{ callee, helper, components, elements }` per proven root, where
 * `components` holds the `component(name)` value of each target and `elements`
 * locates each JSX target as `{ call, index }` (its argument position).
 */
export function proveVoidRoots(ast, { factories, component, skip }) {
	if (factories.size === 0) return [];
	const analysis = createLexicalAnalysis(ast);
	const moduleScoped = (node) =>
		analysis.resolveBinding(analysis.nodeScopes.get(node), node.name)?.scope === analysis.rootScope;
	const exportedDeclarations = new Set();
	for (const statement of ast.body || [])
		if (statement.type === 'ExportNamedDeclaration' && statement.declaration)
			exportedDeclarations.add(statement.declaration);
	const target = (node, jsx) => {
		let name = node;
		if (jsx && node?.type === 'JSXElement') {
			name = node.openingElement?.name;
			// A lowercase tag is intrinsic whatever binding shares its name.
			if (name?.type !== 'JSXIdentifier' || /^[a-z]/.test(name.name)) return undefined;
		} else if (node?.type !== 'Identifier') return undefined;
		const value = component(name.name);
		return value !== undefined && moduleScoped(name) ? value : undefined;
	};
	// A root method call either proves one more render target or leaves the root
	// generic. `unmount()` never changes the component-return contract.
	const classify = (root, member, call) => {
		if (!directCall(member, call)) return false;
		const name = member.property.name;
		const args = call.arguments;
		if (name === 'unmount') return args.length === 0;
		if (name !== 'render' || args.some((argument) => argument.type === 'SpreadElement'))
			return false;
		const value =
			args.length === 1
				? target(args[0], true)
				: args.length === 2
					? target(args[0], false)
					: undefined;
		if (value === undefined) return false;
		root.components.push(value);
		if (args[0].type === 'JSXElement') root.elements.push({ call, index: 0 });
		return true;
	};
	const functionScopes = new Set();
	const roots = [];
	const declared = new Map();
	let opaque = false;
	let directEval = false;
	const discover = (node, parent, key, grandparent, skipped) => {
		if (node === null || typeof node !== 'object') return;
		if (skip?.(node)) skipped = true;
		if (!skipped && isFunction(node)) {
			const scope = analysis.nodeScopes.get(node.body)?.functionScope;
			if (scope !== undefined) functionScopes.add(scope);
		}
		if (node.type === 'WithStatement') opaque = true;
		else if (
			node.type === 'Identifier' &&
			node.name === 'eval' &&
			isIdentifierReference(node, parent, key, analysis) &&
			analysis.resolveBinding(analysis.nodeScopes.get(node), 'eval') === null
		)
			directEval = true;
		if (
			!skipped &&
			node.type === 'CallExpression' &&
			node.optional !== true &&
			node.callee?.type === 'Identifier' &&
			factories.has(node.callee.name) &&
			moduleScoped(node.callee)
		)
			discoverRoot(node, parent, key, grandparent);
		forEachRuntimeAstChild(node, (child, childKey) =>
			discover(child, node, childKey, parent, skipped),
		);
	};
	const discoverRoot = (call, parent, key, grandparent) => {
		const factory = factories.get(call.callee.name);
		const root = {
			callee: call.callee,
			helper: VOID_ROOT_HELPERS[factory],
			components: [],
			elements: [],
			valid: true,
			hydrated: factory === 'hydrateRoot',
		};
		if (root.hydrated) {
			// Hydration renders immediately: its initial target satisfies the same
			// proof as every later render. An element form carries options third.
			const args = call.arguments;
			const element = args[1]?.type === 'JSXElement';
			const initial =
				args.length >= 2 &&
				args.length <= (element ? 3 : 4) &&
				!args.some((argument) => argument.type === 'SpreadElement')
					? target(args[1], element)
					: undefined;
			if (initial === undefined) return;
			root.components.push(initial);
			if (element) root.elements.push({ call, index: 1 });
		}
		if (
			parent?.type === 'VariableDeclarator' &&
			key === 'init' &&
			grandparent?.type === 'VariableDeclaration' &&
			grandparent.kind === 'const' &&
			parent.id?.type === 'Identifier'
		) {
			const scope = analysis.resolveBinding(
				analysis.nodeScopes.get(parent.id),
				parent.id.name,
			)?.scope;
			if (scope === undefined) return;
			// Namespaces and static blocks own function scopes too, but neither is a
			// closed lifetime; an exported module root is reachable by importers.
			if (
				scope === analysis.rootScope
					? exportedDeclarations.has(grandparent)
					: !functionScopes.has(scope.functionScope)
			)
				return;
			root.scope = scope;
			let names = declared.get(scope);
			if (names === undefined) declared.set(scope, (names = new Map()));
			names.set(parent.id.name, root);
			roots.push(root);
		} else if (parent?.type === 'MemberExpression' && key === 'object') {
			// Nothing but this one call ever observes the chained root.
			if (classify(root, parent, grandparent)) roots.push(root);
		} else if (parent?.type === 'ExpressionStatement' && root.hydrated) {
			roots.push(root);
		}
	};
	discover(ast, null, null, null, false);
	if (opaque || roots.length === 0) return [];
	// Strict module code cannot let eval create bindings, but eval source can
	// still reach any named root. A chained root has no name to reach.
	if (directEval)
		for (const names of declared.values()) for (const root of names.values()) root.valid = false;
	else if (declared.size > 0) {
		const inspect = (node, parent, key, grandparent) => {
			if (node === null || typeof node !== 'object') return;
			if (
				(node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
				isIdentifierReference(node, parent, key, analysis)
			) {
				const nodeScope = analysis.nodeScopes.get(node);
				// Runtime traversal may see syntax the lexical analysis has not scoped.
				// An unresolved possible root reference cannot certify a closed lifetime.
				if (nodeScope === undefined) {
					for (const names of declared.values()) {
						const root = names.get(node.name);
						if (root !== undefined) root.valid = false;
					}
				}
				const scope = analysis.resolveBinding(nodeScope, node.name)?.scope;
				const root = declared.get(scope)?.get(node.name);
				if (
					root !== undefined &&
					!(
						node.type === 'Identifier' &&
						key === 'object' &&
						nodeScope === root.scope &&
						classify(root, parent, grandparent)
					)
				)
					root.valid = false;
			}
			forEachRuntimeAstChild(node, (child, childKey) => inspect(child, node, childKey, parent));
		};
		inspect(ast, null, null, null);
	}
	return roots
		.filter((root) => root.valid && (root.hydrated || root.components.length > 0))
		.map(({ callee, helper, components, elements }) => ({ callee, helper, components, elements }));
}
