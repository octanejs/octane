// Field names skipped by the generic AST child-walks below: source positions
// plus the two known back-reference carriers — `metadata` (TSRX CSS ASTs whose
// `parent_rule` / rule-node arrays form real cycles) and `parent` (acorn-
// typescript sometimes attaches one). Skipping them is necessary but NOT
// sufficient: even cycle-free ASTs can carry shared-subtree pointers (compiler
// passes reuse nodes via spread), so every generic walk ALSO keeps a WeakSet
// visited guard — without one the `for (k in n)` traversal can re-enter the
// same subtree combinatorially, observed as a vitest worker hang on the bigger
// fixture files.
export const AST_WALK_SKIP_KEYS = new Set([
	'type',
	'loc',
	'start',
	'end',
	'range',
	'metadata',
	'parent',
]);

export function collectBindings(pattern, out) {
	if (!pattern) return;
	if (pattern.type === 'Identifier') {
		out.add(pattern.name);
		return;
	}
	if (pattern.type === 'TSParameterProperty') {
		collectBindings(pattern.parameter, out);
		return;
	}
	if (pattern.type === 'ObjectPattern') {
		for (const p of pattern.properties || []) {
			if (p.type === 'RestElement') collectBindings(p.argument, out);
			else collectBindings(p.value || p.key, out);
		}
		return;
	}
	if (pattern.type === 'ArrayPattern') {
		for (const e of pattern.elements || []) collectBindings(e, out);
		return;
	}
	if (pattern.type === 'RestElement') {
		collectBindings(pattern.argument, out);
		return;
	}
	if (pattern.type === 'AssignmentPattern') {
		collectBindings(pattern.left, out);
		return;
	}
}

export function isFunction(node) {
	return (
		node?.type === 'FunctionDeclaration' ||
		node?.type === 'FunctionExpression' ||
		node?.type === 'ArrowFunctionExpression'
	);
}

export function visitHoistedVarPatterns(node, visit, root = true, bindingsOnly = true) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) visitHoistedVarPatterns(child, visit, false, bindingsOnly);
		return;
	}
	if (!root && (isFunction(node) || node.type === 'JSXCodeBlock')) return;
	if (
		['JSXIfExpression', 'JSXForExpression', 'JSXSwitchExpression', 'JSXTryExpression'].includes(
			node.type,
		)
	)
		return;
	if (
		bindingsOnly &&
		(isFunction(node) ||
			node.type === 'JSXSwitchExpression' ||
			(!root && node.type === 'StaticBlock') ||
			node.type === 'ClassDeclaration' ||
			node.type === 'ClassExpression' ||
			node.type === 'TSModuleDeclaration')
	) {
		return;
	}
	if (node.type === 'VariableDeclaration' && node.kind === 'var') {
		for (const decl of node.declarations || []) visit(decl.id);
	}
	for (const key in node) {
		if (AST_WALK_SKIP_KEYS.has(key)) continue;
		visitHoistedVarPatterns(node[key], visit, false, bindingsOnly);
	}
}

export function addHoistedVarNames(node, names) {
	visitHoistedVarPatterns(node, (pattern) => collectBindings(pattern, names));
}

/**
 * Walk an AST subtree collecting Identifier references that are NOT bound
 * locally (inside the subtree). Tracks block/function scopes so inner `const`
 * declarations correctly shadow outer references.
 */
