// Creation-time snapshots for compiler-deferred JSX reads.
//
// Value-position JSX defers its non-literal parts into compiler thunks
// (`createScopedElement(type, props, () => children)`,
// `createScopedValue(() => record)`), which run when Octane renders or inspects
// the element. A captured binding that code reassigns can hold a different
// value by then: `n++` in a `.map` callback, a `var` re-initialized by a loop,
// a counter bumped after the element was stored. React evaluates JSX
// expressions eagerly, so every element sees the value current at creation.
//
// This pass runs once on the final, TypeScript-free output Program. It finds
// each outermost deferral thunk, resolves the bindings its deferred code reads
// directly (outside nested user functions), and rebinds those that can be
// reassigned after the thunk exists to a parameter bound at its creation:
//
//   createScopedElement('li', { key: x }, () => String(n))
//   createScopedElement('li', { key: x }, ((n$) => () => String(n$))(n))
//
// Only the thunk argument is wrapped, so the snapshot is taken after the eager
// type and props, in React's argument order. User functions inside the thunk
// (event handlers, render props) keep the live binding, as JavaScript closures
// do in React. A thunk that itself writes a binding keeps reading it live: its
// write already runs at render, so snapshotting only the read would split one
// variable into two.
//
// A binding needs a snapshot only when a write can follow the thunk's creation.
// Its frame is the function body that declares it (or the loop body, for a
// block binding declared in one, or the module). A write in a function or
// thunk nested in that frame can run at any time. A nested loop runs in place,
// so its writes land where it ends: before a thunk created after the loop,
// after one created inside it. Other writes are the frame's straight-line code,
// ordered by the walk, which follows evaluation order. A nested function counts
// from where it is created. A function declaration counts from there too,
// unless code before it names it or it is exported, since hoisting then lets it
// run from its block's start. So `let x; if (c) x = a; else x = b;` before the
// JSX needs no snapshot, and its output stays byte-identical.
//
// The record a module-level function declaration returns when called directly
// keeps reading at render (docs/differences-from-react.md). Both emitters mark
// that record DEFERRED_LIVE, so server and client agree. Value JSX built in a
// callback inside such a record still snapshots.
//
// The walk is positional rather than keyed on node identity, because lowering
// reuses one subtree in several branches (a body call and a direct call).
// Thunks are matched between the two walks by identity, and a thunk reached at
// several positions keeps a name only while every position resolves it to the
// same binding.

import { builders as b } from '@tsrx/core';

/** Marker on compiler-built deferral thunks (arrow functions with no params). */
export const DEFERRED_READ = '_octaneDeferredRead';

/** Marker on a direct call's returned record, whose thunks keep live reads. */
export const DEFERRED_LIVE = '_octaneDeferredLive';

/** Mark a freshly built deferral thunk. */
export function markDeferredRead(arrow) {
	return { ...arrow, [DEFERRED_READ]: true };
}

/** Keep the deferral thunks directly inside `record` reading live bindings. */
export function markDeferredLive(record) {
	return { ...record, [DEFERRED_LIVE]: true };
}

const isDeferredThunk = (node) =>
	node.type === 'ArrowFunctionExpression' &&
	node[DEFERRED_READ] === true &&
	(node.params || []).length === 0;

const NON_RUNTIME_KEYS = new Set([
	'type',
	'loc',
	'start',
	'end',
	'range',
	'metadata',
	'parent',
	'typeAnnotation',
	'returnType',
	'typeParameters',
	'typeArguments',
	'superTypeParameters',
	'superTypeArguments',
	'implements',
]);

const isFunctionNode = (node) =>
	node.type === 'FunctionDeclaration' ||
	node.type === 'FunctionExpression' ||
	node.type === 'ArrowFunctionExpression';

function createScope(parent, site) {
	return { parent, bindings: new Map(), site };
}

function resolve(scope, name) {
	for (let current = scope; current !== null; current = current.parent) {
		const binding = current.bindings.get(name);
		if (binding !== undefined) return binding;
	}
	return null;
}

