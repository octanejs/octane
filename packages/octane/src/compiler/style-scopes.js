/**
 * Lexically scoped `<style>` blocks, `$class`, and `apply` for the Octane
 * compiler (RFC tsrx-org/RFCs#1). One copy-on-write pre-pass per top-level
 * statement decides which blocks belong to which template scope, emits one
 * `injectStyle(hash, css)` entry per scope in lexical pre-order, and stamps
 * every host element with the hashes of all its enclosing scopes followed by
 * the classes of every applied theme — so the client and server emitters only
 * serialize what is already on the AST and agree by construction.
 *
 * Scope model (shared with `@tsrx/core`'s `transform/jsx/style-scopes.js`;
 * amendment A1 of the RFC):
 *
 * - A standalone block is a child of a native element or a fragment, and
 *   that CHILDREN LIST is its scope: the block styles the items beside it and
 *   everything below them; it never styles the element that contains it, nor
 *   any ancestor. A `@{ … }` body or a directive branch body holds setup
 *   statements and exactly one output node, and a block is an output node
 *   like any other, so a block beside the output node is the parser's
 *   multiple-outputs error and a lone block as the output is the analyzer's
 *   `tsrx-style-standalone-needs-fragment`; those lists are only searched for
 *   nested templates and assigned blocks. A list holding no block is not a
 *   scope and adds no hash.
 * - Every block of one list shares the scope hash (the first bodied block's
 *   position-derived hash) and renders into ONE injection — the runtime
 *   dedupes by id. Lists nested in a scope that hold blocks are nested scopes
 *   with hashes of their own; two blocks in different lists never share one.
 * - A scope's sheets are pruned against the list's other children and their
 *   subtrees (function boundaries excluded): a selector that matches none of
 *   them survives only as a `(unused)` comment, so a rule aimed at the
 *   container is visibly dead. `@tsrx/core`'s `prune_css` matches selectors
 *   against elements and records what it found on their metadata, and the
 *   adopted AST may be frozen, so the elements it sees are a private clone of
 *   the items (`cloneAstNode`, fresh metadata per node) carrying the ancestor
 *   paths its combinator matching reads.
 * - Elements carry `authored hashes… applied…`: enclosing scope hashes outer
 *   first, then applied theme classes (literals for same-module themes whose
 *   class is statically known, `theme.$class` reads otherwise). `apply` on a
 *   standalone block reaches the same set of elements as its CSS.
 * - Emission order is lexical pre-order: a scope's sheet sits where its first
 *   block is, after the assigned blocks declared before it in the enclosing
 *   statement list, before the scopes and assigned blocks nested in it.
 * - Raw CSS in `<style>` is TSRX template syntax: the core analyzer rejects a
 *   standalone block outside a `@{ … }` or directive body
 *   (`tsrx-style-standalone-outside-template`), so plain-TSX returns never
 *   reach this pass with one. `<style>{expr}</style>` parses as an ordinary
 *   `JSXElement`: it is not a block, opens no scope, and is never stamped.
 * - Assigned blocks (`const theme = <style>…</style>`) lower anywhere a
 *   declaration is legal: their sheet injects at the declaration position and
 *   the initializer becomes the class-map object (`$class` first). Exported or
 *   applied blocks are themes and keep every selector; other blocks keep only
 *   what the class map exposes. The classification comes from the core
 *   analyzer (`metadata.styleKind`, `metadata.styleApplies`), which runs on
 *   the parser AST before it is adopted, so this pass reads it read-only.
 * - `style(expr)` is Octane's class-string expression (core has no such
 *   intrinsic): it resolves to the scope chain plus the value only where TSRX
 *   reads a class value — as the expression of a JSX attribute value or of a
 *   template expression-container child, directly or nested in the
 *   array/conditional/logical/template expressions of that container. The
 *   `style` attribute is excluded (its value is CSS, never a class list), and
 *   every other `style(...)` — a statement, a declaration initializer, a call
 *   argument, a callback body — is an ordinary user call left untouched.
 * - Float style resources (`<style href precedence>`) stay in the tree.
 *
 * The parser AST may be frozen (see `adoptParserAst`): nodes are never
 * written; changed spines are rebuilt and StyleSheet subtrees are cloned
 * before the core render pipeline touches them.
 */

import {
	analyzeCss,
	buildStyleClassMap,
	builders as b,
	clone_ast_node as cloneAstNode,
	createStyleClassMapFromStylesheet,
	prepareStylesheetForRender,
	pruneCss,
	renderStylesheets,
} from '@tsrx/core';

const SKIP_KEYS = new Set(['loc', 'start', 'end', 'parent', 'metadata', 'css']);
const DIRECTIVE_TYPES = new Set([
	'JSXIfExpression',
	'JSXForExpression',
	'JSXSwitchExpression',
	'JSXTryExpression',
]);

