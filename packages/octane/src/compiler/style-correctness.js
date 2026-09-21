/**
 * CSS correctness diagnostics for authored `<style>` blocks (typed native
 * styling, unit U2). One read-only pass over the analyzed parser AST emits
 * collected `CompileDiagnostic`s for:
 *
 * - `octane-css-unknown-property` (error): a declaration whose property is not
 *   in the `mdn-data` registry. Custom properties (`--*`) and vendor-prefixed
 *   names are exempt. Declarations that are at-rule descriptors (`@font-face`,
 *   `@property`, …) are not checked — they are not property declarations.
 * - `octane-css-shorthand-longhand-clash` (error when the co-match is
 *   provable — equal or subsuming subjects in the same condition context —
 *   warning otherwise): two declarations whose write sets overlap such that
 *   one declaration silently resets everything the other sets wherever both
 *   can apply to the same element — the merged-styles `border` vs
 *   `border-top-color` failure. Cascade direction is honored: the idiomatic
 *   longhand-after-shorthand refinement is not a clash, and
 *   specificity/`!important`/`@layer` differences decide the real winner
 *   rather than source order alone. Pairs are evaluated inside one block,
 *   between rules of one sheet, and across statically resolved same-module
 *   `apply` edges and nested scope chains. Speculative co-matches (distinct
 *   classes that markup *could* combine) and pairs split across conditional
 *   at-rules (`@media`/`@supports` resets are usually deliberate) downgrade
 *   to warning.
 * - `octane-css-unused-selector` (warning): a selector `pruneCss` marks as
 *   matching no element in its scope — the compile-time surface for the
 *   `(unused)` comments render emits. `:global` selectors and blocks, theme
 *   sheets, and designed class-map pruning never warn; dynamic `<{expr}>`
 *   maybe-matches count as matches.
 * - `octane-style-unknown-class-key` (error): a member read pulls a key off a
 *   binding that resolves to a same-module `<style>` block, and the built
 *   class map (`$class` plus the standalone class selectors) has no such key —
 *   the compile-gate half of R1 (`tsrx-tsc` already rejects the same read via
 *   the literal-key emit). Bindings resolve through `createScopes` — the same
 *   machinery the analyzer's `apply` resolution uses — so shadowing behaves
 *   identically; imported bindings have an import declaration as their initial
 *   and stay unresolved here by construction (KTD2 leaves them to typecheck).
 * - `octane-style-token-undeclared` (error, `analyzeTokenContracts`): a
 *   `var(--name)` reference inside a `<style>` sheet is claimed by a resolved
 *   token contract — `--name` starts with the contract's `--{prefix}-`
 *   namespace — but the contract does not declare it (R5). References outside
 *   every namespace stay legal legacy; a contract the host resolves to `null`
 *   (claimed but unreadable) warns `octane-style-token-contract-unresolved`
 *   at the import specifier instead of checking silently.
 *
 * Pruning runs on analyzer-owned clones (the adopted AST may be frozen), using
 * the same `collectPrunableElements` + `analyzeCss` + `pruneCss` pipeline the
 * codegen pass applies, so `compile()` and `compileToVolarMappings()` report
 * identical results. Nothing here feeds codegen; output bytes are unaffected.
 *
 * Suppression: `octane-ignore <code…>` in a comment suppresses the named
 * diagnostics of this pass (a bare `octane-ignore` suppresses them all). A
 * `//` or `/* *\/` JS comment applies to the next AST node after it — put it
 * above a `<style>` block (or any containing element/statement) to suppress
 * that range. A `/* octane-ignore … *\/` comment inside a sheet's CSS applies
 * to the next rule or declaration after it.
 */

import {
	analyzeCss,
	clone_ast_node as cloneAstNode,
	createScopeRoot,
	createScopes,
	createStyleClassMapFromStylesheet,
	prepareStylesheetForRender,
	pruneCss,
	ScopeRoot,
} from '@tsrx/core';
import cssProperties from 'mdn-data/css/properties.json' with { type: 'json' };
import { collectPrunableElements, isFloatStyleResource } from './style-scopes.js';
import {
	findTokenContractImportRequests,
	sourceMayReferenceTokens,
	TOKEN_REFERENCE_ALL,
} from './token-contracts.js';

export const UNKNOWN_PROPERTY = 'octane-css-unknown-property';
export const SHORTHAND_LONGHAND_CLASH = 'octane-css-shorthand-longhand-clash';
export const UNUSED_SELECTOR = 'octane-css-unused-selector';
export const UNKNOWN_CLASS_KEY = 'octane-style-unknown-class-key';
export const UNDECLARED_TOKEN = 'octane-style-token-undeclared';
export const UNRESOLVED_TOKEN_CONTRACT = 'octane-style-token-contract-unresolved';

// --- property registry --------------------------------------------------------

const KNOWN_PROPERTIES = new Set(Object.keys(cssProperties));
const VENDOR_PREFIXED = /^-[a-z]+-/i;

/** `all` resets every standard property except `direction`/`unicode-bidi`. */
const ALL_WRITE_SET = new Set(
	Object.keys(cssProperties).filter((name) => name !== 'direction' && name !== 'unicode-bidi'),
);

const writeSets = new Map();

/**
 * The properties a declaration writes: itself plus the transitive expansion of
 * `mdn-data`'s `computed` shorthand entries. `all` expands to every standard
 * property (`direction`/`unicode-bidi`/custom properties excepted per spec).
 */
function propertyWriteSet(property) {
	const key = property.toLowerCase();
	if (key === 'all') return ALL_WRITE_SET;
	let set = writeSets.get(key);
	if (set === undefined) {
		set = new Set();
		expandWriteSet(key, set, new Set());
		writeSets.set(key, set);
	}
	return set;
}

function expandWriteSet(name, out, seen) {
	if (seen.has(name)) return;
	seen.add(name);
	out.add(name);
	const computed = cssProperties[name]?.computed;
	if (Array.isArray(computed)) {
		for (const sub of computed) expandWriteSet(sub, out, seen);
	}
}

function isKnownProperty(property) {
	const name = property.toLowerCase();
	return KNOWN_PROPERTIES.has(name) || name.startsWith('--') || VENDOR_PREFIXED.test(name);
}

function levenshtein(a, b) {
	const row = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let previous = row[0];
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const next = row[j];
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
			previous = next;
		}
	}
	return row[b.length];
}

function closestProperty(property) {
	const name = property.toLowerCase();
	let best = null;
	let bestDistance = Math.max(2, Math.floor(name.length / 3));
	for (const candidate of KNOWN_PROPERTIES) {
		if (candidate[0] !== name[0]) continue;
		const distance = levenshtein(name, candidate);
		if (distance <= bestDistance && (best === null || distance < bestDistance)) {
			best = candidate;
			bestDistance = distance;
		}
	}
	return best;
}

// --- source positions ---------------------------------------------------------

const LINE_BREAK = /[\n\r\u2028\u2029]/;

