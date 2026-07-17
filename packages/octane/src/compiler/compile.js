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
	strongHash,
} from '@tsrx/core';
import { print as esrapPrint } from 'esrap';
import esrapTsx from 'esrap/languages/tsx';
import { applyHookDependencies } from './hook-deps.js';
import {
	addSourceMapNeedles,
	compileUniversal,
	composeSourceMaps,
	retargetRuntimeImportAliases,
} from './compile-universal.js';
import {
	expandDomRendererRegions,
	prepareRendererBoundaryRegions,
	prepareServerRendererBoundaryRegions,
} from './compile-renderer-boundaries.js';
import {
	hydrateBoundaryPathFromId,
	prepareHydrateBoundaries,
	prepareServerHydrateBoundaries,
} from './hydrate-boundaries.js';
import { assertNoLiveClientOnlyImports } from './client-only-server.js';

// DOM truth tables shared with the client/server runtimes (via constants.ts) —
// static bakes and dynamic writes MUST agree on which attributes render, under
// what name, and in what form, or client/SSR/hydration drift apart. See the
// dom-tables.js header for per-table semantics.
import {
	VOID_ELEMENTS,
	BOOLEAN_ATTR_PROPS,
	MUST_USE_PROPERTY_PROPS,
	POSITIVE_NUMERIC_ATTR_PROPS,
	SVG_ONLY_TAGS,
	ATTRIBUTE_ALIASES,
	isEnumeratedBooleanAttr,
	cssStyleValue,
	hyphenateStyleName,
} from '../dom-tables.js';
import { sanitizeURLAttribute } from '../sanitize-url.js';

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
			// A single dynamic child is validated at render/commit time: null and
			// undefined are inactive, every other value is invalid. Definitely
			// non-nullish expressions can still fail early.
			if (!isDefinitelyNonNullishJsxExpression(c.expression)) continue;
		} else if (c.type === 'JSXStyleElement') {
			continue;
		}
		offending = true;
		break;
	}
	// Two semantic JSX children become a non-nullish `children` array even if
	// each individual expression later evaluates nullish.
	if (!offending && semanticJsxChildCount(node.children || []) > 1) offending = true;
	if (!offending && hasDefinitelyPresentDirectDangerouslySetInnerHTML(node)) offending = true;
	// Nested JSX children are the transform's final `children` writer. Only a
	// direct/spread prop is effective when there is no semantic nested child.
	if (
		!offending &&
		!hasSemanticJsxChildren(node.children || []) &&
		hasDefinitelyPresentDirectChildrenProp(node)
	)
		offending = true;
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
	checkedCheckable: 'setCheckedCheckable',
	selectValue: 'setSelectValue',
	defaultValue: 'setDefaultValue',
	defaultValueUncontrolled: 'setDefaultValueUncontrolled',
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
function bakeStaticAttr(attrName, lv, tag, namespace = 'html') {
	if (lv == null) return '';
	const isCustom =
		(namespace === 'html' || namespace === 'opaque') && tag !== undefined && tag.includes('-');
	const lower = attrName.toLowerCase();
	// class/className compose clsx-style at every apply site. Literal false/null
	// drop above/below; every other literal writes the normalized class string.
	if (attrName === 'class') {
		if (lv === false) return '';
		const value = lv === true || lv === 0 ? '' : String(lv);
		return ` class="${escapeAttr(value)}"`;
	}
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
	if (typeof lv === 'string') {
		if (!isCustom && POSITIVE_NUMERIC_ATTR_PROPS.has(lower) && !(Number(lv) >= 1)) return '';
		if (
			!isCustom &&
			lv === '' &&
			(attrName === 'src' ||
				(attrName === 'href' && tag !== undefined && tag !== 'a' && tag !== 'area') ||
				(attrName === 'data' && tag === 'object'))
		) {
			return '';
		}
		const value = sanitizeURLAttribute(tag, attrName, lv);
		return ` ${attrName}="${escapeAttr(value)}"`;
	}
	if (typeof lv === 'number') {
		if (!isCustom && POSITIVE_NUMERIC_ATTR_PROPS.has(lower) && !(lv >= 1)) return '';
		return ` ${attrName}="${lv}"`;
	}
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

// React's raw-HTML contract is mutually exclusive with a non-nullish child.
// Static TSRX can reject definitely contradictory shapes before either the
// client or server renderer runs them. Preserve React's accepted null/undefined
// cases (used by option text supplied entirely through raw HTML); dynamic
// spreads and descriptor props retain the runtime validation in hasDangerHTML.
function isDefinitelyNullishJsxExpression(expression) {
	return (
		!expression ||
		expression.type === 'JSXEmptyExpression' ||
		(expression.type === 'Literal' && expression.value == null) ||
		(expression.type === 'Identifier' && expression.name === 'undefined') ||
		(expression.type === 'UnaryExpression' && expression.operator === 'void')
	);
}

function isDefinitelyNonNullishJsxExpression(expression) {
	if (!expression || expression.type === 'JSXEmptyExpression') return false;
	if (expression.type === 'Literal') return expression.value != null;
	if (
		expression.type === 'ObjectExpression' ||
		expression.type === 'ArrayExpression' ||
		expression.type === 'FunctionExpression' ||
		expression.type === 'ArrowFunctionExpression' ||
		expression.type === 'ClassExpression' ||
		expression.type === 'TemplateLiteral'
	)
		return true;
	return false;
}

function isSideEffectFreeDefinitelyNullishJsxExpression(expression) {
	return (
		!expression ||
		expression.type === 'JSXEmptyExpression' ||
		(expression.type === 'Literal' && expression.value == null)
	);
}

function hasPotentialDangerouslySetInnerHTML(node) {
	const attrs = node.attributes || node.openingElement?.attributes || [];
	return attrs.some(
		(attr) =>
			attr.type === 'SpreadAttribute' ||
			attr.type === 'JSXSpreadAttribute' ||
			((attr.type === 'Attribute' || attr.type === 'JSXAttribute') &&
				jsxAttrRawName(attr) === 'dangerouslySetInnerHTML'),
	);
}

function hasDefinitelyPresentDirectDangerouslySetInnerHTML(node) {
	const attrs = node.attributes || node.openingElement?.attributes || [];
	let state = false;
	for (const attr of attrs) {
		if (attr.type === 'SpreadAttribute' || attr.type === 'JSXSpreadAttribute') {
			// A later spread may overwrite or introduce the prop, so the effective
			// writer is no longer statically known. A following direct writer can
			// establish certainty again.
			state = null;
			continue;
		}
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
		if (jsxAttrRawName(attr) !== 'dangerouslySetInnerHTML') continue;
		const value = attr.value;
		if (value == null) {
			state = true;
			continue;
		}
		const expression = value.type === 'JSXExpressionContainer' ? value.expression : value;
		if (isDefinitelyNonNullishJsxExpression(expression)) state = true;
		else if (isDefinitelyNullishJsxExpression(expression)) state = false;
		else state = null;
	}
	return state === true;
}

function hasDefinitelyPresentDirectChildrenProp(node) {
	const attrs = node.attributes || node.openingElement?.attributes || [];
	let state = false;
	for (const attr of attrs) {
		if (attr.type === 'SpreadAttribute' || attr.type === 'JSXSpreadAttribute') {
			state = null;
			continue;
		}
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
		if (jsxAttrRawName(attr) !== 'children') continue;
		const value = attr.value;
		if (value == null) {
			state = true;
			continue;
		}
		const expression = value.type === 'JSXExpressionContainer' ? value.expression : value;
		if (isDefinitelyNonNullishJsxExpression(expression)) state = true;
		else if (isDefinitelyNullishJsxExpression(expression)) state = false;
		else state = null;
	}
	return state === true;
}

function hasOnlyDefinitelyNullishJsxChildren(children) {
	for (const child of children || []) {
		if (!child) continue;
		if (child.type === 'JSXText' && /^\s*$/.test(child.value)) continue;
		if (child.type === 'JSXStyleElement') continue;
		if (
			child.type === 'JSXExpressionContainer' &&
			isSideEffectFreeDefinitelyNullishJsxExpression(child.expression)
		)
			continue;
		return false;
	}
	return true;
}

// A void host may contain syntactic children that normalize to no content.
// Keep `void expr` in this set even though it can have side effects: the emitters
// still evaluate the expression once, after the attributes, before self-closing.
function hasOnlyPotentiallyNullishVoidChildren(children) {
	for (const child of children || []) {
		if (!child) continue;
		if (child.type === 'JSXText' && /^\s*$/.test(child.value)) continue;
		if (child.type === 'JSXStyleElement') continue;
		if (
			child.type === 'JSXExpressionContainer' &&
			!isDefinitelyNonNullishJsxExpression(child.expression)
		)
			continue;
		return false;
	}
	return true;
}

function semanticJsxChildCount(children) {
	let count = 0;
	for (const child of children || []) {
		if (!child) continue;
		if (child.type === 'JSXText' && /^\s*$/.test(child.value)) continue;
		if (child.type === 'JSXStyleElement') continue;
		if (
			child.type === 'JSXExpressionContainer' &&
			(!child.expression || child.expression.type === 'JSXEmptyExpression')
		)
			continue;
		count++;
	}
	return count;
}

// Whether JSX supplied an actual nested `children` writer. Whitespace-only text,
// comments, and style intrinsics are absent; a nullish expression is still a
// writer and therefore overwrites an earlier `children=` attribute/spread.
function hasSemanticJsxChildren(children) {
	return semanticJsxChildCount(children) > 0;
}

function hasDefinitelyNonNullishJsxChild(children, knownStringLocals) {
	for (const child of children || []) {
		if (!child) continue;
		if (child.type === 'JSXText') {
			if (!/^\s*$/.test(child.value)) return true;
			continue;
		}
		if (child.type === 'JSXStyleElement') continue;
		if (child.type === 'Element' || child.type === 'JSXElement') return true;
		if (
			child.type === 'IfStatement' ||
			child.type === 'JSXIfExpression' ||
			child.type === 'ForOfStatement' ||
			child.type === 'JSXForExpression' ||
			child.type === 'TryStatement' ||
			child.type === 'JSXTryExpression' ||
			child.type === 'SwitchStatement' ||
			child.type === 'JSXSwitchExpression' ||
			child.type === 'ActivityStatement' ||
			child.type === 'FoldedDirective'
		)
			return true;
		if (child.type === 'JSXExpressionContainer') {
			if (isDefinitelyNonNullishJsxExpression(child.expression)) return true;
			continue;
		}
		if (child.type === 'Text') {
			if (
				isDefinitelyNonNullishJsxExpression(child.expression) ||
				isKnownStringExpression(child.expression, knownStringLocals)
			)
				return true;
		}
	}
	return false;
}

function rejectDangerouslySetInnerHTMLChildren(_tag, node, ctx) {
	if (!hasDefinitelyPresentDirectDangerouslySetInnerHTML(node)) return;
	const hasNestedChildren = hasSemanticJsxChildren(node.children || []);
	if (
		(hasNestedChildren || !hasDefinitelyPresentDirectChildrenProp(node)) &&
		!hasDefinitelyNonNullishJsxChild(node.children || [], ctx.knownStringLocals)
	)
		return;

	const loc = node.loc?.start;
	const at = loc
		? ` (${ctx.mapSourceName ? ctx.mapSourceName + ':' : ''}${loc.line}:${loc.column})`
		: '';
	throw new Error('Can only set one of `children` or `props.dangerouslySetInnerHTML`.' + at);
}

// Compiler-generated code references runtime helpers under a collision-proof
// `_$` alias — `import { setText as _$setText } from 'octane'` + `_$setText(…)`
// — because generated statements are interleaved with USER statements inside
// the component function, where a user binding with the same name would
// silently shadow a bare helper (`const [text, setText] = useState('')` is the
// canonical collision). Every name in `ctx.runtimeNeeded` is emitted aliased;
// compiler-only profiling ABI names are tracked separately and imported from
// `octane/profiling`, keeping them off the main React-shaped namespace. Names
// the user's own code references (their preserved `octane` import
// specifiers + slotted base-hook call sites) live in `ctx.userRuntimeNames`
// and stay un-aliased. A name can appear in both (two import specifiers of
// the same export — valid JS).
export function rtAlias(name) {
	return '_$' + name;
}

// Renderer-specialized units share this compiler pass with their owning DOM
// module, but compiler-inserted hook helpers must execute against the child
// renderer's CURRENT_SCOPE. Each unit therefore supplies collision-proof
// aliases imported from its renderer runtime. Ordinary DOM code keeps the
// historical `_$name` aliases and merged `octane` import.
function runtimeAliasForContext(ctx, name) {
	return ctx._universalRuntimeUnit?.generatedRuntimeAliases?.[name] ?? rtAlias(name);
}

function requireRuntimeForContext(ctx, name) {
	const alias = ctx._universalRuntimeUnit?.generatedRuntimeAliases?.[name];
	if (alias !== undefined) return alias;
	ctx.runtimeNeeded.add(name);
	return rtAlias(name);
}

// Merge one import list: user specifiers verbatim (preserving `x as y`
// aliases) + every generated-code helper aliased to `_$name`.
function buildRuntimeImport(ctx, moduleName) {
	let out = '';
	for (const local of ctx.userRuntimeNamespaces || []) {
		out += `import * as ${local} from '${moduleName}';\n`;
	}
	for (const local of ctx.userRuntimeDefaults || []) {
		out += `import ${local} from '${moduleName}';\n`;
	}
	const specifiers = new Set(ctx.userRuntimeNames);
	for (const n of ctx.runtimeNeeded) {
		const alias =
			n === 'hookSlots' && ctx._hookSlotsHelperName ? ctx._hookSlotsHelperName : rtAlias(n);
		specifiers.add(`${n} as ${alias}`);
	}
	if (specifiers.size > 0) {
		out += `import { ${[...specifiers].sort().join(', ')} } from '${moduleName}';\n`;
	}
	return out === '' ? '' : out + '\n';
}

function buildProfileRuntimeImport(ctx) {
	const specifiers = [...ctx.profileRuntimeNeeded].map((name) => `${name} as ${rtAlias(name)}`);
	return specifiers.length === 0
		? ''
		: `import { ${specifiers.sort().join(', ')} } from 'octane/profiling';\n\n`;
}

// Record a user `import { … } from 'octane'` declaration's specifiers so the
// merged prelude import re-exposes exactly the local names the user's code
// references (including `imported as local` renames).
function addUserImportSpecifiers(ctx, node) {
	for (const sp of node.specifiers || []) {
		if (sp.type === 'ImportNamespaceSpecifier') {
			if (sp.local?.name) ctx.userRuntimeNamespaces.add(sp.local.name);
			continue;
		}
		if (sp.type === 'ImportDefaultSpecifier') {
			if (sp.local?.name) ctx.userRuntimeDefaults.add(sp.local.name);
			continue;
		}
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

/** Imported-name lookup used by hook slotting (including aliases/namespaces). */
function collectOctaneImportBindings(astBody) {
	const locals = new Map();
	const namespaces = new Set();
	// Local names bound by VALUE imports from any module OTHER than 'octane'. A
	// library may export a hook whose name collides with a base hook (`useId`
	// from a React-parity binding) — such a call site is that library's CUSTOM
	// hook, never the octane builtin, so the bare-name builtin classification in
	// rewriteHookCalls/slotKeyedHookName must not claim it (claiming it injects a
	// duplicate `useId` runtime import and calls the wrong function).
	const foreignLocals = new Set();
	for (const node of astBody) {
		if (node.type !== 'ImportDeclaration') continue;
		if (node.source.value !== 'octane') {
			if (node.importKind === 'type') continue;
			for (const sp of node.specifiers || []) {
				if (sp.importKind === 'type') continue;
				if (sp.local?.name) foreignLocals.add(sp.local.name);
			}
			continue;
		}
		for (const sp of node.specifiers || []) {
			if (sp.type === 'ImportSpecifier' && sp.local?.name && sp.imported?.name) {
				locals.set(sp.local.name, sp.imported.name);
			} else if (sp.type === 'ImportNamespaceSpecifier' && sp.local?.name) {
				namespaces.add(sp.local.name);
			}
		}
	}
	return { locals, namespaces, foreignLocals };
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
//   - the octane boundary builtins (Suspense / ErrorBoundary / Activity / Hydrate —
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
					imported === 'Hydrate' ||
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
	const namespaces = new Set();
	for (const node of astBody) {
		if (node.type === 'ImportDeclaration' && node.source.value === 'octane') {
			if (node.importKind === 'type') continue;
			for (const sp of node.specifiers || []) {
				if (sp.importKind === 'type') continue;
				if (sp.type === 'ImportNamespaceSpecifier' && sp.local?.name) {
					namespaces.add(sp.local.name);
					continue;
				}
				const imported = astName(sp.imported);
				if (isViewTransitionName(imported)) return true;
			}
			continue;
		}

		// A direct barrel re-export creates the same runtime dependency as a named
		// import. Arm the module itself so an app importing the alias gets the
		// sticky hint before its first transition can reveal a boundary.
		if (
			node.type === 'ExportNamedDeclaration' &&
			node.source?.value === 'octane' &&
			node.exportKind !== 'type'
		) {
			for (const sp of node.specifiers || []) {
				if (sp.exportKind !== 'type' && isViewTransitionName(astName(sp.local))) return true;
			}
		}
		// A star barrel can expose ViewTransition without naming it in this AST,
		// while the consuming module only sees the barrel's path. Conservatively arm
		// runtime export-stars (including `export * as Octane`) at the source module.
		if (
			node.type === 'ExportAllDeclaration' &&
			node.source?.value === 'octane' &&
			node.exportKind !== 'type'
		) {
			return true;
		}
	}
	if (namespaces.size === 0) return false;

	// Follow simple module-level namespace aliases to a fixed point (`const X =
	// Octane; const Y = X`). Consumers often shorten a namespace before using a
	// member tag, and the alias remains statically tied to the actual import. The
	// lexical walker below still rejects a same-named nested binding.
	let addedNamespace = true;
	while (addedNamespace) {
		addedNamespace = false;
		for (const statement of astBody) {
			const declaration =
				statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
			if (declaration?.type !== 'VariableDeclaration') continue;
			for (const declarator of declaration.declarations || []) {
				if (declarator.id?.type !== 'Identifier') continue;
				const init = unwrapTransparentExpression(declarator.init);
				if (init?.type !== 'Identifier' || !namespaces.has(init.name)) continue;
				if (!namespaces.has(declarator.id.name)) {
					namespaces.add(declarator.id.name);
					addedNamespace = true;
				}
			}
		}
	}

	// Namespace destructuring is another import alias form. Restrict this to
	// module-level declarations whose initializer is the ACTUAL imported
	// namespace; a similarly named object in a nested lexical scope is not
	// evidence that Octane's ViewTransition is used. Static computed string keys
	// are equivalent to identifier keys, while dynamic computed keys are not.
	for (const statement of astBody) {
		const declaration =
			statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
		if (declaration?.type !== 'VariableDeclaration') continue;
		for (const declarator of declaration.declarations || []) {
			const init = unwrapTransparentExpression(declarator.init);
			if (init?.type !== 'Identifier' || !namespaces.has(init.name)) continue;
			if (objectPatternReadsViewTransition(declarator.id)) return true;
		}
	}

	// A namespace import by itself is not evidence that the app uses view
	// transitions (`import * as Octane` is also a common hook style). Look for a
	// real, lexically-unshadowed member read/JSX tag so unrelated Suspense reveals
	// are not wrapped merely because the namespace exists (or because a callback
	// parameter happens to use the same name as the import).
	let found = false;
	const seen = new WeakSet();
	const walk = (node, shadowed) => {
		if (found || node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child, shadowed);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);

		// Type-only syntax cannot cause the runtime namespace to be read. Preserve
		// the handful of transparent TS expression wrappers, then skip other TS
		// nodes entirely.
		if (
			node.type === 'TSAsExpression' ||
			node.type === 'TSTypeAssertion' ||
			node.type === 'TSSatisfiesExpression' ||
			node.type === 'TSNonNullExpression' ||
			node.type === 'TSInstantiationExpression'
		) {
			walk(node.expression, shadowed);
			return;
		}
		if (node.type?.startsWith('TS')) return;

		if (node.type === 'MemberExpression' || node.type === 'JSXMemberExpression') {
			const objectName = node.object?.name;
			const propertyName = memberPropertyName(node);
			if (
				namespaces.has(objectName) &&
				!shadowed.has(objectName) &&
				isViewTransitionName(propertyName)
			) {
				found = true;
				return;
			}
			walk(node.object, shadowed);
			if (node.computed) walk(node.property, shadowed);
			return;
		}

		if (
			node.type === 'FunctionExpression' ||
			node.type === 'FunctionDeclaration' ||
			node.type === 'ArrowFunctionExpression'
		) {
			const inner = new Set(shadowed);
			for (const param of node.params || []) addNamespaceBindings(param, inner);
			if (node.id) addNamespaceBindings(node.id, inner);
			collectFunctionVarNamespaceBindings(node.body, inner);
			walk(node.body, inner);
			return;
		}

		if (node.type === 'BlockStatement') {
			const inner = new Set(shadowed);
			for (const statement of node.body || []) addDirectNamespaceBindings(statement, inner);
			walk(node.body, inner);
			return;
		}

		if (node.type === 'CatchClause') {
			const inner = new Set(shadowed);
			if (node.param) addNamespaceBindings(node.param, inner);
			walk(node.body, inner);
			return;
		}

		if (
			node.type === 'ForStatement' ||
			node.type === 'ForInStatement' ||
			node.type === 'ForOfStatement'
		) {
			const inner = new Set(shadowed);
			const left = node.type === 'ForStatement' ? node.init : node.left;
			if (left?.type === 'VariableDeclaration') {
				for (const declaration of left.declarations || []) {
					addNamespaceBindings(declaration.id, inner);
				}
			}
			walk(left, inner);
			walk(node.test, inner);
			walk(node.update, inner);
			walk(node.right, inner);
			walk(node.body, inner);
			return;
		}

		if (node.type === 'VariableDeclarator') {
			walk(node.init, shadowed);
			return;
		}

		if (node.type === 'ImportDeclaration') return;
		if (node.type === 'ExportNamedDeclaration') {
			if (node.exportKind !== 'type') walk(node.declaration, shadowed);
			return;
		}
		if (node.type === 'ExportDefaultDeclaration') {
			walk(node.declaration, shadowed);
			return;
		}
		for (const key in node) {
			if (key === 'type' || key === 'loc' || key === 'start' || key === 'end') continue;
			if (key === 'range' || key === 'metadata' || key === 'parent') continue;
			walk(node[key], shadowed);
		}
	};
	walk(astBody, new Set());
	return found;

	function isViewTransitionName(name) {
		return name === 'ViewTransition' || name === 'unstable_ViewTransition';
	}

	function astName(node) {
		if (node?.type === 'Identifier' || node?.type === 'JSXIdentifier') return node.name;
		return typeof node?.value === 'string' ? node.value : null;
	}

	function staticPropertyName(node, computed) {
		if (!computed) return astName(node);
		if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
		if (node?.type === 'TemplateLiteral' && (node.expressions?.length ?? 0) === 0) {
			return node.quasis?.[0]?.value?.cooked ?? null;
		}
		return null;
	}

	function memberPropertyName(node) {
		return staticPropertyName(node.property, node.computed === true);
	}

	function unwrapTransparentExpression(node) {
		while (
			node &&
			(node.type === 'TSAsExpression' ||
				node.type === 'TSTypeAssertion' ||
				node.type === 'TSSatisfiesExpression' ||
				node.type === 'TSNonNullExpression' ||
				node.type === 'ParenthesizedExpression')
		) {
			node = node.expression;
		}
		return node;
	}

	function objectPatternReadsViewTransition(pattern) {
		if (pattern?.type !== 'ObjectPattern') return false;
		for (const property of pattern.properties || []) {
			if (
				property.type === 'Property' &&
				isViewTransitionName(staticPropertyName(property.key, property.computed === true))
			) {
				return true;
			}
		}
		return false;
	}

	function addNamespaceBindings(pattern, shadowed) {
		const bindings = new Set();
		collectBindings(pattern, bindings);
		for (const name of bindings) {
			if (namespaces.has(name)) shadowed.add(name);
		}
	}

	function addDirectNamespaceBindings(statement, shadowed) {
		if (statement.type === 'VariableDeclaration') {
			for (const declaration of statement.declarations || []) {
				addNamespaceBindings(declaration.id, shadowed);
			}
			return;
		}
		if (
			(statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') &&
			statement.id
		) {
			addNamespaceBindings(statement.id, shadowed);
		}
	}

	function collectFunctionVarNamespaceBindings(node, shadowed) {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) collectFunctionVarNamespaceBindings(child, shadowed);
			return;
		}
		if (
			node.type === 'FunctionExpression' ||
			node.type === 'FunctionDeclaration' ||
			node.type === 'ArrowFunctionExpression'
		) {
			return;
		}
		if (node.type === 'VariableDeclaration' && node.kind === 'var') {
			for (const declaration of node.declarations || []) {
				addNamespaceBindings(declaration.id, shadowed);
			}
		}
		for (const key in node) {
			if (key === 'type' || key === 'loc' || key === 'start' || key === 'end') continue;
			if (key === 'range' || key === 'metadata' || key === 'parent') continue;
			collectFunctionVarNamespaceBindings(node[key], shadowed);
		}
	}
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
	if ((parentNs === 'html' || parentNs === 'opaque') && SVG_ONLY_TAGS.has(tag)) return 'svg';
	return parentNs; // includes <foreignObject> under an svg parent — itself SVG-ns
}

function nsForChildren(tag, parentNs) {
	if (tag === 'foreignObject') return 'html';
	if (tag === 'svg') return 'svg';
	if (tag === 'math') return 'mathml';
	if ((parentNs === 'html' || parentNs === 'opaque') && SVG_ONLY_TAGS.has(tag)) return 'svg';
	return parentNs;
}

function nsFlag(ns) {
	return ns === 'svg' ? 1 : ns === 'mathml' ? 2 : ns === 'opaque' ? 3 : 0;
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
function normalizeJsxAttrName(raw, tag, namespace = 'html') {
	// `className` → `class` applies EVERYWHERE, custom elements included (React
	// special-cases it in setPropOnCustomElement); only the alias table is raw.
	if (raw === 'className') return 'class';
	if ((namespace === 'html' || namespace === 'opaque') && tag !== undefined && tag.includes('-'))
		return raw;
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
 *   - useCallback returns
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
			if (init.type === 'CallExpression') {
				const callName = stableHookCallName(init);
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
				// x = useRef(...) / useCallback(...) — the
				// return value is stable for the lifetime of the component.
				if (
					(callName === 'useRef' || callName === 'useCallback') &&
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
 * Compute component-local values whose IDENTITY is guaranteed not to change
 * for the lifetime of the component. This is deliberately stricter than
 * `computeStableLocals`: that set answers whether an arrow is safe to wrap in
 * useCallback with dependencies, while this set is used to prove that a DOM
 * binding never needs to be written again after mount.
 *
 * A useCallback result only qualifies when every explicit dependency is itself
 * lifetime-stable. Compiler-auto-memoized arrows qualify when every
 * component-local capture is lifetime-stable; module captures do not affect
 * the memo's empty/stable dependency list.
 */
function computeInvariantLocals(statements, componentLocals, autoCallback) {
	const invariant = new Set();
	const invariantDep = (node) => {
		const value = unwrapTsExpr(node);
		return (
			isInvariantLiteral(value) ||
			(value && value.type === 'Identifier' && invariant.has(value.name))
		);
	};
	for (const stmt of statements) {
		// A `let`/`var` binding can be reassigned after initialization, even when
		// its initial hook result or arrow is stable. Only `const` proves the local
		// identifier itself keeps that identity for the component lifetime.
		if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') continue;
		for (const decl of stmt.declarations || []) {
			const rawInit = decl.init;
			const init = unwrapTsExpr(rawInit);
			if (!init) continue;
			if (init.type === 'CallExpression') {
				const callName = stableHookCallName(init);
				if (
					(callName === 'useState' || callName === 'useReducer') &&
					decl.id.type === 'ArrayPattern'
				) {
					const setter = decl.id.elements?.[1];
					const getter = decl.id.elements?.[2];
					if (setter?.type === 'Identifier') invariant.add(setter.name);
					if (getter?.type === 'Identifier') invariant.add(getter.name);
					continue;
				}
				if (callName === 'useRef' && decl.id.type === 'Identifier') {
					invariant.add(decl.id.name);
					continue;
				}
				if (callName === 'useCallback' && decl.id.type === 'Identifier') {
					const deps = unwrapTsExpr(init.arguments?.[1]);
					if (deps?.type === 'ArrayExpression' && deps.elements.every(invariantDep)) {
						invariant.add(decl.id.name);
					}
					continue;
				}
			}
			if (
				autoCallback &&
				rawInit?.type === 'ArrowFunctionExpression' &&
				decl.id.type === 'Identifier' &&
				isArrowStableOver(rawInit, invariant, componentLocals)
			) {
				invariant.add(decl.id.name);
			}
		}
	}
	return invariant;
}

/**
 * Values that are safe to install once specifically as native event handlers.
 * This is a strict superset of identity invariants: useEffectEvent deliberately
 * returns a fresh wrapper each render, but every wrapper for one hook cell calls
 * through the same latest-committed implementation. Keeping the mount wrapper
 * installed is therefore behaviorally invariant even though observing or
 * passing the freshly returned wrapper must retain its React identity semantics.
 */
function computeEventInvariantLocals(statements, identityInvariant) {
	const eventInvariant = new Set(identityInvariant);
	for (const stmt of statements) {
		if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') continue;
		for (const decl of stmt.declarations || []) {
			if (decl.id.type !== 'Identifier') continue;
			const init = unwrapTsExpr(decl.init);
			if (!init) continue;
			if (init.type === 'CallExpression' && stableHookCallName(init) === 'useEffectEvent') {
				eventInvariant.add(decl.id.name);
			} else if (init.type === 'Identifier' && eventInvariant.has(init.name)) {
				eventInvariant.add(decl.id.name);
			}
		}
	}
	return eventInvariant;
}

// Resolve only hook identities whose lexical provenance is trustworthy for
// stability analysis. `applyHookDependencies` annotates real Octane imports
// (including named aliases and namespace members) and genuinely unbound bare
// calls. A same-spelled local/parameter/module binding has neither annotation,
// so a factory named `useState` or `useEffectEvent` cannot make its fresh return
// value look lifetime-stable.
function stableHookCallName(call) {
	const imported = call?._octaneImportedHook;
	if (imported !== undefined && HOOK_NAMES.has(imported)) return imported;
	if (
		call?._octaneUnboundCallee === true &&
		call.callee?.type === 'Identifier' &&
		HOOK_NAMES.has(call.callee.name)
	) {
		return call.callee.name;
	}
	return null;
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

function allocAutoMemoCell(ctx, dependencyCount) {
	const base = ctx.currentAutoMemoOffset || 0;
	const init = base + dependencyCount;
	ctx.currentAutoMemoOffset = init + 1;
	return { base, init };
}

// An expression whose evaluation is side-effect free and whose value identity
// can witness a compiler-cache dependency: identifiers, invariant literals, and
// non-computed member paths that never traverse `current` (ref contents are
// mutable outside render, so a ref path is not a complete witness).
function isAutoMemoCalculationDependency(node) {
	node = unwrapTsExpr(node);
	if (!node || node.type === 'SpreadElement') return false;
	if (node.type === 'Identifier') return true;
	if (isInvariantLiteral(node)) return true;
	if (
		node.type === 'MemberExpression' &&
		!node.optional &&
		!node.computed &&
		node.property?.type === 'Identifier' &&
		node.property.name !== 'current'
	) {
		return isAutoMemoCalculationDependency(node.object);
	}
	return false;
}

// Compiler-owned callbacks that only ever feed lifetime-stable native event
// slots do not need a hook at all: the DOM slot is written only on mount, so the
// closure can be created in that same mount branch. This analysis deliberately
// recognizes a very small, auditable surface. Any setup escape, non-event JSX
// use, spread/duplicate writer, component boundary, directive, portal, or head
// use leaves the existing useCallback lowering intact.
function findMountEventCallbackSinks(statements, jsxNodes, stable, invariant, ctx) {
	if (ctx.hmr || ctx.profile || !ctx.currentComponentLocals) return new Map();

	const candidates = new Map();
	for (const stmt of statements) {
		if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') continue;
		for (const decl of stmt.declarations || []) {
			if (
				decl.id?.type === 'Identifier' &&
				decl.init?.type === 'ArrowFunctionExpression' &&
				stable.has(decl.id.name) &&
				invariant.has(decl.id.name)
			) {
				candidates.set(decl.id.name, { name: decl.id.name, arrow: decl.init, uses: 0 });
			}
		}
	}
	if (candidates.size === 0) return candidates;

	// A candidate mentioned anywhere in setup (including another callback,
	// effect, return, ref, or props construction) has escaped the event sink.
	const setupRefs = collectFreeIdentifiers(statements, []);
	for (const name of setupRefs) candidates.delete(name);
	if (candidates.size === 0) return candidates;

	const eligibleNodes = collectStaticEventCallbackRefs(
		jsxNodes,
		new Set(candidates.keys()),
		invariant,
	);
	for (const [name, candidate] of candidates) {
		const nodes = eligibleNodes.get(name);
		if (!nodes || nodes.size === 0) {
			candidates.delete(name);
			continue;
		}
		// Reuse the compiler's scope-aware free-reference walker as the escape
		// oracle. Temporarily hide the exact event-callee Identifier nodes; if the
		// candidate remains free, some other render position observes it.
		for (const node of nodes) node.name = '';
		let escaped;
		try {
			escaped = collectFreeIdentifiers(jsxNodes, []).has(name);
		} finally {
			for (const node of nodes) node.name = name;
		}
		if (escaped) candidates.delete(name);
		else candidate.uses = nodes.size;
	}
	return candidates;
}

function collectStaticEventCallbackRefs(root, candidateNames, invariant) {
	const refs = new Map();
	const add = (node) => {
		if (node?.type !== 'Identifier' || !candidateNames.has(node.name)) return;
		let nodes = refs.get(node.name);
		if (!nodes) refs.set(node.name, (nodes = new Set()));
		nodes.add(node);
	};
	const visit = (node) => {
		if (!node) return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (typeof node !== 'object') return;
		if (node.type === 'JSXFragment' || node.type === 'Tsrx' || node.type === 'Tsx') {
			visit(node.children);
			return;
		}
		if (node.type !== 'Element' && node.type !== 'JSXElement') return;
		// Component props/children are an ownership boundary; their callbacks may
		// be retained or compared independently of this component's DOM plan.
		if (isComponentTag(node)) return;
		const tag = node.id?.name || node.openingElement?.name?.name;
		// These HTML nodes are hoisted out of the body plan (SVG <title> is safe in
		// principle, but rejecting it here keeps the analysis namespace-agnostic).
		if (tag === 'title' || tag === 'meta' || tag === 'link' || tag === 'style') return;

		const attrs = node.attributes || node.openingElement?.attributes || [];
		const hasSpread = attrs.some(
			(a) => a.type === 'SpreadAttribute' || a.type === 'JSXSpreadAttribute',
		);
		const eventSlots = new Map();
		for (const attr of attrs) {
			if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
			const rawName = jsxAttrRawName(attr);
			if (!isEventAttrName(rawName)) continue;
			const slot = eventSlotKey(rawName);
			eventSlots.set(slot, (eventSlots.get(slot) || 0) + 1);
		}
		if (!hasSpread) {
			for (const attr of attrs) {
				if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
				const rawName = jsxAttrRawName(attr);
				if (!isEventAttrName(rawName) || eventSlots.get(eventSlotKey(rawName)) !== 1) continue;
				const value = attr.value;
				const expr = value?.type === 'JSXExpressionContainer' ? value.expression : value;
				if (expr?.type === 'Identifier') {
					add(expr);
				} else {
					const bundle = detectStableEventBundle(expr);
					if (
						bundle &&
						bundle.args.every((arg) => {
							const value = unwrapTsExpr(arg);
							return (
								isInvariantLiteral(value) ||
								(value?.type === 'Identifier' && invariant.has(value.name))
							);
						})
					) {
						add(bundle.callee);
					}
				}
			}
		}
		// Only direct static host descendants share this plan. Unknown expression
		// containers (including directives, portals, ternaries, and map callbacks)
		// are intentionally not traversed.
		for (const child of node.children || []) {
			if (
				child?.type === 'Element' ||
				child?.type === 'JSXElement' ||
				child?.type === 'JSXFragment' ||
				child?.type === 'Tsrx' ||
				child?.type === 'Tsx'
			) {
				visit(child);
			}
		}
	};
	visit(root);
	return refs;
}

function eventSlotKey(attrName) {
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
	return `${capture ? 'capture:' : ''}${rest === 'DoubleClick' ? 'dblclick' : rest.toLowerCase()}`;
}

function removeMountEventCallbackDeclarations(statements, sinks) {
	if (sinks.size === 0) return statements;
	const out = [];
	for (const stmt of statements) {
		if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') {
			out.push(stmt);
			continue;
		}
		const declarations = (stmt.declarations || []).filter(
			(decl) => decl.id?.type !== 'Identifier' || !sinks.has(decl.id.name),
		);
		if (declarations.length > 0) out.push({ ...stmt, declarations });
	}
	return out;
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

// Generated hook declarations live at module scope but are referenced from
// user scopes, so both top-level duplicates and nested shadowing are unsafe.
// Seed the allocator from lexical Identifier nodes (not raw source text, which
// would spuriously treat comments/strings as bindings), then reserve each name
// as it is emitted.
function collectIdentifierNames(root) {
	const names = new Set();
	const walk = (node) => {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (node.type === 'Identifier' && typeof node.name === 'string') names.add(node.name);
		for (const key in node) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(node[key]);
		}
	};
	walk(root);
	return names;
}

function allocCompilerName(ctx, preferred) {
	let name = preferred;
	while (ctx.usedCompilerNames.has(name)) name += '$';
	ctx.usedCompilerNames.add(name);
	return name;
}

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
			return;
		}
		// `module server {}` is represented with TypeScript's namespace container
		// nodes even though its body is runtime code. Isolation validation depends on
		// seeing those references; only the container name itself is non-reactive.
		if (t === 'TSModuleDeclaration' || t === 'TSModuleBlock') {
			walk(n.body, scope);
			return;
		}
		if (t.startsWith('TS')) return;

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
		// New TSRX template for-expression. Its item/index bindings are visible to
		// the key and body, but not to the iterable or @empty arm.
		if (t === 'JSXForExpression') {
			const newScope = new Set(scope);
			if (n.left?.type === 'VariableDeclaration') {
				for (const d of n.left.declarations || []) collectBindings(d.id, newScope);
			} else if (n.left) {
				collectBindings(n.left, newScope);
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
 * Classify the narrow opaque shape that an automatically memoized keyed item
 * may safely contain: ordinary JSX component calls, but no template control
 * flow or portals. Imported callees are validated at runtime on the first
 * render (only default memo boundaries remain reusable); same-module compiler
 * boundaries carry their own proof. Keeping this separate from the established
 * PURE/DEP-PURE predicate leaves its host-only contract unchanged.
 */
function hasOnlyComponentItemBoundaries(stmts) {
	let hasComponent = false;
	let disallowed = false;
	const seen = new WeakSet();
	function walk(n) {
		if (disallowed || !n) return;
		if (Array.isArray(n)) {
			for (const x of n) walk(x);
			return;
		}
		if (typeof n !== 'object') return;
		const t = n.type;
		if (!t || seen.has(n)) return;
		seen.add(n);
		if ((t === 'Element' || t === 'JSXElement') && isComponentTag(n)) {
			hasComponent = true;
		}
		if (
			t === 'IfStatement' ||
			t === 'ForOfStatement' ||
			t === 'TryStatement' ||
			t === 'SwitchStatement' ||
			t === 'JSXIfExpression' ||
			t === 'JSXForExpression' ||
			t === 'JSXTryExpression' ||
			t === 'JSXSwitchExpression'
		) {
			disallowed = true;
			return;
		}
		if (t === 'TSRXExpression' && n.expression && isCreatePortalCall(n.expression)) {
			disallowed = true;
			return;
		}
		if (t === 'JSXExpressionContainer' && n.expression && isCreatePortalCall(n.expression)) {
			disallowed = true;
			return;
		}
		for (const key in n) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(n[key]);
		}
	}
	for (const s of stmts) walk(s);
	return hasComponent && !disallowed;
}

function collectImportedComponentReferences(root, importedNames) {
	const components = new Set();
	const seen = new WeakSet();
	function walk(node) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if ((node.type === 'Element' || node.type === 'JSXElement') && isComponentTag(node)) {
			const tag = node.openingElement?.name || node.id || node.name;
			if (
				(tag?.type === 'Identifier' || tag?.type === 'JSXIdentifier') &&
				importedNames.has(tag.name)
			) {
				components.add(tag.name);
			}
		}
		for (const key in node) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(node[key]);
		}
	}
	walk(root);
	return components;
}

function containsAutoMemoContextRead(root, ctx) {
	let found = false;
	const seen = new WeakSet();
	function walk(node) {
		if (found || !node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (
			node.type === 'ArrowFunctionExpression' ||
			node.type === 'FunctionExpression' ||
			node.type === 'FunctionDeclaration'
		) {
			return;
		}
		if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
			const name = node._octaneImportedHook ?? ctx.octaneImportLocals?.get(node.callee.name);
			if (
				name === 'useContext' ||
				name === 'use' ||
				(name === undefined &&
					node._octaneUnboundCallee === true &&
					(node.callee.name === 'useContext' || node.callee.name === 'use'))
			) {
				found = true;
				return;
			}
		}
		for (const key in node) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(node[key]);
		}
	}
	walk(root);
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
		if (
			t === 'CallExpression' ||
			t === 'OptionalCallExpression' ||
			t === 'NewExpression' ||
			t === 'TaggedTemplateExpression'
		) {
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

// Conservative semantic boundary for compiler-owned component-region memoization.
// The cached region assumes React Compiler's pure-render / immutable-snapshot
// contract, but still fails closed for constructs whose commit or retry behavior
// needs a dedicated proof. Calls are checked separately by containsRenderCall.
function isRefCurrentMember(n) {
	if (n?.type !== 'MemberExpression') return false;
	return !n.computed
		? n.property?.type === 'Identifier' && n.property.name === 'current'
		: (n.property?.type === 'Literal' && n.property.value === 'current') ||
				(n.property?.type === 'TemplateLiteral' &&
					n.property.expressions?.length === 0 &&
					n.property.quasis?.[0]?.value?.cooked === 'current');
}

function containsDeferredRefRead(root) {
	let found = false;
	const seen = new WeakSet();
	function walk(n) {
		if (found || !n) return;
		if (Array.isArray(n)) {
			for (const item of n) walk(item);
			return;
		}
		if (typeof n !== 'object' || seen.has(n)) return;
		seen.add(n);
		if (n.type === 'MemberExpression' && (n.computed || isRefCurrentMember(n))) {
			// Without type information, an arbitrary computed access may be a disguised
			// ref read (`ref[key]`, where key is "current"). Decline rather than cache a
			// mutable value behind a stable object identity.
			found = true;
			return;
		}
		if (
			n.type === 'ObjectPattern' &&
			(n.properties || []).some(
				(property) =>
					property.computed ||
					property.key?.name === 'current' ||
					property.key?.value === 'current',
			)
		) {
			found = true;
			return;
		}
		for (const key in n) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(n[key]);
		}
	}
	walk(root);
	return found;
}

function containsImportedMemberRead(root, importedNames, includeJsx = true) {
	let found = false;
	const seen = new WeakSet();
	function walk(n) {
		if (found || !n) return;
		if (Array.isArray(n)) {
			for (const item of n) walk(item);
			return;
		}
		if (typeof n !== 'object' || seen.has(n)) return;
		seen.add(n);
		if (n.type === 'MemberExpression' || (includeJsx && n.type === 'JSXMemberExpression')) {
			let object = n;
			while (object?.type === 'MemberExpression' || object?.type === 'JSXMemberExpression') {
				object = object.object;
			}
			if (object?.type === 'Identifier' && importedNames.has(object.name)) {
				found = true;
				return;
			}
		}
		for (const key in n) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(n[key]);
		}
	}
	walk(root);
	return found;
}

function containsAutoMemoUnsafeStructure(stmts) {
	let found = false;
	const seen = new WeakSet();
	function walk(n) {
		if (found || !n) return;
		if (Array.isArray(n)) {
			for (const x of n) walk(x);
			return;
		}
		if (typeof n !== 'object' || !n.type || seen.has(n)) return;
		seen.add(n);
		const t = n.type;
		// Function values are deferred. Their captures are still collected by the
		// dependency walker, but calls/mutations inside them happen after render.
		if (
			t === 'ArrowFunctionExpression' ||
			t === 'FunctionExpression' ||
			t === 'FunctionDeclaration'
		) {
			// A callback passed to a component may be invoked synchronously during
			// that child's render. Keep mutable ref reads opaque even though ordinary
			// event-handler calls/mutations remain deferred.
			if (containsDeferredRefRead(n)) found = true;
			return;
		}
		if (
			t === 'AssignmentExpression' ||
			t === 'AssignmentPattern' ||
			t === 'UpdateExpression' ||
			t === 'ImportExpression' ||
			t === 'AwaitExpression' ||
			t === 'YieldExpression' ||
			t === 'ThrowStatement' ||
			t === 'TryStatement' ||
			t === 'JSXTryExpression' ||
			t === 'SpreadAttribute' ||
			t === 'JSXSpreadAttribute'
		) {
			found = true;
			return;
		}
		if (t === 'UnaryExpression' && n.operator === 'delete') {
			found = true;
			return;
		}
		if (
			(t === 'Property' ||
				t === 'ObjectMethod' ||
				t === 'MethodDefinition' ||
				t === 'ClassMethod') &&
			(n.kind === 'get' || n.kind === 'set' || n.method === true)
		) {
			// Accessors execute on a later property read, and object/class methods can
			// execute through implicit coercion. Their skipped function bodies would
			// otherwise hide mutable reads from this conservative proof.
			found = true;
			return;
		}
		if (t === 'MemberExpression') {
			if (n.computed || isRefCurrentMember(n)) {
				// Ref contents are mutable outside render; ref identity is not a complete
				// dependency witness. Any computed access may alias `ref.current` when the
				// property name is only known at runtime.
				found = true;
				return;
			}
		}
		if (
			t === 'ObjectPattern' &&
			(n.properties || []).some(
				(property) =>
					property.computed ||
					property.key?.name === 'current' ||
					property.key?.value === 'current',
			)
		) {
			// Computed binding keys execute arbitrary reads, while ref contents are
			// mutable outside render; neither has a complete dependency witness here.
			found = true;
			return;
		}
		if (t === 'Attribute' || t === 'JSXAttribute') {
			const name = n.name?.name || n.name;
			if (name === 'ref') {
				found = true;
				return;
			}
		}
		if (t === 'Element' || t === 'JSXElement') {
			const tag = n.openingElement?.name || n.id;
			if (
				tag?.type === 'JSXExpressionContainer' ||
				tag?.type === 'MemberExpression' ||
				tag?.type === 'JSXMemberExpression'
			) {
				found = true;
				return;
			}
			const name = tag?.name;
			if (
				name === 'Suspense' ||
				name === 'ErrorBoundary' ||
				name === 'ViewTransition' ||
				name === 'Activity'
			) {
				found = true;
				return;
			}
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
	// Anonymous default functions stay on the generic value-lowering path. The
	// specialized path needs a stable declaration binding, while ESM correctly
	// infers the anonymous default's public function name without one.
	if (node.id == null) return false;
	if (node.async || node.generator) return false;
	if (!node.body || node.body.type !== 'BlockStatement') return false;
	return (node.body.body || []).some(
		(s) => s.type === 'ReturnStatement' && s.argument && isJsxNode(s.argument),
	);
}

/** True when `node` is one plain lowercase host element (never a component/fragment). */
function isPlainHostRoot(node) {
	return (
		node != null &&
		(node.type === 'JSXElement' || node.type === 'Element') &&
		!isComponentTag(node) &&
		typeof (node.id?.name ?? node.openingElement?.name?.name) === 'string'
	);
}

function statementsOf(node) {
	if (node == null) return [];
	return node.type === 'BlockStatement' ? node.body || [] : [node];
}

function isIfDirective(node) {
	return node?.type === 'IfStatement' || node?.type === 'JSXIfExpression';
}

/**
 * A directive @if/@else whose every reachable arm emits exactly one plain
 * host. The chosen tag may change, but the item always owns one element; the
 * runtime propagates a branch replacement to enclosing shared boundaries.
 */
function isSingleHostIfRoot(node) {
	if (!isIfDirective(node) || node.alternate == null) return false;
	const armIsSingleHost = (arm) => {
		if (isIfDirective(arm)) return isSingleHostIfRoot(arm);
		const render = statementsOf(arm).filter((s) => isJsxNode(s) || isIfDirective(s));
		return render.length === 1 && isPlainHostRoot(render[0]);
	};
	return armIsSingleHost(node.consequent) && armIsSingleHost(node.alternate);
}

/**
 * True when an @for item is one direct host root on the wire.
 *
 * This is deliberately narrower than the client-only singleRoot proof below:
 * a sole component or host-vs-host @if can self-delimit after a fresh client
 * mount, but its current SSR representation still begins with that construct's
 * own hydration markers. A direct host always begins with the row element, so
 * the hydrator can use it as the keyed item boundary without an item pair.
 */
function isSsrMarkerlessForItem(node) {
	const body = node?.body?.body || [];
	const jsxChildren = body.filter((s) => isJsxNode(s));
	return jsxChildren.length === 1 && isPlainHostRoot(jsxChildren[0]);
}

/**
 * Whether a function can return a VALUE from its own body before reaching its
 * compiled output. Nested functions are separate execution scopes and do not
 * affect the component's return contract. A bare `return;` remains void and is
 * therefore safe for the void-output path.
 *
 * This intentionally treats syntactically present value returns as reachable.
 * Conservative false negatives only retain the generic runtime path; trying to
 * prove arbitrary JavaScript control-flow here would make the size optimization
 * much harder to audit.
 */
export function hasOwnValueReturn(node) {
	const body = node?.body;
	if (!body || (body.type !== 'JSXCodeBlock' && body.type !== 'BlockStatement')) return false;
	const seen = new WeakSet();
	const walk = (value) => {
		if (!value || typeof value !== 'object') return false;
		if (Array.isArray(value)) {
			for (const child of value) if (walk(child)) return true;
			return false;
		}
		if (seen.has(value)) return false;
		seen.add(value);
		if (
			value.type === 'FunctionDeclaration' ||
			value.type === 'FunctionExpression' ||
			value.type === 'ArrowFunctionExpression'
		)
			return false;
		if (value.type === 'ReturnStatement' && value.argument != null) return true;
		for (const key in value) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			if (walk(value[key])) return true;
		}
		return false;
	};
	return walk(body.body || []);
}

/** A compiled `@{}` function whose observable JavaScript return is always void. */
export function isVoidJsxCodeBlockFunction(node) {
	return (
		node != null &&
		(node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression') &&
		node.async !== true &&
		node.generator !== true &&
		node.body?.type === 'JSXCodeBlock' &&
		!hasOwnValueReturn(node)
	);
}

/**
 * Prove that a component always returns one host element.
 *
 * TSRX's `@{}` form carries that output as `body.render`. Ordinary TSX keeps a
 * real `return`; accept only a final host-element return and reject any other
 * component-level return (including one nested in control flow). Nested
 * callbacks are separate functions and do not affect the component's shape.
 */
function singleHostComponentRoot(node) {
	if (node?.body?.type === 'JSXCodeBlock') {
		return isVoidJsxCodeBlockFunction(node) && isPlainHostRoot(node.body.render);
	}
	if (node?.body?.type !== 'BlockStatement') return false;
	const stmts = node.body.body || [];
	const final = stmts[stmts.length - 1];
	if (!final || final.type !== 'ReturnStatement' || !isPlainHostRoot(final.argument)) return false;

	let returns = 0;
	const seen = new WeakSet();
	const walk = (n) => {
		if (!n || typeof n !== 'object') return;
		if (seen.has(n)) return;
		seen.add(n);
		if (
			n !== node &&
			(n.type === 'FunctionDeclaration' ||
				n.type === 'FunctionExpression' ||
				n.type === 'ArrowFunctionExpression')
		)
			return;
		if (n.type === 'ReturnStatement') returns++;
		for (const key in n) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(n[key]);
		}
	};
	walk(node.body);
	return returns === 1;
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

// ---------------------------------------------------------------------------
// `module server` analysis + emit
// ---------------------------------------------------------------------------

function isServerModuleDeclaration(node) {
	return (
		node?.type === 'TSModuleDeclaration' &&
		node.declare !== true &&
		node.metadata?.module_keyword === 'module'
	);
}

function identifierName(node) {
	if (node?.type === 'Identifier') return node.name;
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	return null;
}

function unwrapServerFunctionInitializer(node) {
	let current = node;
	while (
		current &&
		(current.type === 'TSAsExpression' ||
			current.type === 'TSSatisfiesExpression' ||
			current.type === 'TSNonNullExpression' ||
			current.type === 'TypeCastExpression' ||
			current.type === 'ParenthesizedExpression')
	) {
		current = current.expression;
	}
	return current;
}

function collectServerFunctionBindings(statements) {
	const functions = new Set();
	const aliases = new Map();

	for (const statement of statements) {
		const declaration =
			statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
		if (!declaration || isTypeOnlyStatement(declaration)) continue;
		if (declaration.type === 'FunctionDeclaration' && declaration.id) {
			functions.add(declaration.id.name);
			continue;
		}
		if (declaration.type !== 'VariableDeclaration') continue;
		for (const item of declaration.declarations || []) {
			if (item.id?.type !== 'Identifier' || !item.init) continue;
			const init = unwrapServerFunctionInitializer(item.init);
			if (init?.type === 'FunctionExpression' || init?.type === 'ArrowFunctionExpression') {
				functions.add(item.id.name);
			} else if (init?.type === 'Identifier') {
				aliases.set(item.id.name, init.name);
			}
		}
	}

	let changed = true;
	while (changed) {
		changed = false;
		for (const [local, target] of aliases) {
			if (!functions.has(local) && functions.has(target)) {
				functions.add(local);
				changed = true;
			}
		}
	}
	return functions;
}

function collectStatementBindings(statement, out) {
	if (statement?.type === 'ExportNamedDeclaration') {
		for (const specifier of statement.specifiers || []) {
			if (specifier.local) collectBindings(specifier.local, out);
			if (specifier.exported) collectBindings(specifier.exported, out);
		}
	}
	const declaration =
		statement?.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
	if (!declaration) return;
	if (declaration.type === 'ImportDeclaration') {
		for (const specifier of declaration.specifiers || []) {
			if (specifier.local) collectBindings(specifier.local, out);
			// collectFreeIdentifiers treats an ImportSpecifier's imported name as
			// an identifier reference; mark that syntax position as local too.
			if (specifier.imported) collectBindings(specifier.imported, out);
		}
	} else if (declaration.type === 'VariableDeclaration') {
		for (const item of declaration.declarations || []) collectBindings(item.id, out);
	} else if (
		(declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') &&
		declaration.id
	) {
		collectBindings(declaration.id, out);
	}
}

function validateServerModuleIsolation(ast, declaration, filename) {
	const outerBindings = new Set();
	for (const statement of ast.body) {
		if (
			statement !== declaration &&
			!(statement.type === 'ImportDeclaration' && statement.source?.value === 'server')
		) {
			collectStatementBindings(statement, outerBindings);
		}
	}
	if (outerBindings.size === 0) return;

	const serverBindings = new Set();
	for (const statement of declaration.body?.body || []) {
		collectStatementBindings(statement, serverBindings);
	}
	const free = collectFreeIdentifiers(declaration.body, serverBindings);
	const captures = [...free].filter((name) => outerBindings.has(name)).sort();
	if (captures.length > 0) {
		throw new Error(
			`\`module server\` cannot reference client-module bindings (${captures.join(', ')}) in ${filename}; declare or import them inside the server block.`,
		);
	}
}

function assertServerModulesAreTopLevel(ast, filename) {
	const topLevel = new Set(ast.body);
	const seen = new WeakSet();
	function walk(node) {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (isServerModuleDeclaration(node) && !topLevel.has(node)) {
			throw new Error(`\`module server\` can only be declared at module level (${filename}).`);
		}
		for (const [key, value] of Object.entries(node)) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			if (Array.isArray(value)) {
				for (const child of value) walk(child);
			} else {
				walk(value);
			}
		}
	}
	walk(ast);
}

/**
 * Validate the file-local server submodule contract once, before either
 * client or server codegen mutates the AST.
 */
function analyzeServerModule(ast, filename) {
	assertServerModulesAreTopLevel(ast, filename);
	let declaration = null;
	const imports = [];
	/** @type {Map<string, string>} exported name -> local name */
	const exports = new Map();

	for (const node of ast.body) {
		if (isServerModuleDeclaration(node)) {
			const name = identifierName(node.id);
			if (name !== 'server') {
				throw new Error(
					`Octane only supports \`module server\` submodules, found \`module ${name ?? '<unknown>'}\` in ${filename}.`,
				);
			}
			if (declaration !== null) {
				throw new Error(
					`Only one \`module server\` declaration is allowed per file (${filename}).`,
				);
			}
			declaration = node;
		}
		if (node.type === 'ImportDeclaration' && node.source?.value === 'server') {
			if (node.importKind === 'type') continue;
			const valueSpecifiers = (node.specifiers || []).filter(
				(specifier) => specifier.importKind !== 'type',
			);
			for (const specifier of valueSpecifiers) {
				if (specifier.type !== 'ImportSpecifier') {
					throw new Error('Only named imports are supported from `module server`.');
				}
			}
			if (valueSpecifiers.length > 0) imports.push(node);
		}
	}

	if (declaration === null) {
		if (imports.length > 0) {
			throw new Error(
				`Cannot import from \`server\` because ${filename} has no \`module server\` declaration.`,
			);
		}
		return null;
	}

	const statements = declaration.body?.body || [];
	validateServerModuleIsolation(ast, declaration, filename);
	const functionBindings = collectServerFunctionBindings(statements);
	for (const statement of statements) {
		if (statement.type === 'ExportDefaultDeclaration') {
			throw new Error('`module server` does not support default exports; use named functions.');
		}
		if (statement.type === 'ExportAllDeclaration') {
			throw new Error('`module server` does not support export-all declarations.');
		}
		if (statement.type !== 'ExportNamedDeclaration' || statement.exportKind === 'type') continue;
		if (statement.source) {
			throw new Error('`module server` does not support re-exports from another module.');
		}

		const decl = statement.declaration;
		if (decl) {
			if (decl.type === 'FunctionDeclaration' && decl.id) {
				exports.set(decl.id.name, decl.id.name);
			} else if (decl.type === 'VariableDeclaration') {
				for (const item of decl.declarations || []) {
					if (item.id?.type !== 'Identifier') {
						throw new Error('`module server` exported variables must use identifier bindings.');
					}
					if (!functionBindings.has(item.id.name)) {
						throw new Error(
							'`module server` exported variables must be initialized with a function.',
						);
					}
					exports.set(item.id.name, item.id.name);
				}
			} else if (!isTypeOnlyStatement(decl)) {
				throw new Error('`module server` exports must be functions or function-valued variables.');
			}
		}

		for (const specifier of statement.specifiers || []) {
			if (specifier.exportKind === 'type') continue;
			const local = identifierName(specifier.local);
			const exported = identifierName(specifier.exported);
			if (local && exported) {
				if (!functionBindings.has(local)) {
					throw new Error('`module server` export specifiers must reference local functions.');
				}
				exports.set(exported, local);
			}
		}
	}

	for (const node of imports) {
		for (const specifier of node.specifiers) {
			if (specifier.importKind === 'type') continue;
			const imported = identifierName(specifier.imported);
			if (imported !== null && !exports.has(imported)) {
				throw new Error(`Module \`server\` does not export \`${imported}\` in ${filename}.`);
			}
		}
	}

	return { declaration, imports, exports, filename };
}

function indentCode(code, spaces = 1) {
	const prefix = '\t'.repeat(spaces);
	return prefix + code.replace(/\n/g, '\n' + prefix);
}

/**
 * Emit the server namespace itself for SSR, or RPC stubs for the browser.
 * Synthetic `from 'server'` imports are file-local and are always emitted
 * before ordinary module statements, independent of source order.
 */
function emitServerModulePrelude(info, ctx) {
	if (info === null) return '';
	let code = '';

	if (ctx.mode === 'server') {
		const body = [];
		const importLocals = [];
		let importIndex = 0;

		for (const statement of info.declaration.body?.body || []) {
			if (isTypeOnlyStatement(statement)) continue;
			if (statement.type === 'ImportDeclaration') {
				if (statement.importKind === 'type') continue;
				const valueSpecifiers = (statement.specifiers || []).filter(
					(specifier) => specifier.importKind !== 'type',
				);
				if ((statement.specifiers || []).length === 0) {
					code += `import ${JSON.stringify(statement.source.value)};\n`;
					continue;
				}
				if (valueSpecifiers.length === 0) continue;
				const moduleName = `__oct_server_import$${importIndex++}`;
				code += `import * as ${moduleName} from ${JSON.stringify(statement.source.value)};\n`;
				for (const specifier of valueSpecifiers) {
					const local = specifier.local?.name;
					if (!local) continue;
					if (specifier.type === 'ImportNamespaceSpecifier') {
						importLocals.push(`const ${local} = ${moduleName};`);
					} else if (specifier.type === 'ImportDefaultSpecifier') {
						importLocals.push(`const ${local} = ${moduleName}.default;`);
					} else {
						const imported = identifierName(specifier.imported);
						importLocals.push(`const ${local} = ${moduleName}[${JSON.stringify(imported)}];`);
					}
				}
				continue;
			}

			if (statement.type === 'ExportDefaultDeclaration') continue;
			if (statement.type === 'ExportNamedDeclaration') {
				if (statement.declaration && !isTypeOnlyStatement(statement.declaration)) {
					body.push(printNode(statement.declaration));
				}
				continue;
			}
			body.push(printNode(statement));
		}

		code += 'export const _$_server_$_ = (() => {\n';
		code += '\tconst server = {};\n';
		for (const line of importLocals) code += indentCode(line) + '\n';
		for (const statement of body) code += indentCode(statement) + '\n';
		for (const [exported, local] of info.exports) {
			code += `\tserver[${JSON.stringify(exported)}] = ${local};\n`;
		}
		code += '\treturn server;\n})();\n';

		// Dev SSR initializes this map before loading the route module. Register
		// hash -> [module path, export] so the request handler can lazy-load the
		// same Vite module and resolve the real function.
		if (info.exports.size > 0) {
			code += 'const _$_rpc_modules_$_ = globalThis.rpc_modules;\n';
			code += 'if (_$_rpc_modules_$_) {\n';
			for (const exported of info.exports.keys()) {
				const hash = strongHash(info.filename + '#' + exported);
				code += `\t_$_rpc_modules_$_.set(${JSON.stringify(hash)}, [${JSON.stringify(info.filename)}, ${JSON.stringify(exported)}]);\n`;
			}
			code += '}\n';
		}
	}

	for (const node of info.imports) {
		for (const specifier of node.specifiers) {
			if (specifier.importKind === 'type') continue;
			const imported = identifierName(specifier.imported);
			const local = specifier.local?.name;
			if (!imported || !local) continue;
			if (ctx.mode === 'server') {
				code += `const ${local} = _$_server_$_[${JSON.stringify(imported)}];\n`;
			} else {
				ctx.runtimeNeeded.add('__serverRpc');
				const hash = strongHash(info.filename + '#' + imported);
				code += `const ${local} = (...args) => _$__serverRpc(${JSON.stringify(hash)}, args);\n`;
			}
		}
	}

	return code === '' ? '' : code + '\n';
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

/** Embed anonymous-default root LOC without changing its ESM identity semantics. */
function stampAnonymousDefaultFunctionLoc(node, ctx) {
	if (!ctx.dev || node?.type !== 'ExportDefaultDeclaration') return node;
	const declaration = unwrapTsExpr(node.declaration);
	if (
		(declaration?.type !== 'ArrowFunctionExpression' &&
			declaration?.type !== 'FunctionExpression' &&
			declaration?.type !== 'FunctionDeclaration') ||
		declaration.id != null
	)
		return node;
	const loc = devLoc(ctx, declaration);
	if (loc === undefined) return node;
	// Keep the function itself as the direct ExportDefaultDeclaration value. ESM
	// then retains the inferred public name "default", and an anonymous default
	// function declaration keeps its instantiation/hoisting behavior in cycles.
	// The mismatch path reads this inert DEV-only directive from Function#toString
	// when no binding exists on which the normal __oct_loc metadata can live.
	const payload = encodeURIComponent(`${ctx.mapSourceName}:${loc[0]}:${loc[1]}`).replace(
		/'/g,
		'%27',
	);
	const marker = {
		type: 'ExpressionStatement',
		expression: { type: 'Literal', value: `__octane_loc:${payload}` },
	};
	let stamped;
	if (
		declaration.type === 'ArrowFunctionExpression' &&
		declaration.body.type !== 'BlockStatement'
	) {
		stamped = {
			...declaration,
			expression: false,
			body: {
				type: 'BlockStatement',
				body: [marker, { type: 'ReturnStatement', argument: declaration.body }],
			},
		};
	} else if (declaration.body?.type === 'BlockStatement') {
		stamped = {
			...declaration,
			body: { ...declaration.body, body: [marker, ...(declaration.body.body || [])] },
		};
	} else {
		return node;
	}
	const replaceInner = (current) => {
		if (current === declaration) return stamped;
		if (
			current &&
			(current.type === 'TSAsExpression' ||
				current.type === 'TSNonNullExpression' ||
				current.type === 'TSTypeAssertion' ||
				current.type === 'TSSatisfiesExpression' ||
				current.type === 'ParenthesizedExpression')
		) {
			return { ...current, expression: replaceInner(current.expression) };
		}
		return current;
	};
	return {
		...node,
		declaration: replaceInner(node.declaration),
	};
}

function profileSourceLoc(node) {
	const loc = node?._octaneProfileLoc ?? node?.loc?.start;
	return {
		line: loc?.line ?? 0,
		column: loc?.column ?? 0,
	};
}

function profileComponentId(ctx, componentName, node) {
	const loc = profileSourceLoc(node);
	return `${ctx.profileFilename || '<anon>'}#${componentName}@${loc.line}:${loc.column}`;
}

function profileOwner(ctx, node, name) {
	return {
		name,
		id: profileComponentId(ctx, name, node),
	};
}

function profileComponentMetadata(ctx, node, name, identityName = name) {
	const loc = profileSourceLoc(node);
	return {
		id: profileComponentId(ctx, identityName, node),
		name,
		file: ctx.profileFilename || '<anon>',
		line: loc.line,
		column: loc.column,
		kind: 'component',
	};
}

function recordProfileComponent(ctx, node, name, identityName = name) {
	if (!ctx.profile) return;
	const metadata = profileComponentMetadata(ctx, node, name, identityName);
	if (ctx.profileComponentIds.has(metadata.id)) return;
	ctx.profileComponentIds.add(metadata.id);
	ctx.profileComponents.push(metadata);
}

function profileMetadataAst(metadata) {
	return {
		type: 'ObjectExpression',
		properties: Object.entries(metadata).map(([key, value]) => ({
			type: 'Property',
			key: { type: 'Identifier', name: key },
			value: { type: 'Literal', value, raw: JSON.stringify(value) },
			kind: 'init',
			method: false,
			shorthand: false,
			computed: false,
		})),
	};
}

function profileRegistrationAst(bindingName, metadata) {
	return {
		type: 'ExpressionStatement',
		expression: {
			type: 'CallExpression',
			callee: { type: 'Identifier', name: '_$__profileComponent' },
			arguments: [{ type: 'Identifier', name: bindingName }, profileMetadataAst(metadata)],
			optional: false,
		},
	};
}

function profileComponentCallAst(value, metadata) {
	return {
		type: 'CallExpression',
		callee: { type: 'Identifier', name: '_$__profileComponent' },
		arguments: [value, profileMetadataAst(metadata)],
		optional: false,
	};
}

function nodeContainsJsx(node) {
	if (node == null || typeof node !== 'object') return false;
	if (Array.isArray(node)) return node.some(nodeContainsJsx);
	if (isJsxNode(node)) return true;
	for (const key in node) {
		if (AST_WALK_SKIP_KEYS.has(key)) continue;
		if (nodeContainsJsx(node[key])) return true;
	}
	return false;
}

function functionProducesJsx(node) {
	if (
		!node ||
		(node.type !== 'FunctionDeclaration' &&
			node.type !== 'FunctionExpression' &&
			node.type !== 'ArrowFunctionExpression')
	) {
		return false;
	}
	if (node.body?.type === 'JSXCodeBlock') return true;
	if (node.type === 'ArrowFunctionExpression' && node.expression) {
		return nodeContainsJsx(node.body);
	}
	if (node.body?.type !== 'BlockStatement') return false;

	let found = false;
	const visitStatement = (statement) => {
		if (found || statement == null || typeof statement !== 'object') return;
		if (
			statement !== node.body &&
			(statement.type === 'FunctionDeclaration' ||
				statement.type === 'FunctionExpression' ||
				statement.type === 'ArrowFunctionExpression')
		) {
			return;
		}
		if (statement.type === 'ReturnStatement' && nodeContainsJsx(statement.argument)) {
			found = true;
			return;
		}
		for (const key in statement) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			const value = statement[key];
			if (Array.isArray(value)) {
				for (const child of value) visitStatement(child);
			} else {
				visitStatement(value);
			}
		}
	};
	for (const statement of node.body.body || []) visitStatement(statement);
	return found;
}

function profileFactoryName(node, ctx) {
	const value = unwrapTsExpr(node);
	if (!value || value.type !== 'CallExpression') return null;
	const callee = value.callee;
	if (callee?.type === 'Identifier') {
		const imported = ctx.octaneImportLocals?.get(callee.name);
		return imported === 'memo' || imported === 'lazy' ? imported : null;
	}
	if (
		callee?.type === 'MemberExpression' &&
		!callee.computed &&
		callee.object?.type === 'Identifier' &&
		callee.property?.type === 'Identifier' &&
		ctx.octaneImportNamespaces?.has(callee.object.name) &&
		(callee.property.name === 'memo' || callee.property.name === 'lazy')
	) {
		return callee.property.name;
	}
	return null;
}

function isProfileComponentValue(node, ctx, bindingName) {
	const value = unwrapTsExpr(node);
	const isFunction =
		value?.type === 'FunctionDeclaration' ||
		value?.type === 'FunctionExpression' ||
		value?.type === 'ArrowFunctionExpression';
	return (
		functionProducesJsx(value) ||
		(isFunction && bindingName !== undefined && ctx.profileComponentCandidates.has(bindingName)) ||
		profileFactoryName(value, ctx) !== null
	);
}

function collectProfileComponentCandidates(ast) {
	const names = new Set();
	const walk = (node) => {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if ((node.type === 'Element' || node.type === 'JSXElement') && isComponentTag(node)) {
			const tag = node.openingElement?.name || node.id;
			if (
				(tag?.type === 'Identifier' || tag?.type === 'JSXIdentifier') &&
				typeof tag.name === 'string'
			) {
				names.add(tag.name);
			}
		}
		if (node.type === 'ExportNamedDeclaration') {
			const declaration = node.declaration;
			if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) {
				names.add(declaration.id.name);
			} else if (declaration?.type === 'VariableDeclaration') {
				for (const item of declaration.declarations || []) {
					if (item.id?.type === 'Identifier') names.add(item.id.name);
				}
			}
			for (const specifier of node.specifiers || []) {
				if (specifier.local?.name) names.add(specifier.local.name);
			}
		} else if (node.type === 'ExportDefaultDeclaration') {
			const declaration = node.declaration;
			if (declaration?.type === 'Identifier') names.add(declaration.name);
			else names.add(declaration?.id?.name || 'default');
		}
		for (const key in node) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(node[key]);
		}
	};
	walk(ast);
	return names;
}

// Profile builds retain the lexical owner of hook calls in generic TS/TSX
// function shapes. The normal compiler passes one owner name into a whole
// passthrough statement, which is sufficient for slot identity but would label
// hooks inside `const A = memo(() => …)` as belonging to `module` or its outer
// function. A non-enumerable annotation keeps this profiling-only fact out of
// printers, source maps, and ordinary compiler output.
function annotateProfileHookOwners(root, ctx) {
	const walk = (node, owner, boundOwner = false) => {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child, owner, false);
			return;
		}
		if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
			const init = unwrapTsExpr(node.init);
			if (
				init?.type === 'FunctionExpression' ||
				init?.type === 'ArrowFunctionExpression' ||
				profileFactoryName(init, ctx) !== null
			) {
				walk(node.init, profileOwner(ctx, node.id, node.id.name), true);
				return;
			}
		}
		if (
			node.type === 'ExportDefaultDeclaration' &&
			isProfileComponentValue(node.declaration, ctx, 'default')
		) {
			const name = node.declaration?.id?.name || 'default';
			walk(node.declaration, profileOwner(ctx, node.declaration, name), true);
			return;
		}
		let nextOwner = owner;
		if (
			(node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') &&
			node.id?.name &&
			!boundOwner
		) {
			nextOwner = profileOwner(ctx, node, node.id.name);
		}
		if (node.type === 'CallExpression') {
			const authoredOwner = node._octaneUniversalProfileOwner;
			Object.defineProperty(node, '_octaneProfileOwner', {
				value: authoredOwner ?? nextOwner,
				configurable: true,
			});
		}
		for (const key in node) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			const value = node[key];
			if (boundOwner && node.type === 'CallExpression' && profileFactoryName(node, ctx) !== null) {
				if (key === 'arguments') {
					const [component, ...rest] = value || [];
					walk(component, nextOwner, true);
					for (const child of rest) walk(child, owner, false);
				} else {
					walk(value, owner, false);
				}
				continue;
			}
			walk(value, nextOwner, false);
		}
	};
	walk(root, profileOwner(ctx, null, 'module'), false);
}