// `ignoreNodes` (optional) hides those exact Identifier nodes from the free
// set — used as a non-mutating escape oracle (findMountEventCallbackSinks)
// instead of temporarily blanking names on the (read-only) tree.
export function collectFreeIdentifiers(
	root,
	initiallyBound,
	ignoreNodes = null,
	includeTypeQueries = false,
	includeHoistedVars = false,
) {
	const free = new Set();
	const seen = new WeakSet();
	walk(root, new Set(initiallyBound));
	return free;

	// A type can refer to a value through `typeof`. For the TS target, keep
	// the first name of that query and respect function/signature parameters.
	// A type name or the right-hand property of a qualified name is not a value.
	function walkTypeQueries(node, scope) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const item of node) walkTypeQueries(item, scope);
			return;
		}
		const params = node.params ?? node.parameters;
		if (Array.isArray(params) && params.length) {
			scope = new Set(scope);
			for (const param of params) collectBindings(param, scope);
		}
		if (node.type === 'TSTypeQuery') {
			let root = node.exprName;
			while (root?.type === 'TSQualifiedName') root = root.left;
			if (root?.type === 'Identifier' && !scope.has(root.name)) free.add(root.name);
		}
		for (const key in node) {
			if (!AST_WALK_SKIP_KEYS.has(key)) walkTypeQueries(node[key], scope);
		}
	}

	/**
	 * Walk the EXPRESSION positions inside a binding pattern: default
	 * initialisers and computed keys. `collectBindings` harvests the names a
	 * pattern declares, but those two positions are ordinary expressions that
	 * run at binding time and may reference outer values — so they carry free
	 * identifiers that the pattern's names alone never reveal.
	 */
	function walkPatternExpressions(pattern, scope) {
		if (!pattern || typeof pattern !== 'object') return;
		if (includeTypeQueries) walkTypeQueries(pattern.typeAnnotation, scope);
		switch (pattern.type) {
			case 'TSParameterProperty':
				walkPatternExpressions(pattern.parameter, scope);
				return;
			case 'AssignmentPattern':
				walkPatternExpressions(pattern.left, scope);
				walk(pattern.right, scope);
				return;
			case 'ObjectPattern':
				for (const p of pattern.properties || []) {
					if (p.type === 'RestElement') {
						walkPatternExpressions(p.argument, scope);
						continue;
					}
					if (p.computed) walk(p.key, scope);
					walkPatternExpressions(p.value || p.key, scope);
				}
				return;
			case 'ArrayPattern':
				for (const e of pattern.elements || []) walkPatternExpressions(e, scope);
				return;
			case 'RestElement':
				walkPatternExpressions(pattern.argument, scope);
				return;
			default:
				return;
		}
	}

	function walk(n, scope) {
		if (!n) return;
		if (Array.isArray(n)) {
			for (const x of n) walk(x, scope);
			return;
		}
		if (typeof n !== 'object') return;

		const t = n.type;
		if (!t) return;
		if (seen.has(n)) return;
		seen.add(n);
		if (ignoreNodes !== null && ignoreNodes.has(n)) return;

		// TypeScript annotations are erased and cannot be reactive dependencies.
		// Preserve only wrappers whose `.expression` is runtime JavaScript.
		if (
			t === 'TSAsExpression' ||
			t === 'TSTypeAssertion' ||
			t === 'TSSatisfiesExpression' ||
			t === 'TSNonNullExpression' ||
			t === 'TSInstantiationExpression'
		) {
			walk(n.expression, scope);
			if (includeTypeQueries)
				walkTypeQueries(n.typeAnnotation ?? n.typeArguments ?? n.typeParameters, scope);
			return;
		}
		// `module server {}` is represented with TypeScript's namespace container
		// nodes even though its body is runtime code. Isolation validation depends on
		// seeing those references; only the container name itself is non-reactive.
		if (t === 'TSModuleDeclaration' || t === 'TSModuleBlock') {
			walk(n.body, scope);
			return;
		}
		// Enum initializers execute; only their declared names are type syntax.
		// Member references belong to the enum, not equally named outer bindings.
		if (t === 'TSEnumDeclaration') {
			if (n.declare !== true) {
				const members = n.body?.members ?? n.members ?? [];
				const enumScope = new Set(scope);
				collectBindings(n.id, enumScope);
				for (const member of members) {
					const name = member.id?.type === 'Identifier' ? member.id.name : member.id?.value;
					if (!member.computed && typeof name === 'string') enumScope.add(name);
				}
				for (const member of members) {
					if (member.computed) walk(member.id, enumScope);
					walk(member.initializer, enumScope);
				}
			}
			return;
		}
		if (t === 'TSImportEqualsDeclaration') {
			if (n.importKind !== 'type' && n.moduleReference?.type !== 'TSExternalModuleReference') {
				let reference = n.moduleReference;
				while (reference?.type === 'TSQualifiedName') reference = reference.left;
				walk(reference, scope);
			}
			return;
		}
		// The compiler's own renderable child hole (a normalized `{expr}` or
		// `@{ … }` child) shares the prefix, but its expression is runtime code.
		if (t === 'TSRXExpression') {
			walk(n.expression, scope);
			return;
		}
		if (t.startsWith('TS')) {
			if (includeTypeQueries) walkTypeQueries(n, scope);
			return;
		}

		if (t === 'Identifier') {
			if (!scope.has(n.name)) free.add(n.name);
			return;
		}
		// Only the local side of an export list reads an existing module binding.
		if (t === 'ExportNamedDeclaration') {
			if (includeTypeQueries && n.exportKind === 'type') walkTypeQueries(n.declaration, scope);
			if (n.exportKind !== 'type' && !n.source) {
				walk(n.declaration, scope);
				for (const specifier of n.specifiers ?? []) {
					if (specifier.exportKind !== 'type') walk(specifier.local, scope);
				}
			}
			return;
		}
		if (t === 'ExportAllDeclaration' || t === 'ImportDeclaration') return;
		if (t === 'LabeledStatement') {
			walk(n.body, scope);
			return;
		}
		if (t === 'BreakStatement' || t === 'ContinueStatement') return;

		// JSX tag position: a COMPONENT tag is a real identifier reference — a
		// per-body local (`const C = props.comp`) used as `<C/>` must show up as
		// free, or a hoisted helper (Phase 2) would silently drop it from its
		// env tuple. Host tag names ('div') and attribute NAMES are static —
		// only component-shaped identifier tags (isCompatTag rule), member-tag
		// ROOT objects, and dynamic `<{expr}/>` expressions count.
		if (t === 'Element' || t === 'JSXElement') {
			const tag = n.openingElement?.name || n.id;
			if (tag && !ignoreNodes?.has(tag)) {
				if (
					(tag.type === 'Identifier' || tag.type === 'JSXIdentifier') &&
					typeof tag.name === 'string'
				) {
					if (!/^[a-z]/.test(tag.name) && !tag.name.includes('-') && !scope.has(tag.name)) {
						free.add(tag.name);
					}
				} else if (tag.type === 'MemberExpression' || tag.type === 'JSXMemberExpression') {
					let o = tag;
					while (o && (o.type === 'MemberExpression' || o.type === 'JSXMemberExpression')) {
						o = o.object;
					}
					if (
						o &&
						(o.type === 'Identifier' || o.type === 'JSXIdentifier') &&
						typeof o.name === 'string' &&
						!scope.has(o.name)
					) {
						free.add(o.name);
					}
				} else if (tag.type === 'JSXExpressionContainer') {
					walk(tag.expression, scope);
				}
			}
			const attrs = n.attributes || n.openingElement?.attributes || [];
			for (const a of attrs) {
				if (a.type === 'Attribute' || a.type === 'JSXAttribute') walk(a.value, scope);
				else walk(a.argument ?? a, scope); // spread attribute
			}
			walk(n.children, scope);
			return;
		}

		// Member access — `obj.prop`: prop is a static name, not a binding ref.
		if (t === 'MemberExpression' && !n.computed) {
			walk(n.object, scope);
			return;
		}
		// Object literal property keys are static names (when not computed).
		if (t === 'Property' && !n.computed) {
			walk(n.value, scope);
			return;
		}
		if (t === 'ClassExpression' || t === 'ClassDeclaration') {
			const classScope = new Set(scope);
			if (n.id) classScope.add(n.id.name);
			walk(n.decorators, scope);
			walk(n.superClass, classScope);
			walk(n.body, classScope);
			if (includeTypeQueries) {
				walkTypeQueries(n.typeParameters, classScope);
				walkTypeQueries(n.superTypeArguments ?? n.superTypeParameters, classScope);
				walkTypeQueries(n.implements, classScope);
			}
			return;
		}
		if (t === 'MethodDefinition' || t === 'PropertyDefinition' || t === 'AccessorProperty') {
			if (n.computed) walk(n.key, scope);
			walk(n.decorators, scope);
			walk(n.value, scope);
			if (includeTypeQueries) walkTypeQueries(n.typeAnnotation, scope);
			return;
		}

		// Function-like scopes — params introduce new bindings.
		if (
			t === 'FunctionExpression' ||
			t === 'FunctionDeclaration' ||
			t === 'ArrowFunctionExpression'
		) {
			const newScope = new Set(scope);
			for (const p of n.params || []) collectBindings(p, newScope);
			// `function name(){}` introduces its own name into the body scope too.
			if (n.id) collectBindings(n.id, newScope);
			// A parameter pattern is not only a set of bindings: default
			// initialisers and computed destructuring keys are EXPRESSIONS that run
			// when the function is called, and they can reference anything the
			// function closes over. Walking only the body would miss
			// `(s, x = outer) => …` and `({ [outer]: v }) => …` entirely.
			for (const p of n.params || []) walkPatternExpressions(p, newScope);
			if (includeTypeQueries) {
				walkTypeQueries(n.returnType, newScope);
				walkTypeQueries(n.typeParameters, newScope);
			}
			// Body var bindings do not shadow names in default parameter expressions.
			if (includeHoistedVars) addHoistedVarNames(n.body, newScope);
			walk(n.body, newScope);
			return;
		}

		// Block scope — hoist `var`/`function` + pre-collect `let`/`const` so
		// forward references work the same way they do at runtime.
		if (t === 'BlockStatement' || t === 'StaticBlock') {
			const newScope = new Set(scope);
			if (includeHoistedVars && t === 'StaticBlock') addHoistedVarNames(n, newScope);
			for (const stmt of n.body || []) {
				if (stmt.type === 'VariableDeclaration') {
					for (const d of stmt.declarations || []) collectBindings(d.id, newScope);
				} else if (
					(stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration') &&
					stmt.id
				) {
					newScope.add(stmt.id.name);
				}
			}
			walk(n.body, newScope);
			return;
		}

		// VariableDeclarator's `id` is a binding — but the pattern's defaults and
		// computed keys are still live expressions (`const { [k]: a, b = c } = o`).
		if (t === 'VariableDeclarator') {
			walkPatternExpressions(n.id, scope);
			walk(n.init, scope);
			return;
		}

		// CatchClause introduces its param, and a `@catch (error, reset)` clause
		// also its reset param.
		if (t === 'CatchClause') {
			const newScope = new Set(scope);
			if (n.param) collectBindings(n.param, newScope);
			if (n.resetParam) collectBindings(n.resetParam, newScope);
			if (n.param) walkPatternExpressions(n.param, newScope);
			walk(n.body, newScope);
			return;
		}

		// A `@{ … }` block's setup declarations are scoped to its setup and render
		// output, like a block statement's. Otherwise a block-local reads as a
		// capture of any outer name it shares, which a caller would thread from a
		// call site where that outer name may not be in scope.
		if (t === 'JSXCodeBlock') {
			const newScope = new Set(scope);
			for (const stmt of n.body || []) {
				if (stmt.type === 'VariableDeclaration') {
					for (const d of stmt.declarations || []) collectBindings(d.id, newScope);
				} else if (stmt.type === 'FunctionDeclaration' && stmt.id) {
					newScope.add(stmt.id.name);
				}
			}
			for (const key in n) {
				if (AST_WALK_SKIP_KEYS.has(key)) continue;
				walk(n[key], newScope);
			}
			return;
		}

		// for / for-in / for-of — a DECLARATION left introduces bindings, but a
		// bare left-hand side is an ASSIGNMENT to something already in scope.
		if (t === 'ForStatement' || t === 'ForInStatement' || t === 'ForOfStatement') {
			const newScope = new Set(scope);
			if (n.left && n.left.type === 'VariableDeclaration') {
				for (const d of n.left.declarations || []) {
					collectBindings(d.id, newScope);
					walkPatternExpressions(d.id, newScope);
				}
			} else if (n.left) {
				// `for (acc of xs)` writes the enclosing `acc` — treating it as a
				// fresh binding hides that reference, which reads as capture-free
				// even though the loop mutates outer state.
				walk(n.left, newScope);
			}
			// A CLASSIC for carries its declaration in `init`, not `left`, and that
			// binding is visible to the test/update/body. Without this, `i` in
			// `for (let i = 0; i < n; i++)` is reported free, which reads as a
			// capture of an enclosing `i` that the loop actually shadows.
			if (n.init && n.init.type === 'VariableDeclaration') {
				for (const d of n.init.declarations || []) {
					collectBindings(d.id, newScope);
					walkPatternExpressions(d.id, newScope);
				}
			}
			walk(n.init, newScope);
			walk(n.test, newScope);
			walk(n.update, newScope);
			walk(n.right, newScope);
			walk(n.body, newScope);
			return;
		}
		// New TSRX template for-expression. Its item/index bindings are visible to
		// the key and body, but not to the iterable or @empty arm.
		if (t === 'JSXForExpression') {
			const newScope = new Set(scope);
			if (n.left?.type === 'VariableDeclaration') {
				for (const d of n.left.declarations || []) {
					collectBindings(d.id, newScope);
					walkPatternExpressions(d.id, newScope);
				}
			} else if (n.left) {
				// Same as the JS loops above: a bare left-hand side assigns to an
				// existing binding rather than introducing one.
				walk(n.left, newScope);
			}
			if (n.index) collectBindings(n.index, newScope);
			walk(n.right, scope);
			walk(n.key, newScope);
			walk(n.body, newScope);
			walk(n.empty, scope);
			return;
		}

		// Default: walk all child fields.
		for (const key in n) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(n[key], scope);
		}
	}
}