function patternNames(pattern, into) {
	if (pattern == null) return into;
	switch (pattern.type) {
		case 'Identifier':
			into.push(pattern.name);
			break;
		case 'ObjectPattern':
			for (const property of pattern.properties || []) {
				patternNames(property.type === 'RestElement' ? property.argument : property.value, into);
			}
			break;
		case 'ArrayPattern':
			for (const element of pattern.elements || []) patternNames(element, into);
			break;
		case 'AssignmentPattern':
			patternNames(pattern.left, into);
			break;
		case 'RestElement':
			patternNames(pattern.argument, into);
			break;
	}
	return into;
}

function eachChild(node, visit) {
	for (const key in node) {
		if (NON_RUNTIME_KEYS.has(key)) continue;
		const value = node[key];
		if (value === null || typeof value !== 'object') continue;
		visit(value);
	}
}

// Names a function scope binds with `var` in any of its nested statements.
function collectVarNames(node, into) {
	if (node == null || typeof node !== 'object') return into;
	if (Array.isArray(node)) {
		for (const child of node) collectVarNames(child, into);
		return into;
	}
	if (isFunctionNode(node) || node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
		return into;
	}
	if (node.type === 'VariableDeclaration') {
		if (node.kind === 'var') {
			for (const declaration of node.declarations || []) patternNames(declaration.id, into);
		}
		return into;
	}
	if (typeof node.type === 'string' && node.type.endsWith('Expression')) return into;
	eachChild(node, (child) => collectVarNames(child, into));
	return into;
}