// Register generic component forms which do not enter compileComponent or
// compileReturnJsxFunction: expression-bodied arrows, function expressions,
// conditional JSX returns, and memo/lazy wrappers. Variable-bound values are
// registered inline at initialization (the helper returns the same identity);
// declarations register immediately after their declaration, or at the module
// tail for top-level/HMR-safe handoff ordering.
function instrumentProfileComponents(ast, ctx) {
	const visitStatementList = (statements, topLevel) => {
		const output = [];
		for (const statement of statements || []) {
			visitNode(statement);
			output.push(statement);
			let declaration = statement;
			if (
				statement.type === 'ExportNamedDeclaration' ||
				statement.type === 'ExportDefaultDeclaration'
			) {
				declaration = statement.declaration;
			}
			if (
				declaration?.type === 'FunctionDeclaration' &&
				declaration.id?.name &&
				(functionProducesJsx(declaration) ||
					ctx.profileComponentCandidates.has(declaration.id.name))
			) {
				const name = declaration.id.name;
				if (topLevel) {
					const metadata = profileComponentMetadata(ctx, declaration, name);
					recordProfileComponent(ctx, declaration, name);
					ctx.profileRuntimeNeeded.add('__profileComponent');
					// A module may synchronously render a declaration from a later
					// top-level statement. Register it here so that first mount has
					// authored metadata; the retained module-tail registration still
					// reattaches metadata to Rspack's post-handoff HMR wrapper.
					output.push(profileRegistrationAst(name, metadata));
				} else {
					ctx.profileRuntimeNeeded.add('__profileComponent');
					output.push(
						profileRegistrationAst(name, profileComponentMetadata(ctx, declaration, name)),
					);
				}
			}
		}
		statements.splice(0, statements.length, ...output);
	};

	const visitNode = (node) => {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visitNode(child);
			return;
		}
		if (node.type === 'VariableDeclaration') {
			for (const declaration of node.declarations || []) {
				visitNode(declaration.init);
				if (
					declaration.id?.type === 'Identifier' &&
					declaration.init &&
					isProfileComponentValue(declaration.init, ctx, declaration.id.name)
				) {
					const name = declaration.id.name;
					ctx.profileRuntimeNeeded.add('__profileComponent');
					declaration.init = profileComponentCallAst(
						declaration.init,
						profileComponentMetadata(ctx, declaration.id, name),
					);
				}
			}
			return;
		}
		if (
			node.type === 'ExportDefaultDeclaration' &&
			isProfileComponentValue(node.declaration, ctx, 'default') &&
			(node.declaration?.type !== 'FunctionDeclaration' || !node.declaration.id)
		) {
			visitNode(node.declaration);
			ctx.profileRuntimeNeeded.add('__profileComponent');
			const sourceDeclaration = node.declaration;
			const componentValue =
				sourceDeclaration.type === 'FunctionDeclaration'
					? { ...sourceDeclaration, type: 'FunctionExpression' }
					: sourceDeclaration;
			node.declaration = profileComponentCallAst(
				componentValue,
				profileComponentMetadata(ctx, sourceDeclaration, sourceDeclaration?.id?.name || 'default'),
			);
			return;
		}
		if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
			visitStatementList(node.body || [], false);
			if (node.render) visitNode(node.render);
			return;
		}
		if (node.type === 'SwitchCase') {
			visitNode(node.test);
			visitStatementList(node.consequent || [], false);
			return;
		}
		for (const key in node) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			visitNode(node[key]);
		}
	};

	visitStatementList(ast.body || [], true);
}