/**
 * Top-level module bindings, split by whether their identity can change after
 * evaluation. `mutable` holds `let`/`var` declarations, class declarations, and
 * function declarations that collectImmutableModuleFunctions demoted: an
 * identity-only survivor skip cannot witness them, so a region reading one
 * must re-render. `all` adds consts, unreassigned functions, enums, and
 * imports; a free name outside it (and outside every enclosing local) is a
 * global. Only top-level declarations count — a same-named parameter or local
 * elsewhere in the module never shadows the global a region actually reads.
 */
export function collectModuleTopLevelBindings(body, immutableFunctions) {
	const all = new Set();
	const mutable = new Set();
	for (const statement of body) {
		if (statement.type === 'ImportDeclaration') {
			for (const specifier of statement.specifiers || []) {
				if (specifier.local) all.add(specifier.local.name);
			}
			continue;
		}
		const declaration =
			statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
				? statement.declaration
				: statement;
		if (!declaration) continue;
		if (declaration.type === 'VariableDeclaration') {
			const names = new Set();
			for (const d of declaration.declarations || []) collectBindings(d.id, names);
			for (const name of names) {
				all.add(name);
				if (declaration.kind !== 'const') mutable.add(name);
			}
		} else if (declaration.type === 'ClassDeclaration' && declaration.id) {
			all.add(declaration.id.name);
			mutable.add(declaration.id.name);
		} else if (
			declaration.type === 'FunctionDeclaration' &&
			declaration.id?.type === 'Identifier'
		) {
			all.add(declaration.id.name);
			if (!immutableFunctions.has(declaration.id.name)) mutable.add(declaration.id.name);
		} else if (
			(declaration.type === 'TSEnumDeclaration' ||
				declaration.type === 'TSModuleDeclaration' ||
				declaration.type === 'TSImportEqualsDeclaration') &&
			declaration.id?.type === 'Identifier'
		) {
			all.add(declaration.id.name);
		}
	}
	return { all, mutable };
}