/**
 * @typedef {{
 *   inheritOriginLoc: (root: any, origin: any) => any,
 *   markSynthesized: (node: any) => any,
 *   markSynthesizedAttr: (attr: any) => any,
 *   headResourceKind: (node: any) => string | null,
 *   isCompositeJsxTag: (node: any) => boolean,
 *   isStyleCall: (node: any) => boolean,
 * }} StyleScopeTools
 * @typedef {{ hash: string | null, applied: Array<string | any> }} ScopeEntry
 * @typedef {{
 *   ctx: any,
 *   tools: StyleScopeTools,
 *   stack: ScopeEntry[],
 *   sequence: number,
 *   orderBase: number,
 *   firstHash: string | null,
 *   staticClasses: Map<any, string | null>,
 *   appliedParts: Map<any, Array<string | any>>,
 *   runtimeApplied: any[],
 *   stampedHost: boolean,
 * }} PassState `stampedHost` is set while the attributes of a host element
 *   the current chain will be stamped on are walked: a `style(expr)` nested in
 *   that element's class value yields its value alone, the stamp adds the chain.
 */

/**
 * Bind the compiler helpers this pass needs (they live in compile.js).
 *
 * @param {StyleScopeTools} tools
 */
export function createStyleScopePass(tools) {
	/**
	 * Rewrite one top-level statement (or a component function) copy-on-write.
	 * Injections are pushed onto `ctx.cssInjections` in emission order with an
	 * `order` key that sorts them among the module's other entries.
	 *
	 * @param {any} root
	 * @param {any} ctx
	 * @returns {{ node: any, cssHash: string | null, runtimeApplied: any[] }}
	 *   the rewritten node, the outermost scope hash the root owns (or `null`,
	 *   kept for callers that key "this component has scoped CSS" on it), and
	 *   the `theme.$class` targets the root's standalone scopes read at runtime
	 *   (imported themes), one per distinct target expression
	 */
	function applyStyleScopes(root, ctx) {
		/** @type {PassState} */
		const state = {
			ctx,
			tools,
			stack: [],
			sequence: 0,
			orderBase: typeof root?.start === 'number' ? root.start : 0,
			firstHash: null,
			staticClasses: new Map(),
			appliedParts: new Map(),
			runtimeApplied: [],
			stampedHost: false,
		};
		const node = walk(root, state, 'statement');
		return { node, cssHash: state.firstHash, runtimeApplied: state.runtimeApplied };
	}

	return { applyStyleScopes };
}

// --- traversal ---------------------------------------------------------------

/**
 * @param {any} node
 * @returns {boolean}
 */