/**
 * Compile a .tsrx source string into JS targeting `octane`.
 * @param {string} source
 * @param {string} filename
 * @param {{ hmr?: boolean | 'vite' | 'webpack', mode?: 'client' | 'server', dev?: boolean, profile?: boolean, profileFilename?: string, autoMemo?: boolean, renderer?: { id: string, module: string, target: 'dom' | 'universal', server?: string }, rendererBoundaries?: Readonly<Record<string, Readonly<Record<string, { ownerRenderer: string, childRenderer: string, prop: string, server?: string }>>>>, rendererRegistry?: Readonly<Record<string, { module: string, target: 'dom' | 'universal', server?: string }>>, clientOnlyImports?: readonly unknown[], __hydratePrepared?: boolean, __hydrateBoundaryModule?: boolean }} [options] —
 *   `dev: true` emits client hydration source-location metadata (per-component
 *   `__s.locs`/`__s.locFile`) and, in server mode, source-located native-element
 *   scopes for invalid HTML nesting diagnostics. Both are strictly gated so
 *   production output carries no diagnostic calls or metadata.
 *   `hmr: true` (backwards-compatible shorthand for `hmr: 'vite'`) wraps each
 *   exported component in `hmr(Component)` and emits Vite
 *   `import.meta.hot.accept(...)` wiring. `hmr: 'webpack'` emits Rspack/webpack
 *   `import.meta.webpackHot` wiring with dispose-data wrapper handoff. Dev
 *   tooling should select its dialect in serve mode and leave HMR off for
 *   production builds.
 *   `mode` selects the codegen target: `'client'` (default) emits the
 *   template-clone DOM runtime; `'server'` emits HTML-string SSR output (static
 *   chunks interleaved with `ssr*` helpers) carrying the hydration markers the
 *   client `hydrateRoot` adopts.
 *   `rendererBoundaries` and `rendererRegistry` are the normalized static
 *   boundary table and renderer registry. Pass them together when a client
 *   module may contain an explicitly renderer-owned component prop.
 * @returns {{ code: string, map: any }}
 */