export function identifierName(node) {
	if (node?.type === 'Identifier') return node.name;
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	return null;
}

export function unwrapTsExpr(n) {
	while (
		n &&
		(n.type === 'TSAsExpression' ||
			n.type === 'TSNonNullExpression' ||
			n.type === 'TSTypeAssertion' ||
			n.type === 'TSSatisfiesExpression' ||
			n.type === 'ParenthesizedExpression')
	) {
		n = n.expression;
	}
	return n;
}

// Each runtime export as [exportName, localName]. `localName` is null when no
// module binding holds the exported value: a re-export, `export *` (whose
// exportName is also null), or an anonymous default.
export function runtimeExportBindings(body) {
	const bindings = [];
	for (const node of body) {
		if (node.type === 'ExportAllDeclaration') {
			bindings.push([null, null]);
		} else if (node.type === 'ExportDefaultDeclaration') {
			const value = unwrapTsExpr(node.declaration);
			bindings.push([
				'default',
				value.type === 'Identifier'
					? value.name
					: value.type === 'FunctionDeclaration' || value.type === 'ClassDeclaration'
						? (value.id?.name ?? null)
						: null,
			]);
		} else if (node.type === 'ExportNamedDeclaration' && node.declaration) {
			const names = new Set();
			if (node.declaration.type === 'VariableDeclaration') {
				for (const declarator of node.declaration.declarations)
					collectBindings(declarator.id, names);
			} else if (node.declaration.id?.type === 'Identifier') {
				names.add(node.declaration.id.name);
			}
			for (const name of names) bindings.push([name, name]);
		} else if (node.type === 'ExportNamedDeclaration') {
			for (const specifier of node.specifiers) {
				if (specifier.exportKind === 'type') continue;
				bindings.push([
					identifierName(specifier.exported),
					node.source ? null : specifier.local.name,
				]);
			}
		}
	}
	return bindings;
}