// Names a statement list binds lexically: let/const, functions, classes, imports.
function lexicalNames(statements, into) {
	for (let statement of statements || []) {
		if (
			statement?.type === 'ExportNamedDeclaration' ||
			statement?.type === 'ExportDefaultDeclaration'
		) {
			statement = statement.declaration;
		}
		if (statement == null) continue;
		if (statement.type === 'VariableDeclaration' && statement.kind !== 'var') {
			for (const declaration of statement.declarations || []) patternNames(declaration.id, into);
		} else if (
			(statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') &&
			statement.id
		) {
			into.push(statement.id.name);
		} else if (statement.type === 'ImportDeclaration') {
			for (const specifier of statement.specifiers || []) into.push(specifier.local.name);
		}
	}
	return into;
}

/**
 * Rebind reassigned captures of every outermost marked thunk in `program`.
 * `allocateName(name)` returns a module-unique identifier for a snapshot of
 * `name`. Returns `program` itself when nothing needs a snapshot.
 */
export function snapshotDeferredReads(program, allocateName) {
	const sites = analyze(program);
	if (sites === null) return program;
	const names = new Map();
	const snapshotName = (name) => {
		let snapshot = names.get(name);
		if (snapshot === undefined) {
			snapshot = allocateName(name);
			names.set(name, snapshot);
		}
		return snapshot;
	};
	return rewrite(program, sites, snapshotName);
}

// Walk 1: bindings and their writes, and what each outermost thunk reads and
// writes. Returns null when no thunk reads a binding that a later write can
// change.
function analyze(program) {
	const sites = new Map();
	// Each enclosing function, loop, and thunk: its walk-order start, and for a
	// loop the bindings of outer frames it writes.
	const frames = [];
	let clock = 0;
	let blockStart = 0;
	let site = null;
	let live = false;
	let loopUpdate = null;
	let siteCount = 0;
	// Names of hoisted function declarations, to notice uses that precede them.
	const hoistedNames = new Set();

	const declare = (scope, names) => {
		for (const name of names) {
			if (!scope.bindings.has(name)) {
				scope.bindings.set(name, {
					scope,
					frame: frames.length - 1,
					volatile: false,
					lastWrite: -1,
					loop: null,
					hoisted: false,
					referenced: false,
				});
			}
		}
	};

	// Declare a statement list's lexical names, marking its function declarations.
	const declareStatements = (scope, statements) => {
		declare(scope, lexicalNames(statements, []));
		for (const statement of statements || []) {
			const exported =
				statement?.type === 'ExportNamedDeclaration' ||
				statement?.type === 'ExportDefaultDeclaration';
			const declaration = exported ? statement.declaration : statement;
			if (declaration?.type !== 'FunctionDeclaration' || !declaration.id) continue;
			const binding = scope.bindings.get(declaration.id.name);
			binding.hoisted = true;
			if (exported) binding.referenced = true;
			hoistedNames.add(declaration.id.name);
		}
	};

	const write = (name, scope) => {
		const binding = resolve(scope, name);
		if (binding === null) return;
		// A `for (let …)` binding is copied into a fresh environment before the
		// update runs, so an update write never reaches an earlier iteration's
		// thunk. The loop re-checks this when a thunk sits in the update itself.
		if (binding.loop !== null && binding.loop === loopUpdate) {
			// Covered by the loop.
		} else if (frames.length - 1 === binding.frame) {
			if (clock > binding.lastWrite) binding.lastWrite = clock;
		} else {
			let loops = true;
			for (let depth = binding.frame + 1; loops && depth < frames.length; depth++) {
				loops = frames[depth].writes !== null;
			}
			if (loops) frames[binding.frame + 1].writes.add(binding);
			else binding.volatile = true;
		}
		if (site !== null && binding.scope.site !== site) site.writes.add(name);
	};

	const read = (name, scope) => {
		if (site === null && !hoistedNames.has(name)) return;
		const binding = resolve(scope, name);
		if (binding === null) return;
		if (binding.hoisted) binding.referenced = true;
		if (site === null || binding.scope.site === site) return;
		// The outermost frame between the binding's and this read: a write before
		// it in the binding's frame has already run when the thunk is created.
		const anchor = frames[binding.frame + 1].start;
		const previous = site.reads.get(name);
		if (previous === undefined) site.reads.set(name, { binding, anchor });
		else if (previous.binding !== binding) site.conflicts.add(name);
		else if (anchor < previous.anchor) previous.anchor = anchor;
	};

	const writePattern = (pattern, scope) => {
		if (pattern == null) return;
		switch (pattern.type) {
			case 'Identifier':
				write(pattern.name, scope);
				return;
			case 'ObjectPattern':
				for (const property of pattern.properties || []) {
					if (property.type === 'RestElement') {
						writePattern(property.argument, scope);
					} else {
						if (property.computed) walk(property.key, scope);
						writePattern(property.value, scope);
					}
				}
				return;
			case 'ArrayPattern':
				for (const element of pattern.elements || []) writePattern(element, scope);
				return;
			case 'AssignmentPattern':
				walk(pattern.right, scope);
				writePattern(pattern.left, scope);
				return;
			case 'RestElement':
				writePattern(pattern.argument, scope);
				return;
			default:
				// A member target (`obj.x = …`) reads its object; it writes no binding.
				walk(pattern, scope);
		}
	};

	// Default values and computed keys of a declaration pattern are reads.
	const declarationPattern = (pattern, scope) => {
		if (pattern == null) return;
		switch (pattern.type) {
			case 'ObjectPattern':
				for (const property of pattern.properties || []) {
					if (property.type === 'RestElement') {
						declarationPattern(property.argument, scope);
					} else {
						if (property.computed) walk(property.key, scope);
						declarationPattern(property.value, scope);
					}
				}
				return;
			case 'ArrayPattern':
				for (const element of pattern.elements || []) declarationPattern(element, scope);
				return;
			case 'AssignmentPattern':
				declarationPattern(pattern.left, scope);
				walk(pattern.right, scope);
				return;
			case 'RestElement':
				declarationPattern(pattern.argument, scope);
		}
	};

	const block = (statements, scope) => {
		const savedBlockStart = blockStart;
		blockStart = clock;
		const inner = createScope(scope, site);
		declareStatements(inner, statements);
		walk(statements, inner);
		blockStart = savedBlockStart;
	};

	// Walk `visit` inside a new frame that starts at `start`.
	const frame = (start, visit, loop = false) => {
		const entry = { start, writes: loop ? new Set() : null };
		frames.push(entry);
		visit();
		frames.pop();
		if (loop) {
			for (const binding of entry.writes) {
				if (clock > binding.lastWrite) binding.lastWrite = clock;
			}
		}
	};

	const fn = (node, scope) => {
		const thunk = isDeferredThunk(node);
		const savedSite = site;
		const savedLive = live;
		const savedLoopUpdate = loopUpdate;
		const savedBlockStart = blockStart;
		if (!thunk) {
			site = null;
			live = false;
		} else if (site === null && !live) {
			site = sites.get(node);
			if (site === undefined) {
				site = { reads: new Map(), writes: new Set(), conflicts: new Set() };
				sites.set(node, site);
			}
			siteCount++;
		}
		loopUpdate = null;
		const declared =
			node.type === 'FunctionDeclaration' && node.id ? resolve(scope, node.id.name) : null;
		frame(declared?.referenced === true ? blockStart : clock, () => {
			blockStart = clock;
			const inner = createScope(scope, site);
			if (node.type === 'FunctionExpression' && node.id) declare(inner, [node.id.name]);
			const params = [];
			for (const param of node.params || []) patternNames(param, params);
			declare(inner, params);
			declare(inner, collectVarNames(node.body, []));
			if (node.body?.type === 'BlockStatement') declareStatements(inner, node.body.body);
			for (const param of node.params || []) declarationPattern(param, inner);
			if (node.body?.type === 'BlockStatement') walk(node.body.body, inner);
			else walk(node.body, inner);
		});
		site = savedSite;
		live = savedLive;
		loopUpdate = savedLoopUpdate;
		blockStart = savedBlockStart;
	};

	// A body that runs apart from its surrounding expression, with no parameters:
	// a class field initializer or static block.
	const detached = (node, scope, statements) => {
		const savedSite = site;
		const savedLive = live;
		const savedLoopUpdate = loopUpdate;
		const savedBlockStart = blockStart;
		site = null;
		live = false;
		loopUpdate = null;
		frame(clock, () => {
			blockStart = clock;
			const inner = createScope(scope, null);
			if (statements) {
				declare(inner, collectVarNames(node, []));
				declareStatements(inner, node);
			}
			walk(node, inner);
		});
		site = savedSite;
		live = savedLive;
		loopUpdate = savedLoopUpdate;
		blockStart = savedBlockStart;
	};

	const variableDeclaration = (node, scope) => {
		for (const declaration of node.declarations || []) {
			declarationPattern(declaration.id, scope);
			walk(declaration.init, scope);
			// A `var` initializer assigns an existing function-scoped binding: it
			// re-runs on each loop iteration and whenever the name is declared again.
			if (node.kind === 'var' && declaration.init != null) {
				for (const name of patternNames(declaration.id, [])) write(name, scope);
			}
		}
	};

	function walk(node, scope) {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child, scope);
			return;
		}
		const type = node.type;
		if (typeof type !== 'string' || type.startsWith('TS')) return;
		clock++;
		if (node[DEFERRED_LIVE] === true && !live && site === null) {
			live = true;
			walkNode(node, type, scope);
			live = false;
		} else {
			walkNode(node, type, scope);
		}
	}

	function walkNode(node, type, scope) {
		switch (type) {
			case 'Identifier':
				read(node.name, scope);
				return;
			case 'Program':
				frame(clock, () => {
					blockStart = clock;
					const inner = createScope(null, null);
					declareStatements(inner, node.body);
					declare(inner, collectVarNames(node.body, []));
					walk(node.body, inner);
				});
				return;
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression':
				fn(node, scope);
				return;
			case 'ClassDeclaration':
			case 'ClassExpression': {
				const inner = createScope(scope, site);
				if (node.type === 'ClassExpression' && node.id) declare(inner, [node.id.name]);
				walk(node.decorators, scope);
				walk(node.superClass, inner);
				walk(node.body, inner);
				return;
			}
			case 'MethodDefinition':
			case 'PropertyDefinition':
			case 'AccessorProperty':
				walk(node.decorators, scope);
				if (node.computed) walk(node.key, scope);
				if (type === 'MethodDefinition') walk(node.value, scope);
				else if (node.value != null) detached(node.value, scope, false);
				return;
			case 'StaticBlock':
				detached(node.body, scope, true);
				return;
			case 'BlockStatement':
				block(node.body, scope);
				return;
			case 'SwitchStatement': {
				walk(node.discriminant, scope);
				const savedBlockStart = blockStart;
				blockStart = clock;
				const inner = createScope(scope, site);
				const statements = [];
				for (const switchCase of node.cases || [])
					statements.push(...(switchCase.consequent || []));
				declareStatements(inner, statements);
				for (const switchCase of node.cases || []) {
					walk(switchCase.test, inner);
					walk(switchCase.consequent, inner);
				}
				blockStart = savedBlockStart;
				return;
			}
			case 'CatchClause': {
				const inner = createScope(scope, site);
				declare(inner, patternNames(node.param, []));
				declarationPattern(node.param, inner);
				walk(node.body, inner);
				return;
			}
			case 'ForStatement': {
				const inner = createScope(scope, site);
				const head = node.init?.type === 'VariableDeclaration' && node.init.kind !== 'var';
				const headNames = head ? lexicalNames([node.init], []) : [];
				declare(inner, headNames);
				const headBindings = headNames.map((name) => inner.bindings.get(name));
				for (const binding of headBindings) binding.loop = node;
				walk(node.init, inner);
				frame(
					clock,
					() => {
						walk(node.test, inner);
						const savedLoopUpdate = loopUpdate;
						const sitesBefore = siteCount;
						loopUpdate = node;
						walk(node.update, inner);
						loopUpdate = savedLoopUpdate;
						// A thunk created in the update clause shares the environment the
						// update then writes.
						if (siteCount !== sitesBefore) {
							for (const binding of headBindings) binding.volatile = true;
						}
						walk(node.body, inner);
					},
					true,
				);
				return;
			}
			case 'ForInStatement':
			case 'ForOfStatement':
				walk(node.right, scope);
				frame(
					clock,
					() => {
						const inner = createScope(scope, site);
						if (node.left?.type === 'VariableDeclaration') {
							if (node.left.kind !== 'var') declare(inner, lexicalNames([node.left], []));
							for (const declaration of node.left.declarations || []) {
								declarationPattern(declaration.id, inner);
								if (node.left.kind === 'var') writePattern(declaration.id, inner);
							}
						} else {
							writePattern(node.left, inner);
						}
						walk(node.body, inner);
					},
					true,
				);
				return;
			case 'WhileStatement':
			case 'DoWhileStatement':
				frame(
					clock,
					() => {
						walk(node.test, scope);
						walk(node.body, scope);
					},
					true,
				);
				return;
			case 'VariableDeclaration':
				variableDeclaration(node, scope);
				return;
			case 'AssignmentExpression':
				// The target is written after the value evaluates.
				if (node.operator !== '=' && node.left?.type === 'Identifier') read(node.left.name, scope);
				walk(node.right, scope);
				writePattern(node.left, scope);
				return;
			case 'UpdateExpression':
				if (node.argument?.type === 'Identifier') {
					read(node.argument.name, scope);
					write(node.argument.name, scope);
				} else {
					walk(node.argument, scope);
				}
				return;
			case 'MemberExpression':
			case 'OptionalMemberExpression':
				walk(node.object, scope);
				if (node.computed) walk(node.property, scope);
				return;
			case 'Property':
				if (node.computed) walk(node.key, scope);
				walk(node.value, scope);
				return;
			case 'LabeledStatement':
				walk(node.body, scope);
				return;
			case 'BreakStatement':
			case 'ContinueStatement':
			case 'MetaProperty':
			case 'ImportDeclaration':
			case 'ExportAllDeclaration':
				return;
			case 'ExportNamedDeclaration':
				if (node.declaration) walk(node.declaration, scope);
				else if (node.source == null) {
					for (const specifier of node.specifiers || []) {
						if (specifier.local?.type === 'Identifier') read(specifier.local.name, scope);
					}
				}
				return;
			case 'ExportDefaultDeclaration':
				walk(node.declaration, scope);
				return;
		}
		eachChild(node, (child) => walk(child, scope));
	}

	walk(program, null);

	let needed = false;
	for (const entry of sites.values()) {
		const captures = [];
		for (const [name, { binding, anchor }] of entry.reads) {
			if (entry.writes.has(name) || entry.conflicts.has(name)) continue;
			if (binding.volatile || binding.lastWrite > anchor) captures.push(name);
		}
		entry.captures = captures;
		if (captures.length > 0) needed = true;
	}
	return needed ? sites : null;
}