function positionAt(source, offset) {
	let line = 1;
	let column = 0;
	for (let index = 0; index < offset; index++) {
		if (LINE_BREAK.test(source[index])) {
			line++;
			column = 0;
			if (source[index] === '\r' && source[index + 1] === '\n') index++;
		} else {
			column++;
		}
	}
	return { offset, line, column };
}

function fileRange(source, start, end) {
	return { start: positionAt(source, start), end: positionAt(source, end) };
}

/**
 * A sheet-relative range mapped into file positions. `sheetStart` is the file
 * offset of the sheet body's first character — `sheet.sourceStart` when the
 * parser recorded it, otherwise the `<style>` opening tag's end (the body
 * starts there by construction).
 */
function cssRange(source, sheetStart, start, end) {
	return fileRange(source, sheetStart + start, sheetStart + end);
}

// --- AST traversal ------------------------------------------------------------

const SKIP_KEYS = new Set(['loc', 'start', 'end', 'parent', 'metadata', 'css', 'leadingComments']);
const FUNCTION_TYPES = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
]);

function isFunctionNode(node) {
	return node != null && FUNCTION_TYPES.has(node.type);
}

function isStyleHostElement(node) {
	const name = node?.openingElement?.name;
	return name?.type === 'JSXIdentifier' && name.name === 'style';
}

function stylesheetOf(block) {
	return (block.children || []).find((child) => child?.type === 'StyleSheet') ?? null;
}

function ownBlocks(children) {
	return children.filter((node) => node?.type === 'JSXStyleElement' && !isFloatStyleResource(node));
}

/**
 * Discover every `<style>` block and every template scope (a children list
 * holding standalone blocks), mirroring the codegen pass's scope semantics:
 * scopes push while walking the list's non-block items and reset at function
 * boundaries. Read-only.
 *
 * @returns {{ blocks: object[], scopes: object[] }}
 */
function discoverStyle(ast) {
	/** @type {object[]} */
	const blocks = [];
	/** @type {object[]} */
	const scopes = [];
	/** @type {object[]} */
	const scopeStack = [];

	const addBlock = (node, kind, scope) => {
		const sheet = stylesheetOf(node);
		const info = {
			node,
			sheet,
			kind, // 'scope' | 'theme' | 'class-map' | 'float' | 'other'
			scope,
			// File offset of the sheet body's first character.
			sheetStart: sheet ? (sheet.sourceStart ?? node.openingElement?.end ?? 0) : 0,
			clone: null,
			deadRules: null,
			decls: null,
		};
		blocks.push(info);
		return info;
	};

	const visitChildren = (children) => {
		const own = ownBlocks(children);
		if (own.length === 0) {
			for (const child of children) visit(child);
			return;
		}
		const scope = {
			blocks: [],
			items: children.filter((child) => !own.includes(child)),
			parents: scopeStack.slice(),
		};
		scopes.push(scope);
		for (const block of own) {
			scope.blocks.push(addBlock(block, 'scope', scope));
		}
		scopeStack.push(scope);
		try {
			for (const child of children) {
				if (own.includes(child)) continue;
				visit(child);
			}
		} finally {
			scopeStack.pop();
		}
	};

	const visit = (node) => {
		if (node === null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const item of node) visit(item);
			return;
		}
		if (typeof node.type !== 'string') return;
		switch (node.type) {
			case 'JSXElement':
			case 'JSXFragment': {
				if (isStyleHostElement(node)) return; // <style>{expr}</style>: not a block
				visit(node.openingElement);
				visitChildren(node.children ?? []);
				return;
			}
			case 'JSXStyleElement': {
				// Reached outside a children list: an assigned block (or a
				// statement-position block the analyzer already reports).
				const kind =
					node.metadata?.styleKind === 'theme' || node.metadata?.styleKind === 'class-map'
						? node.metadata.styleKind
						: 'other';
				addBlock(node, kind, null);
				return;
			}
		}
		if (isFunctionNode(node)) {
			// A function boundary hosts its own scopes; enclosing scopes do not
			// stamp its elements.
			const saved = scopeStack.splice(0);
			try {
				for (const key of Object.keys(node)) {
					if (SKIP_KEYS.has(key)) continue;
					visit(node[key]);
				}
			} finally {
				scopeStack.push(...saved);
			}
			return;
		}
		for (const key of Object.keys(node)) {
			if (SKIP_KEYS.has(key)) continue;
			const value = node[key];
			if (value !== null && typeof value === 'object') visit(value);
		}
	};

	visit(ast);
	return { blocks, scopes };
}

// --- pruning ------------------------------------------------------------------

/**
 * Reproduce the codegen pass's pruning on analyzer-owned clones: scope sheets
 * are matched against the scope's cloned items; class-map sheets get their
 * designed-pruning marks; theme/float/other sheets keep every selector.
 */
function computeMatchMarks(scopes, blocks) {
	for (const scope of scopes) {
		const bodied = scope.blocks.filter((block) => block.sheet);
		if (bodied.length === 0) continue;
		const scopeItems = cloneAstNode(scope.items);
		const elements = collectPrunableElements(scopeItems, [], [createScopeRoot(scopeItems)]);
		const hash = bodied[0].node.metadata?.styleScopeHash || bodied[0].sheet.hash || null;
		for (const block of bodied) {
			const clone = cloneAstNode(block.sheet);
			clone.hash = hash;
			try {
				analyzeCss(clone, { errors: [] });
				const regionHash = block.node.metadata?.styleScopeHash || block.sheet.hash;
				for (const element of elements) {
					pruneCss(clone, element, new Map(), new Map(), regionHash);
				}
			} catch {
				// A recovered/malformed sheet (loose parsing in the editor) must not
				// break diagnostics; codegen reports the underlying problem itself.
				continue;
			}
			block.clone = clone;
		}
	}
	for (const block of blocks) {
		if (block.kind !== 'class-map' || !block.sheet) continue;
		const clone = cloneAstNode(block.sheet);
		clone.hash = block.node.metadata?.styleScopeHash || block.sheet.hash;
		try {
			analyzeCss(clone, { errors: [] });
			prepareStylesheetForRender(clone, 'class-map');
		} catch {
			continue;
		}
		block.clone = clone;
	}
}

/**
 * Rule-keyed liveness from the pruning clone, mirroring the renderer: a rule
 * whose prelude has no used selector renders as `(unused)`, and everything
 * inside a dead rule or a `:global` block is unreachable/kept as authored.
 *
 * @returns {Map<number, boolean> | null} rule start offset → is dead
 */