export function compile(source, filename, options) {
	const authoredSource = source;
	const mode = (options && options.mode) || 'client';
	if (mode !== 'client' && mode !== 'server') {
		throw new Error(`Unknown compile mode "${mode}" — expected 'client' or 'server'.`);
	}
	if (!options?.__hydratePrepared) {
		const query = filename.indexOf('?');
		const hash = filename.indexOf('#');
		let filenameEnd = filename.length;
		if (query !== -1) filenameEnd = query;
		if (hash !== -1 && hash < filenameEnd) filenameEnd = hash;
		const cleanFilename = filename.slice(0, filenameEnd);
		const hydratePreparation =
			mode === 'client'
				? prepareHydrateBoundaries(source, cleanFilename, hydrateBoundaryPathFromId(filename))
				: prepareServerHydrateBoundaries(source, cleanFilename);
		if (hydratePreparation !== null) {
			const compiled = compile(hydratePreparation.source, cleanFilename, {
				...options,
				__hydratePrepared: true,
				__hydrateBoundaryModule: hydratePreparation.boundaryPath !== null,
			});
			if (hydratePreparation.map && compiled.map) {
				compiled.map = composeSourceMaps(compiled.map, hydratePreparation.map);
				compiled.map = addSourceMapNeedles(
					compiled.map,
					compiled.code,
					authoredSource,
					hydratePreparation.mappingNeedles,
				);
			}
			return compiled;
		}
	}
	if (mode === 'server') {
		if (options?.renderer?.target === 'universal') {
			throw new Error(
				`Renderer ${JSON.stringify(options.renderer.id)} does not provide the serialization/hydration capability required by server compilation.`,
			);
		}
		const ownerRenderer =
			options?.renderer?.target === 'dom'
				? options.renderer
				: { id: 'dom', module: 'octane', target: 'dom', server: 'render' };
		const serverBoundaryPreparation = prepareServerRendererBoundaryRegions(
			source,
			filename,
			ownerRenderer,
			options,
		);
		if (serverBoundaryPreparation !== null) source = serverBoundaryPreparation.source;
		assertNoLiveClientOnlyImports(source, filename, options?.clientOnlyImports);
		// Server (SSR) codegen: static markup + dynamic holes + control flow +
		// nested components + scoped CSS, emitted as HTML-string-building bodies
		// (with hydration markers) importing the server runtime from 'octane/server'.
		// Fragment refs remain client-only because there is no server-side DOM range
		// object for their imperative API.
		const compiled = compileServer(source, filename, options);
		if (serverBoundaryPreparation?.map && compiled.map) {
			compiled.map = composeSourceMaps(compiled.map, serverBoundaryPreparation.map);
		}
		return compiled;
	}
	const ownerRenderer =
		options?.renderer?.target === 'universal'
			? options.renderer
			: options?.renderer?.target === 'dom'
				? options.renderer
				: { id: 'dom', module: 'octane', target: 'dom' };
	const rendererBoundaryPreparation = options?.__rendererBoundariesLowered
		? null
		: prepareRendererBoundaryRegions(source, filename, ownerRenderer, options);
	if (rendererBoundaryPreparation !== null) source = rendererBoundaryPreparation.source;
	if (options?.renderer?.target === 'universal') {
		const renderer = options.renderer;
		let reverseSourceMapComposed = false;
		const result = compileUniversal(
			source,
			filename,
			renderer,
			(lowered, universal) => {
				const domRegions = rendererBoundaryPreparation?.domRegions;
				let domSource = lowered;
				let expansionMap = null;
				if (domRegions && domRegions.length > 0) {
					const authoredLoweredMap = rendererBoundaryPreparation
						? composeSourceMaps(universal.sourceMap, rendererBoundaryPreparation.map)
						: universal.sourceMap;
					const expanded = expandDomRendererRegions(lowered, renderer, domRegions, {
						filename,
						map: authoredLoweredMap,
						source: authoredSource,
					});
					domSource = expanded.source;
					expansionMap = expanded.map;
				}
				const compiled = compile(domSource, filename, {
					...options,
					renderer: undefined,
					rendererBoundaries: undefined,
					rendererRegistry: undefined,
					__rendererBoundariesLowered: true,
					__universal: universal,
					__universalUnits: rendererBoundaryPreparation?.universalUnits,
				});
				if (expansionMap !== null) {
					compiled.map = composeSourceMaps(compiled.map, expansionMap);
					compiled.__universalSourceMapComposed = true;
					reverseSourceMapComposed = true;
				}
				return compiled;
			},
			options,
		);
		if (rendererBoundaryPreparation !== null && result.map && !reverseSourceMapComposed) {
			result.map = composeSourceMaps(result.map, rendererBoundaryPreparation.map);
		}
		if (rendererBoundaryPreparation !== null && result.map) {
			result.map = addSourceMapNeedles(
				result.map,
				result.code,
				authoredSource,
				rendererBoundaryPreparation.mappingNeedles,
			);
		}
		return result;
	}
	const ast = parseModule(source, filename);
	// Drop type-only statements (interface / type / declare / import-export type)
	// before emit — they carry no runtime value and would leak invalid TS into
	// the .js (or crash the printer). Runtime-only; Volar keeps them.
	ast.body = ast.body.filter((n) => !isTypeOnlyStatement(n));
	const serverModuleInfo = analyzeServerModule(ast, filename);
	// Normalize arrow-function components (`const X = () => @{…}`) to
	// FunctionDeclaration form so the component pipeline recognizes them.
	normalizeArrowComponents(ast);
	// Omitted dependency lists are compiler-owned: infer reactive captures
	// before any component splitting/hoisting so every lexical binding is still
	// visible to the shared TSRX/TSX analysis. Explicit arrays and `null` pass
	// through untouched.
	applyHookDependencies(ast, { filename });
	const hmrOption = options && options.hmr;
	const hmrDialect = hmrOption === true ? 'vite' : hmrOption || false;
	if (hmrDialect !== false && hmrDialect !== 'vite' && hmrDialect !== 'webpack') {
		throw new Error(
			`Unknown HMR dialect ${JSON.stringify(hmrDialect)} — expected false, 'vite', or 'webpack'.`,
		);
	}
	const hmrEnabled = hmrDialect !== false;
	// Dev mode: emit dev-only hydration source-location metadata (a per-component
	// `__s.locs` table of structured {line,column} keyed by slot index + the module file
	// name), used by hydration-mismatch warnings and reusable by a future Chrome-DevTools
	// element→source layer. Strictly dev-gated so PROD output is byte-identical (zero cost).
	const devEnabled = !!(options && options.dev);
	// Profiling is a separate production-capable specialization. Unlike `dev`, it
	// emits component/hook identity metadata but no hydration-warning expandos.
	// Server compilation returns above, so profile metadata is client-only.
	const profileEnabled = !!(options && options.profile);
	// React-Compiler-style component-region and keyed-list caching. Always on for
	// production client compilation — HMR can replace component contracts in
	// place, and dev/profiling observe every entry, so those modes decline it.
	// `autoMemo: false` is NOT a supported integration option (no bundler plugin
	// forwards it); it exists at this level only as a diagnostic escape hatch, so
	// a stale-UI report can be bisected memoizer-vs-elsewhere in one line.
	const autoMemoEnabled =
		options?.autoMemo !== false && !hmrEnabled && !devEnabled && !profileEnabled;
	const ctx = {
		filename,
		usedCompilerNames: collectIdentifierNames(ast),
		profileFilename: (options && options.profileFilename) || filename,
		mode,
		dev: devEnabled,
		profile: profileEnabled,
		autoMemo: autoMemoEnabled,
		// A split Hydrate query module is invoked as the existing server-rendered
		// boundary body. Its sole component child must therefore keep the server's
		// own component marker pair instead of borrowing the Hydrate block range.
		hydrateBoundaryModule: options?.__hydrateBoundaryModule === true,
		hmr: hmrEnabled, // gates Symbol.for vs Symbol() hook slots (allocHookSymbol)
		runtimeNeeded: new Set(), // helpers referenced by GENERATED code — imported as `name as _$name`
		profileRuntimeNeeded: new Set(), // compiler ABI helpers imported from `octane/profiling`
		userRuntimeNames: new Set(), // specifiers USER code references — imported verbatim
		userRuntimeNamespaces: new Set(), // `import * as ns from 'octane'`
		userRuntimeDefaults: new Set(), // preserved verbatim; package resolution owns validity
		hoistedTemplates: [], // { name, html }
		hoistedHelpers: [], // raw JS strings (sub-components, hook Symbols, key fns)
		delegatedEvents: new Set(), // bubble event names seen in JSX — auto-emits delegateEvents(...)
		capturedEvents: new Set(), // capture-phase event names (onXxxCapture) — auto-emits delegateCaptureEvents(...)
		cssInjections: [], // { hash, css } — one entry per component with a <style> block
		currentComponentLocals: null, // Set<string> while compiling a component body; null otherwise
		currentAutoMemoOffset: 0, // flat compiler-cache cell offset for the body being emitted
		currentAutoMemoCacheName: null, // collision-free local bound to the body's cache array
		currentAutoMemoCommittedName: null, // committed cache snapshot (copy-on-write source)
		nextAutoMemoCacheId: 0, // unique non-index slots property per compiled render function
		currentInvariantLocals: null, // Set<string> of component-lifetime-stable local values
		currentEventInvariantLocals: null, // Set<string> safe to retain in native event slots
		currentProfileComponentId: null,
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
		profileComponents: [],
		profileComponentIds: new Set(),
		profileComponentCandidates: new Set(),
		// DEV-only source locations stamped on top-level function bindings. Root
		// return/fragment mismatches have no host element to carry __oct_loc, so
		// hydrateRoot reads this binding-level fallback for its warning.
		devFunctionLocs: [],
		devFunctionLocAliases: [],
		// Source-map inputs, read by printNodeWithMap to ask esrap for real
		// per-token mappings against the original .tsrx.
		mapSource: source,
		mapSourceName: (filename || 'module.tsrx').split(/[\\/]/).pop(),
		// Per-component setup-statement maps, populated by compileFunctionBody on
		// the top-level (autoCallback) pass and drained per component below.
		_setupMaps: null,
	};
	{
		const imports = collectOctaneImportBindings(ast.body);
		ctx.octaneImportLocals = imports.locals;
		ctx.octaneImportNamespaces = imports.namespaces;
		ctx.foreignImportLocals = imports.foreignLocals;
	}
	if (ctx.dev) {
		for (const node of ast.body) {
			const declaration =
				node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration'
					? node.declaration
					: node;
			const candidates = [];
			if (
				declaration?.type === 'FunctionDeclaration' &&
				declaration.id != null &&
				declaration.body != null
			) {
				candidates.push({ name: declaration.id.name, node: declaration });
			} else if (declaration?.type === 'VariableDeclaration') {
				for (const declarator of declaration.declarations || []) {
					const init = unwrapTsExpr(declarator.init);
					if (
						declarator.id?.type === 'Identifier' &&
						(init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression')
					) {
						candidates.push({ name: declarator.id.name, node: init });
					} else if (declarator.id?.type === 'Identifier') {
						const factory = profileFactoryName(init, ctx);
						if (factory !== 'memo' && factory !== 'lazy') continue;
						const wrapped = unwrapTsExpr(init.arguments?.[0]);
						if (factory === 'memo' && wrapped?.type === 'Identifier') {
							ctx.devFunctionLocAliases.push({
								name: declarator.id.name,
								source: wrapped.name,
							});
						} else if (
							wrapped?.type === 'ArrowFunctionExpression' ||
							wrapped?.type === 'FunctionExpression'
						) {
							const loc = devLoc(ctx, wrapped);
							if (loc !== undefined) {
								ctx.devFunctionLocAliases.push({
									name: declarator.id.name,
									loc: `${ctx.mapSourceName}:${loc[0]}:${loc[1]}`,
								});
							}
						} else {
							const loc = devLoc(ctx, init);
							if (loc !== undefined) {
								ctx.devFunctionLocAliases.push({
									name: declarator.id.name,
									loc: `${ctx.mapSourceName}:${loc[0]}:${loc[1]}`,
								});
							}
						}
					}
				}
			}
			for (const candidate of candidates) {
				const loc = devLoc(ctx, candidate.node);
				if (loc !== undefined) {
					ctx.devFunctionLocs.push({
						name: candidate.name,
						loc: `${ctx.mapSourceName}:${loc[0]}:${loc[1]}`,
					});
				}
			}
		}
	}
	const universalUnits =
		options?.__universalUnits ?? rendererBoundaryPreparation?.universalUnits ?? [];
	ctx._universalRuntimeUnitsByBinding = new Map();
	for (const unit of universalUnits) {
		for (const binding of unit.bindings ?? []) {
			const previous = ctx._universalRuntimeUnitsByBinding.get(binding);
			if (previous !== undefined && previous !== unit) {
				throw new Error(`Universal renderer specialization binding ${binding} is ambiguous.`);
			}
			ctx._universalRuntimeUnitsByBinding.set(binding, unit);
		}
	}
	if (options?.__universal) transformUniversalParallelUse(ast, ctx, options.__universal);
	for (const unit of universalUnits) transformUniversalParallelUse(ast, ctx, unit);
	if (ctx.profile) {
		ctx.profileComponentCandidates = collectProfileComponentCandidates(ast);
		annotateProfileHookOwners(ast, ctx);
		instrumentProfileComponents(ast, ctx);
	}
	// Imported local bindings (any source). Used by the M1 cross-module
	// singleRoot sentinel: only an IMPORTED identifier is a stable component
	// identity for the lifetime of a slot — a local `const Comp = cond ? A : B`
	// re-resolves per render, and a markerless slot regime must never be chosen
	// off an identity that can change (see makeCompCall).
	ctx.importedNames = new Set();
	ctx.importNamespaceNames = new Set();
	const memoImportNames = new Set();
	for (const node of ast.body) {
		if (node.type !== 'ImportDeclaration') continue;
		if (node.importKind === 'type') continue;
		for (const sp of node.specifiers || []) {
			if (sp.importKind === 'type') continue;
			if (sp.local && sp.local.name) ctx.importedNames.add(sp.local.name);
			if (sp.type === 'ImportNamespaceSpecifier' && sp.local?.name) {
				ctx.importNamespaceNames.add(sp.local.name);
			}
			if (
				node.source.value === 'octane' &&
				(sp.imported?.name || sp.imported?.value) === 'memo' &&
				sp.local?.name
			) {
				memoImportNames.add(sp.local.name);
			}
		}
	}
	// A top-level `const X = memo(Component)` is an immutable default-memo wall.
	// A pure enclosing region may safely skip it for equal props while existing
	// context/child scheduling remains live. Explicit comparators stay opaque.
	ctx.defaultMemoBindings = new Set();
	for (const statement of ast.body) {
		const declaration =
			statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
		if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
		for (const item of declaration.declarations || []) {
			const init = item.init;
			if (
				item.id?.type === 'Identifier' &&
				init?.type === 'CallExpression' &&
				init.callee?.type === 'Identifier' &&
				memoImportNames.has(init.callee.name) &&
				(init.arguments?.length ?? 0) === 1
			) {
				ctx.defaultMemoBindings.add(item.id.name);
			}
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
		if (isComponentFunction(node) || isReturnJsxFunction(node)) compNode = node;
		else if (
			node.type === 'ExportDefaultDeclaration' &&
			(isComponentFunction(node.declaration) || isReturnJsxFunction(node.declaration))
		)
			compNode = node.declaration;
		else if (
			node.type === 'ExportNamedDeclaration' &&
			(isComponentFunction(node.declaration) || isReturnJsxFunction(node.declaration))
		)
			compNode = node.declaration;
		if (compNode && compNode.id) {
			ctx.componentInfo.set(compNode.id.name, {
				eligible: false,
				autoMemoSafe: false,
				autoMemoCallsitesSafe: true,
				autoMemoCaptures: [],
				autoMemoComponentDeps: [],
				autoMemoImportedComponents: [],
				autoMemoMayReadContext: false,
				node: compNode,
				returnJsx: isReturnJsxFunction(compNode),
				voidOutput: isVoidJsxCodeBlockFunction(compNode),
			});
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
		const autoMemoImportedComponents = collectImportedComponentReferences(root, ctx.importedNames);
		let autoMemoCallsitesSafe =
			!containsDeferredRefRead(root) && !containsImportedMemberRead(root, ctx.importedNames, false);
		for (const name of free) {
			if (
				ctx._octaneBoundaryNames.has(name) ||
				ctx.importNamespaceNames.has(name) ||
				(!ctx.importedNames.has(name) &&
					!ctx.defaultMemoBindings.has(name) &&
					!ctx.componentInfo.has(name))
			) {
				autoMemoCallsitesSafe = false;
				break;
			}
		}
		// autoMemo's first proof is intentionally narrower than lite eligibility.
		// It models a pure component as a function of one ordinary props snapshot;
		// destructuring/default/rest parameters can be admitted once their evaluation
		// is included in the shared dependency/purity analysis.
		const ordinaryPropsParam =
			(compNode.params?.length ?? 0) <= 1 &&
			(compNode.params?.length !== 1 || compNode.params[0]?.type === 'Identifier');
		let autoMemoSafe =
			ordinaryPropsParam &&
			!containsRenderCall(stmts) &&
			!containsAutoMemoUnsafeStructure(stmts) &&
			!containsImportedMemberRead(root, ctx.importedNames);
		const autoMemoCaptures = [];
		const autoMemoComponentDeps = [];
		if (autoMemoSafe) {
			for (const name of free) {
				// Imported bindings are live, so include them in the runtime snapshot.
				// Same-module function declarations are immutable identities. Ambient
				// globals/module lets are not witnessed and therefore fail closed.
				if (ctx._octaneBoundaryNames.has(name)) {
					autoMemoSafe = false;
					break;
				}
				if (ctx.importNamespaceNames.has(name)) {
					// A namespace object's identity is stable while its exported properties
					// remain live. `[namespace]` cannot witness `namespace.value` changing.
					autoMemoSafe = false;
					break;
				} else if (ctx.importedNames.has(name)) autoMemoCaptures.push(name);
				else if (ctx.defaultMemoBindings.has(name)) {
					// Immutable const wrapper; its default memo contract is the wall.
					continue;
				} else if (ctx.componentInfo.has(name)) autoMemoComponentDeps.push(name);
				else {
					autoMemoSafe = false;
					break;
				}
			}
		}
		info.autoMemoSafe = autoMemoSafe;
		info.autoMemoCallsitesSafe = autoMemoCallsitesSafe;
		info.autoMemoCaptures = autoMemoSafe ? autoMemoCaptures.sort() : [];
		info.autoMemoComponentDeps = autoMemoSafe ? autoMemoComponentDeps.sort() : [];
		info.autoMemoImportedComponents = autoMemoSafe ? [...autoMemoImportedComponents].sort() : [];
		info.autoMemoMayReadContext =
			autoMemoSafe &&
			(containsAutoMemoContextRead(root, ctx) ||
				autoMemoImportedComponents.size > 0 ||
				[...free].some((name) => ctx.defaultMemoBindings.has(name)));
		// Hookless check.
		// Return-JSX functions reconcile their returned descriptor through
		// renderBlock. componentSlotLite intentionally ignores return values, so
		// these functions may participate in output-shape proofs but never lite.
		let eligible = info.voidOutput;
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
		info.singleRoot = singleHostComponentRoot(compNode);
	}
	// Purity is transitive for same-module component calls. Iterate to a fixed
	// point so declaration order and mutually recursive pure components do not
	// matter. Imported components remain an explicit pure-render contract; the
	// runtime still taints known custom-comparator/Suspense/transition boundaries.
	let autoMemoChanged = true;
	while (autoMemoChanged) {
		autoMemoChanged = false;
		for (const [, info] of ctx.componentInfo) {
			if (!info.autoMemoSafe) continue;
			for (const name of info.autoMemoComponentDeps) {
				if (ctx.componentInfo.get(name)?.autoMemoSafe !== true) {
					info.autoMemoSafe = false;
					info.autoMemoCaptures = [];
					info.autoMemoImportedComponents = [];
					autoMemoChanged = true;
					break;
				}
			}
		}
	}
	// Pull live imported captures through the safe same-module call graph. This
	// is a second fixed point because A -> B -> C chains and pure recursion may
	// be declared in any order.
	let autoMemoCapturesChanged = true;
	while (autoMemoCapturesChanged) {
		autoMemoCapturesChanged = false;
		for (const [, info] of ctx.componentInfo) {
			if (!info.autoMemoSafe) continue;
			const captures = new Set(info.autoMemoCaptures);
			const importedComponents = new Set(info.autoMemoImportedComponents);
			let mayReadContext = info.autoMemoMayReadContext;
			for (const name of info.autoMemoComponentDeps) {
				const child = ctx.componentInfo.get(name);
				if (!child?.autoMemoSafe) continue;
				for (const capture of child.autoMemoCaptures) captures.add(capture);
				for (const component of child.autoMemoImportedComponents) {
					importedComponents.add(component);
				}
				if (child.autoMemoMayReadContext) mayReadContext = true;
			}
			if (
				captures.size !== info.autoMemoCaptures.length ||
				importedComponents.size !== info.autoMemoImportedComponents.length ||
				mayReadContext !== info.autoMemoMayReadContext
			) {
				info.autoMemoCaptures = [...captures].sort();
				info.autoMemoImportedComponents = [...importedComponents].sort();
				info.autoMemoMayReadContext = mayReadContext;
				autoMemoCapturesChanged = true;
			}
		}
	}

	let body = emitServerModulePrelude(serverModuleInfo, ctx);
	// Source-map bookkeeping. `bodySegments` collects mapping segments in
	// body-relative coordinates (0-based line within `body`); they're shifted by
	// the prelude line count and encoded at return. Segments come from esrap's
	// real per-token maps (component setup statements, top-level passthrough
	// statements) plus a coarse anchor at each component declaration line.
	let bodyLine = countNewlines(body);
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
	const compileOpts = { hmrWrap: hmrEnabled, hmrMutable: hmrDialect === 'webpack' };
	for (const node of ast.body) {
		if (
			node === serverModuleInfo?.declaration ||
			(node.type === 'ImportDeclaration' && node.source?.value === 'server')
		) {
			continue;
		}
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
			const chunk =
				compileReturnJsxFunction(node.declaration, ctx, {
					export: true,
					hmrWrap: hmrEnabled,
					hmrMutable: hmrDialect === 'webpack',
				}) + '\n\n';
			pushDeclAnchor(node, base);
			drainSetupMaps(base);
			body += chunk;
			bodyLine += countNewlines(chunk);
			if (hmrEnabled) hmrComponents.push({ name: node.declaration.id.name, exportKind: 'named' });
		} else if (node.type === 'ExportDefaultDeclaration' && isReturnJsxFunction(node.declaration)) {
			const base = bodyLine;
			ctx._setupMaps = null;
			const chunk =
				compileReturnJsxFunction(node.declaration, ctx, {
					default: true,
					hmrWrap: hmrEnabled,
					hmrMutable: hmrDialect === 'webpack',
				}) + '\n\n';
			pushDeclAnchor(node, base);
			drainSetupMaps(base);
			body += chunk;
			bodyLine += countNewlines(chunk);
			if (hmrEnabled) hmrComponents.push({ name: node.declaration.id.name, exportKind: 'default' });
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
			const previousUniversalUnit = ctx._universalRuntimeUnit;
			ctx._universalRuntimeUnit = universalRuntimeUnitForTopLevelNode(node, ctx);
			let hooked;
			try {
				hooked = rewriteHookCalls(node, ctx, fnName);
			} finally {
				ctx._universalRuntimeUnit = previousUniversalUnit;
			}
			// Lower any JSX component value (e.g. `root.render(<App/>)` or
			// `const el = <App/>`) to createElement(...) before printing — esrap
			// can't print raw JSX, and this is what makes root.render(<App/>) match
			// React's shape.
			const lowered = stampAnonymousDefaultFunctionLoc(rewriteJsxValues(hooked, ctx), ctx);
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
	const helpers = joinHoistedHelpers(ctx);
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
		if (hmrDialect === 'webpack') {
			// Rspack/webpack re-evaluates the accepted module and exposes the previous
			// module's dispose data to that NEW evaluation. Hand the fresh body to the
			// previous canonical wrapper, then make the new ESM binding point back to
			// it. Persist that canonical identity again for the next update. This keeps
			// working across any number of edits; accept callbacks in webpack are error
			// handlers, not Vite-style callbacks carrying the new module namespace.
			const handoffs = hmrComponents
				.map(
					(c) =>
						`  if (import.meta.webpackHot.data?.__octaneComponents?.${c.name}) {\n` +
						`    import.meta.webpackHot.data.__octaneComponents.${c.name}[_$HMR].update(${c.name});\n` +
						`    ${c.name} = import.meta.webpackHot.data.__octaneComponents.${c.name};\n` +
						'  }',
				)
				.join('\n');
			const bindings = hmrComponents.map((c) => c.name).join(', ');
			hmrBlock =
				'if (import.meta.webpackHot) {\n' +
				handoffs +
				'\n' +
				'  import.meta.webpackHot.dispose((data) => {\n' +
				`    data.__octaneComponents = { ${bindings} };\n` +
				'  });\n' +
				'  import.meta.webpackHot.accept();\n' +
				'}\n';
		} else {
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
	}

	// Profiling registrations intentionally run AFTER the HMR handoff block in
	// the final output. On a webpack/Rspack update the local binding is reassigned
	// to the previous canonical wrapper during that handoff; registering earlier
	// would attach the fresh metadata to a short-lived replacement instead. The
	// runtime helper records metadata without wrapping or replacing the function.
	let profileBlock = '';
	if (ctx.profileComponents.length > 0) {
		ctx.profileRuntimeNeeded.add('__profileComponent');
		profileBlock =
			ctx.profileComponents
				.map((meta) => `_$__profileComponent(${meta.name}, ${JSON.stringify(meta)});`)
				.join('\n') + '\n';
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
		for (const entry of ctx.devFunctionLocs) {
			stamps.push(
				`try { ${entry.name}.__oct_loc = ${JSON.stringify(entry.loc)}; } catch { /* frozen component */ }`,
			);
		}
		for (const entry of ctx.devFunctionLocAliases) {
			stamps.push(
				entry.source === undefined
					? `try { ${entry.name}.__oct_loc = ${JSON.stringify(entry.loc)}; } catch { /* frozen component */ }`
					: `try { ${entry.name}.__oct_loc = ${entry.source}.__oct_loc; } catch { /* frozen component */ }`,
			);
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
	const finalProfileRuntimeImport = buildProfileRuntimeImport(ctx);

	// Everything before `body` in the output — shifts every body segment's
	// generated line down by the prelude's line count.
	const prelude =
		finalRuntimeImport +
		finalProfileRuntimeImport +
		vtHintBlock +
		delegateCall +
		styleBlock +
		templatesBlock +
		helpersBlock;
	const preludeLines = countNewlines(prelude);
	const segments = bodySegments.map((s) => ({
		genLine: s.genLine + preludeLines,
		genCol: s.genCol,
		srcLine0: s.srcLine0,
		srcCol0: s.srcCol0,
	}));

	const result = {
		code: prelude + body + stampBlock + hmrBlock + profileBlock,
		map: buildSourceMap(source, ctx.mapSourceName, segments),
	};
	for (const unit of universalUnits) {
		result.code = retargetRuntimeImportAliases(
			result.code,
			unit.renderer.module,
			unit.runtimeAliases,
		);
	}
	if (rendererBoundaryPreparation !== null) {
		result.map = composeSourceMaps(result.map, rendererBoundaryPreparation.map);
		result.map = addSourceMapNeedles(
			result.map,
			result.code,
			authoredSource,
			rendererBoundaryPreparation.mappingNeedles,
		);
	}
	return result;
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
// Still rejected with a clear diagnostic (see ssrUnsupported): fragment refs
// (`<Fragment ref={…}>`).
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
	const serverModuleInfo = analyzeServerModule(ast, filename);
	// Normalize arrow-function components (`const X = () => @{…}`) to
	// FunctionDeclaration form so the component pipeline recognizes them.
	normalizeArrowComponents(ast);
	// Mirror the client transform exactly. Effects are server no-ops, but
	// useMemo/useCallback execute during SSR and must receive the same inferred
	// dependency shape as hydration's client compile.
	applyHookDependencies(ast, { filename });
	const ctx = {
		filename,
		usedCompilerNames: collectIdentifierNames(ast),
		mode: 'server',
		hmr: false, // SSR never hot-swaps in place; client/server production slot shapes stay aligned
		dev: !!(options && options.dev),
		// SSR MIRROR of the parallel-`use()` pipeline (docs/suspense-parallel-use-
		// plan.md Phase 5): the same memoize (Pass A) + hoist/batch (Pass B)
		// transforms run on server bodies, emitting `_$puMemo`/`_$puBatch` — the
		// server-runtime twins with cross-pass creation identity — so independent
		// fetches REGISTER before the first suspend and a body stratum costs ONE
		// network round instead of one per use().
		nextPuId: 0, // parallel-use `__pu$N` hoisted-creation temps
		_pendingWarm: null, // `X.__warm = …` source, set by ssrCompileBody, drained by compileServerComponent
		runtimeNeeded: new Set(), // helpers referenced by GENERATED code — imported as `name as _$name`
		userRuntimeNames: new Set(), // specifiers USER code references — imported verbatim
		userRuntimeNamespaces: new Set(), // rewritten to the server runtime module
		userRuntimeDefaults: new Set(),
		hoistedHelpers: [],
		cssInjections: [],
		moduleCssInjections: [],
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
	{
		const imports = collectOctaneImportBindings(ast.body);
		ctx.octaneImportLocals = imports.locals;
		ctx.octaneImportNamespaces = imports.namespaces;
		ctx.foreignImportLocals = imports.foreignLocals;
	}
	// M3 inherit-range exclusion set — must match the client compile's
	// (see inheritSoleCompRoot; both modes read the same import declarations).
	ctx._octaneBoundaryNames = collectOctaneBoundaryNames(ast.body);

	// Style maps are module values and can be referenced by a component declared
	// before the map itself. Lower every top-level map before compiling any
	// component, then activate the module's sheets from each component body so
	// injectStyle runs while a render-local CSS collector exists. This mirrors the
	// client module's eager registration without retaining CSS globally on the
	// server (which would leak unrelated imports and request history into output).
	for (const node of ast.body) {
		applyStyleMap(node, ctx);
		if (node.type === 'ExportNamedDeclaration' && node.declaration) {
			applyStyleMap(node.declaration, ctx);
		}
	}
	ctx.moduleCssInjections = ctx.cssInjections.slice();

	let body = emitServerModulePrelude(serverModuleInfo, ctx);
	for (const node of ast.body) {
		if (
			node === serverModuleInfo?.declaration ||
			(node.type === 'ImportDeclaration' && node.source?.value === 'server')
		) {
			continue;
		}
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
			body += printNode(rewriteJsxValues(node, ctx)) + '\n';
		}
	}

	const runtimeImport = buildRuntimeImport(ctx, 'octane/server');
	const joinedHelpers = joinHoistedHelpers(ctx);
	const helpers = joinedHelpers ? joinedHelpers + '\n\n' : '';
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
	const cssEntries = [...ctx.moduleCssInjections, ...ctx.cssInjections.slice(beforeCss)].sort(
		(a, b) => a.order - b.order,
	);

	const prevLocals = ctx.currentComponentLocals;
	const prevKnownStr = ctx.knownStringLocals;
	ctx.currentComponentLocals = collectComponentLocals(node);
	ctx.knownStringLocals = collectKnownStringLocals(node);
	let fn;
	try {
		// Only the direct setup statements of a top-level `@{}` component are
		// proven to execute in its fresh render Scope. Return-JSX functions and
		// first-class subtemplates keep globally unique slots.
		fn = ssrCompileBody(
			node,
			ctx,
			name,
			cssHash,
			cssEntries,
			'opaque',
			node.body?.type === 'JSXCodeBlock',
		);
	} finally {
		ctx.currentComponentLocals = prevLocals;
		ctx.knownStringLocals = prevKnownStr;
	}

	// SSR parallel-use mirror: attach the compiled fetch plan so a PARENT's warm
	// walk (`_$warmChild(Comp, props)` activated by a suspending descendant batch) can start
	// this component's independent creations before its body ever runs.
	const warmSrc = ctx._pendingWarm;
	ctx._pendingWarm = null;
	const warmTail = warmSrc ? `\n${name}.__warm = ${warmSrc};` : '';

	if (isDefault) return `const ${name} = ${fn};${warmTail}\nexport default ${name};`;
	if (isExported) return `export const ${name} = ${fn};${warmTail}`;
	return `const ${name} = ${fn};${warmTail}`;
}

function ssrCompileBody(
	node,
	ctx,
	name,
	cssHash,
	cssEntries,
	parentNs = 'html',
	localSetupSlots = false,
	componentNs = null,
	returnedFragmentTemplate = false,
	returnedFragmentRoot = false,
) {
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
				// EXCEPT returned value roots whose client lowering owns a descriptor
				// boundary. Ordinary shorthand fragments lower to positional arrays (one
				// range per item); fragments or component/sentinel roots containing
				// template-only syntax lower to one compiled renderer component. Route both
				// through ssrEmitTsrxExpression so the server mirrors that exact boundary.
				const returnedHostRoot =
					(child.argument.type === 'Element' || child.argument.type === 'JSXElement') &&
					!isComponentTag(child.argument);
				if (
					child.argument.type === 'JSXFragment' ||
					child.argument.type === 'Fragment' ||
					isFragmentLongForm(child.argument) ||
					(!returnedHostRoot && requiresTemplateNormalization(child.argument))
				) {
					jsxNodes.push({
						type: 'TSRXExpression',
						expression: child.argument,
						returnedJsxValue: true,
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
	// active-stack warm registration — see runtime.server.ts warmMemo/warmChild); synthetic
	// subs (statement arrays) run Pass B only. Loops/functions are excluded by
	// the passes themselves (same rules as the client).
	let workingStatements = statements;
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
	const rewritten = workingStatements
		.map((s) => rewriteHookCalls(s, ctx, name, localSetupSlots))
		.map((s) => rewriteJsxValues(s, ctx));
	const setupCode = rewritten.map((s) => '  ' + printNode(s).replace(/\n/g, '\n  ')).join('\n');

	// Partition hoisted `<title>`/`<meta>`/`<link>` out of the body (mirrors the
	// client planJsx): they accumulate into render()'s `head` via `ssrHeadEl`, NOT
	// the body HTML — so the body collapses to its single real root.
	const normalized = normalizeChildren(jsxNodes, parentNs === 'svg');
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
	const prevReturnedFragmentTemplate = ctx._returnedFragmentTemplate;
	ctx._returnedFragmentTemplate = returnedFragmentTemplate;
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
		(!!(node.body && node.body.type === 'JSXCodeBlock') || returnedFragmentRoot) &&
		inheritSoleCompRoot(bodyNodes, ctx);
	const htmlExpr = ssrEmitNodes(bodyNodes, ctx, name, inlinedSubs, parentNs, cssHash, componentNs);
	ctx._ssrInheritRoot = prevInheritRoot;
	ctx._returnedFragmentTemplate = prevReturnedFragmentTemplate;
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
function ssrEmitNodes(
	nodes,
	ctx,
	name,
	inlinedSubs,
	parentNs,
	cssHash,
	componentNs,
	nlGuardFirst = false,
) {
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
		const p = ssrEmitNode(n, ctx, name, inlinedSubs, parentNs, cssHash, componentNs, nlGuard);
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

function ssrEmitNode(
	node,
	ctx,
	name,
	inlinedSubs,
	parentNs,
	cssHash,
	componentNs,
	nlGuard = false,
) {
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
			const childExpr = `_$ssrChild(${printExpr(resolveStyleExpr(rewriteJsxValues(rewriteHookCalls(expr, ctx, name), ctx), cssHash))}, __s)`;
			if (componentNs === null) return childExpr;
			ctx.runtimeNeeded.add('ssrInNamespace');
			return `_$ssrInNamespace(${JSON.stringify(componentNs)}, () => ${childExpr})`;
		}
		case 'Element':
			if (isComponentTag(node))
				return ssrEmitComponent(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs);
			return ssrEmitElement(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs);
		case 'TSRXExpression':
			return ssrEmitTsrxExpression(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs);
		case 'IfStatement':
			return ssrEmitIf(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs);
		case 'ForOfStatement':
			return ssrEmitFor(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs);
		case 'TryStatement':
			return ssrEmitTry(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs);
		case 'SwitchStatement':
			return ssrEmitSwitch(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs);
		case 'ActivityStatement':
			return ssrEmitActivity(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs);
		case 'FragmentStart':
		case 'FragmentEnd':
			return ssrUnsupported('fragment refs (`<Fragment ref={…}>`)');
		default:
			return ssrUnsupported(`node type ${node.type}`);
	}
}

function ssrEmitElement(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs) {
	const tag = elementTagName(node);
	rejectVoidElementContent(tag, node, ctx);
	rejectTextareaValueChildren(tag, node, ctx);
	rejectDangerouslySetInnerHTMLChildren(tag, node, ctx);
	const attrs = node.attributes || node.openingElement?.attributes || [];
	// NB: the ns helpers take the TAG STRING (passing the node silently returns
	// the inherited ns — svg subtrees would never enter the svg namespace).
	const selfNs = nsForSelf(tag, parentNs);
	const childNs = nsForChildren(tag, selfNs);
	// The static namespace walk starts each independently compiled component in
	// an opaque context because a component can be invoked under foreign content.
	// Preserve that inherited context through ordinary hosts/wrappers and emit an
	// explicit override only at a parser transition we can prove lexically.
	let childComponentNs = componentNs;
	if (tag === 'foreignObject') childComponentNs = 'html';
	else if (tag === 'svg') childComponentNs = 'svg';
	else if (tag === 'math') childComponentNs = 'mathml';
	else if (childNs !== 'html' && childNs !== 'opaque') childComponentNs = childNs;

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
	// TSRX accepts repeated attributes. JSX prop construction is last-writer-wins,
	// but literal HTML duplicates are parser-first-wins, so duplicate native
	// identities need the same source resolver as spreads (aliases included).
	const directAttributeIdentities = new Set();
	let hasDuplicateDirectAttribute = false;
	for (const attr of attrs) {
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
		let identity = normalizeJsxAttrName(jsxAttrRawName(attr), tag, selfNs);
		if (selfNs === 'html') identity = identity.toLowerCase();
		if (directAttributeIdentities.has(identity)) hasDuplicateDirectAttribute = true;
		else directAttributeIdentities.add(identity);
	}
	const firstSpreadIdx = attrs.findIndex(
		(a) => a.type === 'SpreadAttribute' || a.type === 'JSXSpreadAttribute',
	);
	// A spread can carry a native form control's value/default writers (plus
	// checked for input and multiple for select). Serializing each source as a
	// generic attribute either creates first-wins duplicates or puts state in the
	// wrong place entirely: textarea value is content and select value projects
	// onto options. Resolve the effective props once whenever one has a spread.
	const resolveFormControlsAcrossSpreads =
		(firstSpreadIdx !== -1 || hasDuplicateDirectAttribute) &&
		(tag === 'input' || tag === 'textarea' || tag === 'select');
	const formControlSources = [];
	let formControlPart = -1;
	// Any spread may collide with any direct or spread-supplied native attribute.
	// HTML parsing keeps the FIRST duplicate, while JSX uses the final writer, so
	// spread-bearing hosts serialize one source-resolved attribute set. Dedicated
	// form/content channels are filtered by ssrAttrs and resolved separately.
	const resolveAttrsAcrossSpreads = firstSpreadIdx !== -1 || hasDuplicateDirectAttribute;
	const attrSources = [];
	let attrPart = -1;
	// Spreads are bound to temps (so their value is evaluated ONCE even though we
	// read it for ssrAttrs and the form/content resolution channels).
	// `htmlSources` are `[present, value]` pairs in source order. Presence must be
	// retained separately: a later explicit/spread `undefined` disables an earlier
	// raw-HTML writer, while a spread that omits the key does not.
	const spreadTemps = [];
	const htmlSources = [];
	const childrenPropSources = [];
	const bindAttributeEvaluation = (argExpr) => {
		const tempName = `__sp${spreadTemps.length}`;
		spreadTemps.push({ tempName, argExpr });
		return tempName;
	};
	const bindDiscardedAttributeValue = (value) => {
		if (!resolveAttrsAcrossSpreads || value == null) return;
		const expression = value.type === 'JSXExpressionContainer' ? value.expression : value;
		bindAttributeEvaluation(printExprWithTsrx(expression, ctx, name, inlinedSubs));
	};
	const ensureAttrPart = () => {
		if (attrPart !== -1) return;
		flush();
		attrPart = parts.length;
		parts.push('');
	};
	// Wrap the assembled string in an IIFE that binds the spread temps when any
	// exist (so the temp names resolve); otherwise return the bare concatenation.
	const finalize = () => {
		let body = parts.join(' + ');
		if (spreadTemps.length > 0) {
			const decls = spreadTemps.map((t) => `const ${t.tempName} = (${t.argExpr});`).join(' ');
			body = `(() => { ${decls} return ${body}; })()`;
		}
		if (!ctx.dev) return body;

		// Keep the element active while its children execute so the server runtime
		// can validate parser-repaired relationships through component boundaries.
		// Production output takes the branch above: no helper import, source string,
		// callback, or runtime work.
		const loc = node.loc && node.loc.start;
		const source = loc
			? JSON.stringify(`${ctx.mapSourceName}:${loc.line}:${loc.column}`)
			: 'void 0';
		ctx.runtimeNeeded.add('ssrElement');
		return `_$ssrElement(${JSON.stringify(tag)}, ${source}, () => (${body}))`;
	};

	for (let attrI = 0; attrI < attrs.length; attrI++) {
		const attr = attrs[attrI];
		if (attr.type === 'SpreadAttribute' || attr.type === 'JSXSpreadAttribute') {
			ensureAttrPart();
			ctx.runtimeNeeded.add('ssrAttrs');
			ctx.runtimeNeeded.add('ssrSnapshotSpread');
			const tmp = bindAttributeEvaluation(
				`_$ssrSnapshotSpread(${printExprWithTsrx(attr.argument, ctx, name, inlinedSubs)})`,
			);
			if (resolveFormControlsAcrossSpreads) {
				if (tag !== 'textarea' && formControlPart === -1) {
					formControlPart = parts.length;
					parts.push('');
				}
				formControlSources.push(`[true, ${tmp}]`);
			}
			attrSources.push(`[true, ${tmp}]`);
			// The spread may carry `dangerouslySetInnerHTML` — record both own-key
			// presence and value so an explicit `undefined` overwrites an earlier writer.
			htmlSources.push(
				`[${tmp} != null && Object.prototype.propertyIsEnumerable.call(${tmp}, "dangerouslySetInnerHTML"), ${tmp} != null ? ${tmp}.dangerouslySetInnerHTML : void 0]`,
			);
			childrenPropSources.push(
				`[${tmp} != null && Object.prototype.propertyIsEnumerable.call(${tmp}, "children"), ${tmp} != null ? ${tmp}.children : void 0]`,
			);
			continue;
		}
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
		const rawAttrName = jsxAttrRawName(attr);
		if (rawAttrName === 'key') {
			bindDiscardedAttributeValue(attr.value);
			continue;
		}
		// React-only hints — never serialize (`suppressHydrationWarning` is the
		// client hydration opt-out; `suppressContentEditableWarning` suppresses a
		// React DEV warning octane doesn't emit, but the key must not land in the
		// markup either — mirrors the client setAttribute skip).
		if (rawAttrName === 'suppressHydrationWarning') {
			bindDiscardedAttributeValue(attr.value);
			continue;
		}
		if (rawAttrName === 'suppressContentEditableWarning') {
			bindDiscardedAttributeValue(attr.value);
			continue;
		}
		// Events and refs have no server semantics — dropped.
		if (rawAttrName === 'ref') {
			bindDiscardedAttributeValue(attr.value);
			continue;
		}
		if (isEventAttrName(rawAttrName)) {
			bindDiscardedAttributeValue(attr.value);
			continue;
		}
		// `autoFocus` never serializes (React DOM server parity — the client
		// focuses at its mount commit; custom elements keep raw props).
		if (
			rawAttrName === 'autoFocus' &&
			!((selfNs === 'html' || selfNs === 'opaque') && tag.includes('-'))
		) {
			bindDiscardedAttributeValue(attr.value);
			continue;
		}
		// Custom elements keep names VERBATIM (React parity — they get raw props,
		// no alias tables; `className`→`class` still applies); ssrAttr applies
		// the same gate for dynamic values.
		const attrName = normalizeJsxAttrName(rawAttrName, tag, selfNs);
		const val = attr.value;
		const isAfterSpread = firstSpreadIdx !== -1 && attrI > firstSpreadIdx;
		if (rawAttrName === 'children') {
			const childInner =
				val == null ? null : val.type === 'JSXExpressionContainer' ? val.expression : val;
			const childExpr = bindAttributeEvaluation(
				childInner === null
					? 'true'
					: printExprWithTsrx(rewriteJsxValues(childInner, ctx), ctx, name, inlinedSubs),
			);
			childrenPropSources.push(`[true, ${childExpr}]`);
			continue;
		}

		if (attrName === 'dangerouslySetInnerHTML') {
			// React-style raw HTML: record the `{__html}` object as a raw-HTML source
			// (in source order); ssrInnerHtml reads `.__html` and emits it as the
			// element's (unescaped) inner content.
			const obj = val == null ? null : val.type === 'JSXExpressionContainer' ? val.expression : val;
			const tmp = bindAttributeEvaluation(
				obj === null ? 'true' : printExpr(rewriteHookCalls(obj, ctx, name)),
			);
			htmlSources.push(`[true, ${tmp}]`);
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
				const ctlExpr =
					ctlInner === null ? 'true' : printExprWithTsrx(ctlInner, ctx, name, inlinedSubs);
				if (formControlPart === -1) {
					flush();
					formControlPart = parts.length;
					parts.push('');
				}
				// Bind every writer in authored order, even when a controlled value
				// ultimately wins over its default. Besides preserving side effects,
				// this lets spread snapshots run between surrounding direct writers.
				const tmp = bindAttributeEvaluation(ctlExpr);
				formControlSources.push(`[false, ${JSON.stringify(attrName)}, ${tmp}]`);
				continue;
			}
			// textarea / select: value/defaultValue never serialize as attributes —
			// captured for the content position (textarea) / projection scope (select).
			const ctlExpr = bindAttributeEvaluation(
				ctlInner === null ? 'true' : printExprWithTsrx(ctlInner, ctx, name, inlinedSubs),
			);
			if (resolveFormControlsAcrossSpreads) {
				if (tag === 'select' && formControlPart === -1) {
					flush();
					formControlPart = parts.length;
					parts.push('');
				}
				formControlSources.push(`[false, ${JSON.stringify(attrName)}, ${ctlExpr}]`);
			} else if (attrName === 'value') ctlValue = ctlExpr;
			else ctlDefault = ctlExpr;
			continue;
		}
		if (tag === 'select' && attrName === 'multiple') {
			if (resolveFormControlsAcrossSpreads) {
				const mInner =
					val == null ? null : val.type === 'JSXExpressionContainer' ? val.expression : val;
				const multipleExpr = bindAttributeEvaluation(
					mInner === null ? 'true' : printExprWithTsrx(mInner, ctx, name, inlinedSubs),
				);
				if (formControlPart === -1) {
					flush();
					formControlPart = parts.length;
					parts.push('');
				}
				formControlSources.push(`[false, "multiple", ${multipleExpr}]`);
				continue;
			}
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
			const tmp = bindAttributeEvaluation(printExprWithTsrx(mInner, ctx, name, inlinedSubs));
			selMultiple = tmp;
			flush();
			ctx.runtimeNeeded.add('ssrAttr');
			parts.push(
				`_$ssrAttr('multiple', ${tmp}, ${JSON.stringify(tag)}, ${JSON.stringify(selfNs)})`,
			);
			continue;
		}
		if (tag === 'option' && attrName === 'value') {
			if (resolveAttrsAcrossSpreads) {
				ensureAttrPart();
				const oInner =
					val == null ? null : val.type === 'JSXExpressionContainer' ? val.expression : val;
				const optionExpr = bindAttributeEvaluation(
					oInner === null ? 'true' : printExprWithTsrx(oInner, ctx, name, inlinedSubs),
				);
				attrSources.push(`[false, "value", ${optionExpr}]`);
				continue;
			}
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
			const tmp = bindAttributeEvaluation(printExprWithTsrx(oInner, ctx, name, inlinedSubs));
			optValue = tmp;
			flush();
			ctx.runtimeNeeded.add('ssrAttr');
			parts.push(`_$ssrAttr('value', ${tmp}, ${JSON.stringify(tag)}, ${JSON.stringify(selfNs)})`);
			continue;
		}

		if (resolveAttrsAcrossSpreads) {
			ensureAttrPart();
			let attrExpr;
			if (val == null) {
				attrExpr = 'true';
			} else {
				const attrInner = resolveStyleExpr(
					val.type === 'JSXExpressionContainer' ? val.expression : val,
					cssHash,
				);
				attrExpr = printExprWithTsrx(attrInner, ctx, name, inlinedSubs);
			}
			attrSources.push(
				`[false, ${JSON.stringify(rawAttrName)}, ${bindAttributeEvaluation(attrExpr)}]`,
			);
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
			parts.push(
				`_$ssrStyle(${bindAttributeEvaluation(printExprWithTsrx(inner, ctx, name, inlinedSubs))})`,
			);
			continue;
		}

		// Static literal (and not after a spread) → inline into the tag.
		// bakeStaticAttr applies the shared React-parity value tables (client
		// bake stays byte-identical — hydration parity).
		if (!isAfterSpread && inner.type === 'Literal') {
			lit += bakeStaticAttr(attrName, inner.value, tag, selfNs);
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
			const valueExpr = bindAttributeEvaluation(printExprWithTsrx(inner, ctx, name, inlinedSubs));
			parts.push(
				`_$ssrAttr(${JSON.stringify(outName)}, ((__v) => (typeof __v === 'function' ? null : __v))(${valueExpr}), ${JSON.stringify(tag)}, ${JSON.stringify(selfNs)})`,
			);
			continue;
		}

		// Dynamic attribute (or literal after a spread).
		flush();
		ctx.runtimeNeeded.add('ssrAttr');
		const valueExpr = bindAttributeEvaluation(printExprWithTsrx(inner, ctx, name, inlinedSubs));
		parts.push(
			`_$ssrAttr(${JSON.stringify(attrName)}, ${valueExpr}, ${JSON.stringify(tag)}, ${JSON.stringify(selfNs)})`,
		);
	}
	if (formControlPart !== -1) {
		if (tag === 'input') {
			ctx.runtimeNeeded.add('ssrInputAttrs');
			const inputAttrs = `_$ssrInputAttrs([${formControlSources.join(', ')}])`;
			// React serializes/coerces ordinary attributes before projecting the
			// effective checked/value state. Expressions and spread getters have
			// already run into temps in authored order; move only this serialization
			// helper after the generic attr channel.
			parts.splice(formControlPart, 1);
			if (attrPart > formControlPart) attrPart--;
			flush();
			parts.push(inputAttrs);
		} else {
			ctx.runtimeNeeded.add('ssrSelectAttrs');
			parts[formControlPart] = `_$ssrSelectAttrs([${formControlSources.join(', ')}])`;
		}
	}
	if (attrPart !== -1) {
		ctx.runtimeNeeded.add('ssrAttrs');
		parts[attrPart] =
			`_$ssrAttrs([${attrSources.join(', ')}], ${JSON.stringify(tag)}, ${JSON.stringify(selfNs)}, ${resolveFormControlsAcrossSpreads ? 'true' : 'false'})`;
	}

	// Void elements may contain syntactic whitespace/comments/nullish holes. They
	// still self-close, while every nullish expression evaluates once in normal
	// JSX order (attributes first, then children).
	if (VOID_ELEMENTS.has(tag) && hasOnlyPotentiallyNullishVoidChildren(node.children || [])) {
		const nestedVoidChildrenSources = [];
		for (const child of node.children || []) {
			if (
				child?.type === 'JSXExpressionContainer' &&
				child.expression &&
				child.expression.type !== 'JSXEmptyExpression'
			) {
				const childValue = bindAttributeEvaluation(
					printExprWithTsrx(rewriteJsxValues(child.expression, ctx), ctx, name, inlinedSubs),
				);
				nestedVoidChildrenSources.push(`[true, ${childValue}]`);
			}
		}
		const effectiveVoidChildrenSources = hasSemanticJsxChildren(node.children || [])
			? nestedVoidChildrenSources
			: childrenPropSources;
		if (htmlSources.length > 0 || effectiveVoidChildrenSources.length > 0) {
			flush();
			ctx.runtimeNeeded.add('ssrVoidContent');
			parts.push(
				`_$ssrVoidContent(${JSON.stringify(tag)}, [${htmlSources.join(', ')}], [${effectiveVoidChildrenSources.join(', ')}])`,
			);
		}
		lit += '/>';
		flush();
		return finalize();
	}

	if (tag !== 'option') lit += '>'; // option: ssrOption assembles the tag (attrs-only here)
	const normChildren = normalizeChildren(node.children || [], childNs === 'svg');
	const hasNestedChildren = normChildren.length > 0;
	const effectiveChildrenPropSources = hasNestedChildren ? [] : childrenPropSources;
	const definitelyHasDangerChild = hasDefinitelyNonNullishJsxChild(
		node.children || [],
		ctx.knownStringLocals,
	);
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
		if (childComponentNs !== null) {
			ctx.runtimeNeeded.add('ssrInNamespace');
			childrenExpr = `_$ssrInNamespace(${JSON.stringify(childComponentNs)}, () => ${childrenExpr})`;
		}
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
			childComponentNs,
			nlGuardFirst,
		);
	}
	// `children=` and spread-held children are content props, not attributes.
	// With no nested JSX children, the last present writer renders as the host's
	// sole child. A nested JSX child (including `{null}`) is the transform's final
	// writer and therefore leaves these earlier attribute sources inactive.
	if (effectiveChildrenPropSources.length > 0) {
		ctx.runtimeNeeded.add('ssrChildrenSources');
		childrenExpr = `_$ssrChildrenSources([${effectiveChildrenPropSources.join(', ')}], () => (${childrenExpr}), __s)`;
	}
	// Controlled `<textarea value/defaultValue>`: the prop IS the content
	// (children were rejected at compile time) — value wins over defaultValue,
	// a nullish value falls through to the default (the client cascade).
	if (tag === 'textarea' && resolveFormControlsAcrossSpreads) {
		ctx.runtimeNeeded.add('ssrTextareaValueSources');
		childrenExpr = `(_$ssrTextareaValueSources([${formControlSources.join(', ')}]) ?? (${childrenExpr}))`;
	} else if (tag === 'textarea' && (ctlValue !== null || ctlDefault !== null)) {
		ctx.runtimeNeeded.add('ssrTextareaValue');
		const src =
			ctlValue !== null && ctlDefault !== null
				? `(${ctlValue}) ?? (${ctlDefault})`
				: (ctlValue ?? ctlDefault);
		childrenExpr = `((${src}) == null ? (${childrenExpr}) : _$ssrTextareaValue(${src}))`;
	}
	// Controlled `<select value/defaultValue>`: push the option-projection
	// scope around the children serialization — every compiled/de-opt
	// `<option>` inside (across component boundaries and @for bodies; SSR is a
	// synchronous nested call tree) consults it via ssrOption.
	if (tag === 'select' && resolveFormControlsAcrossSpreads) {
		ctx.runtimeNeeded.add('ssrSelectScopeSources');
		childrenExpr = `_$ssrSelectScopeSources([${formControlSources.join(', ')}], () => (${childrenExpr}))`;
	} else if (tag === 'select' && (ctlValue !== null || ctlDefault !== null)) {
		ctx.runtimeNeeded.add('ssrSelectScope');
		childrenExpr = `_$ssrSelectScope(${ctlValue ?? 'void 0'}, ${ctlDefault ?? 'void 0'}, ${selMultiple}, () => (${childrenExpr}))`;
	}
	// `<option>`: assemble via ssrOption so an active select scope can mark it
	// ` selected` (returns a plain `<option …>` when no scope is active).
	if (tag === 'option') {
		let contentExpr = childrenExpr;
		if (htmlSources.length > 0) {
			ctx.runtimeNeeded.add('ssrInnerHtml');
			contentExpr = `(_$ssrInnerHtml([${htmlSources.join(', ')}], () => (${childrenExpr}), ${definitelyHasDangerChild}, [${effectiveChildrenPropSources.join(', ')}]) ?? (${childrenExpr}))`;
		}
		flush();
		const attrsExpr = parts.length > 0 ? parts.join(' + ') : "''";
		parts.length = 0;
		ctx.runtimeNeeded.add('ssrOption');
		let optionValueExpr = optValue ?? 'void 0';
		if (resolveAttrsAcrossSpreads) {
			ctx.runtimeNeeded.add('ssrOptionValueSources');
			optionValueExpr = `_$ssrOptionValueSources([${attrSources.join(', ')}])`;
		}
		parts.push(`_$ssrOption(${optionValueExpr}, ${attrsExpr}, ${contentExpr})`);
		return finalize();
	}
	if (htmlSources.length > 0) {
		// Raw HTML (explicit and/or spread-supplied) wins over children when present
		// at runtime (last source wins); otherwise the children render.
		const innerHtmlHelper = tag === 'script' ? 'ssrScriptInnerHtml' : 'ssrInnerHtml';
		ctx.runtimeNeeded.add(innerHtmlHelper);
		flush();
		parts.push(
			`(_$${innerHtmlHelper}([${htmlSources.join(', ')}], () => (${childrenExpr}), ${definitelyHasDangerChild}, [${effectiveChildrenPropSources.join(', ')}]) ?? (${childrenExpr}))`,
		);
	} else if (childrenExpr !== "''") {
		flush();
		parts.push(childrenExpr);
	}
	lit += `</${tag}>`;
	flush();
	return finalize();
}

function ssrEmitComponent(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs) {
	// M3 inherit-range: consume the body-root flag ONCE, before this component's
	// props/children compile below (they recurse into ssrEmitNodes/ssrCompileSub
	// and must not inherit it). Set by ssrCompileBody only for the sole
	// comp-call root of a `@{}` body — which is exactly this emit.
	const inherit = ctx._ssrInheritRoot === true;
	ctx._ssrInheritRoot = false;
	// Capture before compiling attributes/children: nested subs temporarily mutate
	// this context flag. Only this component's immediate children sub inherits the
	// returned-fragment mode; control-flow arm subs intentionally reset it.
	const returnedFragmentTemplate = ctx._returnedFragmentTemplate === true;
	const compExpr = tagExpr(node);
	const attrs = node.attributes || node.openingElement?.attributes || [];
	const propParts = [];
	let keyExpr = null;
	for (const attr of attrs) {
		if (attr.type === 'SpreadAttribute' || attr.type === 'JSXSpreadAttribute') {
			propParts.push(`...(${printExprWithTsrx(attr.argument, ctx, name, inlinedSubs)})`);
			continue;
		}
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
		const attrName = attr.name.name || attr.name;
		const val = attr.value;
		if (attrName === 'key') {
			if (val != null) {
				const inner = val.type === 'JSXExpressionContainer' ? val.expression : val;
				keyExpr = printExprWithTsrx(inner, ctx, name, inlinedSubs);
			}
			continue;
		}
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
	const sourceChildren = node.children || [];
	const renderPropChild = soleRenderPropChild(sourceChildren);
	if (renderPropChild) {
		propParts.push(
			`"children": (${printExprWithTsrx(rewriteJsxValues(renderPropChild, ctx), ctx, name, inlinedSubs)})`,
		);
	} else if (sourceChildren.length > 0) {
		const children = rewriteOpaqueTitles(sourceChildren, ctx, 'opaque');
		const opaqueChildren = !isActivityLongForm(node) && !isFragmentLongForm(node);
		const descriptorChildren =
			ctx._tsxValuePos ||
			(returnedFragmentTemplate && !requiresTemplateNormalization(node, parentNs));
		if (descriptorChildren) {
			// VALUE position (a React-style `.tsx` `return <jsx>` body), or an ordinary
			// component left as a descriptor hole inside a returned-fragment renderer:
			// pass children as createElement DESCRIPTOR(s), exactly like the client. The
			// component renders `{props.children}` → ssrChild(descriptor) → ONE block,
			// matching the client's childSlot(descriptor). A `__children` render-fn would
			// instead add a wrapping block (ssrChild wraps the fn), making the server one
			// block deeper than the client and desyncing the hydration cursor.
			const kids = children.map((c) => lowerJsxChild(c, ctx)).filter((e) => e != null);
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
			const sub = ssrCompileSub(
				children,
				ctx,
				'__schildren',
				[],
				cssHash,
				opaqueChildren ? 'opaque' : parentNs,
				opaqueChildren ? null : componentNs,
				returnedFragmentTemplate,
			);
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
	const explicitNamespace = componentNs !== null;
	const helper = explicitNamespace ? 'ssrComponentNS' : 'ssrComponent';
	ctx.runtimeNeeded.add(helper);
	const trailing = explicitNamespace
		? `, ${JSON.stringify(componentNs)}, ${inherit ? 'true' : 'false'}${keyExpr === null ? '' : `, (${keyExpr})`}`
		: keyExpr !== null
			? `, ${inherit ? 'true' : 'false'}, (${keyExpr})`
			: inherit
				? ', true'
				: '';
	return `_$${helper}(__s, ${compExpr}, { ${propParts.join(', ')} }${trailing})`;
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
function ssrCompileSub(
	bodyStmts,
	ctx,
	baseName,
	paramNodes,
	cssHash,
	parentNs,
	componentNs,
	returnedFragmentTemplate = false,
	returnedFragmentRoot = false,
) {
	const fnName = `${baseName}$${ctx.nextHelperId++}`;
	const synth = { params: paramNodes || [], body: bodyStmts };
	const fn = ssrCompileBody(
		synth,
		ctx,
		fnName,
		cssHash,
		[],
		parentNs || 'html',
		false,
		componentNs,
		returnedFragmentTemplate,
		returnedFragmentRoot,
	);
	return { fnName, fn };
}

function ssrEmitIf(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs) {
	// rewriteHookCalls: key any `use(thenable)` in the @if test (it bypasses the
	// setup rewrite, so without a stable key it collides with sibling/body use()).
	const testExpr = printExpr(rewriteHookCalls(node.test, ctx, name));
	const thenStmts =
		node.consequent.type === 'BlockStatement' ? node.consequent.body : [node.consequent];
	const thenSub = ssrCompileSub(thenStmts, ctx, '__sif', [], cssHash, parentNs, componentNs);
	inlinedSubs.push(thenSub.fn + ';');
	let elseCall = "''";
	if (node.alternate) {
		// An `else if` arrives as an IfStatement; wrap it so it recurses through
		// ssrEmitNode and gets its own marker.
		const elseStmts =
			node.alternate.type === 'BlockStatement' ? node.alternate.body : [node.alternate];
		const elseSub = ssrCompileSub(elseStmts, ctx, '__selse', [], cssHash, parentNs, componentNs);
		inlinedSubs.push(elseSub.fn + ';');
		elseCall = `${elseSub.fnName}(undefined, __s)`;
	}
	ctx.runtimeNeeded.add('ssrBlock');
	ctx.runtimeNeeded.add('ssrControl');
	ctx.runtimeNeeded.add('ssrArm');
	// Nested ranges: the OUTER ssrBlock is the if-slot; the INNER one wraps the
	// taken branch's content. The client adopts BOTH on hydration (slot = outer,
	// branch = inner) so no comment markers are inserted — byte-for-byte, exactly
	// like @for. The not-taken arm emits no inner range (just `''`).
	const thenInner = `_$ssrArm("then", () => _$ssrBlock(${thenSub.fnName}(undefined, __s)))`;
	const elseInner = node.alternate ? `_$ssrArm("else", () => _$ssrBlock(${elseCall}))` : "''";
	return `_$ssrBlock(_$ssrControl("${ssrControlKey('if', node)}", () => ((${testExpr}) ? ${thenInner} : ${elseInner})))`;
}

function ssrEmitActivity(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs) {
	// React's server contract renders visible content and omits hidden content
	// entirely. Keep the body behind a thunk so a hidden Activity does not execute
	// child components/hooks or start descendant data work on the server.
	const modeExpr = node.mode ? printExpr(rewriteHookCalls(node.mode, ctx, name)) : "'visible'";
	const bodySub = ssrCompileSub(
		node.children || [],
		ctx,
		'__sactivity',
		[],
		cssHash,
		parentNs,
		componentNs,
	);
	inlinedSubs.push(bodySub.fn + ';');
	ctx.runtimeNeeded.add('ssrActivity');
	ctx.runtimeNeeded.add('ssrControl');
	ctx.runtimeNeeded.add('ssrArm');
	return `_$ssrControl("${ssrControlKey('activity', node)}", () => _$ssrActivity(${modeExpr}, () => _$ssrArm("visible", () => ${bodySub.fnName}(undefined, __s))))`;
}

function ssrEmitFor(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs) {
	// rewriteHookCalls: key any `use(thenable)` in the @for iterable expression.
	const itemsExpr = printExpr(rewriteHookCalls(node.right, ctx, name));
	const itemId = node.left.declarations[0].id; // Identifier or destructuring Pattern
	const params = [itemId];
	if (node.index) params.push(node.index);
	const itemSub = ssrCompileSub(
		node.body.body,
		ctx,
		'__sitem',
		params,
		cssHash,
		parentNs,
		componentNs,
	);
	inlinedSubs.push(itemSub.fn + ';');
	let emptyCall = "''";
	if (node.empty) {
		const emptyStmts = node.empty.type === 'BlockStatement' ? node.empty.body : [node.empty];
		const emptySub = ssrCompileSub(emptyStmts, ctx, '__sempty', [], cssHash, parentNs, componentNs);
		inlinedSubs.push(emptySub.fn + ';');
		emptyCall = `_$ssrArm("empty", () => ${emptySub.fnName}(undefined, __s))`;
	}
	ctx.runtimeNeeded.add('ssrBlock');
	ctx.runtimeNeeded.add('ssrForBlock');
	ctx.runtimeNeeded.add('ssrControl');
	let itemKey = '__it != null && __it.id != null ? __it.id : __it';
	let explicitKey = null;
	const firstEl = (node.body.body || []).find(
		(child) => child.type === 'Element' || child.type === 'JSXElement',
	);
	if (firstEl) {
		const keyAttr = (firstEl.attributes || firstEl.openingElement?.attributes || []).find(
			(attr) => (attr.name?.name || attr.name) === 'key',
		);
		if (keyAttr?.value != null) {
			explicitKey =
				keyAttr.value.type === 'JSXExpressionContainer' ? keyAttr.value.expression : keyAttr.value;
		}
	}
	if (explicitKey === null) explicitKey = node.key || null;
	if (explicitKey !== null) {
		const keyParams = [itemId];
		if (node.index) keyParams.push(node.index);
		const keyFn = printExpr({
			type: 'ArrowFunctionExpression',
			params: keyParams,
			body: explicitKey,
			expression: true,
		});
		itemKey = `(${keyFn})(__it${node.index ? ', __i' : ''})`;
	} else if (node.index) {
		itemKey = '__i';
	}
	const markerlessItem = isSsrMarkerlessForItem(node);
	// ssrArm exists solely to make use()/component identity distinct per item.
	// Skip it when the item is compiler-proven synchronous and transparent:
	// no render-time calls, nested components/control flow, or renderable child
	// helper that could execute an opaque descriptor. Property reads and text /
	// attribute serialization stay on the allocation-free path, matching the
	// client forBlock's existing PURE-body proof.
	const itemNeedsIdentity =
		containsComponentCallOrControlFlow(node.body.body) ||
		containsRenderCall(node.body.body) ||
		itemSub.fn.includes('_$ssrChild') ||
		itemSub.fn.includes('_$ssrComponent');
	const itemCall = node.index
		? `${itemSub.fnName}(__it, __i, __s)`
		: `${itemSub.fnName}(__it, __s)`;
	const itemHtml = markerlessItem ? itemCall : `_$ssrBlock(${itemCall})`;
	const renderItem = itemNeedsIdentity ? `_$ssrArm((${itemKey}), () => ${itemHtml})` : itemHtml;
	if (node.empty || itemNeedsIdentity) ctx.runtimeNeeded.add('ssrArm');
	// Render every item into one incrementally-built string. Avoid map().join():
	// besides the mapper callback, it allocates an N-entry intermediate array and
	// eagerly flattens the whole list string before the caller can consume it.
	// A proven direct-host item uses that host as its hydration/reorder boundary,
	// matching the client's existing singleRoot path; general item shapes retain
	// their own block pair. Identity-transparent items also skip ssrArm; opaque or
	// suspending bodies retain it so use() and child component frames stay keyed.
	return `_$ssrControl("${ssrControlKey('for', node)}", () => { const __items = Array.from((${itemsExpr}) ?? []); if (__items.length === 0) return _$ssrForBlock(${emptyCall}, false); let __html = ''; for (let __i = 0; __i < __items.length; __i++) { const __it = __items[__i]; __html += ${renderItem}; } return _$ssrForBlock(__html, true); })`;
}

function ssrEmitSwitch(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs) {
	// rewriteHookCalls: key any `use(thenable)` in the @switch discriminant.
	const discExpr = printExpr(rewriteHookCalls(node.discriminant, ctx, name));
	const arms = [];
	let defaultCall = "''";
	let caseIndex = 0;
	for (const c of node.cases || []) {
		const sub = ssrCompileSub(
			c.consequent || [],
			ctx,
			'__scase',
			[],
			cssHash,
			parentNs,
			componentNs,
		);
		inlinedSubs.push(sub.fn + ';');
		// Inner ssrBlock wraps the matched case's content (see ssrEmitIf) so the
		// client adopts it as the branch range during hydration (no inserted markers).
		if (c.test == null)
			defaultCall = `_$ssrArm("default", () => _$ssrBlock(${sub.fnName}(undefined, __s)))`;
		else
			arms.push(
				`__d === (${printExpr(c.test)}) ? _$ssrArm("case:${caseIndex}", () => _$ssrBlock(${sub.fnName}(undefined, __s)))`,
			);
		caseIndex++;
	}
	ctx.runtimeNeeded.add('ssrBlock');
	ctx.runtimeNeeded.add('ssrControl');
	ctx.runtimeNeeded.add('ssrArm');
	// First case matching by strict-equality wins (no JS fall-through); else default.
	const selector = arms.length ? `${arms.join(' : ')} : ${defaultCall}` : defaultCall;
	return `_$ssrBlock(_$ssrControl("${ssrControlKey('switch', node)}", () => { const __d = (${discExpr}); return ${selector}; }))`;
}

function ssrEmitTry(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs) {
	const trySub = ssrCompileSub(node.block.body, ctx, '__stry', [], cssHash, parentNs, componentNs);
	inlinedSubs.push(trySub.fn + ';');
	// Each arm's content is wrapped in an INNER ssrBlock (see ssrEmitIf) so the
	// client adopts it as the boundary's branch range during hydration without
	// inserting comment markers (byte-for-byte). The OUTER ssrBlock is the slot.
	let pendFnName = 'null'; // no @pending → ssrTry renders an empty slot on suspend
	if (node.pending && node.pending.body && node.pending.body.length > 0) {
		const pendSub = ssrCompileSub(
			node.pending.body,
			ctx,
			'__spend',
			[],
			cssHash,
			parentNs,
			componentNs,
		);
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
			componentNs,
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
	const namespaceArg = componentNs === null ? '' : `, ${JSON.stringify(componentNs)}`;
	return `_$ssrTry(__s, "${ssrTryKey(node)}", ${trySub.fnName}, ${pendFnName}, ${catchFnName}${namespaceArg})`;
}

// Deterministic per-boundary site key for ssrTry — same scheme as headKey:
// keyed ONLY on the node's source position (same AST → same offset across the
// client and server compiles of one source), hashed compactly.
function ssrTryKey(node) {
	return ssrControlKey('try', node);
}

function ssrControlKey(kind, node) {
	const loc = node && node.loc && node.loc.start;
	const pos = node && node.start != null ? node.start : `${loc?.line ?? 0}:${loc?.column ?? 0}`;
	const src = `${kind}:${pos}`;
	let h = 5381;
	for (let i = 0; i < src.length; i++) h = (Math.imul(h, 33) + src.charCodeAt(i)) | 0;
	return kind[0] + (h >>> 0).toString(36);
}

// `{createPortal(...)}` (and other JSX-bearing expression holes) at child
// position arrive as TSRXExpression. A portal leaves a site marker on the
// server (its body renders into a foreign target on the client). Every other
// rich hole — `{xs.map(x => <li/>)}`, a JSX ternary, an array of elements — is a
// VALUE-position JSX hole: lower its JSX to `createElement(...)` descriptors (via
// rewriteJsxValues, exactly like the client's makeChildCall) and route through
// ssrChild, which renders the resulting host/component descriptors (array → one
// hydration block per item, host → `<tag>…</tag>`, primitive → text). A returned
// JSX value containing template-only syntax instead mirrors the client's compiled
// renderer component so its template scopes and hydration range both survive.
function ssrEmitTsrxExpression(node, ctx, name, inlinedSubs, parentNs, cssHash, componentNs) {
	const expr = node.expression;
	if (node.returnedJsxValue === true && requiresTemplateNormalization(expr)) {
		// A returned JSX value that contains template-only syntax is one compiled
		// renderer on the client (rather than a descriptor array whose value
		// lowering cannot represent directives, sentinels, head hoists, or child
		// code blocks). Mirror that component boundary on the server: the local
		// sub-function keeps access to the
		// enclosing return component's props/locals, while ssrComponent emits the
		// range the client descriptor adopts during hydration.
		// The final flag mirrors extractFragment's component-child decision inside
		// this synthetic renderer: ordinary opaque components remain descriptor
		// holes, while components owning directives still receive template children.
		const sub = ssrCompileSub(
			[expr],
			ctx,
			'__sfragment',
			[],
			cssHash,
			parentNs,
			componentNs,
			true,
			true,
		);
		inlinedSubs.push(sub.fn + ';');
		ctx.runtimeNeeded.add('ssrComponent');
		return `_$ssrComponent(__s, ${sub.fnName}, {})`;
	}
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
	const childExpr = `_$ssrChild(${printExpr(resolveStyleExpr(lowered, cssHash))}, __s)`;
	if (componentNs === null) return childExpr;
	ctx.runtimeNeeded.add('ssrInNamespace');
	return `_$ssrInNamespace(${JSON.stringify(componentNs)}, () => ${childExpr})`;
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
		ctx.cssInjections.push({ hash, css, order: styleNode.start ?? stmt.start ?? 0 });
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
 * Find the JSX render roots owned by a component. `@{}` components expose one
 * `JSXCodeBlock.render`; React-style functions can return JSX from any block in
 * their own body. Nested functions are separate component/value boundaries and
 * must not donate styles to their enclosing component.
 */
function componentStyleRoots(componentNode) {
	const body = componentNode.body;
	if (!body) return [];
	if (body.type === 'JSXCodeBlock') {
		return body.render
			? [
					{
						node: body.render,
						replace(next) {
							body.render = next;
						},
					},
				]
			: [];
	}
	if (body.type !== 'BlockStatement') return [];

	const roots = [];
	function visit(node) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			return;
		}
		if (node.type === 'ReturnStatement') {
			if (node.argument && isJsxNode(node.argument)) {
				roots.push({
					node: node.argument,
					replace(next) {
						node.argument = next;
					},
				});
			}
			return;
		}
		for (const key of Object.keys(node)) {
			if (
				key === 'loc' ||
				key === 'start' ||
				key === 'end' ||
				key === 'parent' ||
				key === 'metadata' ||
				key === 'css'
			)
				continue;
			visit(node[key]);
		}
	}
	visit(body);
	return roots;
}

/**
 * Walk a component's owned render roots for `JSXStyleElement` nodes. For each
 * one found:
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
 * The first `JSXStyleElement` contributes the canonical hash for the whole
 * component. @tsrx/core hashes individual style tags by source position, so
 * multiple blocks are explicitly rebased onto that canonical component hash
 * before selector rendering. Every rendered root receives the same hash class.
 */
function applyCssScoping(componentNode, ctx) {
	const roots = componentStyleRoots(componentNode);
	if (roots.length === 0) return null;
	let cssHash = null;
	const styles = [];
	function collect(node) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const i of node) collect(i);
			return;
		}
		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			return;
		}
		if (node.type === 'JSXStyleElement') {
			const sheet = (node.children || []).find((c) => c && c.type === 'StyleSheet');
			if (sheet) {
				styles.push({ node, sheet });
				if (!cssHash) cssHash = node.metadata?.styleScopeHash || sheet.hash || null;
			}
			return;
		}
		for (const key of Object.keys(node)) {
			if (
				key === 'loc' ||
				key === 'start' ||
				key === 'end' ||
				key === 'parent' ||
				key === 'metadata' ||
				key === 'css'
			)
				continue;
			const v = node[key];
			if (v && typeof v === 'object') collect(v);
		}
	}
	for (const root of roots) collect(root.node);
	if (!cssHash || styles.length === 0) return null;
	for (const style of styles) {
		// A component has one scope even when its CSS is split for readability.
		// Rebase before analyze/render: selector and keyframe rewriting read
		// `sheet.hash`, while DOM annotation below uses `cssHash`.
		style.sheet.hash = cssHash;
		if (style.node.metadata) style.node.metadata.styleScopeHash = cssHash;
		// Mark `:global(...)` selectors before scoping so they render unscoped.
		analyzeCss(style.sheet);
		prepareStylesheetForRender(style.sheet);
	}
	const css = renderStylesheets(styles.map((style) => style.sheet));
	ctx.cssInjections.push({
		hash: cssHash,
		css,
		order: styles[0]?.sheet.start ?? styles[0]?.node.start ?? componentNode.start ?? 0,
	});
	ctx.runtimeNeeded.add('injectStyle');
	// Mutate every owned render root: add the canonical hash class to native
	// elements and strip JSXStyleElement nodes from DOM output.
	for (const root of roots) {
		// Normalize dynamic class exprs BEFORE the hash is appended (see helper), so
		// clsx array/object values compose correctly alongside the scope hash.
		wrapScopedClassExprs(root.node, ctx);
		root.replace(annotateWithHash(root.node, cssHash, 'class', false));
	}
	return cssHash;
}

function compileComponent(node, ctx, options) {
	const name = node.id.name;
	rejectAsyncOrGenerator(node, name);
	recordProfileComponent(ctx, node, name);
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
		ctx.cssInjections.push({ hash: cssHash, css, order: node.start ?? 0 });
		ctx.runtimeNeeded.add('injectStyle');
	}

	// Snapshot the component's outer locals so nested for-of bodies can do
	// purity analysis (and auto-memo when the body doesn't reference any of
	// them). Stash on ctx for the duration of this compile so nested makeForCall
	// can reach it; restore on exit so sibling components don't see this one's
	// locals.
	const prevLocals = ctx.currentComponentLocals;
	const prevAutoMemoCallsitesSafe = ctx.currentAutoMemoCallsitesSafe;
	const prevKnownStr = ctx.knownStringLocals;
	const prevProfileComponentId = ctx.currentProfileComponentId;
	ctx.currentComponentLocals = collectComponentLocals(node);
	ctx.currentAutoMemoCallsitesSafe = ctx.componentInfo.get(name)?.autoMemoCallsitesSafe !== false;
	ctx.knownStringLocals = collectKnownStringLocals(node);
	if (ctx.profile) ctx.currentProfileComponentId = profileComponentId(ctx, name, node);
	let fn;
	try {
		// autoCallback: only top-level component bodies opt in. Item bodies and
		// other inner compileFunctionBody calls leave their arrows untouched
		// (they rarely declare arrow consts; if they do, the stability oracle
		// would need to be redefined relative to the inner scope).
		fn = compileFunctionBody(node, ctx, name, 'opaque', cssHash, {
			autoCallback: true,
			localHookSlots: true,
		});
	} finally {
		ctx.currentComponentLocals = prevLocals;
		ctx.currentAutoMemoCallsitesSafe = prevAutoMemoCallsitesSafe;
		ctx.knownStringLocals = prevKnownStr;
		ctx.currentProfileComponentId = prevProfileComponentId;
	}

	// Parallel-use warm plan: attached to the INNER function object (not the
	// module const) so the component's own body — where the function-
	// expression name shadows the const — resolves `_$warmChild(Self, …)` to
	// an object that carries the plan. hmr() forwards `__warm` from the
	// wrapped fn onto its wrapper for cross-module references.
	const warmedFn = ctx._pendingWarm ? `Object.assign(${fn}, { __warm: ${ctx._pendingWarm} })` : fn;
	ctx._pendingWarm = null;

	// HMR-wrap exported components inline so the binding stays a `const` (no
	// reassignment dance needed in Vite). Webpack/Rspack HMR instead uses a `let`
	// binding so a re-evaluated module can hand its export back to the previous
	// canonical wrapper stored in hot dispose data. The wrapper preserves the user-facing
	// function-name identity by NAMING the inner FunctionExpression — `hmr`
	// returns a wrapper that delegates to whatever fn is currently committed,
	// and `module.Foo[HMR].update(...)` swaps it on each accept.
	const valueExpr = hmrWrap && isExported ? `_$hmr(${warmedFn})` : warmedFn;
	const declaration = options && options.hmrMutable ? 'let' : 'const';
	if (isDefault) {
		if (options && options.hmrMutable) {
			return `let ${name} = ${valueExpr};\nexport { ${name} as default };`;
		}
		return `const ${name} = ${valueExpr};\nexport default ${name};`;
	}
	if (isExported) {
		return `export ${declaration} ${name} = ${valueExpr};`;
	}
	return `const ${name} = ${valueExpr};`;
}

/**
 * Generate just the `function (...) { ... }` text for a component-shaped node.
 * Used both for top-level components and for inlined for-of item bodies.
 *
 * `parentNs` is the namespace this body's JSX is rendered into. Top-level
 * components use 'opaque' because their call site can select HTML, SVG, or
 * MathML; an if/for/try body inherits its known host namespace.
 *
 * `cssHash` is the enclosing component's scoped-style hash (or null) — used to
 * resolve `{style ('cls')}` expressions to "<hash> cls" strings.
 */
function compileFunctionBody(node, ctx, name, parentNs = 'html', cssHash = null, options = null) {
	const prevAutoMemoOffset = ctx.currentAutoMemoOffset;
	const prevAutoMemoCacheName = ctx.currentAutoMemoCacheName;
	const prevAutoMemoCommittedName = ctx.currentAutoMemoCommittedName;
	const autoMemoCacheName = allocCompilerName(ctx, '__memoCache');
	const autoMemoCommittedName = allocCompilerName(ctx, '__memoCommitted');
	const autoMemoCacheProperty = `_m$${ctx.nextAutoMemoCacheId++}`;
	ctx.currentAutoMemoOffset = 0;
	ctx.currentAutoMemoCacheName = autoMemoCacheName;
	ctx.currentAutoMemoCommittedName = autoMemoCommittedName;
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
	let mountCallbackSinks = new Map();
	let bodyInvariantLocals = null;
	if (options && options.autoCallback && ctx.currentComponentLocals) {
		const stableSet = computeStableLocals(statements, ctx.currentComponentLocals);
		bodyInvariantLocals = computeInvariantLocals(statements, ctx.currentComponentLocals, true);
		mountCallbackSinks = findMountEventCallbackSinks(
			statements,
			jsxNodes,
			stableSet,
			bodyInvariantLocals,
			ctx,
		);
		workingStatements = removeMountEventCallbackDeclarations(statements, mountCallbackSinks).map(
			(s) => rewriteAutoCallback(s, stableSet, ctx.currentComponentLocals, ctx),
		);
	}

	// The parallel-`use()` pipeline (docs/suspense-parallel-use-plan.md)
	// slots in HERE — after autoCallback (so memoized creations aren't re-wrapped),
	// before rewriteHookCalls (so the _$useMemo/_$useBatch calls it emits are
	// compiler-aliased, not user identifiers). Top-level component bodies run the
	// full pipeline: Pass A memoizes creations across the body AND the directive
	// arms of the render tree (arms hoist into sub-bodies later, already
	// transformed), the warm plan is derived from that same analysis, and Pass B
	// hoists+batches. Sub-bodies (hoisted @try/@if arms via hoistBodyHelper's
	// legacy path) arrive pre-memoized and run Pass B only.
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

	// Rewrite hook calls and `<tsrx>` blocks in statements before printing them.
	// A `<tsrx>` block at expression position (e.g. `const f = <tsrx>...</tsrx>`)
	// is hoisted as a render function in inlinedSubs and replaced with an
	// identifier reference. Suitable for top-level render-prop patterns where
	// the block doesn't capture local arrow params.
	const rewrittenStatements = workingStatements
		.map((s) => rewriteHookCalls(s, ctx, name, options?.localHookSlots === true))
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
	// Keep the lifetime-stability proof live only while planning this body's JSX.
	// Nested hoisted helpers derive a filtered inherited set in hoistBodyHelper.
	const prevInvariantLocals = ctx.currentInvariantLocals;
	const prevEventInvariantLocals = ctx.currentEventInvariantLocals;
	const invariantLocals = new Set(prevInvariantLocals || []);
	const eventInvariantLocals = new Set(prevEventInvariantLocals || []);
	if (ctx.currentComponentLocals) {
		const bodyInvariants =
			bodyInvariantLocals ||
			computeInvariantLocals(
				statements,
				ctx.currentComponentLocals,
				options?.autoCallback === true,
			);
		for (const local of bodyInvariants) {
			invariantLocals.add(local);
		}
		for (const local of computeEventInvariantLocals(statements, bodyInvariants)) {
			eventInvariantLocals.add(local);
		}
	}
	ctx.currentInvariantLocals = invariantLocals;
	ctx.currentEventInvariantLocals = eventInvariantLocals;
	// M3 inherit-range: only a real `@{ … }` (JSXCodeBlock) component body spans
	// its block's whole range — synthetic sub-bodies (@if/@for/@try arms,
	// children render-fns) pass statement arrays and stay unflagged. planJsx
	// consumes the flag once (nested planJsx calls see it cleared).
	const prevInheritBody = ctx._inheritBody;
	ctx._inheritBody =
		!ctx.hydrateBoundaryModule && !!(node.body && node.body.type === 'JSXCodeBlock');
	const plan = planJsx(jsxNodes, ctx, name, inlinedSubs, parentNs, cssHash, mountCallbackSinks);
	ctx.currentInvariantLocals = prevInvariantLocals;
	ctx.currentEventInvariantLocals = prevEventInvariantLocals;
	ctx._inheritBody = prevInheritBody;
	ctx._foldedDirectiveCalls = prevFDC;

	const lines = [];
	const autoMemoSize = ctx.currentAutoMemoOffset;
	if (autoMemoSize > 0) {
		lines.push(
			`  const ${autoMemoCommittedName} = __s.slots.${autoMemoCacheProperty};`,
			`  let ${autoMemoCacheName} = ${autoMemoCommittedName} === undefined ? [] : ${autoMemoCommittedName};`,
		);
	}
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
	if (autoMemoSize > 0) {
		lines.push(
			`  if (${autoMemoCacheName} !== ${autoMemoCommittedName}) __s.slots.${autoMemoCacheProperty} = ${autoMemoCacheName};`,
		);
	}

	// PROPS-FIRST convention: `(…userProps, __s, __extra)`. The scope is the 2nd arg
	// (a placeholder leads when there are no user params), so a plain function
	// `App(props)` binds `props`, while compiled bodies still read `__s` by name.
	const sig = params ? `${params}, __s, __extra` : `__props, __s, __extra`;
	const bodyCode = lines.join('\n');
	const needsBlock = bodyCode.includes('__block');
	if (!needsBlock && setupMaps) {
		// Omitting the header shifts every setup statement up by one generated line.
		for (const mapping of setupMaps) mapping.fnRelLine--;
	}
	ctx.currentAutoMemoOffset = prevAutoMemoOffset;
	ctx.currentAutoMemoCacheName = prevAutoMemoCacheName;
	ctx.currentAutoMemoCommittedName = prevAutoMemoCommittedName;
	return `function ${name}(${sig}) {\n${needsBlock ? '  const __block = __s.block;\n' : ''}${bodyCode}\n}`;
}

/**
 * The universal first pass deliberately removes JSX before it re-enters the
 * shared client compiler. That keeps DOM planning out of renderer-neutral
 * output, but it also means the ordinary component recognizer cannot see the
 * generated component bodies. Apply the renderer-independent parallel-use
 * passes to those explicitly identified bodies here, while the same hook-slot
 * allocator/import collector is still active.
 */
function universalRuntimeUnitForTopLevelNode(node, ctx) {
	let declaration = node;
	if (node?.type === 'ExportNamedDeclaration' || node?.type === 'ExportDefaultDeclaration') {
		declaration = node.declaration;
	}
	const names = [];
	if (declaration?.id?.type === 'Identifier') names.push(declaration.id.name);
	if (declaration?.type === 'VariableDeclaration') {
		for (const item of declaration.declarations ?? []) {
			if (item.id?.type === 'Identifier') names.push(item.id.name);
		}
	}
	let unit;
	for (const name of names) {
		const candidate = ctx._universalRuntimeUnitsByBinding?.get(name);
		if (candidate === undefined) continue;
		if (unit !== undefined && unit !== candidate) {
			throw new Error(`Top-level declaration mixes universal renderer specializations: ${names}.`);
		}
		unit = candidate;
	}
	return unit;
}

function transformUniversalParallelUse(ast, ctx, metadata) {
	if (!metadata?.componentHelper) return;
	const previousUseAliases = ctx._parallelUseAliases;
	const previousUniversalUnit = ctx._universalRuntimeUnit;
	ctx._universalRuntimeUnit = metadata;
	ctx._parallelUseAliases = new Set(
		(metadata.runtimeImports ?? [])
			.filter((entry) => entry.imported === 'use')
			.map((entry) => entry.local),
	);
	const transformed = new WeakSet();
	const components = new Map();
	for (const entry of metadata.components || []) {
		const queue = components.get(entry.name) || [];
		queue.push(entry);
		components.set(entry.name, queue);
	}
	const takeComponent = (name) => components.get(name)?.shift() || null;
	let regionIndex = 0;

	const calleeName = (node) =>
		node?.type === 'CallExpression' && node.callee?.type === 'Identifier' ? node.callee.name : null;
	const isFunction = (node) =>
		node?.type === 'FunctionExpression' || node?.type === 'ArrowFunctionExpression';
	const unwrapAssignedFunction = (node) => {
		if (isFunction(node)) return node;
		if (
			node?.type === 'CallExpression' &&
			node.callee?.type === 'MemberExpression' &&
			!node.callee.computed &&
			node.callee.object?.type === 'Identifier' &&
			node.callee.object.name === 'Object' &&
			node.callee.property?.type === 'Identifier' &&
			node.callee.property.name === 'assign' &&
			isFunction(node.arguments?.[0])
		) {
			return node.arguments[0];
		}
		return null;
	};

	const collectWarmChildren = (root) => {
		const output = [];
		const visit = (node) => {
			if (!node || typeof node !== 'object') return;
			if (Array.isArray(node)) {
				for (const child of node) visit(child);
				return;
			}
			if (isFunction(node)) return;
			if (
				node.type === 'CallExpression' &&
				calleeName(node) === metadata.componentValueHelper &&
				node.arguments?.[1]?.type === 'Identifier'
			) {
				const propsCall = node.arguments[2];
				const entries = propsCall?.arguments?.[0];
				if (
					calleeName(propsCall) === metadata.propsHelper &&
					propsCall.arguments.length === 1 &&
					entries?.type === 'ArrayExpression'
				) {
					const props = [];
					let supported = true;
					for (const entry of entries.elements || []) {
						const parts = entry?.type === 'ArrayExpression' ? entry.elements : null;
						const kind = parts?.[0]?.value;
						const key = parts?.[1]?.value;
						if (
							kind !== 'set' ||
							typeof key !== 'string' ||
							!/^[$A-Z_a-z][$\w]*$/.test(key) ||
							key === 'key' ||
							key === 'ref' ||
							parts?.[2] == null
						) {
							supported = false;
							break;
						}
						props.push({ key, value: parts[2] });
					}
					if (supported) {
						output.push({
							compName: node.arguments[1].name,
							props,
							guards: [],
							locals: null,
						});
					}
				}
			}
			for (const [key, child] of Object.entries(node)) {
				if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
				visit(child);
			}
		};
		visit(root);
		return output;
	};

	const parseWarmExpression = (source) => {
		const parsed = parseModule(`const __octaneUniversalWarm = (${source});`, ctx.filename);
		return parsed.body[0].declarations[0].init;
	};
	const annotateAuthoredHooks = (fn, component, componentName) => {
		if (!ctx.profile || !component?.hooks?.length) return;
		const queues = new Map();
		for (const hook of component.hooks) {
			const queue = queues.get(hook.name) || [];
			queue.push(hook);
			queues.set(hook.name, queue);
		}
		const owner = {
			name: componentName,
			id: `${ctx.profileFilename || '<anon>'}#${componentName}@${component.line}:${component.column}`,
		};
		const visit = (node) => {
			if (!node || typeof node !== 'object') return;
			if (Array.isArray(node)) {
				for (const child of node) visit(child);
				return;
			}
			if (node.type === 'CallExpression' && calleeName(node) === metadata.componentHelper) {
				for (let index = 0; index < (node.arguments?.length || 0); index++) {
					if (index !== 1) visit(node.arguments[index]);
				}
				return;
			}
			if (node.type === 'CallExpression') {
				let hookName = null;
				if (node.callee?.type === 'Identifier' && !node.callee.name.startsWith('_$')) {
					hookName = ctx.octaneImportLocals?.get(node.callee.name) ?? node.callee.name;
				} else if (
					node.callee?.type === 'MemberExpression' &&
					!node.callee.computed &&
					node.callee.property?.type === 'Identifier'
				) {
					hookName = node.callee.property.name;
				}
				const hook = queues.get(hookName)?.shift();
				if (hook !== undefined) {
					Object.defineProperty(node, '_octaneProfileLoc', {
						value: { line: hook.line, column: hook.column },
						configurable: true,
					});
					Object.defineProperty(node, '_octaneUniversalProfileOwner', {
						value: owner,
						configurable: true,
					});
				}
			}
			for (const [key, child] of Object.entries(node)) {
				if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
				visit(child);
			}
		};
		visit(fn.body);
	};
	const assignWarmPlan = (fn, source) => ({
		type: 'CallExpression',
		callee: {
			type: 'MemberExpression',
			object: { type: 'Identifier', name: 'Object' },
			property: { type: 'Identifier', name: 'assign' },
			computed: false,
			optional: false,
		},
		arguments: [
			fn,
			{
				type: 'ObjectExpression',
				properties: [
					{
						type: 'Property',
						key: { type: 'Identifier', name: '__warm' },
						value: parseWarmExpression(source),
						kind: 'init',
						method: false,
						shorthand: false,
						computed: false,
					},
				],
			},
		],
		optional: false,
	});

	const transformFunction = (fn, name, component) => {
		if (!isFunction(fn) || transformed.has(fn)) return fn;
		transformed.add(fn);
		annotateAuthoredHooks(fn, component, name);
		if (fn.body?.type !== 'BlockStatement') {
			scan(fn.body, name);
			return fn;
		}
		const previousLocals = ctx.currentComponentLocals;
		const previousProfile = ctx.currentProfileComponentId;
		ctx.currentComponentLocals = collectComponentLocals(fn);
		if (component && ctx.profile) {
			ctx.currentProfileComponentId = `${ctx.profileFilename || '<anon>'}#${name}@${component.line}:${component.column}`;
		}
		let warmSource = null;
		try {
			const creations = [];
			const warmChildren = component ? collectWarmChildren(fn.body) : [];
			let statements = parallelUseMemoizePass(fn.body.body || [], ctx, name, creations, [], null);
			const warm = component
				? buildWarmArtifacts(fn, ctx, name, creations, warmChildren)
				: { thunk: null, warmSrc: null };
			statements = rewriteParallelUse(statements, ctx, name, warm.thunk);
			fn.body = { ...fn.body, body: statements };
			warmSource = warm.warmSrc;
		} finally {
			ctx.currentComponentLocals = previousLocals;
			ctx.currentProfileComponentId = previousProfile;
		}
		scan(fn.body, name);
		return warmSource === null ? fn : assignWarmPlan(fn, warmSource);
	};

	const transformThunkValue = (node, ownerName) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) transformThunkValue(child, ownerName);
			return;
		}
		if (isFunction(node)) {
			transformFunction(node, `${ownerName}.region${regionIndex++}`, null);
			return;
		}
		if (node.type === 'ArrayExpression') {
			for (const child of node.elements || []) transformThunkValue(child, ownerName);
			return;
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
			transformThunkValue(child, ownerName);
		}
	};

	function scan(node, ownerName = 'module') {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) scan(child, ownerName);
			return;
		}
		if (isFunction(node)) return;
		if (node.type === 'CallExpression') {
			const name = calleeName(node);
			if (name === metadata.componentHelper) {
				const fn = unwrapAssignedFunction(node.arguments?.[1]);
				if (fn !== null) {
					const componentName = fn.id?.name || ownerName;
					const transformedFn = transformFunction(fn, componentName, takeComponent(componentName));
					if (transformedFn !== fn) node.arguments[1] = transformedFn;
				}
				for (let index = 0; index < (node.arguments?.length || 0); index++) {
					if (index !== 1) scan(node.arguments[index], ownerName);
				}
				return;
			}
			const regions = metadata.regionHelpers || {};
			let thunkIndexes = null;
			if (name === regions.children) thunkIndexes = [1];
			else if (name === regions.if) thunkIndexes = [1, 2];
			else if (name === regions.switch) thunkIndexes = [1, 2];
			else if (name === regions.for) thunkIndexes = [2, 3];
			else if (name === regions.try) thunkIndexes = [0, 1, 2];
			if (thunkIndexes !== null) {
				for (const index of thunkIndexes) transformThunkValue(node.arguments?.[index], ownerName);
				for (let index = 0; index < (node.arguments?.length || 0); index++) {
					if (!thunkIndexes.includes(index)) scan(node.arguments[index], ownerName);
				}
				return;
			}
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
			scan(child, ownerName);
		}
	}

	try {
		for (const node of ast.body || []) scan(node);
	} finally {
		ctx._parallelUseAliases = previousUseAliases;
		ctx._universalRuntimeUnit = previousUniversalUnit;
	}
}

