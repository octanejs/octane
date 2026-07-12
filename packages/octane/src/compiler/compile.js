/**
 * octane/compiler — compiles TSRX source into JS that targets the octane
 * runtime.
 *
 * Architecture:
 *   1. Parse TSRX via @tsrx/core's parseModule.
 *   2. For each top-level node:
 *        - Component (`@{ … }` body or a return-JSX function) → compile to a
 *          function taking the props-first ABI `(…userParams, __s, __extra)`.
 *        - Other (imports, regular consts/functions) → emit as-is via esrap
 *          (with real per-token source maps merged into the module map).
 *   3. Within a component body:
 *        - Setup statements (declarations, hook calls, etc.) are kept and run
 *          on every invocation. Hook calls get a stable module-scope Symbol
 *          passed as their last argument (conditional-hook-safe).
 *        - The render JSX is extracted into a hoisted HTML template + a plan
 *          of dynamic bindings (text/attr/class/style holes, events, refs,
 *          spreads) and runtime construct calls for the directive blocks —
 *          forBlock (@for), ifBlock (@if), switchBlock (@switch), tryBlock
 *          (@try), componentSlot (<Foo/>), portal (createPortal), headBlock
 *          (hoisted <title>/<meta>/<link>) — plus scoped-CSS injection and
 *          optional HMR wrapping.
 *
 * `mode: 'server'` selects a parallel, self-contained SSR codegen (see the
 * "Server (SSR) codegen" section) that emits HTML-string-building bodies with
 * hydration markers instead of template/clone DOM code.
 */

import {
	parseModule,
	analyzeCss,
	prepareStylesheetForRender,
	renderStylesheets,
	annotateWithHash,
	createStyleClassMapFromStylesheet,
} from '@tsrx/core';
import { print as esrapPrint } from 'esrap';
import esrapTsx from 'esrap/languages/tsx';
import { applyHookDependencies } from './hook-deps.js';

// DOM truth tables shared with the client/server runtimes (via constants.ts) —
// static bakes and dynamic writes MUST agree on which attributes render, under
// what name, and in what form, or client/SSR/hydration drift apart. See the
// dom-tables.js header for per-table semantics.
import {
	VOID_ELEMENTS,
	BOOLEAN_ATTR_PROPS,
	MUST_USE_PROPERTY_PROPS,
	SVG_ONLY_TAGS,
	ATTRIBUTE_ALIASES,
	isEnumeratedBooleanAttr,
	cssStyleValue,
	hyphenateStyleName,
} from '../dom-tables.js';

// React parity: a void element must neither have children nor use
// `dangerouslySetInnerHTML` — React throws (ReactDOMComponent-test.js:1794/:1807).
// Without this guard the failure is SILENT: the template parser drops the
// children out of `<input>…</input>` markup, and the htmlOnlyChild fast path
// writes invisible `input.innerHTML`. Shared by the client (emitElementHtml),
// the server (ssrEmitElement), and the value-position lowering
// (jsxElementToCreateElement) so the diagnostic can't drift between paths. A
// spread-supplied `dangerouslySetInnerHTML` is invisible at compile time — the
// runtime's setAttribute danger arm throws on that route.
function rejectVoidElementContent(tag, node, ctx) {
	if (!VOID_ELEMENTS.has(tag)) return;
	// Renderable-children check, deliberately lightweight (whitespace-only JSX
	// text and `{/* comments */}` produce no child — same as normalizeChildren,
	// without running the full lowering machinery on an element we may reject).
	let offending = false;
	for (const c of node.children || []) {
		if (!c) continue;
		if (c.type === 'JSXText') {
			if (/^\s*$/.test(c.value)) continue;
		} else if (c.type === 'JSXExpressionContainer') {
			if (!c.expression || c.expression.type === 'JSXEmptyExpression') continue;
		} else if (c.type === 'JSXStyleElement') {
			continue;
		}
		offending = true;
		break;
	}
	if (!offending) {
		const attrs = node.attributes || node.openingElement?.attributes || [];
		for (const a of attrs) {
			if (a.type !== 'Attribute' && a.type !== 'JSXAttribute') continue;
			if (jsxAttrRawName(a) === 'dangerouslySetInnerHTML') {
				offending = true;
				break;
			}
		}
	}
	if (!offending) return;
	const l = node.loc && node.loc.start;
	const at = l ? ` (${ctx.mapSourceName ? ctx.mapSourceName + ':' : ''}${l.line}:${l.column})` : '';
	throw new Error(
		`\`<${tag}>\` is a void element tag and must neither have children nor use ` +
			`\`dangerouslySetInnerHTML\`.${at}`,
	);
}

// Controlled-form binding kinds: `value`/`checked`/`defaultValue`/
// `defaultChecked` on <input>/<textarea>/<select> route to the runtime
// property helpers (setValue & co — React-parity controlled semantics on
// native events) instead of setAttribute. STATIC literals included: baking
// `value="a"` into the template would freeze the attribute instead of driving
// the property. Everything else — <option> (its `value` attribute is what the
// select projection reads), custom elements, non-form tags — keeps plain
// attribute semantics. Mirrors the runtime's setAttribute routing branch.
function controlledKindFor(tag, attrName) {
	if (tag === 'input') {
		if (attrName === 'value') return 'value';
		if (attrName === 'checked') return 'checked';
		if (attrName === 'defaultValue') return 'defaultValue';
		if (attrName === 'defaultChecked') return 'defaultChecked';
		return null;
	}
	if (tag === 'textarea') {
		if (attrName === 'value') return 'value';
		if (attrName === 'defaultValue') return 'defaultValue';
		return null;
	}
	if (tag === 'select') {
		if (attrName === 'value') return 'selectValue';
		if (attrName === 'defaultValue') return 'defaultValue';
		return null;
	}
	return null;
}

// The `_$`-aliased runtime helper for each controlled binding kind
// (+ autoFocus, which shares the routing but is mount-only).
const CONTROLLED_KIND_HELPERS = {
	value: 'setValue',
	checked: 'setChecked',
	selectValue: 'setSelectValue',
	defaultValue: 'setDefaultValue',
	defaultChecked: 'setDefaultChecked',
	autoFocus: 'setAutoFocus',
};

// Serialize one STATIC literal attribute value into template/SSR HTML —
// shared by emitElementHtml and ssrEmitElement so both bakes stay identical,
// mirroring the runtimes' dynamic coercion: aria-*/enumerated/data-* booleans
// stringify, boolean-attr props render the canonical `attr=""` presence form
// (falsy drops; overloaded download/capture keep string payloads), booleans
// on non-boolean attrs DROP (React: `title={true}` never renders), everything
// else escapes as before. Custom elements keep raw semantics.
function bakeStaticAttr(attrName, lv, tag) {
	if (lv == null) return '';
	const isCustom = tag !== undefined && tag.includes('-');
	const lower = attrName.toLowerCase();
	if (typeof lv === 'boolean') {
		if (attrName.startsWith('aria-') || attrName.startsWith('data-')) {
			return ` ${attrName}="${lv}"`;
		}
		// Enumerated booleans stringify — "false" is a real state, absent means
		// inherit (the same gate the runtimes apply to dynamic values).
		if (isEnumeratedBooleanAttr(lower)) {
			return ` ${attrName}="${lv}"`;
		}
		if (isCustom) return lv ? ` ${attrName}` : '';
		// Boolean attrs + the overloaded booleans (download/capture) + the
		// mustUseProperty statics all take presence semantics for BOOLEAN
		// literals; non-boolean overloaded values pass through verbatim below.
		if (
			BOOLEAN_ATTR_PROPS.has(lower) ||
			MUST_USE_PROPERTY_PROPS.has(lower) ||
			lower === 'download' ||
			lower === 'capture'
		) {
			return lv ? ` ${lower}=""` : '';
		}
		return ''; // boolean on a non-boolean attribute never renders (React)
	}
	if (!isCustom && (BOOLEAN_ATTR_PROPS.has(lower) || MUST_USE_PROPERTY_PROPS.has(lower))) {
		return lv ? ` ${lower}=""` : '';
	}
	if (typeof lv === 'string') return ` ${attrName}="${escapeAttr(lv)}"`;
	if (typeof lv === 'number') return ` ${attrName}="${lv}"`;
	return '';
}

// React contract: a `<textarea>` with a `value`/`defaultValue` prop OWNS its
// content — children would fight the prop (React throws for defaultValue +
// children and warns for value + children). Compile-time error on both emit
// paths, like rejectVoidElementContent; a plain `<textarea>text</textarea>`
// keeps its native content (that IS defaultValue semantics).
function rejectTextareaValueChildren(tag, node, ctx) {
	if (tag !== 'textarea') return;
	const attrs = node.attributes || node.openingElement?.attributes || [];
	let hasValueProp = false;
	for (const a of attrs) {
		if (a.type !== 'Attribute' && a.type !== 'JSXAttribute') continue;
		const n = jsxAttrRawName(a);
		if (n === 'value' || n === 'defaultValue') {
			hasValueProp = true;
			break;
		}
	}
	if (!hasValueProp) return;
	// Renderable-children check — same lightweight scan as rejectVoidElementContent.
	let offending = false;
	for (const c of node.children || []) {
		if (!c) continue;
		if (c.type === 'JSXText') {
			if (/^\s*$/.test(c.value)) continue;
		} else if (c.type === 'JSXExpressionContainer') {
			if (!c.expression || c.expression.type === 'JSXEmptyExpression') continue;
		} else if (c.type === 'JSXStyleElement') {
			continue;
		}
		offending = true;
		break;
	}
	if (!offending) return;
	const l = node.loc && node.loc.start;
	const at = l ? ` (${ctx.mapSourceName ? ctx.mapSourceName + ':' : ''}${l.line}:${l.column})` : '';
	throw new Error(
		'`<textarea>` must not have children when it uses `value` or `defaultValue` — ' +
			`the prop owns the content. Move the text into the prop.${at}`,
	);
}

// Compiler-generated code references runtime helpers under a collision-proof
// `_$` alias — `import { setText as _$setText } from 'octane'` + `_$setText(…)`
// — because generated statements are interleaved with USER statements inside
// the component function, where a user binding with the same name would
// silently shadow a bare helper (`const [text, setText] = useState('')` is the
// canonical collision). Every name in `ctx.runtimeNeeded` is emitted aliased;
// names the user's own code references (their preserved `octane` import
// specifiers + slotted base-hook call sites) live in `ctx.userRuntimeNames`
// and stay un-aliased. A name can appear in both (two import specifiers of
// the same export — valid JS).
export function rtAlias(name) {
	return '_$' + name;
}

// Merge one import list: user specifiers verbatim (preserving `x as y`
// aliases) + every generated-code helper aliased to `_$name`.
function buildRuntimeImport(ctx, moduleName) {
	const specifiers = new Set(ctx.userRuntimeNames);
	for (const n of ctx.runtimeNeeded) specifiers.add(`${n} as ${rtAlias(n)}`);
	if (specifiers.size === 0) return '';
	return `import { ${[...specifiers].sort().join(', ')} } from '${moduleName}';\n\n`;
}

// Record a user `import { … } from 'octane'` declaration's specifiers so the
// merged prelude import re-exposes exactly the local names the user's code
// references (including `imported as local` renames).
function addUserImportSpecifiers(ctx, node) {
	for (const sp of node.specifiers || []) {
		if (
			sp.type === 'ImportSpecifier' &&
			sp.imported?.name &&
			sp.local?.name &&
			sp.imported.name !== sp.local.name
		) {
			ctx.userRuntimeNames.add(`${sp.imported.name} as ${sp.local.name}`);
			continue;
		}
		const name = sp.imported?.name || sp.local?.name;
		if (name) ctx.userRuntimeNames.add(name);
	}
}

// M3 marker elision (docs/comment-marker-elision-plan.md): a component body
// whose ENTIRE output is one component call spans its own block's range by
// construction, so the call site can INHERIT the parent block's markers on the
// client and the server can skip the child's frame pair — collapsing sole-child
// wrapper chains (incl. `<ctx.Provider>` router/binding stacks) to the
// outermost pair. The predicate must be computed from the same AST by BOTH
// compile modes (client stamp ↔ server pair-skip ↔ hydration adopt-nothing
// agree by construction). Exclusions:
//   - `key=` (key-driven identity forces the slot to own its range),
//   - the octane boundary builtins (Suspense / ErrorBoundary / Activity —
//     their pairs are load-bearing for streaming). Direct imported names are
//     excluded here (collectOctaneBoundaryNames); member/dynamic/aliased tags
//     that RESOLVE to a boundary builtin are declined at RUNTIME by identity —
//     componentSlot and ssrComponent both check the resolved comp against the
//     builtins, so the two sides always agree.
// `bodyNodes` is the normalized, HeadHoist-filtered root list of a `@{ … }`
// (JSXCodeBlock) body — callers gate on the body form.
function inheritSoleCompRoot(bodyNodes, ctx) {
	if (bodyNodes.length !== 1) return false;
	const n = bodyNodes[0];
	if (n.type !== 'Element' || !isComponentTag(n)) return false;
	const id = n.openingElement?.name || n.id;
	if (!id) return false;
	if (
		(id.type === 'Identifier' || id.type === 'JSXIdentifier') &&
		typeof id.name === 'string' &&
		ctx._octaneBoundaryNames &&
		ctx._octaneBoundaryNames.has(id.name)
	) {
		return false;
	}
	const attrs = n.attributes || n.openingElement?.attributes || [];
	for (const a of attrs) {
		if (a.type !== 'Attribute' && a.type !== 'JSXAttribute') continue;
		const name = a.name && (a.name.name || a.name);
		if (name === 'key') return false;
	}
	return true;
}

// Collect the LOCAL names bound to the octane boundary builtins (see
// inheritSoleCompRoot) from a module's import declarations. Aliased imports
// (`import { Suspense as S }`) are matched by their local binding.
function collectOctaneBoundaryNames(astBody) {
	const names = new Set();
	for (const node of astBody) {
		if (node.type !== 'ImportDeclaration' || node.source.value !== 'octane') continue;
		for (const sp of node.specifiers || []) {
			const imported = sp.imported?.name;
			if (
				(imported === 'Suspense' ||
					imported === 'ErrorBoundary' ||
					imported === 'Activity' ||
					imported === 'ViewTransition' ||
					imported === 'unstable_ViewTransition') &&
				sp.local?.name
			) {
				names.add(sp.local.name);
			}
		}
	}
	return names;
}

// Does this module import ViewTransition from 'octane' (any local alias)?
// Drives the client prelude's `_$vtSeen()` module-load hint: the runtime's
// view-transition machinery is gated on a sticky VT_SEEN flag, and without
// the hint the very FIRST transition flush that mounts a boundary would only
// learn "this app uses ViewTransition" mid-drain — after the chance to
// snapshot the old state has passed (docs/view-transitions-plan.md).
function moduleImportsViewTransition(astBody) {
	for (const node of astBody) {
		if (node.type !== 'ImportDeclaration' || node.source.value !== 'octane') continue;
		for (const sp of node.specifiers || []) {
			const imported = sp.imported?.name;
			if (imported === 'ViewTransition' || imported === 'unstable_ViewTransition') return true;
		}
	}
	return false;
}

export const HOOK_NAMES = new Set([
	'useState',
	'useReducer',
	'useEffect',
	'useLayoutEffect',
	'useInsertionEffect',
	'useMemo',
	'useCallback',
	'useRef',
	'useId',
	'useEffectEvent',
	'useImperativeHandle',
	'useDeferredValue',
	'useTransition',
	'useSyncExternalStore',
	// React 19 Actions bundle.
	'useActionState',
	'useFormStatus',
	'useOptimistic',
]);

// Namespace inheritance — mirrors HTML5 foreign-content rules. The element
// itself and its children may have *different* namespaces: <foreignObject>
// inside SVG is still an SVG element, but its children switch back to HTML.
// SVG_ONLY_TAGS (imported from ../dom-tables.js — the runtime's de-opt
// reconciler uses the same table) drives the inference: a tag that exists ONLY
// in the SVG namespace implies SVG in a namespace-ambiguous position — a
// component's ROOT template, a fragment root — without a lexical `<svg>`
// ancestor. A component whose root is `<g>`/`<path>` must not compile to an
// HTML template: the HTMLUnknownElement it would produce inside an `<svg>`
// paints nothing.

function nsForSelf(tag, parentNs) {
	if (tag === 'svg') return 'svg';
	if (tag === 'math') return 'mathml';
	if (parentNs === 'html' && SVG_ONLY_TAGS.has(tag)) return 'svg';
	return parentNs; // includes <foreignObject> under an svg parent — itself SVG-ns
}

function nsForChildren(tag, parentNs) {
	if (tag === 'foreignObject') return 'html';
	if (tag === 'svg') return 'svg';
	if (tag === 'math') return 'mathml';
	if (parentNs === 'html' && SVG_ONLY_TAGS.has(tag)) return 'svg';
	return parentNs;
}

function nsFlag(ns) {
	return ns === 'svg' ? 1 : ns === 'mathml' ? 2 : 0;
}

function elementTagName(node) {
	if (!node || node.type !== 'Element') return null;
	return node.id?.name || node.openingElement?.name?.name || null;
}

function isNonHtmlRootTag(node) {
	const t = elementTagName(node);
	return t === 'svg' || t === 'math' || (t !== null && SVG_ONLY_TAGS.has(t));
}

function nsForRootTag(node, parentNs) {
	const t = elementTagName(node);
	if (t === 'svg') return 'svg';
	if (t === 'math') return 'mathml';
	if (t !== null && SVG_ONLY_TAGS.has(t)) return 'svg';
	return parentNs;
}

// ---------------------------------------------------------------------------
// JSX attribute-name pre-processing — shared by the client template emitter
// (emitElementHtml) and the SSR emitter (ssrEmitElement) so the two paths
// can't drift on name handling.
// ---------------------------------------------------------------------------

// Attribute name exactly as written in the JSX. A namespaced name
// (`xlink:href`) arrives as a JSXNamespacedName { namespace, name } pair —
// concatenate it back to the literal attribute name (the browser/serializer
// knows the namespace).
function jsxAttrRawName(attr) {
	const n = attr.name;
	if (n && (n.type === 'JSXNamespacedName' || n.type === 'NamespacedName')) {
		return `${n.namespace.name}:${n.name.name}`;
	}
	return n.name || n;
}

// ATTRIBUTE_ALIASES (imported from ../dom-tables.js): React 19's alias table,
// camelCase JSX prop → the attribute the browser actually parses
// (`strokeWidth` → `stroke-width`, `htmlFor` → `for`). The compiler bakes
// these into static template/SSR markup; the client/server runtimes apply the
// same table to dynamic bindings, spreads, and de-opt props.

// `className` plus the ATTRIBUTE_ALIASES table above: emit the native
// attribute names so the browser actually applies them (and dynamic bindings
// know which setter to pick). Custom elements keep every name VERBATIM (raw
// props, no alias tables) — the same gate the runtimes' setAttribute/ssrAttr
// apply to dynamic values.
function normalizeJsxAttrName(raw, tag) {
	// `className` → `class` applies EVERYWHERE, custom elements included (React
	// special-cases it in setPropOnCustomElement); only the alias table is raw.
	if (raw === 'className') return 'class';
	if (tag !== undefined && tag.includes('-')) return raw;
	return ATTRIBUTE_ALIASES.get(raw) || raw;
}

// React-shape `onXxx` event-handler attribute: `on` + an uppercase letter, so
// `onClick`/`onDblClickCapture` match but a lowercase native attr doesn't.
// Events have no server semantics (SSR drops them) and become delegated
// bindings on the client.
function isEventAttrName(name) {
	return name.length > 2 && name.startsWith('on') && /^[A-Z]/.test(name[2]);
}

// All keys + values are string/number/bool literals → safe to serialize at
// compile time into a `style="…"` HTML attribute (no runtime cost). Keys that
// are computed or properties with non-literal values disqualify the whole
// object — fall back to a setStyle binding.
function objectExprIsStaticLiteral(obj) {
	for (const p of obj.properties || []) {
		if (p.type !== 'Property' && p.type !== 'ObjectProperty') return false;
		if (p.computed) return false;
		const k = p.key;
		if (k.type !== 'Identifier' && !(k.type === 'Literal' && typeof k.value === 'string'))
			return false;
		const v = p.value;
		if (v.type !== 'Literal') return false;
		if (
			v.value != null &&
			typeof v.value !== 'string' &&
			typeof v.value !== 'number' &&
			typeof v.value !== 'boolean'
		)
			return false;
	}
	return true;
}

// Serialize a fully-literal style object into a `style="…"` string at compile
// time. `hyphenateStyleName` + `cssStyleValue` come from ../dom-tables.js —
// the SAME key normalization and px/unitless/trim coercion the runtimes apply
// to dynamic style objects — so a STATIC baked object style produces the same
// CSS a dynamic one would. The string is CSSOM-serialization-shaped
// (`prop: value; prop2: value2;` — declarations TERMINATED, not separated):
// that's what the same element's style attribute reads back as once anything
// touches el.style, and what React's CSSOM writes serialize to — so baked and
// dynamic styles are byte-identical in innerHTML.
function staticObjectToCssString(obj) {
	const parts = [];
	for (const p of obj.properties || []) {
		const name = p.key.type === 'Identifier' ? p.key.name : p.key.value;
		const value = p.value.value;
		if (value == null || value === false || value === '') continue;
		const cssValue = value === true ? '' : cssStyleValue(name, value);
		parts.push(`${hyphenateStyleName(name)}: ${cssValue};`);
	}
	return parts.join(' ');
}

// ===========================================================================
// Purity analysis — for-of body memoisation
// ===========================================================================

/**
 * Collect names bound by a destructuring pattern into `out`. Handles
 * Identifier / ObjectPattern / ArrayPattern / RestElement / AssignmentPattern.
 */
function collectBindings(pattern, out) {
	if (!pattern) return;
	if (pattern.type === 'Identifier') {
		out.add(pattern.name);
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

/**
 * Names directly declared at the outer component body — params + top-level
 * `const`/`let`/`var` + `function` declarations. We DON'T recurse into nested
 * blocks (those are scoped lower). Used as the "did the for-of body reference
 * anything from parent scope?" oracle for memoisation.
 */
function collectComponentLocals(componentNode) {
	const locals = new Set();
	for (const p of componentNode.params || []) collectBindings(p, locals);
	// `@{}` shape: body is a JSXCodeBlock with `.body` as the statement list.
	// return-JSX shape: body is a BlockStatement (`{ … return <jsx> }`), also `.body`.
	// Legacy/synthetic shape: body IS the statement list directly.
	const b = componentNode.body;
	const stmts =
		b && (b.type === 'JSXCodeBlock' || b.type === 'BlockStatement')
			? b.body || []
			: Array.isArray(b)
				? b
				: [];
	for (const stmt of stmts) {
		if (stmt.type === 'VariableDeclaration') {
			for (const d of stmt.declarations || []) collectBindings(d.id, locals);
		} else if (stmt.type === 'FunctionDeclaration') {
			if (stmt.id) locals.add(stmt.id.name);
		}
	}
	return locals;
}

/**
 * Compute the set of component-local names that are guaranteed STABLE across
 * renders. Used by the auto-callback pass below to decide which `const X =
 * (...) => ...` declarations can be lowered to `useCallback`, and by the
 * for-of dep-snapshot logic to know whether a captured closure is worth
 * memoising on.
 *
 * Stability sources:
 *   - useState / useReducer setters and state getters (second/third slots)
 *   - useRef returns (the ref object itself, not .current)
 *   - useCallback / useEffectEvent returns
 *   - Arrows previously declared in this body whose free vars are themselves
 *     all stable — transitive (auto-callback adds them back into the set)
 *
 * Walked in source order so a later `const` can reference an earlier one's
 * stability. Anything we can't prove stable is left out and re-renders
 * normally.
 */
function computeStableLocals(statements, componentLocals) {
	const stable = new Set();
	for (const stmt of statements) {
		if (stmt.type !== 'VariableDeclaration') continue;
		for (const decl of stmt.declarations || []) {
			const init = decl.init;
			if (!init) continue;
			if (init.type === 'CallExpression' && init.callee && init.callee.type === 'Identifier') {
				const callName = init.callee.name;
				// [_, setX] = useState(...)  — second slot is the stable setter.
				// Same shape for useReducer's dispatch.
				if (
					(callName === 'useState' || callName === 'useReducer') &&
					decl.id.type === 'ArrayPattern' &&
					decl.id.elements &&
					decl.id.elements.length >= 2 &&
					decl.id.elements[1] &&
					decl.id.elements[1].type === 'Identifier'
				) {
					stable.add(decl.id.elements[1].name);
				}
				// [_, _, getX] = useState(...) — the compiler-generated getter
				// closes over the hook cell and is stable for that cell's lifetime.
				if (
					(callName === 'useState' || callName === 'useReducer') &&
					decl.id.type === 'ArrayPattern' &&
					decl.id.elements &&
					decl.id.elements.length >= 3 &&
					decl.id.elements[2] &&
					decl.id.elements[2].type === 'Identifier'
				) {
					stable.add(decl.id.elements[2].name);
				}
				if (callName === 'useState' || callName === 'useReducer') continue;
				// x = useRef(...) / useCallback(...) / useEffectEvent(...) — the
				// return value is stable for the lifetime of the component.
				if (
					(callName === 'useRef' || callName === 'useCallback' || callName === 'useEffectEvent') &&
					decl.id.type === 'Identifier'
				) {
					stable.add(decl.id.name);
					continue;
				}
			}
			if (init.type === 'ArrowFunctionExpression' && decl.id.type === 'Identifier') {
				if (isArrowStableOver(init, stable, componentLocals)) {
					stable.add(decl.id.name);
				}
			}
		}
	}
	return stable;
}

/**
 * An arrow is "stable" when every free variable it references is either:
 *   - already known stable in this component (state setter / ref / ...)
 *   - not a component local at all (module-level — imports, top-level fns,
 *     literals — assumed stable by the React-convention rule that mutable
 *     state belongs in hooks, not in module scope)
 */
function isArrowStableOver(arrow, stable, componentLocals) {
	const paramScope = new Set();
	for (const p of arrow.params || []) collectBindings(p, paramScope);
	const free = collectFreeIdentifiers(arrow.body, paramScope);
	for (const name of free) {
		if (!componentLocals.has(name)) continue; // module-level
		if (stable.has(name)) continue;
		return false;
	}
	return true;
}

/**
 * Rewrite a VariableDeclaration so that any declarator initialised with an
 * arrow whose name is in `stable` becomes `useCallback(arrow, [deps])`.
 * `deps` is the subset of the arrow's free vars that are component locals
 * (module-level identifiers don't need to be listed — useCallback only cares
 * about reactive deps).
 *
 * Idempotent: a const we already rewrote into `useCallback(...)` won't be
 * re-wrapped (its init is now a CallExpression, not an ArrowFunctionExpression).
 */
function rewriteAutoCallback(stmt, stable, componentLocals, ctx) {
	if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') return stmt;
	let modified = false;
	const newDecls = stmt.declarations.map((decl) => {
		if (!decl.init || decl.init.type !== 'ArrowFunctionExpression') return decl;
		if (decl.id.type !== 'Identifier') return decl;
		if (!stable.has(decl.id.name)) return decl;

		const arrow = decl.init;
		const paramScope = new Set();
		for (const p of arrow.params || []) collectBindings(p, paramScope);
		const free = collectFreeIdentifiers(arrow.body, paramScope);
		const deps = [];
		const seen = new Set();
		for (const name of free) {
			if (!componentLocals.has(name)) continue;
			if (seen.has(name)) continue;
			seen.add(name);
			deps.push(name);
		}
		modified = true;
		ctx.runtimeNeeded.add('useCallback');
		return {
			...decl,
			init: {
				type: 'CallExpression',
				// `_octaneGenerated` tells rewriteHookCalls (which slots this call next)
				// that the callee is compiler-inserted — it renames it to the shadow-proof
				// `_$useCallback` alias instead of treating it as a user identifier.
				callee: { type: 'Identifier', name: 'useCallback', _octaneGenerated: true },
				arguments: [
					arrow,
					{
						type: 'ArrayExpression',
						elements: deps.map((n) => ({ type: 'Identifier', name: n })),
					},
				],
			},
		};
	});
	return modified ? { ...stmt, declarations: newDecls } : stmt;
}

// Field names skipped by the generic AST child-walks below: source positions
// plus the two known back-reference carriers — `metadata` (TSRX CSS ASTs whose
// `parent_rule` / rule-node arrays form real cycles) and `parent` (acorn-
// typescript sometimes attaches one). Skipping them is necessary but NOT
// sufficient: even cycle-free ASTs can carry shared-subtree pointers (compiler
// passes reuse nodes via spread), so every generic walk ALSO keeps a WeakSet
// visited guard — without one the `for (k in n)` traversal can re-enter the
// same subtree combinatorially, observed as a vitest worker hang on the bigger
// fixture files.
const AST_WALK_SKIP_KEYS = new Set(['type', 'loc', 'start', 'end', 'range', 'metadata', 'parent']);

/**
 * Walk an AST subtree collecting Identifier references that are NOT bound
 * locally (inside the subtree). Tracks block/function scopes so inner `const`
 * declarations correctly shadow outer references.
 */
function collectFreeIdentifiers(root, initiallyBound) {
	const free = new Set();
	const seen = new WeakSet();
	walk(root, new Set(initiallyBound));
	return free;

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

		if (t === 'Identifier') {
			if (!scope.has(n.name)) free.add(n.name);
			return;
		}

		// JSX tag position: a COMPONENT tag is a real identifier reference — a
		// per-body local (`const C = props.comp`) used as `<C/>` must show up as
		// free, or a hoisted helper (Phase 2) would silently drop it from its
		// env tuple. Host tag names ('div') and attribute NAMES are static —
		// only component-shaped identifier tags (isCompatTag rule), member-tag
		// ROOT objects, and dynamic `<{expr}/>` expressions count.
		if (t === 'Element' || t === 'JSXElement') {
			const tag = n.openingElement?.name || n.id;
			if (tag) {
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
			walk(n.body, newScope);
			return;
		}

		// Block scope — hoist `var`/`function` + pre-collect `let`/`const` so
		// forward references work the same way they do at runtime.
		if (t === 'BlockStatement') {
			const newScope = new Set(scope);
			for (const stmt of n.body || []) {
				if (stmt.type === 'VariableDeclaration') {
					for (const d of stmt.declarations || []) collectBindings(d.id, newScope);
				} else if (stmt.type === 'FunctionDeclaration' && stmt.id) {
					newScope.add(stmt.id.name);
				}
			}
			walk(n.body, newScope);
			return;
		}

		// VariableDeclarator's `id` is a binding, only walk the init.
		if (t === 'VariableDeclarator') {
			walk(n.init, scope);
			return;
		}

		// CatchClause introduces its param.
		if (t === 'CatchClause') {
			const newScope = new Set(scope);
			if (n.param) collectBindings(n.param, newScope);
			walk(n.body, newScope);
			return;
		}

		// for / for-in / for-of — left declarator introduces bindings.
		if (t === 'ForStatement' || t === 'ForInStatement' || t === 'ForOfStatement') {
			const newScope = new Set(scope);
			if (n.left && n.left.type === 'VariableDeclaration') {
				for (const d of n.left.declarations || []) collectBindings(d.id, newScope);
			} else if (n.left) {
				collectBindings(n.left, newScope);
			}
			walk(n.init, newScope);
			walk(n.test, newScope);
			walk(n.update, newScope);
			walk(n.right, newScope);
			walk(n.body, newScope);
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
 * Walk a for-of body looking for anything whose render is opaque to us —
 * component calls (`<Foo/>`, `<ctx.X/>`) or control-flow that wraps them
 * (`if`/`for`/`try`). Such constructs can read dynamic state (context,
 * setters, descendant hooks) during their own render, so skipping the
 * parent re-render would skip them too. Conservative match: any of those at
 * any depth → not memo-safe.
 */
function containsComponentCallOrControlFlow(stmts) {
	let found = false;
	const seen = new WeakSet();
	function walk(n) {
		if (found || !n) return;
		if (Array.isArray(n)) {
			for (const x of n) walk(x);
			return;
		}
		if (typeof n !== 'object') return;
		const t = n.type;
		if (!t) return;
		if (seen.has(n)) return;
		seen.add(n);
		// Component calls — old `Element` or new `JSXElement` with capitalised tag.
		if ((t === 'Element' || t === 'JSXElement') && isComponentTag(n)) {
			found = true;
			return;
		}
		// Control flow in the body — old statement-position forms.
		if (
			t === 'IfStatement' ||
			t === 'ForOfStatement' ||
			t === 'TryStatement' ||
			t === 'SwitchStatement'
		) {
			found = true;
			return;
		}
		// Control flow in the body — new JSX-expression forms.
		if (
			t === 'JSXIfExpression' ||
			t === 'JSXForExpression' ||
			t === 'JSXTryExpression' ||
			t === 'JSXSwitchExpression'
		) {
			found = true;
			return;
		}
		// Portal at child position — old TSRXExpression wrapper, new JSXExpressionContainer.
		if (t === 'TSRXExpression' && n.expression && isCreatePortalCall(n.expression)) {
			found = true;
			return;
		}
		if (t === 'JSXExpressionContainer' && n.expression && isCreatePortalCall(n.expression)) {
			found = true;
			return;
		}
		for (const key in n) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(n[key]);
		}
	}
	for (const s of stmts) walk(s);
	return found;
}

/**
 * True when the keyed-item body executes any call DURING render:
 * CallExpression / NewExpression / TaggedTemplateExpression in render-value
 * position (holes, attribute values, locals). Such a call can read mutable
 * state that neither the item reference nor the deps tuple changes with —
 * e.g. `header.column.getIsSorted()` on a memoized table-core header — so the
 * PURE/DEP-PURE survivor short-circuit (see the body analysis in makeForCall)
 * would freeze its output where React re-runs the body unconditionally.
 *
 * Calls nested inside FUNCTION VALUES (event-handler arrows, function
 * expressions) are deferred to invoke time and close over the same ref-stable
 * item/deps a skipped survivor would have, so they can't go stale at render
 * time — the walk does not descend into function bodies or parameters.
 */
function containsRenderCall(stmts) {
	let found = false;
	const seen = new WeakSet();
	function walk(n) {
		if (found || !n) return;
		if (Array.isArray(n)) {
			for (const x of n) walk(x);
			return;
		}
		if (typeof n !== 'object') return;
		const t = n.type;
		if (!t) return;
		if (seen.has(n)) return;
		seen.add(n);
		if (
			t === 'ArrowFunctionExpression' ||
			t === 'FunctionExpression' ||
			t === 'FunctionDeclaration'
		) {
			return; // deferred — runs at event/invoke time, not during render
		}
		if (t === 'CallExpression' || t === 'NewExpression' || t === 'TaggedTemplateExpression') {
			found = true;
			return;
		}
		for (const key in n) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(n[key]);
		}
	}
	for (const s of stmts) walk(s);
	return found;
}

/**
 * `() => fn(a, b, …)` — a zero-param arrow whose body is a single
 * function call. Returns `{ callee, args }` if so, else null. Used to compile
 * event handlers to the runtime's `{ fn, args }` bundle form so the
 * dispatcher gets a stable callee + identity-diffable args, sidestepping a
 * per-render closure allocation on keyed-list survivors.
 *
 * Conservative: we ONLY match arrows with NO params (so the user definitely
 * isn't reading the event arg), and the body must be a single CallExpression
 * (no statements, no side effects beyond the call). The callee must be a PLAIN
 * IDENTIFIER: extracting a member callee (`obj.method`) into the bundle's `fn`
 * slot loses its receiver — the dispatcher invokes `fn(...)` bare, so `this`
 * would be undefined inside the method (`() => props.log.push(x)` threw). Member
 * callees keep the ordinary closure handler instead.
 */
function detectStableEventBundle(node) {
	if (!node || node.type !== 'ArrowFunctionExpression') return null;
	if (node.params.length !== 0) return null;
	// The body may be a BlockStatement with a single `return call()` or just
	// the expression directly (concise-arrow form).
	let body = node.body;
	if (body && body.type === 'BlockStatement') {
		if (body.body.length !== 1) return null;
		const stmt = body.body[0];
		if (stmt.type === 'ExpressionStatement') body = stmt.expression;
		else if (stmt.type === 'ReturnStatement' && stmt.argument) body = stmt.argument;
		else return null;
	}
	if (!body || body.type !== 'CallExpression') return null;
	// Identifier callees only — see the receiver-loss note above.
	if (!body.callee || body.callee.type !== 'Identifier') return null;
	// Bail if any arg is a spread — bundle args are positional only.
	if (body.arguments.some((a) => a.type === 'SpreadElement')) return null;
	return { callee: body.callee, args: body.arguments };
}

function isJsxLike(node) {
	if (!node) return false;
	const t = node.type;
	return (
		t === 'Element' ||
		t === 'Tsrx' ||
		t === 'Tsx' ||
		t === 'Text' ||
		t === 'JSXElement' ||
		t === 'JSXFragment' ||
		t === 'JSXText'
	);
}

/** A ternary at child position where at least one branch is JSX. */
function isConditionalJsx(node) {
	return (
		node &&
		node.type === 'ConditionalExpression' &&
		(isJsxLike(node.consequent) || isJsxLike(node.alternate))
	);
}

/** Wrap an expression as a BlockStatement body, so makeIfCall can consume it. */
function wrapAsBlockStmt(node) {
	if (!node) return null;
	// null / Literal(null) / Literal(false) → no branch
	if (node.type === 'Literal' && (node.value === null || node.value === false)) return null;
	return { type: 'BlockStatement', body: [node] };
}

/** `xs.map(x => <li/>)` — detect so we can throw a useful "use for-of" error. */
function isJsxReturningMapCall(node) {
	if (!node || node.type !== 'CallExpression') return false;
	const callee = node.callee;
	if (!callee || callee.type !== 'MemberExpression') return false;
	if (callee.property?.name !== 'map') return false;
	const arg = node.arguments?.[0];
	if (!arg || arg.type !== 'ArrowFunctionExpression') return false;
	const body = arg.body;
	if (isJsxLike(body)) return true;
	if (body && body.type === 'BlockStatement') {
		for (const stmt of body.body) {
			if (stmt.type === 'ReturnStatement' && isJsxLike(stmt.argument)) return true;
		}
	}
	return false;
}

/**
 * Convert a `{xs.map((item[, index]) => <jsx key={K}>…)}` JSX child into a
 * synthetic `@for` (ForOfStatement) so it lowers to the SAME `forBlock` keyed
 * fast path as `@for` — a compiled per-item body + the raw items array — instead
 * of eagerly building a `createElement` descriptor per row on every render and
 * reconciling that array through `childSlot`/`reconcileKeyed`. The result flows
 * straight into the existing ForOfStatement fold path (makeForCall + items/body
 * holes), so the JSX `.map` and the directive `@for` produce identical output.
 *
 * Returns null for shapes we don't lower — a named/ref callback, a block-body
 * arrow (`{ … return <jsx> }`), a fragment/non-element return, more than two
 * params, or a non-identifier index — so the caller keeps the childSlot path.
 */
function mapCallToForOf(expr) {
	if (!isJsxReturningMapCall(expr)) return null;
	const arrow = expr.arguments[0];
	const params = arrow.params || [];
	// `(item)` and `(item, index)` map to a for-of header; the rarely-used
	// `array`/thisArg params (or a destructured index) don't, so bail to childSlot.
	if (params.length < 1 || params.length > 2) return null;
	if (params[1] && params[1].type !== 'Identifier') return null;
	// Only an EXPRESSION-body arrow returning a single JSX ELEMENT (host or
	// component). Block bodies and fragment roots keep the childSlot path.
	const body = arrow.body;
	if (!body || (body.type !== 'JSXElement' && body.type !== 'Element')) return null;
	// Pull a `key={…}` attribute off the returned element → the for-of header key,
	// and drop it from the element (it's not a DOM attribute). makeForCall then
	// keys via the header, falling back to `item.id ?? item` when there's no key.
	const attrsOf = (el) => el.openingElement?.attributes || el.attributes || [];
	const nameOf = (a) => a?.name?.name || a?.name;
	let keyExpr = null;
	let bodyEl = body;
	const keyAttr = attrsOf(body).find((a) => nameOf(a) === 'key');
	if (keyAttr) {
		keyExpr =
			keyAttr.value && keyAttr.value.type === 'JSXExpressionContainer'
				? keyAttr.value.expression
				: keyAttr.value;
		const kept = attrsOf(body).filter((a) => nameOf(a) !== 'key');
		bodyEl = body.openingElement
			? { ...body, openingElement: { ...body.openingElement, attributes: kept } }
			: { ...body, attributes: kept };
	}
	return {
		type: 'ForOfStatement',
		left: {
			type: 'VariableDeclaration',
			kind: 'const',
			declarations: [{ type: 'VariableDeclarator', id: params[0], init: null }],
		},
		right: expr.callee.object,
		body: { type: 'BlockStatement', body: [bodyEl] },
		await: false,
		key: keyExpr,
		index: params[1] || null,
		empty: null,
	};
}

// Extract the `__html` expression from a React `dangerouslySetInnerHTML` value.
// For the canonical inline object `{{__html: expr}}` it's `expr`; for anything
// else (a variable holding the `{__html}` object) it's a `.__html` member access
// evaluated at runtime. Returns null when there's no value.
function dangerHtmlExpr(node) {
	if (!node) return null;
	if (node.type === 'ObjectExpression') {
		const prop = (node.properties || []).find(
			(p) =>
				(p.type === 'Property' || p.type === 'ObjectProperty') &&
				!p.computed &&
				p.key &&
				(p.key.name === '__html' || p.key.value === '__html'),
		);
		if (prop) return prop.value;
	}
	return {
		type: 'MemberExpression',
		object: node,
		property: { type: 'Identifier', name: '__html' },
		computed: false,
		optional: false,
	};
}

// Recognise `{style (expr)}` — TSRX parses it as a plain
// `CallExpression(style, [expr])` (the dedicated `Style` intrinsic node is
// gone); resolveStyleExpr rewrites it into a scoped class-string expression.
function isStyleCall(node) {
	return (
		node &&
		node.type === 'CallExpression' &&
		node.callee &&
		node.callee.type === 'Identifier' &&
		node.callee.name === 'style' &&
		node.arguments.length === 1
	);
}

// Resolve a `{style (expr)}` CallExpression (see isStyleCall) into a plain
// expression that yields a class string, with the component's scoped css hash
// prepended (so `{style ('row')}` in a component with hash "tsrx-abc" produces
// "tsrx-abc row"). Literal values inline; dynamic values become a runtime
// string concat. Components without a <style> block (no hash) — and any other
// expression shape — pass through untouched.
function resolveStyleExpr(node, cssHash) {
	if (!node) return node;
	if (!isStyleCall(node) || !cssHash) return node;
	const inner = node.arguments[0];
	if (inner.type === 'Literal' && typeof inner.value === 'string') {
		const combined = inner.value ? `${cssHash} ${inner.value}` : cssHash;
		return { type: 'Literal', value: combined, raw: JSON.stringify(combined) };
	}
	// Dynamic: emit `(<hash> + ' ' + (expr))` so absent/null produces "<hash> ".
	return {
		type: 'BinaryExpression',
		operator: '+',
		left: { type: 'Literal', value: cssHash + ' ', raw: JSON.stringify(cssHash + ' ') },
		right: inner,
	};
}

/**
 * The new TSRX (`@tsrx/core@0.1.25`) shape for a component is a plain
 * `FunctionDeclaration` whose `body` is a `JSXCodeBlock` (opened by `@{`),
 * not the old dedicated `Component` AST node. We detect them at the three
 * places they can appear: top-level, under `export`, under `export default`.
 * `compileComponent` / `compileFunctionBody` read `body.body` (setup
 * statements) and `body.render` (single JSX root) off the JSXCodeBlock.
 */
function isComponentFunction(node) {
	return (
		node &&
		(node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') &&
		node.body &&
		node.body.type === 'JSXCodeBlock'
	);
}

// A plain React-style function whose OUTPUT is JSX: a `BlockStatement` body with a
// `return <jsx>`. NOT the `@{}` form (that's a JSXCodeBlock). This is "just a
// function" — there is no component gate at the declaration; the function gets its
// hooks slotted (via withSlot) and its returned JSX lowered to a descriptor, and
// whatever USES it (`<Foo/>` / `{expr}`) is what renders it. (Async/generator
// excluded; a `use*` custom hook that returns JSX is still a hook, not this.)
function isReturnJsxFunction(node) {
	if (!node) return false;
	if (node.type !== 'FunctionDeclaration' && node.type !== 'FunctionExpression') return false;
	if (node.async || node.generator) return false;
	if (!node.body || node.body.type !== 'BlockStatement') return false;
	return (node.body.body || []).some(
		(s) => s.type === 'ReturnStatement' && s.argument && isJsxNode(s.argument),
	);
}

// Arrow-function component shape: `const X = (props) => @{…}` (and the `export`
// variant). @tsrx/core parses the `@{…}` arrow body as a JSXCodeBlock, but the
// rest of the compiler keys on FunctionDeclaration. Convert a single-declarator
// `const X = (…) => @{…}` / `= function (…) @{…}` into an equivalent synthetic
// FunctionDeclaration so ALL downstream machinery (detection, hookless
// eligibility, emission, export handling, css scoping) works unchanged. Returns
// null when the var-decl is not an arrow/function component.
/** @param {any} varDecl @returns {any|null} */
function arrowComponentToFunctionDecl(varDecl) {
	if (!varDecl || varDecl.type !== 'VariableDeclaration') return null;
	if (!varDecl.declarations || varDecl.declarations.length !== 1) return null;
	const d = varDecl.declarations[0];
	if (!d || !d.id || d.id.type !== 'Identifier') return null;
	const init = d.init;
	if (
		!init ||
		(init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression') ||
		!init.body ||
		init.body.type !== 'JSXCodeBlock'
	) {
		return null;
	}
	return {
		type: 'FunctionDeclaration',
		id: d.id,
		params: init.params || [],
		body: init.body,
		async: !!init.async,
		generator: !!init.generator,
		// Preserve source position for hashing / source maps / decl anchors.
		start: varDecl.start,
		end: varDecl.end,
		loc: varDecl.loc,
	};
}

// Rewrite top-level arrow-function components (`const X = () => @{…}`, incl.
// `export const X = …`) to FunctionDeclaration form in place, so the rest of the
// pipeline sees the canonical component shape. Mutates `ast.body`.
/** @param {any} ast @returns {void} */
function normalizeArrowComponents(ast) {
	if (!ast || !Array.isArray(ast.body)) return;
	for (let i = 0; i < ast.body.length; i++) {
		const node = ast.body[i];
		if (node.type === 'VariableDeclaration') {
			const fn = arrowComponentToFunctionDecl(node);
			if (fn) ast.body[i] = fn;
		} else if (node.type === 'ExportNamedDeclaration' && node.declaration) {
			const fn = arrowComponentToFunctionDecl(node.declaration);
			if (fn) node.declaration = fn;
		}
	}
}

// A top-level statement that carries NO runtime value — pure TypeScript type
// surface (`interface`, `type` alias, `declare …` ambients, `import type` /
// `export type`). The runtime compile (client/server) must DROP these: esrap
// would otherwise print them verbatim into the emitted .js (or crash on a
// type-alias whose annotation we null out), and Vite doesn't type-strip a
// `.tsrx` module. This is RUNTIME-ONLY: the Volar/TS-server path (volar.js) is a
// separate pipeline that intentionally PRESERVES all types for the language
// service, so it never calls this. Enums and value namespaces have runtime
// semantics and are deliberately NOT treated as type-only.
function isTypeOnlyStatement(node) {
	if (node == null) return false;
	if (
		node.type === 'TSInterfaceDeclaration' ||
		node.type === 'TSTypeAliasDeclaration' ||
		node.type === 'TSDeclareFunction'
	) {
		return true;
	}
	// `declare const/let/var/function/class/module/namespace …` — ambient, no emit.
	if (node.declare === true) return true;
	// `import type { … } from …`
	if (node.type === 'ImportDeclaration' && node.importKind === 'type') return true;
	// `export type { … }`, `export type X = …`, `export interface I {}`
	if (node.type === 'ExportNamedDeclaration') {
		if (node.exportKind === 'type') return true;
		if (node.declaration && isTypeOnlyStatement(node.declaration)) return true;
	}
	return false;
}

const VLQ_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64-VLQ encode a list of signed integers (source-map v3 segment fields). */
function encodeVlq(values) {
	let out = '';
	for (const value of values) {
		let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
		do {
			let digit = vlq & 31;
			vlq >>>= 5;
			if (vlq > 0) digit |= 32;
			out += VLQ_B64[digit];
		} while (vlq > 0);
	}
	return out;
}

function countNewlines(str) {
	let n = 0;
	for (let i = 0; i < str.length; i++) if (str.charCodeAt(i) === 10) n++;
	return n;
}

/**
 * Build a v3 source map from a flat list of mapping segments. The segments come
 * from esrap itself — we print each user statement/expression via esrap with
 * `sourceMapEncodeMappings: false` (the same machinery the mainline TSRX
 * compilers use) and merge each node's real per-token mappings into module
 * coordinates. Generated runtime plumbing (templates, mount/update DOM ops) is
 * left unmapped — never mapped to a wrong position. `sourcesContent` is inlined
 * so the original `.tsrx` is visible in devtools.
 *
 * @param {string} source original .tsrx text
 * @param {string} sourceName basename used as the map's single source entry
 * @param {Array<{ genLine: number, genCol: number, srcLine0: number, srcCol0: number }>} segments
 *   genLine/genCol are 0-based ABSOLUTE generated coords; src* are 0-based source coords.
 */
function buildSourceMap(source, sourceName, segments) {
	const byLine = new Map();
	let maxLine = -1;
	for (const s of segments) {
		if (s.genLine < 0) continue;
		let arr = byLine.get(s.genLine);
		if (!arr) byLine.set(s.genLine, (arr = []));
		arr.push(s);
		if (s.genLine > maxLine) maxLine = s.genLine;
	}
	let prevSrcLine = 0;
	let prevSrcCol = 0;
	const groups = [];
	for (let line = 0; line <= maxLine; line++) {
		const arr = byLine.get(line);
		if (!arr) {
			groups.push('');
			continue;
		}
		// Sort by generated column and drop duplicates at the same column.
		arr.sort((a, b) => a.genCol - b.genCol);
		let prevGenCol = 0;
		let lastGenCol = -1;
		let group = '';
		for (const s of arr) {
			if (s.genCol === lastGenCol) continue;
			lastGenCol = s.genCol;
			// Fields: [genColumn, sourceIndex, sourceLine, sourceColumn] as deltas.
			// genColumn resets per line; sourceIndex is always 0 (single source).
			group +=
				(group ? ',' : '') +
				encodeVlq([s.genCol - prevGenCol, 0, s.srcLine0 - prevSrcLine, s.srcCol0 - prevSrcCol]);
			prevGenCol = s.genCol;
			prevSrcLine = s.srcLine0;
			prevSrcCol = s.srcCol0;
		}
		groups.push(group);
	}
	return {
		version: 3,
		sources: [sourceName],
		sourcesContent: [source],
		names: [],
		mappings: groups.join(';'),
	};
}

/**
 * Dev-only source location for a construct, as a `[line, column]` pair (1-based line,
 * 0-based column — matches the AST). Returns `undefined` when not in dev OR the node has
 * no position, so PROD constructs are unchanged (the LOC emit is fully gated downstream).
 * @param {{ dev?: boolean }} ctx
 * @param {any} node — an AST node (or anything with `.loc.start`)
 * @returns {[number, number] | undefined}
 */
function devLoc(ctx, node) {
	if (!ctx.dev) return undefined;
	const l = node && node.loc && node.loc.start;
	return l ? [l.line, l.column | 0] : undefined;
}

/**
 * Compile a .tsrx source string into JS targeting `octane`.
 * @param {string} source
 * @param {string} filename
 * @param {{ hmr?: boolean, mode?: 'client' | 'server', dev?: boolean }} [options] —
 *   `dev: true` emits dev-only hydration source-location metadata (per-component
 *   `__s.locs`/`__s.locFile`); strictly gated so production output is byte-identical.
 *   `hmr: true` wraps each exported component in `hmr(Component)` and emits an
 *   `import.meta.hot.accept(...)` block that delegates updates to the runtime
 *   HMR wrapper. Dev tooling (e.g. the Vite plugin) should pass `hmr: true` in
 *   serve mode and leave it off for production builds.
 *   `mode` selects the codegen target: `'client'` (default) emits the
 *   template-clone DOM runtime; `'server'` emits HTML-string SSR output (static
 *   chunks interleaved with `ssr*` helpers) carrying the hydration markers the
 *   client `hydrateRoot` adopts.
 * @returns {{ code: string, map: any }}
 */
export function compile(source, filename, options) {
	const mode = (options && options.mode) || 'client';
	if (mode !== 'client' && mode !== 'server') {
		throw new Error(`Unknown compile mode "${mode}" — expected 'client' or 'server'.`);
	}
	if (mode === 'server') {
		// Server (SSR) codegen: static markup + dynamic holes + control flow +
		// nested components + scoped CSS, emitted as HTML-string-building bodies
		// (with hydration markers) importing the server runtime from 'octane/server'.
		// Only `<Activity>` and fragment refs are rejected.
		return compileServer(source, filename, options);
	}
	const ast = parseModule(source, filename);
	// Drop type-only statements (interface / type / declare / import-export type)
	// before emit — they carry no runtime value and would leak invalid TS into
	// the .js (or crash the printer). Runtime-only; Volar keeps them.
	ast.body = ast.body.filter((n) => !isTypeOnlyStatement(n));
	// Normalize arrow-function components (`const X = () => @{…}`) to
	// FunctionDeclaration form so the component pipeline recognizes them.
	normalizeArrowComponents(ast);
	// Omitted dependency lists are compiler-owned: infer reactive captures
	// before any component splitting/hoisting so every lexical binding is still
	// visible to the shared TSRX/TSX analysis. Explicit arrays and `null` pass
	// through untouched.
	applyHookDependencies(ast, { filename });
	const hmrEnabled = !!(options && options.hmr);
	// Dev mode: emit dev-only hydration source-location metadata (a per-component
	// `__s.locs` table of structured {line,column} keyed by slot index + the module file
	// name), used by hydration-mismatch warnings and reusable by a future Chrome-DevTools
	// element→source layer. Strictly dev-gated so PROD output is byte-identical (zero cost).
	const devEnabled = !!(options && options.dev);
	// parallelUse: the parallel-`use()` transform pipeline (auto-memoized
	// creations → hoisted parallel starts → batched unwrap → __warm fetch
	// plans; docs/suspense-parallel-use-plan.md). ON by default — pass
	// `parallelUse: false` to opt out (React-timing waterfall semantics).
	// Output is byte-identical with the flag off, and the pipeline is a no-op
	// for use()-free modules either way.
	const parallelUseEnabled = !(options && options.parallelUse === false);

	const ctx = {
		filename,
		mode,
		dev: devEnabled,
		parallelUse: parallelUseEnabled,
		hmr: hmrEnabled, // gates Symbol.for vs Symbol() hook slots (allocHookSymbol)
		runtimeNeeded: new Set(), // helpers referenced by GENERATED code — imported as `name as _$name`
		userRuntimeNames: new Set(), // specifiers USER code references — imported verbatim
		hoistedTemplates: [], // { name, html }
		hoistedHelpers: [], // raw JS strings (sub-components, hook Symbols, key fns)
		delegatedEvents: new Set(), // bubble event names seen in JSX — auto-emits delegateEvents(...)
		capturedEvents: new Set(), // capture-phase event names (onXxxCapture) — auto-emits delegateCaptureEvents(...)
		cssInjections: [], // { hash, css } — one entry per component with a <style> block
		currentComponentLocals: null, // Set<string> while compiling a component body; null otherwise
		knownStringLocals: null, // Set<string> of provably-string locals (text-hole inference)
		nextHookSymId: 0,
		nextPuId: 0, // parallel-use `__pu$N` hoisted-creation temps
		_pendingWarm: null, // `X.__warm = …` source, set by compileFunctionBody, drained by compileComponent
		nextFragId: 0,
		nextTemplateId: 0,
		nextHelperId: 0,
		// Same-module component eligibility for componentSlotLite (Design (c)
		// hookless lite path). Populated by the pre-pass below; read by
		// makeCompCall to branch the call-site emit.
		componentInfo: new Map(),
		// Source-map inputs, read by printNodeWithMap to ask esrap for real
		// per-token mappings against the original .tsrx.
		mapSource: source,
		mapSourceName: (filename || 'module.tsrx').split(/[\\/]/).pop(),
		// Per-component setup-statement maps, populated by compileFunctionBody on
		// the top-level (autoCallback) pass and drained per component below.
		_setupMaps: null,
	};
	// Imported local bindings (any source). Used by the M1 cross-module
	// singleRoot sentinel: only an IMPORTED identifier is a stable component
	// identity for the lifetime of a slot — a local `const Comp = cond ? A : B`
	// re-resolves per render, and a markerless slot regime must never be chosen
	// off an identity that can change (see makeCompCall).
	ctx.importedNames = new Set();
	for (const node of ast.body) {
		if (node.type !== 'ImportDeclaration') continue;
		for (const sp of node.specifiers || []) {
			if (sp.local && sp.local.name) ctx.importedNames.add(sp.local.name);
		}
	}
	// M3 inherit-range exclusion set (see inheritSoleCompRoot).
	ctx._octaneBoundaryNames = collectOctaneBoundaryNames(ast.body);
	// Client prelude `_$vtSeen()` module-load hint (view-transitions plan).
	ctx._usesViewTransition = moduleImportsViewTransition(ast.body);

	// List of exported components needing HMR wrapping. Each entry: { name,
	// exportKind: 'default' | 'named' }. We emit the `Comp = hmr(Comp)` lines
	// and the `import.meta.hot.accept` block after walking the body, so the
	// wrapping sits AFTER each component's `const Comp = …;` declaration.
	const hmrComponents = [];

	// === Design (c) v0 pre-pass: classify same-module components as
	// hookless+eligible for componentSlotLite. Two sweeps:
	//   (1) Register every same-module FunctionDeclaration component so that
	//       inter-component recursive references resolve to a known entry.
	//   (2) For each registered component, run a body walk to decide
	//       eligibility. Conservative rules: NO hooks, NO `use`/`useContext`/
	//       `memo`/`createPortal`, NO @try (TryStatement / JSXTryExpression),
	//       NO `children` destructure param, NO unknown free-function calls
	//       (catches transitive hooks via same-module helpers).
	//
	//   Recursion is OK: the recursive name appears as a free identifier in
	//   the body but is registered in ctx.componentInfo by sweep (1), so the
	//   unknown-call walker doesn't flag it.
	for (const node of ast.body) {
		let compNode = null;
		if (isComponentFunction(node)) compNode = node;
		else if (node.type === 'ExportDefaultDeclaration' && isComponentFunction(node.declaration))
			compNode = node.declaration;
		else if (node.type === 'ExportNamedDeclaration' && isComponentFunction(node.declaration))
			compNode = node.declaration;
		if (compNode && compNode.id) {
			ctx.componentInfo.set(compNode.id.name, { eligible: false, node: compNode });
		}
	}
	for (const [, info] of ctx.componentInfo) {
		const compNode = info.node;
		const locals = collectComponentLocals(compNode);
		// Synthesise a root node combining setup statements + JSX render body so
		// collectFreeIdentifiers sees the same identifier scope the runtime would.
		const stmts = (compNode.body.body || []).slice();
		if (compNode.body.render) stmts.push(compNode.body.render);
		const root = { type: 'BlockStatement', body: stmts };
		const free = collectFreeIdentifiers(root, locals);
		// Hookless check.
		let eligible = true;
		for (const n of free) {
			if (
				HOOK_NAMES.has(n) ||
				n === 'use' ||
				n === 'useContext' ||
				n === 'memo' ||
				n === 'createPortal'
			) {
				eligible = false;
				break;
			}
		}
		// Children-destructure-param rejection.
		if (
			eligible &&
			compNode.params &&
			compNode.params[0] &&
			compNode.params[0].type === 'ObjectPattern'
		) {
			for (const p of compNode.params[0].properties || []) {
				const k = p.key && (p.key.name || p.key.value);
				if (k === 'children') {
					eligible = false;
					break;
				}
			}
		}
		// Body walk: reject @try / TryStatement / unknown free-function calls
		// (catches transitive hooks via same-module helpers and unknown imports).
		if (eligible) {
			// Cycle / shared-subtree guard — see AST_WALK_SKIP_KEYS: the skip set
			// blocks the known back-reference carriers (CSS `metadata.parent_rule` /
			// rule-node arrays, acorn-typescript's `parent`), and the WeakSet blocks
			// shared-subtree re-entry, which otherwise hung vitest workers on the
			// bigger fixture files.
			const seen = new WeakSet();
			const reject = (function walk(n) {
				if (!n) return false;
				if (Array.isArray(n)) {
					for (const x of n) if (walk(x)) return true;
					return false;
				}
				if (typeof n !== 'object' || !n.type) return false;
				if (seen.has(n)) return false;
				seen.add(n);
				const t = n.type;
				if (t === 'TryStatement' || t === 'JSXTryExpression') return true;
				if (t === 'CallExpression' && n.callee && n.callee.type === 'Identifier') {
					const cname = n.callee.name;
					if (!locals.has(cname) && !ctx.componentInfo.has(cname) && !HOOK_NAMES.has(cname)) {
						return true;
					}
				}
				for (const k in n) {
					if (AST_WALK_SKIP_KEYS.has(k)) continue;
					if (walk(n[k])) return true;
				}
				return false;
			})(root);
			if (reject) eligible = false;
		}
		// M3 inherit-range: a body whose sole output is one component call BORROWS
		// its own block's marker range at that site (see inheritSoleCompRoot), so
		// callers must give it a real Block with a coherent range — a
		// componentSlotLite invocation (LiteBlockImpl: no startMarker, endMarker =
		// the call-site anchor) has nothing to borrow, and under HYDRATION the
		// declined borrow would probe for a child pair the server never emitted.
		// Reject lite for such callees.
		if (eligible && compNode.body && compNode.body.type === 'JSXCodeBlock') {
			const bodyNodes = normalizeChildren(
				compNode.body.render ? [compNode.body.render] : [],
			).filter((n) => n.type !== 'HeadHoist');
			if (inheritSoleCompRoot(bodyNodes, ctx)) eligible = false;
		}
		info.eligible = eligible;
		// Single-ELEMENT-root output: the component's body renders exactly one plain
		// DOM element (not a component tag, fragment, or control-flow). Such a
		// component self-delimits via that element on CLIENT mount — its
		// `componentSlot` needs no `comp`/`/comp` markers (singleRoot path), exactly
		// like a single-root `@for` item. (Output-shape based — independent of which
		// hooks it calls.)
		const render = compNode.body.render;
		info.singleRoot =
			render != null &&
			(render.type === 'JSXElement' || render.type === 'Element') &&
			!isComponentTag(render) &&
			typeof (render.id?.name ?? render.openingElement?.name?.name) === 'string';
	}

	let body = '';
	// Source-map bookkeeping. `bodySegments` collects mapping segments in
	// body-relative coordinates (0-based line within `body`); they're shifted by
	// the prelude line count and encoded at return. Segments come from esrap's
	// real per-token maps (component setup statements, top-level passthrough
	// statements) plus a coarse anchor at each component declaration line.
	let bodyLine = 0;
	const bodySegments = [];
	const pushEsrapSegments = (baseLine, colShift, mappings) => {
		for (let i = 0; i < mappings.length; i++) {
			for (const seg of mappings[i]) {
				bodySegments.push({
					genLine: baseLine + i,
					genCol: seg[0] + colShift,
					srcLine0: seg[2],
					srcCol0: seg[3],
				});
			}
		}
	};
	const pushDeclAnchor = (node, baseLine) => {
		const loc = node && node.loc && node.loc.start;
		if (loc) {
			bodySegments.push({
				genLine: baseLine,
				genCol: 0,
				srcLine0: loc.line - 1,
				srcCol0: loc.column | 0,
			});
		}
	};
	// Drain the setup-statement maps compileFunctionBody captured for the
	// component that starts at body line `base`.
	const drainSetupMaps = (base) => {
		if (ctx._setupMaps) {
			for (const e of ctx._setupMaps) pushEsrapSegments(base + e.fnRelLine, e.colShift, e.mappings);
			ctx._setupMaps = null;
		}
	};
	const compileOpts = { hmrWrap: hmrEnabled };
	for (const node of ast.body) {
		if (isComponentFunction(node)) {
			// `function Foo() @{ ... }` (new TSRX shape) — non-exported helper. HMR
			// doesn't wrap these (they're not user-visible across module boundaries).
			const base = bodyLine;
			ctx._setupMaps = null;
			const chunk = compileComponent(node, ctx) + '\n\n';
			pushDeclAnchor(node, base);
			drainSetupMaps(base);
			body += chunk;
			bodyLine += countNewlines(chunk);
		} else if (node.type === 'ExportDefaultDeclaration' && isComponentFunction(node.declaration)) {
			// `export default function Foo() @{...}` → emit as named const + `export default Foo;`.
			const c = node.declaration;
			const base = bodyLine;
			ctx._setupMaps = null;
			const compiled = compileComponent({ ...c, default: true }, ctx, compileOpts);
			pushDeclAnchor(node, base);
			drainSetupMaps(base);
			body += compiled + '\n\n';
			bodyLine += countNewlines(compiled + '\n\n');
			if (hmrEnabled) hmrComponents.push({ name: c.id.name, exportKind: 'default' });
		} else if (node.type === 'ExportNamedDeclaration' && isComponentFunction(node.declaration)) {
			// `export function Foo() @{...}` → emit as `export const Foo = ...;`.
			const c = node.declaration;
			const base = bodyLine;
			ctx._setupMaps = null;
			const compiled = compileComponent({ ...c, export: true }, ctx, compileOpts);
			pushDeclAnchor(node, base);
			drainSetupMaps(base);
			body += compiled + '\n\n';
			bodyLine += countNewlines(compiled + '\n\n');
			if (hmrEnabled) hmrComponents.push({ name: c.id.name, exportKind: 'named' });
		} else if (isReturnJsxFunction(node)) {
			// `function Foo() { …hooks…; return <jsx>; }` — a plain return-JSX function.
			const base = bodyLine;
			ctx._setupMaps = null;
			const chunk = compileReturnJsxFunction(node, ctx, {}) + '\n\n';
			pushDeclAnchor(node, base);
			drainSetupMaps(base);
			body += chunk;
			bodyLine += countNewlines(chunk);
		} else if (node.type === 'ExportNamedDeclaration' && isReturnJsxFunction(node.declaration)) {
			const base = bodyLine;
			ctx._setupMaps = null;
			const chunk = compileReturnJsxFunction(node.declaration, ctx, { export: true }) + '\n\n';
			pushDeclAnchor(node, base);
			drainSetupMaps(base);
			body += chunk;
			bodyLine += countNewlines(chunk);
		} else if (node.type === 'ExportDefaultDeclaration' && isReturnJsxFunction(node.declaration)) {
			const base = bodyLine;
			ctx._setupMaps = null;
			const chunk = compileReturnJsxFunction(node.declaration, ctx, { default: true }) + '\n\n';
			pushDeclAnchor(node, base);
			drainSetupMaps(base);
			body += chunk;
			bodyLine += countNewlines(chunk);
		} else if (node.type === 'ImportDeclaration' && node.source.value === 'octane') {
			// Preserve ALL user-imported names from octane (Portal, createContext,
			// use, custom helpers, etc.) — merged into the single prelude import.
			addUserImportSpecifiers(ctx, node);
		} else {
			// Style maps: rewrite `const x = <style>…</style>` before printing — the
			// initialiser becomes an ObjectExpression with hashed class names, and
			// the stylesheet flows through the regular cssInjections pipeline.
			applyStyleMap(node, ctx);
			// Also handle `export const x = <style>…</style>` (declaration wrapped
			// in an ExportNamedDeclaration).
			if (node.type === 'ExportNamedDeclaration' && node.declaration) {
				applyStyleMap(node.declaration, ctx);
			}
			// HOOKS EVERYWHERE: a plain function (a custom hook, a helper) can hold
			// octane hooks too — slot them the same way components do, so their base
			// hooks get a per-call-site symbol (and custom-hook calls inside get one to
			// forward). Harmless for non-hook code (only `use*` calls are touched).
			const fnName = node.id?.name || node.declaration?.id?.name || 'module';
			const hooked = rewriteHookCalls(node, ctx, fnName);
			// Lower any JSX component value (e.g. `root.render(<App/>)` or
			// `const el = <App/>`) to createElement(...) before printing — esrap
			// can't print raw JSX, and this is what makes root.render(<App/>) match
			// React's shape.
			const lowered = rewriteJsxValues(hooked, ctx);
			// Top-level passthrough (imports, plain consts/functions): print with
			// esrap's real map — col 0, no re-indent, single line offset.
			const base = bodyLine;
			const { code, mappings } = printNodeWithMap(lowered, ctx);
			pushEsrapSegments(base, 0, mappings);
			body += code + '\n';
			bodyLine += countNewlines(code + '\n');
		}
	}

	// Auto-emit delegateEvents([...]) / delegateCaptureEvents([...]) once at module
	// scope for every (bubble / capture) event seen.
	if (ctx.delegatedEvents.size > 0) {
		ctx.runtimeNeeded.add('delegateEvents');
	}
	if (ctx.capturedEvents.size > 0) {
		ctx.runtimeNeeded.add('delegateCaptureEvents');
	}

	// Build prelude. NOTE: `runtimeImport` is built BELOW (after the HMR block
	// possibly registers more runtime needs); we postpone that so the final
	// import list includes `hmr` / `HMR` when needed.
	const delegateCall =
		(ctx.delegatedEvents.size > 0
			? `_$delegateEvents(${JSON.stringify([...ctx.delegatedEvents].sort())});\n`
			: '') +
		(ctx.capturedEvents.size > 0
			? `_$delegateCaptureEvents(${JSON.stringify([...ctx.capturedEvents].sort())});\n`
			: '') +
		(ctx.delegatedEvents.size > 0 || ctx.capturedEvents.size > 0 ? '\n' : '');
	const styleInjections = ctx.cssInjections
		.map((i) => `_$injectStyle(${JSON.stringify(i.hash)}, ${JSON.stringify(i.css)});`)
		.join('\n');
	const styleBlock = styleInjections ? styleInjections + '\n\n' : '';
	const templates = ctx.hoistedTemplates
		.map((t) => {
			const args = [JSON.stringify(t.html)];
			if (t.ns || t.frag) args.push(String(t.ns | 0));
			if (t.frag) args.push(String(t.frag | 0));
			return `const ${t.name} = _$template(${args.join(', ')});`;
		})
		.join('\n');
	const templatesBlock = templates ? templates + '\n\n' : '';
	const helpers = ctx.hoistedHelpers.join('\n');
	const helpersBlock = helpers ? helpers + '\n\n' : '';

	// HMR plumbing — sits AFTER the component bodies so the wrappers can
	// reference the `Comp` const that was just declared. Each exported
	// component gets rewrapped (`Comp = hmr(Comp);`), default exports get
	// re-exported afterwards (we already emitted the `export default Comp;`
	// line earlier — re-exporting again would conflict, so the rewrap mutates
	// the binding in place). Mirrors `tsrx-ripple`'s emit shape.
	let hmrBlock = '';
	if (hmrComponents.length > 0) {
		// `hmr` is already registered as a needed runtime symbol by the
		// inline-wrap pass on each exported component. We still need `HMR` (the
		// Symbol key used to reach the wrapper's meta on `.update(...)`).
		ctx.runtimeNeeded.add('hmr');
		ctx.runtimeNeeded.add('HMR');
		const updates = hmrComponents
			.map((c) => {
				const accessor = c.exportKind === 'default' ? 'module.default' : `module.${c.name}`;
				return `    ${c.name}[_$HMR].update(${accessor});`;
			})
			.join('\n');
		hmrBlock =
			'if (import.meta.hot) {\n' +
			'  import.meta.hot.accept((module) => {\n' +
			updates +
			'\n' +
			'  });\n' +
			'}\n';
	}

	// Cross-module singleRoot stamps (docs/comment-marker-elision-plan.md M1):
	// a component whose body provably renders ONE plain element carries the
	// marker on its BINDING, so a `componentSlot(…, 2)` call site in ANOTHER
	// module can take the markerless singleRoot path at mount. Emitted at the
	// module tail so it lands on the final binding (incl. the hmr() wrapper —
	// the stamp goes on what importers see). Also feeds the runtime's existing
	// value-position `$$singleRoot` descriptor check.
	let stampBlock = '';
	if (ctx.componentInfo) {
		const stamps = [];
		for (const [name, info] of ctx.componentInfo) {
			if (info.singleRoot === true) stamps.push(`${name}.$$singleRoot = true;`);
		}
		if (stamps.length > 0) stampBlock = stamps.join('\n') + '\n';
	}

	// Module-load ViewTransition hint (see moduleImportsViewTransition) —
	// registered before the import list is built so `__vtSeen` gets aliased in.
	let vtHintBlock = '';
	if (ctx._usesViewTransition) {
		ctx.runtimeNeeded.add('__vtSeen');
		vtHintBlock = rtAlias('__vtSeen') + '();\n';
	}

	// Built after HMR wiring so the import list includes `hmr`/`HMR` when needed.
	const finalRuntimeImport = buildRuntimeImport(ctx, 'octane');

	// Everything before `body` in the output — shifts every body segment's
	// generated line down by the prelude's line count.
	const prelude =
		finalRuntimeImport + vtHintBlock + delegateCall + styleBlock + templatesBlock + helpersBlock;
	const preludeLines = countNewlines(prelude);
	const segments = bodySegments.map((s) => ({
		genLine: s.genLine + preludeLines,
		genCol: s.genCol,
		srcLine0: s.srcLine0,
		srcCol0: s.srcCol0,
	}));

	return {
		code: prelude + body + stampBlock + hmrBlock,
		map: buildSourceMap(source, ctx.mapSourceName, segments),
	};
}

// ===========================================================================
// Server (SSR) codegen
//
// A parallel, self-contained codegen path. Each component compiles to a
// function `(__s, props, __extra) => string` that BUILDS an HTML string by
// interleaving static chunks with `ssr*` runtime helpers for the dynamic holes
// (text/attrs/style/spread), `ssrComponent` for nested components, and the
// control-flow emitters (@if/@for/@switch/@try) — wrapping every dynamic site in
// the hydration markers (`constants.ts`) the client `hydrateRoot` adopts. The
// client path (template/clone + bindings) is left completely untouched.
//
// Still rejected with a clear diagnostic (see ssrUnsupported): `<Activity>` and
// fragment refs (`<Fragment ref={…}>`).
// ===========================================================================

function ssrUnsupported(what) {
	throw new Error(
		`octane server render does not support ${what}. Server mode covers static ` +
			`markup, dynamic text/attributes/style/spread, control flow ` +
			`(@if/@for/@switch/@try), nested components and scoped CSS.`,
	);
}

function compileServer(source, filename, options) {
	const ast = parseModule(source, filename);
	// Drop type-only statements before emit (see isTypeOnlyStatement) — same as
	// the client path; the server HTML-string output is plain JS too.
	ast.body = ast.body.filter((n) => !isTypeOnlyStatement(n));
	// Normalize arrow-function components (`const X = () => @{…}`) to
	// FunctionDeclaration form so the component pipeline recognizes them.
	normalizeArrowComponents(ast);
	// Mirror the client transform exactly. Effects are server no-ops, but
	// useMemo/useCallback execute during SSR and must receive the same inferred
	// dependency shape as hydration's client compile.
	applyHookDependencies(ast, { filename });
	const ctx = {
		filename,
		mode: 'server',
		hmr: false, // SSR never hot-swaps in place — hook slots are plain Symbol()s
		// SSR MIRROR of the parallel-`use()` pipeline (docs/suspense-parallel-use-
		// plan.md Phase 5): the same memoize (Pass A) + hoist/batch (Pass B)
		// transforms run on server bodies, emitting `_$puMemo`/`_$puBatch` — the
		// server-runtime twins with cross-pass creation identity — so independent
		// fetches REGISTER before the first suspend and a body stratum costs ONE
		// network round instead of one per use(). Same opt-out flag as the client.
		parallelUse: !(options && options.parallelUse === false),
		nextPuId: 0, // parallel-use `__pu$N` hoisted-creation temps
		_pendingWarm: null, // `X.__warm = …` source, set by ssrCompileBody, drained by compileServerComponent
		runtimeNeeded: new Set(), // helpers referenced by GENERATED code — imported as `name as _$name`
		userRuntimeNames: new Set(), // specifiers USER code references — imported verbatim
		hoistedHelpers: [],
		cssInjections: [],
		currentComponentLocals: null,
		knownStringLocals: null, // Set<string> of provably-string locals (text-hole inference)
		nextHookSymId: 0,
		nextFragId: 0,
		nextHelperId: 0,
		componentInfo: new Map(),
		mapSource: source,
		mapSourceName: (filename || 'module.tsrx').split(/[\\/]/).pop(),
		_setupMaps: null,
	};
	// M3 inherit-range exclusion set — must match the client compile's
	// (see inheritSoleCompRoot; both modes read the same import declarations).
	ctx._octaneBoundaryNames = collectOctaneBoundaryNames(ast.body);

	let body = '';
	for (const node of ast.body) {
		if (isComponentFunction(node)) {
			body += compileServerComponent(node, ctx) + '\n\n';
		} else if (node.type === 'ExportDefaultDeclaration' && isComponentFunction(node.declaration)) {
			body += compileServerComponent({ ...node.declaration, default: true }, ctx) + '\n\n';
		} else if (node.type === 'ExportNamedDeclaration' && isComponentFunction(node.declaration)) {
			body += compileServerComponent({ ...node.declaration, export: true }, ctx) + '\n\n';
		} else if (isReturnJsxFunction(node)) {
			// A `function C() { return <jsx> }` form (no `@{}`). SSR it through the same
			// component path as `@{}` so its host element + directives emit server markup
			// (the client folds it; the two must agree for hydration).
			body += compileServerComponent(node, ctx) + '\n\n';
		} else if (node.type === 'ExportNamedDeclaration' && isReturnJsxFunction(node.declaration)) {
			body += compileServerComponent({ ...node.declaration, export: true }, ctx) + '\n\n';
		} else if (node.type === 'ExportDefaultDeclaration' && isReturnJsxFunction(node.declaration)) {
			body += compileServerComponent({ ...node.declaration, default: true }, ctx) + '\n\n';
		} else if (node.type === 'ImportDeclaration' && node.source.value === 'octane') {
			// User imports from 'octane' resolve to the server runtime instead.
			addUserImportSpecifiers(ctx, node);
		} else {
			applyStyleMap(node, ctx);
			if (node.type === 'ExportNamedDeclaration' && node.declaration) {
				applyStyleMap(node.declaration, ctx);
			}
			body += printNode(rewriteJsxValues(node, ctx)) + '\n';
		}
	}

	const runtimeImport = buildRuntimeImport(ctx, 'octane/server');
	const helpers = ctx.hoistedHelpers.length ? ctx.hoistedHelpers.join('\n') + '\n\n' : '';
	const code = runtimeImport + helpers + body;
	// Minimal (valid, empty-mapping) source map. SSR source maps are a later
	// refinement; the client path keeps its real per-token maps.
	return { code, map: buildSourceMap(source, ctx.mapSourceName, []) };
}

// Reject async/generator component declarations — shared by the client and
// server compiles so the diagnostic (including the `use(promise)` remedy)
// can't drift between the two paths. The octane target has no async/generator
// component model; without this guard such a body compiles to broken
// synchronous code with no diagnostic — the worst failure mode. Fail loudly.
function rejectAsyncOrGenerator(node, name) {
	if (node.async) {
		throw new Error(
			`Component \`${name}\` is declared \`async\`, which the octane target does not support. ` +
				`Load async data with \`use(promise)\` inside a \`@try\` / \`@pending\` boundary instead of ` +
				`awaiting in the component body.`,
		);
	}
	if (node.generator) {
		throw new Error(
			`Component \`${name}\` is declared as a generator (\`function*\`), which the octane ` +
				`target does not support.`,
		);
	}
}

function compileServerComponent(node, ctx) {
	const name = node.id.name;
	rejectAsyncOrGenerator(node, name);

	const isExported = !!(node.export || node.default);
	const isDefault = !!node.default;

	// Scoped <style>: applyCssScoping stamps hash classes + registers cssInjections.
	// Capture this component's entries to emit injectStyle INSIDE the body (so the
	// active server render collects CSS only for components it actually renders).
	const beforeCss = ctx.cssInjections.length;
	const cssHash = applyCssScoping(node, ctx);
	const cssEntries = ctx.cssInjections.slice(beforeCss);

	const prevLocals = ctx.currentComponentLocals;
	const prevKnownStr = ctx.knownStringLocals;
	ctx.currentComponentLocals = collectComponentLocals(node);
	ctx.knownStringLocals = collectKnownStringLocals(node);
	let fn;
	try {
		fn = ssrCompileBody(node, ctx, name, cssHash, cssEntries);
	} finally {
		ctx.currentComponentLocals = prevLocals;
		ctx.knownStringLocals = prevKnownStr;
	}

	// SSR parallel-use mirror: attach the compiled fetch plan so a PARENT's warm
	// walk (`_$warmChild(Comp, props)` from its first suspending batch) can start
	// this component's independent creations before its body ever runs.
	const warmSrc = ctx._pendingWarm;
	ctx._pendingWarm = null;
	const warmTail = warmSrc ? `\n${name}.__warm = ${warmSrc};` : '';

	if (isDefault) return `const ${name} = ${fn};${warmTail}\nexport default ${name};`;
	if (isExported) return `export const ${name} = ${fn};${warmTail}`;
	return `const ${name} = ${fn};${warmTail}`;
}

function ssrCompileBody(node, ctx, name, cssHash, cssEntries, parentNs = 'html') {
	const params = node.params.map((p) => printNode(p)).join(', ');

	let statements;
	let jsxNodes;
	if (node.body && node.body.type === 'JSXCodeBlock') {
		statements = node.body.body || [];
		jsxNodes = node.body.render ? [node.body.render] : [];
	} else {
		// `node.body` may be a BlockStatement (`function f() { … return <jsx> }`, the
		// desugared `@{}` form) or, for legacy/synthetic callers, the statement array
		// itself. rewriteEarlyExits wants the array.
		const bodyStmts =
			node.body && node.body.type === 'BlockStatement' ? node.body.body || [] : node.body || [];
		const bodyRewritten = rewriteEarlyExits(bodyStmts);
		statements = [];
		jsxNodes = [];
		for (const child of bodyRewritten) {
			if (child.type === 'ReturnStatement' && child.argument && isJsxNode(child.argument)) {
				// return-JSX form: the returned host element (+ its directive children) is
				// the render output — route it to jsxNodes so it flows through ssrEmitNode
				// (byte-identical SSR to the `@{}` form), not printed as `return <jsx>`.
				// EXCEPT a returned FRAGMENT: the client VALUE-lowers `return <>…</>` to an
				// array of createElement descriptors (rewriteJsxValues), mounted by the
				// return-slot childSlot — whose hydration adopts ONE `<!--[-->…<!--]-->`
				// range for the slot plus one range PER ITEM (including text items). The
				// template walk would instead concatenate children with markerless text
				// separators and no slot range, desyncing the hydration cursor. Route the
				// whole fragment through the same value hole (`ssrChild(loweredArray)`) so
				// the runtime's ssrChild array branch emits the exact per-item shape the
				// client adopts.
				if (child.argument.type === 'JSXFragment' || child.argument.type === 'Fragment') {
					jsxNodes.push({
						type: 'TSRXExpression',
						expression: child.argument,
						loc: child.argument.loc,
					});
				} else {
					jsxNodes.push(child.argument);
				}
			} else if (isJsxNode(child)) {
				if (child.type === 'Element' && elementTagName(child) === 'style') continue;
				jsxNodes.push(child);
			} else statements.push(child);
		}
	}

	const inlinedSubs = [];
	// SSR parallel-use mirror: memoize + hoist/batch BEFORE rewriteHookCalls —
	// the rewritten `use(__pu$N)` unwraps then get their server site keys from
	// rewriteHookCalls exactly like hand-written use() calls, and the
	// `_$puMemo`/`_$puBatch` helper calls it emits are compiler-aliased names it
	// leaves alone. Mirrors the client pipeline shape exactly: TOP bodies run
	// Pass A on setup statements + the WalkJsx transform over the render tree
	// (directive-arm statements memoize HERE; the transformed nodes flow into
	// ssrEmitNodes below, so ssrCompileSub receives arms PRE-memoized and runs
	// Pass B only) + the warm artifacts (`Comp.__warm` fetch plan + the first
	// batch's warm thunk — see runtime.server.ts warmMemo/warmChild); synthetic
	// subs (statement arrays) run Pass B only. Loops/functions are excluded by
	// the passes themselves (same rules as the client).
	let workingStatements = statements;
	if (ctx.parallelUse) {
		let warmThunk = null;
		const isTopBody = !Array.isArray(node.body);
		if (isTopBody) {
			const creations = [];
			const warmChildren = [];
			workingStatements = parallelUseMemoizePass(workingStatements, ctx, name, creations, [], null);
			jsxNodes = parallelUseWalkJsx(jsxNodes, ctx, name, creations, warmChildren, [], new Set());
			const warm = buildWarmArtifacts(node, ctx, name, creations, warmChildren);
			warmThunk = warm.thunk;
			ctx._pendingWarm = warm.warmSrc;
		}
		workingStatements = rewriteParallelUse(workingStatements, ctx, name, warmThunk);
	}
	const rewritten = workingStatements
		.map((s) => rewriteHookCalls(s, ctx, name))
		.map((s) => rewriteJsxValues(s, ctx));
	const setupCode = rewritten.map((s) => '  ' + printNode(s).replace(/\n/g, '\n  ')).join('\n');

	// Partition hoisted `<title>`/`<meta>`/`<link>` out of the body (mirrors the
	// client planJsx): they accumulate into render()'s `head` via `ssrHeadEl`, NOT
	// the body HTML — so the body collapses to its single real root.
	const normalized = normalizeChildren(jsxNodes);
	const headNodes = normalized.filter((n) => n.type === 'HeadHoist');
	const bodyNodes = normalized.filter((n) => n.type !== 'HeadHoist');
	// A `return <jsx>` body (a React-style `.tsx` component) is VALUE position: the
	// client lowers it to `createElement(...)` descriptors, so a component's children
	// are DESCRIPTORS (one hydration block). A `@{}` body (JSXCodeBlock) is TEMPLATE
	// position: the client uses componentSlot + a `__children` render-fn (an extra
	// block). The server must match per form — flag value position so ssrEmitComponent
	// emits descriptor children for `.tsx`, keeping the server/client block counts
	// identical (a mismatch desyncs the hydration cursor). Restored after this body.
	//
	// SYNTHETIC subs (ssrCompileSub passes the statement ARRAY: @if/@for/@switch/@try
	// branches and `__schildren` component children) are always TEMPLATE position —
	// the client compiles those branches through the template walk (componentSlot +
	// markChildrenBlock render-fns) even when the enclosing body is a `return <jsx>`
	// value body. Resetting to value here made ssrEmitComponent take the descriptor
	// path inside every sub, which both desynced the block count from the client AND
	// silently DROPPED directive-block children of nested components (lowerJsxChild
	// cannot lower an @if to a descriptor) — a `<C>@if (…) { … }</C>` nested one sub
	// deep rendered `<C>` childless.
	const prevValuePos = ctx._tsxValuePos;
	ctx._tsxValuePos = Array.isArray(node.body)
		? false
		: !(node.body && node.body.type === 'JSXCodeBlock');
	// M3 inherit-range (mirror of the client's planJsx stamp — the SAME
	// inheritSoleCompRoot predicate over the same normalized roots, so the
	// client slot borrows exactly where the server skips the frame pair):
	// a `@{}` body whose sole output is one component call emits that call
	// with `inherit=true` → ssrComponent skips the `<!--[-->…<!--]-->` frame
	// wrap (the parent's own pair already bounds it). Synthetic sub-bodies
	// (statement arrays) never qualify. Consumed by ssrEmitComponent at the
	// root emit, before it recurses into props/children.
	const prevInheritRoot = ctx._ssrInheritRoot;
	ctx._ssrInheritRoot =
		!!(node.body && node.body.type === 'JSXCodeBlock') && inheritSoleCompRoot(bodyNodes, ctx);
	const htmlExpr = ssrEmitNodes(bodyNodes, ctx, name, inlinedSubs, parentNs, cssHash);
	ctx._ssrInheritRoot = prevInheritRoot;
	ctx._tsxValuePos = prevValuePos;

	let cssLines = '';
	if (cssEntries && cssEntries.length) {
		ctx.runtimeNeeded.add('injectStyle');
		cssLines =
			cssEntries
				.map((e) => `  _$injectStyle(${JSON.stringify(e.hash)}, ${JSON.stringify(e.css)});`)
				.join('\n') + '\n';
	}
	// `ssrHeadEl(…)` side-effect statements (one per hoisted head element), like injectStyle.
	const headLines = emitHeadServer(headNodes, ctx);
	const subsBlock = inlinedSubs.length
		? inlinedSubs.map((s) => '  ' + s.replace(/\n/g, '\n  ')).join('\n') + '\n'
		: '';
	const setupBlock = setupCode ? setupCode + '\n' : '';
	// PROPS-FIRST ABI (matches the client): `(…userParams, __s, __extra)`. A leading
	// `__props` placeholder stands in when there are no user params, so a verbatim
	// `function Foo(props)` and a compiled component both bind props from arg 0.
	const sig = params ? `${params}, __s, __extra` : `__props, __s, __extra`;
	return `function ${name}(${sig}) {\n${cssLines}${headLines}${setupBlock}${subsBlock}  return ${htmlExpr};\n}`;
}

// Classify a normalized JSX child for TEXT-ADJACENCY purposes. Shared by the
// client template walk (emitElementHtml / planJsx) and the server emitter
// (ssrEmitNodes) so the two sides stay in lockstep about which siblings
// produce mergeable text nodes:
//   'static' — a static string-literal Text (bakes / serializes as literal text)
//   'empty'  — a static literal that renders NOTHING (adjacency-transparent)
//   'dyn'    — a known-string dynamic text hole (client `<!>` + htextSwap,
//              server markerless ssrText)
//   'other'  — everything else (elements, renderable `{expr}` holes, control
//              flow — all serialize elements or `<!--[-->…<!--]-->` ranges
//              that break text-node adjacency on their own)
function textAdjacencyKind(node, ctx) {
	if (node.type !== 'Text') return 'other';
	const lit = staticTextLiteral(node.expression);
	if (lit !== null) return lit === '' ? 'empty' : 'static';
	return isKnownStringExpression(node.expression, ctx.knownStringLocals) ? 'dyn' : 'other';
}

// Does the child at `i` have a text-producing sibling next to it (looking
// through adjacency-transparent 'empty' literals)? Used to decide which
// dynamic text holes need the hole-aware hydration walk on the client — the
// exact positions where the server emits a `<!-- -->` separator.
function hasTextNeighbor(kinds, i) {
	for (let j = i - 1; j >= 0; j--) {
		if (kinds[j] === 'empty') continue;
		if (kinds[j] === 'static' || kinds[j] === 'dyn') return true;
		break;
	}
	for (let j = i + 1; j < kinds.length; j++) {
		if (kinds[j] === 'empty') continue;
		if (kinds[j] === 'static' || kinds[j] === 'dyn') return true;
		break;
	}
	return false;
}

// Serialize a list of normalized JSX nodes to a JS expression that evaluates to
// an HTML string (the concatenation of each node's expression).
// `nlGuardFirst`: the children belong to a newline-eating element (`<pre>`/
// `<textarea>`/`<listing>`) — the parser discards a '\n' immediately after the
// opening tag, so the FIRST emitted text part protects a leading newline by
// doubling it (React parity; a comment/element first part shields it already).
function ssrEmitNodes(nodes, ctx, name, inlinedSubs, parentNs, cssHash, nlGuardFirst = false) {
	const parts = [];
	// Adjacent text nodes MERGE when the browser re-parses the serialized HTML,
	// which would fuse a dynamic text hole with its text neighbour into ONE node
	// and leave the client's hydration walk a node short (React has the same
	// problem and the same cure: a `<!-- -->` comment between adjacent texts).
	// Emit the separator between two text-producing siblings whenever at least
	// one side is a DYNAMIC hole; static/static pairs stay markerless (the
	// client bakes those folded into the template, so the merged node adopts
	// cleanly). Empty static literals serialize nothing and are transparent to
	// adjacency. The client counterpart is the hole-aware `sibling()` walk in
	// runtime.ts, which treats separators as protocol nodes. Keep the comment
	// payload in sync with HYDRATION_TEXT_SEP (constants.ts).
	let prevText = null; // 'static' | 'dyn' | null — last emitted part's text kind
	for (const n of nodes) {
		const kind = textAdjacencyKind(n, ctx);
		if (kind === 'empty') continue; // serializes nothing — skip, adjacency-transparent
		const nlGuard = nlGuardFirst && parts.length === 0;
		const p = ssrEmitNode(n, ctx, name, inlinedSubs, parentNs, cssHash, nlGuard);
		if (p) {
			if (kind !== 'other' && prevText !== null && (kind === 'dyn' || prevText === 'dyn')) {
				parts.push(JSON.stringify('<!-- -->'));
			}
			parts.push(p);
			prevText = kind === 'other' ? null : kind;
		}
	}
	return parts.length ? parts.join(' + ') : "''";
}

function ssrEmitNode(node, ctx, name, inlinedSubs, parentNs, cssHash, nlGuard = false) {
	switch (node.type) {
		case 'Text': {
			const expr = node.expression;
			if (expr && expr.type === 'Literal' && typeof expr.value === 'string') {
				// Static text — escape at compile time, inline as a literal chunk. In
				// first-child position of a newline-eating tag, protect a leading '\n'
				// by doubling it (the parser eats the first — see ssrEmitNodes).
				const guard = nlGuard && expr.value.charCodeAt(0) === 10 ? '\n' : '';
				return JSON.stringify(guard + escapeHtml(expr.value));
			}
			// `{x as string}` / literals / templates / `+`-concats → definite TEXT.
			// Everything else (`{children}`, `{<Comp/>}`, possibly-renderable values)
			// → ssrChild, which RENDERS a component/element child (and coerces a
			// primitive to text) — mirrors Ripple's `{expr}` vs `{expr as string}`.
			// rewriteHookCalls: a `use(thenable)` in this hole bypasses the setup
			// rewrite, so key it here too (else it collides with sibling/nested use()).
			if (isKnownStringExpression(expr, ctx.knownStringLocals)) {
				// ssrTextPre = ssrText + the runtime leading-'\n' protection (the value
				// isn't known at compile time here).
				const fn = nlGuard ? 'ssrTextPre' : 'ssrText';
				ctx.runtimeNeeded.add(fn);
				return `_$${fn}(${printExpr(resolveStyleExpr(rewriteHookCalls(expr, ctx, name), cssHash))})`;
			}
			ctx.runtimeNeeded.add('ssrChild');
			// rewriteJsxValues lowers any JSX embedded in the expression (e.g.
			// `{cond && <div/>}`, a ternary, a `.map(x => <Row/>)`) to printable
			// createElement(...) descriptors — exactly like ssrEmitTsrxExpression and
			// the client makeChildCall. Without it the raw JSX leaks into the emitted
			// ssrChild(...) call as unparseable source.
			return `_$ssrChild(${printExpr(resolveStyleExpr(rewriteJsxValues(rewriteHookCalls(expr, ctx, name), ctx), cssHash))}, __s)`;
		}
		case 'Element':
			if (isComponentTag(node)) return ssrEmitComponent(node, ctx, name, inlinedSubs, cssHash);
			return ssrEmitElement(node, ctx, name, inlinedSubs, parentNs, cssHash);
		case 'TSRXExpression':
			return ssrEmitTsrxExpression(node, ctx, name, inlinedSubs, cssHash);
		case 'IfStatement':
			return ssrEmitIf(node, ctx, name, inlinedSubs, parentNs, cssHash);
		case 'ForOfStatement':
			return ssrEmitFor(node, ctx, name, inlinedSubs, parentNs, cssHash);
		case 'TryStatement':
			return ssrEmitTry(node, ctx, name, inlinedSubs, parentNs, cssHash);
		case 'SwitchStatement':
			return ssrEmitSwitch(node, ctx, name, inlinedSubs, parentNs, cssHash);
		case 'ActivityStatement':
			return ssrUnsupported('`<Activity>`');
		case 'FragmentStart':
		case 'FragmentEnd':
			return ssrUnsupported('fragment refs (`<Fragment ref={…}>`)');
		default:
			return ssrUnsupported(`node type ${node.type}`);
	}
}

function ssrEmitElement(node, ctx, name, inlinedSubs, parentNs, cssHash) {
	const tag = elementTagName(node);
	rejectVoidElementContent(tag, node, ctx);
	rejectTextareaValueChildren(tag, node, ctx);
	const attrs = node.attributes || node.openingElement?.attributes || [];
	// NB: the ns helpers take the TAG STRING (passing the node silently returns
	// the inherited ns — svg subtrees would never enter the svg namespace).
	const selfNs = nsForSelf(tag, parentNs);
	const childNs = nsForChildren(tag, selfNs);

	// `parts` are JS expressions concatenated with `+`. `lit` accumulates the
	// current static run so adjacent literals fold into one quoted chunk.
	// `<option>` builds its ATTRS-ONLY expression here — ssrOption assembles
	// the whole tag at runtime so an enclosing controlled `<select>` scope can
	// mark it ` selected` (see the option branch at the bottom).
	const parts = [];
	let lit = tag === 'option' ? '' : '<' + tag;
	const flush = () => {
		if (lit) {
			parts.push(JSON.stringify(lit));
			lit = '';
		}
	};

	// Controlled-form serialization state (mirrors the client helpers — see the
	// controlled section of runtime.server.ts): <input> maps `defaultValue`/
	// `defaultChecked` onto the native attrs and routes dynamic value/checked
	// through dedicated serializers; <textarea> routes value/defaultValue into
	// the CONTENT position; <select> feeds them to the option-projection scope
	// (never an attribute); <option> captures its `value` for the scope compare.
	let ctlValue = null; // textarea/select captured `value` expr
	let ctlDefault = null; // textarea/select captured `defaultValue` expr
	let selMultiple = 'false'; // select `multiple` expr (constant or temp)
	let optValue = null; // option `value` expr (constant or temp); null = no value attr

	const firstSpreadIdx = attrs.findIndex(
		(a) => a.type === 'SpreadAttribute' || a.type === 'JSXSpreadAttribute',
	);
	// Spreads are bound to temps (so their value is evaluated ONCE even though we
	// read it both for ssrSpread and for a possible `.dangerouslySetInnerHTML`).
	// `htmlSources` are the raw-HTML source exprs in source order (explicit
	// `dangerouslySetInnerHTML={…}` objects + spread `.dangerouslySetInnerHTML`).
	const spreadTemps = [];
	const htmlSources = [];
	// Wrap the assembled string in an IIFE that binds the spread temps when any
	// exist (so the temp names resolve); otherwise return the bare concatenation.
	const finalize = () => {
		const body = parts.join(' + ');
		if (spreadTemps.length === 0) return body;
		const decls = spreadTemps.map((t) => `const ${t.tempName} = (${t.argExpr});`).join(' ');
		return `(() => { ${decls} return ${body}; })()`;
	};

	for (let attrI = 0; attrI < attrs.length; attrI++) {
		const attr = attrs[attrI];
		if (attr.type === 'SpreadAttribute' || attr.type === 'JSXSpreadAttribute') {
			flush();
			ctx.runtimeNeeded.add('ssrSpread');
			const tmp = `__sp${spreadTemps.length}`;
			spreadTemps.push({
				tempName: tmp,
				argExpr: printExprWithTsrx(attr.argument, ctx, name, inlinedSubs),
			});
			parts.push(`_$ssrSpread(${tmp}, ${JSON.stringify(tag)})`);
			// The spread may carry `dangerouslySetInnerHTML` — record it as a raw-HTML
			// source (at this source position) so it participates in last-wins ordering.
			htmlSources.push(`(${tmp} != null ? ${tmp}.dangerouslySetInnerHTML : void 0)`);
			continue;
		}
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
		const rawAttrName = jsxAttrRawName(attr);
		if (rawAttrName === 'key') continue;
		// React-only hints — never serialize (`suppressHydrationWarning` is the
		// client hydration opt-out; `suppressContentEditableWarning` suppresses a
		// React DEV warning octane doesn't emit, but the key must not land in the
		// markup either — mirrors the client setAttribute skip).
		if (rawAttrName === 'suppressHydrationWarning') continue;
		if (rawAttrName === 'suppressContentEditableWarning') continue;
		// Events and refs have no server semantics — dropped.
		if (rawAttrName === 'ref') continue;
		if (isEventAttrName(rawAttrName)) continue;
		// `autoFocus` never serializes (React DOM server parity — the client
		// focuses at its mount commit; custom elements keep raw props).
		if (rawAttrName === 'autoFocus' && !tag.includes('-')) continue;
		// Custom elements keep names VERBATIM (React parity — they get raw props,
		// no alias tables; `className`→`class` still applies); ssrAttr applies
		// the same gate for dynamic values.
		const attrName = normalizeJsxAttrName(rawAttrName, tag);
		const val = attr.value;
		const isAfterSpread = firstSpreadIdx !== -1 && attrI > firstSpreadIdx;

		if (attrName === 'dangerouslySetInnerHTML' && val) {
			// React-style raw HTML: record the `{__html}` object as a raw-HTML source
			// (in source order); ssrInnerHtml reads `.__html` and emits it as the
			// element's (unescaped) inner content.
			const obj = val.type === 'JSXExpressionContainer' ? val.expression : val;
			htmlSources.push(printExpr(rewriteHookCalls(obj, ctx, name)));
			continue;
		}

		// ── Controlled form props (see the state block above the loop) ──
		if (
			(tag === 'input' || tag === 'textarea' || tag === 'select') &&
			(attrName === 'value' ||
				attrName === 'defaultValue' ||
				(tag === 'input' && (attrName === 'checked' || attrName === 'defaultChecked')))
		) {
			const ctlInner =
				val == null ? null : val.type === 'JSXExpressionContainer' ? val.expression : val;
			if (tag === 'input') {
				// defaultValue/defaultChecked serialize as the NATIVE attrs;
				// dynamic value/checked go through serializers that mirror the
				// client helpers byte-for-byte (value={false} → value="false",
				// checked truthy → bare presence).
				const isCheck = attrName === 'checked' || attrName === 'defaultChecked';
				if (ctlInner === null && !isAfterSpread) {
					// Bare boolean prop (`<input checked/>`) → static presence
					// (`value` bare mirrors the client's String(true)).
					lit += isCheck ? ' checked' : ' value="true"';
					continue;
				}
				if (ctlInner !== null && ctlInner.type === 'Literal' && !isAfterSpread) {
					const lv = ctlInner.value;
					if (isCheck) {
						if (lv != null && lv !== false) lit += ' checked';
					} else if (lv != null) {
						lit += ` value="${escapeAttr(String(lv))}"`;
					}
					continue;
				}
				flush();
				const ctlExpr =
					ctlInner === null ? 'true' : printExprWithTsrx(ctlInner, ctx, name, inlinedSubs);
				if (isCheck) {
					ctx.runtimeNeeded.add('ssrCheckedAttr');
					parts.push(`_$ssrCheckedAttr(${ctlExpr})`);
				} else {
					ctx.runtimeNeeded.add('ssrValueAttr');
					parts.push(`_$ssrValueAttr(${ctlExpr})`);
				}
				continue;
			}
			// textarea / select: value/defaultValue never serialize as attributes —
			// captured for the content position (textarea) / projection scope (select).
			const ctlExpr =
				ctlInner === null ? 'true' : printExprWithTsrx(ctlInner, ctx, name, inlinedSubs);
			if (attrName === 'value') ctlValue = ctlExpr;
			else ctlDefault = ctlExpr;
			continue;
		}
		if (tag === 'select' && attrName === 'multiple') {
			// Serialize the attribute normally AND capture the value for the
			// option-projection scope — a dynamic value binds to a temp so the
			// expression evaluates once.
			if (val == null) {
				selMultiple = 'true';
				lit += ' multiple';
				continue;
			}
			const mInner = val.type === 'JSXExpressionContainer' ? val.expression : val;
			if (mInner.type === 'Literal' && !isAfterSpread) {
				selMultiple = mInner.value ? 'true' : 'false';
				if (mInner.value === true) lit += ' multiple';
				else if (typeof mInner.value === 'string') lit += ` multiple="${escapeAttr(mInner.value)}"`;
				else if (typeof mInner.value === 'number') lit += ` multiple="${mInner.value}"`;
				continue;
			}
			const tmp = `__sp${spreadTemps.length}`;
			spreadTemps.push({
				tempName: tmp,
				argExpr: printExprWithTsrx(mInner, ctx, name, inlinedSubs),
			});
			selMultiple = tmp;
			flush();
			ctx.runtimeNeeded.add('ssrAttr');
			parts.push(`_$ssrAttr('multiple', ${tmp}, ${JSON.stringify(tag)})`);
			continue;
		}
		if (tag === 'option' && attrName === 'value') {
			// The option's value feeds BOTH the attribute and the select-scope
			// compare — a dynamic value binds to a temp for single evaluation.
			if (val == null) {
				optValue = '""';
				lit += ' value';
				continue;
			}
			const oInner = val.type === 'JSXExpressionContainer' ? val.expression : val;
			if (oInner.type === 'Literal' && !isAfterSpread) {
				optValue = JSON.stringify(String(oInner.value));
				if (typeof oInner.value === 'string') lit += ` value="${escapeAttr(oInner.value)}"`;
				else if (typeof oInner.value === 'number') lit += ` value="${oInner.value}"`;
				else if (oInner.value === true) lit += ' value';
				continue;
			}
			const tmp = `__sp${spreadTemps.length}`;
			spreadTemps.push({
				tempName: tmp,
				argExpr: printExprWithTsrx(oInner, ctx, name, inlinedSubs),
			});
			optValue = tmp;
			flush();
			ctx.runtimeNeeded.add('ssrAttr');
			parts.push(`_$ssrAttr('value', ${tmp}, ${JSON.stringify(tag)})`);
			continue;
		}

		// Boolean attribute (no value) → present.
		if (val == null) {
			lit += ' ' + attrName;
			continue;
		}

		let inner = val.type === 'JSXExpressionContainer' ? val.expression : val;

		if (attrName === 'style') {
			inner = resolveStyleExpr(inner, cssHash);
			if (!isAfterSpread && inner.type === 'Literal' && typeof inner.value === 'string') {
				lit += ` style="${escapeAttr(inner.value)}"`;
				continue;
			}
			if (!isAfterSpread && inner.type === 'ObjectExpression' && objectExprIsStaticLiteral(inner)) {
				const css = staticObjectToCssString(inner);
				if (css) lit += ` style="${escapeAttr(css)}"`;
				continue;
			}
			flush();
			ctx.runtimeNeeded.add('ssrStyle');
			parts.push(`_$ssrStyle(${printExprWithTsrx(inner, ctx, name, inlinedSubs)})`);
			continue;
		}

		// Static literal (and not after a spread) → inline into the tag.
		// bakeStaticAttr applies the shared React-parity value tables (client
		// bake stays byte-identical — hydration parity).
		if (!isAfterSpread && inner.type === 'Literal') {
			lit += bakeStaticAttr(attrName, inner.value, tag);
			continue;
		}

		// React 19 function actions: a function-valued `<form action={fn}>` /
		// `<button formAction={fn}>` / `<input formAction={fn}>` is submit wiring,
		// not a serializable URL — the client routes it to setFormAction. Server-
		// side, drop the function (mirroring the client's tag+name condition) so
		// pre-hydration HTML doesn't carry function source as a navigable action;
		// string values still serialize (under the native lowercase name, like the
		// client's setFormAction). Static string literals were already inlined above.
		if (
			(tag === 'form' && attrName === 'action') ||
			((tag === 'button' || tag === 'input') &&
				(attrName === 'formAction' || attrName === 'formaction'))
		) {
			flush();
			ctx.runtimeNeeded.add('ssrAttr');
			const outName = tag === 'form' ? 'action' : 'formaction';
			parts.push(
				`_$ssrAttr(${JSON.stringify(outName)}, ((__v) => (typeof __v === 'function' ? null : __v))(${printExprWithTsrx(inner, ctx, name, inlinedSubs)}), ${JSON.stringify(tag)})`,
			);
			continue;
		}

		// Dynamic attribute (or literal after a spread).
		flush();
		ctx.runtimeNeeded.add('ssrAttr');
		parts.push(
			`_$ssrAttr(${JSON.stringify(attrName)}, ${printExprWithTsrx(inner, ctx, name, inlinedSubs)}, ${JSON.stringify(tag)})`,
		);
	}

	// Void elements: `<tag …/>`, no children.
	if (VOID_ELEMENTS.has(tag) && (node.children || []).length === 0) {
		lit += '/>';
		flush();
		return finalize();
	}

	if (tag !== 'option') lit += '>'; // option: ssrOption assembles the tag (attrs-only here)
	const normChildren = normalizeChildren(node.children || [], childNs === 'svg');
	// Only-child renderable `{expr}` → markerless `ssrChildText` (mirrors the client's
	// markerless `childTextHole` mount: a primitive is the host's bare text, an object
	// still gets a `<!--[-->…<!--]-->` block). Must match the client's only-child
	// markerless condition exactly so both sides agree for hydration: a single `Text`
	// child that is neither a static literal (baked into HTML) nor a known string
	// (emitted via `ssrText`).
	const onlyChild0 =
		normChildren.length === 1 && normChildren[0].type === 'Text' ? normChildren[0] : null;
	let childrenExpr;
	if (
		htmlSources.length === 0 &&
		onlyChild0 !== null &&
		staticTextLiteral(onlyChild0.expression) === null &&
		!isKnownStringExpression(onlyChild0.expression, ctx.knownStringLocals)
	) {
		ctx.runtimeNeeded.add('ssrChildText');
		childrenExpr = `_$ssrChildText(${printExpr(resolveStyleExpr(rewriteJsxValues(rewriteHookCalls(onlyChild0.expression, ctx, name), ctx), cssHash))}, __s)`;
	} else {
		// pre/textarea/listing: the parser eats a '\n' right after the opening tag —
		// the first text part must protect a leading newline (see ssrEmitNodes).
		const nlGuardFirst = tag === 'pre' || tag === 'textarea' || tag === 'listing';
		childrenExpr = ssrEmitNodes(
			normChildren,
			ctx,
			name,
			inlinedSubs,
			childNs,
			cssHash,
			nlGuardFirst,
		);
	}
	// Controlled `<textarea value/defaultValue>`: the prop IS the content
	// (children were rejected at compile time) — value wins over defaultValue,
	// a nullish value falls through to the default (the client cascade).
	if (tag === 'textarea' && (ctlValue !== null || ctlDefault !== null)) {
		ctx.runtimeNeeded.add('ssrTextareaValue');
		const src =
			ctlValue !== null && ctlDefault !== null
				? `(${ctlValue}) ?? (${ctlDefault})`
				: (ctlValue ?? ctlDefault);
		childrenExpr = `_$ssrTextareaValue(${src})`;
	}
	// Controlled `<select value/defaultValue>`: push the option-projection
	// scope around the children serialization — every compiled/de-opt
	// `<option>` inside (across component boundaries and @for bodies; SSR is a
	// synchronous nested call tree) consults it via ssrOption.
	if (tag === 'select' && (ctlValue !== null || ctlDefault !== null)) {
		ctx.runtimeNeeded.add('ssrSelectScope');
		childrenExpr = `_$ssrSelectScope(${ctlValue ?? 'void 0'}, ${ctlDefault ?? 'void 0'}, ${selMultiple}, () => (${childrenExpr}))`;
	}
	// `<option>`: assemble via ssrOption so an active select scope can mark it
	// ` selected` (returns a plain `<option …>` when no scope is active).
	if (tag === 'option') {
		let contentExpr = childrenExpr;
		if (htmlSources.length > 0) {
			ctx.runtimeNeeded.add('ssrInnerHtml');
			contentExpr = `(_$ssrInnerHtml([${htmlSources.join(', ')}]) ?? (${childrenExpr}))`;
		}
		flush();
		const attrsExpr = parts.length > 0 ? parts.join(' + ') : "''";
		parts.length = 0;
		ctx.runtimeNeeded.add('ssrOption');
		parts.push(`_$ssrOption(${optValue ?? 'void 0'}, ${attrsExpr}, ${contentExpr})`);
		return finalize();
	}
	if (htmlSources.length > 0) {
		// Raw HTML (explicit and/or spread-supplied) wins over children when present
		// at runtime (last source wins); otherwise the children render.
		ctx.runtimeNeeded.add('ssrInnerHtml');
		flush();
		parts.push(`(_$ssrInnerHtml([${htmlSources.join(', ')}]) ?? (${childrenExpr}))`);
	} else if (childrenExpr !== "''") {
		flush();
		parts.push(childrenExpr);
	}
	lit += `</${tag}>`;
	flush();
	return finalize();
}

function ssrEmitComponent(node, ctx, name, inlinedSubs, cssHash) {
	// M3 inherit-range: consume the body-root flag ONCE, before this component's
	// props/children compile below (they recurse into ssrEmitNodes/ssrCompileSub
	// and must not inherit it). Set by ssrCompileBody only for the sole
	// comp-call root of a `@{}` body — which is exactly this emit.
	const inherit = ctx._ssrInheritRoot === true;
	ctx._ssrInheritRoot = false;
	const compExpr = tagExpr(node);
	const attrs = node.attributes || node.openingElement?.attributes || [];
	const propParts = [];
	for (const attr of attrs) {
		if (attr.type === 'SpreadAttribute' || attr.type === 'JSXSpreadAttribute') {
			propParts.push(`...(${printExprWithTsrx(attr.argument, ctx, name, inlinedSubs)})`);
			continue;
		}
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
		const attrName = attr.name.name || attr.name;
		if (attrName === 'key') continue;
		const val = attr.value;
		if (val == null) {
			propParts.push(`${JSON.stringify(attrName)}: true`);
			continue;
		}
		let inner = val.type === 'JSXExpressionContainer' ? val.expression : val;
		// Lower any JSX in the prop value to createElement(...) — e.g.
		// `fallback={<span/>}` or `fallback={(e) => <ErrorFallback/>}` — so esrap
		// emits a real descriptor instead of raw (unprintable) JSX. Mirrors the
		// client makeCompCall path; the renderPropChild branch below does the same.
		inner = resolveStyleExpr(rewriteJsxValues(inner, ctx), cssHash);
		if (inner.type === 'Literal') {
			propParts.push(`${JSON.stringify(attrName)}: ${JSON.stringify(inner.value)}`);
		} else {
			propParts.push(
				`${JSON.stringify(attrName)}: (${printExprWithTsrx(inner, ctx, name, inlinedSubs)})`,
			);
		}
	}
	// React-style render-prop child: pass the function through RAW so the consuming
	// component can call it with data (`props.children(data)`) and ssrChild renders
	// the result — mirrors the client `makeCompCall` path. A render-prop whose body
	// is just an expression (e.g. `(d) => d.label`) renders fine server-side; one
	// that returns JSX has its body lowered to value-position `createElement(...)`
	// descriptors (via rewriteJsxValues, exactly like the client) so the arrow stays
	// callable and ssrChild renders whatever descriptor it returns.
	const renderPropChild = soleRenderPropChild(node.children || []);
	if (renderPropChild) {
		propParts.push(
			`"children": (${printExprWithTsrx(rewriteJsxValues(renderPropChild, ctx), ctx, name, inlinedSubs)})`,
		);
	} else if ((node.children || []).length > 0) {
		if (ctx._tsxValuePos) {
			// VALUE position (a React-style `.tsx` `return <jsx>` body): pass children as
			// createElement DESCRIPTOR(s), exactly like the client's createElement. The
			// component renders `{props.children}` → ssrChild(descriptor) → ONE block,
			// matching the client's childSlot(descriptor). A `__children` render-fn would
			// instead add a wrapping block (ssrChild wraps the fn), making the server one
			// block deeper than the client and desyncing the hydration cursor.
			const kids = (node.children || []).map((c) => lowerJsxChild(c, ctx)).filter((e) => e != null);
			if (kids.length > 0) {
				const childrenExpr =
					kids.length === 1 ? kids[0] : { type: 'ArrayExpression', elements: kids };
				propParts.push(
					`"children": (${printExprWithTsrx(resolveStyleExpr(childrenExpr, cssHash), ctx, name, inlinedSubs)})`,
				);
			}
		} else {
			// TEMPLATE position (a `@{}` body): children → a server `children` render-fn
			// (returns an HTML string). The component decides whether/where to render
			// them by calling props.children(scope) — e.g. a context Provider does exactly
			// that. Mirrors the client `@{}` convention (componentSlot + a render fn).
			const sub = ssrCompileSub(node.children, ctx, '__schildren', [], cssHash, 'html');
			inlinedSubs.push(sub.fn + ';');
			// Tag the server children-block like the client does (see the client
			// emission in lowerComponentCall): a consumer's `typeof children ===
			// 'function' && !isChildrenBlock(children)` render-prop check must agree
			// on BOTH runtimes. Untagged, a binding (e.g. the router Link) INVOKES
			// the block as a render prop server-side, gets its HTML string back, and
			// the enclosing hole escapes that markup into visible text.
			ctx.runtimeNeeded.add('markChildrenBlock');
			propParts.push(`"children": _$markChildrenBlock(${sub.fnName})`);
		}
	}
	ctx.runtimeNeeded.add('ssrComponent');
	return `_$ssrComponent(__s, ${compExpr}, { ${propParts.join(', ')} }${inherit ? ', true' : ''})`;
}

// ---------------------------------------------------------------------------
// Server control flow — @if/@for/@switch/@try lowered to HTML-string builders.
// Each branch/item/case body is compiled (via ssrCompileSub) into a server
// sub-function returning a string, and the chosen branch's output is wrapped in
// `_$ssrBlock(…)` (BLOCK_OPEN/BLOCK_CLOSE markers) so a future client hydrate
// cursor can find the boundaries. Expressions (test/items/discriminant) are
// printed and evaluated at render time.
// ---------------------------------------------------------------------------

// Compile a list of body statements into a server sub-function `function NAME(__s,
// …params, __extra) { return <html>; }`. Returns { fnName, fn }; the caller pushes
// `fn` into the enclosing inlinedSubs.
function ssrCompileSub(bodyStmts, ctx, baseName, paramNodes, cssHash, parentNs) {
	const fnName = `${baseName}$${ctx.nextHelperId++}`;
	const synth = { params: paramNodes || [], body: bodyStmts };
	const fn = ssrCompileBody(synth, ctx, fnName, cssHash, [], parentNs || 'html');
	return { fnName, fn };
}

function ssrEmitIf(node, ctx, name, inlinedSubs, parentNs, cssHash) {
	// rewriteHookCalls: key any `use(thenable)` in the @if test (it bypasses the
	// setup rewrite, so without a stable key it collides with sibling/body use()).
	const testExpr = printExpr(rewriteHookCalls(node.test, ctx, name));
	const thenStmts =
		node.consequent.type === 'BlockStatement' ? node.consequent.body : [node.consequent];
	const thenSub = ssrCompileSub(thenStmts, ctx, '__sif', [], cssHash, parentNs);
	inlinedSubs.push(thenSub.fn + ';');
	let elseCall = "''";
	if (node.alternate) {
		// An `else if` arrives as an IfStatement; wrap it so it recurses through
		// ssrEmitNode and gets its own marker.
		const elseStmts =
			node.alternate.type === 'BlockStatement' ? node.alternate.body : [node.alternate];
		const elseSub = ssrCompileSub(elseStmts, ctx, '__selse', [], cssHash, parentNs);
		inlinedSubs.push(elseSub.fn + ';');
		elseCall = `${elseSub.fnName}(undefined, __s)`;
	}
	ctx.runtimeNeeded.add('ssrBlock');
	// Nested ranges: the OUTER ssrBlock is the if-slot; the INNER one wraps the
	// taken branch's content. The client adopts BOTH on hydration (slot = outer,
	// branch = inner) so no comment markers are inserted — byte-for-byte, exactly
	// like @for. The not-taken arm emits no inner range (just `''`).
	const thenInner = `_$ssrBlock(${thenSub.fnName}(undefined, __s))`;
	const elseInner = node.alternate ? `_$ssrBlock(${elseCall})` : "''";
	return `_$ssrBlock((${testExpr}) ? ${thenInner} : ${elseInner})`;
}

function ssrEmitFor(node, ctx, name, inlinedSubs, parentNs, cssHash) {
	// rewriteHookCalls: key any `use(thenable)` in the @for iterable expression.
	const itemsExpr = printExpr(rewriteHookCalls(node.right, ctx, name));
	const itemId = node.left.declarations[0].id; // Identifier or destructuring Pattern
	const params = [itemId];
	if (node.index) params.push(node.index);
	const itemSub = ssrCompileSub(node.body.body, ctx, '__sitem', params, cssHash, parentNs);
	inlinedSubs.push(itemSub.fn + ';');
	let emptyCall = "''";
	if (node.empty) {
		const emptyStmts = node.empty.type === 'BlockStatement' ? node.empty.body : [node.empty];
		const emptySub = ssrCompileSub(emptyStmts, ctx, '__sempty', [], cssHash, parentNs);
		inlinedSubs.push(emptySub.fn + ';');
		emptyCall = `${emptySub.fnName}(undefined, __s)`;
	}
	ctx.runtimeNeeded.add('ssrBlock');
	const mapper = node.index
		? `(__it, __i) => _$ssrBlock(${itemSub.fnName}(__it, __i, __s))`
		: `(__it) => _$ssrBlock(${itemSub.fnName}(__it, __s))`;
	// Eager: render every item now and join. No keyed reconciliation server-side;
	// each item gets its own block marker for a future hydrate to match.
	return `_$ssrBlock((() => { const __items = Array.from((${itemsExpr}) ?? []); return __items.length === 0 ? ${emptyCall} : __items.map(${mapper}).join(''); })())`;
}

function ssrEmitSwitch(node, ctx, name, inlinedSubs, parentNs, cssHash) {
	// rewriteHookCalls: key any `use(thenable)` in the @switch discriminant.
	const discExpr = printExpr(rewriteHookCalls(node.discriminant, ctx, name));
	const arms = [];
	let defaultCall = "''";
	for (const c of node.cases || []) {
		const sub = ssrCompileSub(c.consequent || [], ctx, '__scase', [], cssHash, parentNs);
		inlinedSubs.push(sub.fn + ';');
		// Inner ssrBlock wraps the matched case's content (see ssrEmitIf) so the
		// client adopts it as the branch range during hydration (no inserted markers).
		if (c.test == null) defaultCall = `_$ssrBlock(${sub.fnName}(undefined, __s))`;
		else arms.push(`__d === (${printExpr(c.test)}) ? _$ssrBlock(${sub.fnName}(undefined, __s))`);
	}
	ctx.runtimeNeeded.add('ssrBlock');
	// First case matching by strict-equality wins (no JS fall-through); else default.
	const selector = arms.length ? `${arms.join(' : ')} : ${defaultCall}` : defaultCall;
	return `_$ssrBlock((() => { const __d = (${discExpr}); return ${selector}; })())`;
}

function ssrEmitTry(node, ctx, name, inlinedSubs, parentNs, cssHash) {
	const trySub = ssrCompileSub(node.block.body, ctx, '__stry', [], cssHash, parentNs);
	inlinedSubs.push(trySub.fn + ';');
	// Each arm's content is wrapped in an INNER ssrBlock (see ssrEmitIf) so the
	// client adopts it as the boundary's branch range during hydration without
	// inserting comment markers (byte-for-byte). The OUTER ssrBlock is the slot.
	let pendFnName = 'null'; // no @pending → ssrTry renders an empty slot on suspend
	if (node.pending && node.pending.body && node.pending.body.length > 0) {
		const pendSub = ssrCompileSub(node.pending.body, ctx, '__spend', [], cssHash, parentNs);
		inlinedSubs.push(pendSub.fn + ';');
		pendFnName = pendSub.fnName;
	}
	let catchFnName = 'null'; // no @catch → ssrTry rethrows non-suspense errors
	if (node.handler) {
		const params = node.handler.param ? [node.handler.param] : [];
		const catchSub = ssrCompileSub(
			node.handler.body.body,
			ctx,
			'__scatch',
			params,
			cssHash,
			parentNs,
		);
		inlinedSubs.push(catchSub.fn + ';');
		// A no-param @catch simply ignores the error argument ssrTry passes.
		catchFnName = catchSub.fnName;
	}
	ctx.runtimeNeeded.add('ssrTry');
	// SSR @try routes through the runtime ssrTry helper: a `use(thenable)`
	// suspension renders the @pending fallback (plus, in STREAMING renders, the
	// boundary registration + `<template data-oct-b>` sentinel); any other thrown
	// error renders @catch (or rethrows). Output is byte-identical to the old
	// inline try/catch emit for buffered renders (hydration compatibility).
	// `siteKey` is a stable source-position hash so a boundary keeps its identity
	// across streaming passes (the runtime adds the frame path per instance).
	return `_$ssrTry(__s, "${ssrTryKey(node)}", ${trySub.fnName}, ${pendFnName}, ${catchFnName})`;
}

// Deterministic per-boundary site key for ssrTry — same scheme as headKey:
// keyed ONLY on the node's source position (same AST → same offset across the
// client and server compiles of one source), hashed compactly.
function ssrTryKey(node) {
	const pos = node && node.start != null ? node.start : 0;
	const src = `try:${pos}`;
	let h = 5381;
	for (let i = 0; i < src.length; i++) h = (Math.imul(h, 33) + src.charCodeAt(i)) | 0;
	return 't' + (h >>> 0).toString(36);
}

// `{createPortal(...)}` (and other JSX-bearing expression holes) at child
// position arrive as TSRXExpression. A portal leaves a site marker on the
// server (its body renders into a foreign target on the client). Every other
// rich hole — `{xs.map(x => <li/>)}`, a JSX ternary, an array of elements — is a
// VALUE-position JSX hole: lower its JSX to `createElement(...)` descriptors (via
// rewriteJsxValues, exactly like the client's makeChildCall) and route through
// ssrChild, which renders the resulting host/component descriptors (array → one
// hydration block per item, host → `<tag>…</tag>`, primitive → text).
function ssrEmitTsrxExpression(node, ctx, name, inlinedSubs, cssHash) {
	const expr = node.expression;
	if (
		expr &&
		expr.type === 'CallExpression' &&
		expr.callee &&
		expr.callee.type === 'Identifier' &&
		expr.callee.name === 'createPortal'
	) {
		ctx.runtimeNeeded.add('ssrPortal');
		return '_$ssrPortal()';
	}
	ctx.runtimeNeeded.add('ssrChild');
	// rewriteHookCalls first (key any `use(thenable)` in the hole — it bypasses the
	// setup rewrite), then rewriteJsxValues (lower nested JSX to createElement).
	const lowered = rewriteJsxValues(rewriteHookCalls(expr, ctx, name), ctx);
	return `_$ssrChild(${printExpr(resolveStyleExpr(lowered, cssHash))}, __s)`;
}

// ===========================================================================
// Component compilation
// ===========================================================================

/**
 * Style maps: `const styles = <style>...</style>;`
 *
 * Upstream ripple's headline form for "named class lookup": the variable's
 * initialiser — a `<style>` element — is replaced at compile time with an
 * object expression like `{ red: "red tsrx-abc", blue: "blue tsrx-abc" }`,
 * built from the parsed stylesheet. The component then references the
 * hashed class names via `class={styles.red}` instead of relying on the
 * implicit auto-scoping pass.
 *
 * The stylesheet ALSO gets registered for module-level injection via the
 * existing cssInjections pipeline, so the rules are emitted in a
 * `<style data-octane>` tag just like the auto-scoped case.
 *
 * `prepareStylesheetForRender(sheet, true)` switches the selector renderer
 * to "style expression" mode — selectors are emitted with hash classes
 * concatenated (`.red.tsrx-abc`) so the matched element only needs the
 * hash on its `class` attribute.
 */
function applyStyleMap(stmt, ctx) {
	if (stmt.type !== 'VariableDeclaration') return;
	for (const decl of stmt.declarations) {
		if (!decl.init || decl.init.type !== 'JSXStyleElement') continue;
		const styleNode = decl.init;
		const sheet = (styleNode.children || []).find((c) => c && c.type === 'StyleSheet');
		if (!sheet) continue;
		const hash = styleNode.metadata?.styleScopeHash || sheet.hash || null;
		if (!hash) continue;
		// `analyzeCss` marks `:global(...)` selectors (is_global / is_global_block
		// metadata) so the renderer leaves them UNSCOPED. Without this pass
		// `:global(a)` would be scoped to `.<hash>a`. Mirrors tsrx-ripple, which
		// runs analyzeCss(stylesheet) before prepareStylesheetForRender.
		analyzeCss(sheet);
		prepareStylesheetForRender(sheet, true);
		const css = renderStylesheets([sheet]);
		ctx.cssInjections.push({ hash, css });
		ctx.runtimeNeeded.add('injectStyle');
		// Replace the JSXStyleElement init with the class-map ObjectExpression.
		decl.init = createStyleClassMapFromStylesheet(sheet);
	}
}

// Wrap every DYNAMIC `class` / `className` expression in a `normalizeClass(...)` call
// BEFORE the scoped-CSS hash is appended. `@tsrx/core`'s annotate_with_hash bakes the
// hash onto a dynamic class via a template literal — `` `${expr} <hash>` `` — which would
// stringify an array/object clsx value the wrong way (`['a','b']` → "a,b", `{}` →
// "[object Object]"). Normalizing first makes the interpolated slot a plain string, so
// the hash concat stays correct AND clsx composition works in scoped components. (It also
// turns a bare `class={undefined}` in a scoped component from "undefined <hash>" into just
// "<hash>".) Unscoped components need no wrap — the runtime `setClassName` / `ssrAttr`
// normalize the raw value directly. String literals are left alone so they keep folding
// into the static template. Stops at nested component function boundaries (their class
// exprs belong to a different scope), mirroring annotate_with_hash's own traversal.
function wrapScopedClassExprs(node, ctx) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const item of node) wrapScopedClassExprs(item, ctx);
		return;
	}
	if (
		(node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression') &&
		node.metadata?.tsrx_dynamic_wrapper !== true
	) {
		return;
	}
	if (node.type === 'JSXElement') {
		const attrs = node.openingElement?.attributes;
		if (Array.isArray(attrs)) {
			for (const attr of attrs) {
				if (
					attr?.type === 'JSXAttribute' &&
					attr.name?.type === 'JSXIdentifier' &&
					(attr.name.name === 'class' || attr.name.name === 'className') &&
					attr.value?.type === 'JSXExpressionContainer'
				) {
					const expr = attr.value.expression;
					// Skip string literals (fold statically) and `{style (…)}` calls
					// (resolveStyleExpr owns those). Everything else is a runtime value.
					if (
						expr &&
						!(expr.type === 'Literal' && typeof expr.value === 'string') &&
						!isStyleCall(expr)
					) {
						attr.value.expression = {
							type: 'CallExpression',
							callee: { type: 'Identifier', name: '_$normalizeClass' },
							arguments: [expr],
							optional: false,
						};
						ctx.runtimeNeeded.add('normalizeClass');
					}
				}
			}
		}
	}
	for (const key of Object.keys(node)) {
		if (key === 'loc' || key === 'start' || key === 'end' || key === 'parent') continue;
		if (key === 'metadata' || key === 'css') continue;
		const v = node[key];
		if (v && typeof v === 'object') wrapScopedClassExprs(v, ctx);
	}
}

/**
 * Walk a new-TSRX component (its `JSXCodeBlock` body) for `JSXStyleElement`
 * nodes. For each one found:
 *   - Pull the pre-parsed `StyleSheet` AST out of its children.
 *   - Run `prepareStylesheetForRender` (rewrites `.foo` → `.foo.<hash>` —
 *     mutates the sheet in place).
 *   - Collect into a list rendered via `renderStylesheets` to a CSS string.
 *   - Register `{hash, css}` on `ctx.cssInjections` so a module-level
 *     `injectStyle(hash, css)` is emitted in the prelude.
 *   - Run `annotateWithHash` over `body.render` to stamp the hash class on
 *     every native JSX element AND remove the JSXStyleElement nodes from
 *     the rendered tree (they don't contribute DOM in the new model).
 *
 * Returns the hash, or `null` when no `<style>` blocks are present.
 *
 * The first `JSXStyleElement` we see contributes the canonical hash for the
 * whole component — multiple `<style>` blocks share it; that matches Ripple's
 * `annotate_component_with_hash`.
 */
function applyCssScoping(componentNode, ctx) {
	if (!componentNode.body || componentNode.body.type !== 'JSXCodeBlock') return null;
	let cssHash = null;
	const styleSheets = [];
	function collect(node) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const i of node) collect(i);
			return;
		}
		if (node.type === 'JSXStyleElement') {
			const sheet = (node.children || []).find((c) => c && c.type === 'StyleSheet');
			if (sheet) {
				styleSheets.push(sheet);
				if (!cssHash) cssHash = node.metadata?.styleScopeHash || sheet.hash || null;
			}
			return;
		}
		for (const key of Object.keys(node)) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'parent') continue;
			const v = node[key];
			if (v && typeof v === 'object') collect(v);
		}
	}
	collect(componentNode.body);
	if (!cssHash || styleSheets.length === 0) return null;
	for (const sheet of styleSheets) {
		// Mark `:global(...)` selectors before scoping so they render unscoped.
		analyzeCss(sheet);
		prepareStylesheetForRender(sheet);
	}
	const css = renderStylesheets(styleSheets);
	ctx.cssInjections.push({ hash: cssHash, css });
	ctx.runtimeNeeded.add('injectStyle');
	// Mutate the render tree: add hash class to every native element AND
	// strip JSXStyleElement nodes (annotateWithHash returns null for them when
	// preserve_style_elements=false, so we filter nulls out of children).
	if (componentNode.body.render) {
		// Normalize dynamic class exprs BEFORE the hash is appended (see helper), so
		// clsx array/object values compose correctly alongside the scope hash.
		wrapScopedClassExprs(componentNode.body.render, ctx);
		componentNode.body.render = annotateWithHash(
			componentNode.body.render,
			cssHash,
			'class',
			false,
		);
	}
	return cssHash;
}

function compileComponent(node, ctx, options) {
	const name = node.id.name;
	rejectAsyncOrGenerator(node, name);
	const isExported = !!(node.export || node.default);
	const isDefault = !!node.default;
	const hmrWrap = !!(options && options.hmrWrap);

	// Scoped `<style>` block. New TSRX surfaces each style block as a
	// `JSXStyleElement` child of the rendered tree (parser pre-computes the
	// content hash + parses CSS into a StyleSheet AST). Collect them, run the
	// @tsrx/core scoping pipeline (rewrites `.foo` → `.foo.<hash>` AND stamps
	// the hash class onto every element under this component), emit a single
	// module-level `injectStyle(hash, css)`, and surface `cssHash` so
	// resolveStyleExpr can also prefix any `{style (expr)}` class expressions.
	let cssHash = applyCssScoping(node, ctx);
	// Backwards-compat: internal callers (legacy synthetic Component shapes)
	// may still attach `.css` directly on the node.
	if (!cssHash && node.css) {
		analyzeCss(node.css);
		prepareStylesheetForRender(node.css);
		const css = renderStylesheets([node.css]);
		cssHash = node.css.hash;
		ctx.cssInjections.push({ hash: cssHash, css });
		ctx.runtimeNeeded.add('injectStyle');
	}

	// Snapshot the component's outer locals so nested for-of bodies can do
	// purity analysis (and auto-memo when the body doesn't reference any of
	// them). Stash on ctx for the duration of this compile so nested makeForCall
	// can reach it; restore on exit so sibling components don't see this one's
	// locals.
	const prevLocals = ctx.currentComponentLocals;
	const prevKnownStr = ctx.knownStringLocals;
	ctx.currentComponentLocals = collectComponentLocals(node);
	ctx.knownStringLocals = collectKnownStringLocals(node);
	let fn;
	try {
		// autoCallback: only top-level component bodies opt in. Item bodies and
		// other inner compileFunctionBody calls leave their arrows untouched
		// (they rarely declare arrow consts; if they do, the stability oracle
		// would need to be redefined relative to the inner scope).
		fn = compileFunctionBody(node, ctx, name, 'html', cssHash, { autoCallback: true });
	} finally {
		ctx.currentComponentLocals = prevLocals;
		ctx.knownStringLocals = prevKnownStr;
	}

	// parallelUse warm plan: attached to the INNER function object (not the
	// module const) so the component's own body — where the function-
	// expression name shadows the const — resolves `_$warmChild(Self, …)` to
	// an object that carries the plan. hmr() forwards `__warm` from the
	// wrapped fn onto its wrapper for cross-module references.
	const warmedFn = ctx._pendingWarm ? `Object.assign(${fn}, { __warm: ${ctx._pendingWarm} })` : fn;
	ctx._pendingWarm = null;

	// HMR-wrap exported components inline so the binding stays a `const` (no
	// reassignment dance needed). The wrapper preserves the user-facing
	// function-name identity by NAMING the inner FunctionExpression — `hmr`
	// returns a wrapper that delegates to whatever fn is currently committed,
	// and `module.Foo[HMR].update(...)` swaps it on each accept.
	const valueExpr = hmrWrap && isExported ? `_$hmr(${warmedFn})` : warmedFn;
	if (isDefault) {
		return `const ${name} = ${valueExpr};\nexport default ${name};`;
	}
	if (isExported) {
		return `export const ${name} = ${valueExpr};`;
	}
	return `const ${name} = ${valueExpr};`;
}

/**
 * Generate just the `function (...) { ... }` text for a component-shaped node.
 * Used both for top-level components and for inlined for-of item bodies.
 *
 * `parentNs` is the namespace this body's JSX is rendered into. For top-level
 * components it's 'html'; for an if/for/try body whose host element is in
 * SVG/MathML context it inherits that ns.
 *
 * `cssHash` is the enclosing component's scoped-style hash (or null) — used to
 * resolve `{style ('cls')}` expressions to "<hash> cls" strings.
 */
function compileFunctionBody(node, ctx, name, parentNs = 'html', cssHash = null, options = null) {
	const params = node.params.map((p) => printNode(p)).join(', ');

	// Body splitting. Two shapes to handle:
	//   (new TSRX)  node.body is a `JSXCodeBlock { body: Statement[], render: Node|null }`.
	//               Setup statements and the render JSX are already split for us.
	//               Early-return guards are normal JS `if (cond) return;` — the
	//               function's render is its single final expression, reached
	//               only if no return fired, so no early-exit desugaring needed.
	//   (legacy)    node.body is `Statement[]` with JSX nodes interleaved as
	//               statements. Used by internal callers that construct synthetic
	//               Component shapes (rewriteTsrxBlocks for old `<tsrx>` blocks,
	//               hoistBodyHelper for the constructs' inlined sub-bodies).
	//               Keep the old split + rewriteEarlyExits path for these.
	let statements;
	let jsxNodes;
	if (node.body && node.body.type === 'JSXCodeBlock') {
		statements = node.body.body || [];
		jsxNodes = node.body.render ? [node.body.render] : [];
	} else {
		const bodyRewritten = rewriteEarlyExits(node.body);
		statements = [];
		jsxNodes = [];
		for (const child of bodyRewritten) {
			if (isJsxNode(child)) {
				if (child.type === 'Element' && elementTagName(child) === 'style') continue;
				jsxNodes.push(child);
			} else statements.push(child);
		}
	}

	// Plan + emit JSX. Records any inline-sub-component code that needs to live
	// INSIDE this function body (so for-of item bodies can capture parent state).
	const inlinedSubs = [];

	// Auto-callback: lower `const X = (...) => ...` to `useCallback(X, [deps])`
	// for arrows whose free vars are all stable. Only runs at the component-body
	// level (caller opts in via options.autoCallback). For-of item bodies and
	// other inner compileFunctionBody calls skip this — they rarely declare
	// arrow consts, and the stability oracle is defined relative to the
	// component's scope, not the item body's.
	let workingStatements = statements;
	if (options && options.autoCallback && ctx.currentComponentLocals) {
		const stableSet = computeStableLocals(statements, ctx.currentComponentLocals);
		workingStatements = statements.map((s) =>
			rewriteAutoCallback(s, stableSet, ctx.currentComponentLocals, ctx),
		);
	}

	// parallelUse: the parallel-`use()` pipeline (docs/suspense-parallel-use-plan.md)
	// slots in HERE — after autoCallback (so memoized creations aren't re-wrapped),
	// before rewriteHookCalls (so the _$useMemo/_$useBatch calls it emits are
	// compiler-aliased, not user identifiers). Top-level component bodies run the
	// full pipeline: Pass A memoizes creations across the body AND the directive
	// arms of the render tree (arms hoist into sub-bodies later, already
	// transformed), the warm plan is derived from that same analysis, and Pass B
	// hoists+batches. Sub-bodies (hoisted @try/@if arms via hoistBodyHelper's
	// legacy path) arrive pre-memoized and run Pass B only.
	if (ctx.parallelUse) {
		let warmThunk = null;
		if (options && options.autoCallback) {
			const creations = [];
			const warmChildren = [];
			workingStatements = parallelUseMemoizePass(workingStatements, ctx, name, creations, [], null);
			jsxNodes = parallelUseWalkJsx(jsxNodes, ctx, name, creations, warmChildren, [], new Set());
			const warm = buildWarmArtifacts(node, ctx, name, creations, warmChildren);
			warmThunk = warm.thunk;
			ctx._pendingWarm = warm.warmSrc;
		}
		workingStatements = rewriteParallelUse(workingStatements, ctx, name, warmThunk);
	}

	// Rewrite hook calls and `<tsrx>` blocks in statements before printing them.
	// A `<tsrx>` block at expression position (e.g. `const f = <tsrx>...</tsrx>`)
	// is hoisted as a render function in inlinedSubs and replaced with an
	// identifier reference. Suitable for top-level render-prop patterns where
	// the block doesn't capture local arrow params.
	const rewrittenStatements = workingStatements
		.map((s) => rewriteHookCalls(s, ctx, name))
		.map((s) => rewriteTsrxBlocks(s, ctx, name, inlinedSubs))
		// JSX component element at VALUE position in setup (e.g. `const el = <App/>`)
		// → createElement(App, props). Output JSX (jsxNodes) was already split off.
		.map((s) => rewriteJsxValues(s, ctx));
	// Capture per-statement source maps for the TOP-LEVEL component body only
	// (the autoCallback pass). Output stays byte-identical — printNodeWithMap
	// prints the same code as printNode, it just also returns esrap's real
	// per-token mappings. Nested for-of / if / try bodies are embedded at
	// variable offsets and are left unmapped. Function-body layout: line 0 is
	// `function X(...) {`, line 1 is the `const __block` header, line 2 is the
	// first setup statement; statements join with '\n' and indent two spaces.
	const collectSetupMaps = !!(options && options.autoCallback && !(options && options.prologue));
	const setupMaps = collectSetupMaps ? [] : null;
	let stmtRelLine = 2;
	const statementCode = rewrittenStatements
		.map((s) => {
			let code;
			if (collectSetupMaps) {
				const r = printNodeWithMap(s, ctx);
				code = r.code;
				setupMaps.push({ fnRelLine: stmtRelLine, colShift: 2, mappings: r.mappings });
				stmtRelLine += 1 + countNewlines(code);
			} else {
				code = printNode(s);
			}
			return '  ' + code.replace(/\n/g, '\n  ');
		})
		.join('\n');
	if (collectSetupMaps) ctx._setupMaps = setupMaps;

	// A folded fragment renderer carries pre-built directive records; expose them so
	// emitElementHtml resolves each `FoldedDirective` placeholder (instead of calling
	// makeIfCall again, which would re-compile the branch bodies + re-allocate ids).
	const prevFDC = ctx._foldedDirectiveCalls;
	if (node.body && node.body.foldedDirectives)
		ctx._foldedDirectiveCalls = node.body.foldedDirectives;
	// M3 inherit-range: only a real `@{ … }` (JSXCodeBlock) component body spans
	// its block's whole range — synthetic sub-bodies (@if/@for/@try arms,
	// children render-fns) pass statement arrays and stay unflagged. planJsx
	// consumes the flag once (nested planJsx calls see it cleared).
	const prevInheritBody = ctx._inheritBody;
	ctx._inheritBody = !!(node.body && node.body.type === 'JSXCodeBlock');
	const plan = planJsx(jsxNodes, ctx, name, inlinedSubs, parentNs, cssHash);
	ctx._inheritBody = prevInheritBody;
	ctx._foldedDirectiveCalls = prevFDC;

	const lines = [];
	// Closure-dep snapshot prologue (raw JS string). Used by impure for-of item
	// bodies that close over parent locals but have no hooks / no component
	// calls / no control flow — they can short-circuit when every captured
	// value (deps + item ref) matches the previous render.
	if (options && options.prologue) lines.push(options.prologue);
	if (statementCode) lines.push(statementCode);
	if (inlinedSubs.length > 0)
		lines.push(inlinedSubs.map((s) => '  ' + s.replace(/\n/g, '\n  ')).join('\n'));
	// DEV ONLY: stash this component's hydration source-location table on the scope
	// before any slot calls run (so a mismatch in this render can read it). Set once per
	// scope instance. Emitted only when `dev` AND the body has located constructs, so prod
	// output is byte-identical.
	if (ctx.dev && plan.locs) {
		lines.push(
			`  if (__s.locs === undefined) { __s.locs = ${plan.locs}; __s.locFile = ${JSON.stringify(ctx.mapSourceName)}; }`,
		);
	}
	if (plan.hasBag) {
		lines.push(`  let _b = __s.slots[0];`);
		// Deferred property-write diffs (plan.everyRender) run on BOTH mount and
		// re-render, so they live after the if/else; the mount branch only clones +
		// stores refs, and `else` carries the re-render-only diffs (text / refs).
		// When there are none, drop the empty `else`.
		if (plan.update) {
			lines.push(`  if (_b === undefined) {`);
			lines.push(plan.mount);
			lines.push(`  } else {`);
			lines.push(plan.update);
			lines.push(`  }`);
		} else {
			lines.push(`  if (_b === undefined) {`);
			lines.push(plan.mount);
			lines.push(`  }`);
		}
		if (plan.everyRender) lines.push(plan.everyRender);
	}
	if (plan.after) lines.push(plan.after);
	// Hoisted `<title>`/`<meta>`/`<link>` → headBlock into document.head
	// (out-of-band; re-applied each render for reactivity, removed on unmount).
	if (plan.head) lines.push(plan.head);

	// PROPS-FIRST convention: `(…userProps, __s, __extra)`. The scope is the 2nd arg
	// (a placeholder leads when there are no user params), so a plain function
	// `App(props)` binds `props`, while compiled bodies still read `__s` by name.
	const sig = params ? `${params}, __s, __extra` : `__props, __s, __extra`;
	return `function ${name}(${sig}) {\n  const __block = __s.block;\n${lines.join('\n')}\n}`;
}

// ===========================================================================
// Parallel use() — docs/suspense-parallel-use-plan.md
// ===========================================================================

// The parallel-`use()` pipeline (gated on ctx.parallelUse). Three cooperating
// transforms reconstruct Solid/Ripple's "fetch starts at creation, suspension
// happens at read" property for React-shaped `use()` code:
//
//   Pass A (top-level component bodies, incl. directive-arm bodies BEFORE
//     they're hoisted): wrap each non-trivial `use(<expr>)` argument in a
//     slot-keyed `_$useMemo(() => <expr>, [deps], _h$N)` creation. Deps are
//     one-level member paths of the expression's free variables (props.id,
//     fetchFn), so refetch happens exactly when inputs change and a replay
//     can never mint a fresh promise. Loops and nested functions are NOT
//     entered: loop iterations share one slot symbol, so a memoized creation
//     there would fresh-promise every render and re-suspend forever.
//
//   Pass B (every function body): find maximal runs of `use()` declaration
//     statements (const/let interleaves only, taint-tracked), hoist each
//     run's creations into `__pu$N` temps above the first unwrap, and emit
//     `_$useBatch([...temps], warmThunk?)` so the boundary suspends ONCE on
//     the whole stratum instead of once per promise. Unwrap order (and with
//     it hydration-seed order) is preserved.
//
//   Warm plan (top-level bodies): from the SAME analysis, child component
//     slots whose reachability guards and props are provably independent of
//     every non-param local become `_$warmChild` calls in the first batch's
//     warm thunk, and the component gets a compiled `Comp.__warm` fetch plan
//     (its own warm-safe creations + guarded child warm calls) so warming
//     recurses down the tree — the whole descendant fetch tree starts in the
//     first attempt.
//
// With the flag off, output is byte-identical (pinned by
// tests/compile-parallel-use.test.ts).

// Names bound by a binding pattern (params, declarator ids). Mirrors the
// pattern handling of collectFreeIdentifiers' collectBindings.
function collectPatternNames(pat, into) {
	if (!pat) return into;
	switch (pat.type) {
		case 'Identifier':
			into.add(pat.name);
			break;
		case 'ObjectPattern':
			for (const p of pat.properties || []) {
				if (p.type === 'RestElement') collectPatternNames(p.argument, into);
				else collectPatternNames(p.value, into);
			}
			break;
		case 'ArrayPattern':
			for (const el of pat.elements || []) collectPatternNames(el, into);
			break;
		case 'AssignmentPattern':
			collectPatternNames(pat.left, into);
			break;
		case 'RestElement':
			collectPatternNames(pat.argument, into);
			break;
	}
	return into;
}

// Strip TS value-preserving wrappers (`x as T`, `x!`, `<T>x`, `x satisfies T`).
function unwrapTsExpr(n) {
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

// Dep extraction for a memoized creation: one-level member paths for free
// identifiers used as `obj.prop` (→ `props.id`, so a fresh props OBJECT with
// unchanged fields doesn't refetch), bare identifiers otherwise. Scope-aware:
// identifiers bound inside nested functions don't become deps.
function collectDepPaths(expr) {
	const deps = [];
	const seen = new Set();
	const push = (node, key) => {
		if (seen.has(key)) return;
		seen.add(key);
		deps.push(node);
	};
	walk(expr, new Set());
	return deps;

	function walk(n, bound) {
		if (!n || typeof n !== 'object') return;
		if (Array.isArray(n)) {
			for (const x of n) walk(x, bound);
			return;
		}
		switch (n.type) {
			case 'Identifier':
				if (!bound.has(n.name)) push({ type: 'Identifier', name: n.name }, n.name);
				return;
			case 'MemberExpression':
				if (!n.computed && n.object.type === 'Identifier' && n.property.type === 'Identifier') {
					if (!bound.has(n.object.name)) {
						const key = n.object.name + '.' + n.property.name;
						push(
							{
								type: 'MemberExpression',
								object: { type: 'Identifier', name: n.object.name },
								property: { type: 'Identifier', name: n.property.name },
								computed: false,
								optional: false,
							},
							key,
						);
					}
					return;
				}
				walk(n.object, bound);
				if (n.computed) walk(n.property, bound);
				return;
			case 'FunctionExpression':
			case 'ArrowFunctionExpression': {
				const inner = new Set(bound);
				for (const p of n.params || []) collectPatternNames(p, inner);
				walk(n.body, inner);
				return;
			}
			case 'Property':
				if (n.computed) walk(n.key, bound);
				walk(n.value, bound);
				return;
			case 'VariableDeclarator':
				walk(n.init, bound);
				return;
			default:
				for (const k in n) {
					if (k === 'loc' || k === 'start' || k === 'end' || k === 'metadata') continue;
					walk(n[k], bound);
				}
		}
	}
}

// A `use()` argument that needs no memoization: already-stable references
// (identifiers, static member chains) and literals.
function isTrivialUseArg(n) {
	n = unwrapTsExpr(n);
	if (!n) return true;
	if (n.type === 'Identifier' || n.type === 'Literal') return true;
	if (n.type === 'MemberExpression' && !n.computed) return isTrivialUseArg(n.object);
	return false;
}

const LOOP_TYPES = new Set([
	'ForStatement',
	'ForOfStatement',
	'ForInStatement',
	'WhileStatement',
	'DoWhileStatement',
]);
const FN_TYPES = new Set(['FunctionExpression', 'FunctionDeclaration', 'ArrowFunctionExpression']);

// Is this statement a `const/let x = use(<arg>)` declaration (or a bare
// `use(<arg>)` expression statement)? Returns the use CallExpression or null.
function useCallOfStatement(stmt) {
	let call = null;
	if (
		stmt.type === 'VariableDeclaration' &&
		(stmt.kind === 'const' || stmt.kind === 'let') &&
		stmt.declarations &&
		stmt.declarations.length === 1
	) {
		call = unwrapTsExpr(stmt.declarations[0].init);
	} else if (stmt.type === 'ExpressionStatement') {
		call = unwrapTsExpr(stmt.expression);
	}
	if (
		call &&
		call.type === 'CallExpression' &&
		call.callee.type === 'Identifier' &&
		call.callee.name === 'use' &&
		call.arguments.length >= 1
	) {
		return call;
	}
	return null;
}

// ── Pass A: memoize use() argument creations ───────────────────────────────
//
// Walks a statement array (recursing into if/blocks, NOT into loops or nested
// functions), rewriting each non-trivial `use(<expr>)` argument to
// `_$useMemo(() => <expr>, [deps], _h$N)` in place. Records every creation
// with its guard chain for the warm plan. Returns a new array.
function parallelUseMemoizePass(stmts, ctx, componentName, creations, guards, locals) {
	return stmts.map((stmt) => rewriteStmt(stmt));

	function rewriteStmt(stmt) {
		if (!stmt || typeof stmt !== 'object') return stmt;
		if (LOOP_TYPES.has(stmt.type) || FN_TYPES.has(stmt.type)) return stmt;
		const call = useCallOfStatement(stmt);
		if (call) {
			const rewritten = rewriteUseCall(call);
			if (rewritten === call) return stmt;
			if (stmt.type === 'VariableDeclaration') {
				return {
					...stmt,
					declarations: [{ ...stmt.declarations[0], init: rewritten }],
				};
			}
			return { ...stmt, expression: rewritten };
		}
		if (stmt.type === 'IfStatement') {
			return {
				...stmt,
				consequent: rewriteStmt(stmt.consequent),
				alternate: stmt.alternate ? rewriteStmt(stmt.alternate) : stmt.alternate,
			};
		}
		if (stmt.type === 'BlockStatement') {
			return {
				...stmt,
				body: parallelUseMemoizePass(stmt.body, ctx, componentName, creations, guards, locals),
			};
		}
		return stmt;
	}

	function rewriteUseCall(call) {
		const arg = unwrapTsExpr(call.arguments[0]);
		if (isTrivialUseArg(arg)) return call;
		const symVar = allocHookSymbol(ctx, `${componentName}.use.memo#${ctx.nextHookSymId}`);
		const deps = collectDepPaths(arg);
		// Server mirror: `puMemo` — keyed CROSS-PASS creation cache (a fresh
		// SSRScope per pass makes client useMemo semantics useless there).
		const memoHelper = ctx.mode === 'server' ? 'puMemo' : 'useMemo';
		ctx.runtimeNeeded.add(memoHelper);
		creations.push({ symVar, expr: arg, deps, guards: [...guards], locals });
		const memoCall = {
			type: 'CallExpression',
			callee: { type: 'Identifier', name: `_$${memoHelper}` },
			arguments: [
				{ type: 'ArrowFunctionExpression', params: [], expression: true, async: false, body: arg },
				{ type: 'ArrayExpression', elements: deps },
				{ type: 'Identifier', name: symVar },
			],
			optional: false,
		};
		return { ...call, arguments: [memoCall, ...call.arguments.slice(1)] };
	}
}

// Pass A over the RENDER tree: memoize statements inside directive-arm bodies
// (they hoist into sub-bodies later, already transformed) and collect
// child-component warm candidates with their guard chains. Recursion stops at
// @for/@switch arms (v1) and does not enter component children. `locals`
// accumulates arm-scoped bindings (e.g. `const a = use(…)` inside a @try
// body) so warm-safety can see them — they are NOT in
// ctx.currentComponentLocals, which only covers the top body.
function parallelUseWalkJsx(nodes, ctx, componentName, creations, warmChildren, guards, locals) {
	return nodes.map((n) => walkNode(n));

	function walkNode(node) {
		if (!node || typeof node !== 'object') return node;
		switch (node.type) {
			case 'JSXElement': {
				const nameNode = node.openingElement && node.openingElement.name;
				const isComponent =
					nameNode && nameNode.type === 'JSXIdentifier' && /^[A-Z]/.test(nameNode.name);
				if (isComponent) {
					collectWarmChild(node, nameNode.name);
					return node; // component children render inside the child — don't descend
				}
				return {
					...node,
					children: parallelUseWalkJsx(
						node.children || [],
						ctx,
						componentName,
						creations,
						warmChildren,
						guards,
						locals,
					),
				};
			}
			case 'JSXFragment':
				return {
					...node,
					children: parallelUseWalkJsx(
						node.children || [],
						ctx,
						componentName,
						creations,
						warmChildren,
						guards,
						locals,
					),
				};
			case 'JSXIfExpression': {
				const not = (e) => ({ type: 'UnaryExpression', operator: '!', prefix: true, argument: e });
				const consequent = walkArm(node.consequent, [...guards, node.test]);
				const alternate = node.alternate
					? walkArm(node.alternate, [...guards, not(node.test)])
					: node.alternate;
				return { ...node, consequent, alternate };
			}
			case 'JSXTryExpression': {
				// The try arm renders whenever the component renders — no extra
				// guard. @pending/@catch arms are exceptional paths: no warming.
				const out = { ...node };
				if (node.block) out.block = walkArm(node.block, guards);
				return out;
			}
			default:
				// @for / @switch arms: v1 — no memoization, no warming (loop slot
				// sharing; switch guards deferred). Everything else is inert.
				return node;
		}
	}

	function walkArm(arm, armGuards) {
		if (!arm || arm.type !== 'BlockStatement') return arm;
		// Arm-scoped bindings become visible to warm-safety for everything in
		// this arm (conservatively hoisted: order within the arm is ignored).
		const armLocals = new Set(locals);
		for (const entry of arm.body) {
			if (entry.type === 'VariableDeclaration') {
				for (const d of entry.declarations || []) collectPatternNames(d.id, armLocals);
			}
		}
		// Arm bodies interleave statements and JSX nodes; route each entry to
		// the right walker.
		const body = arm.body.map((entry) => {
			if (
				entry.type === 'JSXElement' ||
				entry.type === 'JSXFragment' ||
				entry.type === 'JSXIfExpression' ||
				entry.type === 'JSXTryExpression'
			) {
				return parallelUseWalkJsx(
					[entry],
					ctx,
					componentName,
					creations,
					warmChildren,
					armGuards,
					armLocals,
				)[0];
			}
			return parallelUseMemoizePass(
				[entry],
				ctx,
				componentName,
				creations,
				armGuards,
				armLocals,
			)[0];
		});
		return { ...arm, body };
	}

	function collectWarmChild(node, compName) {
		const attrs = node.openingElement.attributes || [];
		if ((node.children || []).length > 0) return; // children render inside the child — skip
		const props = [];
		for (const a of attrs) {
			if (a.type !== 'JSXAttribute' || a.name.type !== 'JSXIdentifier') return; // spread etc.
			const key = a.name.name;
			if (key === 'ref' || key === 'key') return; // instance-wired props — skip this slot
			let value;
			if (a.value == null) value = { type: 'Literal', value: true, raw: 'true' };
			else if (a.value.type === 'JSXExpressionContainer') value = a.value.expression;
			else value = a.value; // Literal
			props.push({ key, value });
		}
		warmChildren.push({ compName, props, guards: [...guards], locals });
	}
}

// Does this expression subtree contain JSX (or a TSRX directive)? Such
// expressions cannot be re-printed into a warm plan — they only exist in
// lowered form inside the real render path.
function containsJsxNode(n) {
	if (!n || typeof n !== 'object') return false;
	if (Array.isArray(n)) return n.some(containsJsxNode);
	if (typeof n.type === 'string' && n.type.startsWith('JSX')) return true;
	for (const k in n) {
		if (k === 'loc' || k === 'start' || k === 'end' || k === 'metadata') continue;
		if (containsJsxNode(n[k])) return true;
	}
	return false;
}

// Warm-safety: every free identifier of the expression is a component param
// or module-scope (NOT a non-param local — component-body OR directive-arm
// scoped; those may not exist or may be suspended-data-derived at warm time),
// and the expression is plain JS (no JSX — descriptors only exist lowered).
function isWarmSafeExpr(expr, paramNames, componentLocals, armLocals) {
	if (containsJsxNode(expr)) return false;
	const free = collectFreeIdentifiers(expr, []);
	for (const id of free) {
		if (paramNames.has(id)) continue;
		if (componentLocals && componentLocals.has(id)) return false;
		if (armLocals && armLocals.has(id)) return false;
	}
	return true;
}

// ── Pass B: run detection + hoist + batch ───────────────────────────────────
function rewriteParallelUse(statements, ctx, componentName, warmThunk) {
	let firstBatch = true;
	return transformList(statements);

	function transformList(stmts) {
		const out = [];
		let run = null; // { members: [{stmt, call?, creation?}], names: Set }
		const flush = () => {
			if (!run) return;
			emitRun(run, out);
			run = null;
		};
		for (const stmt of stmts) {
			const call = stmt && typeof stmt === 'object' ? useCallOfStatement(stmt) : null;
			if (call) {
				const creation = unwrapTsExpr(call.arguments[0]);
				const free = collectFreeIdentifiers(creation, []);
				let conflict = false;
				if (run) {
					for (const id of free) {
						if (run.names.has(id)) {
							conflict = true;
							break;
						}
					}
				}
				if (conflict) flush();
				if (!run) run = { members: [], names: new Set() };
				run.members.push({ stmt, call, creation });
				if (stmt.type === 'VariableDeclaration') {
					collectPatternNames(stmt.declarations[0].id, run.names);
				}
				continue;
			}
			if (
				run &&
				stmt &&
				stmt.type === 'VariableDeclaration' &&
				(stmt.kind === 'const' || stmt.kind === 'let')
			) {
				// Interleaved declaration: allowed in a run, but its bindings join
				// the no-hoist-past set (a later creation referencing them cannot
				// hoist above this statement).
				run.members.push({ stmt });
				for (const d of stmt.declarations || []) collectPatternNames(d.id, run.names);
				continue;
			}
			flush();
			// Recurse into conditional blocks so a guarded use() run batches
			// within its own block (loops/functions stay untouched).
			if (stmt && stmt.type === 'IfStatement') {
				out.push({
					...stmt,
					consequent: transformStmtBlock(stmt.consequent),
					alternate: stmt.alternate ? transformStmtBlock(stmt.alternate) : stmt.alternate,
				});
				continue;
			}
			if (stmt && stmt.type === 'BlockStatement') {
				out.push({ ...stmt, body: transformList(stmt.body) });
				continue;
			}
			out.push(stmt);
		}
		flush();
		return out;
	}

	function transformStmtBlock(s) {
		if (!s) return s;
		if (s.type === 'BlockStatement') return { ...s, body: transformList(s.body) };
		return s;
	}

	function emitRun(run, out) {
		const uses = run.members.filter((m) => m.call);
		if (uses.length === 0) {
			for (const m of run.members) out.push(m.stmt);
			return;
		}
		// Hoist each creation into a temp, batch, then re-emit the original
		// statements with creations swapped for the temps. Unwrap order (and
		// hydration-seed order with it) is untouched.
		const temps = [];
		const tempOf = new Map();
		for (const m of uses) {
			const name = `__pu$${ctx.nextPuId++}`;
			temps.push({ name, init: m.creation });
			tempOf.set(m.call, name);
		}
		for (const t of temps) {
			out.push({
				type: 'VariableDeclaration',
				kind: 'const',
				declarations: [
					{
						type: 'VariableDeclarator',
						id: { type: 'Identifier', name: t.name },
						init: t.init,
					},
				],
			});
		}
		// Server mirror: `puBatch` registers every unresolved thenable of the run
		// with the render loop and suspends ONCE (identity-resolved on the next
		// pass — see runtime.server.ts).
		const batchHelper = ctx.mode === 'server' ? 'puBatch' : 'useBatch';
		ctx.runtimeNeeded.add(batchHelper);
		const batchArgs = [
			{
				type: 'ArrayExpression',
				elements: temps.map((t) => ({ type: 'Identifier', name: t.name })),
			},
		];
		if (firstBatch && warmThunk) batchArgs.push(warmThunk);
		firstBatch = false;
		out.push({
			type: 'ExpressionStatement',
			expression: {
				type: 'CallExpression',
				callee: { type: 'Identifier', name: `_$${batchHelper}` },
				arguments: batchArgs,
				optional: false,
			},
		});
		for (const m of run.members) {
			if (!m.call) {
				out.push(m.stmt);
				continue;
			}
			const tempId = { type: 'Identifier', name: tempOf.get(m.call) };
			const newCall = { ...m.call, arguments: [tempId, ...m.call.arguments.slice(1)] };
			if (m.stmt.type === 'VariableDeclaration') {
				out.push({
					...m.stmt,
					declarations: [{ ...m.stmt.declarations[0], init: newCall }],
				});
			} else {
				out.push({ ...m.stmt, expression: newCall });
			}
		}
	}
}

// Build the warm thunk AST (child warm calls for the first in-body batch) +
// the `Comp.__warm` source (creations + child calls) for a top-level body.
function buildWarmArtifacts(node, ctx, componentName, creations, warmChildren) {
	const paramNames = new Set();
	for (const p of node.params || []) collectPatternNames(p, paramNames);
	const locals = ctx.currentComponentLocals;

	const guardOk = (guards, armLocals) =>
		guards.every((g) => isWarmSafeExpr(g, paramNames, locals, armLocals));
	const andChain = (guards) =>
		guards.length === 0
			? null
			: guards.reduce(
					(acc, g) =>
						acc ? { type: 'LogicalExpression', operator: '&&', left: acc, right: g } : g,
					null,
				);

	const warmMemos = creations.filter(
		(c) => guardOk(c.guards, c.locals) && isWarmSafeExpr(c.expr, paramNames, locals, c.locals),
	);
	const warmKids = warmChildren.filter(
		(w) =>
			guardOk(w.guards, w.locals) &&
			!paramNames.has(w.compName) &&
			!(locals && locals.has(w.compName)) &&
			!(w.locals && w.locals.has(w.compName)) &&
			w.props.every((p) => isWarmSafeExpr(p.value, paramNames, locals, w.locals)),
	);
	if (warmKids.length === 0 && warmMemos.length === 0) return { thunk: null, warmSrc: null };

	const stmtFor = (guards, callExpr) => {
		const g = andChain(guards);
		const call = { type: 'ExpressionStatement', expression: callExpr };
		return g ? { type: 'IfStatement', test: g, consequent: call, alternate: null } : call;
	};
	const memoCall = (c) => ({
		type: 'CallExpression',
		callee: { type: 'Identifier', name: '_$warmMemo' },
		arguments: [
			{ type: 'ArrowFunctionExpression', params: [], expression: true, async: false, body: c.expr },
			{ type: 'ArrayExpression', elements: c.deps },
			{ type: 'Identifier', name: c.symVar },
		],
		optional: false,
	});
	const childCall = (w) => ({
		type: 'CallExpression',
		callee: { type: 'Identifier', name: '_$warmChild' },
		arguments: [
			{ type: 'Identifier', name: w.compName },
			{
				type: 'ObjectExpression',
				properties: w.props.map((p) => ({
					type: 'Property',
					key: { type: 'Identifier', name: p.key },
					value: p.value,
					kind: 'init',
					method: false,
					shorthand: false,
					computed: false,
				})),
			},
		],
		optional: false,
	});

	if (warmMemos.length > 0) ctx.runtimeNeeded.add('warmMemo');
	if (warmKids.length > 0) ctx.runtimeNeeded.add('warmChild');

	// In-body warm thunk: children only — the body's own creations already ran
	// as real memos by the time the batch throws.
	const thunk =
		warmKids.length === 0
			? null
			: {
					type: 'ArrowFunctionExpression',
					params: [],
					expression: false,
					async: false,
					body: {
						type: 'BlockStatement',
						body: warmKids.map((w) => stmtFor(w.guards, childCall(w))),
					},
				};

	// The hoisted fetch plan: creations + child calls, params destructured
	// from the incoming props object. Single-param components only (the norm).
	// Returned as a bare arrow — compileComponent attaches it to the INNER
	// function object via Object.assign, so the component's own body (where
	// the function-expression name shadows the module const) sees it too;
	// hmr() forwards it from the wrapped fn onto the HMR wrapper.
	let warmSrc = null;
	if ((node.params || []).length <= 1 && (warmMemos.length > 0 || warmKids.length > 0)) {
		const bodyStmts = [
			...warmMemos.map((c) => stmtFor(c.guards, memoCall(c))),
			...warmKids.map((w) => stmtFor(w.guards, childCall(w))),
		];
		const destructure =
			node.params.length === 1 ? `\tconst ${printNode(node.params[0])} = __wp;\n` : '';
		const body = bodyStmts.map((s) => '\t' + printNode(s).replace(/\n/g, '\n\t')).join('\n');
		warmSrc = `(__wp) => {\n${destructure}${body}\n}`;
	}
	return { thunk, warmSrc };
}

// ===========================================================================
// Hook-call rewriting
// ===========================================================================

// Plain JS loop statements (display word for the diagnostic). A TEMPLATE `@for`
// also parses to a ForOfStatement — told apart by its JSX body, the same
// classification isJsxNode uses — and is the SUPPORTED way to loop hooks: each
// item renders in its own block scope (mountItem → renderBlock swaps
// CURRENT_SCOPE per item), so per-item hooks get per-item state.
const JS_LOOP_WORD = {
	ForStatement: 'for',
	ForInStatement: 'for…in',
	ForOfStatement: 'for…of',
	WhileStatement: 'while',
	DoWhileStatement: 'do…while',
};

// A SLOT-KEYED hook call: a builtin base hook, or a custom hook by the
// `use[A-Z]` convention (identifier or method form) — the same match
// rewriteHookCalls slots below. `useContext` (keyed by context identity) and
// bare `use` (keyed by per-render call order — `block.__thenableIdx` on the
// client, the frame occurrence counter in runtime.server.ts) are NOT
// slot-keyed, so they genuinely work in loops and are exempt.
function slotKeyedHookName(n) {
	if (n.type !== 'CallExpression') return null;
	if (n.callee.type === 'Identifier') {
		const name = n.callee.name;
		if (HOOK_NAMES.has(name)) return name;
		if (/^use[A-Z]/.test(name) && name !== 'useContext') return name;
		return null;
	}
	if (
		!n.optional &&
		n.callee.type === 'MemberExpression' &&
		!n.callee.computed &&
		n.callee.property.type === 'Identifier' &&
		/^use[A-Z]/.test(n.callee.property.name) &&
		n.callee.property.name !== 'useContext'
	) {
		return n.callee.property.name;
	}
	return null;
}

// REJECT a slot-keyed hook lexically inside a plain JS loop. Hooks are keyed by
// a per-call-site symbol, so every iteration of the loop would hit the ONE slot
// assigned to that call site: useState/useReducer would share a single state
// cell across all iterations, useMemo would recompute every iteration (each
// iteration's deps overwrite the previous entry, only the last survives), and
// slot-keyed effects would collide the same way — all silently. The scan skips
// ONLY nested DEFERRED function boundaries (a function declared in the loop may
// be a local component or a deferred callback — each component instance gets
// its own scope). A function that provably EXECUTES during the iteration is
// walked into: an IIFE callee (incl. `.call`/`.apply` on a function
// expression) and an inline callback to a known synchronous array-iteration
// method (`.map`, `.forEach`, …) — its hooks run once per iteration and
// collide exactly like inline ones. Directive constructs inside the loop
// subtree are NOT exempt either: their bodies do compile to helper render fns,
// but the construct's own per-call-site slot (ifBlock/forBlock state on
// `scope.slots`) repeats each iteration exactly like a hook slot does, so
// hooks reached through them collide all the same. Every LEGIT template
// directive is protected before the scan starts — the guard in
// rewriteHookCalls fires only on plain-JS loop statements, and a template
// `@for` (ForOfStatement with a JSX body) is excluded there, so hooks in
// template positions (including `.map()`-to-`@for` children) never reach this
// walker.
const SYNC_ITERATION_METHODS = new Set([
	'map',
	'forEach',
	'filter',
	'flatMap',
	'reduce',
	'reduceRight',
	'some',
	'every',
	'find',
	'findIndex',
	'findLast',
	'findLastIndex',
	'sort',
	'toSorted',
]);
function isFunctionNode(n) {
	return (
		n &&
		(n.type === 'FunctionDeclaration' ||
			n.type === 'FunctionExpression' ||
			n.type === 'ArrowFunctionExpression')
	);
}
function rejectHookInJsLoop(loop, ctx, componentName) {
	const seen = new WeakSet();
	// Function nodes that run during the loop iteration itself — marked when
	// their enclosing CallExpression is visited (parents visit before children),
	// so the boundary check below can let the walk continue into their bodies.
	const syncInvoked = new WeakSet();
	function walk(n) {
		if (!n) return;
		if (Array.isArray(n)) {
			for (const x of n) walk(x);
			return;
		}
		if (typeof n !== 'object') return;
		const t = n.type;
		if (!t || seen.has(n)) return;
		seen.add(n);
		if (t === 'CallExpression') {
			// IIFE: `(() => …)()` — the callee body executes in place.
			if (isFunctionNode(n.callee)) syncInvoked.add(n.callee);
			if (n.callee.type === 'MemberExpression' && !n.callee.computed) {
				const prop = n.callee.property;
				// `(function () { … }).call(this)` / `.apply(...)` — IIFE variants.
				if (
					prop.type === 'Identifier' &&
					(prop.name === 'call' || prop.name === 'apply') &&
					isFunctionNode(n.callee.object)
				) {
					syncInvoked.add(n.callee.object);
				}
				// `xs.map(cb)` and friends — the callback runs synchronously, once
				// per element, during this iteration. (Template-position `.map()`
				// children never sit inside a plain JS loop, so the legit
				// map-to-`@for` pattern can't reach here.)
				if (prop.type === 'Identifier' && SYNC_ITERATION_METHODS.has(prop.name)) {
					for (const a of n.arguments) if (isFunctionNode(a)) syncInvoked.add(a);
				}
			}
		}
		if (isFunctionNode(n) && !syncInvoked.has(n)) return;
		const hook = slotKeyedHookName(n);
		if (hook !== null) {
			const l = (n.loc && n.loc.start) || (loop.loc && loop.loc.start);
			const at = l
				? ` (${ctx.mapSourceName ? ctx.mapSourceName + ':' : ''}${l.line}:${l.column})`
				: '';
			throw new Error(
				`\`${hook}\` is called inside a \`${JS_LOOP_WORD[loop.type]}\` loop in ${componentName}. ` +
					`Hooks are keyed by call site, so every iteration would share this call site's ONE ` +
					`hook slot — state, memo, and effect entries would silently collide across ` +
					`iterations. Loop in the template with the keyed \`@for\` directive instead (each ` +
					`item renders in its own scope, so per-item hooks get per-item state), or extract ` +
					`the loop body into a child component. \`use()\` and \`useContext\` are exempt ` +
					`(call-order / context-identity keyed, not slot-keyed).${at}`,
			);
		}
		for (const key in n) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(n[key]);
		}
	}
	walk(loop);
}

const STATE_GETTER_HELPERS = {
	useState: '__useStateWithGetter',
	useReducer: '__useReducerWithGetter',
};

function arrayPatternObservesStateGetter(pattern) {
	const elements = pattern.elements || [];
	if (elements[2] != null) return true;
	// A rest before/at index 2 observes the getter even without an explicit
	// third binding: `[state, ...rest]` includes both update and getState.
	for (let i = 0; i <= 2 && i < elements.length; i++) {
		if (elements[i]?.type === 'RestElement') return true;
	}
	return false;
}

function isTransparentStateTupleWrapper(node, child) {
	if (!node) return false;
	if (
		node.type === 'TSAsExpression' ||
		node.type === 'TSTypeAssertion' ||
		node.type === 'TSNonNullExpression' ||
		node.type === 'ParenthesizedExpression' ||
		node.type === 'ChainExpression'
	) {
		return node.expression === child;
	}
	return false;
}

// Source-level useState/useReducer tuples have a third getState member. Mark
// calls that can observe it so rewriteHookCalls can select a specialized helper;
// the ordinary two-item runtime path remains byte-for-byte for proven-dead
// getters. Any escaping/ambiguous tuple is conservative and gets the full shape.
function markStateGetterUsage(root) {
	const ancestors = [];
	function walk(node) {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (
			node.type === 'CallExpression' &&
			node.callee?.type === 'Identifier' &&
			STATE_GETTER_HELPERS[node.callee.name]
		) {
			let child = node;
			let i = ancestors.length - 1;
			while (i >= 0 && isTransparentStateTupleWrapper(ancestors[i], child)) {
				child = ancestors[i--];
			}
			const parent = i >= 0 ? ancestors[i] : null;
			let observed = true;
			if (parent?.type === 'VariableDeclarator' && parent.init === child) {
				observed = parent.id.type !== 'ArrayPattern' || arrayPatternObservesStateGetter(parent.id);
			} else if (parent?.type === 'AssignmentExpression' && parent.right === child) {
				observed =
					parent.left.type !== 'ArrayPattern' || arrayPatternObservesStateGetter(parent.left);
			} else if (parent?.type === 'MemberExpression' && parent.object === child) {
				const p = parent.property;
				const index = parent.computed && p?.type === 'Literal' ? Number(p.value) : NaN;
				observed = index !== 0 && index !== 1;
			} else if (parent?.type === 'ExpressionStatement') {
				observed = false;
			}
			node._octaneStateGetter = observed;
		}
		ancestors.push(node);
		for (const key in node) {
			if (AST_WALK_SKIP_KEYS.has(key) || key === '_octaneStateGetter') continue;
			walk(node[key]);
		}
		ancestors.pop();
	}
	walk(root);
}

function rewriteHookCalls(node, ctx, componentName) {
	markStateGetterUsage(node);
	return mapAst(node, (n) => {
		// A plain JS loop must not contain slot-keyed hook calls — reject before
		// slotting. (A template `@for` is also a ForOfStatement; its JSX body tells
		// it apart, and it is the supported way to loop hooks.)
		if (
			JS_LOOP_WORD[n.type] !== undefined &&
			!(n.type === 'ForOfStatement' && bodyContainsJsx(n.body))
		) {
			rejectHookInJsLoop(n, ctx, componentName);
		}
		if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
			const name = n.callee.name;
			// Three kinds of call get a trailing per-call-site slot symbol:
			//  - a built-in base hook (HOOK_NAMES) — also needs its runtime import;
			//  - a custom / library hook by React's `use[A-Z]` convention — e.g. a
			//    `useStore` binding from @octanejs/zustand that WRAPS a base hook and
			//    FORWARDS the slot to it. `useContext` is keyed by context identity (no
			//    slot) and `use` has no uppercase suffix, so both are excluded here. We
			//    do NOT import custom hooks — they're user/library imports;
			//  - a server-mode `use(thenable)` — a stable suspense-cache key.
			// Distinct call sites get distinct slots, so `useStore(a)`/`useStore(b)`
			// (or the same hook twice) stay independent.
			//
			// NB: a `use*` NAME is reserved for hooks (React's convention) — a non-hook
			// function named like one gets a harmless extra trailing argument (though
			// inside a plain JS loop the convention is enforced: rejectHookInJsLoop).
			const isBuiltin = HOOK_NAMES.has(name);
			const isCustom = /^use[A-Z]/.test(name) && name !== 'useContext';
			const isServerUse = name === 'use' && ctx.mode === 'server';
			if (isBuiltin || isCustom || isServerUse) {
				const getterHelper = n._octaneStateGetter ? STATE_GETTER_HELPERS[name] : null;
				// A builtin hook call site is USER code (the user's own identifier), so
				// its import stays bare — EXCEPT compiler-inserted calls (auto-callback's
				// `useCallback`), whose callee is renamed to the `_$` alias below so a
				// user binding of the same name can't shadow it.
				if (isBuiltin) {
					if (n.callee._octaneGenerated) ctx.runtimeNeeded.add(name);
					else ctx.userRuntimeNames.add(name);
					if (getterHelper !== null) ctx.runtimeNeeded.add(getterHelper);
				}
				if (isServerUse) ctx.userRuntimeNames.add('use');
				const debug = isServerUse
					? `${componentName}.use#${ctx.nextHookSymId}`
					: `${componentName}.${name}#${ctx.nextHookSymId}`;
				const symVar = allocHookSymbol(ctx, debug);
				// mapAst does NOT recurse into a node we replace, so rewrite this call's
				// ARGUMENTS ourselves — that's what gives a hook NESTED as an argument
				// its own slot, e.g. `useStore(api, useShallow(sel))` or a hook in a deps
				// array. (Allocating the outer slot first keeps its id stable; nested
				// inner hooks just take the following ids.)
				const args = n.arguments.map((a) => rewriteHookCalls(a, ctx, componentName));
				// NB: base hooks are ALSO `use[A-Z]`, so the wrap is for custom hooks ONLY
				// (`isCustom && !isBuiltin`) — base hooks keep the plain trailing-slot form.
				if (isCustom && !isBuiltin) {
					// A CUSTOM hook is wrapped in `withSlot(sym, hook, ...args, sym)`: the
					// withSlot pushes a call-site symbol on the path stack so the hook's
					// inner BASE hooks combine it (→ the same custom hook reused at two
					// sites keeps independent state — base hooks are "owned by octane" and
					// need no wrapper). The TRAILING `sym` is retained so existing library
					// bindings that extract the slot from their last argument keep working.
					ctx.runtimeNeeded.add('withSlot');
					return {
						type: 'CallExpression',
						callee: { type: 'Identifier', name: '_$withSlot' },
						arguments: [
							{ type: 'Identifier', name: symVar },
							n.callee,
							...args,
							{ type: 'Identifier', name: symVar },
						],
						optional: false,
					};
				}
				return {
					...n,
					callee:
						getterHelper !== null
							? { type: 'Identifier', name: rtAlias(getterHelper) }
							: n.callee._octaneGenerated
								? { type: 'Identifier', name: rtAlias(name) }
								: n.callee,
					arguments: [...args, { type: 'Identifier', name: symVar }],
				};
			}
		}
		// METHOD-style custom hooks — `route.useLoaderData()`, `api.useSearch()`
		// (React-ecosystem object-carried hooks: TanStack Route/RouteApi accessors
		// and the like). Same `use[A-Z]` convention, applied to the PROPERTY name.
		// The callee is a member access, so the plain withSlot form would sever
		// `this`; instead the WHOLE call is wrapped in a thunk —
		// `_$withSlot(sym, () => obj.useX(...args, sym))` — which pushes the
		// call-site path symbol for the hook's inner base hooks while the trailing
		// `sym` still reaches slot-forwarding bindings (splitSlot convention).
		if (
			n.type === 'CallExpression' &&
			!n.optional &&
			n.callee.type === 'MemberExpression' &&
			!n.callee.computed &&
			n.callee.property.type === 'Identifier' &&
			/^use[A-Z]/.test(n.callee.property.name) &&
			n.callee.property.name !== 'useContext'
		) {
			const debug = `${componentName}.${n.callee.property.name}#${ctx.nextHookSymId}`;
			const symVar = allocHookSymbol(ctx, debug);
			ctx.runtimeNeeded.add('withSlot');
			const object = rewriteHookCalls(n.callee.object, ctx, componentName);
			const args = n.arguments.map((a) => rewriteHookCalls(a, ctx, componentName));
			return {
				type: 'CallExpression',
				callee: { type: 'Identifier', name: '_$withSlot' },
				arguments: [
					{ type: 'Identifier', name: symVar },
					{
						type: 'ArrowFunctionExpression',
						params: [],
						expression: true,
						async: false,
						body: {
							type: 'CallExpression',
							callee: { ...n.callee, object },
							arguments: [...args, { type: 'Identifier', name: symVar }],
							optional: false,
						},
					},
				],
				optional: false,
			};
		}
		return null;
	});
}

// Compile a plain return-JSX function "as just a function": slot its hooks (withSlot)
// and lower its returned JSX to a `createElement(...)` descriptor. The function stays
// callable/return-based; `renderBlock` renders whatever it returns (reconciled by
// descriptor type identity). No component gate, no signature rewrite to (scope,props).
function compileReturnJsxFunction(node, ctx, options) {
	const name = node.id.name;
	// A folded directive's branch helper functions (`__then$N`/`__else$N`) are
	// collected here so they're emitted INSIDE this component function — preserving
	// their closure over setup locals/props — and only their values + the control
	// expression are threaded into the renderer as `props.hN` holes.
	const compInlinedSubs = [];
	const newStatements = (node.body.body || []).map((s) => {
		// Same hook handling as the `@{}` path: base hooks take a trailing slot symbol,
		// custom hooks are wrapped in withSlot (unified across both component forms).
		const h = rewriteHookCalls(s, ctx, name);
		// The `return <jsx>` output → a compiled-fragment descriptor (reconcile path),
		// not the host-string de-opt (rebuild). Other JSX in setup keeps value-lowering.
		if (h.type === 'ReturnStatement' && h.argument && isJsxNode(h.argument)) {
			return { ...h, argument: lowerReturnJsx(h.argument, ctx, compInlinedSubs) };
		}
		return rewriteJsxValues(h, ctx);
	});
	const fn = {
		type: 'FunctionDeclaration',
		id: node.id,
		params: node.params,
		async: false,
		generator: false,
		body: { type: 'BlockStatement', body: newStatements },
	};
	// Print with esrap's real per-token map (same output bytes as printNode) so
	// this function contributes segments to the module map — compile() drains
	// them via ctx._setupMaps, exactly like a component's setup statements.
	// Chained consumers (e.g. @octanejs/mdx's two-stage .mdx map) need segments
	// on these lines; a map-less print would compose to an empty chain.
	const printed = printNodeWithMap(fn, ctx);
	let code = printed.code;
	const mappings = printed.mappings;
	if (compInlinedSubs.length) {
		// Helpers are hoisted function declarations → position-independent; splice them
		// in right after the function's opening `{` so they're in the component scope.
		const i = code.indexOf('{');
		const subs = compInlinedSubs.map((s) => '  ' + s.replace(/\n/g, '\n  ')).join('\n');
		// The splice inserts `'\n' + subs` after the `{`: every printed line below
		// the splice line shifts down by the inserted line count. Keep the map in
		// sync by inserting that many empty mapping lines at the same point.
		// Decoded rows are dense up to the LAST line with segments, so when the
		// array ends at (or before) the splice line, every shifted line has no
		// segments and there is nothing to realign — skip the padding rather than
		// append useless empty rows.
		const spliceLine = countNewlines(code.slice(0, i + 1));
		const inserted = 1 + countNewlines(subs);
		if (mappings.length > spliceLine + 1) {
			mappings.splice(spliceLine + 1, 0, ...Array.from({ length: inserted }, () => []));
		}
		code = code.slice(0, i + 1) + '\n' + subs + code.slice(i + 1);
	}
	// Thread the mappings back to compile() through the same side-channel the
	// component path uses (drained by drainSetupMaps at the emit site). The
	// `export ` prefix shifts only line 0's columns; `export default` appends a
	// trailing (unmapped) line and shifts nothing.
	ctx._setupMaps =
		options && options.export
			? [
					{ fnRelLine: 0, colShift: 'export '.length, mappings: mappings.slice(0, 1) },
					{ fnRelLine: 1, colShift: 0, mappings: mappings.slice(1) },
				]
			: [{ fnRelLine: 0, colShift: 0, mappings }];
	if (options && options.default) return `${code}\nexport default ${name};`;
	if (options && options.export) return `export ${code}`;
	return code;
}

// Lower a JSX value at return position. A HOST element becomes a compiled-fragment
// descriptor (`createElement(_frag$N, holeProps)`) so it rides childSlot's reconcile
// path; a component element / fragment / directive keeps the existing value-lowering
// (components already reconcile by identity).
function lowerReturnJsx(node, ctx, compInlinedSubs) {
	if ((node.type === 'Element' || node.type === 'JSXElement') && !isComponentTag(node)) {
		return lowerHostFragment(node, ctx, compInlinedSubs, 'html', null);
	}
	return rewriteJsxValues(node, ctx);
}

function memberProps(hn, src) {
	return {
		type: 'MemberExpression',
		object: { type: 'Identifier', name: 'props' },
		property: { type: 'Identifier', name: hn },
		computed: false,
		optional: false,
		// Carry the ORIGINAL expression's source position onto the synthetic `props.hN`
		// node so the extracted fragment keeps it (dev hydration LOC / DevTools). Without
		// this, fragment extraction would silently drop the upstream position.
		loc: src && src.loc,
	};
}
function objectProp(hn, valNode) {
	return {
		type: 'Property',
		key: { type: 'Identifier', name: hn },
		value: valNode,
		kind: 'init',
		method: false,
		shorthand: false,
		computed: false,
	};
}

// Walk a host element, replacing each DYNAMIC part (an attribute/child expression)
// with `props.hN` and collecting `{ hN: <originalExpr> }` into `holeProps`. Static
// structure (tag, literal attrs, text, nested host elements) stays in the template;
// nested component children become renderable holes. The result is a self-contained
// fragment whose only inputs are its props — compilable as an ordinary renderer.
function extractFragment(node, ctx, holeProps) {
	const attrs = node.attributes || node.openingElement?.attributes || [];
	const newAttrs = [];
	for (const attr of attrs) {
		if (attr.type === 'SpreadAttribute' || attr.type === 'JSXSpreadAttribute') {
			// `{...expr}` — the spread expression is a DYNAMIC input too. Thread it out
			// as an `hN` hole (exactly like an attribute value) so any prop/local it
			// references is forwarded into the fragment via `createElement(_frag, {hN})`.
			// Leaving the raw `props.x`/local in place would dangle: the wrapper only
			// passes the holes it collected here, and a captured local isn't in scope.
			const hn = `h${holeProps.length}`;
			holeProps.push(objectProp(hn, rewriteJsxValues(attr.argument, ctx)));
			newAttrs.push({ ...attr, argument: memberProps(hn, attr.argument) });
			continue;
		}
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') {
			// Unknown attribute node kind — nothing in the current @tsrx/core
			// grammar produces one (spreads and plain/namespaced attributes are
			// handled above). Pass it through unchanged: it carries no expression
			// for us to thread out as a hole, and emitElementHtml's attribute loop
			// skips node types it doesn't recognize, so the pass-through is inert.
			newAttrs.push(attr);
			continue;
		}
		const v = attr.value;
		const inner = v && v.type === 'JSXExpressionContainer' ? v.expression : v;
		// Dynamic attr = an expression value that isn't a static literal/string.
		const isStatic =
			v == null ||
			!inner ||
			inner.type === 'Literal' ||
			inner.type === 'StringLiteral' ||
			inner.type === 'JSXText' ||
			inner.type === 'Text';
		if (isStatic) {
			newAttrs.push(attr);
		} else {
			const hn = `h${holeProps.length}`;
			holeProps.push(objectProp(hn, rewriteJsxValues(inner, ctx)));
			newAttrs.push({
				...attr,
				value:
					v.type === 'JSXExpressionContainer'
						? { type: 'JSXExpressionContainer', expression: memberProps(hn, inner) }
						: memberProps(hn, inner),
			});
		}
	}
	const newChildren = [];
	// Lower `{xs.map(item => <jsx key/>)}` children to a synthetic `@for`
	// (ForOfStatement) up front so they take the directive fold path below
	// (forBlock) instead of becoming a childSlot descriptor-array hole. Only when
	// we have a fold context (always true on the .tsx host-fragment path).
	const fragChildren = ctx._foldCtx
		? (node.children || []).map((child) =>
				child && child.type === 'JSXExpressionContainer'
					? mapCallToForOf(child.expression) || child
					: child,
			)
		: node.children || [];
	for (const child of fragChildren) {
		const t = child && child.type;
		if (t === 'JSXText' || t === 'Text') {
			newChildren.push(child);
		} else if (t === 'JSXExpressionContainer') {
			const expr = child.expression;
			// `{/* … */}` is a `JSXEmptyExpression` container — a JSX comment, which
			// renders to nothing (React drops it). Skip it so it never becomes a hole.
			if (!expr || expr.type === 'JSXEmptyExpression') continue;
			const hn = `h${holeProps.length}`;
			if (expr && expr.type === 'TSAsExpression') {
				// Preserve the `as T` cast in the renderer (it marks a dynamic TEXT hole).
				holeProps.push(objectProp(hn, rewriteJsxValues(expr.expression, ctx)));
				newChildren.push({
					type: 'JSXExpressionContainer',
					expression: {
						type: 'TSAsExpression',
						expression: memberProps(hn, expr.expression),
						typeAnnotation: expr.typeAnnotation,
					},
				});
			} else {
				holeProps.push(objectProp(hn, rewriteJsxValues(expr, ctx)));
				// A hole the compiler proved is a string (concat / template / tracked
				// local) is a TEXT hole — but the renderer only sees `props.hN`, which it
				// can't prove. Re-assert it with an `as string` cast so the renderer keeps
				// the text-binding classification (htext, markerless) instead of falling to
				// a renderable childSlot, preserving byte-equality with the inline form.
				const member = memberProps(hn, expr);
				const rendered = isKnownStringExpression(expr, ctx.knownStringLocals)
					? {
							type: 'TSAsExpression',
							expression: member,
							typeAnnotation: { type: 'TSStringKeyword' },
						}
					: member;
				newChildren.push({ type: 'JSXExpressionContainer', expression: rendered });
			}
		} else if (t === 'Element' || t === 'JSXElement') {
			if (isComponentTag(child)) {
				const hn = `h${holeProps.length}`;
				holeProps.push(objectProp(hn, jsxElementToCreateElement(child, ctx)));
				newChildren.push({ type: 'JSXExpressionContainer', expression: memberProps(hn, child) });
			} else {
				newChildren.push(extractFragment(child, ctx, holeProps));
			}
		} else if ((t === 'IfStatement' || t === 'JSXIfExpression') && ctx._foldCtx) {
			// FOLD a directive: lower its branch bodies on the COMPONENT side (so the
			// `__then$N`/`__else$N` helpers keep their closure over setup locals/props),
			// and thread the condition + the branch-helper FUNCTIONS out as `props.hN`
			// holes. The renderer keeps only the host template + the ifBlock call
			// skeleton, reading cond/then/else from props. (makeIfCall pushes the helper
			// definitions into the component's inlinedSubs.) The raw `@if` parses to a
			// JSXIfExpression — normalize to the IfStatement shape makeIfCall expects
			// (same as normalizeChildren does on the inline path).
			const fc = ctx._foldCtx;
			const ifNode =
				t === 'JSXIfExpression'
					? {
							type: 'IfStatement',
							test: child.test,
							consequent: child.consequent,
							alternate: child.alternate || null,
							loc: child.loc, // preserve position for dev hydration LOC
						}
					: child;
			const ic = makeIfCall(ifNode, ctx, fc.compInlinedSubs, fc.parentNs, fc.cssHash);
			const condHole = `h${holeProps.length}`;
			holeProps.push(objectProp(condHole, rewriteJsxValues(ic.condTest, ctx)));
			const thenHole = `h${holeProps.length}`;
			holeProps.push(objectProp(thenHole, { type: 'Identifier', name: ic.thenHelper }));
			let elseHoleName = null;
			if (ic.elseHelper) {
				elseHoleName = `h${holeProps.length}`;
				holeProps.push(objectProp(elseHoleName, { type: 'Identifier', name: ic.elseHelper }));
			}
			// Renderer-side, the call reads everything from `props.hN`.
			ic.condExpr = `props.${condHole}`;
			ic.thenHelper = `props.${thenHole}`;
			ic.elseHelper = elseHoleName ? `props.${elseHoleName}` : null;
			// Phase 2: the hoisted helpers' env values are COMPONENT-scope
			// identifiers — thread the whole tuple as one array hole so the
			// renderer-side call passes current values (same as deps for @for).
			if (ic.envNames && ic.envNames.length) {
				const envHole = `h${holeProps.length}`;
				holeProps.push(
					objectProp(envHole, {
						type: 'ArrayExpression',
						elements: ic.envNames.map((n) => ({ type: 'Identifier', name: n })),
					}),
				);
				ic.envExpr = `props.${envHole}`;
			}
			fc.directiveCalls.ifCalls.push(ic);
			newChildren.push({
				type: 'FoldedDirective',
				kind: 'if',
				recordIndex: fc.directiveCalls.ifCalls.length - 1,
			});
		} else if ((t === 'ForOfStatement' || t === 'JSXForExpression') && ctx._foldCtx) {
			// FOLD a `@for`: the item/empty bodies are compiled component-side (closure);
			// `items`, the item-body fn, the empty-body fn, and (for the dep-pure path)
			// each dep value thread as `props.hN` holes. The key fn is already module-
			// hoisted (no closure), so it stays a bare reference; `flags` is a
			// constant. Normalize the raw JSXForExpression to the ForOfStatement shape
			// makeForCall expects (same as normalizeChildren).
			const fc = ctx._foldCtx;
			const forNode =
				t === 'JSXForExpression'
					? {
							type: 'ForOfStatement',
							left: child.left,
							right: child.right,
							body: child.body,
							await: !!child.await,
							key: child.key || null,
							index: child.index || null,
							empty: child.empty || null,
							loc: child.loc, // preserve position for dev hydration LOC
						}
					: child;
			const rec = makeForCall(forNode, ctx, fc.compInlinedSubs, fc.parentNs, fc.cssHash);
			const itemsHole = `h${holeProps.length}`;
			holeProps.push(objectProp(itemsHole, rewriteJsxValues(forNode.right, ctx)));
			const bodyHole = `h${holeProps.length}`;
			holeProps.push(objectProp(bodyHole, { type: 'Identifier', name: rec.bodyHelper }));
			rec.itemsExpr = `props.${itemsHole}`;
			rec.bodyHelper = `props.${bodyHole}`;
			if (rec.emptyHelper && rec.emptyHelper !== 'null') {
				const emptyHole = `h${holeProps.length}`;
				holeProps.push(objectProp(emptyHole, { type: 'Identifier', name: rec.emptyHelper }));
				rec.emptyHelper = `props.${emptyHole}`;
			}
			if (rec.depNames.length) {
				// Thread each dep value as its own hole so the reconciler's deps-equality
				// check (and the Phase 2 env stamp — deps doubles as the helpers' env
				// tuple) sees the component-scope values, not undefined renderer locals.
				rec.depNames = rec.depNames.map((dn) => {
					const depHole = `h${holeProps.length}`;
					holeProps.push(objectProp(depHole, { type: 'Identifier', name: dn }));
					return `props.${depHole}`;
				});
			}
			fc.directiveCalls.forCalls.push(rec);
			newChildren.push({
				type: 'FoldedDirective',
				kind: 'for',
				recordIndex: fc.directiveCalls.forCalls.length - 1,
			});
		} else if ((t === 'SwitchStatement' || t === 'JSXSwitchExpression') && ctx._foldCtx) {
			// FOLD a `@switch`: case/default bodies compiled component-side (closure);
			// thread the discriminant + the cases array (built component-side as
			// `[[test, caseFn], …]`, since it interleaves component-scope tests with the
			// closure helper fns) + the default fn as `props.hN` holes.
			const fc = ctx._foldCtx;
			const swNode =
				t === 'JSXSwitchExpression'
					? {
							type: 'SwitchStatement',
							discriminant: child.discriminant,
							cases: child.cases || [],
							loc: child.loc, // preserve position for dev hydration LOC
						}
					: child;
			const rec = makeSwitchCall(swNode, ctx, fc.compInlinedSubs, fc.parentNs, fc.cssHash);
			const discHole = `h${holeProps.length}`;
			holeProps.push(objectProp(discHole, rewriteJsxValues(rec.discNode, ctx)));
			rec.discExpr = `props.${discHole}`;
			const casesHole = `h${holeProps.length}`;
			holeProps.push(
				objectProp(casesHole, {
					type: 'ArrayExpression',
					elements: rec.caseRecords.map((cr) => ({
						type: 'ArrayExpression',
						elements: [rewriteJsxValues(cr.testNode, ctx), { type: 'Identifier', name: cr.helper }],
					})),
				}),
			);
			rec.casesArrayExpr = `props.${casesHole}`;
			if (rec.defaultHelper && rec.defaultHelper !== 'null') {
				const defHole = `h${holeProps.length}`;
				holeProps.push(objectProp(defHole, { type: 'Identifier', name: rec.defaultHelper }));
				rec.defaultHelper = `props.${defHole}`;
			}
			// Phase 2: env tuple hole (see the @if fold above).
			if (rec.envNames && rec.envNames.length) {
				const envHole = `h${holeProps.length}`;
				holeProps.push(
					objectProp(envHole, {
						type: 'ArrayExpression',
						elements: rec.envNames.map((n) => ({ type: 'Identifier', name: n })),
					}),
				);
				rec.envExpr = `props.${envHole}`;
			}
			fc.directiveCalls.switchCalls.push(rec);
			newChildren.push({
				type: 'FoldedDirective',
				kind: 'switch',
				recordIndex: fc.directiveCalls.switchCalls.length - 1,
			});
		} else if ((t === 'TryStatement' || t === 'JSXTryExpression') && ctx._foldCtx) {
			// FOLD a `@try`: simplest — no control expression. The try/catch/pending
			// bodies are compiled component-side (closure; catch's `err`/`reset` come
			// from its own param), and the three helper fns thread as `props.hN` holes.
			const fc = ctx._foldCtx;
			const tryNode =
				t === 'JSXTryExpression'
					? {
							type: 'TryStatement',
							block: child.block,
							handler: child.handler || null,
							finalizer: child.finalizer || null,
							pending: child.pending || null,
							loc: child.loc, // preserve position for dev hydration LOC
						}
					: child;
			const rec = makeTryCall(tryNode, ctx, fc.compInlinedSubs, fc.parentNs, fc.cssHash);
			const tryHole = `h${holeProps.length}`;
			holeProps.push(objectProp(tryHole, { type: 'Identifier', name: rec.tryHelper }));
			rec.tryHelper = `props.${tryHole}`;
			if (rec.catchHelper && rec.catchHelper !== 'null') {
				const catchHole = `h${holeProps.length}`;
				holeProps.push(objectProp(catchHole, { type: 'Identifier', name: rec.catchHelper }));
				rec.catchHelper = `props.${catchHole}`;
			}
			if (rec.pendingHelper && rec.pendingHelper !== 'null') {
				const pendHole = `h${holeProps.length}`;
				holeProps.push(objectProp(pendHole, { type: 'Identifier', name: rec.pendingHelper }));
				rec.pendingHelper = `props.${pendHole}`;
			}
			// Phase 2: env tuple hole (see the @if fold above).
			if (rec.envNames && rec.envNames.length) {
				const envHole = `h${holeProps.length}`;
				holeProps.push(
					objectProp(envHole, {
						type: 'ArrayExpression',
						elements: rec.envNames.map((n) => ({ type: 'Identifier', name: n })),
					}),
				);
				rec.envExpr = `props.${envHole}`;
			}
			fc.directiveCalls.tryCalls.push(rec);
			newChildren.push({
				type: 'FoldedDirective',
				kind: 'try',
				recordIndex: fc.directiveCalls.tryCalls.length - 1,
			});
		} else {
			newChildren.push(child);
		}
	}
	const out = { ...node, attributes: newAttrs, children: newChildren };
	// The emission normalizes from `openingElement.attributes`, so update it too.
	if (node.openingElement) {
		out.openingElement = { ...node.openingElement, attributes: newAttrs };
	}
	return out;
}

// A host JSX element → a hoisted compiled renderer + `createElement(_frag$N, {...})`.
// `compInlinedSubs` is the COMPONENT's inlinedSubs: a folded directive's branch
// helper functions are emitted there (closure preserved), not in the renderer.
function lowerHostFragment(node, ctx, compInlinedSubs, parentNs = 'html', cssHash = null) {
	const holeProps = [];
	const directiveCalls = { ifCalls: [], forCalls: [], switchCalls: [], tryCalls: [] };
	// extractFragment reads `ctx._foldCtx` for any directive child it folds (and to
	// route helper defs into the component). Save/restore so it never leaks.
	const prevFold = ctx._foldCtx;
	ctx._foldCtx =
		compInlinedSubs !== undefined ? { compInlinedSubs, directiveCalls, parentNs, cssHash } : null;
	const rendererEl = extractFragment(node, ctx, holeProps);
	ctx._foldCtx = prevFold;
	const fragName = `_frag$${ctx.nextFragId++}`;
	const synthFn = {
		type: 'FunctionDeclaration',
		id: { type: 'Identifier', name: fragName },
		params: [{ type: 'Identifier', name: 'props' }],
		async: false,
		generator: false,
		// `foldedDirectives` carries the pre-built directive records to the renderer's
		// compileFunctionBody → emitElementHtml (via ctx._foldedDirectiveCalls).
		body: { type: 'JSXCodeBlock', body: [], render: rendererEl, foldedDirectives: directiveCalls },
	};
	ctx.hoistedHelpers.push(compileFunctionBody(synthFn, ctx, fragName, parentNs, cssHash));
	// A host fragment is a SINGLE root element, so it can mount markerless (the
	// element self-delimits) — matching `@{}`'s inline render exactly (no extra
	// comment markers), which is required for byte-equal DOM when folding `@{}`.
	ctx.hoistedHelpers.push(`${fragName}.$$singleRoot = true;`);
	ctx.runtimeNeeded.add('createElement');
	return {
		type: 'CallExpression',
		callee: { type: 'Identifier', name: '_$createElement' },
		arguments: [
			{ type: 'Identifier', name: fragName },
			{ type: 'ObjectExpression', properties: holeProps },
		],
		optional: false,
	};
}

/**
 * Hoist sub-template render functions at expression position. Three shapes:
 *   (legacy)  `<tsrx>...</tsrx>` / `<tsx>...</tsx>` JSX block — replaced.
 *   (new)     `() => @{ <jsx/> }` — arrow whose body is a JSXCodeBlock. The
 *             new TSRX way to write what `<tsrx>` used to express. The arrow
 *             takes whatever params the user wrote (typically `()`); we hoist
 *             a function declaration whose signature mirrors the standard
 *             component signature `(__s, …userParams, __extra)` so it slots
 *             into createPortal / Dynamic / render-prop callers uniformly.
 *
 * In both cases the helper is added to `inlinedSubs` (visible in the
 * surrounding component-body scope) so it captures the parent component's
 * locals via closure. It cannot capture params of nested arrows — see
 * compiler README.
 */
function rewriteTsrxBlocks(node, ctx, componentName, inlinedSubs) {
	return mapAst(node, (n) => {
		if (n.type === 'Tsrx' || n.type === 'Tsx') {
			const helperName = `__tsrx$${ctx.nextHelperId++}`;
			const fakeBody = {
				type: 'Component',
				id: { type: 'Identifier', name: helperName },
				params: [],
				body: n.children || [],
			};
			const fn = compileFunctionBody(fakeBody, ctx, helperName);
			inlinedSubs.push(fn + ';');
			return { type: 'Identifier', name: helperName };
		}
		if (n.type === 'ArrowFunctionExpression' && n.body && n.body.type === 'JSXCodeBlock') {
			// `() => @{ … }` — new sub-template form. Hoist as a regular component
			// body so its body.body (setup) + body.render (JSX) feed back through
			// the standard compileFunctionBody path.
			const helperName = `__tsrx$${ctx.nextHelperId++}`;
			const fakeBody = {
				type: 'FunctionDeclaration',
				id: { type: 'Identifier', name: helperName },
				params: n.params || [],
				body: n.body,
			};
			const fn = compileFunctionBody(fakeBody, ctx, helperName);
			inlinedSubs.push(fn + ';');
			return { type: 'Identifier', name: helperName };
		}
		return null;
	});
}

/**
 * Lower a JSX COMPONENT element used at VALUE position (not as a component body's
 * rendered output) into a `createElement(Comp, props)` call, so JSX-as-a-value
 * works — chiefly `root.render(<App foo={x}/>)` matching React's root render.
 *
 * Only component elements (capitalized / member tag) with NO children are
 * supported as values; host elements (`<div/>`), fragments, and children-bearing
 * components throw a clear diagnostic (define a component for that markup). Props
 * (including spreads) are emitted into the object literal verbatim; `key` is
 * dropped (meaningless at value position). Nested JSX in prop values is lowered
 * recursively. This never touches a component body's OUTPUT JSX — that is split
 * out as `jsxNodes` and handled by planJsx before this runs.
 */
function rewriteJsxValues(node, ctx) {
	return mapAst(node, (n) => {
		const t = n && n.type;
		// Host OR component JSX at a VALUE position (a `.map(...)` callback, a
		// function return, an array literal, a prop value) lowers to a
		// `createElement(...)` descriptor. Host tags + children route through the
		// runtime de-opt renderer; components keep the existing component-value
		// form. (Component-body OUTPUT JSX never reaches here — it's split out as
		// `jsxNodes` and handled by planJsx, which gives keyed `@for` lists their
		// fast path.) `jsxElementToCreateElement` recurses, so mapAst need not.
		if (t === 'Element' || t === 'JSXElement') {
			return jsxElementToCreateElement(n, ctx);
		}
		if (t === 'Fragment' || t === 'JSXFragment') {
			// `<>…</>` at a value position → an array of its lowered children (the
			// de-opt childSlot flattens nested arrays, matching React's fragment).
			// lowerJsxChild owns the single implementation of fragment lowering.
			return lowerJsxChild(n, ctx);
		}
		return null;
	});
}

// Lower one JSX child node to a `createElement` argument expression (or null to
// drop it). Text → string literal (whitespace-only-with-newline indentation is
// dropped, JSX rule); `{expr}` → the lowered inner expression; nested element →
// recurse; fragment → array of children.
function lowerJsxChild(child, ctx) {
	const t = child && child.type;
	if (t === 'JSXText' || t === 'Text') {
		const v = child.value != null ? child.value : child.raw;
		if (v == null) return null;
		if (/^\s*$/.test(v) && /[\n\r]/.test(v)) return null;
		return { type: 'Literal', value: v };
	}
	if (t === 'JSXExpressionContainer') {
		if (!child.expression || child.expression.type === 'JSXEmptyExpression') return null;
		return rewriteJsxValues(child.expression, ctx);
	}
	if (t === 'JSXElement' || t === 'Element') return jsxElementToCreateElement(child, ctx);
	if (t === 'JSXFragment' || t === 'Fragment') {
		const els = [];
		for (const c of child.children || []) {
			const e = lowerJsxChild(c, ctx);
			if (e !== null) els.push(e);
		}
		// A fragment's children are FIXED siblings (React's "static children" —
		// `jsxs` — which React never key-warns): tag the array so the de-opt list
		// keys it by index silently, reserving the missing-key warning for
		// runtime-built arrays (`.map()` results). Emitted in BOTH modes — the
		// server export is the identity (`ssrChild` just renders the array).
		ctx.runtimeNeeded.add('positionalChildren');
		return {
			type: 'CallExpression',
			callee: { type: 'Identifier', name: rtAlias('positionalChildren') },
			arguments: [{ type: 'ArrayExpression', elements: els }],
			optional: false,
		};
	}
	return null; // Comment / unknown — drop.
}

// Convert a JSX tag name node to a plain expression node esrap can print.
function jsxNameToExpr(name) {
	if (name.type === 'Identifier' || name.type === 'JSXIdentifier') {
		return { type: 'Identifier', name: name.name };
	}
	if (name.type === 'MemberExpression' || name.type === 'JSXMemberExpression') {
		const prop = name.property;
		return {
			type: 'MemberExpression',
			object: jsxNameToExpr(name.object),
			property:
				prop && prop.type ? jsxNameToExpr(prop) : { type: 'Identifier', name: String(prop) },
			computed: false,
			optional: false,
		};
	}
	// `<{expr}/>` — dynamic tag carries the expression directly.
	if (name.type === 'JSXExpressionContainer') return name.expression;
	return { type: 'Identifier', name: String(name.name || name) };
}

// Build a `createElement(Comp, { ...props })` CallExpression AST node from a
// component Element node. Recurses into prop values so nested JSX values lower too.
function jsxElementToCreateElement(node, ctx) {
	ctx.runtimeNeeded.add('createElement');
	const nameNode = node.openingElement?.name || node.id;
	// Host (lowercase) tag → string literal (`'li'`) for the de-opt renderer;
	// component (capitalized / member / dynamic) → the identifier/member ref.
	const compNode = isComponentTag(node)
		? jsxNameToExpr(nameNode)
		: { type: 'Literal', value: nameNode.name != null ? nameNode.name : String(nameNode) };
	if (!isComponentTag(node)) rejectVoidElementContent(compNode.value, node, ctx);
	const attrs = node.attributes || node.openingElement?.attributes || [];
	const properties = [];
	for (const attr of attrs) {
		if (attr.type === 'SpreadAttribute' || attr.type === 'JSXSpreadAttribute') {
			properties.push({ type: 'SpreadElement', argument: rewriteJsxValues(attr.argument, ctx) });
			continue;
		}
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
		const attrName = attr.name.name || attr.name;
		// `key` is KEPT in props — `createElement` lifts it into `descriptor.key`,
		// which the de-opt list path keys on. `ref` also flows through (the de-opt
		// renderer's applyDeoptProps attaches it).
		let valNode;
		if (attr.value == null) {
			valNode = { type: 'Literal', value: true };
		} else {
			const inner =
				attr.value.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value;
			valNode = rewriteJsxValues(inner, ctx);
		}
		const keyIsIdent = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(attrName);
		properties.push({
			type: 'Property',
			key: keyIsIdent
				? { type: 'Identifier', name: attrName }
				: { type: 'Literal', value: attrName },
			value: valNode,
			kind: 'init',
			method: false,
			shorthand: false,
			computed: false,
		});
	}
	const args = [compNode, { type: 'ObjectExpression', properties }];
	// Children → trailing `createElement(type, props, ...children)` args, each
	// lowered recursively (host child → createElement, `{expr}` → expr, text →
	// string). The runtime collects these into `descriptor.children`.
	for (const child of node.children || []) {
		const lowered = lowerJsxChild(child, ctx);
		if (lowered !== null) args.push(lowered);
	}
	return {
		type: 'CallExpression',
		callee: { type: 'Identifier', name: '_$createElement' },
		arguments: args,
		optional: false,
	};
}

// Short, unique, path-free slot description for non-HMR output: a djb2 hash of
// the module filename + the per-module hook index. The DESCRIPTION is
// load-bearing beyond debugging: resolveSlot/currentPathSlot (runtime) compose
// a base hook's effective slot inside custom hooks by CONCATENATING slot
// descriptions into a Symbol.for key — a bare `Symbol()` (description
// undefined) collapses every composed path to "undefined|undefined" and
// collides custom-hook state across call sites (broke the router's useStore →
// website hydration). So every emitted slot must carry a unique description;
// this one is ~10 chars and keeps the absolute module path out of bundles.
export function hookSlotHash(filename) {
	const src = filename || '<anon>';
	let h = 5381;
	for (let i = 0; i < src.length; i++) h = (Math.imul(h, 33) + src.charCodeAt(i)) | 0;
	return (h >>> 0).toString(36);
}

function allocHookSymbol(ctx, debugName) {
	const id = ctx.nextHookSymId++;
	const name = `_h$${id}`;
	if (ctx.hmr) {
		// HMR (dev serve): Symbol.for(stableKey) so re-imports produce the SAME
		// Symbol identity, which keeps the existing hooks Map keys valid across
		// body swaps. The stable key embeds the source filename so symbols don't
		// collide across modules. `debugName` includes the component name + hook
		// name + call-site index — stable provided the user doesn't reorder hooks
		// between renders (which would violate React's rules anyway).
		const stableKey = `octane:${ctx.filename || '<anon>'}:${debugName}`;
		ctx.hoistedHelpers.push(`const ${name} = Symbol.for(${JSON.stringify(stableKey)});`);
	} else {
		// No HMR (prod builds, SSR, tests): nothing re-imports the module
		// expecting registry identity, so a plain Symbol suffices — but it MUST
		// carry a unique description (see hookSlotHash above). ~10 chars vs the
		// ~100-char registry key, and no file path in shipped bundles.
		if (ctx._hookHash === undefined) ctx._hookHash = hookSlotHash(ctx.filename);
		ctx.hoistedHelpers.push(`const ${name} = Symbol(${JSON.stringify(`${ctx._hookHash}#${id}`)});`);
	}
	return name;
}

// ===========================================================================
// JSX planning
// ===========================================================================

// ===========================================================================
// Hoisted document metadata (<title>/<meta>/<link>) — React-19 model
// ===========================================================================
//
// `<title>`, `<meta>`, `<link>` rendered ANYWHERE in a component are NOT body
// DOM: like `<style>` (→ CSS), they are lifted to the document head — emitted as
// a `headBlock(__s, …)` call on the client (creates/adopts/updates/removes the
// element in document.head, reactively, tied to the owning scope's lifecycle)
// and an `ssrHeadEl(…)` call on the server (serializes into render().head,
// prefixed with a `<!--key-->` marker the client headBlock adopts on hydration).
// Lifting them out of the body-root set also collapses the remaining single body
// element to the single-root path (no `<octane-frag>`).

const HOISTABLE_HEAD_TAGS = new Set(['title', 'meta', 'link']);

/** @param {any} n @returns {string|null} */
function jsxTagName(n) {
	return n && n.openingElement && n.openingElement.name
		? n.openingElement.name.name || n.openingElement.name
		: null;
}

/** @param {any} n @returns {boolean} */
function isHeadElementNode(n) {
	return Boolean(n && n.type === 'JSXElement' && jsxTagName(n) === 'head');
}

/** @param {any} n @returns {boolean} */
function isHoistableHeadElementNode(n) {
	return Boolean(n && n.type === 'JSXElement' && HOISTABLE_HEAD_TAGS.has(jsxTagName(n)));
}

// Deterministic per-element key bridging the client `headBlock` (its scope-state
// key + SSR-marker adoption) and the server `ssrHeadEl` marker. Must be
// byte-identical across the client and server compiles of the SAME source, so it
// is keyed ONLY on the element's SOURCE POSITION (same AST → same offset in both
// modes), NOT the filename. Unique per head element WITHIN a file.
/** @param {any} node @param {number} index @returns {string} */
function headKey(node, index) {
	const pos =
		node && node.openingElement && node.openingElement.start != null
			? node.openingElement.start
			: index;
	const src = `head:${pos}`;
	let h = 5381;
	for (let i = 0; i < src.length; i++) h = (Math.imul(h, 33) + src.charCodeAt(i)) | 0;
	return 'rnh-' + (h >>> 0).toString(36);
}

// Build the shared `"key", "tag", attrsObjExpr, textExpr` argument string for a
// hoisted head element (a `HeadHoist` node) — consumed by both the client
// `headBlock(__s, …)` and the server `ssrHeadEl(…)` emit. Attributes become an
// object-literal expression (dynamic values stay live expressions, so the
// metadata is reactive); a `<title>`'s text becomes a string-concat expression;
// void tags (`<meta>`/`<link>`) pass `null` for text.
/** @param {any} node @param {number} index @returns {string} */
function headElementArgs(node, index) {
	const el = node.element;
	const tag = jsxTagName(el);
	const attrParts = [];
	for (const a of el.openingElement.attributes || []) {
		if (a.type === 'SpreadAttribute' || a.type === 'JSXSpreadAttribute') {
			attrParts.push(`...(${printExpr(a.argument)})`);
			continue;
		}
		if (a.type !== 'Attribute' && a.type !== 'JSXAttribute') continue;
		const attrName = a.name.name || a.name;
		// refs/key have no head semantics; `class` is the CSS-scoping stamp
		// (meaningless on title/meta/link) — drop them. EVENTS pass through: a
		// hoisted element lives in document.head, outside every delegation root,
		// so the client headBlock attaches on* props as DIRECT listeners
		// (`<link onLoad={…}>` — React parity); the server ssrHeadEl skips them.
		if (attrName === 'key' || attrName === 'ref' || attrName === 'class') continue;
		const val = a.value;
		if (val == null) {
			attrParts.push(`${JSON.stringify(attrName)}: true`);
			continue;
		}
		const inner = val.type === 'JSXExpressionContainer' ? val.expression : val;
		if (inner.type === 'Literal' || inner.type === 'StringLiteral' || inner.type === 'JSXText') {
			attrParts.push(`${JSON.stringify(attrName)}: ${JSON.stringify(inner.value)}`);
		} else {
			attrParts.push(`${JSON.stringify(attrName)}: (${printExpr(inner)})`);
		}
	}
	const attrsExpr = attrParts.length ? `{ ${attrParts.join(', ')} }` : 'null';

	let textExpr = 'null';
	if (!VOID_ELEMENTS.has(tag)) {
		const textParts = [];
		for (const c of el.children || []) {
			if (c.type === 'JSXText') {
				// JSX whitespace rules: a run of whitespace containing a newline is an
				// indentation artifact — collapse interior ones to a single space and
				// drop leading/trailing ones. So a multi-line `<title>\n  Foo\n</title>`
				// serializes to "Foo", not "\n  Foo\n". Whitespace WITHOUT a newline
				// (e.g. the space in `TSRX | {x}`) is significant and preserved.
				const normalized = c.value
					.replace(/[ \t]*\r?\n[ \t\r\n]*/g, '\n')
					.replace(/^\n+/, '')
					.replace(/\n+$/, '')
					.replace(/\n+/g, ' ');
				if (normalized === '') continue;
				textParts.push(JSON.stringify(normalized));
			} else if (c.type === 'JSXExpressionContainer') {
				textParts.push(`(${printExpr(c.expression)})`);
			} else if (c.type === 'Literal' || c.type === 'StringLiteral') {
				textParts.push(JSON.stringify(c.value));
			}
		}
		if (textParts.length) textExpr = textParts.join(' + ');
	}

	return `${JSON.stringify(headKey(el, index))}, ${JSON.stringify(tag)}, ${attrsExpr}, ${textExpr}`;
}

// Build the CLIENT `headBlock(__s, …)` statements for a component's hoisted head
// elements (one per `HeadHoist`). Returns '' when there are none.
/** @param {any[]} headNodes @param {any} ctx @param {number} slotBase @returns {string} */
function emitHeadClient(headNodes, ctx, slotBase) {
	if (!headNodes.length) return '';
	ctx.runtimeNeeded.add('headBlock');
	// Each hoisted head element gets a dense scope slot (after the body's constructs);
	// the content `key` stays as a later arg for SSR-adoption matching.
	return headNodes
		.map((h, i) => `  _$headBlock(__s, ${slotBase + i}, ${headElementArgs(h, i)});`)
		.join('\n');
}

// Build the SERVER `ssrHeadEl(…)` statements for a component's hoisted head
// elements. Returns '' when there are none.
/** @param {any[]} headNodes @param {any} ctx @returns {string} */
function emitHeadServer(headNodes, ctx) {
	if (!headNodes.length) return '';
	ctx.runtimeNeeded.add('ssrHeadEl');
	return headNodes.map((h, i) => `  _$ssrHeadEl(${headElementArgs(h, i)});`).join('\n') + '\n';
}

/**
 * Normalize a list of JSX child nodes into the shapes the emitters consume:
 *   - Whitespace-only JSXText / JSX comments (`{…}` empty containers) → dropped
 *   - JSXText with content → `Text` node wrapping a string Literal
 *   - `{expr}` container → `Text` hole, or `TSRXExpression` when the
 *     expression needs the rich dispatcher (portals, JSX ternaries,
 *     `.map(x => <jsx/>)`, `() => @{…}` render props — see needsRichDispatch);
 *     a `{xs.map(x => <li key/>)}` hole lowers to a synthetic `@for`
 *     (ForOfStatement) so it takes the keyed forBlock/ssrBlock fast path
 *   - JSXElement → `Element` (with `<Fragment ref>` expanded to a
 *     FragmentStart/…/FragmentEnd sequence, `<Activity>` lowered to an
 *     ActivityStatement, `<title>/<meta>/<link>` hoisted as `HeadHoist`,
 *     and `<head>` rejected)
 *   - Fragments (`<>…</>`, Tsx/Tsrx) → flattened (children inlined)
 *   - JSXStyleElement → dropped (its CSS is handled by the scoping pipeline)
 *   - Directive expressions (@if/@for/@try/@switch, `@{…}` child blocks) →
 *     lowered to the statement shapes makeIfCall/makeForCall/makeTryCall/
 *     makeSwitchCall consume
 *   - Anything else → passed through
 */
// `inSvg`: the children being normalized sit inside an SVG-namespace subtree.
// SVG has its own `<title>` (the accessibility tooltip element) — it must stay
// where it is, NOT hoist to document.head (React 19 makes the same exception).
function normalizeChildren(nodes, inSvg = false) {
	const out = [];
	if (!nodes) return out;
	for (const n of nodes) {
		if (!n) continue;
		if (n.type === 'JSXText') {
			if (/^\s*$/.test(n.value)) continue;
			out.push({
				type: 'Text',
				expression: { type: 'Literal', value: n.value, raw: JSON.stringify(n.value) },
			});
		} else if (n.type === 'JSXExpressionContainer') {
			// A JSX comment — `{/* … */}` — parses as a container wrapping a
			// `JSXEmptyExpression`. It produces NO child (React drops it); emitting it
			// as a hole would yield malformed code (`h0: ,`). Drop it.
			if (!n.expression || n.expression.type === 'JSXEmptyExpression') continue;
			// `{xs.map(item => <jsx key/>)}` → lower to a synthetic `@for` so it takes
			// the keyed forBlock (client) / ssrBlock (server) fast path — a compiled
			// per-item body over the raw items array — instead of building a
			// `createElement` descriptor per row each render and reconciling that array
			// through childSlot. Both consumers (emitElementHtml's ForOfStatement branch,
			// ssrEmitNode's ForOfStatement case) already handle this node, so client and
			// server stay in lockstep (required for hydration). The client .tsx
			// host-fragment path does the same conversion in extractFragment (which
			// hoists the items array as a hole before this runs).
			const mapForNode = mapCallToForOf(n.expression);
			if (mapForNode) {
				out.push(mapForNode);
				continue;
			}
			// TS-only wrappers (`as string`, `!`, `satisfies T`) on the expression
			// get stripped centrally in printNode at print time — no need to
			// pre-strip here. Pass the raw expression through; downstream emission
			// sees a plain expression once esrap is invoked.
			const expression = n.expression;
			// Route to the RICH dispatcher (`TSRXExpression` branch in emitElementHtml)
			// when the expression is one that needs special handling — createPortal
			// calls, JSX-bearing ternaries, sub-template arrows (`() => @{…}`).
			// Otherwise route to the simpler `Text` branch (text-binding fast-path
			// for string-typed expressions; runtime String() coercion for others).
			out.push({
				type: needsRichDispatch(expression) ? 'TSRXExpression' : 'Text',
				expression,
			});
		} else if (n.type === 'JSXElement') {
			// Long-form `<Fragment>…</Fragment>` (canary `enableFragmentRefs`
			// parity): if it carries a `ref` attribute, expand to a
			// FragmentStart / …children… / FragmentEnd sequence so the parent
			// element template gets `<!--frag-->` markers + a fragmentRef
			// binding pairing them. Without a ref, treat it identically to the
			// `<>` shorthand and just inline the children (no wasted markers).
			// Detection is by source-name only; the runtime `Fragment` export
			// exists as a sentinel for `import { Fragment }` parity, but the
			// compiler matches the identifier here. Routing this BEFORE the
			// generic Element branch is required — `Fragment` would otherwise
			// hit `isComponentTag` and route through `componentSlot`, which
			// has no notion of marker pairs.
			if (isFragmentLongForm(n)) {
				const refAttr = (n.openingElement.attributes || []).find(
					(a) =>
						(a.type === 'Attribute' || a.type === 'JSXAttribute') &&
						a.name &&
						(a.name.name || a.name) === 'ref',
				);
				if (refAttr) {
					const refVal = refAttr.value;
					const refInner =
						refVal && refVal.type === 'JSXExpressionContainer' ? refVal.expression : refVal;
					out.push({ type: 'FragmentStart', refExpr: refInner });
					out.push(...normalizeChildren(n.children || [], inSvg));
					out.push({ type: 'FragmentEnd' });
				} else {
					out.push(...normalizeChildren(n.children || [], inSvg));
				}
				continue;
			}
			// `<Activity mode={…}>…</Activity>` (React 19). Matched by name BEFORE
			// the generic Element branch (it would otherwise route through
			// componentSlot). Lower to an ActivityStatement carrying the mode expr
			// and the raw children (compiled into one body by makeActivityCall).
			if (isActivityLongForm(n)) {
				const modeAttr = (n.openingElement.attributes || []).find(
					(a) =>
						(a.type === 'Attribute' || a.type === 'JSXAttribute') &&
						a.name &&
						(a.name.name || a.name) === 'mode',
				);
				let mode = null;
				if (modeAttr) {
					const v = modeAttr.value;
					mode = v && v.type === 'JSXExpressionContainer' ? v.expression : v;
				}
				out.push({ type: 'ActivityStatement', mode, children: n.children || [] });
				continue;
			}
			// `<head>` is no longer a construct (React-19 model): render
			// `<title>`/`<meta>`/`<link>` directly and they hoist to document.head.
			if (isHeadElementNode(n)) {
				throw new Error(
					'`<head>` is not supported in octane. Render `<title>`, `<meta>`, and ' +
						'`<link>` directly (anywhere in the component) — they are hoisted to ' +
						'document.head automatically, React-19-style.',
				);
			}
			// `<title>`/`<meta>`/`<link>` → hoist to the document-head channel (NOT
			// body DOM). Kept in `out` as a synthetic node so planJsx / ssrCompileBody
			// can partition it out and emit it via headBlock (client) / ssrHeadEl
			// (server). Lifted from wherever they appear in the output — EXCEPT an
			// SVG `<title>`, which is the SVG tooltip element and stays in place.
			if (isHoistableHeadElementNode(n) && !(inSvg && jsxTagName(n) === 'title')) {
				out.push({ type: 'HeadHoist', element: n });
				continue;
			}
			out.push({
				type: 'Element',
				id: n.openingElement.name,
				attributes: n.openingElement.attributes || [],
				openingElement: n.openingElement,
				children: n.children || [],
				selfClosing: n.openingElement.selfClosing,
				loc: n.loc, // preserve element position for dev hydration LOC (component slots)
			});
		} else if (n.type === 'Tsx' || n.type === 'Tsrx' || n.type === 'JSXFragment') {
			out.push(...normalizeChildren(n.children || [], inSvg));
		} else if (n.type === 'JSXStyleElement') {
			// Drop a `<style>` block at child position — its CSS gets registered
			// via the @tsrx/core scoping pipeline (applyCssScoping / applyStyleMap);
			// it contributes no DOM here.
			continue;
		} else if (n.type === 'JSXIfExpression') {
			// `@if (cond) { ... } @else { ... }` — lower to the old IfStatement
			// shape so the existing makeIfCall path picks it up. `consequent` and
			// `alternate` are already BlockStatements per the new AST.
			out.push({
				type: 'IfStatement',
				loc: n.loc, // preserve template directive position for dev hydration LOC
				test: n.test,
				consequent: n.consequent,
				alternate: n.alternate || null,
			});
		} else if (n.type === 'JSXForExpression') {
			// `@for (const x of items; index i; key x.id) { ... }` — lower to
			// ForOfStatement plus the `key` and `index` fields the new AST gives
			// us on the directive node. makeForCall reads these off the synthetic
			// ForOfStatement to plan keyed reconciliation.
			out.push({
				type: 'ForOfStatement',
				loc: n.loc, // preserve template directive position for dev hydration LOC
				left: n.left,
				right: n.right,
				body: n.body,
				await: !!n.await,
				key: n.key || null,
				index: n.index || null,
				empty: n.empty || null,
			});
		} else if (n.type === 'JSXTryExpression') {
			// `@try { } @catch (err) { } @pending { }` — lower to TryStatement
			// with the optional `pending` field tagged on (consumed by makeTryCall
			// as the Suspense fallback branch).
			out.push({
				type: 'TryStatement',
				loc: n.loc, // preserve template directive position for dev hydration LOC
				block: n.block,
				handler: n.handler || null,
				finalizer: n.finalizer || null,
				pending: n.pending || null,
			});
		} else if (n.type === 'JSXSwitchExpression') {
			// `@switch (d) { @case 1: { ... } @default: { ... } }` — lower to a
			// synthetic SwitchStatement for makeSwitchCall to consume.
			out.push({
				type: 'SwitchStatement',
				loc: n.loc, // preserve template directive position for dev hydration LOC
				discriminant: n.discriminant,
				cases: n.cases || [],
			});
		} else if (n.type === 'JSXCodeBlock') {
			// `@{ … }` at child position — tsrx 0.1.29 lets `@{}` appear here as
			// well as on function bodies. The node has `.body` (setup statements)
			// and `.render` (the single optional render output).
			//   - Empty: drop (degenerate but legal).
			//   - Render-only: recurse — the wrapped JSX is a sibling.
			//   - Code-only or setup+render: ambiguous at child position (when do
			//     the setup statements run? Per-render? Once per parent mount?
			//     The runtime would need a fresh Scope and a way to thread state
			//     back to siblings — there is no sensible answer in our model).
			//     Throw with a workaround hint pointing at the render-prop arrow
			//     form `{() => @{ … }}`, which IS supported via the existing
			//     ArrowFunctionExpression → JSXCodeBlock path (compile.js:1081).
			const body = n.body || [];
			const render = n.render || null;
			if (body.length === 0 && render === null) continue;
			if (body.length === 0 && render !== null) {
				// Recurse — render is a single JSX node, treat as a sibling child.
				out.push(...normalizeChildren([render], inSvg));
			} else {
				throw new Error(
					'`@{ … }` with setup statements is not supported at JSX child position. ' +
						'Wrap it in a render-prop arrow form instead — `{() => @{ … }}` — ' +
						'or extract the setup into its own component.',
				);
			}
		} else {
			out.push(n);
		}
	}
	return out;
}

/**
 * Decide whether a JSX-child expression needs the rich dispatcher
 * (`TSRXExpression` branch in emitElementHtml) rather than the simple text
 * branch. Rich dispatch handles createPortal at child position, ternaries
 * whose branches are JSX, and sub-template arrows `() => @{…}` that the
 * standalone esrap printer can't handle.
 */
function needsRichDispatch(expr) {
	if (!expr || typeof expr !== 'object') return false;
	if (isCreatePortalCall(expr)) return true;
	if (isConditionalJsx(expr)) return true;
	if (isJsxReturningMapCall(expr)) return true;
	// A bare arrow whose body is a JSXCodeBlock — appears as a render-prop pass
	// (e.g. `{(state) => @{ … }}`). esrap will explode on the JSXCodeBlock; route
	// through rich dispatch where rewriteTsrxBlocks normalizes it.
	if (expr.type === 'ArrowFunctionExpression' && expr.body && expr.body.type === 'JSXCodeBlock')
		return true;
	return false;
}

// A text child that is a plain string literal — `<el>plain text</el>` (JSXText)
// or `<el>{'literal'}</el>` — can be baked directly into the template HTML
// instead of emitting a runtime text binding. Returns the literal string, or
// `null` when the expression is anything dynamic. Mirrors the server's
// `Literal`-string fast path so client and server emit identical markup.
function staticTextLiteral(node) {
	if (node == null || typeof node !== 'object') return null;
	if (
		(node.type === 'Literal' || node.type === 'StringLiteral') &&
		typeof node.value === 'string'
	) {
		return node.value;
	}
	return null;
}

// Predicate: is this expression statically known to be a string? Used at
// text-binding creation time to mark the binding so the runtime emit can
// skip the `String(_v)` coercion on the hot path. Recognised shapes:
//   - String Literal:               'foo' / "bar"
//   - TemplateLiteral:               `${x}-${y}` (always coerces to string)
//   - `as string` / `<string>x`:     user-asserted string-typed expression
//   - `satisfies string`:            same intent
//   - Wrappers (`!`, instantiation): peel and check inside
//   - String `+` concat:             at least one operand known-string
// Conservative — returns false for anything we can't prove. Safe to use
// from any text-binding site BEFORE the TS-wrapper strip in printNode.
function isKnownStringExpression(node, locals) {
	if (node == null || typeof node !== 'object') return false;
	if (node.type === 'Literal' || node.type === 'StringLiteral') {
		return typeof node.value === 'string';
	}
	if (node.type === 'TemplateLiteral') return true;
	// An identifier the compiler has tracked back to a string in this component's
	// scope: a `const` bound to a provably-string expression, a `const x: string`,
	// or a `string`-typed param — see collectKnownStringLocals. `locals` is
	// component-scoped and has render-shadowed names removed, so a
	// `@for (const x …)` loop var never inherits an outer string `const x`. When
	// `locals` is absent (callers that don't track locals), identifiers are not
	// assumed string — the conservative pre-existing behaviour.
	if (node.type === 'Identifier') return locals != null && locals.has(node.name);
	if (
		node.type === 'TSAsExpression' ||
		node.type === 'TSTypeAssertion' ||
		node.type === 'TSSatisfiesExpression'
	) {
		const ann = node.typeAnnotation;
		if (
			ann &&
			(ann.type === 'TSStringKeyword' ||
				(ann.type === 'TSTypeReference' && ann.typeName && ann.typeName.name === 'string'))
		) {
			return true;
		}
		return isKnownStringExpression(node.expression, locals);
	}
	if (node.type === 'TSNonNullExpression' || node.type === 'TSInstantiationExpression') {
		return isKnownStringExpression(node.expression, locals);
	}
	// `a + b` is a string if EITHER operand is a string (JS coerces the other).
	if (node.type === 'BinaryExpression' && node.operator === '+') {
		return (
			isKnownStringExpression(node.left, locals) || isKnownStringExpression(node.right, locals)
		);
	}
	return false;
}

// Annotation check: does a TS type annotation resolve to `string`? Accepts both a
// bare type node and a `TSTypeAnnotation` wrapper (`x: string`).
function isStringTypeAnnotation(ann) {
	if (!ann) return false;
	const t = ann.type === 'TSTypeAnnotation' && ann.typeAnnotation ? ann.typeAnnotation : ann;
	return !!(
		t &&
		(t.type === 'TSStringKeyword' ||
			(t.type === 'TSTypeReference' && t.typeName && t.typeName.name === 'string'))
	);
}

// Collect names bound INSIDE a render subtree (loop vars, catch params, nested
// function params, nested declarations). Used to drop component-scope known-string
// `const`s that a render scope shadows (e.g. a `@for (const x …)` loop var with the
// same name) so the inner `{x}` is never misclassified as that outer string. Reuses
// `collectBindings` for destructuring patterns; over-collecting is safe (it only
// makes the known-string set smaller).
function collectRenderBoundNames(node, out) {
	if (node == null || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const n of node) collectRenderBoundNames(n, out);
		return;
	}
	switch (node.type) {
		case 'ForOfStatement':
		case 'ForInStatement': {
			const left = node.left;
			if (left && left.type === 'VariableDeclaration') {
				for (const d of left.declarations || []) collectBindings(d.id, out);
			} else if (left) {
				collectBindings(left, out);
			}
			break;
		}
		case 'CatchClause':
			if (node.param) collectBindings(node.param, out);
			break;
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
		case 'FunctionDeclaration':
			for (const p of node.params || []) collectBindings(p, out);
			break;
		case 'VariableDeclarator':
			if (node.id) collectBindings(node.id, out);
			break;
	}
	for (const key in node) {
		if (key === 'type') continue;
		const v = node[key];
		if (v && typeof v === 'object') collectRenderBoundNames(v, out);
	}
}

// Component-scope set of local names the compiler can prove hold a string: a
// `string`-typed param, or a setup `const` whose initializer is a provably-string
// expression (concat/template/literal — possibly chaining earlier such consts) or
// that carries a `: string` annotation. Names a render scope re-binds are removed
// (shadow guard). Populated identically on the client and server compile paths so
// text-vs-renderable hole classification — and therefore SSR markup — stays in
// lockstep for hydration. Only the standard JSXCodeBlock component shape is
// analysed; anything else yields an empty set (no identifier tracking, no change).
function collectKnownStringLocals(componentNode) {
	if (!componentNode.body || componentNode.body.type !== 'JSXCodeBlock') return new Set();
	const known = new Set();
	for (const p of componentNode.params || []) {
		if (p.type === 'Identifier' && isStringTypeAnnotation(p.typeAnnotation)) known.add(p.name);
	}
	for (const stmt of componentNode.body.body || []) {
		if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') continue;
		for (const d of stmt.declarations || []) {
			if (!d.id || d.id.type !== 'Identifier') continue;
			if (isStringTypeAnnotation(d.id.typeAnnotation)) {
				known.add(d.id.name);
			} else if (d.init && isKnownStringExpression(d.init, known)) {
				known.add(d.id.name);
			}
		}
	}
	if (known.size && componentNode.body.render) {
		const rebound = new Set();
		collectRenderBoundNames(componentNode.body.render, rebound);
		for (const n of rebound) known.delete(n);
	}
	return known;
}

// Walk an AST, replacing every TS-only wrapper node (TSAsExpression,
// TSTypeAssertion, TSNonNullExpression, TSSatisfiesExpression,
// TSInstantiationExpression) with its inner .expression. Called centrally
// from printNode so every print path strips wrappers — esrap's tsx printer
// would otherwise emit `expr as string` / `expr!` / `expr satisfies T`
// verbatim into the compiled JS output, which Vite/rolldown rejects when
// loading the result as a `.js` module ("Type assertion expressions can
// only be used in TypeScript files"). Replaces the old stripStringishCast
// helper that only stripped outer wrappers at JSX-child position — this
// also covers inner wrappers (e.g. `(foo as number).toFixed(2) as string`)
// and statement-position wrappers (`@if` body's `'…' as string`).
// AST properties that hold a TS-only type annotation. esrap's tsx printer
// will emit them verbatim into the .js output (`let x: T`, `(p: T): R =>`,
// `function f<T>(){}`), which Rolldown rejects as it parses the output as
// plain JavaScript ("Type annotations can only be used in TypeScript
// files."). Clearing them lets the printer skip them cleanly. Listed
// explicitly rather than as a generic filter so the strip is auditable.
const TS_TYPE_PROPS = [
	'typeAnnotation', // Identifier `x: T`, VariableDeclarator, RestElement, Pattern
	'returnType', // FunctionDeclaration / Arrow / MethodDefinition return type
	'typeParameters', // Generic `<T>` declaration on function / class / interface
	'typeArguments', // Generic `<T>` ARGS on a call / new / JSX (`new Promise<string>()`, `foo<T>()`)
	'definite', // `let x!: T` definite-assignment assertion
	'accessibility', // class member `public` / `private` / `protected`
	'readonly', // class member `readonly`
	'declare', // `declare` modifier
	'override', // class member `override`
	'implements', // `class X implements I` list
];

function stripTsOnlyWrappers(node) {
	if (node === null || typeof node !== 'object') return node;
	if (Array.isArray(node)) {
		for (let i = node.length - 1; i >= 0; i--) {
			// Type-only STATEMENTS nested below module scope (a `type X = …` or
			// `interface I {}` inside a function body) never hit the top-level
			// `ast.body` filter, and stripping their annotations below would
			// leave esrap an alias with a nulled typeAnnotation (crash) — drop
			// the whole statement here instead. The matched node types are
			// statement-only, so pruning from any AST array is safe (sparse
			// ArrayExpression holes are `null` and isTypeOnlyStatement keeps
			// them). Checked BEFORE the per-node strip so `declare` is intact.
			if (isTypeOnlyStatement(node[i])) {
				node.splice(i, 1);
			} else {
				node[i] = stripTsOnlyWrappers(node[i]);
			}
		}
		return node;
	}
	if (
		node.type === 'TSAsExpression' ||
		node.type === 'TSTypeAssertion' ||
		node.type === 'TSNonNullExpression' ||
		node.type === 'TSSatisfiesExpression' ||
		node.type === 'TSInstantiationExpression'
	) {
		return stripTsOnlyWrappers(node.expression);
	}
	// Drop type-only properties before descending so esrap never sees them.
	for (let i = 0; i < TS_TYPE_PROPS.length; i++) {
		const prop = TS_TYPE_PROPS[i];
		if (node[prop] !== undefined) node[prop] = null;
	}
	// `optional` on a parameter / Identifier is the `x?: T` marker — esrap
	// emits `x?` even if typeAnnotation is gone, which is also TS-only.
	// NB: `optional: true` ALSO marks optional chaining on MemberExpression /
	// CallExpression (`a?.b`, `a?.()`), which is runtime JavaScript and must be
	// preserved — so only clear it on non-member/call nodes (the TS `x?` marker).
	if (
		node.optional === true &&
		node.type !== 'MemberExpression' &&
		node.type !== 'CallExpression' &&
		node.type !== 'OptionalMemberExpression' &&
		node.type !== 'OptionalCallExpression'
	) {
		node.optional = false;
	}
	for (const key of Object.keys(node)) {
		// Skip `loc`/`range`/`start`/`end` source-position fields and the parent
		// backref (acorn-typescript sometimes attaches one). These never hold
		// wrapper nodes and walking them wastes work.
		if (key === 'loc' || key === 'range' || key === 'start' || key === 'end' || key === 'parent')
			continue;
		const child = node[key];
		if (child === null || typeof child !== 'object') continue;
		node[key] = stripTsOnlyWrappers(child);
	}
	return node;
}

function planJsx(jsxNodesRaw, ctx, componentName, inlinedSubs, parentNs = 'html', cssHash = null) {
	// DEV ONLY: per-element source-location map for THIS body (path-key → [line, col]),
	// populated at the top of emitElementHtml and read in the binding mount loop to emit
	// `<el>.__oct_loc = "file:line:col"` for bound elements — the location side-channel for
	// hydration-mismatch warnings on param-less value sites (htext/htextSwap/setAttribute,
	// which only have the element in hand) AND a future Chrome-DevTools element→source layer.
	// Save/restore around this call so a NESTED planJsx (makeIfCall/makeForCall compiling a
	// branch body during this body's emitElementHtml) can't clobber the outer body's map.
	// `null` outside dev → zero work, prod output byte-identical.
	const _prevElemLocs = ctx._elemLocs;
	ctx._elemLocs = ctx.dev ? new Map() : null;
	const allNodes = normalizeChildren(jsxNodesRaw);
	// Partition hoisted `<title>`/`<meta>`/`<link>` out of the BODY-root set:
	// `jsxNodes` (the body) drives single/multi-root + the template, while head
	// elements are mounted out-of-band into document.head. Excluding them (like
	// `<style>`) is what collapses a `<title> + <style> + <div>` page to single-root.
	const headNodes = allNodes.filter((n) => n.type === 'HeadHoist');
	const jsxNodes = allNodes.filter((n) => n.type !== 'HeadHoist');
	// Head-only body: no body template, hence no binding bag — the hoisted head
	// elements take slots 0..M-1 (packed). The body case allocates head slots AFTER
	// its constructs (see `headEmit` below), keeping every scope's `slots` packed.
	if (jsxNodes.length === 0) {
		ctx._elemLocs = _prevElemLocs;
		return { mount: '', update: '', after: '', head: emitHeadClient(headNodes, ctx, 0) };
	}

	// Emit ONE template containing all top-level JSX (wrapping multiple roots in
	// a synthetic <octane-frag>).
	// We walk the tree, building HTML and a list of bindings.
	const elementBindings = []; // ordered list of bindings (per dynamic site)
	const forCalls = []; // forBlock calls — emitted after the mount/append
	const ifCalls = []; // ifBlock calls
	const compCalls = []; // component-as-tag calls (<Provider>, <Foo/>, <ctx.X/>)
	// {createPortal(...)} calls collected by emitElementHtml for THIS plan.
	// Save/restore the previous list across the plan so that nested planJsx
	// calls (triggered by compiling portal bodies via printExprWithTsrx) don't
	// wipe the outer plan's collected portals. Without this, two sibling
	// createPortal calls at the same level lose the first one because the
	// recursive plan for its body resets the array before the second push.
	const _prevPortalCalls = ctx._portalCalls;
	ctx._portalCalls = [];
	// `switchCalls` follows the same save/restore pattern as portals: keep it
	// on `ctx` so we don't thread an extra param through every emit signature.
	const _prevSwitchCalls = ctx._switchCalls;
	ctx._switchCalls = [];
	// Top-level Fragment ref pairing stack — same save/restore reason as
	// portals/switches so nested planJsx invocations (e.g. sub-templates
	// inside components) don't leak FragmentStart bindings into each other.
	const _prevFragRefStack = ctx._fragRefStack;
	ctx._fragRefStack = [];
	const tryCalls = []; // tryBlock calls

	// Track HTML index across top-level nodes — component-call nodes don't
	// contribute HTML, so their indices DON'T advance the frag position. Each
	// HTML-contributing top-level node lives at _root.childNodes[htmlIdx].
	// `single` mode = exactly one non-component Element root, no <octane-frag>
	// wrapping. Anything else (multi-root, single Text, single comp call) goes
	// through the wrapper path; HTML-contributing nodes are at `_root.childNodes[i]`.
	const single =
		jsxNodes.length === 1 && jsxNodes[0].type === 'Element' && !isComponentTag(jsxNodes[0]);
	// M3 inherit-range: consume the caller's body-form flag ONCE — nested planJsx
	// runs (directive arm bodies compiled during this walk) must not see it. The
	// sole-comp-root predicate is shared with the server compile
	// (inheritSoleCompRoot), so the client stamp and the server pair-skip agree
	// by construction; the stamped cc emits componentSlot(..., inherit=true).
	const inheritRoot = ctx._inheritBody === true && inheritSoleCompRoot(jsxNodes, ctx);
	ctx._inheritBody = false;
	// Top-level control-flow directives (@if/@for/@switch/@try/<Activity>). In a
	// body that ALSO has static template roots, each construct emits a `<!>`
	// anchor at its child index (mirroring the in-element mixed-children path)
	// so its content mounts at its source position BETWEEN static siblings —
	// and so `htmlIdx` counts it like any other HTML-contributing root. In a
	// control-flow-only body (no static root) constructs emit no HTML and
	// anchor at `__block.endMarker` instead (the bagless noTemplate path).
	const isConstructNode = (n) =>
		n.type === 'IfStatement' ||
		n.type === 'ActivityStatement' ||
		n.type === 'ForOfStatement' ||
		n.type === 'TryStatement' ||
		n.type === 'SwitchStatement';
	const hasStaticRoot = jsxNodes.some(
		(n) => !isConstructNode(n) && !(n.type === 'Element' && isComponentTag(n)),
	);
	const partsHtml = [];
	let htmlIdx = 0;
	// Text-adjacency classification of the root nodes (see textAdjacencyKind):
	// root-level text holes are `<!>` bindings too, so a dynamic hole with a
	// text neighbour needs the same adjacentText flag as the in-element walk
	// (the server separates the pair with `<!-- -->`).
	const rootAdjKinds = jsxNodes.map((n) => textAdjacencyKind(n, ctx));
	for (let rootI = 0; rootI < jsxNodes.length; rootI++) {
		const node = jsxNodes[rootI];
		const nodeIsComp = node.type === 'Element' && isComponentTag(node);
		// Single non-comp Element: path=[] (lives at _root directly).
		// Otherwise (wrapped in <octane-frag>): path=[htmlIdx] when HTML-contributing.
		// Component-call: path=[] (no DOM contributed, host is the wrapper).
		// Construct: path=[htmlIdx] when it gets a `<!>` anchor (static siblings
		// exist), else [] — emitNodeHtml keys the anchor emit off the path.
		// A COMPONENT root normally contributes no HTML and appends at
		// `__block.endMarker` (path=[]). But in a MIXED body — a component root
		// alongside a static/HTML template root — it must sit at its source-order
		// position relative to that static content, so (like a construct root) it
		// emits a `<!>` anchor at `[htmlIdx]`. Without the anchor the static content
		// drains into the parent first and the component appends AFTER it, reversing
		// source order (e.g. a `<Comp/>` before an `<input/>` sibling).
		const nodeNeedsAnchor = nodeIsComp || isConstructNode(node);
		const nodePath = !single && (nodeNeedsAnchor ? hasStaticRoot : true) ? [htmlIdx] : [];
		const bindingsBefore = elementBindings.length;
		const part = emitNodeHtml(
			node,
			nodePath,
			elementBindings,
			forCalls,
			ifCalls,
			compCalls,
			tryCalls,
			ctx,
			componentName,
			inlinedSubs,
			parentNs,
			cssHash,
		);
		// Flag a root-level text binding whose neighbour is also text — the server
		// separates the pair with `<!-- -->`, so the walk must be hole-aware. Only
		// the binding this very node pushed qualifies (element roots push their own
		// nested bindings, but those were flagged by the in-element walk already).
		if (node.type === 'Text' && hasTextNeighbor(rootAdjKinds, rootI)) {
			for (let bi = bindingsBefore; bi < elementBindings.length; bi++) {
				if (elementBindings[bi].kind === 'text') elementBindings[bi].adjacentText = true;
			}
		}
		partsHtml.push(part);
		// M3 inherit-range: stamp the sole comp-call root's cc. Its own entry is
		// the LAST one its emitNodeHtml pushed (nested children/prop ccs are
		// pushed first, before makeCompCall returns to the root push).
		if (inheritRoot && compCalls.length > 0) {
			compCalls[compCalls.length - 1].inheritRange = true;
		}
		// Advance the child index only when the node actually contributed template
		// HTML (an element / text / `<!>` anchor). Component calls and un-anchored
		// constructs contribute none — advancing for them would shift every later
		// sibling's template path off by one.
		if (part !== '') htmlIdx++;
	}
	const html = partsHtml.join('');
	// Was every emitted JSX node a component-call (or any non-HTML node that
	// contributes no HTML)? Then there's no template to clone — control-flow /
	// component-slot calls render directly into __block.parentNode using
	// __block.endMarker as the anchor.
	const noTemplate = html === '';

	const mountLines = [];
	// The binding bag is allocated in ONE shot at the very END of the mount path
	// by a shared runtime arity factory (`_$bagN(__s, root, v0, v1, …)` — see
	// makeBag): the mount statements fill pre-declared LOCALS (`_m0, _m1, …`,
	// declared by the placeholder below once the field count is known), and the
	// factory builds the object literal from the real values (final hidden class
	// + real field representations at allocation), inserts the root, and commits
	// `__s.slots[0]` — commit LAST, so a throw mid-mount (a `use()` suspending, a
	// child render throwing) leaves the bag `undefined` and the next attempt
	// re-enters the mount branch instead of updating a half-populated bag.
	// Control-flow-only bodies carry no bag, so all of it is skipped.
	const bag = makeBag();
	const BAG_LOCALS_PLACEHOLDER = `    /*__bagLocals__*/`;
	if (!noTemplate) mountLines.push(BAG_LOCALS_PLACEHOLDER);

	let elementVars;
	let ensureVar;
	if (!noTemplate) {
		ctx.runtimeNeeded.add('template');
		ctx.runtimeNeeded.add('clone');
		// Template namespace strategy:
		//   - HTML single-root: parse the element directly, no flag.
		//   - HTML multi-root: wrap in <octane-frag> so template() returns the wrap.
		//   - SVG/MathML single-root: pass ns flag; runtime wraps with <svg>/<math>
		//     so the HTML5 parser places children in foreign content, then returns
		//     the inner root.
		//   - SVG/MathML multi-root: pass ns + frag=1; runtime wraps and returns
		//     the wrap itself (caller drains its children — no <octane-frag>).
		// Multi-root fragments at an HTML parent imply SVG only when EVERY element
		// root does (an all-SVG fragment — e.g. portal children `<rect/><g/>` — must
		// parse in foreign content; a MIXED fragment can't share one wrapper, so it
		// keeps HTML and the SVG-only roots would mis-parse — reject? No: mixed
		// fragments at ambiguous positions are user error the browser also mangles).
		const elementRoots = single ? null : jsxNodes.filter((n) => elementTagName(n) !== null);
		const fragImpliesSvg =
			!single && elementRoots.length > 0 && elementRoots.every(isNonHtmlRootTag);
		const isHtmlNs =
			parentNs === 'html' &&
			(single
				? !isNonHtmlRootTag(jsxNodes[0]) // svg/math/SVG-only root means non-HTML ns
				: !fragImpliesSvg);
		const tplNs = isHtmlNs
			? 'html'
			: single
				? nsForRootTag(jsxNodes[0], parentNs)
				: parentNs === 'html' && fragImpliesSvg
					? 'svg'
					: parentNs;
		const flag = nsFlag(tplNs);
		const fragArg = !single && flag !== 0 ? 1 : 0;
		const tplHtml = single || flag !== 0 ? html : `<octane-frag>${html}</octane-frag>`;
		const tpl = allocTemplate(ctx, tplHtml, flag, fragArg);
		// DEV: pass the root element's source location so a STRUCTURAL hydration mismatch
		// (swapped @if/@switch branch, changed tag) warns with `file:line:col`. Single-root
		// only (a multi-root <octane-frag> wrapper has no source position); prod omits it.
		let cloneLoc = '';
		if (ctx.dev && single) {
			const lc = devLoc(ctx, jsxNodes[0]);
			if (lc) cloneLoc = `, ${JSON.stringify(`${ctx.mapSourceName}:${lc[0]}:${lc[1]}`)}`;
		}
		mountLines.push(`    const _root = _$clone(${tpl}${cloneLoc});`);
		elementVars = new Map();
		let varCounter = 0;
		// Does this template contain a control-flow / component / portal hole? If so
		// the server DOM expands each hole into a `<!--[-->…<!--]-->` range that
		// shifts raw sibling paths, so we navigate with the hole-aware `child`/
		// `sibling` helpers (which skip a whole block range as one logical sibling)
		// instead of raw `.firstChild`/`.nextSibling`. Hole-free leaf templates keep
		// the raw walk (faster, and they already hydrate since server == template).
		// `child`/`sibling` are identical to raw access when not hydrating, so the
		// client path is unchanged (and the hydration branch DCE-folds away).
		const hasHoles =
			forCalls.length > 0 ||
			ifCalls.length > 0 ||
			compCalls.length > 0 ||
			tryCalls.length > 0 ||
			ctx._switchCalls.length > 0 ||
			ctx._portalCalls.length > 0 ||
			// A dynamic text hole with a text-producing neighbour: the server emits a
			// `<!-- -->` separator between the two texts (else the parser would merge
			// them), and only the hole-aware sibling() walk knows to step across it.
			elementBindings.some((b) => b.kind === 'text' && b.adjacentText);
		if (hasHoles) {
			ctx.runtimeNeeded.add('child');
			ctx.runtimeNeeded.add('sibling');
		}
		ensureVar = (path) => {
			// Base: empty path → the template root. Single-root cloned the element
			// directly (`_root`); multi-root cloned a frag that's drained on mount, so
			// top-level callers point at the live parent.
			if (path.length === 0) return single ? '_root' : '__block.parentNode';
			const key = path.join(',');
			const cached = elementVars.get(key);
			if (cached !== undefined) return cached;
			const k = path[path.length - 1];
			const prefix = path.slice(0, -1);
			// Prefer chaining off the nearest ALREADY-MATERIALIZED preceding sibling at
			// this level — one `.nextSibling` run across from it — over re-walking
			// `.firstChild.nextSibling×k` from the parent for every sibling. A row of k
			// bound cells (e.g. dbmon's `<td>`s) otherwise costs 1+2+…+k navigation steps
			// (O(k²) in both code size and mount-time DOM walking); chaining makes it
			// _el0→_el1→…, one step each (O(k)). Falls back to the parent walk when no
			// earlier sibling at this level is materialized yet.
			let sibVar;
			let sibSteps = 0;
			for (let j = k - 1; j >= 0; j--) {
				const c = elementVars.get([...prefix, j].join(','));
				if (c !== undefined) {
					sibVar = c;
					sibSteps = k - j;
					break;
				}
			}
			let step;
			if (sibVar !== undefined) {
				// `sibling(node, n)` skips n logical siblings (hole-aware, like walkExprH);
				// raw `.nextSibling` for hole-free templates. sibVar already resolves to the
				// (k−sibSteps)-th child, so n steps across lands on the k-th.
				if (hasHoles) {
					step = `_$sibling(${sibVar}, ${sibSteps})`;
				} else {
					step = sibVar;
					for (let i = 0; i < sibSteps; i++) step += '.nextSibling';
				}
			} else {
				// Materialize the ANCESTOR first (cached + reused across siblings), then take
				// ONE navigation step from it — instead of re-walking the whole path from
				// `_root`. The chain bottoms out at `_root` (the cloned root / not-yet-drained
				// frag), NOT at `ensureVar([])`: for a multi-root template `[]` resolves to
				// __block.parentNode (the POST-drain slot host), which is the wrong base for
				// navigating elements that still live inside `_root` at mount time.
				const parentVar = prefix.length === 0 ? '_root' : ensureVar(prefix);
				step = hasHoles ? walkExprH(parentVar, [k]) : walkExpr(parentVar, [k]);
			}
			const v = `_el${varCounter++}`;
			elementVars.set(key, v);
			mountLines.push(`    const ${v} = ${step};`);
			return v;
		};
	} else {
		// No template (control-flow / component-only body): every host is
		// __block.parentNode — recomputable every render — so this body needs NO
		// binding bag at all. Hosts resolve directly; the bag alloc/commit and the
		// `let _b … if (undefined) … else {}` wrapper are skipped (see `noTemplate`
		// guards below + `hasBag: false` in the plan).
		ensureVar = () => `__block.parentNode`;
	}

	// Decide which property-write bindings DEFER their mount write to the
	// every-render diff. We skip any element that also carries a spread: a spread
	// can write any key, so its mount-apply must keep its source-order position
	// relative to explicit props (and its commit-phase ref timing needs the mount
	// scope) — those elements keep the old mount-writes + else-only diff. On every
	// other element the property-write group has disjoint targets, so deferring is
	// order-independent and byte-identical.
	const spreadPaths = new Set();
	for (const b of elementBindings) {
		if (b.kind === 'spread') spreadPaths.add(b.path.join(','));
	}
	for (const b of elementBindings) {
		b.deferred = DEFERRABLE_MOUNT_KINDS.has(b.kind) && !spreadPaths.has(b.path.join(','));
	}

	// DEV ONLY: dedup set so each bound host element is stamped with `__oct_loc` ONCE,
	// even when it carries several bindings. `null` outside dev → no stamping, prod
	// output byte-identical.
	const _locStamped = ctx.dev ? new Set() : null;
	// DEV: stamp `<hostVar>.__oct_loc = "file:line:col"` ONCE per host element, so the
	// hydration-mismatch paths (htext/setAttribute on the element; childTextHole/mountItem on
	// the host) can report a source location. Prefers the host element's own position, falling
	// back to a construct's. `null`/absent loc → no stamp; prod is byte-identical.
	const stampHostLoc = (hostVar, pathArr, fallbackLoc) => {
		if (!_locStamped || _locStamped.has(hostVar)) return;
		const lc = (ctx._elemLocs && ctx._elemLocs.get(JSON.stringify(pathArr))) || fallbackLoc;
		if (!lc) return;
		_locStamped.add(hostVar);
		mountLines.push(
			`    ${hostVar}.__oct_loc = ${JSON.stringify(`${ctx.mapSourceName}:${lc[0]}:${lc[1]}`)};`,
		);
	};
	// A sibling-position `{x as string}` text hole mounts with `htextSwap`, which REPLACES the
	// `<!>` placeholder with a text node — DETACHING that placeholder. Any later element walk
	// based on it (`sibling(_elN, k)` — the next text hole OR a component/control-flow anchor at
	// a later child index) would then navigate from a detached node and get `null`. So collect
	// these text mounts and flush them AFTER every walk has been emitted, so all navigation
	// happens on the intact template. (Regression: StoryRow's `.meta` interleaves text holes
	// with `<Link>` components.)
	const deferredTextMounts = [];
	// Emit per-binding mount code.
	for (const b of elementBindings) {
		// A sibling-position `{x as string}` text hole resolves to its POSITION node
		// (the `<!>` placeholder / server text node) via the full path INCLUDING the
		// childIndex — so the hole-aware child/sibling walk adopts the correct server
		// node during hydration (raw childNodes[childIndex] would land inside an
		// earlier sibling's `<!--[-->…<!--]-->` range). Everything else resolves to
		// its host element.
		const elVar = b.kind === 'text' ? ensureVar([...b.path, b.childIndex]) : ensureVar(b.path);
		// DEV: stamp the HOST element (`b.path`, not the text-position node) with its source
		// location, BEFORE the binding's mount runs — so a hydration value mismatch in
		// htext/htextSwap/setAttribute (which only have the element) can report `file:line:col`.
		if (_locStamped && b.kind !== 'text') stampHostLoc(elVar, b.path, undefined);
		else if (_locStamped) stampHostLoc(ensureVar(b.path), b.path, undefined);
		if (b.kind === 'text' || b.kind === 'textOnlyChild') ctx.runtimeNeeded.add('setText');
		if (b.kind === 'text') ctx.runtimeNeeded.add('htextSwap');
		if (b.kind === 'textOnlyChild') ctx.runtimeNeeded.add('htext');
		if (b.kind === 'attr') ctx.runtimeNeeded.add('setAttribute');
		if (CONTROLLED_KIND_HELPERS[b.kind] !== undefined) {
			ctx.runtimeNeeded.add(CONTROLLED_KIND_HELPERS[b.kind]);
		}
		if (b.kind === 'class') {
			if (b.ns && b.ns !== 'html') {
				// SVG/MathML `className` is read-only — use setClassAttr, which sets the
				// attribute + clsx-composes (setClassName handles composition on HTML).
				ctx.runtimeNeeded.add('setClassAttr');
			} else ctx.runtimeNeeded.add('setClassName');
		}
		if (b.kind === 'style') ctx.runtimeNeeded.add('setStyle');
		if (b.kind === 'formAction') ctx.runtimeNeeded.add('setFormAction');
		if (b.kind === 'event-bundle') {
			// 3b: mount builds the descriptor via evtN, update mutates via evtNu.
			const arity = b.argExprs.length <= 2 ? String(b.argExprs.length) : 'N';
			ctx.runtimeNeeded.add(`evt${arity}`);
			ctx.runtimeNeeded.add(`evt${arity}u`);
		}
		if (b.kind === 'spread') {
			ctx.runtimeNeeded.add('setSpread');
			ctx.runtimeNeeded.add('queueRefDetach'); // unmount-detach of a spread-supplied ref
		}
		if (b.kind === 'ref') {
			ctx.runtimeNeeded.add('attachRef');
			ctx.runtimeNeeded.add('queueRefAttach'); // deferred mount attach (commit-phase timing)
			ctx.runtimeNeeded.add('queueRefDetach'); // deferred unmount detach (same phasing)
		}
		if (b.kind === 'fragmentRef') {
			ctx.runtimeNeeded.add('attachRef');
			ctx.runtimeNeeded.add('mountFragmentRef');
			ctx.runtimeNeeded.add('queueRefAttach'); // deferred update re-attach
			ctx.runtimeNeeded.add('queueRefDetach'); // deferred update/unmount detach
			// Fragment refs need a SECOND template-walked node for the end
			// marker; emitBindingMount expects a single elVar so we resolve
			// the end-marker var here and stash it on the binding for the
			// emit branch to pick up.
			b.endElVar = ensureVar(b.endPath);
		}
		// `htextSwap` (sibling text hole) detaches its `<!>`; defer it past all walks (see above).
		if (b.kind === 'text') deferredTextMounts.push(emitBindingMount(b, elVar, bag));
		else mountLines.push(emitBindingMount(b, elVar, bag));
	}
	// Shared construct mount-loop (@for/@if/component/@try/@switch/portal):
	// resolve each record's host element, stash it on the bag under the
	// construct's key (`_<hostKey>$id`), DEV-stamp the host's source LOC (so a
	// hydration mismatch in e.g. childTextHole — which has the host, not a
	// template binding — can report `file:line:col`), and, when the plan
	// recorded a `<!>` source-order anchor, resolve + stash that too
	// (`_<anchorKey>$id`). Only the bag key naming varies per construct kind;
	// `each` appends kind-specific per-record mount lines.
	const mountConstructs = (list, hostKey, { anchorKey = null, stampLoc = true, each = null }) => {
		for (const c of list) {
			const elVar = ensureVar(c.hostPath || []);
			c.elVar = elVar;
			if (!noTemplate) mountLines.push(`    ${bag.local(`_${hostKey}$${c.id}`)} = ${elVar};`);
			if (!noTemplate && stampLoc) stampHostLoc(elVar, c.hostPath, c.loc);
			if (anchorKey !== null && c.anchorPath) {
				const anchorVar = ensureVar(c.anchorPath);
				c.anchorVar = anchorVar;
				mountLines.push(`    ${bag.local(`_${anchorKey}$${c.id}`)} = ${anchorVar};`);
			}
			if (each) each(c);
		}
	};
	mountConstructs(forCalls, 'for', { anchorKey: 'forAnchor' });
	mountConstructs(ifCalls, 'ifHost', { anchorKey: 'ifAnchor' });
	mountConstructs(compCalls, 'compHost', {
		anchorKey: 'compAnchor',
		each: (cc) => {
			// A renderable `{expr}` child in a TEMPLATE body (has a bag) uses the inline
			// text-hole fast path — cache its text node (`_chv`) + last value (`_chp`) on
			// the bag so updates do a direct `setText` like a `.tsrx` text binding.
			// Const-seeded straight into the bag factory args — no mount statement.
			if (cc.isChild && !noTemplate) {
				bag.constField(`_chv$${cc.id}`, 'null');
				bag.constField(`_chp$${cc.id}`, 'undefined');
			}
		},
	});
	mountConstructs(tryCalls, 'tryHost', { anchorKey: 'tryAnchor' });
	mountConstructs(ctx._switchCalls, 'switchHost', { anchorKey: 'switchAnchor' });
	// Portal hosts — the element containing the createPortal JSX position, stashed
	// so the runtime can stamp $$portalParent on the portal's mounted children
	// pointing here (React-shape bubble-out semantics). No LOC stamp, no `<!>`
	// anchor — the portal's content renders into a foreign target.
	mountConstructs(ctx._portalCalls, 'portalHost', { stampLoc: false });
	// Flush the deferred sibling-text-hole mounts now that every element walk is emitted —
	// `htextSwap` can safely detach its `<!>` placeholder without breaking later navigation.
	for (const line of deferredTextMounts) mountLines.push(line);

	if (!noTemplate) {
		// Allocate + insert + commit in ONE shared-factory call, LAST — see the
		// matching comment at the bag-locals placeholder above. `_$bagN(__s, root,
		// v0, …)` builds `{a: v0, b: v1, …}` (final hidden class + real values at
		// allocation), inserts `root` before the block's end marker (skipped for
		// the multi-root null-root form — drainFrag placed the content), commits
		// `__s.slots[0]`, and returns the bag for the after-lines below.
		if (!single) {
			// Multi-root: drain the <octane-frag> wrapper's children into the live
			// parent via the runtime helper — a hydration-aware no-op when clone()
			// adopted the server content in place (virtual wrapper).
			ctx.runtimeNeeded.add('drainFrag');
			mountLines.push(`    _$drainFrag(_root, __block.parentNode, __block.endMarker);`);
		}
		const rootArg = single ? '_root' : 'null';
		const args = bag.fields.map((f) => f.constExpr ?? f.local);
		if (bag.fields.length <= BAG_FACTORY_MAX) {
			ctx.runtimeNeeded.add(`bag${bag.fields.length}`);
			mountLines.push(
				`    _b = _$bag${bag.fields.length}(__s, ${rootArg}${args.length ? ', ' + args.join(', ') : ''});`,
			);
		} else {
			// Spill path — beyond the shared-factory arities: one inline literal
			// (still real values, single allocation) through the generic commit.
			ctx.runtimeNeeded.add('bagOf');
			mountLines.push(
				`    _b = _$bagOf(__s, ${rootArg}, { ${bag.fields.map((f) => `${f.name}: ${f.constExpr ?? f.local}`).join(', ')} });`,
			);
		}
		// REF MANIFEST (compiled-output plan, ref-manifest phase): bodies with
		// ref-carrying bindings stamp a module-scope constant on the scope so the
		// runtime's suspense-hide walk (detachSubtreeRefs) finds the bag fields
		// WITHOUT a key scan — flat [kind, field, elField] triads ('r' element
		// ref / 's' spread / 'f' fragment ref, whose third slot is unused).
		{
			const rm = [];
			for (const b of elementBindings) {
				if (b.kind === 'ref') {
					rm.push('r', bag.letter(`_ref$${b.id}`), bag.letter(`_el$${b.id}`));
				} else if (b.kind === 'spread') {
					rm.push('s', bag.letter(`_sp$${b.id}`), bag.letter(`_el$${b.id}`));
				} else if (b.kind === 'fragmentRef') {
					rm.push('f', bag.letter(`_fi$${b.id}`), '');
				}
			}
			if (rm.length > 0) {
				const rmName = `_rm$${ctx.nextHelperId++}`;
				ctx.hoistedHelpers.push(
					`const ${rmName} = [${rm.map((x) => JSON.stringify(x)).join(', ')}];`,
				);
				mountLines.push(`    __s.refFields = ${rmName};`);
			}
		}
		// Declare the mount locals the factory args read — patched into the
		// placeholder now that the field set is complete.
		const locals = bag.fields.filter((f) => f.local !== null).map((f) => f.local);
		const init = mountLines.indexOf(BAG_LOCALS_PLACEHOLDER);
		if (init === -1) throw new Error('octane compiler: bag locals placeholder missing');
		if (locals.length > 0) mountLines[init] = `    let ${locals.join(', ')};`;
		else mountLines.splice(init, 1);
	}

	// Update. Deferred property-writes run their diff EVERY render (it does the
	// mount-time write too); everything else diffs only on re-render (the `else`
	// branch). The deferred group has disjoint targets, so splitting it out doesn't
	// change observable order.
	const updateLines = [];
	const everyRenderLines = [];
	for (const b of elementBindings) {
		const code = emitBindingUpdate(b, bag);
		if (!code) continue;
		if (b.deferred) everyRenderLines.push(code);
		else updateLines.push(code);
	}

	// After (forBlock + ifBlock calls run on every render — they reconcile).
	//
	// Each call is tagged with its source `id` (assigned in source order during the
	// AST walk) and SORTED by it before joining. APPENDED children — fragment
	// children, or a control-flow-only body, all anchored at `__block.endMarker` —
	// are inserted in call-emission order, so grouping them by type (for→if→comp)
	// would reverse source order vs the server's source-order ssrEmit and desync
	// hydration. Sorting by source id restores DOM order. Positional children carry
	// their own `<!>` anchor, so their relative call order is irrelevant — sorting is
	// a harmless no-op for them.
	const afterCalls = [];
	const pushAfter = (id, line) => afterCalls.push({ id, line });
	// Dense per-body slot indices. Slot 0 is this body's binding bag (`__s.slots[0]`);
	// each control-flow / component / child construct gets index 1..N. The runtime
	// runs the slot calls in `afterCalls` SORTED by source id, so we assign indices in
	// that same id order — the scope's `slots` array is then written 0,1,2,… and stays
	// PACKED (a holey array, written out of order, would be a slower elements-kind).
	const allConstructs = [
		...forCalls,
		...ifCalls,
		...compCalls,
		...ctx._portalCalls,
		...tryCalls,
		...ctx._switchCalls,
	];
	allConstructs.sort((a, b) => a.id - b.id);
	// Slot 0 is the binding bag for template bodies; control-flow-only (noTemplate)
	// bodies have no bag, so their constructs start at slot 0.
	const slotBase = noTemplate ? 0 : 1;
	for (let i = 0; i < allConstructs.length; i++) allConstructs[i].slotIndex = i + slotBase;
	// Hoisted head elements take the slots AFTER the constructs (and `plan.head` runs
	// after `plan.after`), so the scope's `slots` array fills 0,1,…,N,N+1,… packed.
	const headEmit = emitHeadClient(headNodes, ctx, allConstructs.length + slotBase);
	// Is a construct's host a real in-template element (append / insert INTO it) vs
	// the block's own parentNode (insert BEFORE __block.endMarker so the slot's range
	// stays inside the block)? In-template hosts are the navigated `_el…` vars and the
	// single-root template root `_root` itself.
	const isElHost = (v) => v === '_root' || v.startsWith('_el');
	// Shared anchor selection for every construct emit (@for/@if/@switch/@try/
	// component/child slots). Three cases:
	//   - The construct has source-order siblings: the mixed-children /
	//     multi-root emit placed a `<!>` placeholder at its child index and the
	//     mount loop stashed it on the bag (`_<anchorKey>$id`) — insert BEFORE
	//     it so sibling order is preserved.
	//   - The host is the block's own parentNode (`c.elVar` resolved to
	//     `__block.parentNode` — a control-flow-only or multi-root body, never
	//     an `_el`/`_root` template var): anchor at `__block.endMarker` so the
	//     construct's content stays INSIDE the owning block's range (for-of
	//     reorder / tryBlock unmount move the slot DOM along with the block,
	//     and content never lands after later siblings).
	//   - The host is a real in-template element: no anchor — append into it
	//     (insertBefore(_, null) === appendChild).
	// Returns the anchor EXPRESSION, or null for the append case. The after-lines
	// run right after the mount/update branches where `_b` holds the committed
	// bag, so bag reads go through `_b.<letter>` (shorter than `__s.slots[0].…`).
	const anchorExprFor = (c, anchorKey) =>
		c.anchorVar
			? `_b.${bag.letter(`_${anchorKey}$${c.id}`)}`
			: !isElHost(c.elVar)
				? '__block.endMarker'
				: null;
	// Host expression for a construct's slot call — the bag-stashed host element,
	// or the block's own parentNode for bagless (control-flow-only) bodies.
	const hostExprFor = (key) => (noTemplate ? '__block.parentNode' : `_b.${bag.letter(key)}`);
	// Phase 2: a construct's env argument — the captured-locals tuple its
	// hoisted helpers destructure from `__extra`. Folded records carry a
	// pre-built `props.hN` expression (the fold threads the values through the
	// fragment renderer's props); inline records emit the identifier array.
	const envExprFor = (c) =>
		c.envExpr ?? (c.envNames && c.envNames.length ? `[${c.envNames.join(', ')}]` : null);
	for (const fc of forCalls) {
		ctx.runtimeNeeded.add('forBlock');
		const slotIndex = fc.slotIndex;
		// Control-flow-only bodies have no bag: the host is __block.parentNode directly.
		const hostExpr = hostExprFor(`_for$${fc.id}`);
		// flags: bit 0 = pure (auto-memo), bit 1 = singleRoot (skip per-item markers),
		//        bit 2 = depEligible (runtime compares deps array, upgrades to pure
		//        for survivors when deps unchanged this render),
		//        bit 3 = indexIndependent (body binds no `index` → a pure reorder
		//        that only changes a survivor's position need not re-render it).
		const flags =
			(fc.pure ? 1 : 0) |
			(fc.singleRoot ? 2 : 0) |
			(fc.depEligible ? 4 : 0) |
			(fc.indexIndependent ? 8 : 0);
		// Arg layout: forBlock(__s, slot, host, items, keyFn, body, flags?, deps?, emptyBody?, anchor?).
		// Optional args backfill positionally: `flags`/`deps` placeholders
		// (`0`/`undefined`) when only `emptyHelper` ('null' literal when no
		// `@empty` branch) or the anchor is present, and a `null` empty-body
		// placeholder when only the anchor is, so each lands at its positional
		// parameter.
		const anchorExpr = anchorExprFor(fc, 'forAnchor');
		const hasAnchor = anchorExpr !== null;
		const hasEmpty = fc.emptyHelper && fc.emptyHelper !== 'null';
		// deps doubles as the Phase 2 env tuple — emitted whenever the item/empty
		// helpers captured anything, not only for the dep-pure promotion. A deps
		// arg forces the flags placeholder too (positional alignment).
		const hasDeps = fc.depNames.length > 0;
		const flagsPart = flags || hasDeps || hasEmpty || hasAnchor ? ', ' + (flags || 0) : '';
		const depsPart = hasDeps
			? `, [${fc.depNames.join(', ')}]`
			: hasEmpty || hasAnchor
				? ', undefined'
				: '';
		const emptyPart = hasEmpty ? `, ${fc.emptyHelper}` : hasAnchor ? ', null' : '';
		const anchorPart = hasAnchor ? `, ${anchorExpr}` : '';
		pushAfter(
			fc.id,
			`  _$forBlock(__s, ${slotIndex}, ${hostExpr}, ${fc.itemsExpr}, ${fc.keyHelper}, ${fc.bodyHelper}${flagsPart}${depsPart}${emptyPart}${anchorPart});`,
		);
	}
	for (const ic of ifCalls) {
		const slotIndex = ic.slotIndex;
		const hostExpr = hostExprFor(`_ifHost$${ic.id}`);
		// Anchor selection — see anchorExprFor.
		const ifAnchor = anchorExprFor(ic, 'ifAnchor');
		const anchorArg = ifAnchor ? `, ${ifAnchor}` : '';
		const ifEnv = envExprFor(ic);
		// env is positional AFTER anchor — backfill an `undefined` anchor slot.
		const ifEnvArg = ifEnv ? (anchorArg ? `, ${ifEnv}` : `, undefined, ${ifEnv}`) : '';
		if (ic.activity) {
			ctx.runtimeNeeded.add('activityBlock');
			pushAfter(
				ic.id,
				`  _$activityBlock(__s, ${slotIndex}, ${hostExpr}, (${ic.modeExpr}), ${ic.thenHelper}${anchorArg}${ifEnvArg});`,
			);
			continue;
		}
		ctx.runtimeNeeded.add('ifBlock');
		const elseArg = ic.elseHelper || 'null';
		pushAfter(
			ic.id,
			`  _$ifBlock(__s, ${slotIndex}, ${hostExpr}, (${ic.condExpr}), ${ic.thenHelper}, ${elseArg}${anchorArg}${ifEnvArg});`,
		);
	}
	for (const cc of compCalls) {
		const slotIndex = cc.slotIndex;
		const hostExpr = hostExprFor(`_compHost$${cc.id}`);
		// Renderable `{expr}` hole — dispatch the value at runtime (component /
		// element → block; primitive → text; nullish/boolean/'' → nothing). Shares
		// the host/`<!>`-anchor resolution + hole-aware hydration walk with real
		// component calls; only the emitted runtime call differs.
		if (cc.isChild) {
			// MARKERLESS only-child renderable: append a primitive as a single Text
			// node (no `<!>`, no slot state), `setText` it inline on update — exactly
			// like a `.tsrx` only-child text binding — and fall back to `childTextHole`
			// (→ childSlot, lazy markers) only for objects / first render / mode switch.
			if (cc.onlyChildText && !noTemplate) {
				ctx.runtimeNeeded.add('setText');
				ctx.runtimeNeeded.add('childTextHole');
				const chp = `_b.${bag.letter(`_chp$${cc.id}`)}`;
				const chv = `_b.${bag.letter(`_chv$${cc.id}`)}`;
				pushAfter(
					cc.id,
					`  { const _v = (${cc.valueExpr}); const _o = _v !== null && (typeof _v === 'object' || typeof _v === 'function'); if (_o || ${chp} !== _v) { ${chp} = _v; const _t = ${chv}; if (_t != null && !_o && _v !== null) _$setText(_t, _v); else ${chv} = _$childTextHole(__s, ${slotIndex}, ${hostExpr}, _v, _t); } }`,
				);
				continue;
			}
			// Anchor expression (no leading comma; 'null' = append into an
			// in-template element host) — see anchorExprFor.
			const anchorExpr = anchorExprFor(cc, 'compAnchor') ?? 'null';
			if (noTemplate) {
				// No bag to cache on → the small `textSlot` wrapper (fast inline for a
				// primitive into a text slot; delegates to `childSlot` otherwise).
				ctx.runtimeNeeded.add('textSlot');
				const anchorArg = anchorExpr === 'null' ? '' : `, ${anchorExpr}`;
				pushAfter(
					cc.id,
					`  _$textSlot(__s, ${slotIndex}, ${hostExpr}, ${cc.valueExpr}${anchorArg});`,
				);
				continue;
			}
			// Template body: INLINE the text-hole hot path. Cache the text node
			// (`_chv`) + last value (`_chp`) on the bag and, when the value is an
			// unchanged-skippable primitive already backed by a text node, do a direct
			// `setText` — exactly like a `.tsrx` `{… as string}` text binding. Objects /
			// functions (component / element / array), the first render, and mode
			// switches go through `textHole` → the full `childSlot` — INCLUDING when
			// the value is identity-UNCHANGED: only childSlot's bail path refreshes
			// changed-context consumers below (a stable `{children}` passthrough under
			// a re-rendering Provider), so an inline identity skip would strand them.
			// Only unchanged primitives/null (no consumers possible) skip the call.
			ctx.runtimeNeeded.add('setText');
			ctx.runtimeNeeded.add('textHole');
			// When the slot has its OWN `<!>` placeholder, tell textHole/childSlot to
			// reuse it as the end marker (no second comment minted) — `ownEnd`.
			const ownEndArg = cc.anchorVar ? ', true' : '';
			const chp = `_b.${bag.letter(`_chp$${cc.id}`)}`;
			const chv = `_b.${bag.letter(`_chv$${cc.id}`)}`;
			pushAfter(
				cc.id,
				`  { const _v = (${cc.valueExpr}); const _o = _v !== null && (typeof _v === 'object' || typeof _v === 'function'); if (_o || ${chp} !== _v) { ${chp} = _v; const _t = ${chv}; if (_t != null && !_o && _v !== null) _$setText(_t, _v); else ${chv} = _$textHole(__s, ${slotIndex}, ${hostExpr}, _v, ${anchorExpr}${ownEndArg}); } }`,
			);
			continue;
		}
		// M3 inherit-range: the sole comp-call root of a `@{}` body — the slot
		// BORROWS the enclosing block's marker range (10th positional arg), so it
		// mints nothing and the server skips the child's frame pair at the same
		// site (ssrEmitComponent reads the same predicate). Supersedes lite (the
		// borrow needs a real Block behind the slot) and singleRoot (the borrow
		// already elides every marker, and hydration must NOT expect a server
		// pair). The anchor stays: it is the runtime's fallback insert position
		// when the borrow is declined (incoherent parent regime) and the probe
		// anchor for transition swaps.
		if (cc.inheritRange) {
			ctx.runtimeNeeded.add('componentSlot');
			const inheritAnchor = anchorExprFor(cc, 'compAnchor') ?? 'undefined';
			pushAfter(
				cc.id,
				`  _$componentSlot(__s, ${slotIndex}, ${hostExpr}, ${cc.compExpr}, ${cc.propsExpr}, ${inheritAnchor}, undefined, undefined, true);`,
			);
			continue;
		}
		// Design (c) lite path: hookless same-module callees with no key/spread/
		// children skip the Block/CompSlot/Comment-markers triplet but STILL pass
		// host + anchor so the callee's body inserts content INSIDE the owning
		// element (not at the parent block's range, which would put a child
		// <span> as a sibling of its parent <div>).
		if (cc.liteEligible) {
			ctx.runtimeNeeded.add('componentSlotLite');
			// Anchor — same rules as componentSlot (see anchorExprFor); the
			// endMarker case keeps the lite range inside the owning block.
			const liteAnchor = anchorExprFor(cc, 'compAnchor');
			const anchorArg = liteAnchor ? `, ${liteAnchor}` : '';
			pushAfter(
				cc.id,
				`  _$componentSlotLite(__s, ${slotIndex}, ${hostExpr}, ${cc.compExpr}, ${cc.propsExpr}${anchorArg});`,
			);
			continue;
		}
		ctx.runtimeNeeded.add('componentSlot');
		// Anchor selection — see anchorExprFor (the endMarker case keeps the
		// slot's markers inside the block's range so for-of reorder / tryBlock
		// unmount move the slot DOM along with the block; an element host with
		// no in-template anchor can safely append).
		const compAnchor = anchorExprFor(cc, 'compAnchor');
		let anchorArg = compAnchor ? `, ${compAnchor}` : '';
		// key arg is positional AFTER anchor in componentSlot's signature. When a
		// key is present but anchor isn't, supply `undefined` for the anchor slot
		// so the key lands in the right argument position — the runtime's
		// `anchor ?? null` still routes through appendChild as before.
		let keyArg = '';
		if (cc.keyExpr != null) {
			if (anchorArg === '') anchorArg = ', undefined';
			keyArg = `, (${cc.keyExpr})`;
		}
		// singleRoot is the 8th positional arg (after anchor, key). It's gated on
		// no-key, so backfill anchor + key placeholders to land it in the right
		// slot. `true` = proven same-module single-element root; `2` = the
		// cross-module sentinel (runtime checks the callee's $$singleRoot stamp).
		let singleRootArg = '';
		if (cc.singleRoot || cc.maybeSingleRoot) {
			if (anchorArg === '') anchorArg = ', undefined';
			singleRootArg = cc.singleRoot ? ', undefined, true' : ', undefined, 2';
		}
		pushAfter(
			cc.id,
			`  _$componentSlot(__s, ${slotIndex}, ${hostExpr}, ${cc.compExpr}, ${cc.propsExpr}${anchorArg}${keyArg}${singleRootArg});`,
		);
	}
	for (const pc of ctx._portalCalls) {
		const slotIndex = pc.slotIndex;
		const hostExpr = hostExprFor(`_portalHost$${pc.id}`);
		ctx.runtimeNeeded.add('portal');
		const portalEnv = envExprFor(pc);
		pushAfter(
			pc.id,
			`  _$portal(__s, ${slotIndex}, ${pc.targetExpr}, ${pc.bodyExpr}, ${pc.propsExpr}, ${hostExpr}${portalEnv ? `, ${portalEnv}` : ''});`,
		);
	}
	// Restore the outer plan's portal-call list — pairs with the save above.
	ctx._portalCalls = _prevPortalCalls;
	for (const tc of tryCalls) {
		const slotIndex = tc.slotIndex;
		const hostExpr = hostExprFor(`_tryHost$${tc.id}`);
		ctx.runtimeNeeded.add('tryBlock');
		// Anchor selection — see anchorExprFor (mirrors ifBlock, including the
		// __block.endMarker fallback for a body that is ONLY a @try).
		const tryAnchor = anchorExprFor(tc, 'tryAnchor');
		const tryAnchorArg = tryAnchor ? `, ${tryAnchor}` : '';
		const tryEnv = envExprFor(tc);
		const tryEnvArg = tryEnv ? (tryAnchorArg ? `, ${tryEnv}` : `, undefined, ${tryEnv}`) : '';
		pushAfter(
			tc.id,
			`  _$tryBlock(__s, ${slotIndex}, ${hostExpr}, ${tc.tryHelper}, ${tc.catchHelper}, ${tc.pendingHelper}${tryAnchorArg}${tryEnvArg});`,
		);
	}
	for (const sc of ctx._switchCalls) {
		const slotIndex = sc.slotIndex;
		const hostExpr = hostExprFor(`_switchHost$${sc.id}`);
		ctx.runtimeNeeded.add('switchBlock');
		// Anchor selection — see anchorExprFor (mirrors ifBlock, including the
		// __block.endMarker fallback for a body that is ONLY a @switch).
		const switchAnchor = anchorExprFor(sc, 'switchAnchor');
		const anchorArg = switchAnchor ? `, ${switchAnchor}` : '';
		const swEnv = envExprFor(sc);
		const swEnvArg = swEnv ? (anchorArg ? `, ${swEnv}` : `, undefined, ${swEnv}`) : '';
		pushAfter(
			sc.id,
			`  _$switchBlock(__s, ${slotIndex}, ${hostExpr}, (${sc.discExpr}), ${sc.casesArrayExpr}, ${sc.defaultHelper}${anchorArg}${swEnvArg});`,
		);
	}
	// Restore the outer plan's switch-call list — pairs with the save above.
	ctx._switchCalls = _prevSwitchCalls;
	// Restore the outer plan's fragment-ref pairing stack.
	if (ctx._fragRefStack && ctx._fragRefStack.length) {
		throw new Error('Unclosed <Fragment ref={…}> — FragmentStart without matching FragmentEnd');
	}
	ctx._fragRefStack = _prevFragRefStack;
	// Restore the outer plan's per-element LOC map — pairs with the save at planJsx top.
	ctx._elemLocs = _prevElemLocs;

	const updateJoined = updateLines.join('\n');
	const everyRenderJoined = everyRenderLines.join('\n');
	const afterJoined = afterCalls
		.map((c, i) => ({ ...c, i }))
		.sort((a, b) => a.id - b.id || a.i - b.i)
		.map((c) => c.line)
		.join('\n');

	return {
		// Does this body carry a binding bag (`__s.slots[0]`)? Control-flow-only
		// bodies don't → no `let _b … if (undefined) … else {}` wrapper in the
		// assembled body (the slot calls use __block.parentNode directly).
		hasBag: !noTemplate,
		mount: mountLines.join('\n'),
		update: updateJoined,
		everyRender: everyRenderJoined,
		after: afterJoined,
		head: headEmit,
		// DEV ONLY (`''` in prod → no body emission, byte-identical output): a structured
		// `{ slotIndex: [line, column] }` literal for hydration-mismatch warnings + a future
		// DevTools element→source layer. Keyed by the slot index the runtime already uses.
		locs: ctx.dev ? buildLocsLiteral(allConstructs) : '',
	};
}

/** Build the dev `__s.locs` object literal from constructs carrying a `.loc` (else ''). */
function buildLocsLiteral(constructs) {
	const entries = [];
	for (const c of constructs) {
		if (c.loc) entries.push(`${c.slotIndex}: [${c.loc[0]}, ${c.loc[1]}]`);
	}
	return entries.length ? `{ ${entries.join(', ')} }` : '';
}

// All `expr` strings get wrapped in `(…)` so ternaries / comma exprs / etc.
// don't break operator precedence in the comparisons or assignments.
// Property-write binding kinds whose mount can be DEFERRED to the every-render
// diff (when the element carries no spread — see planJsx). The mount then only
// stores the element ref + seeds the diff field(s); the diff does the write.
// Scoped to the pure value-setters: events keep their mount-time wiring (the
// event-bundle "stable bundle" hoisting is a separate, guarded optimization).
const DEFERRABLE_MOUNT_KINDS = new Set(['attr', 'class', 'style', 'formAction', 'htmlOnlyChild']);

// Per-body binding-bag registry. Fields are keyed by the historical long name
// (`_el$3`, `_prev$3`, …) but EMIT as single characters (`a`, `b`, …) — bag
// field names are object properties, so unlike locals a minifier can never
// shorten them; 1-char names are the shipped-bytes win. Each field is either
// LOCAL-backed (the mount path assigns a pre-declared `_mN` local; the runtime
// bag factory receives it positionally) or CONST-seeded (`null`/`undefined`
// seeds pass straight to the factory — no local, no mount statement).
// Registration order = mount-write order = the factory's positional args =
// the letter sequence, so `_$bagN(s, root, v0, v1, …)` builds `{a: v0, b: v1,
// …}` with every field carrying its REAL mount value. `letter()` throws for a
// field that was never mount-registered — an update/slot-call line referencing
// an unmounted field is a compiler bug, surfaced at compile time.
const BAG_LC = 'abcdefghijklmnopqrstuvwxyz';
const BAG_UC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
// Highest shared-factory arity (bag0..bag16 in the runtime); bigger bags fall
// back to `bagOf(__s, root, { … })` with an inline literal of real values.
const BAG_FACTORY_MAX = 16;
function bagLetter(i) {
	if (i < 26) return BAG_LC[i];
	if (i < 52) return BAG_UC[i - 26];
	return `f${i}`;
}
function makeBag() {
	const fields = [];
	const byKey = new Map();
	const reg = (key, constExpr) => {
		let r = byKey.get(key);
		if (r === undefined) {
			const i = fields.length;
			r = {
				key,
				// Every field gets a letter — incl. ref-carrying kinds since the
				// ref-manifest phase: the runtime's suspense-hide walk discovers
				// them through the compiled `__s.refFields` manifest, not by key
				// prefix, so nothing needs a long name anymore.
				name: bagLetter(i),
				local: constExpr === undefined ? `_m${i}` : null,
				constExpr: constExpr === undefined ? null : constExpr,
			};
			fields.push(r);
			byKey.set(key, r);
		}
		return r;
	};
	return {
		/** Mount-write target for `key` — the pre-declared local. */
		local: (key) => reg(key, undefined).local,
		/** Seed `key` with a constant expression (no local, no mount write). */
		constField: (key, expr) => {
			reg(key, expr);
		},
		/** Emitted bag property name for `key` (update/slot-call reads+writes). */
		letter: (key) => {
			const r = byKey.get(key);
			if (r === undefined) throw new Error(`octane compiler: bag field ${key} never mounted`);
			return r.name;
		},
		fields,
	};
}

// Mount for a DEFERRED property-write binding: store the element ref + seed the
// diff field to `undefined`. The every-render diff then performs the actual
// write — including on the first render, since the `undefined` seed makes its
// `_prev !== _v` guard fire, and `setAttribute(el, name, undefined)` /
// `setClassName(el, undefined)` no-op on a freshly-cloned element (so the output
// is byte-identical to the old unconditional mount write).
function emitDeferredMount(b, elVar, bag) {
	// `style` diffs on `_sty`; attr / class / formAction / htmlOnlyChild on `_prev`.
	bag.constField(b.kind === 'style' ? `_sty$${b.id}` : `_prev$${b.id}`, 'undefined');
	return `    ${bag.local(`_el$${b.id}`)} = ${elVar};`;
}

function emitBindingMount(b, elVar, bag) {
	if (b.deferred) return emitDeferredMount(b, elVar, bag);
	// `suppressHydrationWarning`: stamp a JS flag (NOT a DOM attribute) the runtime reads to
	// keep the server value + skip the warning on a hydration mismatch for this element.
	if (b.kind === 'suppress') return `    ${elVar}.__oct_suppress = true;`;
	const E = `(${b.expr})`;
	switch (b.kind) {
		case 'textOnlyChild': {
			// `htext` creates + appends the text node on a fresh mount, ADOPTS the
			// server text node when hydrating, and coerces the value itself — so the
			// mount is a bare `htext(el, _v)`. Seeding `_prev` to the client value
			// makes the first update a no-op when it matches the server text (no
			// hydration mismatch re-render).
			return `    {
      const _v = ${E};
      ${bag.local(`_txt$${b.id}`)} = _$htext(${elVar}, _v);
      ${bag.local(`_prev$${b.id}`)} = _v;
    }`;
		}
		case 'htmlOnlyChild': {
			const coerce = b.knownString ? '_v' : 'String(_v)';
			return `    {
      const _v = ${E};
      ${elVar}.innerHTML = (_v == null ? '' : ${coerce});
      ${bag.local(`_el$${b.id}`)} = ${elVar};
      ${bag.local(`_prev$${b.id}`)} = _v;
    }`;
		}
		case 'text': {
			// `elVar` is the POSITION node for this sibling text hole (resolved with
			// the hole-aware path INCLUDING childIndex — see the binding loop). On a
			// fresh mount it's the cloned template's `<!>` comment (replaced 1-for-1,
			// position-preserving — works for single AND multi-root, since the path
			// walk starts from `_root`/the cloned fragment). While hydrating it's the
			// SERVER's text node at that logical position, which htextSwap ADOPTS.
			// htextSwap coerces the value itself, so the mount is a bare call.
			return `    {
      const _v = ${E};
      ${bag.local(`_txt$${b.id}`)} = _$htextSwap(${elVar}, _v);
      ${bag.local(`_prev$${b.id}`)} = _v;
    }`;
		}
		case 'attr': {
			return `    {
      const _v = ${E};
      _$setAttribute(${elVar}, ${JSON.stringify(b.name)}, _v);
      ${bag.local(`_el$${b.id}`)} = ${elVar};
      ${bag.local(`_prev$${b.id}`)} = _v;
    }`;
		}
		case 'value':
		case 'checked':
		case 'selectValue':
		case 'defaultValue':
		case 'defaultChecked': {
			// Controlled form props: property helper, NO `_prev$` cache — the
			// helper diffs against the DOM (which the user mutates), and the
			// update must re-run every render to reassert drift (React's
			// controlled contract). Not in DEFERRABLE_MOUNT_KINDS: the mount
			// runs inside the hydration window and arms the element.
			return `    {
      _$${CONTROLLED_KIND_HELPERS[b.kind]}(${elVar}, ${E});
      ${bag.local(`_el$${b.id}`)} = ${elVar};
    }`;
		}
		case 'autoFocus': {
			// Mount-only (React ignores later autoFocus changes); the focus
			// itself fires at commit, after the tree is connected.
			return `    _$setAutoFocus(${elVar}, ${E});`;
		}
		case 'class': {
			// On SVG/MathML hosts the `className` property is read-only — fall back
			// to setAttribute. Compile-time choice, zero runtime branching.
			const setter =
				b.ns && b.ns !== 'html' ? `_$setClassAttr(${elVar}, _v)` : `_$setClassName(${elVar}, _v)`;
			return `    {
      const _v = ${E};
      ${setter};
      ${bag.local(`_el$${b.id}`)} = ${elVar};
      ${bag.local(`_prev$${b.id}`)} = _v;
    }`;
		}
		case 'style': {
			return `    {
      const _v = ${E};
      _$setStyle(${elVar}, _v, undefined);
      ${bag.local(`_el$${b.id}`)} = ${elVar};
      ${bag.local(`_sty$${b.id}`)} = _v;
    }`;
		}
		case 'spread': {
			// Detach a spread-supplied `ref` on unmount. setSpread attaches/updates
			// the ref during mount/update, but only a scope cleanup can detach it
			// when the element unmounts — read the final spread value's ref and
			// queue its React-19 cleanup-return (or null call) for commit
			// (queueRefDetach: unmount cleanups run mid-render, and a state-setter
			// ref firing null synchronously can render before a replacement
			// element's deferred attach — commit-phase detach batches the two).
			// The cleanup closure reads the bag through the captured `_b` — the bag
			// exists by the time any cleanup runs (committed at mount end), and the
			// `_sp$` field is re-written by updates, so the read must be live.
			return `    {
      const _v = ${E};
      _$setSpread(${elVar}, _v, undefined, __s);
      ${bag.local(`_el$${b.id}`)} = ${elVar};
      ${bag.local(`_sp$${b.id}`)} = _v;
      __s.cleanups.push(() => { const _sp = _b.${bag.letter(`_sp$${b.id}`)}; if (_sp != null && _sp.ref != null) _$queueRefDetach(_sp.ref, _b.${bag.letter(`_el$${b.id}`)}); });
    }`;
		}
		case 'event': {
			return `    ${bag.local(`_el$${b.id}`)} = ${elVar};
    ${elVar}[${JSON.stringify(b.slotKey)}] = (${b.expr});`;
		}
		case 'formAction': {
			// <form action={fn}> / <button formAction={fn}>: wire the submit handler
			// (or fall back to the native attribute for string values). Diffed by
			// function identity on update.
			return `    {
      const _v = ${E};
      _$setFormAction(${elVar}, ${JSON.stringify(b.name)}, _v, undefined);
      ${bag.local(`_el$${b.id}`)} = ${elVar};
      ${bag.local(`_prev$${b.id}`)} = _v;
    }`;
		}
		case 'event-bundle': {
			// 3b (docs/compiled-output-optimization-plan.md): ONE shared-helper call
			// builds the `{ fn, args }` descriptor, assigns the element's event slot,
			// and returns the descriptor — the ONLY bag field this binding needs (the
			// update path mutates the descriptor in place; dispatch reads `el[key]`
			// per event, so the mutation is observed without re-assignment).
			const n = b.argExprs.length;
			const argsPart = b.argExprs.map((e) => `, (${e})`).join('');
			if (n <= 2) {
				return `    ${bag.local(`_ev$${b.id}`)} = _$evt${n}(${elVar}, ${JSON.stringify(b.slotKey)}, (${b.fnExpr})${argsPart});`;
			}
			return `    ${bag.local(`_ev$${b.id}`)} = _$evtN(${elVar}, ${JSON.stringify(b.slotKey)}, (${b.fnExpr}), [${b.argExprs.map((e) => `(${e})`).join(', ')}]);`;
		}
		case 'ref': {
			// attachRef handles all three supported shapes: callback (function),
			// object (set .current), and array (recursively attach each). Register
			// a scope cleanup so unmount detaches with null (React parity).
			// The attach is DEFERRED via queueRefAttach so it runs at commit, after
			// the subtree is inserted into the document — a callback ref then sees a
			// connected node and ref.current is set before layout effects run
			// (React-19 commit-phase ref timing). The unmount detach is DEFERRED too
			// (queueRefDetach, drained at commit before that commit's attaches):
			// cleanups run mid-render, and a state-setter ref firing null
			// synchronously can render before a replacement element's attach —
			// commit-phase detach lands null + new element in the same batch. The
			// bound element rides along as the cleanup target, so a callback ref
			// shared across elements (ref={registerItem} on every @for row)
			// releases ITS row's React-19 cleanup, not another row's.
			// Both deferred closures read through the captured `_b` (committed by the
			// time attach/cleanup run); `_ref$` must be a LIVE read — updates re-point it.
			return `    {
      const _r = (${b.expr});
      ${bag.local(`_ref$${b.id}`)} = _r;
      ${bag.local(`_el$${b.id}`)} = ${elVar};
      _$queueRefAttach(__s, () => _$attachRef(_r, _b.${bag.letter(`_el$${b.id}`)}));
      __s.cleanups.push(() => _$queueRefDetach(_b.${bag.letter(`_ref$${b.id}`)}, _b.${bag.letter(`_el$${b.id}`)}));
    }`;
		}
		case 'fragmentRef': {
			// <Fragment ref={r}>…</Fragment> — markers are two Comment nodes
			// emitted directly into the parent template HTML (<!--frag--> /
			// <!--/frag-->), already walked into elVar (start) and b.endElVar
			// (end). mountFragmentRef builds the FragmentInstance, attaches
			// the user's ref, and registers a single cleanup that detaches
			// the ref + destroys the instance on unmount.
			return `    {
      const _r = (${b.expr});
      ${bag.local(`_fi$${b.id}`)} = _$mountFragmentRef(__s, ${elVar}, ${b.endElVar}, _r);
    }`;
		}
	}
	return '';
}

function emitBindingUpdate(b, bag) {
	const E = `(${b.expr})`;
	// 1-char bag field names (see makeBag) — resolved from the same registry the
	// mount pass registered them in; an unmounted field throws at compile time.
	const F = (prefix) => `_b.${bag.letter(`${prefix}$${b.id}`)}`;
	switch (b.kind) {
		case 'textOnlyChild':
		case 'text': {
			return `    { const _v = ${E}; if (${F('_prev')} !== _v) { _$setText(${F('_txt')}, _v); ${F('_prev')} = _v; } }`;
		}
		case 'htmlOnlyChild': {
			const coerce = b.knownString ? '_v' : 'String(_v)';
			return `    { const _v = ${E}; if (${F('_prev')} !== _v) { ${F('_el')}.innerHTML = (_v == null ? '' : ${coerce}); ${F('_prev')} = _v; } }`;
		}
		case 'attr': {
			return `    { const _v = ${E}; if (${F('_prev')} !== _v) { _$setAttribute(${F('_el')}, ${JSON.stringify(b.name)}, _v); ${F('_prev')} = _v; } }`;
		}
		case 'value':
		case 'checked':
		case 'selectValue':
		case 'defaultValue':
		case 'defaultChecked': {
			// Deliberately UNGUARDED (no `_prev$` compare): a controlled prop
			// reasserts on every commit — the helper's DOM-diff makes an
			// unchanged value free, and a prev-guard would skip exactly the
			// "unrelated re-render while the DOM drifted" reassert case.
			return `    _$${CONTROLLED_KIND_HELPERS[b.kind]}(${F('_el')}, ${E});`;
		}
		case 'class': {
			const setter =
				b.ns && b.ns !== 'html'
					? `_$setClassAttr(${F('_el')}, _v)`
					: `_$setClassName(${F('_el')}, _v)`;
			return `    { const _v = ${E}; if (${F('_prev')} !== _v) { ${setter}; ${F('_prev')} = _v; } }`;
		}
		case 'style': {
			// Object styles need per-prop diffing — call setStyle even when the
			// reference is unchanged it'd just no-op via the internal diff. We DO
			// skip identity matches to avoid the call overhead.
			return `    { const _v = ${E}; if (${F('_sty')} !== _v) { _$setStyle(${F('_el')}, _v, ${F('_sty')}); ${F('_sty')} = _v; } }`;
		}
		case 'spread': {
			// setSpread does its own per-key diffing internally and handles cleanup
			// of keys that vanished — always call it, but skip if the reference is
			// identical (the user opted-in to a stable object).
			// `__s` rides along on updates too so a spread-supplied ref's attach is
			// deferred to commit (after all queued detaches) — same phasing as the
			// direct `ref` binding above.
			return `    { const _v = ${E}; if (${F('_sp')} !== _v) { _$setSpread(${F('_el')}, _v, ${F('_sp')}, __s); ${F('_sp')} = _v; } }`;
		}
		case 'event': {
			return `    ${F('_el')}[${JSON.stringify(b.slotKey)}] = (${b.expr});`;
		}
		case 'formAction': {
			return `    { const _v = ${E}; if (${F('_prev')} !== _v) { _$setFormAction(${F('_el')}, ${JSON.stringify(b.name)}, _v, ${F('_prev')}); ${F('_prev')} = _v; } }`;
		}
		case 'event-bundle': {
			// 3b: mutate the mount-built descriptor in place — branch-free (two
			// plain field writes cost less than the old compare + rebuild +
			// re-assign, and keyed-list survivors were already skipped one level
			// up by the pure/deps short-circuit).
			const n = b.argExprs.length;
			const argsPart = b.argExprs.map((e) => `, (${e})`).join('');
			if (n <= 2) {
				return `    _$evt${n}u(${F('_ev')}, (${b.fnExpr})${argsPart});`;
			}
			return `    _$evtNu(${F('_ev')}, (${b.fnExpr}), [${b.argExprs.map((e) => `(${e})`).join(', ')}]);`;
		}
		case 'ref': {
			// Ref expression identity may change across renders. React 19: detach
			// the PRIOR ref fully before attaching the new one — for an object ref
			// that clears `.current`; for a callback ref that runs its returned
			// cleanup (or calls it with null). attachRef routes functions/objects/
			// arrays to the right detach path. BOTH halves are deferred to commit
			// (queueRefDetach / queueRefAttach): all of a commit's detaches drain
			// before its attaches — React's mutation→layout phasing — so a ref
			// HOPPING between two elements in one render (refs-test.js:62) ends on
			// the new element no matter which element's binding updates first
			// (inline pairs ran attach-then-later-detach across bindings, nulling
			// the hopped ref). The outer `_r !== _b._ref$` guard already prevents
			// re-firing a stable ref, so this never double-invokes an unchanged
			// callback ref.
			return `    {
      const _r = (${b.expr});
      if (_r !== ${F('_ref')}) {
        const _old = ${F('_ref')};
        if (_old != null) _$queueRefDetach(_old, ${F('_el')});
        if (_r != null) _$queueRefAttach(__s, () => _$attachRef(_r, ${F('_el')}));
        ${F('_ref')} = _r;
      }
    }`;
		}
		case 'fragmentRef': {
			// A changing `<Fragment ref={…}>` expression must detach the old ref and
			// re-point the new one at the SAME (persistent) FragmentInstance. Both
			// halves defer to commit (detaches drain before attaches) — same phasing
			// as element refs, so a ref hopping between fragments never ends null.
			// _currentRef (read by the mount cleanup) is updated NOW so unmount
			// detaches the new ref.
			return `    {
      const _r = (${b.expr});
      const _fi = ${F('_fi')};
      if (_fi && _r !== _fi._currentRef) {
        if (_fi._currentRef != null) _$queueRefDetach(_fi._currentRef, _fi);
        if (_r != null) _$queueRefAttach(__s, () => _$attachRef(_r, _fi));
        _fi._currentRef = _r;
      }
    }`;
		}
	}
	return '';
}

// ===========================================================================
// HTML emission
// ===========================================================================

function emitNodeHtml(
	node,
	path,
	bindings,
	forCalls,
	ifCalls,
	compCalls,
	tryCalls,
	ctx,
	componentName,
	inlinedSubs,
	parentNs = 'html',
	cssHash = null,
) {
	if (node.type === 'Text') {
		if (isKnownStringExpression(node.expression, ctx.knownStringLocals)) {
			bindings.push({
				id: bindings.length,
				kind: 'text',
				expr: printExpr(resolveStyleExpr(node.expression, cssHash)),
				knownString: true,
				path: path.slice(0, -1),
				childIndex: path[path.length - 1],
			});
			return '<!>';
		}
		// Bare `{expr}` (no string cast) → RENDERABLE hole at a top-level / multi-
		// root position. Host is the parent (the dropped last path segment), anchor
		// is this node's `<!>` slot.
		const ch = makeChildCall(node.expression, ctx, componentName, inlinedSubs, cssHash);
		ch.hostPath = path.slice(0, -1);
		ch.anchorPath = path;
		compCalls.push(ch);
		return '<!>';
	}
	// `{createPortal(...)}` / a JSX-bearing ternary / a `.map()` etc. at a top-level
	// or fragment-root position (no enclosing host element). The element-child loop
	// lowers `{createPortal(...)}` to a `portal()` fast path because it HAS a host to
	// stamp; here there's none, so route the value through the de-opt childSlot hole
	// (the TSRX-aware printer preserves the createPortal call → the runtime renders
	// the PortalDescriptor; any inner JSX lowers to createElement). Without this a
	// top-level rich hole compiled to nothing.
	if (node.type === 'TSRXExpression') {
		const ch = makeChildCall(node.expression, ctx, componentName, inlinedSubs, cssHash);
		ch.hostPath = path.slice(0, -1);
		ch.anchorPath = path;
		compCalls.push(ch);
		return '<!>';
	}
	// Top-level <Fragment ref={…}> — the wrapping <octane-frag> (multi-root)
	// is the parent in this scope, so the marker pair lives at the supplied
	// path. Pairing uses ctx._fragRefStack, saved/restored by planJsx so
	// nested plans never share state.
	if (node.type === 'FragmentStart') {
		const b = {
			id: bindings.length,
			kind: 'fragmentRef',
			expr: printExprWithTsrx(node.refExpr, ctx, componentName, inlinedSubs),
			path,
			endPath: null,
		};
		bindings.push(b);
		(ctx._fragRefStack ??= []).push(b);
		return '<!--frag-->';
	}
	if (node.type === 'FragmentEnd') {
		const b = (ctx._fragRefStack ??= []).pop();
		if (!b) throw new Error('FragmentEnd without matching FragmentStart');
		b.endPath = path;
		return '<!--/frag-->';
	}
	if (node.type === 'Element')
		return emitElementHtml(
			node,
			path,
			bindings,
			forCalls,
			ifCalls,
			compCalls,
			tryCalls,
			ctx,
			componentName,
			inlinedSubs,
			parentNs,
			cssHash,
		);
	if (node.type === 'Literal' && typeof node.value === 'string') return escapeHtml(node.value);
	// Top-level control-flow — register as a call hosted on the body's parent.
	// When planJsx passed a non-empty `path` (a multi-root body with static
	// template siblings), the construct emits a `<!>` anchor at its child index
	// and records it as `anchorPath`, so the runtime block inserts BEFORE it —
	// preserving source order between static roots, exactly like the in-element
	// mixed-children path. With an empty path (control-flow-only body) it emits
	// no HTML and anchors at `__block.endMarker` (see anchorExprFor).
	const anchored = path.length > 0;
	const registerConstruct = (rec, list) => {
		rec.hostPath = [];
		if (anchored) rec.anchorPath = path;
		list.push(rec);
		return anchored ? '<!>' : '';
	};
	if (node.type === 'IfStatement') {
		return registerConstruct(makeIfCall(node, ctx, inlinedSubs, parentNs, cssHash), ifCalls);
	}
	if (node.type === 'ActivityStatement') {
		return registerConstruct(makeActivityCall(node, ctx, inlinedSubs, parentNs, cssHash), ifCalls);
	}
	if (node.type === 'ForOfStatement') {
		return registerConstruct(makeForCall(node, ctx, inlinedSubs, parentNs, cssHash), forCalls);
	}
	if (node.type === 'TryStatement') {
		return registerConstruct(makeTryCall(node, ctx, inlinedSubs, parentNs, cssHash), tryCalls);
	}
	if (node.type === 'SwitchStatement') {
		return registerConstruct(
			makeSwitchCall(node, ctx, inlinedSubs, parentNs, cssHash),
			ctx._switchCalls,
		);
	}
	return '';
}

function emitElementHtml(
	node,
	path,
	bindings,
	forCalls,
	ifCalls,
	compCalls,
	tryCalls,
	ctx,
	componentName,
	inlinedSubs,
	parentNs = 'html',
	cssHash = null,
) {
	// DEV: record this element's source position keyed by its template path, so the binding
	// mount loop can stamp `<el>.__oct_loc` on bound elements (hydration-mismatch warnings on
	// param-less value sites + a future DevTools layer). Keyed identically to `binding.path`.
	if (ctx._elemLocs) ctx._elemLocs.set(JSON.stringify(path), devLoc(ctx, node));
	// If the tag is a component (uppercase ident or MemberExpression), don't emit
	// HTML — register a componentSlot call instead. Components don't change
	// template namespace context; their bodies are compiled separately.
	if (isComponentTag(node)) {
		const cc = makeCompCall(
			node,
			ctx,
			componentName,
			inlinedSubs,
			bindings,
			forCalls,
			ifCalls,
			compCalls,
			parentNs,
			cssHash,
		);
		// A component root in a MIXED multi-root body (planJsx passed a non-empty
		// `path`) emits a `<!>` anchor at its source-order position, so componentSlot
		// inserts BEFORE it — preserving order against static template siblings.
		// Mirrors the in-element mixed-children path and the control-flow root path.
		// With an empty path (a sole/all-component body) it contributes no HTML and
		// appends at `__block.endMarker`.
		if (path.length > 0) {
			cc.hostPath = path.slice(0, -1);
			cc.anchorPath = path;
			compCalls.push(cc);
			return '<!>';
		}
		cc.hostPath = path;
		compCalls.push(cc);
		return ''; // no HTML
	}

	const tag = node.id?.name || node.openingElement?.name?.name;
	if (!tag) throw new Error('Element without tag');
	rejectVoidElementContent(tag, node, ctx);
	rejectTextareaValueChildren(tag, node, ctx);

	// The host element's own namespace (e.g. `<svg>` is in SVG ns even if its
	// parent context is HTML); its descendants' inherited ns may differ
	// (`<foreignObject>` is SVG-ns but its children are HTML).
	const hostNs = nsForSelf(tag, parentNs);
	const childNs = nsForChildren(tag, parentNs);

	// Collect attributes.
	const attrs = node.attributes || node.openingElement?.attributes || [];
	// React convention: later attributes win on collision. If ANY spread is
	// present, attributes that come AFTER the first spread can't be inlined
	// into the template HTML (the spread would clobber them at runtime) —
	// emit them as bindings in source order instead.
	const firstSpreadIdx = attrs.findIndex(
		(a) => a.type === 'SpreadAttribute' || a.type === 'JSXSpreadAttribute',
	);
	let attrHtml = '';
	let sawRef = false;
	for (let attrI = 0; attrI < attrs.length; attrI++) {
		const attr = attrs[attrI];
		// `<div {...props}/>` — runtime spread. Emits one setSpread binding that
		// routes each key (class / style / on… / attr / ref) and diffs against
		// the prior spread object to clear removed keys.
		if (attr.type === 'SpreadAttribute' || attr.type === 'JSXSpreadAttribute') {
			const expr = printExprWithTsrx(attr.argument, ctx, componentName, inlinedSubs);
			bindings.push({ id: bindings.length, kind: 'spread', expr, path, ns: hostNs });
			continue;
		}
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
		const rawAttrName = jsxAttrRawName(attr);
		// `key` on a regular element:
		//   - inside @for: consumed by the keyFn (keyed reconciliation drives
		//     this).
		//   - on a standalone component: extracted in makeCompCall and threaded
		//     into componentSlot for key-driven remount (React parity).
		//   - on a regular DOM element ELSEWHERE: silent no-op. DOM elements
		//     have no hook state, no scope, and no refs that aren't already
		//     handled by the binding update path. Re-cloning the template would
		//     be strictly more work than the in-place diff. To force a
		//     teardown+remount, wrap the element in a 1-line fn component and
		//     put `key=` on that — the component slot will honour the key.
		if (rawAttrName === 'key') continue;
		// `suppressHydrationWarning` (React shallow semantics): NEVER a DOM attribute (not
		// serialized client or server) — stamp a JS flag the runtime's hydration-mismatch
		// paths read, so a server/client divergence on this element keeps the server value
		// and skips the warning. Bare or `={true}`/`={expr}` opts in; only `={false}` doesn't.
		if (rawAttrName === 'suppressHydrationWarning') {
			const v = attr.value;
			const inner = v && v.type === 'JSXExpressionContainer' ? v.expression : v;
			const isFalse = inner && inner.type === 'Literal' && inner.value === false;
			if (!isFalse) bindings.push({ id: bindings.length, kind: 'suppress', path });
			continue;
		}
		const attrName = normalizeJsxAttrName(rawAttrName, tag);

		const val = attr.value;
		// If this attr comes AFTER a spread, we MUST emit as a binding (later wins).
		const isAfterSpread = firstSpreadIdx !== -1 && attrI > firstSpreadIdx;

		// Attribute-level `ref={expr}` (new TSRX) — replaces the removed
		// `{ref expr}` child intrinsic. Routes to the existing `kind: 'ref'`
		// binding emit, which handles both object refs ({ current } pattern)
		// and callback refs ((el) => …). The array form `ref={[a, b]}` is
		// the canonical way to attach multiple refs to the same element —
		// attachRef in the runtime iterates the array. Repeating `ref=` on
		// the same element is rejected here: it's an authoring footgun
		// (which ref wins? do both attach? in what order?) and the array
		// form expresses the same intent unambiguously.
		if (attrName === 'ref' && val) {
			if (sawRef) {
				throw new Error(
					'Element has multiple `ref={…}` attributes; an element may have ' +
						'at most one. Use a single array-valued ref to attach multiple, ' +
						'e.g. `ref={[a, b]}` (attachRef in the runtime iterates the array).',
				);
			}
			sawRef = true;
			const refInner = val.type === 'JSXExpressionContainer' ? val.expression : val;
			bindings.push({
				id: bindings.length,
				kind: 'ref',
				expr: printExpr(refInner),
				path,
			});
			continue;
		}
		// React-style raw HTML: `dangerouslySetInnerHTML={{ __html: expr }}`. When the
		// element has no other children (and no spread that could clobber it), take the
		// `htmlOnlyChild` fast path on the extracted `__html` expression. Otherwise pass
		// the `{__html}` object through a regular attr binding; the runtime's
		// `dangerouslySetInnerHTML` property path reads `.__html` and sets innerHTML.
		if (attrName === 'dangerouslySetInnerHTML' && val) {
			const obj = val.type === 'JSXExpressionContainer' ? val.expression : val;
			const noChildren =
				(node.children || []).length === 0 || normalizeChildren(node.children || []).length === 0;
			if (noChildren && !isAfterSpread) {
				bindings.push({
					id: bindings.length,
					kind: 'htmlOnlyChild',
					expr: printExpr(dangerHtmlExpr(obj)),
					path,
				});
				continue;
			}
			bindings.push({
				id: bindings.length,
				kind: 'attr',
				name: 'dangerouslySetInnerHTML',
				expr: printExprWithTsrx(obj, ctx, componentName, inlinedSubs),
				path,
				ns: hostNs,
			});
			continue;
		}

		// Controlled form props ALWAYS compile to property bindings — static
		// literals and bare booleans (`<input checked/>`) included; nothing
		// bakes into the template HTML (see controlledKindFor).
		const ctlKind = controlledKindFor(tag, attrName);
		if (ctlKind !== null) {
			let ctlExpr;
			if (val == null) {
				ctlExpr = 'true';
			} else {
				const ctlInner = val.type === 'JSXExpressionContainer' ? val.expression : val;
				ctlExpr = printExprWithTsrx(ctlInner, ctx, componentName, inlinedSubs);
			}
			bindings.push({ id: bindings.length, kind: ctlKind, expr: ctlExpr, path, ns: hostNs });
			continue;
		}
		// `autoFocus` never bakes/writes an attribute — React parity: the
		// runtime focuses the element in its mount commit (setAutoFocus).
		if (attrName === 'autoFocus' && !tag.includes('-')) {
			bindings.push({
				id: bindings.length,
				kind: 'autoFocus',
				expr:
					val == null
						? 'true'
						: printExprWithTsrx(
								val.type === 'JSXExpressionContainer' ? val.expression : val,
								ctx,
								componentName,
								inlinedSubs,
							),
				path,
				ns: hostNs,
			});
			continue;
		}

		if (val == null) {
			if (isAfterSpread) {
				// Boolean attr after spread → emit as `true` binding.
				bindings.push({
					id: bindings.length,
					kind: 'attr',
					name: attrName,
					expr: 'true',
					path,
					ns: hostNs,
				});
			} else {
				attrHtml += ` ${attrName}`;
			}
			continue;
		}
		let inner = val.type === 'JSXExpressionContainer' ? val.expression : val;
		// `{style ('cls')}` in attribute position — resolve to a class string
		// (literal or runtime concat) before any further handling.
		inner = resolveStyleExpr(inner, cssHash);

		// `style={...}` — static literal object/string serialises into the HTML
		// template (unless we're after a spread, which would clobber it); dynamic
		// values become a setStyle binding.
		if (attrName === 'style') {
			if (!isAfterSpread && inner.type === 'Literal' && typeof inner.value === 'string') {
				attrHtml += ` style="${escapeAttr(inner.value)}"`;
				continue;
			}
			if (!isAfterSpread && inner.type === 'ObjectExpression' && objectExprIsStaticLiteral(inner)) {
				const css = staticObjectToCssString(inner);
				if (css) attrHtml += ` style="${escapeAttr(css)}"`;
				continue;
			}
			const expr = printExprWithTsrx(inner, ctx, componentName, inlinedSubs);
			bindings.push({ id: bindings.length, kind: 'style', expr, path, ns: hostNs });
			continue;
		}

		// Static literal value? Inline into HTML — UNLESS we're after a spread,
		// in which case we MUST emit as a binding so source order is preserved.
		// bakeStaticAttr applies the shared React-parity value tables (aria-*/
		// enumerated/data-* booleans stringify, boolean attrs canonicalize to
		// `attr=""`/absent, booleans on non-boolean attrs drop).
		if (inner.type === 'Literal' && !isAfterSpread) {
			attrHtml += bakeStaticAttr(attrName, inner.value, tag);
			continue;
		}

		// Dynamic value — record a binding. (Also reached for literal values that
		// come after a spread, since those need to win over the spread at runtime.)
		const expr = printExprWithTsrx(inner, ctx, componentName, inlinedSubs);
		if (isEventAttrName(attrName)) {
			// React-shape: a trailing `Capture` selects the capture phase (fired
			// root→target before bubble handlers), stamped under `$$capture:<type>`.
			// The real events gotpointercapture / lostpointercapture literally end in
			// "capture", so they're excluded from the suffix rule.
			let rest = attrName.slice(2);
			let capture = false;
			if (
				rest.length > 7 &&
				rest.endsWith('Capture') &&
				attrName !== 'onGotPointerCapture' &&
				attrName !== 'onLostPointerCapture'
			) {
				capture = true;
				rest = rest.slice(0, -7);
			}
			const eventName = rest === 'DoubleClick' ? 'dblclick' : rest.toLowerCase();
			const slotKey = capture ? `$$capture:${eventName}` : `$$${eventName}`;
			if (capture) ctx.capturedEvents.add(eventName);
			else ctx.delegatedEvents.add(eventName);
			// Hot-path optimisation: `() => fn(arg, …)` arrows with zero params get
			// compiled to a `{ fn, args }` bundle so the runtime can identity-diff
			// fn + each arg and skip the property reassignment when nothing
			// changed. Huge win for keyed-list survivors whose item refs are
			// unchanged (e.g. js-framework-benchmark swap rows).
			const bundleInfo = detectStableEventBundle(inner);
			if (bundleInfo) {
				bindings.push({
					id: bindings.length,
					kind: 'event-bundle',
					path,
					eventName,
					slotKey,
					ns: hostNs,
					fnExpr: printExprWithTsrx(bundleInfo.callee, ctx, componentName, inlinedSubs),
					argExprs: bundleInfo.args.map((a) =>
						printExprWithTsrx(a, ctx, componentName, inlinedSubs),
					),
				});
			} else {
				bindings.push({
					id: bindings.length,
					kind: 'event',
					expr,
					path,
					eventName,
					slotKey,
					ns: hostNs,
				});
			}
		} else if (attrName === 'class') {
			// (`className` was already normalized to `class` above.)
			bindings.push({ id: bindings.length, kind: 'class', expr, path, ns: hostNs });
		} else if (
			(tag === 'form' && attrName === 'action') ||
			((tag === 'button' || tag === 'input') &&
				(attrName === 'formAction' || attrName === 'formaction'))
		) {
			// React 19 function action: a DYNAMIC `<form action={fn}>` /
			// `<button formAction={fn}>` is routed to setFormAction, which intercepts
			// submit and calls the function with FormData (string values fall back to
			// the native attribute at runtime). Static string actions were already
			// inlined into the HTML above via the literal path.
			bindings.push({
				id: bindings.length,
				kind: 'formAction',
				name: tag === 'form' ? 'action' : 'formaction',
				expr,
				path,
				ns: hostNs,
			});
		} else {
			bindings.push({ id: bindings.length, kind: 'attr', name: attrName, expr, path, ns: hostNs });
		}
	}

	const isVoid = VOID_ELEMENTS.has(tag) && (node.children || []).length === 0;
	if (isVoid) {
		return `<${tag}${attrHtml}/>`;
	}

	let html = `<${tag}${attrHtml}>`;

	const children = normalizeChildren(node.children || [], childNs === 'svg');
	// Special case: a single Text child (only-child text fast path).
	if (children.length === 1 && children[0].type === 'Text') {
		const txtChild = children[0];
		const staticLit = staticTextLiteral(txtChild.expression);
		if (staticLit !== null) {
			// Static string-literal text (JSXText or `{'literal'}`) bakes directly
			// into the template HTML — no `htext` mount, no `setText` binding, and a
			// byte-for-byte match with the server's `<el>text</el>` so hydration
			// adopts it for free. (Sole child → no sibling childIndex / text-node
			// merge concerns; mirrors the server `Literal` fast path.)
			html += escapeHtml(staticLit);
		} else if (isKnownStringExpression(txtChild.expression, ctx.knownStringLocals)) {
			bindings.push({
				id: bindings.length,
				kind: 'textOnlyChild',
				expr: printExpr(resolveStyleExpr(txtChild.expression, cssHash)),
				knownString: true,
				path,
			});
			// The element stays empty in the template — runtime appends a Text node.
		} else {
			// Bare `{expr}` (no string cast) → RENDERABLE hole. As the host's SOLE
			// child it lowers MARKERLESS: a primitive value is appended as a single
			// Text node (like `htext`), with NO `<!>` placeholder + no slot state —
			// matching the `.tsrx` only-child text path. Only an object/function value
			// (component / element / array) lazily mints markers via childSlot. The
			// runtime `childTextHole` owns that branch; the server emits `ssrChildText`
			// (markerless text for a primitive, a `<!--[-->…<!--]-->` block otherwise),
			// so hydration adopts either shape.
			const ch = makeChildCall(txtChild.expression, ctx, componentName, inlinedSubs, cssHash);
			ch.hostPath = path;
			ch.onlyChildText = true;
			compCalls.push(ch);
		}
	} else {
		// Mixed children — walk them in order.
		let childIdx = 0;
		// Whether the PREVIOUS emitted child was a baked static-text literal. Two
		// adjacent baked text nodes collapse into a single DOM text node (the HTML
		// parser merges them) — so a static text following another baked text FOLDS
		// into the same run: emitted into the template but consuming no new
		// childIndex, exactly mirroring the server's merged one-chunk emission.
		let prevBakedText = false;
		// Text-adjacency classification of every child (see textAdjacencyKind):
		// a dynamic text hole with a text-producing neighbour is where the server
		// emits a `<!-- -->` separator, so its binding is flagged `adjacentText`
		// and the template's hydration walk switches to the hole-aware
		// child/sibling navigators (which understand separators).
		const adjKinds = children.map((c) => textAdjacencyKind(c, ctx));
		// Stack of in-flight fragmentRef bindings: each FragmentStart pushes a
		// binding (path captured); the matching FragmentEnd pops and patches in
		// the endPath. Stacked so nested <Fragment ref={…}> pairs cleanly.
		const fragRefStack = [];
		// When EVERY child is a component, each can APPEND to the host in source
		// order instead of inserting before its own `<!>` placeholder — there's no
		// static/template sibling to sit in front of, so appending lands them right
		// (componentSlot/Lite with no anchor → appendChild). Restricted to the
		// all-component case so hydration's adopt cursor can simply descend into the
		// host's child stream (host.firstChild); mixed static+component children keep
		// their placeholders, where the cursor would otherwise mis-track.
		let allComponentChildren = children.length > 0;
		for (const c of children) {
			if (!(c.type === 'Element' && isComponentTag(c))) {
				allComponentChildren = false;
				break;
			}
		}
		for (let childI = 0; childI < children.length; childI++) {
			const child = children[childI];
			const prevBaked = prevBakedText;
			prevBakedText = false;
			if (child.type === 'FragmentStart') {
				const b = {
					id: bindings.length,
					kind: 'fragmentRef',
					expr: printExprWithTsrx(child.refExpr, ctx, componentName, inlinedSubs),
					path: [...path, childIdx],
					endPath: null,
				};
				bindings.push(b);
				fragRefStack.push(b);
				html += '<!--frag-->';
				childIdx++;
				continue;
			}
			if (child.type === 'FragmentEnd') {
				const b = fragRefStack.pop();
				if (!b) throw new Error('FragmentEnd without matching FragmentStart');
				b.endPath = [...path, childIdx];
				html += '<!--/frag-->';
				childIdx++;
				continue;
			}
			if (child.type === 'Text') {
				const staticLit = staticTextLiteral(child.expression);
				if (staticLit === '') {
					// Renders nothing: bake nothing and consume no childIndex (an empty
					// text produces NO node when the template HTML is parsed, so counting
					// it would desync every later sibling's path). Stays transparent to
					// text adjacency — the server's ssrEmitNodes skips it the same way.
					prevBakedText = prevBaked;
					continue;
				}
				if (staticLit !== null) {
					// Static literal → bake into the template HTML (no binding). When the
					// PREVIOUS emitted child was also baked text the parser merges the two
					// into a single DOM text node, so FOLD: emit the text without
					// consuming a new childIndex — matching the server, which serializes
					// a static run as one merged chunk with no separator.
					html += escapeHtml(staticLit);
					prevBakedText = true;
					if (!prevBaked) childIdx++;
				} else if (isKnownStringExpression(child.expression, ctx.knownStringLocals)) {
					bindings.push({
						id: bindings.length,
						kind: 'text',
						expr: printExpr(resolveStyleExpr(child.expression, cssHash)),
						knownString: true,
						path,
						childIndex: childIdx,
						// A text-producing neighbour → the server emits a `<!-- -->`
						// separator here; the walk must be hole-aware (see hasHoles).
						adjacentText: hasTextNeighbor(adjKinds, childI),
					});
					html += '<!>'; // placeholder we'll replace at mount
					childIdx++;
				} else {
					// Bare `{expr}` (no string cast) → RENDERABLE hole (component /
					// element / children-fn render; primitive → text; nullish/boolean →
					// nothing). Same `<!>` anchor + host as a component child.
					const ch = makeChildCall(child.expression, ctx, componentName, inlinedSubs, cssHash);
					ch.hostPath = path;
					ch.anchorPath = [...path, childIdx];
					compCalls.push(ch);
					html += '<!>';
					childIdx++;
				}
			} else if (child.type === 'Element') {
				if (isComponentTag(child)) {
					const cc = makeCompCall(
						child,
						ctx,
						componentName,
						inlinedSubs,
						bindings,
						forCalls,
						ifCalls,
						compCalls,
						childNs,
						cssHash,
					);
					cc.hostPath = path;
					if (allComponentChildren) {
						// All-component children: append to the host in source order (no
						// `<!>` placeholder, no anchor). Hydration adopts from the cursor
						// descending into the host (see componentSlot/Lite).
						compCalls.push(cc);
					} else {
						// Emit a `<!>` anchor at the component's source-order position so
						// componentSlot inserts BEFORE this anchor — preserving sibling
						// order when a Component appears before static-element/text
						// siblings. Without this, the slot's start/end markers get
						// appended to the parent host AFTER the static template content.
						cc.anchorPath = [...path, childIdx];
						compCalls.push(cc);
						html += '<!>';
						childIdx++;
					}
				} else {
					html += emitElementHtml(
						child,
						[...path, childIdx],
						bindings,
						forCalls,
						ifCalls,
						compCalls,
						tryCalls,
						ctx,
						componentName,
						inlinedSubs,
						childNs,
						cssHash,
					);
					childIdx++;
				}
			} else if (child.type === 'ForOfStatement') {
				const forCall = makeForCall(child, ctx, inlinedSubs, childNs, cssHash);
				forCall.hostPath = path;
				// Emit a `<!>` anchor at the @for's source-order position so forBlock
				// inserts its start/end markers BEFORE this anchor — preserving sibling
				// order when an @for appears before static-element/text siblings.
				// Without this, the slot's markers get appended to the parent host
				// AFTER the static template content (same bug pattern as componentSlot).
				forCall.anchorPath = [...path, childIdx];
				forCalls.push(forCall);
				html += '<!>';
				childIdx++;
			} else if (child.type === 'IfStatement') {
				const ifCall = makeIfCall(child, ctx, inlinedSubs, childNs, cssHash);
				ifCall.hostPath = path;
				// Emit a `<!>` anchor at the if-block's source-order position so
				// ifBlock inserts its start/end markers BEFORE this anchor —
				// preserving sibling order when the @if appears before static
				// element/text siblings. Without this, the slot's markers get
				// appended to the parent host AFTER the static template content
				// and the branch content renders in reverse order.
				ifCall.anchorPath = [...path, childIdx];
				ifCalls.push(ifCall);
				html += '<!>';
				childIdx++;
			} else if (child.type === 'FoldedDirective') {
				// A directive folded by extractFragment: its branch helpers were already
				// compiled component-side and its control/helpers rewritten to `props.hN`.
				// Use the PRE-BUILT record (don't re-run makeIfCall); just assign the
				// renderer's host/anchor template paths and slot it like a normal @if.
				const dc = ctx._foldedDirectiveCalls;
				if (child.kind === 'if') {
					const ic = dc.ifCalls[child.recordIndex];
					ic.hostPath = path;
					ic.anchorPath = [...path, childIdx];
					ifCalls.push(ic);
					html += '<!>';
					childIdx++;
				} else if (child.kind === 'for') {
					const fcRec = dc.forCalls[child.recordIndex];
					fcRec.hostPath = path;
					fcRec.anchorPath = [...path, childIdx];
					forCalls.push(fcRec);
					html += '<!>';
					childIdx++;
				} else if (child.kind === 'switch') {
					const sc = dc.switchCalls[child.recordIndex];
					sc.hostPath = path;
					sc.anchorPath = [...path, childIdx];
					ctx._switchCalls.push(sc);
					html += '<!>';
					childIdx++;
				} else if (child.kind === 'try') {
					const tc = dc.tryCalls[child.recordIndex];
					tc.hostPath = path;
					tc.anchorPath = [...path, childIdx];
					tryCalls.push(tc);
					html += '<!>';
					childIdx++;
				}
			} else if (child.type === 'ActivityStatement') {
				const ac = makeActivityCall(child, ctx, inlinedSubs, childNs, cssHash);
				ac.hostPath = path;
				// `<!>` anchor so activityBlock's markers insert before later siblings
				// (same sibling-order reasoning as @if above).
				ac.anchorPath = [...path, childIdx];
				ifCalls.push(ac);
				html += '<!>';
				childIdx++;
			} else if (child.type === 'TryStatement') {
				const tc = makeTryCall(child, ctx, inlinedSubs, childNs, cssHash);
				tc.hostPath = path;
				// Emit a `<!>` anchor at the tryBlock's source-order position so
				// tryBlock inserts BEFORE this anchor — preserving sibling order
				// when an @try appears before static-element/text siblings. Without
				// this, the slot's start/end markers get appended to the parent
				// host AFTER the static template content. Mirrors componentSlot.
				tc.anchorPath = [...path, childIdx];
				tryCalls.push(tc);
				html += '<!>';
				childIdx++;
			} else if (child.type === 'SwitchStatement') {
				const sc = makeSwitchCall(child, ctx, inlinedSubs, childNs, cssHash);
				sc.hostPath = path;
				// Emit a `<!>` anchor at the switch's source-order position so
				// switchBlock inserts BEFORE this anchor — preserving sibling
				// order when an @switch appears before static-element/text
				// siblings. Without this, the slot's start/end markers get
				// appended to the parent host AFTER the static template content.
				sc.anchorPath = [...path, childIdx];
				ctx._switchCalls.push(sc);
				html += '<!>';
				childIdx++;
			} else if (child.type === 'TSRXExpression') {
				// {expr} at JSX child position. Recognised forms:
				//   - `{createPortal(BODY, TARGET, PROPS?)}` → portal() call
				//   - `{cond ? <JSX/> : <JSX/>}` → lowered to ifBlock (so the branches
				//      mount real DOM, not stringified text)
				//   - a known-string expression → text-hole binding
				//   - anything else → renderable childSlot hole
				const expr = child.expression;
				if (isCreatePortalCall(expr)) {
					const pc = makePortalCall(expr, ctx, componentName, inlinedSubs, childNs, cssHash);
					// Stash the JSX-tree host (the element containing this createPortal
					// call) so the runtime can stamp $$portalParent on portal children
					// pointing back at it. That makes events bubble OUT of the portal
					// up through this element — matching React's per-fiber portal walk.
					pc.hostPath = path;
					(ctx._portalCalls ??= []).push(pc);
				} else if (isConditionalJsx(expr)) {
					// Lower `{cond ? A : B}` (where A or B is JSX) to an IfStatement so
					// each branch renders real DOM via the existing ifBlock machinery.
					const asIf = {
						type: 'IfStatement',
						test: expr.test,
						consequent: wrapAsBlockStmt(expr.consequent),
						alternate: wrapAsBlockStmt(expr.alternate),
						loc: expr.loc, // carry source position for dev hydration-mismatch LOC
					};
					const ic = makeIfCall(asIf, ctx, inlinedSubs, childNs, cssHash);
					ic.hostPath = path;
					ifCalls.push(ic);
				} else if (isKnownStringExpression(expr, ctx.knownStringLocals)) {
					bindings.push({
						id: bindings.length,
						kind: 'text',
						expr: printExprWithTsrx(
							resolveStyleExpr(expr, cssHash),
							ctx,
							componentName,
							inlinedSubs,
						),
						knownString: true,
						path,
						childIndex: childIdx,
					});
					html += '<!>';
					childIdx++;
				} else {
					// Bare `{expr}` (no string cast) → RENDERABLE hole. makeChildCall
					// lowers any host / component JSX in the expression to
					// `createElement(...)` — this is what makes
					// `{items.map((x) => <li key={x.id}>{x.name}</li>)}`, a lone
					// `{<li/>}`, and array-of-elements children compile (the runtime
					// de-opt childSlot renders the result) — and rides the TSRX-aware
					// printer + childSlot path like the simpler Text branch.
					const ch = makeChildCall(expr, ctx, componentName, inlinedSubs, cssHash);
					ch.hostPath = path;
					ch.anchorPath = [...path, childIdx];
					compCalls.push(ch);
					html += '<!>';
					childIdx++;
				}
			}
		}
	}

	html += `</${tag}>`;
	return html;
}

function isCreatePortalCall(node) {
	return (
		node &&
		node.type === 'CallExpression' &&
		node.callee &&
		node.callee.type === 'Identifier' &&
		node.callee.name === 'createPortal'
	);
}

function makePortalCall(callNode, ctx, componentName, inlinedSubs, parentNs, cssHash) {
	const [bodyArg, targetArg, propsArg] = callNode.arguments;
	// The body is typically a <tsrx>...</tsrx> block or an arrow-`@{}` — both
	// rewritten to a hoisted render fn by printExprWithTsrx. An INLINE JSX
	// element/fragment body (`createPortal(<div…/>, target)`) is not a Tsrx
	// block, so it must be hoisted here — otherwise the raw JSX would be
	// printed verbatim into the emitted portal() call (invalid output).
	let bodyExpr;
	let envNames = null;
	const bt = bodyArg ? bodyArg.type : null;
	if (bt === 'Element' || bt === 'Fragment' || bt === 'JSXElement' || bt === 'JSXFragment') {
		// Phase 2: hoisted portal body + env tuple (see hoistBodyHelper).
		envNames = unionEnv(ctx, [{ stmts: [bodyArg], params: [] }]);
		bodyExpr = hoistBodyHelper(
			ctx,
			inlinedSubs,
			'__portal',
			[bodyArg],
			[],
			parentNs,
			cssHash,
			envNames,
		);
	} else {
		bodyExpr = printExprWithTsrx(bodyArg, ctx, componentName, inlinedSubs);
	}
	const targetExpr = printExpr(targetArg);
	const propsExpr = propsArg ? printExpr(propsArg) : 'undefined';
	return {
		id: ctx.nextHelperId++,
		loc: devLoc(ctx, callNode),
		envNames,
		bodyExpr,
		targetExpr,
		propsExpr,
	};
}

// Phase 2 (docs/compiled-output-optimization-plan.md): captured parent locals
// for a construct body helper about to be HOISTED to module scope — the free
// identifiers of the body (its own params/locals excluded by the scope-aware
// walker) intersected with the locals visible at the call site: the enclosing
// component's locals, extended per enclosing hoisted helper (see
// hoistBodyHelper). `__pu$N` parallel-use temps are compiler-generated
// component-body locals minted AFTER collectComponentLocals ran, so they are
// matched by name shape. Returns null when there is no component context —
// the caller then keeps the legacy inline (closure) placement.
function helperCaptures(ctx, stmts, params) {
	if (!ctx.currentComponentLocals) return null;
	const scope = new Set();
	for (const p of params || []) collectBindings(p, scope);
	const free = collectFreeIdentifiers({ type: 'BlockStatement', body: stmts }, scope);
	const env = [];
	for (const n of free) {
		if (ctx.currentComponentLocals.has(n) || /^__pu\$\d+$/.test(n)) env.push(n);
	}
	env.sort();
	return env;
}

// A construct's helpers (then+else, all switch cases, try+pending+catch,
// item+empty) share ONE env tuple — `block.extra` is per construct block and
// every helper destructures the same layout — so the emitted array is the
// sorted UNION of each body's captures. Null propagates (no component
// context → all of the construct's helpers stay inline).
function unionEnv(ctx, bodies) {
	let all = null;
	for (const b of bodies) {
		if (!b) continue;
		const c = helperCaptures(ctx, b.stmts, b.params);
		if (c === null) return null;
		if (all === null) all = new Set();
		for (const n of c) all.add(n);
	}
	return all === null ? null : [...all].sort();
}

// Hoist a construct sub-body (an @if/@else branch, an `<Activity>`/@try/
// @pending/@catch/@switch-case body, a @for item/@empty body, a portal body)
// as a helper. Phase 2: with `envNames` (the construct's shared env union,
// possibly empty) the helper is hoisted to MODULE scope — zero per-render
// closure allocations — and captured parent locals arrive through the
// `__extra` ABI slot (renderBlock forwards `block.extra` as the third body
// arg; the compiled call site passes the current values every parent render):
//
//   function __then$0(__props, __s, __extra) { const [label] = __extra; … }
//
// `envNames: null` keeps the legacy placement — the helper is emitted INSIDE
// the component function so its closures capture the parent's locals
// lexically (component children `__children$N` still use this: they are
// invoked through props, not through a construct block, so there is no
// block.extra channel to ride).
function hoistBodyHelper(ctx, inlinedSubs, prefix, stmts, params, parentNs, cssHash, envNames) {
	const helperName = `${prefix}$${ctx.nextHelperId++}`;
	let bodyStmts = stmts;
	if (envNames && envNames.length > 0) {
		// Destructure the construct's shared env tuple. The layout is the UNION
		// across the construct's helpers, so every helper destructures the same
		// slots (names a body doesn't use are harmless consts).
		bodyStmts = [
			{
				type: 'VariableDeclaration',
				kind: 'const',
				declarations: [
					{
						type: 'VariableDeclarator',
						id: {
							type: 'ArrayPattern',
							elements: envNames.map((n) => ({ type: 'Identifier', name: n })),
						},
						init: { type: 'Identifier', name: '__extra' },
					},
				],
			},
			...stmts,
		];
	}
	const fake = {
		type: 'Component',
		id: { type: 'Identifier', name: helperName },
		params: params || [],
		body: bodyStmts,
	};
	if (envNames == null) {
		inlinedSubs.push(compileFunctionBody(fake, ctx, helperName, parentNs, cssHash) + ';');
		return helperName;
	}
	// Module-scope placement. Nested constructs compiled INSIDE this body
	// compute THEIR captures against the names visible at their call sites —
	// which live in THIS compiled body: the component's locals extended with
	// this helper's params, env destructure, and body-level locals. (A nested
	// helper's env values are emitted as plain identifiers at its call site.)
	const prevLocals = ctx.currentComponentLocals;
	const extended = new Set(prevLocals);
	for (const n of collectComponentLocals(fake)) extended.add(n);
	ctx.currentComponentLocals = extended;
	let code;
	try {
		code = compileFunctionBody(fake, ctx, helperName, parentNs, cssHash);
	} finally {
		ctx.currentComponentLocals = prevLocals;
	}
	ctx.hoistedHelpers.push(code + ';');
	return helperName;
}

// ===========================================================================
// if-statement inside element children → ifBlock call
// ===========================================================================

function makeIfCall(node, ctx, inlinedSubs, parentNs = 'html', cssHash = null) {
	// node.test, node.consequent (BlockStatement | Element), node.alternate (BlockStatement | IfStatement | null)
	const condExpr = printExpr(node.test);

	const thenStmts =
		node.consequent.type === 'BlockStatement' ? node.consequent.body : [node.consequent];
	const elseStmts = node.alternate
		? node.alternate.type === 'BlockStatement'
			? node.alternate.body
			: [node.alternate]
		: null;
	// Phase 2: one shared env tuple for both branches (see unionEnv).
	const envNames = unionEnv(ctx, [
		{ stmts: thenStmts, params: [] },
		elseStmts && { stmts: elseStmts, params: [] },
	]);
	const thenHelperName = hoistBodyHelper(
		ctx,
		inlinedSubs,
		'__then',
		thenStmts,
		[],
		parentNs,
		cssHash,
		envNames,
	);

	let elseHelperName = null;
	if (elseStmts) {
		elseHelperName = hoistBodyHelper(
			ctx,
			inlinedSubs,
			'__else',
			elseStmts,
			[],
			parentNs,
			cssHash,
			envNames,
		);
	}

	return {
		id: ctx.nextHelperId++,
		loc: devLoc(ctx, node),
		condExpr,
		condTest: node.test, // raw test AST — the fold threads it as a `props.hN` hole
		envNames,
		thenHelper: thenHelperName,
		elseHelper: elseHelperName,
		hostPath: null,
	};
}

// `<Activity mode={…}>…</Activity>` (React 19). Lowers exactly like makeIfCall
// but to a single body helper + an `activity`-flagged ifCalls entry (so it reuses
// the host/anchor mount-loop). The afterLines emit branches on `.activity` to
// call `activityBlock` instead of `ifBlock`. `mode` is inlined and re-evaluated
// every parent render (like ifBlock's cond); a missing mode defaults to visible.
function makeActivityCall(node, ctx, inlinedSubs, parentNs = 'html', cssHash = null) {
	const modeExpr = node.mode ? printExpr(node.mode) : "'visible'";
	// Phase 2: hoisted body + env tuple (see hoistBodyHelper).
	const envNames = unionEnv(ctx, [{ stmts: node.children, params: [] }]);
	const bodyHelperName = hoistBodyHelper(
		ctx,
		inlinedSubs,
		'__activity',
		node.children,
		[],
		parentNs,
		cssHash,
		envNames,
	);
	return {
		id: ctx.nextHelperId++,
		loc: devLoc(ctx, node),
		activity: true,
		modeExpr,
		envNames,
		thenHelper: bodyHelperName,
		elseHelper: null,
		hostPath: null,
	};
}

/** Long-form `<Activity>` tag — matched by name, mirroring isFragmentLongForm. */
function isActivityLongForm(node) {
	const name = node.openingElement?.name || node.id;
	if (!name) return false;
	if (name.type !== 'Identifier' && name.type !== 'JSXIdentifier') return false;
	return name.name === 'Activity';
}

// ===========================================================================
// Component-as-tag — `<Foo>...</Foo>`, `<ctx.Provider>...</ctx.Provider>`
// ===========================================================================

// Long-form `<Fragment>…</Fragment>` (capital-F sentinel for fragment refs).
// Matches a JSXElement / Element whose tag identifier is exactly the word
// "Fragment". Used in normalizeChildren to expand into a FragmentStart /
// children / FragmentEnd sequence BEFORE isComponentTag would route the
// element through the componentSlot path.
function isFragmentLongForm(node) {
	const name = node.openingElement?.name || node.id;
	if (!name) return false;
	if (name.type !== 'Identifier' && name.type !== 'JSXIdentifier') return false;
	return name.name === 'Fragment';
}

function isComponentTag(node) {
	const name = node.openingElement?.name || node.id;
	if (!name) return false;
	if (name.type === 'MemberExpression' || name.type === 'JSXMemberExpression') return true;
	// `<{expr}>` — @tsrx/core 0.1.29 emits a JSXExpressionContainer with
	// isDynamic === true at openingElement.name. Always a component (no HTML
	// string tag is possible here); routes through the same componentSlot
	// codegen path as `<Foo>` / `<ctx.Provider>`.
	if (name.type === 'JSXExpressionContainer' && name.isDynamic === true) return true;
	if (name.type === 'Identifier' || name.type === 'JSXIdentifier') {
		if (typeof name.name !== 'string') return false;
		// JSX semantics (Babel/TS `isCompatTag`): an identifier tag is a HOST
		// string tag only when it starts with a lowercase ASCII letter (or isn't
		// a plain identifier, e.g. `<my-element>`); everything else — `<Foo>`,
		// `<_Inner>`, `<$Inner>` — is a component REFERENCE.
		return !/^[a-z]/.test(name.name) && !name.name.includes('-');
	}
	return false;
}

function tagExpr(node) {
	const name = node.openingElement?.name || node.id;
	if (name.type === 'MemberExpression' || name.type === 'JSXMemberExpression') {
		return printExpr(name);
	}
	// `<{expr}>` — unwrap and print the inner expression. The returned string
	// is interpolated verbatim into the emitted componentSlot(...) call as
	// cc.compExpr. Parenthesize for precedence safety.
	if (name.type === 'JSXExpressionContainer' && name.isDynamic === true) {
		return `(${printExpr(name.expression)})`;
	}
	return name.name;
}

// React-style render-prop detection: if a component's children are exactly one
// `{fn}` expression hole whose expression is a function (arrow or function
// expression) — `<Comp>{(data) => <jsx/>}</Comp>` — return that function node so
// the caller can pass it RAW as the `children` prop (callable with arbitrary
// args). Whitespace-only JSXText around the hole is tolerated. Returns null for
// anything else (multiple children, static JSX, a non-function hole), which then
// rides the normal `__children$N` render-function wrapping. An arrow whose body
// is a `JSXCodeBlock` (`(data) => @{…}`) is EXCLUDED — that octane render-prop
// form has its own hoisting path (rewriteTsrxBlocks) and a different calling
// convention; this detection is only for the React bare-JSX-body arrow.
function soleRenderPropChild(children) {
	if (!children || children.length === 0) return null;
	let sole = null;
	for (const c of children) {
		if (!c) continue;
		if (c.type === 'JSXText' && /^\s*$/.test(c.value)) continue; // indentation
		if (sole) return null; // more than one meaningful child
		sole = c;
	}
	if (!sole || sole.type !== 'JSXExpressionContainer') return null;
	const e = sole.expression;
	if (!e) return null;
	if (e.type !== 'ArrowFunctionExpression' && e.type !== 'FunctionExpression') return null;
	if (e.body && e.body.type === 'JSXCodeBlock') return null; // `@{…}` form — leave alone
	return e;
}

// Build a "renderable child" call entry for a bare `{expr}` text hole (no
// string cast). Mirrors Ripple/React: a component / element-descriptor /
// children render-fn RENDERS, a primitive coerces to text, and
// null/undefined/boolean/'' render nothing. It rides the compCall machinery
// (host + `<!>` anchor resolution, hole-aware child/sibling hydration walk) but
// emits `childSlot(...)` instead of `componentSlot(...)`. The caller sets
// `.hostPath` / `.anchorPath` exactly like a component call. The single
// construction site for these records — every renderable-hole position
// (top-level Text/TSRXExpression, only-child, mixed-children) builds through
// here so the emit can't drift.
//
// `rewriteJsxValues` lowers any JSX inside the expression to `createElement(...)`.
// This covers a React-style render-prop arrow whose body is bare JSX
// (`(data) => <span/>`): the arrow is preserved (passed as a callable
// `children` prop the consuming component invokes), while its `<span/>` body
// becomes a printable descriptor. Without it, the raw JSX leaks into the
// emitted `childSlot(...)` call as unparseable source. Printing goes through
// the TSRX-aware printer so a nested `() => @{…}` sub-template hoists (and
// server-mode `use(thenable)` calls get their stable keys).
function makeChildCall(expr, ctx, componentName, inlinedSubs, cssHash) {
	return {
		id: ctx.nextHelperId++,
		loc: devLoc(ctx, expr),
		isChild: true,
		valueExpr: printExprWithTsrx(
			resolveStyleExpr(rewriteJsxValues(expr, ctx), cssHash),
			ctx,
			componentName,
			inlinedSubs,
		),
	};
}

function makeCompCall(
	node,
	ctx,
	componentName,
	inlinedSubs,
	bindings,
	forCalls,
	ifCalls,
	compCalls,
	parentNs = 'html',
	cssHash = null,
) {
	const id = ctx.nextHelperId++;
	const compExpr = tagExpr(node);

	// Build the props object literal from JSX attributes. `<Foo {...rest}/>`
	// becomes a spread element in the object literal — works because component
	// bodies receive the merged object as `props` and only care about field
	// values, not identity.
	const attrs = node.attributes || node.openingElement?.attributes || [];
	const propParts = [];
	// `key={expr}` is consumed by the componentSlot runtime (drives key-driven
	// remount on identity change), NOT passed as a prop — matches React, where
	// `props.key` is undefined inside the component body. When `key` follows a
	// spread, the spread cannot inject `key` either: we filter it out of the
	// emitted propsExpr but keep its expression for the slot arg.
	let keyExpr = null;
	for (const attr of attrs) {
		if (attr.type === 'SpreadAttribute' || attr.type === 'JSXSpreadAttribute') {
			propParts.push(`...(${printExprWithTsrx(attr.argument, ctx, componentName, inlinedSubs)})`);
			continue;
		}
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
		const attrName = attr.name.name || attr.name;
		const val = attr.value;
		if (attrName === 'key') {
			// `<Foo key/>` (no value) is meaningless — skip silently.
			if (val == null) continue;
			const keyInner = val.type === 'JSXExpressionContainer' ? val.expression : val;
			keyExpr = printExprWithTsrx(keyInner, ctx, componentName, inlinedSubs);
			continue;
		}
		if (val == null) {
			propParts.push(`${JSON.stringify(attrName)}: true`);
			continue;
		}
		let inner = val.type === 'JSXExpressionContainer' ? val.expression : val;
		// Lower any JSX in the prop value to createElement(...) — e.g.
		// `<Suspense fallback={<span/>}>` or a render-prop returning JSX — so esrap
		// emits a real descriptor instead of raw (unprintable) JSX.
		inner = resolveStyleExpr(rewriteJsxValues(inner, ctx), cssHash);
		if (inner.type === 'Literal') {
			propParts.push(`${JSON.stringify(attrName)}: ${JSON.stringify(inner.value)}`);
		} else {
			propParts.push(
				`${JSON.stringify(attrName)}: (${printExprWithTsrx(inner, ctx, componentName, inlinedSubs)})`,
			);
		}
	}

	// React-style render-prop child: `<Comp>{(data) => <jsx/>}</Comp>` — the sole
	// child is a function the consuming component CALLS with arbitrary args
	// (`props.children(data)`), rendering whatever descriptor it returns. Pass the
	// function through RAW (lowering any JSX in its body to `createElement(...)`)
	// instead of wrapping it in a scope-receiving `__children$N` renderer — the
	// wrapper takes `(__props, __s, __extra)`, so calling it with the consumer's
	// data would mis-bind `__s` and explode. `rewriteJsxValues` keeps the arrow an
	// arrow while making its body printable. Whitespace-only JSXText around the
	// arrow is ignored so source indentation doesn't defeat the detection.
	const children = node.children || [];
	const renderPropChild = soleRenderPropChild(children);
	if (renderPropChild) {
		propParts.push(
			`"children": (${printExprWithTsrx(rewriteJsxValues(renderPropChild, ctx), ctx, componentName, inlinedSubs)})`,
		);
	} else if (children.length > 0) {
		// Compile children as a render function: (scope) => { renders JSX into scope }.
		// The function is inlined inside the parent component body so its closures
		// capture the parent's locals (props, state, etc.).
		// Phase 2 NOTE: children render-fns stay INLINE (envNames=null) — they are
		// invoked through props (childrenAsBody / render-prop checks), not through
		// a construct block, so there is no block.extra channel for captures.
		const childrenHelperName = hoistBodyHelper(
			ctx,
			inlinedSubs,
			'__children',
			children,
			[],
			parentNs,
			cssHash,
			null,
		);
		// Tag the children-block render fn so a consumer can tell it from a render-prop
		// function child (`<C>{(x) => …}</C>`, passed RAW above) — both are `typeof === 'function'`,
		// so React-ecosystem `typeof children === 'function'` checks need `isChildrenBlock` to
		// exclude compiled element/text children. See runtime `markChildrenBlock`/`isChildrenBlock`.
		ctx.runtimeNeeded.add('markChildrenBlock');
		propParts.push(`"children": _$markChildrenBlock(${childrenHelperName})`);
	}

	const propsExpr = `{ ${propParts.join(', ')} }`;

	// Design (c) v0: decide whether the call site can use componentSlotLite
	// (Scope-only, no Block / no Comment markers / no CompSlot wrapper).
	// Requires:
	//   - callee is a bare Identifier (no dynamic <{expr}/> tag)
	//   - callee is registered in ctx.componentInfo as eligible (same-module
	//     hookless component that passed the pre-pass)
	//   - no key=, no spread, no JSX children at the call site
	let liteEligible = false;
	// singleRoot: a NON-lite (hooks/`use`) same-module component whose body output
	// is one plain element. Its componentSlot self-delimits via that element on
	// client mount — no `comp`/`/comp` markers. (Lite components are already
	// markerless, so this only matters for the full path.)
	let singleRoot = false;
	// maybeSingleRoot: the call site qualifies syntactically but the callee is
	// CROSS-MODULE (not in componentInfo) — emit the `2` sentinel so the runtime
	// elides iff the callee carries the definition-site `$$singleRoot` stamp
	// (docs/comment-marker-elision-plan.md M1).
	let maybeSingleRoot = false;
	if (ctx.componentInfo && keyExpr == null) {
		const tagName = node.openingElement?.name || node.id || node.name;
		const isBareIdent =
			tagName && (tagName.type === 'Identifier' || tagName.type === 'JSXIdentifier');
		if (isBareIdent) {
			const hasSpread = propParts.some((p) => p.startsWith('...'));
			const hasChildrenProp = propParts.some((p) => p.startsWith('"children":'));
			const callSiteOk = !hasSpread && !hasChildrenProp;
			const calleeInfo = ctx.componentInfo.get(compExpr);
			if (calleeInfo) {
				if (calleeInfo.eligible) liteEligible = callSiteOk;
				else if (calleeInfo.singleRoot) singleRoot = callSiteOk;
			} else if (ctx.importedNames !== undefined && ctx.importedNames.has(compExpr)) {
				// IMPORTED bindings only: immutable identity for the slot's whole
				// life. A local variable callee (`const Comp = cond ? A : B`) can
				// change identity per render — the markerless regime must not be
				// pinned to whichever component happened to mount first.
				maybeSingleRoot = callSiteOk;
			}
		}
	}

	return {
		id,
		compExpr,
		propsExpr,
		hostPath: null,
		keyExpr,
		liteEligible,
		singleRoot,
		maybeSingleRoot,
		loc: devLoc(ctx, node),
	};
}

// ===========================================================================
// try/catch → tryBlock call
// ===========================================================================

function makeTryCall(node, ctx, inlinedSubs, parentNs = 'html', cssHash = null) {
	// node.block = try BlockStatement, node.handler = CatchClause (param, resetParam, body),
	// node.pending = optional BlockStatement (TSRX `pending { ... }`)
	//
	// Phase 2: one shared env tuple for try/pending/catch (see unionEnv). The
	// catch body's `err`/`reset` destructure (from its own `__props` param) is
	// built FIRST and included in its analyzed statements, so those bind as
	// locals, not captures.
	const tryStmts = node.block.body;
	const pendingStmts =
		node.pending && node.pending.body && node.pending.body.length > 0 ? node.pending.body : null;

	let catchBodyStmts = null;
	if (node.handler) {
		const handler = node.handler;
		const errName = handler.param?.name || '_err';
		const resetName = handler.resetParam?.name || '_reset';
		const catchStmts = handler.body.body;
		// The catch body sees `err` and `reset` as bindings unpacked from the
		// tryBlock-supplied props object. We synthesize a small destructuring
		// VariableDeclaration at the top of the body so the user's identifiers
		// resolve. The body is otherwise compiled like any component body.
		const destructure = {
			type: 'VariableDeclaration',
			kind: 'const',
			declarations: [
				{
					type: 'VariableDeclarator',
					id: {
						type: 'ObjectPattern',
						properties: [
							{
								type: 'Property',
								key: { type: 'Identifier', name: 'err' },
								value: { type: 'Identifier', name: errName },
								kind: 'init',
								shorthand: errName === 'err',
								computed: false,
								method: false,
							},
							{
								type: 'Property',
								key: { type: 'Identifier', name: 'reset' },
								value: { type: 'Identifier', name: resetName },
								kind: 'init',
								shorthand: resetName === 'reset',
								computed: false,
								method: false,
							},
						],
					},
					init: { type: 'Identifier', name: '__props' },
				},
			],
		};
		catchBodyStmts = [destructure, ...catchStmts];
	}

	const catchParams = [{ type: 'Identifier', name: '__props' }];
	const envNames = unionEnv(ctx, [
		{ stmts: tryStmts, params: [] },
		pendingStmts && { stmts: pendingStmts, params: [] },
		catchBodyStmts && { stmts: catchBodyStmts, params: catchParams },
	]);

	const tryHelperName = hoistBodyHelper(
		ctx,
		inlinedSubs,
		'__try',
		tryStmts,
		[],
		parentNs,
		cssHash,
		envNames,
	);

	let pendingHelperName = 'null';
	if (pendingStmts) {
		pendingHelperName = hoistBodyHelper(
			ctx,
			inlinedSubs,
			'__pending',
			pendingStmts,
			[],
			parentNs,
			cssHash,
			envNames,
		);
	}

	let catchHelperName = 'null';
	if (catchBodyStmts) {
		catchHelperName = hoistBodyHelper(
			ctx,
			inlinedSubs,
			'__catch',
			catchBodyStmts,
			catchParams,
			parentNs,
			cssHash,
			envNames,
		);
	}
	return {
		id: ctx.nextHelperId++,
		loc: devLoc(ctx, node),
		envNames,
		tryHelper: tryHelperName,
		catchHelper: catchHelperName,
		pendingHelper: pendingHelperName,
		hostPath: null,
	};
}

/**
 * `@switch (d) { @case 1: { … } @case 2: { … } @default: { … } }` →
 * `switchBlock(scope, slotKey, host, d, [[1, __case$0], [2, __case$1]], __default$2)`.
 *
 * Each case's `consequent` (Statement[]) is hoisted as its own component body
 * via `compileFunctionBody`, exactly like @if branches. Fall-through is NOT
 * modeled — each case is treated as its own self-contained body. If a user
 * writes a case with no explicit terminator, the case's body still runs to
 * completion (it's just a function call) and only that case's body renders.
 */
function makeSwitchCall(node, ctx, inlinedSubs, parentNs = 'html', cssHash = null) {
	const discExpr = printExpr(node.discriminant);
	const caseRecords = [];
	let defaultHelper = 'null';
	// Phase 2: one shared env tuple across every case + default (see unionEnv).
	const envNames = unionEnv(
		ctx,
		(node.cases || []).map((c) => ({ stmts: c.consequent || [], params: [] })),
	);
	for (const c of node.cases || []) {
		const stmts = c.consequent || [];
		const isDefault = c.test == null;
		const helperName = hoistBodyHelper(
			ctx,
			inlinedSubs,
			`__${isDefault ? 'default' : 'case'}`,
			stmts,
			[],
			parentNs,
			cssHash,
			envNames,
		);
		if (isDefault) {
			defaultHelper = helperName;
		} else {
			caseRecords.push({ testExpr: printExpr(c.test), testNode: c.test, helper: helperName });
		}
	}
	const casesArrayExpr =
		'[' + caseRecords.map((r) => `[(${r.testExpr}), ${r.helper}]`).join(', ') + ']';
	return {
		id: ctx.nextHelperId++,
		loc: devLoc(ctx, node),
		discExpr,
		discNode: node.discriminant, // AST — the fold threads it as a `props.hN` hole
		envNames,
		casesArrayExpr,
		caseRecords, // { testNode, helper } per case — the fold builds the cases hole
		defaultHelper,
		hostPath: null,
	};
}

// ===========================================================================
// for-of inside element children → forBlock call
// ===========================================================================

function makeForCall(node, ctx, inlinedSubs, parentNs = 'html', cssHash = null) {
	// `@for await (...)` (async iteration) has no meaning for the runtime's
	// synchronous keyed reconciler. The TSRX parser currently rejects the surface
	// syntax outright, but guard the lowered node too so a future parser change
	// can't make it silently lower to a plain synchronous loop, dropping the
	// `await` with no diagnostic.
	if (node.await) {
		throw new Error(
			'`@for await (...)` (async iteration) is not supported by the octane target. ' +
				'Use a synchronous `@for` over a materialized array, or resolve async data with ' +
				'`use(promise)` first.',
		);
	}
	// node.left = const x  OR  const &{x,y} / const [a,b]  (destructured)
	// node.right = expr, node.body = BlockStatement,
	// node.key = optional `key …` expression, node.index = optional `index <id>`.
	// `@for (...) { ... } @empty { ... }` — hoist the empty branch as its own
	// helper. Passed to the runtime as the trailing `emptyBody` arg. When
	// items.length === 0 the runtime mounts the empty branch in place of the
	// (empty) item list; transitioning items → 0 unmounts the chain and mounts
	// the empty body, and 0 → items does the reverse.
	const emptyStmts = node.empty
		? node.empty.type === 'BlockStatement'
			? node.empty.body
			: [node.empty]
		: null;
	const leftDeclId = node.left.declarations[0].id;
	const isDestructured = leftDeclId.type !== 'Identifier';
	// `itemName` is the identifier used in the body signature + keyFn. For a
	// plain `const x of …`, that's `x`. For a destructured `const &{id} of …`,
	// we synthesize a fresh name and emit the destructuring inside the body so
	// the keyFn still gets the whole item and the body still sees the fields.
	const itemName = isDestructured ? '_item' : leftDeclId.name;
	const itemsExpr = printExpr(node.right);
	const subStmts = node.body.body;

	// Key resolution priority (matches @tsrx/core's build_hoisted_for_of_with_hooks):
	//   1. `key={…}` attribute on the first Element child (legacy / explicit).
	//   2. `for (const x of y; key x.id) { ... }` — TSRX for-of header.
	//   3. `for (const x, i of y) { ... }` — second loop param treated as the key.
	//   4. Fallback: `x.id ?? x` (object identity).
	// Builds `(item) => keyExpr` — when the for-of head is destructured we use
	// the same destructure pattern as the arg so the user's `key id` (where
	// `id` is a destructured field) actually resolves.
	function mkKeyFn(keyExpr) {
		const param = isDestructured ? leftDeclId : { type: 'Identifier', name: itemName };
		return printExpr({
			type: 'ArrowFunctionExpression',
			params: [param],
			body: keyExpr,
			expression: true,
		});
	}

	let keyFn = null;
	// New TSRX surfaces `key` on the JSXForExpression itself (read via `node.key`
	// below). Legacy / `<li key={…}>` attribute syntax is also accepted: scan the
	// body for the first Element and pull its `key=` attr if any. Accept both
	// the old `Element` IR and the raw new `JSXElement` shape that's reached
	// here when the body wasn't routed through normalizeChildren.
	const firstEl = subStmts.find((n) => n.type === 'Element' || n.type === 'JSXElement');
	if (firstEl) {
		const keyAttr = (firstEl.attributes || firstEl.openingElement?.attributes || []).find(
			(a) => (a.name?.name || a.name) === 'key',
		);
		// A valueless `<li key>` carries no expression — skip it (mirroring
		// makeCompCall's null-value handling) and fall through to the header key /
		// index / `x.id ?? x` default instead of crashing on `keyAttr.value.type`.
		if (keyAttr && keyAttr.value != null) {
			const inner =
				keyAttr.value.type === 'JSXExpressionContainer' ? keyAttr.value.expression : keyAttr.value;
			keyFn = mkKeyFn(inner);
		}
	}
	if (!keyFn && node.key) {
		keyFn = mkKeyFn(node.key);
	}
	if (!keyFn && node.index) {
		// Index identifier — caller iterates with index, key by index.
		keyFn = `(${itemName}, ${node.index.name}) => ${node.index.name}`;
	}
	if (!keyFn) keyFn = `(${itemName}) => ${itemName}.id != null ? ${itemName}.id : ${itemName}`;

	// Key fn is hoisted (it doesn't typically capture parent state).
	const keyHelper = `_key$${ctx.nextHelperId++}`;
	ctx.hoistedHelpers.push(`const ${keyHelper} = ${keyFn};`);

	// When the for-of header declared `index <name>`, expose it as a `const`
	// at the top of the body — the runtime stamps `block.itemIndex` per item
	// on every mount + re-render so the user identifier always reflects the
	// current position.
	const indexInjection = node.index
		? [
				{
					type: 'VariableDeclaration',
					kind: 'const',
					declarations: [
						{
							type: 'VariableDeclarator',
							id: { type: 'Identifier', name: node.index.name },
							init: {
								type: 'MemberExpression',
								object: { type: 'Identifier', name: '__block' },
								property: { type: 'Identifier', name: 'itemIndex' },
								computed: false,
							},
						},
					],
				},
			]
		: [];

	// Destructured header `const &{x,y} of …` — synthesize a destructure stmt
	// at the top of the body so the user fields bind from the synthetic item.
	const destructureInjection = isDestructured
		? [
				{
					type: 'VariableDeclaration',
					kind: 'const',
					declarations: [
						{
							type: 'VariableDeclarator',
							id: leftDeclId, // ObjectPattern / ArrayPattern (lazy flag dropped by printer)
							init: { type: 'Identifier', name: itemName },
						},
					],
				},
			]
		: [];

	// ─── Body analysis: PURE vs DEP-PURE vs normal.
	//
	// - PURE: body closes over nothing parent-reactive, no hooks, no comps,
	//   no control flow. Reconciler skips renderBlock when item ref + index
	//   unchanged. Identified by `pure = true`.
	// - DEP-PURE: body DOES close over parent locals but is otherwise as
	//   clean as PURE. The compiler emits an explicit deps array at the
	//   forBlock call site so the reconciler can do ONE deps-equality check
	//   per parent render and, if unchanged, treat the body as PURE for the
	//   survivor short-circuit. Saves the body call entirely for
	//   item-ref-and-index-stable survivors — no per-row snapshot work.
	// - NORMAL: anything else → body runs every render.
	let pure = false;
	const depNames = [];
	let depEligible = false;
	if (ctx.currentComponentLocals) {
		const bodyScope = new Set([itemName]);
		if (node.index) bodyScope.add(node.index.name);
		const bodyAst = { type: 'BlockStatement', body: subStmts };
		const free = collectFreeIdentifiers(bodyAst, bodyScope);
		let hasParentClosure = false;
		let hasHook = false;
		const seenDeps = new Set();
		for (const name of free) {
			if (HOOK_NAMES.has(name) || name === 'use' || name === 'useContext') {
				hasHook = true;
			}
			if (ctx.currentComponentLocals.has(name)) {
				hasParentClosure = true;
				if (!seenDeps.has(name)) {
					seenDeps.add(name);
					depNames.push(name);
				}
			}
		}
		const hasNestedComp = containsComponentCallOrControlFlow(subStmts);
		// A render-time CALL disqualifies the survivor short-circuit entirely: the
		// call can read state neither the item ref nor the deps tuple witnesses
		// (`header.column.getIsSorted()` flips while `header` stays the memoized
		// object), so a skipped body would render stale output — React re-runs
		// bodies unconditionally. Property reads stay eligible (the measured
		// js-framework-benchmark/dbmon wins are read-only bodies).
		const hasRenderCall = containsRenderCall(subStmts);
		pure = !hasParentClosure && !hasHook && !hasNestedComp && !hasRenderCall;
		depEligible = !pure && hasParentClosure && !hasHook && !hasNestedComp && !hasRenderCall;
		depNames.sort();
	}

	// Phase 2: ONE env tuple shared by the item + @empty helpers — it IS the
	// forBlock `deps` array (deps was already the captured-locals snapshot for
	// dep-pure promotion; the runtime additionally stamps it as `block.extra`
	// on every item/empty block). The union may widen deps with @empty-only
	// captures — a conservative, correct deps for promotion purposes.
	const itemAllStmts = [...indexInjection, ...destructureInjection, ...subStmts];
	const itemParams = [{ type: 'Identifier', name: itemName }];
	const envNames = unionEnv(ctx, [
		{ stmts: itemAllStmts, params: itemParams },
		emptyStmts && { stmts: emptyStmts, params: [] },
	]);
	let emptyHelperName = 'null';
	if (emptyStmts) {
		emptyHelperName = hoistBodyHelper(
			ctx,
			inlinedSubs,
			'__empty',
			emptyStmts,
			[],
			parentNs,
			cssHash,
			envNames,
		);
	}
	const itemHelperName = hoistBodyHelper(
		ctx,
		inlinedSubs,
		'__item',
		itemAllStmts,
		itemParams,
		parentNs,
		cssHash,
		envNames,
	);

	// Single-root detection: when the body emits exactly one Element root and
	// no other JSX siblings (no Fragment, no Component, no top-level if/for/try),
	// the runtime can skip per-item Comment markers and use the row element
	// itself as the block boundary. For a 1000-row keyed list this removes 2000
	// Comment nodes from the parent — meaningful paint-time savings when the
	// parent is laid out per child (e.g. <tbody> in js-framework-benchmark).
	let singleRoot = false;
	{
		const jsxChildren = subStmts.filter((s) => isJsxNode(s));
		if (jsxChildren.length === 1) {
			const c = jsxChildren[0];
			// Old IR uses `Element`; new TSRX AST uses `JSXElement`. Both qualify
			// for the singleRoot fast path so long as the tag is lowercase (so the
			// row itself is the block-boundary host, no Comment markers needed).
			if ((c.type === 'Element' || c.type === 'JSXElement') && !isComponentTag(c))
				singleRoot = true;
		}
	}

	return {
		id: ctx.nextHelperId++,
		loc: devLoc(ctx, node),
		itemsExpr,
		keyHelper,
		bodyHelper: itemHelperName,
		pure,
		singleRoot,
		// The env union doubles as the deps array: emitted whenever the helpers
		// capture anything (Phase 2 — the runtime stamps it as block.extra), and
		// ALSO compared for the dep-pure survivor short-circuit when depEligible.
		// depNames must be exactly the tuple layout the helpers destructure.
		depEligible,
		depNames: envNames || depNames,
		// True only when the header binds NO `index <name>` — the body then can't
		// observe an item's position, so a pure reorder (same item ref, position
		// changed) need not re-render the survivor. Conservative: an index binding
		// (or any uncertainty) leaves this false and keeps the re-render.
		indexIndependent: !node.index,
		// `@empty` branch helper name (or literal 'null' when none).
		emptyHelper: emptyHelperName,
		hostPath: null,
	};
}

// ===========================================================================
// Helpers
// ===========================================================================

/**
 * Detect short-circuit guards: `if (cond) return;` (at component-body level)
 * AND `if (cond) continue;` (inside a for-of body). Both have identical
 * compile-time semantics: "skip everything after this point" — for a component
 * body that means render nothing more; for a for-of item that means render
 * nothing more for THIS item but the next item still iterates.
 *
 * Accepts both no-braces (`if (x) continue;`) and single-statement-block
 * (`if (x) { continue; }`). Rejects forms with an alternate or a value-return.
 */
function isEarlyExitIf(stmt) {
	if (!stmt || stmt.type !== 'IfStatement' || stmt.alternate) return false;
	const c = stmt.consequent;
	if (isEarlyExitStatement(c)) return true;
	if (c.type === 'BlockStatement' && c.body.length === 1 && isEarlyExitStatement(c.body[0]))
		return true;
	return false;
}

function isEarlyExitStatement(s) {
	if (!s) return false;
	if (s.type === 'ReturnStatement' && s.argument == null) return true;
	if (s.type === 'ContinueStatement' && s.label == null) return true;
	return false;
}

/**
 * Rewrite early-exit guards into nested negated-condition if-blocks:
 *   stmt1; if (X) continue; stmt2; if (Y) return; stmt3;
 *   ⇒
 *   stmt1; if (!X) { stmt2; if (!Y) { stmt3; } }
 *
 * Each synthetic `if (!cond) { ... }` becomes an ifBlock at compile time.
 * Symbol-keyed hooks make it safe to declare hooks after an early exit.
 */
function rewriteEarlyExits(body) {
	const out = [];
	for (let i = 0; i < body.length; i++) {
		const stmt = body[i];
		if (isEarlyExitIf(stmt)) {
			const rest = rewriteEarlyExits(body.slice(i + 1));
			if (rest.length > 0) {
				out.push({
					type: 'IfStatement',
					test: { type: 'UnaryExpression', operator: '!', argument: stmt.test, prefix: true },
					consequent: { type: 'BlockStatement', body: rest },
					alternate: null,
				});
			}
			return out;
		}
		out.push(stmt);
	}
	return out;
}

function isJsxNode(node) {
	if (!node) return false;
	if (node.type === 'Element' || node.type === 'Text') return true;
	if (node.type === 'Tsx' || node.type === 'Tsrx') return true;
	if (node.type === 'JSXElement' || node.type === 'JSXFragment') return true;
	// New TSRX directive nodes — always JSX-position. normalizeChildren will
	// lower them to IfStatement / ForOfStatement / TryStatement / SwitchStatement
	// when planJsx runs over them.
	if (
		node.type === 'JSXIfExpression' ||
		node.type === 'JSXForExpression' ||
		node.type === 'JSXTryExpression' ||
		node.type === 'JSXSwitchExpression' ||
		node.type === 'JSXExpressionContainer' ||
		node.type === 'JSXText' ||
		node.type === 'JSXStyleElement'
	)
		return true;
	if (node.type === 'IfStatement') {
		return (
			bodyContainsJsx(node.consequent) || (!!node.alternate && bodyContainsJsx(node.alternate))
		);
	}
	if (node.type === 'ForOfStatement') {
		return bodyContainsJsx(node.body);
	}
	if (node.type === 'TryStatement') {
		return bodyContainsJsx(node.block) || (!!node.handler && bodyContainsJsx(node.handler.body));
	}
	return false;
}

function bodyContainsJsx(node) {
	if (!node) return false;
	if (node.type === 'BlockStatement') return node.body.some(isJsxNode);
	return isJsxNode(node);
}

function walkExpr(rootVar, path) {
	if (path.length === 0) return rootVar;
	let expr = rootVar;
	for (let i = 0; i < path.length; i++) {
		const idx = path[i];
		expr = `${expr}.firstChild`;
		for (let n = 0; n < idx; n++) expr = `${expr}.nextSibling`;
	}
	return expr;
}

// Hole-aware variant of walkExpr: `child(node)` for `.firstChild`, `sibling(node,
// n)` for n× `.nextSibling`. Identical to walkExpr when not hydrating; while
// hydrating, `sibling` skips each `<!--[-->…<!--]-->` block range as one logical
// step so paths that cross a control-flow / component hole resolve to the right
// server node. Used for templates that contain holes (see `hasHoles`).
function walkExprH(rootVar, path) {
	if (path.length === 0) return rootVar;
	let expr = rootVar;
	for (let i = 0; i < path.length; i++) {
		const idx = path[i];
		expr = `_$child(${expr})`;
		if (idx > 0) expr = `_$sibling(${expr}, ${idx})`;
	}
	return expr;
}

function allocTemplate(ctx, html, ns = 0, frag = 0) {
	const id = ctx.nextTemplateId++;
	const name = `_t$${id}`;
	ctx.hoistedTemplates.push({ name, html, ns, frag });
	return name;
}

function escapeHtml(s) {
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
	return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function printNode(node) {
	// Strip TS-only wrappers (TSAsExpression / TSNonNullExpression / etc.)
	// before printing. esrap's tsx printer would otherwise emit
	// `expr as string`, `expr!`, `expr satisfies T` verbatim, which Vite/
	// rolldown rejects when loading the compiled .tsrx output as a `.js`
	// module ("Type assertion expressions can only be used in TypeScript
	// files"). Centralizing here covers every emit path (statement-level
	// rewrittenStatements, planJsx-emitted bindings, attribute / prop
	// values via printExprWithTsrx) — no per-call-site strip needed.
	const { code } = esrapPrint(stripTsOnlyWrappers(node), esrapTsx());
	return code;
}

/**
 * Like printNode, but also returns esrap's real per-token source mappings for
 * this node (decoded, NOT VLQ-encoded). `code` is byte-identical to printNode —
 * source-map options don't change the printed output — so callers can keep
 * emitting the same string while capturing the map. `mappings` is an array
 * indexed by generated line; each entry is a list of `[genCol, srcIdx, srcLine,
 * srcCol]` segments with ABSOLUTE source positions (relative to the original
 * `.tsrx`, via the node's `.loc`).
 */
function printNodeWithMap(node, ctx) {
	const { code, map } = esrapPrint(stripTsOnlyWrappers(node), esrapTsx(), {
		sourceMapSource: ctx.mapSourceName,
		sourceMapContent: ctx.mapSource,
		sourceMapEncodeMappings: false,
	});
	return { code, mappings: map.mappings || [] };
}

function printExpr(node) {
	// Wrap in an ExpressionStatement to get a printable form, then strip trailing `;`.
	const wrapped = { type: 'ExpressionStatement', expression: node };
	return printNode(wrapped).trim().replace(/;$/, '');
}

/**
 * Like printExpr, but first walks the AST and replaces any `<tsrx>...</tsrx>`
 * or `<tsx>...</tsx>` blocks with identifier references to hoisted render fns.
 * Used at attribute-value and prop-value sites where Tsrx is at expression position.
 */
function printExprWithTsrx(node, ctx, componentName, inlinedSubs) {
	// In server mode, JSX expression positions (attribute / prop / spread values)
	// bypass the setup-statement rewrite in ssrCompileBody, so apply the server
	// `use(thenable)` call-site keying here too — without a stable key, sibling and
	// nested `use()` calls collide in render()'s suspense cache (the OCC fallback
	// keys them by render order, which shifts across passes → crossed values).
	// No-op in client mode (use() is keyed by per-block call order there) and for
	// expressions with no hook calls.
	const keyed = ctx.mode === 'server' ? rewriteHookCalls(node, ctx, componentName) : node;
	const rewritten = rewriteTsrxBlocks(keyed, ctx, componentName, inlinedSubs);
	return printExpr(rewritten);
}

function mapAst(node, mutate) {
	if (node == null || typeof node !== 'object') return node;
	if (Array.isArray(node)) return node.map((c) => mapAst(c, mutate));
	const replaced = mutate(node);
	if (replaced != null) return replaced;
	const out = {};
	for (const k in node) {
		if (k === 'loc' || k === 'start' || k === 'end' || k === 'metadata') {
			out[k] = node[k];
			continue;
		}
		out[k] = mapAst(node[k], mutate);
	}
	return out;
}