function deadRuleMap(clone) {
	if (clone == null) return null;
	/** @type {Map<number, boolean>} */
	const dead = new Map();
	const visit = (children, deadAncestor, inGlobalBlock, inKeyframes) => {
		for (const child of children ?? []) {
			if (child?.type === 'Rule') {
				if (inKeyframes) continue;
				if (child.metadata?.is_global_block || inGlobalBlock) {
					dead.set(child.start, false);
					visit(child.block?.children, false, true, false);
					continue;
				}
				const used = child.prelude?.children?.some((cs) => cs.metadata?.used) === true;
				const isDead = deadAncestor || !used;
				dead.set(child.start, isDead);
				visit(child.block?.children, isDead, false, false);
			} else if (child?.type === 'Atrule') {
				const name = (child.name ?? '').replace(/^-[a-z]+-/i, '');
				visit(child.block?.children, deadAncestor, inGlobalBlock, name === 'keyframes');
			}
		}
	};
	visit(clone.children, false, false, false);
	return dead;
}

// --- selectors ----------------------------------------------------------------

/**
 * Subject constraints of a complex selector's last relative selector (plus the
 * enclosing rule's subject where `&` resolves to it). `:global(...)` args
 * contribute their inner constraints; `:not(...)` args contribute negations.
 * Co-match approximation: two selectors can hit the same element unless their
 * subjects contradict on tag, id, or a positive/negated name — combinators and
 * pseudo-states do not disprove co-matching.
 */
function complexSelectorContexts(complexSelector, parentContexts, sheetSource) {
	const last = complexSelector.children[complexSelector.children.length - 1];
	const ownSpec = chainSpecificity(complexSelector.children);
	const ownSubject = readSubject(last, sheetSource);
	const hasNesting = last?.selectors?.some((s) => s.type === 'NestingSelector') === true;
	if (!parentContexts?.length) {
		return [{ spec: ownSpec, subject: ownSubject }];
	}
	const out = [];
	for (const parent of parentContexts) {
		out.push({
			// Every nested selector's rendered specificity includes the parent's.
			spec: [parent.spec[0] + ownSpec[0], parent.spec[1] + ownSpec[1], parent.spec[2] + ownSpec[2]],
			subject: hasNesting ? mergeSubject(parent.subject, ownSubject) : ownSubject,
		});
	}
	return out;
}

function emptySubject() {
	return {
		types: new Set(),
		ids: new Set(),
		classes: new Set(),
		negTypes: new Set(),
		negIds: new Set(),
		negClasses: new Set(),
		pseudos: new Set(),
	};
}

function mergeSubject(a, b) {
	return {
		types: new Set([...a.types, ...b.types]),
		ids: new Set([...a.ids, ...b.ids]),
		classes: new Set([...a.classes, ...b.classes]),
		negTypes: new Set([...a.negTypes, ...b.negTypes]),
		negIds: new Set([...a.negIds, ...b.negIds]),
		negClasses: new Set([...a.negClasses, ...b.negClasses]),
		pseudos: new Set([...a.pseudos, ...b.pseudos]),
	};
}

function readSubject(relativeSelector, sheetSource) {
	const subject = emptySubject();
	if (!relativeSelector) return subject;
	for (const selector of relativeSelector.selectors ?? []) {
		switch (selector.type) {
			case 'PseudoElementSelector': {
				// Distinct pseudo-elements are distinct boxes — `::before` never
				// co-matches `::after`, and `::view-transition-old(.a)` never
				// co-matches `::view-transition-old(.b)`. The AST drops the arg
				// list, so recover it from the source span between this
				// selector's end and the relative selector's end; a bare `*`
				// (or no arg at all) is the universal key.
				let arg = '';
				if (sheetSource) {
					const rest = sheetSource.slice(selector.end ?? 0, relativeSelector.end ?? 0);
					const match = /^\s*\(([^)]*)\)/.exec(rest);
					arg = match ? match[1].trim().replace(/\s+/g, ' ') : '';
				}
				subject.pseudos.add(`${selector.name}:${arg === '*' ? '' : arg}`);
				break;
			}
			case 'TypeSelector':
				if (selector.name !== '*') subject.types.add(selector.name.toLowerCase());
				break;
			case 'IdSelector':
				subject.ids.add(selector.name);
				break;
			case 'ClassSelector':
				subject.classes.add(selector.name);
				break;
			case 'PseudoClassSelector':
				if (selector.name === 'global' && selector.args) {
					for (const arg of selector.args.children ?? []) {
						const inner = arg.children?.[arg.children.length - 1];
						if (inner) mergeInto(subject, readSubject(inner, sheetSource));
					}
				} else if (selector.name === 'not' && selector.args) {
					for (const arg of selector.args.children ?? []) {
						// Only the subject (last relative) is a negative constraint —
						// `:not(div .x)` still allows `div` elements.
						const rel = arg.children?.[arg.children.length - 1];
						for (const s of rel?.selectors ?? []) {
							if (s.type === 'TypeSelector' && s.name !== '*')
								subject.negTypes.add(s.name.toLowerCase());
							else if (s.type === 'IdSelector') subject.negIds.add(s.name);
							else if (s.type === 'ClassSelector') subject.negClasses.add(s.name);
						}
					}
				}
				break;
		}
	}
	return subject;
}

function mergeInto(target, extra) {
	for (const key of ['types', 'ids', 'classes', 'negTypes', 'negIds', 'negClasses', 'pseudos']) {
		for (const value of extra[key]) target[key].add(value);
	}
}

function disjoint(a, b) {
	return a.size > 0 && b.size > 0 && ![...a].some((x) => b.has(x));
}

function intersects(a, b) {
	return [...a].some((x) => b.has(x));
}

function subjectsCanCoMatch(a, b) {
	if (disjoint(a.types, b.types)) return false;
	if (disjoint(a.ids, b.ids)) return false;
	if (intersects(a.types, b.negTypes) || intersects(b.types, a.negTypes)) return false;
	if (intersects(a.ids, b.negIds) || intersects(b.ids, a.negIds)) return false;
	if (intersects(a.classes, b.negClasses) || intersects(b.classes, a.negClasses)) return false;
	// A pseudo-element box and a real element (or two different pseudo boxes)
	// are never the same node.
	if ((a.pseudos.size === 0) !== (b.pseudos.size === 0)) return false;
	if (a.pseudos.size > 0) {
		const compatible = [...a.pseudos].some((pa) =>
			[...b.pseudos].some((pb) => pseudosCompatible(pa, pb)),
		);
		if (!compatible) return false;
	}
	return true;
}

/**
 * Two `name:arg` pseudo keys may select the same box: same name and equal
 * args, or either arg universal (`::before`, `::part()`, `group(*)` key as
 * `name:`). Different names or different specific args are distinct boxes.
 */
function pseudosCompatible(a, b) {
	const [na, ...ra] = a.split(':');
	const [nb, ...rb] = b.split(':');
	const aa = ra.join(':');
	const bb = rb.join(':');
	return na === nb && (aa === bb || aa === '' || bb === '');
}

/** Every box matching `narrower`'s pseudo key also matches `wider`'s. */
function pseudoCovers(narrower, wider) {
	const [na, ...ra] = narrower.split(':');
	const [nb, ...rb] = wider.split(':');
	const aa = ra.join(':');
	const bb = rb.join(':');
	return na === nb && (bb === '' || aa === bb);
}

function subsetOf(a, b) {
	return [...a].every((x) => b.has(x));
}