// ===========================================================================
// Parallel use() — docs/suspense-parallel-use-plan.md
// ===========================================================================

// The parallel-`use()` pipeline. Three cooperating
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
//     every non-param local become an empty-batch warm registration, and the
//     component gets a compiled `Comp.__warm` fetch plan
//     (its own warm-safe creations + guarded child warm calls) so warming
//     recurses down the tree — the whole descendant fetch tree starts in the
//     first attempt.
//
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

// ESTree represents RegExp syntax as a Literal too, but evaluating `/x/`
// creates a new object every render. Only primitive literal values are safe to
// use in a component-lifetime identity proof.
function isInvariantLiteral(node) {
	if (!node || node.type !== 'Literal' || node.regex != null) return false;
	return (
		node.value === null || (typeof node.value !== 'object' && typeof node.value !== 'function')
	);
}

// A value that can safely be installed once at mount: only identifiers proven
// to have component-lifetime identity. Literals are normally baked into the
// template before this point, but accepting them makes event-bundle argument
// analysis complete.
function isInvariantBindingExpr(node, ctx) {
	// HMR deliberately re-evaluates component bodies against retained scopes;
	// keep event slots live there so edited callback bodies can replace the
	// previously-installed function even when their dependencies stay stable.
	if (ctx.hmr) return false;
	const value = unwrapTsExpr(node);
	return (
		isInvariantLiteral(value) ||
		(value && value.type === 'Identifier' && ctx.currentInvariantLocals?.has(value.name) === true)
	);
}