function isTemplateNode(node) {
	return node?.type === 'JSXElement' || node?.type === 'JSXFragment';
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isDirective(node) {
	return node != null && DIRECTIVE_TYPES.has(node.type);
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isFunctionNode(node) {
	return (
		node?.type === 'FunctionDeclaration' ||
		node?.type === 'FunctionExpression' ||
		node?.type === 'ArrowFunctionExpression'
	);
}

/**
 * @param {any} node
 * @param {string} key
 * @returns {boolean}
 */
function isStatementListKey(node, key) {
	if (key === 'body') return node.type === 'BlockStatement' || node.type === 'Program';
	if (key === 'consequent') return node.type === 'SwitchCase';
	return false;
}

/**
 * @template T
 * @param {T[]} list
 * @param {(item: T) => T | null} map `null` drops the item
 * @returns {T[]}
 */
function mapList(list, map) {
	let out = null;
	for (let i = 0; i < list.length; i++) {
		const item = list[i];
		const next = item !== null && typeof item === 'object' ? map(item) : item;
		if (out === null && next !== item) out = list.slice(0, i);
		if (out !== null && next !== null) out.push(next);
	}
	return out ?? list;
}

/**
 * Copy-on-write map over a node's child properties.
 *
 * @param {any} node
 * @param {(child: any, key: string) => any} map
 * @returns {any}
 */
function rewriteChildren(node, map) {
	let out = null;
	for (const key of Object.keys(node)) {
		if (SKIP_KEYS.has(key)) continue;
		const value = node[key];
		if (value === null || typeof value !== 'object') continue;
		let next;
		if (Array.isArray(value)) {
			next = mapList(value, (child) => map(child, key));
		} else if (typeof value.type === 'string') {
			next = map(value, key);
		} else {
			continue;
		}
		if (next !== value) {
			if (out === null) out = { ...node };
			out[key] = next;
		}
	}
	return out ?? node;
}

/**
 * The main copy-on-write walk.
 *
 * `mode` says what a node found here is:
 * - `statement`: a statement slot (a bare `<style>` here was already reported
 *   by the analyzer),
 * - `expression`: a value slot (a `<style>` here is an assigned block).
 *
 * A native element or fragment is the same thing in either slot: it is
 * stamped with the current chain and its children list may open a scope.
 *
 * @param {any} node
 * @param {PassState} state
 * @param {'statement' | 'expression'} mode
 * @returns {any}
 */
function walk(node, state, mode) {
	if (node === null || typeof node !== 'object' || typeof node.type !== 'string') return node;

	switch (node.type) {
		case 'JSXStyleElement':
			// A value slot is an assigned block. A statement slot (or the render
			// slot of a code block) is the analyzer's `needs-fragment` error; the
			// node is left alone and contributes no CSS.
			if (mode === 'expression') return lowerAssignedStyle(node, state);
			return node;
		case 'JSXCodeBlock':
			return processCodeBlock(node, state);
		case 'JSXElement':
		case 'JSXFragment':
			return walkTemplateNode(node, state);
		case 'JSXExpressionContainer':
			return rewriteChildren(node, (child) => walk(child, state, 'expression'));
		case 'ExpressionStatement':
			return rewriteChildren(node, (child) => walk(child, state, 'statement'));
		case 'JSXAttribute':
			return processAttribute(node, state);
		default:
			if (isDirective(node)) return processDirective(node, state);
			if (isFunctionNode(node)) {
				// A function boundary: its template is not stamped by the enclosing
				// scopes, but still hosts scopes and assigned blocks of its own.
				return withStack(state, [], () =>
					rewriteChildren(node, (child, key) =>
						walk(
							child,
							state,
							key === 'body' && child.type === 'JSXCodeBlock' ? 'statement' : 'expression',
						),
					),
				);
			}
			break;
	}

	return rewriteChildren(node, (child, key) =>
		walk(child, state, isStatementListKey(node, key) ? 'statement' : 'expression'),
	);
}

/**
 * @template T
 * @param {PassState} state
 * @param {ScopeEntry[]} stack
 * @param {() => T} run
 * @returns {T}
 */
function withStack(state, stack, run) {
	const previous = state.stack;
	state.stack = stack;
	try {
		return run();
	} finally {
		state.stack = previous;
	}
}

/**
 * A native element or fragment: stamp it with the CURRENT chain (host
 * elements only — the element itself is never inside its own children's
 * scope), walk its attribute values as expressions of that same chain, then
 * walk its children list. When the list holds standalone blocks it is a scope:
 * the blocks are stripped, their sheet prepared, and the other children walked
 * with the scope pushed. A list without blocks keeps the current chain.
 *
 * @param {any} node
 * @param {PassState} state
 * @returns {any}
 */
function walkTemplateNode(node, state) {
	// Attribute values first — a `style(expr)` in a class value resolves to the
	// chain before the stamp reads that value — then the stamp itself.
	const stamped = isStampedHost(node, state);
	const previousStampedHost = state.stampedHost;
	state.stampedHost = stamped;
	let out;
	try {
		out = rewriteChildren(node, (child, key) =>
			key === 'children' ? child : walk(child, state, 'expression'),
		);
	} finally {
		state.stampedHost = previousStampedHost;
	}
	if (stamped) out = addScopeClasses(out, state);
	const children = node.children;
	if (!Array.isArray(children)) return out;
	const own = collectOwnBlocks(children);
	const scope =
		own.length > 0
			? prepareScope(
					own,
					state,
					children.filter((child) => !own.includes(child)),
				)
			: null;
	const next = withStack(state, scope === null ? state.stack : [...state.stack, scope], () =>
		mapList(children, (child) => {
			if (child.type === 'JSXStyleElement') return own.includes(child) ? null : child;
			return walkListItem(child, state);
		}),
	);
	return next === children ? out : { ...out, children: next };
}

/**
 * Whether the scope chain is stamped on this element: a host element or a
 * dynamic `<{expr}>` tag. Composite components stop stamping (their host
 * elements belong to their own scopes), and a `style` host element —
 * `<style>{expr}</style>`, an ordinary element after amendment A1 — is never
 * stamped, like a `<style>` block.
 *
 * @param {any} node
 * @param {PassState} state
 * @returns {boolean}
 */
function isStampedHost(node, state) {
	if (node.type !== 'JSXElement') return false;
	if (state.tools.isCompositeJsxTag(node) && !node.metadata?.dynamicElement) return false;
	const name = node.openingElement?.name;
	return !(name?.type === 'JSXIdentifier' && name.name === 'style');
}

/**
 * `@{ … }`: setup statements (searched for assigned blocks and nested
 * templates) and the single output node, walked in the current chain.
 *
 * @param {any} node
 * @param {PassState} state
 * @returns {any}
 */
function processCodeBlock(node, state) {
	const body = processList(node.body || [], state);
	const render = node.render ? walkListItem(node.render, state) : node.render;
	if (body === node.body && render === node.render) return node;
	return { ...node, body, render };
}

/**
 * Each branch body of a directive is a scope; `@else if` chains parse as
 * plain `IfStatement` alternates.
 *
 * @param {any} node
 * @param {PassState} state
 * @returns {any}
 */
function processDirective(node, state) {
	return rewriteChildren(node, (child, key) => {
		if (child.type === 'BlockStatement') return processBlockBody(child, state);
		if (child.type === 'CatchClause') {
			const body = processBlockBody(child.body, state);
			return body === child.body ? child : { ...child, body };
		}
		if (child.type === 'SwitchCase') {
			const consequent = processList(child.consequent || [], state);
			return consequent === child.consequent ? child : { ...child, consequent };
		}
		if (key === 'alternate' && (isDirective(child) || child.type === 'IfStatement')) {
			return processDirective(child, state);
		}
		return walk(child, state, 'expression');
	});
}

/**
 * @param {any} block
 * @param {PassState} state
 * @returns {any}
 */
function processBlockBody(block, state) {
	const body = processList(block.body || [], state);
	return body === block.body ? block : { ...block, body };
}

/**
 * A statement list (a `@{ … }` body, a directive branch body, a switch case):
 * not a scope of its own. Its items are searched for nested templates and
 * assigned blocks in the current chain.
 *
 * @param {any[]} nodes
 * @param {PassState} state
 * @returns {any[]}
 */
function processList(nodes, state) {
	return mapList(nodes, (item) => walkListItem(item, state));
}

/**
 * @param {any} item
 * @param {PassState} state
 * @returns {any}
 */
function walkListItem(item, state) {
	if (isTemplateNode(item)) return walkTemplateNode(item, state);
	if (item.type === 'JSXStyleElement') return item;
	if (item.type === 'JSXExpressionContainer') {
		// A template child hole is a class-string position for `style(expr)`.
		const expression = walkStyleValue(item.expression, state);
		return expression === item.expression ? item : { ...item, expression };
	}
	return walk(item, state, 'statement');
}

/**
 * A JSX attribute: its value is a class-string position for `style(expr)`
 * unless the attribute is `style` (CSS, never a class list — a `style(...)`
 * there is a user helper), so that one and every other value walk as ordinary
 * expressions. In the `class` of an element the chain is stamped on, only a
 * whole-value `style(expr)` carries the chain itself; a call nested in an
 * array, conditional, logical, or template there yields its value alone, and
 * the stamp appends the chain once to the composed value — so the chain is
 * present whichever branch runs, and never twice.
 *
 * @param {any} attribute
 * @param {PassState} state
 * @returns {any}
 */
function processAttribute(attribute, state) {
	const value = attribute.value;
	if (value?.type !== 'JSXExpressionContainer') {
		return rewriteChildren(attribute, (child) => walk(child, state, 'expression'));
	}
	const name = attribute.name;
	const isStyleAttribute = name?.type === 'JSXIdentifier' && name.name === 'style';
	const isClassAttribute =
		name?.type === 'JSXIdentifier' && (name.name === 'class' || name.name === 'className');
	const expression = isStyleAttribute
		? walk(value.expression, state, 'expression')
		: walkStyleValue(value.expression, state, true, isClassAttribute && state.stampedHost);
	if (expression === value.expression) return attribute;
	return { ...attribute, value: { ...value, expression } };
}

/**
 * The class-string positions inside an attribute value or a child hole: the
 * expression itself, or the parts of an array, conditional, logical, template,
 * or parenthesized/TS-wrapper expression around it. Anything else is walked as
 * an ordinary expression, so a `style(...)` inside (a call argument, a callback
 * body) stays a user call.
 *
 * @param {any} node
 * @param {PassState} state
 * @param {boolean} [whole] whether `node` is the whole value (wrappers are
 *   transparent), as opposed to a part of an array/conditional/logical/template
 * @param {boolean} [stamped] whether the value is the class of an element the
 *   chain is stamped on: a `style(expr)` that is only a PART of it then yields
 *   its value alone (see processAttribute)
 * @returns {any}
 */
function walkStyleValue(node, state, whole = true, stamped = false) {
	if (node === null || typeof node !== 'object' || typeof node.type !== 'string') return node;
	if (state.tools.isStyleCall(node)) {
		if (stamped && !whole) return walk(node.arguments[0], state, 'expression');
		return resolveStyleCall(node, state);
	}
	switch (node.type) {
		case 'ArrayExpression': {
			const elements = mapList(node.elements, (element) =>
				element?.type === 'SpreadElement'
					? walk(element, state, 'expression')
					: walkStyleValue(element, state, false, stamped),
			);
			return elements === node.elements ? node : { ...node, elements };
		}
		case 'ConditionalExpression': {
			const test = walk(node.test, state, 'expression');
			const consequent = walkStyleValue(node.consequent, state, false, stamped);
			const alternate = walkStyleValue(node.alternate, state, false, stamped);
			if (test === node.test && consequent === node.consequent && alternate === node.alternate) {
				return node;
			}
			return { ...node, test, consequent, alternate };
		}
		case 'LogicalExpression': {
			const left = walkStyleValue(node.left, state, false, stamped);
			const right = walkStyleValue(node.right, state, false, stamped);
			return left === node.left && right === node.right ? node : { ...node, left, right };
		}
		case 'TemplateLiteral': {
			const expressions = mapList(node.expressions, (expression) =>
				walkStyleValue(expression, state, false, stamped),
			);
			return expressions === node.expressions ? node : { ...node, expressions };
		}
		case 'ParenthesizedExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSNonNullExpression':
		case 'TSTypeAssertion': {
			const expression = walkStyleValue(node.expression, state, whole, stamped);
			return expression === node.expression ? node : { ...node, expression };
		}
		default:
			return walk(node, state, 'expression');
	}
}

/**
 * The standalone blocks a children list owns: its direct `<style>` items, in
 * source order. Blocks inside a nested element or fragment belong to that
 * node's own children list; Float style resources are not scoped blocks.
 *
 * @param {any[]} nodes
 * @returns {any[]}
 */
function collectOwnBlocks(nodes) {
	/** @type {any[]} */
	const blocks = [];
	for (const node of nodes) {
		if (node?.type === 'JSXStyleElement' && !isFloatStyleResource(node)) blocks.push(node);
	}
	return blocks.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

/**
 * The elements a scope's selectors can match (the core transform's
 * `collect_css_prunable_elements`): every host element of the items and their
 * subtrees, nested scopes included, stopping at function boundaries and
 * skipping `<style>` hosts. Each element gets its ancestor chain as
 * `metadata.path`, which `pruneCss` reads for combinators; the nodes are a
 * private clone, so the writes never reach the (possibly frozen) parser AST.
 *
 * @param {any} value a cloned node or list of cloned nodes
 * @param {any[]} elements
 * @param {any[]} path
 * @returns {any[]}
 */
function collectPrunableElements(value, elements, path) {
	if (Array.isArray(value)) {
		for (const item of value) collectPrunableElements(item, elements, path);
		return elements;
	}
	if (value === null || typeof value !== 'object' || typeof value.type !== 'string')
		return elements;
	if (isFunctionNode(value)) return elements;
	if (value.type === 'JSXElement' && value.metadata?.native_tsrx) {
		const name = value.openingElement?.name;
		if (name?.type === 'JSXIdentifier' && name.name === 'style') return elements;
		value.metadata.path = path.slice();
		elements.push(value);
	}
	const childPath = [...path, value];
	for (const key of Object.keys(value)) {
		if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata' || key === 'css') {
			continue;
		}
		const child = value[key];
		if (Array.isArray(child)) {
			for (const item of child) {
				if (item !== null && typeof item === 'object' && typeof item.type === 'string') {
					collectPrunableElements(item, elements, childPath);
				}
			}
		} else if (child !== null && typeof child === 'object' && typeof child.type === 'string') {
			collectPrunableElements(child, elements, childPath);
		}
	}
	return elements;
}

/**
 * `<style href precedence>` (React Float): plain CSS by href identity, outside
 * the scope model.
 *
 * @param {any} node
 * @returns {boolean}
 */
function isFloatStyleResource(node) {
	let hasHref = false;
	let hasPrecedence = false;
	for (const attr of node.openingElement?.attributes || []) {
		if (attr?.type !== 'JSXAttribute' || attr.name?.type !== 'JSXIdentifier') continue;
		if (attr.name.name === 'href') hasHref = true;
		else if (attr.name.name === 'precedence') hasPrecedence = true;
	}
	return hasHref && hasPrecedence;
}

// --- sheets ------------------------------------------------------------------

/**
 * @param {PassState} state
 * @returns {number}
 */
function nextOrder(state) {
	state.sequence += 1;
	return state.orderBase + state.sequence * 1e-6;
}

/**
 * Render a scope's sheets into one injection and compute what its elements
 * carry.
 *
 * @param {any[]} own the list's standalone blocks
 * @param {PassState} state
 * @param {any[]} items the list's other children — what the blocks reach
 * @returns {ScopeEntry}
 */
function prepareScope(own, state, items) {
	const { ctx } = state;
	/** @type {Array<{ node: any, sheet: any }>} */
	const sheets = [];
	for (const block of own) {
		const sheet = (block.children || []).find((c) => c && c.type === 'StyleSheet');
		if (sheet) sheets.push({ node: block, sheet });
	}
	let hash = null;
	if (sheets.length > 0) {
		hash = sheets[0].node.metadata?.styleScopeHash || sheets[0].sheet.hash || null;
		const elements = collectPrunableElements(cloneAstNode(items), [], []);
		const prepared = sheets.map(({ node, sheet }) => {
			const regionHash = node.metadata?.styleScopeHash || sheet.hash;
			const clone = cloneAstNode(sheet);
			clone.hash = hash;
			// `analyzeCss` marks `:global(...)` selectors; pruning then marks the
			// selectors that reach an element as scoped and used, exactly like the
			// core transform — an unmatched rule renders as an `(unused)` comment.
			analyzeCss(clone);
			const styleClasses = new Map();
			const topScopedClasses = new Map();
			for (const element of elements) {
				pruneCss(clone, element, styleClasses, topScopedClasses, regionHash);
			}
			return clone;
		});
		ctx.cssInjections.push({
			hash,
			css: renderStylesheets(prepared),
			order: nextOrder(state),
			// The authored `<style>` element(s) this stylesheet came from, so the
			// emitted `injectStyle` maps back to them.
			origins: sheets.map(({ node }) => node),
		});
		ctx.runtimeNeeded.add('injectStyle');
		if (state.firstHash === null) state.firstHash = hash;
	}
	/** @type {Array<string | any>} */
	const applied = [];
	for (const block of own) {
		for (const part of resolveAppliedParts(block, state)) {
			if (typeof part !== 'string' || !applied.includes(part)) applied.push(part);
		}
	}
	for (const part of applied) {
		if (typeof part !== 'string') recordRuntimeApplied(part.object, state);
	}
	return { hash, applied };
}

/**
 * The class parts a block's `apply` contributes: one literal per statically
 * known hash of a same-module theme, otherwise a runtime `<target>.$class`
 * read.
 *
 * @param {any} block
 * @param {PassState} state
 * @returns {Array<string | any>}
 */
function resolveAppliedParts(block, state) {
	const cached = state.appliedParts.get(block);
	if (cached) return cached;
	/** @type {Array<string | any>} */
	const parts = [];
	for (const resolution of block.metadata?.styleApplies ?? []) {
		const staticClass = resolution.target ? staticStyleClass(resolution.target, state) : null;
		if (staticClass !== null) {
			for (const hash of staticClass.split(' ')) {
				if (hash && !parts.includes(hash)) parts.push(hash);
			}
			continue;
		}
		parts.push(
			state.tools.inheritOriginLoc(
				b.member(cloneAstNode(resolution.expression), b.id('$class')),
				resolution.expression,
			),
		);
	}
	state.appliedParts.set(block, parts);
	return parts;
}

/**
 * The `$class` of an assigned block when every applied theme in its chain is
 * a same-module block: applied hashes first (each once), own hash last.
 *
 * @param {any} block
 * @param {PassState} state
 * @returns {string | null}
 */
function staticStyleClass(block, state) {
	const cached = state.staticClasses.get(block);
	if (cached !== undefined) return cached;
	/** @type {string[]} */
	const parts = [];
	let result = '';
	for (const resolution of block.metadata?.styleApplies ?? []) {
		const applied = resolution.target ? staticStyleClass(resolution.target, state) : null;
		if (applied === null) {
			result = null;
			break;
		}
		for (const hash of applied.split(' ')) {
			if (hash && !parts.includes(hash)) parts.push(hash);
		}
	}
	if (result !== null) {
		const sheet = (block.children || []).find((c) => c && c.type === 'StyleSheet');
		const own = sheet ? block.metadata?.styleScopeHash || sheet.hash : null;
		if (own && !parts.includes(own)) parts.push(own);
		result = parts.join(' ');
	}
	state.staticClasses.set(block, result);
	return result;
}

/**
 * `const theme = <style>…</style>` (or a property value / default export):
 * inject the sheet at the declaration position and hand back the class-map
 * object. A body-less `<style apply={…} />` exposes `$class` only.
 *
 * @param {any} styleNode
 * @param {PassState} state
 * @returns {any}
 */
function lowerAssignedStyle(styleNode, state) {
	const { ctx, tools } = state;
	const applied = resolveAppliedParts(styleNode, state);
	const sheet = (styleNode.children || []).find((c) => c && c.type === 'StyleSheet');
	if (!sheet) {
		// A body-less bundle has no sheet of its own, but on the server reading
		// it must still inject the themes it applies: it is wrapped like any
		// assigned block, with nothing to inject for itself.
		return wrapServerStyleMap(
			tools.inheritOriginLoc(buildStyleClassMap(new Map(), null, { applied }), styleNode),
			null,
			null,
			styleNode,
			state,
		);
	}
	const hash = styleNode.metadata?.styleScopeHash || sheet.hash;
	const clone = cloneAstNode(sheet);
	clone.hash = hash;
	// `analyzeCss` marks `:global(...)` selectors so the renderer leaves them
	// unscoped; the render mode comes from the core analyzer's classification.
	analyzeCss(clone);
	prepareStylesheetForRender(
		clone,
		styleNode.metadata?.styleKind === 'theme' ? 'theme' : 'class-map',
	);
	const css = renderStylesheets([clone]);
	ctx.cssInjections.push({
		hash,
		css,
		order: nextOrder(state),
		origin: styleNode,
	});
	ctx.runtimeNeeded.add('injectStyle');
	// The class-map object is built loc-less by the core helper; it maps to the
	// authored <style>.
	return wrapServerStyleMap(
		tools.inheritOriginLoc(createStyleClassMapFromStylesheet(clone, { applied }), styleNode),
		hash,
		css,
		styleNode,
		state,
	);
}

/**
 * On the server a module's assigned blocks only inject inside the bodies of
 * that module's own components; a theme read from ANOTHER module would never
 * reach the request collector. Wrap the map so property access injects its
 * CSS (after the CSS of the themes it applies) into the active render.
 *
 * Every applied block is a dependency, whether it lives in this module or is
 * imported: the class list inlines a same-module theme's hashes as literals,
 * which says nothing about its CSS, so the wrapper touches the applied maps
 * first (each of them a wrapper touching its own, so a chain injects
 * transitively, applied before applier, each sheet once). A body-less bundle
 * has no sheet (`null` id and css) and only forwards the touch.
 *
 * @param {any} map
 * @param {string | null} hash
 * @param {string | null} css
 * @param {any} styleNode the authored block, whose `styleApplies` name the dependencies
 * @param {PassState} state
 * @returns {any}
 */
function wrapServerStyleMap(map, hash, css, styleNode, state) {
	const { ctx, tools } = state;
	if (ctx.mode !== 'server') return map;
	ctx.runtimeNeeded.add('styleMap');
	/** @type {any[]} */
	const dependencies = [];
	/** @type {string[]} */
	const seen = [];
	for (const resolution of styleNode.metadata?.styleApplies ?? []) {
		const key = expressionKey(resolution.expression);
		if (seen.includes(key)) continue;
		seen.push(key);
		dependencies.push(
			tools.inheritOriginLoc(cloneAstNode(resolution.expression), resolution.expression),
		);
	}
	const literal = (value) =>
		value === null ? b.literal(null, 'null') : b.literal(value, JSON.stringify(value));
	return tools.inheritOriginLoc(
		b.call(
			'_$styleMap',
			literal(hash),
			literal(css),
			map,
			...(dependencies.length > 0 ? [b.array(dependencies)] : []),
		),
		map,
	);
}

/**
 * @param {any} expression the theme expression read at runtime (`theme` of `theme.$class`)
 * @param {PassState} state
 */
function recordRuntimeApplied(expression, state) {
	const key = expressionKey(expression);
	if (state.runtimeApplied.some((existing) => expressionKey(existing) === key)) return;
	state.runtimeApplied.push(expression);
}

/**
 * @param {any} node
 * @returns {string}
 */
function expressionKey(node) {
	if (node?.type === 'Identifier') return node.name;
	if (node?.type === 'MemberExpression' && !node.computed) {
		return `${expressionKey(node.object)}.${expressionKey(node.property)}`;
	}
	return JSON.stringify(node, (key, value) => (SKIP_KEYS.has(key) ? undefined : value));
}

// --- class stamping ----------------------------------------------------------

/**
 * @param {PassState} state
 * @returns {{ hashes: string[], applied: Array<string | any> }}
 */
function currentChain(state) {
	/** @type {string[]} */
	const hashes = [];
	/** @type {Array<string | any>} */
	const applied = [];
	for (const entry of state.stack) {
		if (entry.hash && !hashes.includes(entry.hash)) hashes.push(entry.hash);
		for (const part of entry.applied) {
			if (typeof part !== 'string' || (!applied.includes(part) && !hashes.includes(part))) {
				applied.push(part);
			}
		}
	}
	return { hashes, applied };
}

/**
 * Fold a sequence of class parts (literals and expressions) into one value: a
 * string literal when everything is static, otherwise one template literal.
 *
 * @param {Array<string | any>} sequence
 * @returns {any}
 */
function buildClassValue(sequence) {
	/** @type {any[]} */
	const quasis = [];
	/** @type {any[]} */
	const expressions = [];
	let text = '';
	for (const part of sequence) {
		if (typeof part === 'string') {
			if (part) text = text ? `${text} ${part}` : part;
			continue;
		}
		const between = expressions.length > 0;
		quasis.push(b.quasi(text ? (between ? ` ${text} ` : `${text} `) : between ? ' ' : '', false));
		expressions.push(part);
		text = '';
	}
	if (expressions.length === 0) return b.literal(text, JSON.stringify(text));
	quasis.push(b.quasi(text ? ` ${text}` : '', true));
	return b.template(quasis, expressions);
}

/**
 * Stamp the current scope chain on a host element, copy-on-write.
 *
 * @param {any} element
 * @param {PassState} state
 * @returns {any}
 */
function addScopeClasses(element, state) {
	const { hashes, applied } = currentChain(state);
	if (hashes.length === 0 && applied.length === 0) return element;
	const { ctx, tools } = state;
	const openingElement = element.openingElement;
	const attrs = openingElement?.attributes || [];
	const index = attrs.findIndex(
		(attr) =>
			attr?.type === 'JSXAttribute' &&
			attr.name?.type === 'JSXIdentifier' &&
			(attr.name.name === 'class' || attr.name.name === 'className'),
	);

	/** @type {any[]} */
	const chain = [...hashes, ...applied];
	let newAttrs;
	if (index === -1) {
		// A synthesized class attribute maps to the element's opening tag; it is
		// marked NOT AUTHORED so inspection does not claim the tag as its origin.
		const value = buildClassValue(chain);
		newAttrs = [
			...attrs,
			tools.markSynthesizedAttr(
				tools.inheritOriginLoc(
					b.jsx_attribute(
						b.jsx_id('class'),
						value.type === 'Literal' ? value : b.jsx_expression_container(value),
					),
					openingElement,
				),
			),
		];
	} else {
		const existing = attrs[index];
		const value = existing.value;
		let newAttr;
		if (!value) {
			// The NAME is authored (`class`), the value is not.
			const built = buildClassValue(chain);
			newAttr = {
				...existing,
				value: tools.markSynthesized(
					tools.inheritOriginLoc(
						built.type === 'Literal' ? built : b.jsx_expression_container(built),
						existing,
					),
				),
			};
		} else if (value.type === 'Literal' && typeof value.value === 'string') {
			const built = buildClassValue([value.value, ...chain]);
			newAttr = {
				...existing,
				value:
					built.type === 'Literal'
						? { ...value, value: built.value, raw: built.raw }
						: tools.inheritOriginLoc(b.jsx_expression_container(built), value),
			};
		} else {
			const expression = value.type === 'JSXExpressionContainer' ? value.expression : value;
			let base;
			if (isResolvedStyleValue(expression, tools)) {
				// `class={style(expr)}` already resolves to the chain plus the value.
				return element;
			}
			if (expression.type === 'Literal' && typeof expression.value === 'string') {
				base = expression.value;
			} else {
				// Normalize a dynamic value (clsx arrays/objects, null) BEFORE the
				// chain is appended so the template-literal slot is a plain string.
				ctx.runtimeNeeded.add('normalizeClass');
				base = tools.inheritOriginLoc(b.call('_$normalizeClass', expression), expression);
			}
			newAttr = {
				...existing,
				value: tools.inheritOriginLoc(
					b.jsx_expression_container(buildClassValue([base, ...chain])),
					value,
				),
			};
		}
		newAttrs = attrs.slice();
		newAttrs[index] = newAttr;
	}
	// The core helper mirrors the attribute list onto `element.attributes` in
	// every branch; keep that alias in sync on the rebuilt copy.
	const out = { ...element, openingElement: { ...openingElement, attributes: newAttrs } };
	if ('attributes' in element) out.attributes = newAttrs;
	return out;
}

/**
 * Whether a class value IS a `style(expr)` — the whole value, through
 * parenthesized and TS wrapper expressions — and so already carries the chain.
 * A call that is only a part of the value was lowered to its value alone (see
 * walkStyleValue) and leaves the stamp to add the chain.
 *
 * @param {any} expression
 * @param {StyleScopeTools} tools
 * @returns {boolean}
 */
function isResolvedStyleValue(expression, tools) {
	let current = expression;
	while (
		current?.type === 'ParenthesizedExpression' ||
		current?.type === 'TSAsExpression' ||
		current?.type === 'TSSatisfiesExpression' ||
		current?.type === 'TSNonNullExpression' ||
		current?.type === 'TSTypeAssertion'
	) {
		current = current.expression;
	}
	return (
		current != null &&
		(tools.isStyleCall(current) || current.metadata?.tsrx_style_resolved === true)
	);
}

/**
 * `{style(expr)}` → the scope chain plus the value: literals fold, dynamic
 * values concatenate at runtime (`'hash ' + expr`, so an absent value still
 * yields the chain).
 *
 * @param {any} node
 * @param {PassState} state
 * @returns {any}
 */
function resolveStyleCall(node, state) {
	const { hashes, applied } = currentChain(state);
	const inner = walk(node.arguments[0], state, 'expression');
	if (hashes.length === 0 && applied.length === 0) return inner;
	const chain = [...hashes, ...applied];
	if (inner.type === 'Literal' && typeof inner.value === 'string') {
		const value = buildClassValue([...chain, inner.value]);
		return markResolvedStyle(
			state.tools.inheritOriginLoc(
				value.type === 'Literal' ? b.literal(value.value, value.raw) : value,
				node,
			),
		);
	}
	// `(<chain> + ' ' + (expr))`: the chain must always be present.
	let prefix = null;
	let text = '';
	for (const part of chain) {
		if (typeof part === 'string') {
			text = text ? `${text} ${part}` : part;
			continue;
		}
		const literal = b.literal(text ? `${text} ` : ' ', JSON.stringify(text ? `${text} ` : ' '));
		prefix = prefix
			? b.binary('+', b.binary('+', prefix, literal), part)
			: b.binary('+', literal, part);
		text = '';
	}
	const tail = b.literal(text ? ` ${text} ` : ' ', JSON.stringify(text ? ` ${text} ` : ' '));
	const expression = prefix
		? b.binary('+', b.binary('+', prefix, tail), inner)
		: b.binary('+', b.literal(`${text} `, JSON.stringify(`${text} `)), inner);
	return markResolvedStyle(state.tools.inheritOriginLoc(expression, node));
}

/**
 * A class value the pre-pass built from `style(expr)` already carries the
 * chain; the stamp must not append it again. Compiler-built nodes only.
 *
 * @param {any} node
 * @returns {any}
 */
function markResolvedStyle(node) {
	node.metadata = { ...(node.metadata ?? {}), tsrx_style_resolved: true };
	return node;
}