/** Every element matching `narrow` also matches `wide` (wide's constraints ⊆ narrow's). */
function subjectSubsumes(narrow, wide) {
	for (const key of ['types', 'ids', 'classes', 'negTypes', 'negIds', 'negClasses']) {
		if (!subsetOf(wide[key], narrow[key])) return false;
	}
	// Pseudo keys are directional: `group:hero` is narrower than `group:`.
	for (const wp of wide.pseudos) {
		if (![...narrow.pseudos].some((np) => pseudoCovers(np, wp))) return false;
	}
	return true;
}

/**
 * Provable co-match: the same element *always* receives both declarations —
 * equal subjects, or one subject strictly narrowing the other (`.a` vs
 * `div.a`, `.a` vs `.a:not(.b)`). Distinct classes (`.card` vs `.extra`) are
 * only *possible* co-matches via markup composition (`class="card extra"`),
 * which is reported at warning severity instead.
 */
function subjectsMustCoMatch(a, b) {
	return subjectSubsumes(a, b) || subjectSubsumes(b, a);
}

/** Standard a/b/c specificity over one complex selector (authored form). */
function chainSpecificity(relativeSelectors) {
	const spec = [0, 0, 0];
	for (const relative of relativeSelectors ?? []) {
		addRelativeSpecificity(relative, spec);
	}
	return spec;
}

function addRelativeSpecificity(relative, spec) {
	for (const selector of relative.selectors ?? []) {
		switch (selector.type) {
			case 'IdSelector':
				spec[0]++;
				break;
			case 'ClassSelector':
			case 'AttributeSelector':
				spec[1]++;
				break;
			case 'TypeSelector':
				if (selector.name !== '*') spec[2]++;
				break;
			case 'PseudoElementSelector':
				spec[2]++;
				break;
			case 'PseudoClassSelector':
				if (selector.name === 'where') break;
				if (
					(selector.name === 'is' ||
						selector.name === 'not' ||
						selector.name === 'has' ||
						selector.name === 'matches' ||
						selector.name === 'global') &&
					selector.args
				) {
					let best = null;
					for (const arg of selector.args.children ?? []) {
						const inner = chainSpecificity(arg.children);
						if (best === null || compareSpec(inner, best) > 0) best = inner;
					}
					if (best) {
						spec[0] += best[0];
						spec[1] += best[1];
						spec[2] += best[2];
					}
				} else {
					spec[1]++;
				}
				break;
			case 'NestingSelector':
				// The parent's specificity is added by complexSelectorContexts.
				break;
		}
	}
}