// Walk 2: copy-on-write rewrite, tracking the same site boundaries as walk 1.
// `renames` is null outside a site and the site's name map inside one; user
// functions reset it and `live`, nested thunks keep them.
function rewrite(program, sites, snapshotName) {
	let renames = null;
	let live = false;

	const within = (nextRenames, nextLive, visit) => {
		const savedRenames = renames;
		const savedLive = live;
		renames = nextRenames;
		live = nextLive;
		try {
			return visit();
		} finally {
			renames = savedRenames;
			live = savedLive;
		}
	};

	const children = (node) => {
		let out = null;
		for (const key in node) {
			if (NON_RUNTIME_KEYS.has(key)) continue;
			const child = node[key];
			if (child === null || typeof child !== 'object') continue;
			const mapped = visit(child);
			if (mapped !== child) {
				if (out === null) out = { ...node };
				out[key] = mapped;
			}
		}
		return out ?? node;
	};

	const thunk = (node) => {
		if (renames !== null || live) return children(node);
		const captures = sites.get(node)?.captures ?? [];
		if (captures.length === 0) return within(new Map(), false, () => children(node));
		const own = new Map(captures.map((name) => [name, snapshotName(name)]));
		const body = within(own, false, () => children(node));
		const origin = (created) =>
			node.loc == null ? created : { ...created, start: node.start, end: node.end, loc: node.loc };
		return origin(
			b.call(
				origin(
					b.arrow(
						captures.map((name) => origin(b.id(own.get(name)))),
						body,
					),
				),
				...captures.map((name) => origin(b.id(name))),
			),
		);
	};

	function visit(node) {
		if (node == null || typeof node !== 'object') return node;
		if (Array.isArray(node)) {
			let out = null;
			for (let index = 0; index < node.length; index++) {
				const mapped = visit(node[index]);
				if (out === null && mapped !== node[index]) out = node.slice(0, index);
				if (out !== null) out.push(mapped);
			}
			return out ?? node;
		}
		const type = node.type;
		if (typeof type !== 'string') return node;
		if (node[DEFERRED_LIVE] === true && !live && renames === null) {
			return within(null, true, () => visitNode(node, type));
		}
		return visitNode(node, type);
	}

	function visitNode(node, type) {
		switch (type) {
			case 'Identifier': {
				const snapshot = renames?.get(node.name);
				return snapshot === undefined ? node : { ...node, name: snapshot };
			}
			case 'ArrowFunctionExpression':
				if (isDeferredThunk(node)) return thunk(node);
				return within(null, false, () => children(node));
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'StaticBlock':
				return within(null, false, () => children(node));
			case 'ClassDeclaration':
			case 'ClassExpression': {
				// A class keeps its own name; only its heritage and members are visited.
				const superClass = visit(node.superClass);
				const body = visit(node.body);
				return superClass === node.superClass && body === node.body
					? node
					: { ...node, superClass, body };
			}
			case 'MethodDefinition':
			case 'PropertyDefinition':
			case 'AccessorProperty': {
				const key = node.computed ? visit(node.key) : node.key;
				const value = within(null, false, () => visit(node.value));
				return key === node.key && value === node.value ? node : { ...node, key, value };
			}
			case 'MemberExpression':
			case 'OptionalMemberExpression': {
				const object = visit(node.object);
				const property = node.computed ? visit(node.property) : node.property;
				return object === node.object && property === node.property
					? node
					: { ...node, object, property };
			}
			case 'Property': {
				const key = node.computed ? visit(node.key) : node.key;
				const value = visit(node.value);
				if (key === node.key && value === node.value) return node;
				// `{ n }` becomes `{ n: n$ }`.
				return { ...node, key, value, shorthand: false };
			}
			case 'LabeledStatement': {
				const body = visit(node.body);
				return body === node.body ? node : { ...node, body };
			}
			case 'BreakStatement':
			case 'ContinueStatement':
			case 'MetaProperty':
			case 'ImportDeclaration':
			case 'ExportAllDeclaration':
				return node;
			case 'ExportNamedDeclaration': {
				const declaration = visit(node.declaration);
				return declaration === node.declaration ? node : { ...node, declaration };
			}
		}
		return children(node);
	}

	return visit(program);
}