// Native event slots may retain a useEffectEvent wrapper even though its
// per-render return identity is fresh: every wrapper dispatches through the
// hook cell's latest committed body. This proof must never feed general JSX
// props, memo bailouts, callback inference, or event-bundle arguments.
function isEventHandlerInvariantExpr(node, ctx) {
	if (ctx.hmr) return false;
	const value = unwrapTsExpr(node);
	return (
		isInvariantLiteral(value) ||
		(value &&
			value.type === 'Identifier' &&
			ctx.currentEventInvariantLocals?.has(value.name) === true)
	);
}

// Object/array/function literals allocate a new identity on every evaluation,
// so an identity diff can never skip their update. This currently feeds the
// class binding path, where dropping the dead previous-value field preserves
// the exact setter frequency while shrinking both code and the binding bag.
function isFreshBindingExpr(node) {
	const value = unwrapTsExpr(node);
	return (
		value?.type === 'ObjectExpression' ||
		value?.type === 'ArrayExpression' ||
		value?.type === 'ArrowFunctionExpression' ||
		value?.type === 'FunctionExpression'
	);
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
function useCallOfStatement(stmt, ctx) {
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
		(call.callee.name === 'use' || ctx?._parallelUseAliases?.has(call.callee.name)) &&
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
		const call = useCallOfStatement(stmt, ctx);
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
		const symVar = allocHookSymbol(
			ctx,
			`${componentName}.use.memo#${ctx.nextHookSymId}`,
			{
				componentName,
				name: 'use() memo',
				kind: 'useMemo',
				node: call,
			},
			// Warm caches span component scopes. A scope-local numeric slot can
			// therefore alias an adjacent component's equally-numbered use() memo
			// when a parent warms both children into one cache. Reserve a globally
			// composable Symbol for every warmable creation site.
			true,
		);
		const deps = collectDepPaths(arg);
		// Server mirror: `puMemo` — keyed CROSS-PASS creation cache (a fresh
		// SSRScope per pass makes client useMemo semantics useless there).
		const memoHelper = ctx.mode === 'server' ? 'puMemo' : 'useMemo';
		const memoAlias = requireRuntimeForContext(ctx, memoHelper);
		creations.push({ symVar, expr: arg, deps, guards: [...guards], locals });
		const memoCall = {
			type: 'CallExpression',
			callee: { type: 'Identifier', name: memoAlias },
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

function containsReturnOutsideNestedFunction(node, root = true) {
	if (!node || typeof node !== 'object') return false;
	if (Array.isArray(node))
		return node.some((child) => containsReturnOutsideNestedFunction(child, false));
	if (!root && isFunctionNode(node)) return false;
	if (node.type === 'ReturnStatement') return true;
	for (const key in node) {
		if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
		if (containsReturnOutsideNestedFunction(node[key], false)) return true;
	}
	return false;
}

// A warm plan must describe the subtree that this invocation actually reaches.
// Until warm artifacts carry branch guards for arbitrary setup returns, decline
// to publish a plan for multi-exit bodies rather than speculating the final
// template while an earlier return rendered a different tree.
function hasSetupEarlyReturn(node) {
	const body = node.body;
	if (!body) return false;
	if (body.type === 'JSXCodeBlock') {
		return (body.body || []).some((statement) => containsReturnOutsideNestedFunction(statement));
	}
	if (body.type !== 'BlockStatement') return false;
	const statements = body.body || [];
	for (let index = 0; index < statements.length; index++) {
		const statement = statements[index];
		if (index === statements.length - 1 && statement.type === 'ReturnStatement') continue;
		if (containsReturnOutsideNestedFunction(statement)) return true;
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
	const output = transformList(statements);
	if (warmThunk) {
		// Register the child-only plan after setup executes. A pending batch in
		// any descendant activates the plans on its active ancestor stack and
		// anchors their shared cache above adjacent siblings. Keeping this after
		// setup preserves early-return reachability: an alternate returned tree must
		// not activate the final template's plan. The first direct batch receives the
		// same thunk below so it can still warm before setup reaches this registration.
		const batchHelper = ctx.mode === 'server' ? 'puBatch' : 'useBatch';
		const batchAlias = requireRuntimeForContext(ctx, batchHelper);
		const registration = {
			type: 'ExpressionStatement',
			expression: {
				type: 'CallExpression',
				callee: { type: 'Identifier', name: batchAlias },
				arguments: [{ type: 'ArrayExpression', elements: [] }, warmThunk],
				optional: false,
			},
		};
		const finalIndex =
			output.length > 0 && output[output.length - 1].type === 'ReturnStatement'
				? output.length - 1
				: output.length;
		output.splice(finalIndex, 0, registration);
	}
	return output;

	function transformList(stmts) {
		const out = [];
		let run = null; // { members: [{stmt, call?, creation?}], names: Set }
		const flush = () => {
			if (!run) return;
			emitRun(run, out);
			run = null;
		};
		for (const stmt of stmts) {
			const call = stmt && typeof stmt === 'object' ? useCallOfStatement(stmt, ctx) : null;
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
		const batchAlias = requireRuntimeForContext(ctx, batchHelper);
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
				callee: { type: 'Identifier', name: batchAlias },
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

// Build the warm thunk AST (child calls registered after reachable setup, and
// also attached to the first direct batch) + the `Comp.__warm` source
// (creations + child calls) for a top-level body.
function buildWarmArtifacts(node, ctx, componentName, creations, warmChildren) {
	if (hasSetupEarlyReturn(node)) return { thunk: null, warmSrc: null };
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
	// A component whose only warm edge is recursion back to itself and which has
	// no creation of its own can never discover async work through that plan: each
	// recursive instance has the same empty creation set. Omitting the no-op plan
	// also keeps very deep synchronous recursive trees on their established stack
	// footprint instead of adding one empty-batch registration per level.
	if (
		warmMemos.length === 0 &&
		warmKids.length > 0 &&
		warmKids.every((child) => child.compName === componentName)
	) {
		return { thunk: null, warmSrc: null };
	}

	const stmtFor = (guards, callExpr) => {
		const g = andChain(guards);
		const call = { type: 'ExpressionStatement', expression: callExpr };
		return g ? { type: 'IfStatement', test: g, consequent: call, alternate: null } : call;
	};
	const warmMemoAlias = runtimeAliasForContext(ctx, 'warmMemo');
	const warmChildAlias = runtimeAliasForContext(ctx, 'warmChild');
	const memoCall = (c) => ({
		type: 'CallExpression',
		callee: { type: 'Identifier', name: warmMemoAlias },
		arguments: [
			{ type: 'ArrowFunctionExpression', params: [], expression: true, async: false, body: c.expr },
			{ type: 'ArrayExpression', elements: c.deps },
			{ type: 'Identifier', name: c.symVar },
		],
		optional: false,
	});
	const childCall = (w) => ({
		type: 'CallExpression',
		callee: { type: 'Identifier', name: warmChildAlias },
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

	if (warmMemos.length > 0) requireRuntimeForContext(ctx, 'warmMemo');
	if (warmKids.length > 0) requireRuntimeForContext(ctx, 'warmChild');

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
function slotKeyedHookName(n, ctx) {
	if (n.type !== 'CallExpression') return null;
	if (n.callee.type === 'Identifier') {
		const local = n.callee.name;
		const imported = n._octaneImportedHook;
		// A name bound by a non-octane import is that library's hook, never the
		// builtin — it still slot-keys through the custom `use[A-Z]` branch below.
		const shadowsImport =
			(ctx.octaneImportLocals?.has(local) && imported === undefined) ||
			ctx.foreignImportLocals?.has(local) === true;
		if (imported !== undefined && HOOK_NAMES.has(imported)) return imported;
		if (!shadowsImport && HOOK_NAMES.has(local)) return local;
		if (/^use[A-Z]/.test(local) && local !== 'useContext') return local;
		return null;
	}
	if (n._octaneImportedHook !== undefined && HOOK_NAMES.has(n._octaneImportedHook)) {
		return n._octaneImportedHook;
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
		const hook = slotKeyedHookName(n, ctx);
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

// Production base-hook slots are small numbers. A numeric slot cannot occupy
// an omitted USER argument position because hooks such as useState(0) and
// useReducer(reducer, 0) legitimately accept numbers there. Pad those optional
// positions with `undefined` before appending the compiler-owned slot. Rest-
// shaped hooks (useDeferredValue/useSyncExternalStore) count from the end and
// therefore need no padding.
const NUMERIC_HOOK_SLOT_POSITION = {
	useState: 1,
	useReducer: 3,
	useEffect: 2,
	useLayoutEffect: 2,
	useInsertionEffect: 2,
	useMemo: 2,
	useCallback: 2,
	useRef: 1,
	useEffectEvent: 1,
	useImperativeHandle: 3,
	useActionState: 3,
	useOptimistic: 2,
};

function appendHookSlotArgument(name, args, slot, numeric) {
	const out = [...args];
	const position = numeric ? NUMERIC_HOOK_SLOT_POSITION[name] : undefined;
	if (position !== undefined) {
		while (out.length < position) out.push({ type: 'Identifier', name: 'undefined' });
	}
	out.push(typeof slot === 'string' ? { type: 'Identifier', name: slot } : slot);
	return out;
}

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
// calls that can observe it so rewriteHookCalls can select the getter-enabled
// helper; the public base hooks remain the allocation-free two-item path.
// Escaping or ambiguous tuples conservatively receive the full shape.
function stateTupleHookName(call, ctx) {
	const callee = call?.callee;
	const imported = call?._octaneImportedHook;
	if (imported !== undefined) return STATE_GETTER_HELPERS[imported] ? imported : null;
	if (callee?.type === 'Identifier') {
		// Preserve the historical auto-import shorthand for an unbound bare base
		// hook, but never mistake a lexically shadowed import alias — octane or
		// foreign — for that hook.
		if (ctx.octaneImportLocals?.has(callee.name)) return null;
		if (ctx.foreignImportLocals?.has(callee.name)) return null;
		return STATE_GETTER_HELPERS[callee.name] ? callee.name : null;
	}
	return null;
}

function markStateGetterUsage(root, ctx) {
	const ancestors = [];
	function walk(node) {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (node.type === 'CallExpression' && stateTupleHookName(node, ctx) !== null) {
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

// A compiled `@{}` render body always executes inside a runtime-owned Scope, so
// its direct base-hook sites can use tiny module-local numbers. Do not extend
// that proof through an arbitrary nested function: render props, callbacks and
// helpers can execute in a caller's Scope, including alongside code from a
// different module. Those sites retain globally unique, runtime-ranged Symbols.
function markHookSlotLocality(root, enabled) {
	const walk = (node, functionDepth) => {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child, functionDepth);
			return;
		}
		if (node.type === 'CallExpression') {
			Object.defineProperty(node, '_octaneLocalHookSlot', {
				value: enabled && functionDepth === 0,
				configurable: true,
			});
		}
		const nestedDepth =
			functionDepth +
			(node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
				? 1
				: 0);
		for (const key in node) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(node[key], nestedDepth);
		}
	};
	walk(root, 0);
}

function rewriteHookCalls(node, ctx, componentName, localRoot = false) {
	markStateGetterUsage(node, ctx);
	markHookSlotLocality(node, localRoot);
	return mapAst(node, (n) => {
		// First-class subtemplates have their own compileFunctionBody pass. Leave
		// their contents untouched here so hook sites are slotted exactly once and
		// conservatively retain the globally composable helper ABI.
		if (
			n.type === 'Tsrx' ||
			n.type === 'Tsx' ||
			(n.type === 'ArrowFunctionExpression' && n.body?.type === 'JSXCodeBlock')
		) {
			return n;
		}
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
			const localName = n.callee.name;
			const generated = n.callee._octaneGenerated === true;
			const annotatedOwner = ctx.profile ? n._octaneProfileOwner : null;
			const profileOwner = annotatedOwner?.name || componentName;
			const importedName = n._octaneImportedHook;
			// A non-octane import binding also shadows the builtin spelling: the call
			// is that library's custom hook (slotted + withSlot-wrapped below), and
			// claiming it as builtin would inject a colliding octane runtime import.
			const shadowsImport =
				!generated &&
				((ctx.octaneImportLocals?.has(localName) && importedName === undefined) ||
					ctx.foreignImportLocals?.has(localName) === true);
			const name = importedName ?? localName;
			// Three kinds of call get a trailing per-call-site hook slot:
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
			const isBuiltin = (generated || !shadowsImport) && HOOK_NAMES.has(name);
			const isCustom =
				!generated &&
				importedName === undefined &&
				/^use[A-Z]/.test(localName) &&
				localName !== 'useContext';
			const isServerUse = name === 'use' && ctx.mode === 'server';
			if (isBuiltin || isCustom || isServerUse) {
				// Keep a Symbol at custom-hook call boundaries: published bindings split
				// that trailing value from optional user args and derive manual sub-slots
				// from it. Proven render-scope base hooks can use the smaller numeric
				// production ABI; arbitrary callable helpers cannot.
				const hasSpread = n.arguments.some((arg) => arg.type === 'SpreadElement');
				const numericSlot =
					!ctx.hmr &&
					!ctx.profile &&
					n._octaneLocalHookSlot === true &&
					!hasSpread &&
					(isBuiltin || isServerUse);
				const forceSymbol = !numericSlot;
				const getterHelper = n._octaneStateGetter ? STATE_GETTER_HELPERS[name] : null;
				// A builtin hook call site is USER code (the user's own identifier), so
				// its import stays bare — EXCEPT compiler-inserted calls (auto-callback's
				// `useCallback`), whose callee is renamed to the `_$` alias below so a
				// user binding of the same name can't shadow it.
				if (isBuiltin) {
					if (n.callee._octaneGenerated) requireRuntimeForContext(ctx, name);
					else ctx.userRuntimeNames.add(localName === name ? name : `${name} as ${localName}`);
					if (getterHelper !== null) requireRuntimeForContext(ctx, getterHelper);
				}
				if (isServerUse)
					ctx.userRuntimeNames.add(localName === name ? 'use' : `use as ${localName}`);
				let symVar = null;
				let slot;
				if (numericSlot) {
					const id = ctx.nextHookSymId++;
					slot = { type: 'Literal', value: id, raw: String(id) };
				} else {
					const debug = isServerUse
						? `${profileOwner}.use#${ctx.nextHookSymId}`
						: `${profileOwner}.${name}#${ctx.nextHookSymId}`;
					symVar = allocHookSymbol(
						ctx,
						debug,
						{
							componentName: profileOwner,
							componentId: annotatedOwner?.id,
							name: localName,
							kind: isServerUse ? 'use' : name,
							node: n,
						},
						forceSymbol,
					);
					slot = symVar;
				}
				// mapAst does NOT recurse into a node we replace, so rewrite this call's
				// ARGUMENTS ourselves — that's what gives a hook NESTED as an argument
				// its own slot, e.g. `useStore(api, useShallow(sel))` or a hook in a deps
				// array. (Allocating the outer slot first keeps its id stable; nested
				// inner hooks just take the following ids.)
				const args = n.arguments.map((a) => rewriteHookCalls(a, ctx, componentName, localRoot));
				// NB: base hooks are ALSO `use[A-Z]`, so the wrap is for custom hooks ONLY
				// (`isCustom && !isBuiltin`) — base hooks keep the plain trailing-slot form.
				if (isCustom && !isBuiltin) {
					// A CUSTOM hook is wrapped in `withSlot(sym, hook, ...args, sym)`: the
					// withSlot pushes a call-site symbol on the path stack so the hook's
					// inner BASE hooks combine it (→ the same custom hook reused at two
					// sites keeps independent state — base hooks are "owned by octane" and
					// need no wrapper). The TRAILING `sym` is retained so existing library
					// bindings that extract the slot from their last argument keep working.
					const withSlotAlias = requireRuntimeForContext(ctx, 'withSlot');
					return {
						type: 'CallExpression',
						callee: { type: 'Identifier', name: withSlotAlias },
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
							? { type: 'Identifier', name: runtimeAliasForContext(ctx, getterHelper) }
							: n.callee._octaneGenerated
								? { type: 'Identifier', name: runtimeAliasForContext(ctx, name) }
								: n.callee,
					arguments: appendHookSlotArgument(name, args, slot, numericSlot),
				};
			}
		}
		// Namespace-imported Octane hooks keep their member call intact while
		// receiving the same trailing slot as named imports. This is deliberately
		// separate from object-carried custom hooks below: `Octane.useState` is a
		// base hook and must not be wrapped through withSlot.
		if (
			n.type === 'CallExpression' &&
			!n.optional &&
			n.callee.type === 'MemberExpression' &&
			!n.callee.computed &&
			n.callee.object.type === 'Identifier' &&
			n.callee.property.type === 'Identifier' &&
			n._octaneImportedHook !== undefined
		) {
			const name = n._octaneImportedHook;
			const isBuiltin = HOOK_NAMES.has(name);
			const isServerUse = name === 'use' && ctx.mode === 'server';
			if (isBuiltin || isServerUse) {
				const annotatedOwner = ctx.profile ? n._octaneProfileOwner : null;
				const profileOwner = annotatedOwner?.name || componentName;
				const getterHelper = n._octaneStateGetter ? STATE_GETTER_HELPERS[name] : null;
				if (getterHelper !== null) requireRuntimeForContext(ctx, getterHelper);
				const numericSlot =
					!ctx.hmr &&
					!ctx.profile &&
					n._octaneLocalHookSlot === true &&
					!n.arguments.some((arg) => arg.type === 'SpreadElement');
				let slot;
				if (numericSlot) {
					const id = ctx.nextHookSymId++;
					slot = { type: 'Literal', value: id, raw: String(id) };
				} else {
					slot = allocHookSymbol(
						ctx,
						`${profileOwner}.${name}#${ctx.nextHookSymId}`,
						{
							componentName: profileOwner,
							componentId: annotatedOwner?.id,
							name: `${n.callee.object.name}.${n.callee.property.name}`,
							kind: name,
							node: n,
						},
						true,
					);
				}
				const args = n.arguments.map((a) => rewriteHookCalls(a, ctx, componentName, localRoot));
				return {
					...n,
					callee:
						getterHelper !== null
							? { type: 'Identifier', name: runtimeAliasForContext(ctx, getterHelper) }
							: n.callee,
					arguments: appendHookSlotArgument(name, args, slot, numericSlot),
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
			const annotatedOwner = ctx.profile ? n._octaneProfileOwner : null;
			const profileOwner = annotatedOwner?.name || componentName;
			const debug = `${profileOwner}.${n.callee.property.name}#${ctx.nextHookSymId}`;
			const symVar = allocHookSymbol(
				ctx,
				debug,
				{
					componentName: profileOwner,
					componentId: annotatedOwner?.id,
					name: n.callee.property.name,
					kind: n.callee.property.name,
					node: n,
				},
				true,
			);
			const withSlotAlias = requireRuntimeForContext(ctx, 'withSlot');
			const object = rewriteHookCalls(n.callee.object, ctx, componentName, localRoot);
			const args = n.arguments.map((a) => rewriteHookCalls(a, ctx, componentName, localRoot));
			return {
				type: 'CallExpression',
				callee: { type: 'Identifier', name: withSlotAlias },
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
	recordProfileComponent(ctx, node, name);
	const cssHash = applyCssScoping(node, ctx);
	// A folded directive's branch helper functions (`__then$N`/`__else$N`) are
	// collected here so they're emitted INSIDE this component function — preserving
	// their closure over setup locals/props — and only their values + the control
	// expression are threaded into the renderer as `props.hN` holes.
	const compInlinedSubs = [];
	const newStatements = (node.body.body || []).map((s) => {
		// Same hook handling as the `@{}` path: base hooks take a trailing hook slot,
		// custom hooks are wrapped in withSlot (unified across both component forms).
		const h = rewriteHookCalls(s, ctx, name);
		// The `return <jsx>` output → a compiled-fragment descriptor (reconcile path),
		// not the host-string de-opt (rebuild). Other JSX in setup keeps value-lowering.
		if (h.type === 'ReturnStatement' && h.argument && isJsxNode(h.argument)) {
			return { ...h, argument: lowerReturnJsx(h.argument, ctx, compInlinedSubs, cssHash) };
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
		// in right after the FUNCTION BODY's opening `{` so they're in the component
		// scope. The first `{` is not necessarily the body: a destructured parameter
		// (or an object/function default inside one) can contain braces first. Printing
		// the body alone gives us the exact suffix boundary emitted by esrap without
		// having to parse the generated function text again.
		const printedBody = printNode(fn.body);
		const i = code.length - printedBody.length;
		if (i < 0 || code.slice(i) !== printedBody) {
			throw new Error(`Unable to locate the generated body for component \`${name}\`.`);
		}
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
		options && options.export && !options.hmrWrap
			? [
					{ fnRelLine: 0, colShift: 'export '.length, mappings: mappings.slice(0, 1) },
					{ fnRelLine: 1, colShift: 0, mappings: mappings.slice(1) },
				]
			: [{ fnRelLine: 0, colShift: 0, mappings }];
	if (options && options.hmrWrap) {
		code += `\n${name} = _$hmr(${name});`;
		if (options.default) {
			return options.hmrMutable
				? `${code}\nexport { ${name} as default };`
				: `${code}\nexport default ${name};`;
		}
		if (options.export) return `${code}\nexport { ${name} };`;
	}
	if (options && options.default) return `${code}\nexport default ${name};`;
	if (options && options.export) return `export ${code}`;
	return code;
}

function hasJsxAttribute(node, name) {
	return (node.attributes || node.openingElement?.attributes || []).some(
		(attr) =>
			(attr.type === 'Attribute' || attr.type === 'JSXAttribute') && jsxAttrRawName(attr) === name,
	);
}

// Activity is always compiler-owned template syntax. Long-form Fragment only
// needs template routing when it carries a ref (marker-pair expansion) or owns a
// descendant that itself needs normalization. An ordinary/no-ref/keyed Fragment
// remains a runtime descriptor so its explicit reconciliation boundary survives.
function isLongFormTemplateSentinel(node, parentNs = 'html', allowHeadHoists = true) {
	if (isActivityLongForm(node)) return true;
	if (!isFragmentLongForm(node)) return false;
	if (hasJsxAttribute(node, 'ref')) return true;
	return (node.children || []).some((child) =>
		requiresTemplateNormalization(child, parentNs, allowHeadHoists),
	);
}

// Value-position JSX lowering can represent hosts, components, ordinary
// Fragments, and expressions, but it cannot represent syntax consumed only by
// normalizeChildren. Detect those constructs recursively so a React-style
// `return <...>` subtree stays in the template compiler instead of silently
// dropping or misinterpreting them. Namespace tracking keeps SVG <title> in the
// SVG tree; only HTML metadata is a document-head hoist.
//
// JSXStyleElement is intentionally absent. Returned scoped style needs the
// component-level CSS scoping/hash pipeline, not merely template routing.
function requiresTemplateNormalization(node, parentNs = 'html', allowHeadHoists = true) {
	if (!node) return false;
	const t = node.type;
	if (
		t === 'IfStatement' ||
		t === 'JSXIfExpression' ||
		t === 'ForOfStatement' ||
		t === 'JSXForExpression' ||
		t === 'SwitchStatement' ||
		t === 'JSXSwitchExpression' ||
		t === 'TryStatement' ||
		t === 'JSXTryExpression' ||
		t === 'ActivityStatement' ||
		t === 'FragmentStart' ||
		t === 'FragmentEnd' ||
		t === 'FoldedDirective' ||
		t === 'HeadHoist' ||
		t === 'JSXCodeBlock'
	) {
		return true;
	}
	if (t === 'Fragment' || t === 'JSXFragment' || t === 'Tsx' || t === 'Tsrx') {
		return (node.children || []).some((child) =>
			requiresTemplateNormalization(child, parentNs, allowHeadHoists),
		);
	}
	if (t !== 'Element' && t !== 'JSXElement') return false;
	if (isLongFormTemplateSentinel(node, parentNs, allowHeadHoists)) return true;

	const tag = jsxTagName(node) || elementTagName(node);
	const selfNs = typeof tag === 'string' ? nsForSelf(tag, parentNs) : parentNs;
	if (tag === 'head') return true;
	// meta/link are document resources in every namespace. Only title is
	// ambiguous across an opaque component boundary (HTML document title vs SVG
	// accessibility title), so suppressing the recursive title classification
	// must not accidentally suppress the other singleton kinds.
	if (selfNs !== 'svg' && HOISTABLE_HEAD_TAGS.has(tag) && (tag !== 'title' || allowHeadHoists))
		return true;

	const childNs =
		typeof tag === 'string' && !isComponentTag(node) ? nsForChildren(tag, parentNs) : parentNs;
	// A normal component is an opaque namespace boundary: its children may be
	// placed under HTML, SVG, or MathML by the component implementation. Keep
	// detecting compiler-only syntax there, but do not classify a child <title>
	// as document metadata from the caller's lexical HTML context. Descriptor
	// reconciliation can then use the actual host namespace chosen at runtime.
	const childAllowsHeadHoists =
		allowHeadHoists &&
		(!isComponentTag(node) || isActivityLongForm(node) || isFragmentLongForm(node));
	return (node.children || []).some((child) =>
		requiresTemplateNormalization(child, childNs, childAllowsHeadHoists),
	);
}

// Lower JSX at return position. Host roots always use the compiled-fragment
// path. Any other root whose subtree contains template-only syntax uses it too.
// Ordinary component/Fragment values retain descriptor lowering and its identity
// or key boundary.
function lowerReturnJsx(node, ctx, compInlinedSubs, cssHash = null) {
	// A component's returned host root can land in a namespace the definition
	// cannot see, so its template resolves at clone time. Title placement keeps
	// the existing returned-JSX head contract; titles crossing a nested component
	// boundary are rewritten by rewriteOpaqueTitles itself.
	const rewritten = rewriteOpaqueTitles(node, ctx, 'html');
	if (
		(rewritten.type === 'Element' || rewritten.type === 'JSXElement') &&
		!isComponentTag(rewritten)
	) {
		return lowerHostFragment(rewritten, ctx, compInlinedSubs, 'opaque', cssHash);
	}
	if (requiresTemplateNormalization(rewritten)) {
		return lowerHostFragment(rewritten, ctx, compInlinedSubs, 'opaque', cssHash);
	}
	return rewriteJsxValues(rewritten, ctx);
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

// Walk a host element or JSX fragment, replacing each DYNAMIC part (an
// attribute/child expression) with `props.hN` and collecting
// `{ hN: <originalExpr> }` into `holeProps`. Static structure (tag, literal attrs,
// text, nested host elements/fragments) stays in the template; nested component
// children become renderable holes. The result is a self-contained fragment whose
// only inputs are its props — compilable as an ordinary renderer.
function extractFragment(node, ctx, holeProps, parentNs = 'html') {
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
	const nodeTag = jsxTagName(node) || elementTagName(node);
	const childNs =
		typeof nodeTag === 'string' && !isComponentTag(node)
			? nsForChildren(nodeTag, parentNs)
			: parentNs;
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
			if (isLongFormTemplateSentinel(child, childNs)) {
				newChildren.push(extractFragment(child, ctx, holeProps, childNs));
			} else if (
				isComponentTag(child) &&
				ctx._foldCtx?.templateComponentChildren === true &&
				requiresTemplateNormalization(child, childNs)
			) {
				// Component children normally become descriptor children at return-value
				// position. A directive cannot be represented by lowerJsxChild, though, so
				// keep this component in the extracted TEMPLATE and fold its children into
				// the component's children block. Thread the component expression itself as
				// a hole too, since it may be a local/member/dynamic tag that the hoisted
				// renderer cannot reference directly.
				newChildren.push(extractFragmentComponent(child, ctx, holeProps, childNs));
			} else if (isComponentTag(child)) {
				const hn = `h${holeProps.length}`;
				holeProps.push(objectProp(hn, jsxElementToCreateElement(child, ctx)));
				newChildren.push({ type: 'JSXExpressionContainer', expression: memberProps(hn, child) });
			} else {
				newChildren.push(extractFragment(child, ctx, holeProps, childNs));
			}
		} else if (t === 'Fragment' || t === 'JSXFragment') {
			// A fragment nested inside the returned fragment shares the hoisted
			// renderer. Extract its dynamic values/directives too; leaving it raw would
			// make authored outer locals resolve against the renderer's hole-props object.
			newChildren.push(extractFragment(child, ctx, holeProps, childNs));
		} else if (t === 'JSXCodeBlock' && (child.body || []).length === 0 && child.render) {
			// A render-only child block is transparent template grouping. Extract its
			// render root too so expressions still evaluate in the outer component and
			// arrive as ordered hole props in the hoisted renderer.
			newChildren.push({
				...child,
				render: extractFragmentRoot(child.render, ctx, holeProps, childNs),
			});
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

function extractFragmentComponent(node, ctx, holeProps, parentNs = 'html') {
	const sourceName = node.openingElement?.name || node.id;
	const componentHole = `h${holeProps.length}`;
	// JSX evaluates the component tag before its attributes and children. Reserve
	// and append that hole first so a member getter or dynamic tag expression keeps
	// the authored order even though the component remains in the hoisted template.
	holeProps.push(objectProp(componentHole, rewriteJsxValues(jsxNameToExpr(sourceName), ctx)));
	const extracted = extractFragment(node, ctx, holeProps, parentNs);
	const dynamicName = {
		type: 'JSXExpressionContainer',
		expression: memberProps(componentHole, sourceName),
		isDynamic: true,
	};
	const out = { ...extracted, id: dynamicName };
	if (extracted.openingElement) {
		out.openingElement = { ...extracted.openingElement, name: dynamicName };
	}
	if (extracted.closingElement) {
		out.closingElement = { ...extracted.closingElement, name: dynamicName };
	}
	return out;
}

function extractFragmentRoot(node, ctx, holeProps, parentNs = 'html') {
	if (
		(node.type === 'Element' || node.type === 'JSXElement') &&
		isComponentTag(node) &&
		!isActivityLongForm(node) &&
		!isFragmentLongForm(node)
	) {
		return extractFragmentComponent(node, ctx, holeProps, parentNs);
	}
	return extractFragment(node, ctx, holeProps, parentNs);
}

// A host JSX element or directive-bearing JSX fragment → a hoisted compiled
// renderer + `createElement(_frag$N, {...})`.
// `compInlinedSubs` is the COMPONENT's inlinedSubs: a folded directive's branch
// helper functions are emitted there (closure preserved), not in the renderer.
function lowerHostFragment(node, ctx, compInlinedSubs, parentNs = 'html', cssHash = null) {
	const holeProps = [];
	const directiveCalls = { ifCalls: [], forCalls: [], switchCalls: [], tryCalls: [] };
	// extractFragment reads `ctx._foldCtx` for any directive child it folds (and to
	// route helper defs into the component). Save/restore so it never leaks.
	const prevFold = ctx._foldCtx;
	const templateComponentChildren = requiresTemplateNormalization(node, parentNs);
	ctx._foldCtx =
		compInlinedSubs !== undefined
			? {
					compInlinedSubs,
					directiveCalls,
					parentNs,
					cssHash,
					templateComponentChildren,
				}
			: null;
	const rendererEl = extractFragmentRoot(node, ctx, holeProps, parentNs);
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
	if ((node.type === 'Element' || node.type === 'JSXElement') && !isComponentTag(node)) {
		// A host fragment is a SINGLE root element, so it can mount markerless (the
		// element self-delimits) — matching `@{}`'s inline render exactly (no extra
		// comment markers), which is required for byte-equal DOM when folding `@{}`.
		// A returned JSX fragment may have multiple roots and must retain its range.
		ctx.hoistedHelpers.push(`${fragName}.$$singleRoot = true;`);
	}
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
	if (!isComponentTag(node)) {
		rejectVoidElementContent(compNode.value, node, ctx);
		rejectDangerouslySetInnerHTMLChildren(compNode.value, node, ctx);
	}
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
	const opaqueChildren = isComponentTag(node);
	for (const child of node.children || []) {
		const lowered = lowerJsxChild(
			opaqueChildren ? rewriteOpaqueTitles(child, ctx, 'opaque') : child,
			ctx,
		);
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

const HOOK_SLOT_BASE_HELPER = '/*__OCTANE_HOOK_SLOT_BASE__*/';

function ensureHookSlotBase(ctx) {
	const unit = ctx._universalRuntimeUnit;
	if (unit !== undefined) {
		ctx._universalHookSlotBases ??= new Map();
		const existing = ctx._universalHookSlotBases.get(unit);
		if (existing !== undefined) return existing;
		const base = Object.freeze({
			baseName: allocCompilerName(ctx, '_hs$'),
			helperName: requireRuntimeForContext(ctx, 'hookSlots'),
		});
		ctx._universalHookSlotBases.set(unit, base);
		ctx.hoistedHelpers.push({ ...base, kind: 'hookSlotBase' });
		return base;
	}
	if (ctx._hookSlotBase) {
		return { baseName: ctx._hookSlotBaseName, helperName: ctx._hookSlotsHelperName };
	}
	ctx._hookSlotBase = true;
	ctx._hookSlotBaseName = allocCompilerName(ctx, '_hs$');
	ctx._hookSlotsHelperName = allocCompilerName(ctx, '_$hookSlots');
	ctx.runtimeNeeded.add('hookSlots');
	// This marker is always pushed before the first eager per-site declaration.
	// joinHoistedHelpers fills in the final site count once the whole module has
	// been compiled, avoiding fixed-size ranges and cross-module collisions.
	ctx.hoistedHelpers.push(HOOK_SLOT_BASE_HELPER);
	return { baseName: ctx._hookSlotBaseName, helperName: ctx._hookSlotsHelperName };
}

function joinHoistedHelpers(ctx) {
	return ctx.hoistedHelpers
		.map((helper) => {
			if (helper === HOOK_SLOT_BASE_HELPER) {
				return `const ${ctx._hookSlotBaseName} = /* @__PURE__ */ ${ctx._hookSlotsHelperName}(${ctx.nextHookSymId});`;
			}
			if (helper?.kind === 'hookSlotBase') {
				return `const ${helper.baseName} = /* @__PURE__ */ ${helper.helperName}(${ctx.nextHookSymId});`;
			}
			return helper;
		})
		.join('\n');
}

function allocHookSymbol(ctx, debugName, profile = null, forceSymbol = false) {
	const id = ctx.nextHookSymId++;
	const name = allocCompilerName(ctx, `_h$${id}`);
	let symbolExpr;
	if (ctx.hmr) {
		// HMR (dev serve): Symbol.for(stableKey) so re-imports produce the SAME
		// Symbol identity, which keeps the existing hooks Map keys valid across
		// body swaps. The stable key embeds the source filename so symbols don't
		// collide across modules. `debugName` includes the component name + hook
		// name + call-site index — stable provided the user doesn't reorder hooks
		// between renders (which would violate React's rules anyway).
		const stableKey = `octane:${ctx.filename || '<anon>'}:${debugName}`;
		symbolExpr = `Symbol.for(${JSON.stringify(stableKey)})`;
	} else if (ctx.profile) {
		// No HMR (prod builds, SSR, tests): nothing re-imports the module
		// expecting registry identity. Profiling still needs a Symbol metadata key,
		// and custom-hook boundaries retain the trailing-Symbol ABI consumed by
		// published bindings. Both use the short, path-free description.
		if (ctx._hookHash === undefined) ctx._hookHash = hookSlotHash(ctx.filename);
		symbolExpr = `Symbol(${JSON.stringify(`${ctx._hookHash}#${id}`)})`;
	} else {
		// Direct sites in a compiler-created render Scope only need a tiny local
		// integer. Arbitrary callable helpers and custom-hook boundaries can share a
		// caller's Scope with other modules, so reserve a runtime-global range and
		// keep a Symbol description that resolveSlot can safely compose.
		if (forceSymbol) {
			const { baseName } = ensureHookSlotBase(ctx);
			const numericExpr = id === 0 ? baseName : `${baseName} + ${id}`;
			symbolExpr = `Symbol(${numericExpr})`;
		} else {
			symbolExpr = String(id);
		}
	}
	if (ctx.profile) {
		ctx.profileRuntimeNeeded.add('__profileHook');
		const componentName = profile?.componentName || 'module';
		const componentId =
			profile?.componentId ||
			ctx.currentProfileComponentId ||
			profileComponentId(ctx, componentName, profile?.node);
		const loc = profileSourceLoc(profile?.node);
		const metadata = {
			id: `${componentId}#hook:${id}`,
			componentId,
			name: profile?.name || profile?.kind || 'hook',
			kind: profile?.kind || profile?.name || 'hook',
			file: ctx.profileFilename || '<anon>',
			line: loc.line,
			column: loc.column,
			index: id,
		};
		symbolExpr = `_$__profileHook(${symbolExpr}, ${JSON.stringify(metadata)})`;
	}
	ctx.hoistedHelpers.push(`const ${name} = ${symbolExpr};`);
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

// Shared title-text expression for ordinary head hoists and namespace-deferred
// titles. Keeping one AST expression means every child/spread expression is
// evaluated exactly once, whichever destination the runtime ultimately chooses.
function headTextExpression(el) {
	const parts = [];
	for (const c of el.children || []) {
		if (c.type === 'JSXText') {
			// JSX whitespace rules: indentation newlines collapse, while an authored
			// same-line space remains significant.
			const normalized = c.value
				.replace(/[ \t]*\r?\n[ \t\r\n]*/g, '\n')
				.replace(/^\n+/, '')
				.replace(/\n+$/, '')
				.replace(/\n+/g, ' ');
			if (normalized !== '') parts.push({ type: 'Literal', value: normalized });
		} else if (c.type === 'JSXExpressionContainer') {
			if (c.expression && c.expression.type !== 'JSXEmptyExpression') parts.push(c.expression);
		} else if (c.type === 'Literal' || c.type === 'StringLiteral') {
			parts.push({ type: 'Literal', value: c.value });
		}
	}
	if (parts.length === 0) return { type: 'Literal', value: null };
	let expression = parts[0];
	for (let i = 1; i < parts.length; i++) {
		expression = {
			type: 'BinaryExpression',
			operator: '+',
			left: expression,
			right: parts[i],
		};
	}
	return expression;
}

// Build the raw attribute object used by namespaceHead. Explicit key is kept on
// the internal component descriptor (so normal keyed reconciliation owns it),
// not duplicated on the eventual DOM element. All other values, including a
// side-effectful spread, appear once in authored order and are shared by the
// HTML-head and foreign-content branches at runtime.
function deferredHeadAttrs(el) {
	const properties = [];
	for (const attr of el.openingElement.attributes || []) {
		if (attr.type === 'SpreadAttribute' || attr.type === 'JSXSpreadAttribute') {
			properties.push({ type: 'SpreadElement', argument: attr.argument });
			continue;
		}
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
		const attrName = attr.name.name || attr.name;
		if (attrName === 'key') continue;
		let value;
		if (attr.value == null) value = { type: 'Literal', value: true };
		else value = attr.value.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value;
		properties.push({
			type: 'Property',
			key: /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(attrName)
				? { type: 'Identifier', name: attrName }
				: { type: 'Literal', value: attrName },
			value,
			kind: 'init',
			method: false,
			shorthand: false,
			computed: false,
		});
	}
	return { type: 'ObjectExpression', properties };
}

// Replace a namespace-ambiguous <title> with an internal component. A normal
// component is transparent to the parser but opaque to the compiler: it can put
// props.children under HTML, SVG, or MathML. namespaceHead resolves that choice
// from its actual parent at render time while retaining ordinary component-block
// hydration and keyed ownership.
function deferredTitleElement(el, ctx) {
	ctx.runtimeNeeded.add('namespaceHeadElement');
	let authoredKey = null;
	for (const attr of el.openingElement.attributes || []) {
		if (
			(attr.type === 'Attribute' || attr.type === 'JSXAttribute') &&
			(attr.name.name || attr.name) === 'key'
		) {
			if (attr.value != null) {
				authoredKey =
					attr.value.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value;
			}
		}
	}
	const args = [
		{ type: 'Literal', value: headKey(el, 0) },
		{ type: 'Literal', value: 'title' },
		deferredHeadAttrs(el),
		headTextExpression(el),
	];
	if (authoredKey !== null) args.push(authoredKey);
	const expression = {
		type: 'CallExpression',
		callee: { type: 'Identifier', name: rtAlias('namespaceHeadElement') },
		arguments: args,
		optional: false,
		loc: el.openingElement.loc,
		start: el.openingElement.start,
		end: el.openingElement.end,
	};
	return {
		type: 'JSXExpressionContainer',
		expression,
		loc: el.loc,
		start: el.start,
		end: el.end,
	};
}

function opaqueHostChildNamespace(tag, namespace) {
	if (namespace !== 'opaque') return nsForChildren(tag, namespace);
	if (tag === 'svg' || SVG_ONLY_TAGS.has(tag)) return tag === 'foreignObject' ? 'html' : 'svg';
	if (tag === 'math') return 'mathml';
	return 'opaque';
}

// Recursively mark titles whose destination crosses an ordinary component
// boundary. Directive arms are rewritten before they become independent helper
// bodies, so their control-flow subs keep the normal reset semantics while the
// destination-sensitive title survives intact.
function rewriteOpaqueTitles(node, ctx, namespace = 'html') {
	if (node == null || typeof node !== 'object') return node;
	if (Array.isArray(node)) return node.map((child) => rewriteOpaqueTitles(child, ctx, namespace));
	const type = node.type;
	if (type === 'Element' || type === 'JSXElement') {
		const tag = jsxTagName(node) || elementTagName(node);
		const ordinaryComponent =
			isComponentTag(node) && !isActivityLongForm(node) && !isFragmentLongForm(node);
		if (
			!ordinaryComponent &&
			tag === 'title' &&
			(namespace === 'opaque' || namespace === 'mathml')
		) {
			return deferredTitleElement(node, ctx);
		}
		const childNamespace = ordinaryComponent
			? 'opaque'
			: typeof tag === 'string'
				? opaqueHostChildNamespace(tag, namespace)
				: namespace;
		const children = rewriteOpaqueTitles(node.children || [], ctx, childNamespace);
		const out = { ...node, children };
		return out;
	}
	if (type === 'Fragment' || type === 'JSXFragment' || type === 'Tsx' || type === 'Tsrx') {
		return { ...node, children: rewriteOpaqueTitles(node.children || [], ctx, namespace) };
	}
	if (type === 'JSXCodeBlock') {
		return {
			...node,
			body: rewriteOpaqueTitles(node.body || [], ctx, namespace),
			render: rewriteOpaqueTitles(node.render, ctx, namespace),
		};
	}
	if (type === 'BlockStatement') {
		return { ...node, body: rewriteOpaqueTitles(node.body || [], ctx, namespace) };
	}
	if (type === 'IfStatement' || type === 'JSXIfExpression') {
		return {
			...node,
			consequent: rewriteOpaqueTitles(node.consequent, ctx, namespace),
			alternate: rewriteOpaqueTitles(node.alternate, ctx, namespace),
		};
	}
	if (type === 'ForOfStatement' || type === 'JSXForExpression') {
		return {
			...node,
			body: rewriteOpaqueTitles(node.body, ctx, namespace),
			empty: rewriteOpaqueTitles(node.empty, ctx, namespace),
		};
	}
	if (type === 'SwitchStatement' || type === 'JSXSwitchExpression') {
		return {
			...node,
			cases: (node.cases || []).map((entry) => ({
				...entry,
				consequent: rewriteOpaqueTitles(entry.consequent || [], ctx, namespace),
			})),
		};
	}
	if (type === 'TryStatement' || type === 'JSXTryExpression') {
		return {
			...node,
			block: rewriteOpaqueTitles(node.block, ctx, namespace),
			handler: rewriteOpaqueTitles(node.handler, ctx, namespace),
			finalizer: rewriteOpaqueTitles(node.finalizer, ctx, namespace),
			pending: rewriteOpaqueTitles(node.pending, ctx, namespace),
		};
	}
	if (type === 'CatchClause') {
		return { ...node, body: rewriteOpaqueTitles(node.body, ctx, namespace) };
	}
	if (type === 'ActivityStatement') {
		return { ...node, children: rewriteOpaqueTitles(node.children || [], ctx, namespace) };
	}
	if (type === 'JSXExpressionContainer' && node.expression) {
		return {
			...node,
			expression: mapAst(node.expression, (inner) => {
				if (
					inner.type === 'Element' ||
					inner.type === 'JSXElement' ||
					inner.type === 'Fragment' ||
					inner.type === 'JSXFragment'
				) {
					return rewriteOpaqueTitles(inner, ctx, namespace);
				}
				return null;
			}),
		};
	}
	return node;
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

	const textExpr = VOID_ELEMENTS.has(tag) ? 'null' : printExpr(headTextExpression(el));

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
//   - Conditional:                    both result arms known-string
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
	if (node.type === 'ConditionalExpression') {
		return (
			isKnownStringExpression(node.consequent, locals) &&
			isKnownStringExpression(node.alternate, locals)
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

function emitAutoMemoRegion(ctx, dependencies, slotIndex, statement, extraMiss, contextAware) {
	const cell = allocAutoMemoCell(ctx, dependencies.length + (contextAware ? 1 : 0));
	const contextIndex = contextAware ? cell.base + dependencies.length : null;
	const cache = ctx.currentAutoMemoCacheName;
	// Evaluate every dependency exactly once per render, before the miss test.
	// The published snapshot is then the exact value the comparison (and the
	// re-rendered region) observed: a live imported binding that moves while the
	// region's statement runs cannot publish a fresher value than the render
	// consumed, and getter-bearing dependency paths are read once per render
	// rather than once per guard clause.
	const depNames = dependencies.map(() => allocCompilerName(ctx, '__memoDep'));
	const depDecls = dependencies
		.map((dependency, index) => `const ${depNames[index]} = (${dependency});`)
		.join(' ');
	const misses = [`__s.slots[${slotIndex}] === undefined`];
	if (extraMiss !== null) misses.push(`(${extraMiss})`);
	misses.push(`${cache}[${cell.init}] !== true`);
	for (let index = 0; index < depNames.length; index++) {
		misses.push(`${cache}[${cell.base + index}] !== ${depNames[index]}`);
	}
	const publish = depNames
		.map((name, index) => `${cache}[${cell.base + index}] = ${name};`)
		.join(' ');
	const writable = `if (${cache} === ${ctx.currentAutoMemoCommittedName}) ${cache} = ${cache}.slice();`;
	if (!contextAware) {
		return `{ ${depDecls} if (${misses.join(' || ')}) { ${statement} ${writable} ${publish} ${cache}[${cell.init}] = true; } }`;
	}
	ctx.runtimeNeeded.add('compilerCacheContext');
	return `{ ${depDecls} if (${misses.join(' || ')}) { ${statement} const _c = _$compilerCacheContext(__s, ${slotIndex}, ${cache}[${contextIndex}]); ${writable} ${publish} ${cache}[${contextIndex}] = _c; ${cache}[${cell.init}] = true; } else { const _c = _$compilerCacheContext(__s, ${slotIndex}, ${cache}[${contextIndex}]); if (_c !== ${cache}[${contextIndex}]) { ${writable} ${cache}[${contextIndex}] = _c; } } }`;
}

function planJsx(
	jsxNodesRaw,
	ctx,
	componentName,
	inlinedSubs,
	parentNs = 'html',
	cssHash = null,
	mountCallbackSinks = null,
) {
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
	const allNodes = normalizeChildren(jsxNodesRaw, parentNs === 'svg');
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
	// Hydration range compaction: a bare renderable hole that is the ENTIRE body
	// (the common `SafeFragment` / `{children}` pass-through shape) is provably
	// coextensive with its component block. Unlike M3 component inheritance we
	// keep the explicit SSR pair for backward-compatible hydration, then stamp
	// the client ChildSlot so the post-hydration pass may borrow the outer pair.
	const coalesceChildRoot =
		jsxNodes.length === 1 &&
		((jsxNodes[0].type === 'Text' &&
			!isKnownStringExpression(jsxNodes[0].expression, ctx.knownStringLocals)) ||
			jsxNodes[0].type === 'TSRXExpression');
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
		n.type === 'SwitchStatement' ||
		n.type === 'FoldedDirective';
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
		if (coalesceChildRoot && compCalls.length > 0) {
			compCalls[compCalls.length - 1].coalesceRange = true;
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
		//   - Opaque component bodies/children: pass flag 3 (+ frag=1 for multiple
		//     roots); clone() resolves and caches the concrete namespace from the
		//     render block's actual parent.
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
				: (parentNs === 'html' || parentNs === 'opaque') && fragImpliesSvg
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
	const eventWriterCounts = new Map();
	for (const b of elementBindings) {
		if (b.kind === 'spread') spreadPaths.add(b.path.join(','));
		if (b.kind === 'event' || b.kind === 'event-bundle') {
			const key = `${b.path.join(',')}|${b.slotKey}`;
			eventWriterCounts.set(key, (eventWriterCounts.get(key) || 0) + 1);
		}
	}
	for (const b of elementBindings) {
		const sharesSpreadHost = spreadPaths.has(b.path.join(','));
		const sharesEventSlot =
			(b.kind === 'event' || b.kind === 'event-bundle') &&
			eventWriterCounts.get(`${b.path.join(',')}|${b.slotKey}`) > 1;
		// A spread on the same element can overwrite/remove an explicit event.
		// Multiple explicit writers for the same slot have the same constraint:
		// every writer must stay live so the last one in JSX order keeps winning.
		if ((sharesSpreadHost || sharesEventSlot) && b.mountOnly) b.mountOnly = false;
		b.deferred =
			DEFERRABLE_MOUNT_KINDS.has(b.kind) &&
			!sharesSpreadHost &&
			b.name !== 'dangerouslySetInnerHTML';
	}

	// Materialize compiler-owned event callbacks only where the DOM installs
	// them. A callback consumed once is inlined into that mount assignment;
	// shared consumers get one mount-local const so their identity remains
	// shared. The source analysis already rejects every non-static escape, and
	// this assertion keeps future binding-lowering changes fail-closed.
	if (mountCallbackSinks?.size) {
		const matches = new Map();
		for (const b of elementBindings) {
			if (!b.mountOnly) continue;
			const name = b.kind === 'event' ? b.expr : b.kind === 'event-bundle' ? b.fnExpr : null;
			if (!name || !mountCallbackSinks.has(name)) continue;
			let bindings = matches.get(name);
			if (!bindings) matches.set(name, (bindings = []));
			bindings.push(b);
		}
		for (const [name, sink] of mountCallbackSinks) {
			const bindings = matches.get(name) || [];
			if (bindings.length !== sink.uses) {
				throw new Error(`octane compiler: mount callback sink mismatch for ${name}`);
			}
			const arrow = printNode(sink.arrow);
			if (bindings.length === 1) {
				const binding = bindings[0];
				if (binding.kind === 'event') binding.expr = arrow;
				else binding.fnExpr = arrow;
			} else {
				mountLines.push(`    const ${name} = ${arrow};`);
			}
		}
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
		if (b.kind === 'stringData') ctx.runtimeNeeded.add('setStringData');
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
		if (b.kind === 'htmlOnlyChild') ctx.runtimeNeeded.add('setDangerouslySetInnerHTML');
		if (b.kind === 'dangerCommit') ctx.runtimeNeeded.add('setDangerouslySetInnerHTMLSources');
		if (b.kind === 'formCommit') ctx.runtimeNeeded.add('setFormControlSources');
		if (b.kind === 'hostCommit') {
			ctx.runtimeNeeded.add('setHostPropSources');
			ctx.runtimeNeeded.add('queueRefDetach');
		}
		if (b.kind === 'dangerChild') ctx.runtimeNeeded.add('markDangerouslySetInnerHTMLChildren');
		if (b.kind === 'event-bundle') {
			// 3b: mount builds the descriptor via evtN. Lifetime-stable bundles skip
			// the update helper but still share the compact mount helper call.
			const arity = b.argExprs.length <= 2 ? String(b.argExprs.length) : 'N';
			ctx.runtimeNeeded.add(`evt${arity}`);
			if (!b.mountOnly) ctx.runtimeNeeded.add(`evt${arity}u`);
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
				} else if (b.kind === 'hostCommit') {
					rm.push('s', bag.letter(`_host$${b.id}`), bag.letter(`_el$${b.id}`));
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
		//        that only changes a survivor's position need not re-render it),
		//        bit 4 = SSR emitted markerless direct-host items; hydrate them by root.
		const flags =
			(fc.pure ? 1 : 0) |
			(fc.singleRoot ? 2 : 0) |
			(fc.depEligible ? 4 : 0) |
			(fc.indexIndependent ? 8 : 0) |
			(fc.ssrMarkerless ? 16 : 0);
		// Arg layout: forBlock(__s, slot, host, items, keyFn, body, flags?, deps?,
		// emptyBody?, anchor?, ownEnd?).
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
		let flagsExpr = String(flags || 0);
		if (fc.itemMemoFlags !== 0) {
			const witnesses = fc.itemMemoWitnesses
				.map((name) => `${name}.__memo === true && ${name}.__compare === undefined`)
				.join(' && ');
			flagsExpr = `(${flags} | ((${witnesses}) ? ${fc.itemMemoFlags} : 0))`;
		}
		if (fc.singleRootExpr) {
			flagsExpr = `(${flagsExpr} | (${fc.singleRootExpr}.$$singleRoot === true ? 2 : 0))`;
		}
		const flagsPart =
			flags || fc.singleRootExpr || hasDeps || hasEmpty || hasAnchor ? ', ' + flagsExpr : '';
		const depsPart = hasDeps
			? `, [${fc.depNames.join(', ')}]`
			: hasEmpty || hasAnchor
				? ', undefined'
				: '';
		const emptyPart = hasEmpty ? `, ${fc.emptyHelper}` : hasAnchor ? ', null' : '';
		const anchorPart = hasAnchor ? `, ${anchorExpr}` : '';
		// A dedicated template `<!>` is already a durable comment at exactly the
		// list's trailing boundary. Let forBlock reuse it as its end marker instead
		// of retaining it beside a newly-created `/for` comment.
		const ownEndPart = fc.anchorVar ? ', true' : '';
		const itemsArg = fc.autoMemoDeps !== null ? '_v' : fc.itemsExpr;
		const call = `_$forBlock(__s, ${slotIndex}, ${hostExpr}, ${itemsArg}, ${fc.keyHelper}, ${fc.bodyHelper}${flagsPart}${depsPart}${emptyPart}${anchorPart}${ownEndPart});`;
		if (fc.autoMemoDeps !== null) {
			const witnessMiss = fc.autoMemoWitnesses.length
				? fc.autoMemoWitnesses
						.map((name) => `${name}.__memo !== true || ${name}.__compare !== undefined`)
						.join(' || ')
				: null;
			const guarded = emitAutoMemoRegion(
				ctx,
				['_v', ...fc.autoMemoDeps],
				slotIndex,
				call,
				witnessMiss,
				fc.autoMemoContextAware,
			);
			pushAfter(fc.id, `  { const _v = (${fc.itemsExpr}); ${guarded} }`);
		} else {
			pushAfter(fc.id, `  ${call}`);
		}
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
		if (cc.hostChildrenBinding != null) {
			const props = `_b.${bag.letter(`_host$${cc.hostChildrenBinding.id}`)}`;
			cc.valueExpr = `Object.prototype.propertyIsEnumerable.call(${props}, "children") ? ${props}.children : undefined`;
		} else if (cc.directChildrenBinding != null) {
			cc.valueExpr = `_b.${bag.letter(`_prev$${cc.directChildrenBinding.id}`)}`;
		}
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
				ctx.runtimeNeeded.add('childTextHole');
				const chp = `_b.${bag.letter(`_chp$${cc.id}`)}`;
				const chv = `_b.${bag.letter(`_chv$${cc.id}`)}`;
				// A host that can receive dangerouslySetInnerHTML must validate its
				// current child on EVERY render. The ordinary primitive fast path can
				// identity-skip an unchanged child while a raw-HTML writer activates in
				// the same render, bypassing childTextHole's mutual-exclusion check.
				if (cc.potentialDangerouslySetInnerHTML) {
					pushAfter(
						cc.id,
						`  { const _v = (${cc.valueExpr}); ${chv} = _$childTextHole(__s, ${slotIndex}, ${hostExpr}, _v, ${chv}); ${chp} = _v; }`,
					);
					continue;
				}
				ctx.runtimeNeeded.add('setText');
				pushAfter(
					cc.id,
					`  { const _v = (${cc.valueExpr}); const _o = _v !== null && (typeof _v === 'object' || typeof _v === 'function'); if (_o || ${chp} !== _v) { const _t = ${chv}; if (_t != null && !_o && _v !== null) _$setText(_t, _v); else ${chv} = _$childTextHole(__s, ${slotIndex}, ${hostExpr}, _v, _t); ${chp} = _v; } }`,
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
				const coalesceArg = cc.coalesceRange
					? anchorArg
						? ', undefined, true'
						: ', undefined, undefined, true'
					: '';
				pushAfter(
					cc.id,
					`  _$textSlot(__s, ${slotIndex}, ${hostExpr}, ${cc.valueExpr}${anchorArg}${coalesceArg});`,
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
			ctx.runtimeNeeded.add('textHole');
			// When the slot has its OWN `<!>` placeholder, tell textHole/childSlot to
			// reuse it as the end marker (no second comment minted) — `ownEnd`.
			const ownEndArg = cc.anchorVar ? ', true' : '';
			const coalesceArg = cc.coalesceRange ? (cc.anchorVar ? ', true' : ', undefined, true') : '';
			const chp = `_b.${bag.letter(`_chp$${cc.id}`)}`;
			const chv = `_b.${bag.letter(`_chv$${cc.id}`)}`;
			if (cc.potentialDangerouslySetInnerHTML) {
				pushAfter(
					cc.id,
					`  { const _v = (${cc.valueExpr}); ${chp} = _v; ${chv} = _$textHole(__s, ${slotIndex}, ${hostExpr}, _v, ${anchorExpr}${ownEndArg}${coalesceArg}); }`,
				);
				continue;
			}
			ctx.runtimeNeeded.add('setText');
			pushAfter(
				cc.id,
				`  { const _v = (${cc.valueExpr}); const _o = _v !== null && (typeof _v === 'object' || typeof _v === 'function'); if (_o || ${chp} !== _v) { ${chp} = _v; const _t = ${chv}; if (_t != null && !_o && _v !== null) _$setText(_t, _v); else ${chv} = _$textHole(__s, ${slotIndex}, ${hostExpr}, _v, ${anchorExpr}${ownEndArg}${coalesceArg}); } }`,
			);
			continue;
		}
		// Compiler-owned whole-component region cache. The flat array belongs to
		// this compiled scope; the ordinary component runtime never sees memo deps.
		if (cc.autoMemoDeps !== null) {
			const componentHelper = cc.voidComponent ? 'componentSlotVoid' : 'componentSlot';
			ctx.runtimeNeeded.add(componentHelper);
			const memoAnchor = anchorExprFor(cc, 'compAnchor');
			let trailing = memoAnchor ? `, ${memoAnchor}` : '';
			if (cc.inheritRange) {
				if (trailing === '') trailing = ', undefined';
				trailing += ', undefined, undefined, true';
			} else if (cc.singleRoot) {
				if (trailing === '') trailing = ', undefined';
				trailing += ', undefined, true';
			}
			const witnessMiss = cc.autoMemoWitnesses.length
				? cc.autoMemoWitnesses
						.map((name) => `${name}.__memo !== true || ${name}.__compare !== undefined`)
						.join(' || ')
				: null;
			pushAfter(
				cc.id,
				`  ${emitAutoMemoRegion(ctx, cc.autoMemoDeps, slotIndex, `_$${componentHelper}(__s, ${slotIndex}, ${hostExpr}, ${cc.compExpr}, ${cc.propsExpr}${trailing});`, witnessMiss, cc.autoMemoContextAware)}`,
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
			const componentHelper = cc.voidComponent ? 'componentSlotVoid' : 'componentSlot';
			ctx.runtimeNeeded.add(componentHelper);
			const inheritAnchor = anchorExprFor(cc, 'compAnchor') ?? 'undefined';
			pushAfter(
				cc.id,
				`  _$${componentHelper}(__s, ${slotIndex}, ${hostExpr}, ${cc.compExpr}, ${cc.propsExpr}, ${inheritAnchor}, undefined, undefined, true);`,
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
		const componentHelper = cc.voidComponent ? 'componentSlotVoid' : 'componentSlot';
		ctx.runtimeNeeded.add(componentHelper);
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
		// Persist key ownership separately from the current key VALUE so
		// `key={undefined}` remains an independent reconciliation boundary.
		const keyedArg = cc.keyExpr != null ? ', undefined, undefined, true' : '';
		pushAfter(
			cc.id,
			`  _$${componentHelper}(__s, ${slotIndex}, ${hostExpr}, ${cc.compExpr}, ${cc.propsExpr}${anchorArg}${keyArg}${singleRootArg}${keyedArg});`,
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
const DEFERRABLE_MOUNT_KINDS = new Set([
	'attr',
	'stringData',
	'class',
	'style',
	'formAction',
	'htmlOnlyChild',
]);

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
	if (!(b.kind === 'class' && b.fresh)) {
		bag.constField(b.kind === 'style' ? `_sty$${b.id}` : `_prev$${b.id}`, 'undefined');
	}
	return `    ${bag.local(`_el$${b.id}`)} = ${elVar};`;
}

function emitBindingMount(b, elVar, bag) {
	if (b.deferred) return emitDeferredMount(b, elVar, bag);
	// `suppressHydrationWarning`: stamp a JS flag (NOT a DOM attribute) the runtime reads to
	// keep the server value + skip the warning on a hydration mismatch for this element.
	if (b.kind === 'suppress') return `    ${elVar}.__oct_suppress = true;`;
	if (b.kind === 'dangerChild') return `    _$markDangerouslySetInnerHTMLChildren(${elVar});`;
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
			return `    {
      const _v = ${E};
      _$setDangerouslySetInnerHTML(${elVar}, _v);
      ${bag.local(`_el$${b.id}`)} = ${elVar};
      ${bag.local(`_prev$${b.id}`)} = _v;
    }`;
		}
		case 'dangerValue': {
			return `    ${bag.local(`_prev$${b.id}`)} = ${E};`;
		}
		case 'formValue':
		case 'hostValue': {
			return `    ${bag.local(`_prev$${b.id}`)} = ${E};`;
		}
		case 'hostSpread': {
			return `    ${bag.local(`_sp$${b.id}`)} = ${E};`;
		}
		case 'dangerCommit': {
			const sources = b.sources
				.map(({ spread, binding }) => {
					const prefix = spread ? '_sp' : '_prev';
					return `[${spread ? 'true' : 'false'}, ${bag.local(`${prefix}$${binding.id}`)}]`;
				})
				.join(', ');
			return `    {
      _$setDangerouslySetInnerHTMLSources(${elVar}, [${sources}]);
			  ${bag.local(`_el$${b.id}`)} = ${elVar};
    }`;
		}
		case 'formCommit': {
			const sources = b.sources
				.map(({ spread, name, binding }) => {
					const prefix = spread ? '_sp' : '_prev';
					const value = bag.local(`${prefix}$${binding.id}`);
					return spread ? `[true, ${value}]` : `[false, ${JSON.stringify(name)}, ${value}]`;
				})
				.join(', ');
			return `    {
      _$setFormControlSources(${elVar}, [${sources}]);
      ${bag.local(`_el$${b.id}`)} = ${elVar};
    }`;
		}
		case 'hostCommit': {
			const sources = b.sources
				.map(({ spread, name, binding }) => {
					const value = bag.local(`${spread ? '_sp' : '_prev'}$${binding.id}`);
					return spread ? `[true, ${value}]` : `[false, ${JSON.stringify(name)}, ${value}]`;
				})
				.join(', ');
			const el = bag.local(`_el$${b.id}`);
			const props = bag.local(`_host$${b.id}`);
			const propsField = bag.letter(`_host$${b.id}`);
			const elField = bag.letter(`_el$${b.id}`);
			return `    {
      ${el} = ${elVar};
      ${props} = _$setHostPropSources(${elVar}, [${sources}], undefined, __s, ${b.hasNestedChildren ? 'true' : 'false'});
      __s.cleanups.push(() => { const _p = _b.${propsField}; if (_p != null && Object.prototype.propertyIsEnumerable.call(_p, 'ref') && _p.ref != null) _$queueRefDetach(_p.ref, _b.${elField}); });
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
		case 'stringData': {
			return `    {
      const _v = ${E};
      _$setStringData(${elVar}, ${JSON.stringify(b.name)}, _v);
      ${bag.local(`_el$${b.id}`)} = ${elVar};
      ${bag.local(`_prev$${b.id}`)} = _v;
    }`;
		}
		case 'value':
		case 'checked':
		case 'checkedCheckable':
		case 'selectValue':
		case 'defaultValue':
		case 'defaultValueUncontrolled':
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
			if (b.fresh) {
				return `    {
      const _v = ${E};
      ${setter};
      ${bag.local(`_el$${b.id}`)} = ${elVar};
    }`;
			}
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
			const flags = b.skipFormControls
				? `, ${b.skipDangerouslySetInnerHTML ? 'true' : 'false'}, true`
				: b.skipDangerouslySetInnerHTML
					? ', true'
					: '';
			return `    {
      const _v = ${E};
      _$setSpread(${elVar}, _v, undefined, __s${flags});
      ${bag.local(`_el$${b.id}`)} = ${elVar};
      ${bag.local(`_sp$${b.id}`)} = _v;
      __s.cleanups.push(() => { const _sp = _b.${bag.letter(`_sp$${b.id}`)}; if (_sp != null && Object.prototype.propertyIsEnumerable.call(Object(_sp), 'ref') && _sp.ref != null) _$queueRefDetach(_sp.ref, _b.${bag.letter(`_el$${b.id}`)}); });
    }`;
		}
		case 'event': {
			if (b.mountOnly) return `    ${elVar}[${JSON.stringify(b.slotKey)}] = (${b.expr});`;
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
				if (b.mountOnly) {
					return `    _$evt${n}(${elVar}, ${JSON.stringify(b.slotKey)}, (${b.fnExpr})${argsPart});`;
				}
				return `    ${bag.local(`_ev$${b.id}`)} = _$evt${n}(${elVar}, ${JSON.stringify(b.slotKey)}, (${b.fnExpr})${argsPart});`;
			}
			if (b.mountOnly) {
				return `    _$evtN(${elVar}, ${JSON.stringify(b.slotKey)}, (${b.fnExpr}), [${b.argExprs.map((e) => `(${e})`).join(', ')}]);`;
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
	if (b.mountOnly) return '';
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
			return `    { const _v = ${E}; if (${F('_prev')} !== _v) { _$setDangerouslySetInnerHTML(${F('_el')}, _v); ${F('_prev')} = _v; } }`;
		}
		case 'dangerValue': {
			return `    { const _v = ${E}; if (${F('_prev')} !== _v) ${F('_prev')} = _v; }`;
		}
		case 'formValue':
		case 'hostValue': {
			return `    { const _v = ${E}; if (${F('_prev')} !== _v) ${F('_prev')} = _v; }`;
		}
		case 'hostSpread': {
			return `    ${F('_sp')} = ${E};`;
		}
		case 'dangerCommit': {
			const sources = b.sources
				.map(({ spread, binding }) => {
					const prefix = spread ? '_sp' : '_prev';
					return `[${spread ? 'true' : 'false'}, _b.${bag.letter(`${prefix}$${binding.id}`)}]`;
				})
				.join(', ');
			return `    _$setDangerouslySetInnerHTMLSources(${F('_el')}, [${sources}]);`;
		}
		case 'formCommit': {
			const sources = b.sources
				.map(({ spread, name, binding }) => {
					const prefix = spread ? '_sp' : '_prev';
					const value = `_b.${bag.letter(`${prefix}$${binding.id}`)}`;
					return spread ? `[true, ${value}]` : `[false, ${JSON.stringify(name)}, ${value}]`;
				})
				.join(', ');
			return `    _$setFormControlSources(${F('_el')}, [${sources}]);`;
		}
		case 'hostCommit': {
			const sources = b.sources
				.map(({ spread, name, binding }) => {
					const value = `_b.${bag.letter(`${spread ? '_sp' : '_prev'}$${binding.id}`)}`;
					return spread ? `[true, ${value}]` : `[false, ${JSON.stringify(name)}, ${value}]`;
				})
				.join(', ');
			return `    ${F('_host')} = _$setHostPropSources(${F('_el')}, [${sources}], ${F('_host')}, __s, ${b.hasNestedChildren ? 'true' : 'false'});`;
		}
		case 'attr': {
			return `    { const _v = ${E}; if (${F('_prev')} !== _v) { _$setAttribute(${F('_el')}, ${JSON.stringify(b.name)}, _v); ${F('_prev')} = _v; } }`;
		}
		case 'stringData': {
			return `    { const _v = ${E}; if (${F('_prev')} !== _v) { _$setStringData(${F('_el')}, ${JSON.stringify(b.name)}, _v); ${F('_prev')} = _v; } }`;
		}
		case 'value':
		case 'checked':
		case 'checkedCheckable':
		case 'selectValue':
		case 'defaultValue':
		case 'defaultValueUncontrolled':
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
			if (b.fresh) {
				return `    ${setter.replace(', _v)', `, ${E})`)};`;
			}
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
			const flags = b.skipFormControls
				? `, ${b.skipDangerouslySetInnerHTML ? 'true' : 'false'}, true`
				: b.skipDangerouslySetInnerHTML
					? ', true'
					: '';
			return `    { const _v = ${E}; if (${F('_sp')} !== _v) { _$setSpread(${F('_el')}, _v, ${F('_sp')}, __s${flags}); ${F('_sp')} = _v; } }`;
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
	if (node.type === 'FoldedDirective') {
		// A returned fragment can put a folded directive at its ROOT, alongside
		// fixed siblings. Its branch helpers and control expressions were already
		// extracted component-side; register the pre-built call exactly as the
		// in-element child path does below.
		const dc = ctx._foldedDirectiveCalls;
		if (node.kind === 'if') {
			return registerConstruct(dc.ifCalls[node.recordIndex], ifCalls);
		}
		if (node.kind === 'for') {
			return registerConstruct(dc.forCalls[node.recordIndex], forCalls);
		}
		if (node.kind === 'switch') {
			return registerConstruct(dc.switchCalls[node.recordIndex], ctx._switchCalls);
		}
		if (node.kind === 'try') {
			return registerConstruct(dc.tryCalls[node.recordIndex], tryCalls);
		}
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
	rejectDangerouslySetInnerHTMLChildren(tag, node, ctx);

	// The host element's own namespace (e.g. `<svg>` is in SVG ns even if its
	// parent context is HTML); its descendants' inherited ns may differ
	// (`<foreignObject>` is SVG-ns but its children are HTML).
	const hostNs = nsForSelf(tag, parentNs);
	const childNs = nsForChildren(tag, parentNs);

	// Collect attributes.
	const attrs = node.attributes || node.openingElement?.attributes || [];
	// A null/undefined child alongside direct raw HTML is semantically absent.
	// Suppress its child binding so hydration cannot clear the raw HTML that the
	// preceding binding just adopted/applied.
	const potentialDangerouslySetInnerHTML = hasPotentialDangerouslySetInnerHTML(node);
	const sourceChildren =
		potentialDangerouslySetInnerHTML && hasOnlyDefinitelyNullishJsxChildren(node.children || [])
			? []
			: node.children || [];
	// React convention: later attributes win on collision. If ANY spread is
	// present, attributes that come AFTER the first spread can't be inlined
	// into the template HTML (the spread would clobber them at runtime) —
	// emit them as bindings in source order instead.
	const firstSpreadIdx = attrs.findIndex(
		(a) => a.type === 'SpreadAttribute' || a.type === 'JSXSpreadAttribute',
	);
	const directPropIdentities = new Set();
	let hasDuplicateDirectProp = false;
	for (const attr of attrs) {
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
		const rawName = jsxAttrRawName(attr);
		if (rawName === 'key') continue;
		const name = normalizeJsxAttrName(rawName, tag, hostNs);
		const identity = hostNs === 'html' ? name.toLowerCase() : name;
		if (directPropIdentities.has(identity)) hasDuplicateDirectProp = true;
		else directPropIdentities.add(identity);
	}
	const directPropNames = new Set(
		attrs
			.filter((attr) => attr.type === 'Attribute' || attr.type === 'JSXAttribute')
			.map((attr) => normalizeJsxAttrName(jsxAttrRawName(attr), tag, hostNs)),
	);
	const hasDirectFormCascade =
		((tag === 'input' || tag === 'textarea' || tag === 'select') &&
			directPropNames.has('value') &&
			directPropNames.has('defaultValue')) ||
		(tag === 'input' && directPropNames.has('checked') && directPropNames.has('defaultChecked')) ||
		(tag === 'select' &&
			directPropNames.has('multiple') &&
			(directPropNames.has('value') || directPropNames.has('defaultValue')));
	const resolveHostPropsAcrossSources =
		firstSpreadIdx !== -1 || hasDuplicateDirectProp || hasDirectFormCascade;
	const hostClientSources = [];
	let directChildrenClientBinding = null;
	let hostCommitClientBinding = null;
	const hasNestedJsxChildren = normalizeChildren(node.children || [], childNs === 'svg').length > 0;
	const resolveDangerouslySetInnerHTMLAcrossSpreads = firstSpreadIdx !== -1;
	const dangerHtmlClientSources = [];
	const resolveFormControlsAcrossSpreads =
		firstSpreadIdx !== -1 && (tag === 'input' || tag === 'textarea' || tag === 'select');
	const formControlClientSources = [];
	// Strict whole-element proofs for the two lean controlled-form helpers. A
	// spread or duplicate/conflicting writer makes source-order ownership
	// ambiguous, so those elements keep the generic helpers. Select is excluded:
	// its default projection is commit-deferred and option-aware.
	const directAttrs = attrs.filter((a) => a.type === 'Attribute' || a.type === 'JSXAttribute');
	const directAttrName = (a) => normalizeJsxAttrName(jsxAttrRawName(a), tag, hostNs);
	const valueWriters = directAttrs.filter((a) => directAttrName(a) === 'value');
	const defaultValueWriters = directAttrs.filter((a) => directAttrName(a) === 'defaultValue');
	const checkedWriters = directAttrs.filter((a) => directAttrName(a) === 'checked');
	const typeWriters = directAttrs.filter((a) => directAttrName(a) === 'type');
	const typeValue = typeWriters[0]?.value;
	const typeExpr = typeValue?.type === 'JSXExpressionContainer' ? typeValue.expression : typeValue;
	const staticInputType =
		typeExpr &&
		(typeExpr.type === 'Literal' || typeExpr.type === 'StringLiteral') &&
		typeof typeExpr.value === 'string'
			? typeExpr.value.toLowerCase()
			: null;
	const leanDefaultValue =
		firstSpreadIdx === -1 &&
		(tag === 'input' || tag === 'textarea') &&
		valueWriters.length === 0 &&
		defaultValueWriters.length === 1;
	const leanChecked =
		firstSpreadIdx === -1 &&
		tag === 'input' &&
		checkedWriters.length === 1 &&
		typeWriters.length === 1 &&
		(staticInputType === 'checkbox' || staticInputType === 'radio');
	let attrHtml = '';
	let sawRef = false;
	for (let attrI = 0; attrI < attrs.length; attrI++) {
		const attr = attrs[attrI];
		// `<div {...props}/>` — runtime spread. Emits one setSpread binding that
		// routes each key (class / style / on… / attr / ref) and diffs against
		// the prior spread object to clear removed keys.
		if (attr.type === 'SpreadAttribute' || attr.type === 'JSXSpreadAttribute') {
			ctx.runtimeNeeded.add('snapshotSpread');
			const expr = `_$snapshotSpread(${printExprWithTsrx(attr.argument, ctx, componentName, inlinedSubs)})`;
			const binding = {
				id: bindings.length,
				kind: 'hostSpread',
				expr,
				path,
				ns: hostNs,
			};
			bindings.push(binding);
			hostClientSources.push({ spread: true, binding });
			continue;
		}
		if (attr.type !== 'Attribute' && attr.type !== 'JSXAttribute') continue;
		const rawAttrName = jsxAttrRawName(attr);
		if (resolveHostPropsAcrossSources) {
			if (rawAttrName === 'ref') {
				if (sawRef) {
					throw new Error(
						'Element has multiple `ref={…}` attributes; an element may have ' +
							'at most one. Use a single array-valued ref to attach multiple, ' +
							'e.g. `ref={[a, b]}` (attachRef in the runtime iterates the array).',
					);
				}
				sawRef = true;
			}
			const val = attr.value;
			let expr;
			if (val == null) {
				expr = 'true';
			} else {
				const inner = resolveStyleExpr(
					val.type === 'JSXExpressionContainer' ? val.expression : val,
					cssHash,
				);
				expr = printExprWithTsrx(inner, ctx, componentName, inlinedSubs);
			}
			const binding = {
				id: bindings.length,
				kind: 'hostValue',
				name: rawAttrName,
				expr,
				path,
			};
			bindings.push(binding);
			hostClientSources.push({ spread: false, name: rawAttrName, binding });
			continue;
		}
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
		const attrName = normalizeJsxAttrName(rawAttrName, tag, hostNs);

		const val = attr.value;
		if (rawAttrName === 'children') {
			const childExpr =
				val == null
					? 'true'
					: printExprWithTsrx(
							val.type === 'JSXExpressionContainer' ? val.expression : val,
							ctx,
							componentName,
							inlinedSubs,
						);
			const binding = {
				id: bindings.length,
				kind: 'hostValue',
				name: 'children',
				expr: childExpr,
				path,
			};
			bindings.push(binding);
			directChildrenClientBinding = binding;
			continue;
		}
		// If this attr comes AFTER a spread, we MUST emit as a binding (later wins).
		const isAfterSpread = firstSpreadIdx !== -1 && attrI > firstSpreadIdx;
		// A direct class before the first spread must also be a runtime writer. SSR
		// resolves the source-ordered class writers to one final attribute; emitting
		// the direct value as a binding gives hydration the same baseline writer
		// before a spread optionally overwrites it. If the client spread omits class,
		// that baseline can warn about and patch a server-only spread class.
		const classBeforeSpread =
			attrName === 'class' && firstSpreadIdx !== -1 && attrI < firstSpreadIdx;

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
		// `htmlOnlyChild` fast path on the complete value object. Keeping the object
		// intact lets the runtime validate malformed values before reading `.__html`.
		// Otherwise pass
		// the `{__html}` object through a regular attr binding; the runtime's
		// `dangerouslySetInnerHTML` property path reads `.__html` and sets innerHTML.
		if (attrName === 'dangerouslySetInnerHTML') {
			const obj = val == null ? null : val.type === 'JSXExpressionContainer' ? val.expression : val;
			const expr = obj === null ? 'true' : printExprWithTsrx(obj, ctx, componentName, inlinedSubs);
			if (resolveDangerouslySetInnerHTMLAcrossSpreads) {
				const binding = {
					id: bindings.length,
					kind: 'dangerValue',
					expr,
					path,
				};
				bindings.push(binding);
				dangerHtmlClientSources.push({ spread: false, binding });
				continue;
			}
			const noChildren =
				sourceChildren.length === 0 || normalizeChildren(sourceChildren).length === 0;
			if (noChildren && !isAfterSpread) {
				bindings.push({
					id: bindings.length,
					kind: 'htmlOnlyChild',
					expr,
					script: tag === 'script',
					path,
				});
				continue;
			}
			bindings.push({
				id: bindings.length,
				kind: 'attr',
				name: 'dangerouslySetInnerHTML',
				expr,
				path,
				ns: hostNs,
			});
			continue;
		}

		// Controlled form props ALWAYS compile to property bindings — static
		// literals and bare booleans (`<input checked/>`) included; nothing
		// bakes into the template HTML (see controlledKindFor).
		let ctlKind = controlledKindFor(tag, attrName);
		if (
			resolveFormControlsAcrossSpreads &&
			(ctlKind !== null || (tag === 'select' && attrName === 'multiple'))
		) {
			const formExpr =
				val == null
					? 'true'
					: printExprWithTsrx(
							val.type === 'JSXExpressionContainer' ? val.expression : val,
							ctx,
							componentName,
							inlinedSubs,
						);
			const binding = {
				id: bindings.length,
				kind: 'formValue',
				name: attrName,
				expr: formExpr,
				path,
			};
			bindings.push(binding);
			formControlClientSources.push({ spread: false, name: attrName, binding });
			continue;
		}
		if (ctlKind !== null) {
			if (ctlKind === 'defaultValue' && leanDefaultValue) {
				ctlKind = 'defaultValueUncontrolled';
			} else if (ctlKind === 'checked' && leanChecked) {
				ctlKind = 'checkedCheckable';
			}
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
		if (
			attrName === 'autoFocus' &&
			!((hostNs === 'html' || hostNs === 'opaque') && tag.includes('-'))
		) {
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
			if (isAfterSpread || classBeforeSpread) {
				// Boolean attr after spread → emit as `true` binding.
				bindings.push({
					id: bindings.length,
					kind: attrName === 'class' ? 'class' : 'attr',
					name: attrName,
					expr: 'true',
					path,
					ns: hostNs,
					fresh: false,
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
		if (inner.type === 'Literal' && !isAfterSpread && !classBeforeSpread) {
			attrHtml += bakeStaticAttr(attrName, inner.value, tag, hostNs);
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
					mountOnly:
						isEventHandlerInvariantExpr(bundleInfo.callee, ctx) &&
						bundleInfo.args.every((arg) => isInvariantBindingExpr(arg, ctx)),
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
					mountOnly: isEventHandlerInvariantExpr(inner, ctx),
				});
			}
		} else if (attrName === 'class') {
			// (`className` was already normalized to `class` above.)
			bindings.push({
				id: bindings.length,
				kind: 'class',
				expr,
				path,
				ns: hostNs,
				fresh: isFreshBindingExpr(inner),
			});
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
		} else if (
			/^data-[a-z][a-z0-9_-]*$/.test(attrName) &&
			isKnownStringExpression(inner, ctx.knownStringLocals)
		) {
			// A lowercase, statically named data attribute with an already-string value
			// needs none of setAttribute's alias, coercion, namespace, controlled-property,
			// or invalid-name machinery. Element.setAttribute applies the same unnamespaced
			// data attribute in HTML, SVG, and MathML, so destination-opaque component
			// templates can retain this specialization. Unknown values, cased names, and
			// every non-data attr retain the generic React-parity path.
			bindings.push({
				id: bindings.length,
				kind: 'stringData',
				name: attrName,
				expr,
				path,
				ns: hostNs,
			});
		} else {
			bindings.push({ id: bindings.length, kind: 'attr', name: attrName, expr, path, ns: hostNs });
		}
	}
	if (resolveHostPropsAcrossSources) {
		hostCommitClientBinding = {
			id: bindings.length,
			kind: 'hostCommit',
			path,
			sources: hostClientSources,
			hasNestedChildren: hasNestedJsxChildren,
		};
		bindings.push(hostCommitClientBinding);
	} else if (resolveDangerouslySetInnerHTMLAcrossSpreads) {
		bindings.push({
			id: bindings.length,
			kind: 'dangerCommit',
			path,
			sources: dangerHtmlClientSources,
		});
	}
	if (!resolveHostPropsAcrossSources && resolveFormControlsAcrossSpreads) {
		bindings.push({
			id: bindings.length,
			kind: 'formCommit',
			path,
			sources: formControlClientSources,
		});
	}
	if (
		!hasNestedJsxChildren &&
		(hostCommitClientBinding !== null || directChildrenClientBinding !== null)
	) {
		compCalls.push({
			id: ctx.nextHelperId++,
			loc: devLoc(ctx, node),
			isChild: true,
			hostPath: path,
			onlyChildText: true,
			potentialDangerouslySetInnerHTML,
			hostChildrenBinding: hostCommitClientBinding,
			directChildrenBinding: directChildrenClientBinding,
		});
	}

	const isVoid = VOID_ELEMENTS.has(tag);
	let html = isVoid ? `<${tag}${attrHtml}/>` : `<${tag}${attrHtml}>`;

	const children = normalizeChildren(sourceChildren, childNs === 'svg');
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
			ch.potentialDangerouslySetInnerHTML = potentialDangerouslySetInnerHTML;
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
					ch.potentialDangerouslySetInnerHTML = potentialDangerouslySetInnerHTML;
					compCalls.push(ch);
					html += '<!>';
					childIdx++;
				}
			}
		}
	}
	if (
		potentialDangerouslySetInnerHTML &&
		hasDefinitelyNonNullishJsxChild(node.children || [], ctx.knownStringLocals)
	) {
		bindings.push({
			id: bindings.length,
			kind: 'dangerChild',
			expr: 'true',
			path,
			mountOnly: true,
		});
	}

	if (!isVoid) html += `</${tag}>`;
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
	const ownEnvNames = envNames === null ? null : helperCaptures(ctx, stmts, params);
	const ownEnv = new Set(ownEnvNames || []);
	let bodyStmts = stmts;
	if (envNames && envNames.length > 0) {
		// Destructure the construct's shared env tuple. The layout is the UNION
		// across the construct's helpers. An arm leaves holes for union-only names:
		// binding them could collide with a same-named local that shadows a capture
		// used only by another arm.
		bodyStmts = [
			{
				type: 'VariableDeclaration',
				kind: 'const',
				declarations: [
					{
						type: 'VariableDeclarator',
						id: {
							type: 'ArrayPattern',
							elements: envNames.map((n) =>
								ownEnv.has(n) ? { type: 'Identifier', name: n } : null,
							),
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
	const prevInvariantLocals = ctx.currentInvariantLocals;
	const prevEventInvariantLocals = ctx.currentEventInvariantLocals;
	const extended = new Set(prevLocals);
	for (const n of collectComponentLocals(fake)) extended.add(n);
	ctx.currentComponentLocals = extended;
	ctx.currentInvariantLocals = new Set(
		(ownEnvNames || []).filter((name) => prevInvariantLocals?.has(name) === true),
	);
	ctx.currentEventInvariantLocals = new Set(
		(ownEnvNames || []).filter((name) => prevEventInvariantLocals?.has(name) === true),
	);
	let code;
	try {
		code = compileFunctionBody(fake, ctx, helperName, parentNs, cssHash);
	} finally {
		ctx.currentComponentLocals = prevLocals;
		ctx.currentInvariantLocals = prevInvariantLocals;
		ctx.currentEventInvariantLocals = prevEventInvariantLocals;
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

function collectAutoMemoDependencyExpressions(nodes) {
	const dependencies = new Set();
	const coveredRoots = new Set();
	const seen = new WeakSet();
	let safe = true;
	let hasComponentValue = false;
	function addFree(node) {
		for (const name of collectFreeIdentifiers(node, [])) {
			dependencies.add(name);
			coveredRoots.add(name);
		}
	}
	function walk(original) {
		const node = unwrapTsExpr(original);
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (isInvariantLiteral(node)) return;
		if ((node.type === 'Element' || node.type === 'JSXElement') && isComponentTag(node)) {
			hasComponentValue = true;
		}
		// A flat guard evaluates every dependency eagerly. Preserve JavaScript's
		// short-circuit/optional evaluation order by leaving these call sites on the
		// ordinary reconciliation path until the cache owns expression temporaries.
		if (
			node.type === 'LogicalExpression' ||
			node.type === 'ConditionalExpression' ||
			node.type === 'ChainExpression' ||
			((node.type === 'MemberExpression' || node.type === 'CallExpression') && node.optional)
		) {
			safe = false;
			return;
		}
		if (isAutoMemoCalculationDependency(node)) {
			const expression = printExpr(node);
			dependencies.add(expression);
			for (const name of collectFreeIdentifiers(node, [])) coveredRoots.add(name);
			return;
		}
		if (
			node.type === 'ArrowFunctionExpression' ||
			node.type === 'FunctionExpression' ||
			node.type === 'FunctionDeclaration'
		) {
			addFree(node);
			return;
		}
		if (node.type === 'Property') {
			if (node.computed) walk(node.key);
			walk(node.value);
			return;
		}
		for (const key in node) {
			if (AST_WALK_SKIP_KEYS.has(key)) continue;
			walk(node[key]);
		}
	}
	for (const node of nodes) walk(node);
	return { dependencies, coveredRoots, safe, hasComponentValue };
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
	const propDependencyNodes = [];
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
		if (inner.type !== 'Literal') propDependencyNodes.push(inner);
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
	const sourceChildren = node.children || [];
	const renderPropChild = soleRenderPropChild(sourceChildren);
	if (renderPropChild) {
		propParts.push(
			`"children": (${printExprWithTsrx(rewriteJsxValues(renderPropChild, ctx), ctx, componentName, inlinedSubs)})`,
		);
	} else if (sourceChildren.length > 0) {
		const children = rewriteOpaqueTitles(sourceChildren, ctx, 'opaque');
		const childrenParentNs =
			!isActivityLongForm(node) && !isFragmentLongForm(node) ? 'opaque' : parentNs;
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
			childrenParentNs,
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
	// Null = ordinary call. An array (including []) selects the production-only
	// compiler-owned dependency boundary and is emitted as expressions in order.
	let autoMemoDeps = null;
	let autoMemoWitnesses = [];
	let autoMemoContextAware = false;
	// A same-module compiled callee whose JavaScript return is provably void can
	// use a Block that omits generic return-value reconciliation. HMR deliberately
	// keeps the generic path: an update can replace the implementation with a
	// value-returning body while retaining the wrapper identity.
	let voidComponent = false;
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
	if (ctx.componentInfo) {
		const tagName = node.openingElement?.name || node.id || node.name;
		const isBareIdent =
			tagName && (tagName.type === 'Identifier' || tagName.type === 'JSXIdentifier');
		if (isBareIdent) {
			const hasSpread = propParts.some((p) => p.startsWith('...'));
			const hasChildrenProp = propParts.some((p) => p.startsWith('"children":'));
			const callSiteOk = !hasSpread && !hasChildrenProp;
			const calleeInfo = ctx.componentInfo.get(compExpr);
			if (calleeInfo) {
				voidComponent = !ctx.hmr && calleeInfo.voidOutput === true;
				if (keyExpr == null) {
					if (calleeInfo.eligible) liteEligible = callSiteOk;
					else if (calleeInfo.singleRoot) singleRoot = callSiteOk;
					if (
						ctx.autoMemo &&
						ctx.currentComponentLocals &&
						ctx.currentAutoMemoCallsitesSafe !== false &&
						callSiteOk &&
						calleeInfo.autoMemoSafe === true &&
						!containsRenderCall([node]) &&
						!containsAutoMemoUnsafeStructure([node]) &&
						!containsImportedMemberRead(node, ctx.importedNames)
					) {
						const free = collectFreeIdentifiers(node, []);
						const calleeCaptures = calleeInfo.autoMemoCaptures || [];
						const deps = new Set(calleeCaptures);
						const callsiteDeps = collectAutoMemoDependencyExpressions(propDependencyNodes);
						for (const dependency of callsiteDeps.dependencies) deps.add(dependency);
						let depsSafe =
							callsiteDeps.safe &&
							!callsiteDeps.hasComponentValue &&
							!ctx.currentComponentLocals.has(compExpr);
						// A caller-local shadow would make `[capture]` name the wrong value;
						// decline until module captures receive compiler-owned aliases.
						for (const capture of calleeCaptures) {
							if (ctx.currentComponentLocals.has(capture)) depsSafe = false;
						}
						for (const witness of calleeInfo.autoMemoImportedComponents || []) {
							if (ctx.currentComponentLocals.has(witness)) depsSafe = false;
						}
						for (const name of free) {
							if (name === compExpr) continue;
							if (ctx.importNamespaceNames.has(name)) {
								depsSafe = false;
							} else if (ctx.currentComponentLocals.has(name) || ctx.importedNames.has(name)) {
								if (!callsiteDeps.coveredRoots.has(name)) deps.add(name);
							} else if (ctx.componentInfo.has(name) || ctx.defaultMemoBindings.has(name)) {
								// Same-module FunctionDeclaration identity is immutable.
								continue;
							} else {
								// A module/global read at the call site is not a reactive witness.
								depsSafe = false;
							}
						}
						if (depsSafe) {
							autoMemoDeps = [...deps].sort();
							autoMemoWitnesses = [...(calleeInfo.autoMemoImportedComponents || [])];
							autoMemoContextAware = calleeInfo.autoMemoMayReadContext === true;
							// The cache needs a real context-stamping Block. Preserve the
							// same-module single-root proof, but never use componentSlotLite.
							liteEligible = false;
							singleRoot = calleeInfo.singleRoot === true;
						}
					}
				}
			} else if (
				keyExpr == null &&
				ctx.importedNames !== undefined &&
				ctx.importedNames.has(compExpr)
			) {
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
		autoMemoDeps,
		autoMemoWitnesses,
		autoMemoContextAware,
		voidComponent,
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
	let itemMemo = false;
	let itemMemoContextAware = false;
	let itemMemoWitnesses = [];
	let itemMemoFlags = 0;
	let autoMemoDeps = null;
	let autoMemoWitnesses = [];
	let autoMemoContextAware = false;
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
		itemMemo =
			ctx.autoMemo === true &&
			hasNestedComp &&
			hasOnlyComponentItemBoundaries(subStmts) &&
			!hasHook &&
			!hasRenderCall &&
			!containsAutoMemoUnsafeStructure(subStmts) &&
			!containsImportedMemberRead(bodyAst, ctx.importedNames);
		if (itemMemo) {
			itemMemoWitnesses = [
				...collectImportedComponentReferences(bodyAst, ctx.importedNames),
			].sort();
			if (itemMemoWitnesses.length > 0) itemMemoContextAware = true;
			for (const name of free) {
				if (ctx._octaneBoundaryNames.has(name) || ctx.importNamespaceNames.has(name)) {
					itemMemo = false;
					break;
				}
				if (ctx.currentComponentLocals.has(name)) continue;
				if (ctx.importedNames.has(name)) {
					if (!seenDeps.has(name)) {
						seenDeps.add(name);
						depNames.push(name);
					}
					continue;
				}
				if (ctx.defaultMemoBindings.has(name)) {
					// A local memo() wrapper may hide a context consumer. The whole-list
					// guard below can carry that exceptional dependency; a bare PURE item
					// promotion cannot.
					itemMemoContextAware = true;
					continue;
				}
				const child = ctx.componentInfo.get(name);
				if (child !== undefined) {
					// A compiler-proven child can itself close over live imports. The item
					// boundary sits outside that child call, so it must witness the same
					// transitive captures before deciding not to enter the item helper.
					if (child.autoMemoSafe !== true) {
						itemMemo = false;
						break;
					}
					for (const capture of child.autoMemoCaptures) {
						if (!seenDeps.has(capture)) {
							seenDeps.add(capture);
							depNames.push(capture);
						}
					}
					if (child.autoMemoMayReadContext) itemMemoContextAware = true;
					continue;
				}
				// Ambient globals and module locals are not reactive witnesses. Imported
				// live bindings are handled above; everything else fails closed.
				itemMemo = false;
				break;
			}
		}
		// Whole-list expression cache. Evaluate the iterable snapshot every render,
		// then skip the forBlock call entirely while that identity and every lexical
		// body/key/@empty capture are unchanged. Direct render-time calls, refs,
		// mutations, effects, portals, and opaque module/global reads fail closed.
		const regionStmts = emptyStmts ? [...subStmts, ...emptyStmts] : subStmts;
		const regionAst = { type: 'BlockStatement', body: regionStmts };
		const regionFree = collectFreeIdentifiers(regionAst, bodyScope);
		if (node.key) {
			for (const name of collectFreeIdentifiers(node.key, bodyScope)) regionFree.add(name);
		}
		let listSafe =
			ctx.autoMemo === true &&
			isAutoMemoCalculationDependency(node.right) &&
			!hasHook &&
			!containsRenderCall(regionStmts) &&
			!containsRenderCall(node.key ? [node.key] : []) &&
			!containsAutoMemoUnsafeStructure(regionStmts) &&
			!containsAutoMemoUnsafeStructure(node.key ? [node.key] : []) &&
			!containsImportedMemberRead(regionAst, ctx.importedNames);
		const listDeps = new Set();
		const witnesses = collectImportedComponentReferences(regionAst, ctx.importedNames);
		let listMayReadContext = witnesses.size > 0 || containsAutoMemoContextRead(regionAst, ctx);
		if (listSafe) {
			for (const name of regionFree) {
				if (ctx._octaneBoundaryNames.has(name) || ctx.importNamespaceNames.has(name)) {
					listSafe = false;
					break;
				}
				if (ctx.currentComponentLocals.has(name)) {
					listDeps.add(name);
					continue;
				}
				if (ctx.importedNames.has(name)) {
					listDeps.add(name);
					continue;
				}
				if (ctx.defaultMemoBindings.has(name)) {
					listMayReadContext = true;
					continue;
				}
				const child = ctx.componentInfo.get(name);
				if (child?.autoMemoSafe === true) {
					for (const capture of child.autoMemoCaptures) listDeps.add(capture);
					for (const witness of child.autoMemoImportedComponents || []) {
						witnesses.add(witness);
					}
					if (child.autoMemoMayReadContext) listMayReadContext = true;
					continue;
				}
				listSafe = false;
				break;
			}
		}
		if (listSafe) {
			autoMemoDeps = [...listDeps].sort();
			autoMemoWitnesses = [...witnesses].sort();
			autoMemoContextAware = listMayReadContext;
		}

		// A context-bearing component-only body may skip its item helper only when
		// the enclosing list guard owns context invalidation. Without that guard,
		// PURE would strand consumers on Provider updates (the ordinary forBlock
		// survivor shortcut has no compiler-cache epoch cell to consult).
		if (itemMemoContextAware && autoMemoDeps === null) itemMemo = false;
		const hostPure = !hasParentClosure && !hasHook && !hasNestedComp && !hasRenderCall;
		const hostDepEligible =
			!hostPure && !hasHook && hasParentClosure && !hasNestedComp && !hasRenderCall;
		if (itemMemo && itemMemoWitnesses.length > 0) {
			pure = hostPure;
			depEligible = hostDepEligible;
			itemMemoFlags = depNames.length === 0 ? 1 : 4;
		} else {
			pure = hostPure || (itemMemo && depNames.length === 0);
			depEligible = !pure && !hasHook && (hostDepEligible || (itemMemo && depNames.length > 0));
		}
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
	// The helper destructures only component-local captures (`envNames`) from the
	// tuple prefix. Compiler memoization may additionally need live imported
	// bindings as dependency witnesses; append them without disturbing that ABI.
	const runtimeDepNames =
		envNames === null
			? depNames
			: [...envNames, ...depNames.filter((name) => !envNames.includes(name))];
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
	// In addition to a direct host root, accept only narrowly-proven sole
	// component and host-vs-host conditional roots; all other shapes keep item
	// ranges.
	let singleRoot = false;
	let singleRootExpr = null;
	{
		const jsxChildren = subStmts.filter((s) => isJsxNode(s));
		if (jsxChildren.length === 1) {
			const c = jsxChildren[0];
			// Old IR uses `Element`; new TSRX AST uses `JSXElement`. Both qualify
			// for the singleRoot fast path so long as the tag is lowercase (so the
			// row itself is the block-boundary host, no Comment markers needed).
			if (isSingleHostIfRoot(c)) {
				singleRoot = true;
			} else if (isPlainHostRoot(c)) {
				singleRoot = true;
			} else if ((c.type === 'Element' || c.type === 'JSXElement') && isComponentTag(c)) {
				// A sole component item can share the component's proven host root as
				// its keyed boundary. Keep the same conservative call-site exclusions
				// as componentSlot's singleRoot path. Imported bindings are immutable,
				// so resolve their definition-site stamp once per parent render.
				const tagName = c.openingElement?.name || c.id || c.name;
				const bare =
					tagName &&
					(tagName.type === 'Identifier' || tagName.type === 'JSXIdentifier') &&
					typeof tagName.name === 'string';
				const attrs = c.attributes || c.openingElement?.attributes || [];
				const hasSpread = attrs.some(
					(a) => a.type === 'SpreadAttribute' || a.type === 'JSXSpreadAttribute',
				);
				const hasKeyOrChildren = attrs.some((a) => {
					const n = a.name?.name || a.name;
					return n === 'key' || n === 'children';
				});
				const hasChildren = (c.children || []).length > 0;
				if (bare && !hasSpread && !hasKeyOrChildren && !hasChildren) {
					const compName = tagName.name;
					const local = ctx.componentInfo?.get(compName);
					if (local?.singleRoot === true) singleRoot = true;
					else if (ctx.importedNames?.has(compName)) singleRootExpr = compName;
				}
			}
		}
		if (jsxChildren.length === 0) {
			const controls = subStmts.filter((s) => isIfDirective(s));
			if (controls.length === 1 && isSingleHostIfRoot(controls[0])) singleRoot = true;
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
		singleRootExpr,
		ssrMarkerless: isSsrMarkerlessForItem(node),
		// The env union doubles as the deps array: emitted whenever the helpers
		// capture anything (Phase 2 — the runtime stamps it as block.extra), and
		// ALSO compared for the dep-pure survivor short-circuit when depEligible.
		// Component-local entries remain the tuple prefix the helpers destructure;
		// any appended import witnesses are comparison-only.
		depEligible,
		itemMemoWitnesses,
		itemMemoFlags,
		autoMemoDeps,
		autoMemoWitnesses,
		autoMemoContextAware,
		depNames: runtimeDepNames,
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
	if (node.type === 'FoldedDirective') return true;
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