function compareSpec(a, b) {
	return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

// --- declaration collection ---------------------------------------------------

// At-rules whose blocks hold descriptors or keyframe frames, not element rules.
const NON_RULE_ATRULES = new Set([
	'charset',
	'counter-style',
	'font-face',
	'font-feature-values',
	'font-palette-values',
	'import',
	'keyframes',
	'namespace',
	'page',
	'position-try',
	'property',
	'viewport',
]);

const IMPORTANT = /!\s*important\s*$/i;

/**
 * Ordered declaration entries of one sheet, each tagged with the selector
 * contexts of its rule. Nested rules follow their rule's declarations (CSS
 * nesting hoists declarations before nested rules in cascade order).
 */
function collectDeclarations(sheet, deadRules) {
	const entries = [];
	const visit = (children, parentContexts, layerKey, condKey) => {
		for (const child of children ?? []) {
			if (child?.type === 'Rule') {
				const contexts = (child.prelude?.children ?? []).flatMap((cs) =>
					complexSelectorContexts(cs, parentContexts, sheet?.source),
				);
				const dead = deadRules?.get(child.start) === true;
				const nested = [];
				for (const item of child.block?.children ?? []) {
					if (item?.type === 'Declaration') {
						entries.push({ node: item, contexts, dead, layerKey, condKey, rule: child });
					} else if (item?.type === 'Rule' || item?.type === 'Atrule') {
						nested.push(item);
					}
				}
				visit(nested, contexts, layerKey, condKey);
			} else if (child?.type === 'Atrule') {
				const name = (child.name ?? '').replace(/^-[a-z]+-/i, '').toLowerCase();
				if (NON_RULE_ATRULES.has(name)) continue;
				const innerKey =
					name === 'layer' ? `${layerKey}|${(child.prelude ?? '').trim()}` : layerKey;
				// Conditional at-rules (@media/@supports/@container…) gate the whole
				// block: a pair split across different conditions only clashes when
				// both conditions hold, which is usually deliberate — warning, not
				// error.
				const innerCond =
					name === 'layer' ? condKey : `${condKey}|${name}:${(child.prelude ?? '').trim()}`;
				visit(child.block?.children, parentContexts, innerKey, innerCond);
			}
		}
	};
	visit(sheet.children, null, '', '');
	return entries;
}

// --- checks -------------------------------------------------------------------

function checkUnknownProperties(source, filename, sheet, sheetStart, diagnostics) {
	const visit = (children) => {
		for (const child of children ?? []) {
			if (child?.type === 'Rule') {
				for (const item of child.block?.children ?? []) {
					if (item?.type === 'Declaration') checkDeclaration(item);
				}
				visit(child.block?.children);
			} else if (child?.type === 'Atrule') {
				const name = (child.name ?? '').replace(/^-[a-z]+-/i, '').toLowerCase();
				if (NON_RULE_ATRULES.has(name)) continue;
				visit(child.block?.children);
			}
		}
	};
	const checkDeclaration = (decl) => {
		const property = decl.property;
		if (!property || isKnownProperty(property)) return;
		const suggestion = closestProperty(property);
		const range = cssRange(source, sheetStart, decl.start, decl.start + property.length);
		diagnostics.push({
			code: UNKNOWN_PROPERTY,
			severity: 'error',
			filename,
			start: range.start,
			end: range.end,
			message:
				`[${UNKNOWN_PROPERTY}] Unknown CSS property '${property}'.` +
				(suggestion ? ` Did you mean '${suggestion}'?` : ''),
			suggestions: suggestion ? [{ ...range, attribute: suggestion }] : [],
		});
	};
	visit(sheet.children);
}

/**
 * Cascade contexts: sheets whose rules can land on the same elements — a scope
 * chain's own sheets plus every block's transitive same-module `apply` targets,
 * ordered by the owning block's position (emission order is lexical pre-order).
 */
function buildContexts(scopes, blocks) {
	const contexts = [];
	const applyClosure = (blockNode) => {
		const found = [];
		const seen = new Set([blockNode]);
		const queue = [blockNode];
		while (queue.length > 0) {
			const current = queue.shift();
			for (const resolution of current.metadata?.styleApplies ?? []) {
				const target = resolution.target;
				if (!target || seen.has(target)) continue;
				seen.add(target);
				queue.push(target);
				found.push(target);
			}
		}
		return found;
	};
	const byNode = new Map(blocks.map((block) => [block.node, block]));

	for (const scope of scopes) {
		const chain = [...scope.parents, scope];
		const members = new Set();
		for (const entry of chain) {
			for (const block of entry.blocks) {
				members.add(block);
				for (const target of applyClosure(block.node)) {
					const info = byNode.get(target);
					if (info) members.add(info);
				}
			}
		}
		contexts.push([...members].sort((a, b) => (a.node.start ?? 0) - (b.node.start ?? 0)));
	}
	for (const block of blocks) {
		if (block.kind === 'scope') continue;
		const members = new Set([block]);
		for (const target of applyClosure(block.node)) {
			const info = byNode.get(target);
			if (info) members.add(info);
		}
		contexts.push([...members].sort((a, b) => (a.node.start ?? 0) - (b.node.start ?? 0)));
	}
	return contexts;
}

/**
 * Whether the shorthand-side winner's write set completely covers the loser's.
 * `writes(D) ⊇ writes(L)` means every property the earlier/other declaration
 * sets is reset by the winner wherever both selectors match.
 */
function coversWrites(winner, loser) {
	const winnerSet = propertyWriteSet(winner.prop);
	for (const prop of loser.writes) {
		if (!winnerSet.has(prop)) return false;
	}
	return true;
}

function checkClashes(source, filename, blocks, scopes, diagnostics) {
	const contexts = buildContexts(scopes, blocks);
	const seenPairs = new Set();
	for (const context of contexts) {
		/** @type {object[]} */
		const decls = [];
		for (const block of context) {
			if (!block.sheet) continue;
			if (block.decls === null) {
				block.decls = collectDeclarations(block.sheet, deadRuleMap(block.clone)).map((entry) => ({
					...entry,
					sheet: block.sheet,
					sheetStart: block.sheetStart,
					prop: entry.node.property.toLowerCase(),
					writes: propertyWriteSet(entry.node.property),
					important: IMPORTANT.test(entry.node.value ?? ''),
				}));
			}
			decls.push(...block.decls);
		}
		for (let i = 0; i < decls.length; i++) {
			const earlier = decls[i];
			if (earlier.dead || earlier.prop.startsWith('--')) continue;
			for (let j = i + 1; j < decls.length; j++) {
				const later = decls[j];
				if (later.dead || later.prop.startsWith('--') || earlier.prop === later.prop) continue;
				if (earlier.layerKey !== later.layerKey) continue;
				// Node starts are sheet-relative; file offsets make the pair unique.
				const pairKey = `${earlier.sheetStart + earlier.node.start}:${later.sheetStart + later.node.start}`;
				if (seenPairs.has(pairKey)) continue;
				seenPairs.add(pairKey);
				evaluatePair(earlier, later, source, filename, diagnostics);
			}
		}
	}
}

function evaluatePair(earlier, later, source, filename, diagnostics) {
	for (const s1 of earlier.contexts) {
		for (const s2 of later.contexts) {
			if (!subjectsCanCoMatch(s1.subject, s2.subject)) continue;
			// The cascade winner between these two declarations for elements both
			// selectors match: !important first, then specificity, then order
			// (later is later by construction of the pair iteration).
			let winner;
			if (earlier.important !== later.important) {
				winner = earlier.important ? earlier : later;
			} else {
				const cmp = compareSpec(s2.spec, s1.spec);
				winner = cmp < 0 ? earlier : later;
			}
			const loser = winner === earlier ? later : earlier;
			if (winner.prop !== loser.prop && coversWrites(winner, loser)) {
				// Reset-then-restitute is harmless: when the winning rule itself
				// redeclares the losing property after the shorthand (`:hover {
				// background: …; background-clip: padding-box; }`), nothing is
				// silently lost where the winner applies.
				const restated = (winner.rule?.block?.children ?? []).some(
					(item) =>
						item !== loser.node &&
						item?.type === 'Declaration' &&
						item.start > winner.node.start &&
						item.property?.toLowerCase() === loser.prop &&
						(!winner.important || IMPORTANT.test(item.value ?? '')),
				);
				if (restated) return;
				reportClash(
					winner,
					loser,
					subjectsMustCoMatch(s1.subject, s2.subject) && winner.condKey === loser.condKey,
					source,
					filename,
					diagnostics,
				);
				return; // one diagnostic per declaration pair
			}
		}
	}
}

function reportClash(winner, loser, provable, source, filename, diagnostics) {
	const winnerRange = cssRange(
		source,
		winner.sheetStart,
		winner.node.start,
		winner.node.start + winner.node.property.length,
	);
	const loserRange = cssRange(source, loser.sheetStart, loser.node.start, loser.node.end);
	diagnostics.push({
		code: SHORTHAND_LONGHAND_CLASH,
		severity: provable ? 'error' : 'warning',
		filename,
		start: winnerRange.start,
		end: winnerRange.end,
		message:
			`[${SHORTHAND_LONGHAND_CLASH}] '${winner.node.property}' shadows '${loser.node.property}' ` +
			`(line ${loserRange.start.line})` +
			(provable
				? ` on every element both declarations reach — the shorthand ` +
					`resets every value '${loser.node.property}' sets. Remove it or narrow it to a longhand.`
				: ` wherever both selectors match — possible on elements carrying both ` +
					`classes or under a matching condition. If intentional, suppress with ` +
					`/* octane-ignore ${SHORTHAND_LONGHAND_CLASH} */.`),
		suggestions: [{ ...loserRange, attribute: loser.node.property }],
	});
}

/**
 * Whether a complex selector names a class or id — the stale-name case this
 * warning exists for. A dead rule built only of type/pseudo selectors (say
 * `div:hover`) is structural: it stays silent rather than warning about a
 * selector the author may intend for markup that appears later. Class/id
 * names inside pseudo args (`.a:not(.b)`) count.
 */
function hasNamedSelector(complexSelector) {
	const stack = [complexSelector];
	while (stack.length > 0) {
		for (const rel of stack.pop().children ?? []) {
			for (const sel of rel.selectors ?? []) {
				if (sel.type === 'ClassSelector' || sel.type === 'IdSelector') return true;
				// Pseudo args hold their own complex selectors (`:is(.a, .b)`).
				if (sel.args) stack.push(...(sel.args.children ?? []));
			}
		}
	}
	return false;
}

function checkUnusedSelectors(source, filename, block, diagnostics) {
	const clone = block.clone;
	if (clone == null) return;
	const sheet = block.sheet;
	const sheetStart = block.sheetStart;
	const report = (node, label) => {
		const range = cssRange(source, sheetStart, node.start, node.end);
		diagnostics.push({
			code: UNUSED_SELECTOR,
			severity: 'warning',
			filename,
			start: range.start,
			end: range.end,
			message:
				`[${UNUSED_SELECTOR}] Selector ${label} matches nothing in this scope — ` +
				`it only survives as an \`(unused)\` comment in the emitted CSS.`,
			suggestions: [],
		});
	};
	// Unused selectors inside pseudo args (e.g. `:is(.a, .dead)`) are commented
	// by the renderer too; recurse the prelude so they surface identically.
	const checkSelectorList = (list, inGlobal) => {
		for (const cs of list.children ?? []) {
			if (cs.metadata?.used === false && !inGlobal && hasNamedSelector(cs)) {
				report(cs, sheetSourceText(sheet, cs));
			}
			for (const rel of cs.children ?? []) {
				for (const sel of rel.selectors ?? []) {
					if (sel.type === 'PseudoClassSelector' && sel.args) {
						checkSelectorList(sel.args, inGlobal || sel.name === 'global');
					}
				}
			}
		}
	};
	const visit = (children, inGlobalBlock, inKeyframes) => {
		for (const child of children ?? []) {
			if (child?.type === 'Rule') {
				if (inKeyframes) continue;
				if (child.metadata?.is_global_block || inGlobalBlock) {
					visit(child.block?.children, true, false);
					continue;
				}
				const used = child.prelude?.children?.some((cs) => cs.metadata?.used) === true;
				if (!used) {
					if (child.prelude?.children?.some(hasNamedSelector)) {
						report(child.prelude ?? child, sheetSourceText(sheet, child.prelude ?? child));
					}
					continue; // the whole rule is commented out — nested rules are inside
				}
				checkSelectorList(child.prelude, false);
				visit(child.block?.children, false, false);
			} else if (child?.type === 'Atrule') {
				const name = (child.name ?? '').replace(/^-[a-z]+-/i, '');
				visit(child.block?.children, inGlobalBlock, name === 'keyframes');
			}
		}
	};
	visit(clone.children, false, false);
}

function sheetSourceText(sheet, node) {
	return `'${sheet.source.slice(node.start, node.end).trim()}'`;
}

// --- class-map key reads --------------------------------------------------------

/**
 * Wrappers a member chain may sit inside without changing what it reads —
 * `(theme).dark`, `theme?.dark`, `(theme as T).dark`.
 */
const TRANSPARENT_WRAPPERS = new Set([
	'ChainExpression',
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);

/**
 * Whether `path` (a binding reference's ancestors, root-first) passes through
 * a `<style>` element's `apply` attribute: keys read there resolve through the
 * analyzer's own `apply` machinery, which reports `tsrx-style-apply-target`
 * for anything that is not a style block — a second opinion here would only
 * double-report. An `apply` attribute on a non-style element is just markup;
 * reads inside it are still checked.
 */
function isApplyRead(path) {
	for (let i = 2; i < path.length; i++) {
		const attribute = path[i];
		if (
			attribute?.type === 'JSXAttribute' &&
			attribute.name?.type === 'JSXIdentifier' &&
			attribute.name.name === 'apply' &&
			path[i - 2]?.type === 'JSXStyleElement'
		) {
			return true;
		}
	}
	return false;
}

/** The key a member expression reads, or `null` for a dynamic/unnamed read. */
function memberReadKey(member) {
	if (!member.computed && member.property?.type === 'Identifier') return member.property.name;
	if (
		member.computed &&
		member.property?.type === 'Literal' &&
		typeof member.property.value === 'string'
	) {
		return member.property.value;
	}
	return null;
}

/**
 * The `name` property's value of a module-local object literal — the same
 * lookup the analyzer's `resolve_local_member` performs for `apply={obj.name}`.
 */
function objectPropertyValue(object, name) {
	for (const property of object.properties ?? []) {
		if (property?.type !== 'Property' || property.computed) continue;
		const key = property.key;
		if (
			(key?.type === 'Identifier' && key.name === name) ||
			(key?.type === 'Literal' && key.value === name)
		) {
			return property.value;
		}
	}
	return undefined;
}

/**
 * The keys a style block's class map exposes, read off the ObjectExpression
 * `createStyleClassMapFromStylesheet` builds — `$class` first, then the
 * standalone class selectors — mirroring `lowerAssignedStyle`'s clone pipeline
 * exactly (`get_style_class_map_names` is not exported from @tsrx/core, and
 * its exports map blocks deep imports). A body-less `<style apply={…} />`
 * bundle maps to `$class` alone. Returns `null` for a sheet that fails to
 * analyze (loose-parse recovery — codegen owns reporting it).
 */
function classMapKeysOf(styleNode, cache) {
	let keys = cache.get(styleNode);
	if (keys !== undefined) return keys;
	keys = null;
	const sheet = (styleNode.children || []).find((child) => child?.type === 'StyleSheet');
	if (!sheet) {
		keys = new Set(['$class']);
	} else {
		const clone = cloneAstNode(sheet);
		clone.hash = styleNode.metadata?.styleScopeHash || sheet.hash;
		try {
			analyzeCss(clone);
			prepareStylesheetForRender(
				clone,
				styleNode.metadata?.styleKind === 'theme' ? 'theme' : 'class-map',
			);
			keys = new Set();
			for (const property of createStyleClassMapFromStylesheet(clone, {}).properties) {
				const key = property.key?.value ?? property.key?.name;
				if (typeof key === 'string') keys.add(key);
			}
		} catch {
			keys = null;
		}
	}
	cache.set(styleNode, keys);
	return keys;
}

function closestClassKey(key, keys) {
	let best = null;
	let bestDistance = Math.max(2, Math.floor(key.length / 3));
	for (const candidate of keys) {
		if (candidate[0] !== key[0]) continue;
		const distance = levenshtein(key, candidate);
		if (distance <= bestDistance && (best === null || distance < bestDistance)) {
			best = candidate;
			bestDistance = distance;
		}
	}
	return best;
}

/**
 * Walk the member chain above a bound identifier (`theme` of `theme.dark`).
 * `value` is what the expression resolves to: a style block makes the next
 * member read a class-map key read; a module-local object literal descends
 * into the named property (`maps.dark.$class` reads a key off `maps.dark`'s
 * block). Anything else — strings, calls, unresolvable initials — ends the
 * chain silently.
 */
function checkKeyReadChain(node, path, initial, keyCache, source, filename, diagnostics) {
	if (isApplyRead(path)) return;
	let value = initial;
	let child = node;
	let i = path.length - 1;
	for (;;) {
		while (i >= 0 && TRANSPARENT_WRAPPERS.has(path[i].type)) {
			child = path[i];
			i--;
		}
		const member = i >= 0 ? path[i] : null;
		if (member?.type !== 'MemberExpression' || member.object !== child) return;
		const key = memberReadKey(member);
		if (key === null || typeof member.property?.start !== 'number') return;
		if (value.type === 'JSXStyleElement') {
			const keys = classMapKeysOf(value, keyCache);
			if (keys === null || keys.has(key)) return;
			reportUnknownClassKey(member, key, keys, source, filename, diagnostics);
			return;
		}
		const next = objectPropertyValue(value, key);
		if (next?.type !== 'JSXStyleElement' && next?.type !== 'ObjectExpression') return;
		value = next;
		child = member;
		i--;
	}
}

function reportUnknownClassKey(member, key, keys, source, filename, diagnostics) {
	const objectText =
		typeof member.object.start === 'number'
			? source.slice(member.object.start, member.object.end)
			: 'style map';
	const range = fileRange(source, member.property.start, member.property.end);
	const suggestion = closestClassKey(key, keys);
	const provided = [...keys].map((name) => `'${name}'`).join(', ');
	diagnostics.push({
		code: UNKNOWN_CLASS_KEY,
		severity: 'error',
		filename,
		start: range.start,
		end: range.end,
		message:
			`[${UNKNOWN_CLASS_KEY}] '${key}' is not a key of the class map '${objectText}' — ` +
			`the map provides ${provided}.` +
			(suggestion ? ` Did you mean '${suggestion}'?` : ''),
		suggestions: suggestion ? [{ ...range, attribute: suggestion }] : [],
	});
}

/**
 * R1's compile-gate half: a member expression reading a key off a binding that
 * resolves to a same-module `<style>` block is checked against the keys the
 * emitted class map provides. `createScopes` is the same scope machinery the
 * analyzer's `apply` resolution runs on, so lexical shadowing behaves
 * identically; imported bindings carry the import declaration as their
 * `initial`, so they never reach a key check here — the typecheck gate owns
 * them (KTD2).
 */
function checkClassMapKeys(ast, source, filename, diagnostics) {
	let scopes;
	try {
		scopes = createScopes(ast, new ScopeRoot(), null, {
			filename,
			collect: true,
			errors: [],
			comments: [],
		}).scopes;
	} catch {
		return; // a half-typed file in loose mode must not break diagnostics
	}
	// `scopes` maps every scope-opening node to its scope; a scope can appear
	// twice (a submodule and its body share one) — dedupe before iterating.
	const keyCache = new Map();
	for (const scope of new Set(scopes.values())) {
		for (const binding of scope.declarations.values()) {
			const initial = binding.initial;
			if (
				(initial?.type !== 'JSXStyleElement' && initial?.type !== 'ObjectExpression') ||
				isFloatStyleResource(initial)
			) {
				continue;
			}
			for (const { node, path } of binding.references) {
				checkKeyReadChain(node, path, initial, keyCache, source, filename, diagnostics);
			}
		}
	}
}

// --- token contract enforcement (U10, R5) --------------------------------------

/**
 * Whether host-supplied facts describe one well-formed contract. A `'--'`
 * namespace is well-formed but claims nothing (see the claim boundary note in
 * token-contracts.js), so it is filtered at enforcement time, not here.
 */
function isTokenContractFacts(facts) {
	return (
		facts !== null &&
		typeof facts === 'object' &&
		typeof facts.namespace === 'string' &&
		Array.isArray(facts.names)
	);
}

/**
 * Check `var(--name)` declarations of one sheet against the resolved
 * contracts. `name` is claimed by the first contract whose namespace prefixes
 * it; a claimed name missing from `names` is an undeclared-token error.
 * Declaration `start`/`end` are `sheet.source`-relative; `sheetStart` maps
 * them into file offsets (same on the authored and the Volar parse).
 */
function checkTokenReferences(source, filename, block, contracts, diagnostics) {
	const sheet = block.sheet;
	const checkDeclaration = (decl) => {
		const value = decl.value;
		if (typeof value !== 'string' || !value.includes('var(')) return;
		// The value text sits inside the declaration's own slice; indexOf keeps
		// offsets exact when the declaration carries `!important` or similar.
		const localStart = sheet.source.slice(decl.start, decl.end).indexOf(value);
		const valueStart = block.sheetStart + decl.start + Math.max(localStart, 0);
		for (const match of value.matchAll(TOKEN_REFERENCE_ALL)) {
			const name = match[1];
			const contract = contracts.find((candidate) => name.startsWith(candidate.namespace));
			if (contract === undefined || contract.names.has(name)) continue;
			const start = valueStart + match.index + match[0].length - name.length;
			const range = fileRange(source, start, start + name.length);
			const suggestion = closestClassKey(name, contract.names);
			diagnostics.push({
				code: UNDECLARED_TOKEN,
				severity: 'error',
				filename,
				start: range.start,
				end: range.end,
				message:
					`[${UNDECLARED_TOKEN}] '${name}' is not declared by the token contract ` +
					`${JSON.stringify(contract.request)} — it declares ${[...contract.names].join(', ')}.` +
					(suggestion === null ? '' : ` Did you mean '${suggestion}'?`),
				suggestions: suggestion === null ? [] : [{ ...range, attribute: suggestion }],
			});
		}
	};
	const visit = (children) => {
		for (const child of children ?? []) {
			if (child?.type === 'Declaration') checkDeclaration(child);
			else visit(child?.block?.children);
		}
	};
	visit(sheet.children);
}

/**
 * In-`<style>` token enforcement: probe each authored relative import through
 * the host's `resolveTokenContract` callback, then check claimed `var(--*)`
 * references against the resolved namespaces. No callback → silent (there is
 * no namespace table to claim against). A `null` probe warns that references
 * are unverified rather than silently passing — R5 has no typecheck fallback.
 *
 * @param {any} ast analyzed parser AST (read-only; may be frozen)
 * @param {string} source authored module source
 * @param {string} filename
 * @param {{ resolveTokenContract?: (request: string, importer: string) => unknown }} [options]
 * @returns {any[]} collected diagnostics in `native-change-diagnostics` shape
 */
export function analyzeTokenContracts(ast, source, filename, options = {}) {
	const resolve = options?.resolveTokenContract;
	if (typeof resolve !== 'function' || !sourceMayReferenceTokens(source)) return [];
	const requests = findTokenContractImportRequests(ast);
	if (requests.size === 0) return [];

	const diagnostics = [];
	/** @type {{ namespace: string, names: Set<string>, request: string }[]} */
	const contracts = [];
	let discovered = null;
	const blocksWithSheets = () => {
		discovered ??= discoverStyle(ast);
		return discovered.blocks.filter((block) => block.sheet);
	};
	const unresolved = (request, sourceNode) => {
		const range = fileRange(source, sourceNode.start ?? 0, sourceNode.end ?? 0);
		diagnostics.push({
			code: UNRESOLVED_TOKEN_CONTRACT,
			severity: 'warning',
			filename,
			start: range.start,
			end: range.end,
			message:
				`[${UNRESOLVED_TOKEN_CONTRACT}] Token contract ${JSON.stringify(request)} could not ` +
				`be resolved to facts — var(--*) token references in this file are unverified. ` +
				`Fix the contract module or the host's resolveTokenContract so they can be checked.`,
			suggestions: [],
		});
	};
	for (const [request, sourceNode] of requests) {
		const probe = resolve(request, filename);
		if (probe === null) {
			unresolved(request, sourceNode);
			continue;
		}
		if (probe === undefined) continue;
		let claimed = false;
		for (const facts of Array.isArray(probe) ? probe : [probe]) {
			if (!isTokenContractFacts(facts)) continue;
			claimed = true;
			// A '--' namespace would claim every var(--*) in the file, collapsing
			// the legacy carve-out — unprefixed contracts stay unenforced.
			if (facts.namespace.length > 2) {
				contracts.push({ namespace: facts.namespace, names: new Set(facts.names), request });
			}
		}
		// The host claimed the request but produced no usable facts — same
		// "unresolved — unverified" surface as a `null` probe.
		if (!claimed) unresolved(request, sourceNode);
	}
	if (contracts.length > 0) {
		for (const block of blocksWithSheets()) {
			checkTokenReferences(source, filename, block, contracts, diagnostics);
		}
	}
	if (diagnostics.length > 0 && source.includes('octane-ignore')) {
		const ranges = collectSuppressions(ast, source, blocksWithSheets());
		if (ranges.length > 0) {
			for (let i = diagnostics.length - 1; i >= 0; i--) {
				if (isSuppressed(diagnostics[i], ranges)) diagnostics.splice(i, 1);
			}
		}
	}
	diagnostics.sort((a, b) => a.start.offset - b.start.offset);
	return diagnostics;
}

// --- suppression --------------------------------------------------------------

const PRAGMA = /^\s*\*?\s*octane-ignore\b(.*)$/;
const JS_COMMENT = /\/\*([\s\S]*?)\*\/|\/\/[^\n]*/g;

/** Codes named by an `octane-ignore` comment body, or `null` for "all". */
function pragmaCodes(text) {
	const match = PRAGMA.exec(text);
	if (!match) return undefined;
	const codes = match[1].split(/[\s,]+/).filter((code) => code.length > 0);
	return codes.length === 0 ? null : new Set(codes);
}

/**
 * Suppression ranges: `[start, end)` file offsets a pragma applies to plus the
 * codes it names. A `/* octane-ignore … *\/` comment inside a sheet attaches to
 * the next rule, at-rule or declaration after it. A `//`/`/* *\/` comment in
 * JS or template space attaches to the next AST node after it — put it above a
 * `<style>` block (or any containing element/statement) to cover that range.
 * Comments are found by scanning the source (the authored parse only emits a
 * comments array in `collect`/`loose` mode, which `compile()` must not set);
 * matches inside sheet bodies are handled by the sheet scan, not this one.
 */
function collectSuppressions(ast, source, blocks) {
	/** @type {{ start: number, end: number, codes: Set<string> | null }[]} */
	const ranges = [];
	const sheetRanges = [];
	for (const block of blocks) {
		const sheet = block.sheet;
		if (!sheet?.source) continue;
		const sheetStart = block.sheetStart;
		sheetRanges.push([sheetStart, sheetStart + sheet.source.length]);
		const anchors = [];
		const collectAnchors = (children) => {
			for (const child of children ?? []) {
				if (child?.type === 'Rule' || child?.type === 'Atrule' || child?.type === 'Declaration') {
					anchors.push(child);
					collectAnchors(child.block?.children);
					if (child.prelude && typeof child.prelude === 'object') anchors.push(child.prelude);
				}
			}
		};
		collectAnchors(sheet.children);
		anchors.sort((a, b) => a.start - b.start);
		for (const match of sheet.source.matchAll(/\/\*([\s\S]*?)\*\//g)) {
			const codes = pragmaCodes(match[1]);
			if (codes === undefined) continue;
			const commentEnd = match.index + match[0].length;
			const target = anchors.find(
				(node) =>
					node.start >= commentEnd && /^[;\s]*$/.test(sheet.source.slice(commentEnd, node.start)),
			);
			if (!target) continue;
			ranges.push({
				start: sheetStart + target.start,
				end: sheetStart + target.end,
				codes,
			});
		}
	}
	// JS/template comments attach to the next AST node after the comment.
	const nodes = [];
	const visit = (value) => {
		if (value === null || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		if (typeof value.type !== 'string') return;
		if (typeof value.start === 'number' && typeof value.end === 'number') {
			nodes.push(value);
		}
		for (const key of Object.keys(value)) {
			if (SKIP_KEYS.has(key)) continue;
			if (value.type === 'JSXStyleElement' && key === 'children') continue;
			visit(value[key]);
		}
	};
	visit(ast);
	nodes.sort((a, b) => a.start - b.start);
	for (const match of source.matchAll(JS_COMMENT)) {
		const at = match.index;
		if (sheetRanges.some(([start, end]) => at >= start && at < end)) continue;
		const body = match[0].startsWith('//') ? match[0].slice(2) : match[1];
		const codes = pragmaCodes(body);
		if (codes === undefined) continue;
		const commentEnd = at + match[0].length;
		const target = nodes.find(
			(node) =>
				node.start >= commentEnd && /^[\s{}();,]*$/.test(source.slice(commentEnd, node.start)),
		);
		if (!target) continue;
		ranges.push({ start: target.start, end: target.end, codes });
	}
	return ranges;
}

function isSuppressed(diagnostic, ranges) {
	for (const range of ranges) {
		if (range.codes !== null && !range.codes.has(diagnostic.code)) continue;
		if (diagnostic.start.offset >= range.start && diagnostic.start.offset < range.end) {
			return true;
		}
	}
	return false;
}

// --- entry point --------------------------------------------------------------

/**
 * @param {any} ast analyzed parser AST (read-only; may be frozen)
 * @param {string} source authored module source
 * @param {string} filename
 * @param {{ styleCorrectness?: boolean }} [options]
 *   `styleCorrectness: false` disables the pass entirely.
 * @returns {any[]} collected diagnostics in `native-change-diagnostics` shape
 */
export function analyzeStyleCorrectness(ast, source, filename, options = {}) {
	if (options.styleCorrectness === false || !source.includes('<style')) return [];
	const { blocks, scopes } = discoverStyle(ast);
	if (blocks.length === 0) return [];

	computeMatchMarks(scopes, blocks);

	const diagnostics = [];
	for (const block of blocks) {
		if (block.sheet) {
			checkUnknownProperties(source, filename, block.sheet, block.sheetStart, diagnostics);
		}
	}
	checkClashes(source, filename, blocks, scopes, diagnostics);
	for (const block of blocks) {
		if (block.kind === 'scope' && block.sheet) {
			checkUnusedSelectors(source, filename, block, diagnostics);
		}
	}
	// Class-map key reads need a bound style block; standalone scope blocks
	// open no binding, so skip the scope walk when only they exist.
	if (blocks.some((block) => block.kind !== 'scope')) {
		checkClassMapKeys(ast, source, filename, diagnostics);
	}

	if (diagnostics.length > 0 && source.includes('octane-ignore')) {
		const ranges = collectSuppressions(
			ast,
			source,
			blocks.filter((block) => block.sheet),
		);
		if (ranges.length > 0) {
			for (let i = diagnostics.length - 1; i >= 0; i--) {
				if (isSuppressed(diagnostics[i], ranges)) diagnostics.splice(i, 1);
			}
		}
	}
	diagnostics.sort((a, b) => a.start.offset - b.start.offset);
	return diagnostics;
}
