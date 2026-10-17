/**
 * Splits packages/octane/src/runtime.ts into concept modules under
 * packages/octane/src/runtime/, leaving runtime.ts as a facade with the same
 * exports, and checks the split layout afterwards.
 *
 * On the split layout, the concept modules are the source of truth and only
 * `check` applies: it enforces the load rule, the order rule against the chain
 * the modules' order links form, and that every module with code keeps its
 * link (scripts/split-runtime.test.mjs runs it in ci:workflow:test).
 *
 * Everything else is migration-only and runs on a single-file runtime.ts:
 * scripts/split-runtime.map.json names the module of every top-level
 * declaration, and this tool owns the rest, so a run reproduces the split from
 * the map alone.
 *
 *   node scripts/split-runtime.mjs check          the split layout's rules, or,
 *                                                 on a single file, the map's
 *   node scripts/split-runtime.mjs split          write the facade and modules
 *   node scripts/split-runtime.mjs sorted <file>  write the single-file runtime
 *                                                 reordered into module order
 *   node scripts/split-runtime.mjs order          search the module order gzip
 *                                                 compresses best and write it
 *   node scripts/split-runtime.mjs report         module and mutable-state tables
 *   node scripts/split-runtime.mjs where <name>…  the module each name moves to
 *
 * Options: --src <runtime.ts> --map <map.json> --out <src dir> --suggest
 * --evals <n> --seeds <n> (--suggest writes the suggested module of every
 * unmapped declaration into the map and drops stale entries; --evals and
 * --seeds tune `order`'s search, see scripts/split-runtime-order.mjs).
 *
 * The split moves source text and changes no statement: each top-level
 * statement is sliced from the TypeScript AST with its leading comments, a
 * declaration another module names gains `export`, and every module gains the
 * imports it needs. Prettier formats the result. ESM forbids assigning an
 * imported binding and bundlers emit modules in evaluation order, so the map
 * must satisfy these rules, which `check` enforces:
 *
 *   write   A top-level `let` lives in the module of every function that
 *           assigns it.
 *   order   Modules evaluate in one chain: each module's first import is the
 *           module before it, and runtime.ts imports the last. The chain keeps
 *           every top-level `let`, and every primitive `const` Rolldown does
 *           not inline at link time, above each read that followed it in
 *           runtime.ts: oxc folds a never-written top-level binding, and
 *           inlines a constant, only into reads below its declaration. A read
 *           whose function keeps a writer of the binding, or one that every
 *           root factory (`rootEntries`) keeps, never folds, so it is free.
 *   load    A module-scope initializer reads only its own module's bindings,
 *           directly or through the functions it calls, so no bundler's
 *           module order (webpack skips a side-effect-free facade) reaches a
 *           binding before its declaration.
 *   pure    A load-time call to an `@__NO_SIDE_EFFECTS__` function stays in the
 *           callee's module: esbuild honors the annotation only within a file.
 *
 * The external imports keep runtime.ts's evaluation order: runtime.ts imports
 * each of its original dependencies first, in their original order, so a
 * bundle emits the same module sequence as the single file. The map's
 * `unpinned` dependencies are left out, a module with `chain: false` loads
 * only where code imports it, and `sectionComments` sends a section header
 * that leads a declaration placed elsewhere to its section's module.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import ts from 'typescript';
import { joinClientRuntime } from '../benchmarks/lib/client-runtime.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const RUNTIME = path.join(ROOT, 'packages/octane/src/runtime.ts');
export const MAP = path.join(ROOT, 'scripts/split-runtime.map.json');

const { SyntaxKind: K } = ts;

// Ambient declarations every module that names them carries its own copy of.
const AMBIENT = new Set(['process', '__OCTANE_PROFILE_ENABLED__']);

const hasModifier = (node, kind) => node.modifiers?.some((m) => m.kind === kind) ?? false;

function bindingNames(name) {
	if (ts.isIdentifier(name)) return [name.text];
	return name.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : bindingNames(e.name)));
}

function declaredNames(st) {
	if (ts.isVariableStatement(st))
		return st.declarationList.declarations.flatMap((d) => bindingNames(d.name));
	if (
		ts.isFunctionDeclaration(st) ||
		ts.isClassDeclaration(st) ||
		ts.isInterfaceDeclaration(st) ||
		ts.isTypeAliasDeclaration(st) ||
		ts.isEnumDeclaration(st) ||
		ts.isModuleDeclaration(st)
	)
		return st.name ? [st.name.text] : [];
	return [];
}

function unitKind(st) {
	if (ts.isVariableStatement(st)) {
		if (hasModifier(st, K.DeclareKeyword)) return 'declare';
		const flags = st.declarationList.flags;
		return flags & ts.NodeFlags.Let ? 'let' : flags & ts.NodeFlags.Const ? 'const' : 'var';
	}
	if (ts.isFunctionDeclaration(st)) return 'function';
	if (ts.isClassDeclaration(st)) return 'class';
	if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) return 'type';
	if (ts.isEnumDeclaration(st)) return 'enum';
	return 'statement';
}

function isFunctionLike(node) {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isConstructorDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) ||
		ts.isSetAccessorDeclaration(node)
	);
}

/** Whether `node` sits in a type position, which compiles away. */
function inTypePosition(node) {
	for (let n = node.parent; n; n = n.parent) {
		if (ts.isExpressionWithTypeArguments(n)) {
			// A class's `extends X` is a value; `implements X` and an interface's
			// `extends X` are types.
			const clause = n.parent;
			return !(
				ts.isHeritageClause(clause) &&
				clause.token === K.ExtendsKeyword &&
				ts.isClassLike(clause.parent)
			);
		}
		if (ts.isTypeNode(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n))
			return true;
		if (ts.isStatement(n) || ts.isSourceFile(n) || ts.isClassElement(n)) return false;
	}
	return false;
}

function isDestructuringTarget(literal) {
	let node = literal;
	let parent = node.parent;
	while (
		ts.isPropertyAssignment(parent) ||
		ts.isShorthandPropertyAssignment(parent) ||
		ts.isSpreadElement(parent) ||
		ts.isSpreadAssignment(parent) ||
		ts.isArrayLiteralExpression(parent) ||
		ts.isObjectLiteralExpression(parent) ||
		ts.isParenthesizedExpression(parent)
	) {
		node = parent;
		parent = parent.parent;
	}
	if (ts.isBinaryExpression(parent) && parent.left === node)
		return parent.operatorToken.kind === K.EqualsToken;
	return (
		(ts.isForOfStatement(parent) || ts.isForInStatement(parent)) && parent.initializer === node
	);
}

/** Whether identifier `id` is assigned rather than only read. */
function isWrite(id) {
	let node = id;
	let parent = node.parent;
	while (ts.isParenthesizedExpression(parent) || ts.isNonNullExpression(parent)) {
		node = parent;
		parent = parent.parent;
	}
	if (ts.isBinaryExpression(parent) && parent.left === node)
		return (
			parent.operatorToken.kind >= K.FirstAssignment &&
			parent.operatorToken.kind <= K.LastAssignment
		);
	if (
		(ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
		(parent.operator === K.PlusPlusToken || parent.operator === K.MinusMinusToken)
	)
		return true;
	if (ts.isShorthandPropertyAssignment(parent) || ts.isSpreadElement(parent))
		return isDestructuringTarget(parent.parent);
	if (ts.isPropertyAssignment(parent) && parent.initializer === node)
		return isDestructuringTarget(parent.parent);
	if (ts.isArrayLiteralExpression(parent)) return isDestructuringTarget(parent);
	return (
		(ts.isForOfStatement(parent) || ts.isForInStatement(parent)) && parent.initializer === node
	);
}

/** Identifiers that name a member or label rather than a binding. */
function isMemberName(id) {
	const p = id.parent;
	return (
		(ts.isPropertyAccessExpression(p) && p.name === id) ||
		(ts.isQualifiedName(p) && p.right === id) ||
		(ts.isBindingElement(p) && p.propertyName === id) ||
		(ts.isPropertyAssignment(p) && p.name === id) ||
		(ts.isPropertySignature(p) && p.name === id) ||
		(ts.isPropertyDeclaration(p) && p.name === id) ||
		(ts.isMethodDeclaration(p) && p.name === id) ||
		(ts.isMethodSignature(p) && p.name === id) ||
		(ts.isGetAccessorDeclaration(p) && p.name === id) ||
		(ts.isSetAccessorDeclaration(p) && p.name === id) ||
		(ts.isEnumMember(p) && p.name === id) ||
		(ts.isLabeledStatement(p) && p.label === id) ||
		((ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === id) ||
		(ts.isImportTypeNode(p) && p.qualifier === id) ||
		(ts.isTypePredicateNode(p) && p.parameterName === id)
	);
}

/**
 * Whether `node` evaluates with its module, rather than when a function body
 * runs. Method bodies, constructors and instance fields run later.
 */
function isLoadTime(node, statement) {
	if (isFunctionLike(statement)) return false;
	for (let n = node; n && n !== statement; n = n.parent) {
		if (isFunctionLike(n)) return false;
		const p = n.parent;
		if (p && ts.isPropertyDeclaration(p) && p.initializer === n && !hasModifier(p, K.StaticKeyword))
			return false;
	}
	return true;
}

/**
 * Whether a reference runs whenever its function body runs: it is not inside
 * a closure the body creates.
 */
function isDirect(node, statement) {
	for (let n = node.parent; n && n !== statement; n = n.parent) if (isFunctionLike(n)) return false;
	return true;
}

/**
 * Rolldown inlines these constants into every reader at link time, wherever
 * the declaration lands; the minifier inlines the rest only into reads below
 * their declaration.
 */
function linkerInlined(node) {
	while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) node = node.expression;
	if (node.kind === K.TrueKeyword || node.kind === K.FalseKeyword || node.kind === K.NullKeyword)
		return true;
	if (ts.isIdentifier(node)) return node.text === 'undefined';
	if (ts.isStringLiteral(node)) return node.text.length <= 3;
	const negative = ts.isPrefixUnaryExpression(node) && node.operator === K.MinusToken;
	const literal = negative ? node.operand : node;
	if (!ts.isNumericLiteral(literal)) return false;
	const value = Number(literal.text);
	return Number.isInteger(value) && `${negative ? -value : value}`.length <= 3;
}

/** Whether a top-level `const` initializer is a primitive value a minifier can inline. */
function isPrimitive(node) {
	while (
		ts.isParenthesizedExpression(node) ||
		ts.isAsExpression(node) ||
		ts.isSatisfiesExpression(node)
	)
		node = node.expression;
	if (
		ts.isNumericLiteral(node) ||
		ts.isStringLiteral(node) ||
		ts.isNoSubstitutionTemplateLiteral(node) ||
		node.kind === K.TrueKeyword ||
		node.kind === K.FalseKeyword ||
		node.kind === K.NullKeyword ||
		(ts.isIdentifier(node) && node.text === 'undefined')
	)
		return true;
	if (ts.isPrefixUnaryExpression(node)) return isPrimitive(node.operand);
	if (ts.isBinaryExpression(node))
		return isPrimitiveOperand(node.left) && isPrimitiveOperand(node.right);
	return false;
}
const isPrimitiveOperand = (node) => ts.isIdentifier(node) || isPrimitive(node);

function hasLeadingAnnotation(text, node, annotation) {
	return (ts.getLeadingCommentRanges(text, node.pos) ?? []).some((c) =>
		text.slice(c.pos, c.end).includes(annotation),
	);
}

/**
 * Statement ranges: a statement owns the trivia after the previous statement's
 * same-line trailing comment, so a leading comment travels with the
 * declaration it describes and a trailing one stays on its line.
 */
function statementRanges(sf) {
	const text = sf.text;
	const ranges = [];
	let cursor = 0;
	for (const st of sf.statements) {
		const start = cursor;
		let end = st.end;
		for (const c of ts.getTrailingCommentRanges(text, end) ?? []) end = c.end;
		if (text[end] === '\r') end++;
		if (text[end] === '\n') end++;
		ranges.push({ start, end });
		cursor = end;
	}
	return { ranges, tail: text.slice(cursor) };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Units are top-level declarations grouped by name (overloads and merged
 * declarations travel together). A statement that declares nothing is named
 * after the declaration before it, `after:<name>`. References are recorded per
 * name with their kind: a type position, an assignment, a read, and whether it
 * evaluates at module load.
 */
export function analyze(file = RUNTIME, text = fs.readFileSync(file, 'utf8')) {
	const host = ts.createCompilerHost({});
	const getSourceFile = host.getSourceFile;
	host.getSourceFile = (name, lang) =>
		path.resolve(name) === path.resolve(file)
			? ts.createSourceFile(name, text, lang, true, ts.ScriptKind.TS)
			: getSourceFile.call(host, name, lang);
	const program = ts.createProgram({
		rootNames: [file],
		options: { noResolve: true, noLib: true, types: [], target: ts.ScriptTarget.ESNext },
		host,
	});
	const checker = program.getTypeChecker();
	const sf = program.getSourceFile(file);
	const { ranges, tail } = statementRanges(sf);
	const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

	const imports = new Map(); // local -> { from, imported, typeOnly, comment }
	const dependencies = []; // { from, index } of every statement that loads a module
	const reexports = []; // ExportDeclaration statements
	const units = [];
	const unitByName = new Map();
	const unitOfStatement = new Map();
	let previousNamed = null;

	function makeUnit(id, kind, names, index, st) {
		const unit = {
			id,
			kind,
			names,
			statements: [],
			order: index,
			line: lineOf(st.getStart()),
			lines: 0,
			exported: false,
			refs: new Map(), // name -> { read, write, type, load }
			importRefs: new Map(), // import local -> { value, type }
			ambientRefs: new Set(),
			direct: new Set(), // names a call of this function reads outside closures
			directCalls: new Set(), // ... and calls
			loadCalls: new Set(), // names called at module load
			unannotatedLoadCalls: new Set(), // load-time calls without @__PURE__
			sideEffectFree: false,
			primitive: false, // a `const` of primitive values
			inlined: false, // ... that Rolldown inlines wherever it is declared
		};
		units.push(unit);
		for (const n of names) unitByName.set(n, unit);
		return unit;
	}

	sf.statements.forEach((st, index) => {
		if (ts.isImportDeclaration(st)) {
			const from = st.moduleSpecifier.text;
			const clause = st.importClause;
			const all = clause?.isTypeOnly ?? false;
			const named = clause?.namedBindings;
			const loads =
				!clause ||
				(!all &&
					(clause.name ||
						(named && ts.isNamespaceImport(named)) ||
						named?.elements.some((el) => !el.isTypeOnly)));
			if (loads && !dependencies.some((d) => d.from === from)) dependencies.push({ from, index });
			if (clause?.name)
				imports.set(clause.name.text, { from, imported: 'default', typeOnly: all, comment: '' });
			const bindings = clause?.namedBindings;
			if (bindings && ts.isNamespaceImport(bindings))
				imports.set(bindings.name.text, { from, imported: '*', typeOnly: all, comment: '' });
			else if (bindings)
				for (const el of bindings.elements) {
					const comments = ts.getLeadingCommentRanges(text, el.pos) ?? [];
					imports.set(el.name.text, {
						from,
						imported: (el.propertyName ?? el.name).text,
						typeOnly: all || el.isTypeOnly,
						comment: comments.map((c) => text.slice(c.pos, c.end)).join('\n'),
					});
				}
			return;
		}
		if (ts.isExportDeclaration(st)) {
			const from = st.moduleSpecifier?.text;
			if (from && !st.isTypeOnly && !dependencies.some((d) => d.from === from))
				dependencies.push({ from, index });
			reexports.push({ index, node: st });
			return;
		}
		const names = declaredNames(st);
		const kind = unitKind(st);
		let unit;
		if (kind === 'declare' && names.every((n) => AMBIENT.has(n))) {
			unit = makeUnit(`ambient:${names[0]}`, 'ambient', names, index, st);
		} else if (names.length === 0) {
			unit = makeUnit(`after:${previousNamed ?? '<start>'}`, kind, [], index, st);
		} else {
			unit = unitByName.get(names[0]) ?? makeUnit(names[0], kind, names, index, st);
		}
		if (names.length) previousNamed = names[names.length - 1];
		unit.statements.push(index);
		unitOfStatement.set(st, unit);
		if (hasModifier(st, K.ExportKeyword)) unit.exported = true;
		if (hasModifier(st, K.DefaultKeyword)) throw new Error(`default export: ${unit.id}`);
		if (ts.isFunctionDeclaration(st) && hasLeadingAnnotation(text, st, '@__NO_SIDE_EFFECTS__'))
			unit.sideEffectFree = true;
		if (kind === 'const') {
			const inits = st.declarationList.declarations.map((d) => d.initializer);
			unit.primitive = inits.every((i) => i && isPrimitive(i));
			unit.inlined = inits.every((i) => i && linkerInlined(i));
		}
	});
	for (const unit of units)
		for (const i of unit.statements)
			unit.lines += lineOf(ranges[i].end - 1) - lineOf(ranges[i].start) + 1;

	// The top-level statement a declaration belongs to, when it declares a
	// module-scope binding rather than a local, parameter or type parameter.
	const topOf = (decl) => {
		if (decl.parent === sf) return decl;
		if (ts.isVariableDeclaration(decl) && decl.parent.parent.parent === sf)
			return decl.parent.parent;
		if (ts.isImportSpecifier(decl)) return decl.parent.parent.parent;
		if (ts.isNamespaceImport(decl)) return decl.parent.parent;
		if (ts.isImportClause(decl)) return decl.parent;
		return null;
	};

	for (const st of sf.statements) {
		const unit = unitOfStatement.get(st);
		if (!unit) continue;
		const visit = (node) => {
			if (ts.isIdentifier(node) && !isMemberName(node)) record(node);
			ts.forEachChild(node, visit);
		};
		const record = (id) => {
			if (ts.isExportSpecifier(id.parent)) return;
			const symbol =
				ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id
					? checker.getShorthandAssignmentValueSymbol(id.parent)
					: checker.getSymbolAtLocation(id);
			const decl = symbol?.declarations?.[0];
			const top = decl && topOf(decl);
			if (!top) return;
			const type = inTypePosition(id);
			if (ts.isImportDeclaration(top)) {
				const entry = unit.importRefs.get(id.text) ?? { value: 0, type: 0 };
				entry[type ? 'type' : 'value']++;
				unit.importRefs.set(id.text, entry);
				return;
			}
			const target = unitOfStatement.get(top);
			if (!target) return;
			if (target.kind === 'ambient') {
				unit.ambientRefs.add(id.text);
				return;
			}
			if (target === unit && id === decl.name) return;
			const name = id.text;
			const entry = unit.refs.get(name) ?? { read: 0, write: 0, type: 0, load: 0 };
			if (type) entry.type++;
			else if (isWrite(id)) entry.write++;
			else entry.read++;
			unit.refs.set(name, entry);
			if (type) return;
			const call = id.parent;
			const called =
				(ts.isCallExpression(call) || ts.isNewExpression(call)) && call.expression === id;
			if (isDirect(id, st)) unit[called ? 'directCalls' : 'direct'].add(name);
			if (isLoadTime(id, st)) {
				entry.load++;
				if (called) {
					unit.loadCalls.add(name);
					if (!hasLeadingAnnotation(text, call, '@__PURE__')) unit.unannotatedLoadCalls.add(name);
				}
			}
		};
		visit(st);
		// A unit's own name in its own body is a self-reference, not an edge.
		for (const n of unit.names) {
			const self = unit.refs.get(n);
			if (self) {
				unit.selfWrite = self.write > 0;
				unit.refs.delete(n);
			}
		}
	}

	// Header: the file's first comment block, ahead of everything else.
	const firstComment = ts.getLeadingCommentRanges(text, 0)?.[0];
	const header = firstComment ? text.slice(0, firstComment.end) : '';
	return {
		file,
		text,
		sf,
		ranges,
		tail,
		header,
		units,
		unitByName,
		imports,
		dependencies,
		reexports,
	};
}

// ---------------------------------------------------------------------------
// Placement and validation
// ---------------------------------------------------------------------------

const isMutable = (u) => u.kind === 'let' || u.kind === 'var';
const isTypeOnly = (u) => u.kind === 'type' || u.kind === 'ambient' || u.kind === 'declare';

// The root factories. A binding that every one of them reaches a writer of is
// written in every rendering bundle, so the order rule does not hold its reads.
export const ROOT_ENTRIES = [
	'createRoot',
	'__createRootDefaultOptions',
	'__createVoidRoot',
	'__createVoidRootDefaultOptions',
	'hydrateRoot',
	'__hydrateVoidRoot',
	'createIndependentHydrateActivator',
];
// Modules that load only where profile-guarded code imports them.
const OFF_CHAIN = ['profile-probes'];
// Reads that already came before their binding in the single-file runtime, so
// they never folded or inlined. A new pair evaluating out of order fails the
// split check; an entry that is in order again must be removed.
const ORDER_BASELINE = new Set([
	'act > DEFERRED_SWAPS',
	'bindRendererRegionOwner > HYDRATION_PASS',
	'createdInRootRender > CURSOR',
	'createdInRootRender > PRESENTATION_HYDRATION',
	'ensureViewTransitionDriver > CURSOR',
	'finishCaptureDispatch > pendingRestores',
	'inRootHydrationAttempt > PRESENTATION_HYDRATION',
	'logHydrationMismatch > HYDRATION_PASS',
	'nativePresentationBinding > SLOT_FLAG_TEARDOWN',
	'preparePresentationSignalValue > HTML_NS',
	'presentationWrite > DANGER_HTML_ACTIVE',
	'queueRefAttach > activityRefCreated',
	'renderBlock > CURSOR',
	'seedOrCreate > HYDRATION_PASS',
	'setHostProps > DESCRIPTOR_FORM_ACTION',
	'teardownTrySlot > initialSuspenseHydrations',
	'unmountSlot > UNMOUNT_LITE_ARM',
	'useBatch > HYDRATION_PASS',
	'useSyncExternalStore > CURSOR',
	'useThenable > HYDRATION_PASS',
	'vtHostVisible > hiddenDisplayNodes',
	'vtWouldWrap > CURSOR',
	'writeDirectSignalAttribute > HTML_NS',
	'writeScalarNativeStyle > SLOT_FLAG_TEARDOWN',
]);

export function readMap(file = MAP) {
	return { rootEntries: ROOT_ENTRIES, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}

/**
 * Assigns every unit a module from the map. A unit the map does not name gets
 * a suggestion: the module of the bindings it assigns, of the functions that
 * assign it, or else of the nearest mapped declaration before it.
 */
export function place(model, map) {
	const moduleOf = new Map();
	const known = new Set(model.units.map((u) => u.id));
	const stale = [];
	for (const m of map.modules)
		for (const id of m.units) {
			if (!known.has(id)) stale.push({ id, module: m.name });
			else if (moduleOf.has(id))
				throw new Error(`${id} is mapped to both ${moduleOf.get(id)} and ${m.name}`);
			else moduleOf.set(id, m.name);
		}
	const writersOf = writerIndex(model);
	const unmapped = [];
	let previous = null;
	for (const unit of model.units) {
		if (unit.kind === 'ambient') continue;
		if (moduleOf.has(unit.id)) {
			previous = moduleOf.get(unit.id);
			continue;
		}
		let suggestion = null;
		let reason = '';
		const written = [...unit.refs].filter(([, r]) => r.write).map(([n]) => model.unitByName.get(n));
		const targets = new Set(written.map((u) => moduleOf.get(u.id)).filter(Boolean));
		if (targets.size === 1) {
			suggestion = [...targets][0];
			reason = `assigns ${written.map((u) => u.id).join(', ')}`;
		} else if (isMutable(unit)) {
			const writers = new Set((writersOf.get(unit.id) ?? []).map((w) => moduleOf.get(w.id)));
			writers.delete(undefined);
			if (writers.size === 1) {
				suggestion = [...writers][0];
				reason = 'module of its writers';
			}
		}
		if (!suggestion) {
			suggestion = previous ?? map.modules[0].name;
			reason = 'follows the declaration before it';
		}
		unmapped.push({ id: unit.id, line: unit.line, kind: unit.kind, suggestion, reason });
		moduleOf.set(unit.id, suggestion);
		previous = suggestion;
	}
	return { moduleOf, unmapped, stale };
}

function writerIndex(model) {
	const writers = new Map();
	for (const unit of model.units)
		for (const [name, r] of unit.refs)
			if (r.write) {
				const target = model.unitByName.get(name);
				if (!writers.has(target.id)) writers.set(target.id, []);
				writers.get(target.id).push(unit);
			}
	return writers;
}

/**
 * Bindings a statement reads while its module evaluates: its own load-time
 * references and everything a function it calls then reads outside closures,
 * transitively. Returns the binding units with the call path that reaches them.
 */
function loadReach(model, unit) {
	const reached = new Map();
	for (const [n, r] of unit.refs) if (r.load) reached.set(n, []);
	const queue = [...unit.loadCalls].map((n) => [n, [n]]);
	const seen = new Set();
	while (queue.length) {
		const [name, via] = queue.shift();
		const callee = model.unitByName.get(name);
		if (callee.kind !== 'function' || seen.has(callee.id)) continue;
		seen.add(callee.id);
		for (const n of callee.direct)
			if (!callee.names.includes(n) && !reached.has(n)) reached.set(n, via);
		for (const n of callee.directCalls) if (!callee.names.includes(n)) queue.push([n, [...via, n]]);
	}
	return [...reached]
		.map(([n, via]) => ({ binding: model.unitByName.get(n), via }))
		.filter(({ binding }) => binding !== unit);
}

/** Units `unit` references, transitively: what a bundle keeps once it keeps `unit`. */
function reachIndex(model) {
	const memo = new Map();
	return (unit) => {
		let set = memo.get(unit.id);
		if (set) return set;
		set = new Set();
		const stack = [unit];
		while (stack.length) {
			const u = stack.pop();
			for (const [n, r] of u.refs) {
				if (!r.read && !r.write) continue;
				const t = model.unitByName.get(n);
				if (!set.has(t.id)) {
					set.add(t.id);
					stack.push(t);
				}
			}
		}
		memo.set(unit.id, set);
		return set;
	};
}

/**
 * Pairs whose order the chain must keep. `fold`: a `let` above a later read,
 * unless keeping the reader keeps a writer, so the binding is written in every
 * bundle with the read and never folds. `inline`: a primitive `const` above a
 * later read, unless Rolldown inlines it anywhere. With `anyOrder`, a read
 * counts wherever the text puts it, so a split whose chain moved a binding
 * below its reader still yields the pair.
 */
export function orderConstraints(model, map, { anyOrder = false } = {}) {
	const writers = writerIndex(model);
	const reach = reachIndex(model);
	// What every rendering bundle keeps: the intersection of what each root
	// entry point keeps. A binding one of these assigns is written everywhere.
	let always = null;
	for (const name of map.rootEntries ?? []) {
		const entry = model.unitByName.get(name);
		if (!entry) throw new Error(`root entry ${name} is not declared`);
		const kept = new Set([entry.id, ...reach(entry)]);
		always = always ? new Set([...always].filter((id) => kept.has(id))) : kept;
	}
	always ??= new Set();
	const constraints = [];
	for (const reader of model.units)
		for (const [name, r] of reader.refs) {
			if (!r.read) continue;
			const binding = model.unitByName.get(name);
			if (binding === reader || (!anyOrder && binding.order > reader.order)) continue;
			if (isMutable(binding)) {
				const kept = reach(reader);
				const written = (writers.get(binding.id) ?? []).some(
					(w) => w === reader || kept.has(w.id) || always.has(w.id),
				);
				if (written) continue;
				constraints.push({ before: binding, after: reader, rule: 'fold', name });
			} else if (binding.primitive && !binding.inlined)
				constraints.push({ before: binding, after: reader, rule: 'inline', name });
		}
	return constraints;
}

/**
 * Validates a placement and orders its modules: the map's order where the
 * constraints allow it. Returns the evaluation chain and every violation.
 */
/** The write, pure and load rules for a placement of every unit in a module. */
function moduleRules(model, moduleOf) {
	const violations = [];
	for (const [id, writers] of writerIndex(model)) {
		const home = moduleOf.get(id);
		for (const w of writers)
			if (moduleOf.get(w.id) !== home)
				violations.push(`write: ${w.id} (${moduleOf.get(w.id)}) assigns ${id} (${home})`);
	}
	for (const unit of model.units) {
		for (const name of unit.unannotatedLoadCalls) {
			const callee = model.unitByName.get(name);
			if (callee?.sideEffectFree && moduleOf.get(callee.id) !== moduleOf.get(unit.id))
				violations.push(
					`pure: ${unit.id} calls @__NO_SIDE_EFFECTS__ ${name} at load from another module`,
				);
		}
		// A module-scope initializer reads only its own module's bindings. Every
		// bundler then evaluates them in source order, whatever order it gives
		// the modules (webpack and Rspack skip a side-effect-free facade).
		for (const { binding, via } of loadReach(model, unit))
			if (
				binding.kind !== 'function' &&
				!isTypeOnly(binding) &&
				moduleOf.get(binding.id) !== moduleOf.get(unit.id)
			)
				violations.push(
					`load: ${unit.id} (${moduleOf.get(unit.id)}) reads ${binding.id} ` +
						`(${moduleOf.get(binding.id)}) at load${via.length ? ` via ${via.join(' > ')}` : ''}`,
				);
	}
	return violations;
}

export function validate(model, map, moduleOf) {
	const violations = [];
	const byName = new Map(map.modules.map((m, i) => [m.name, { ...m, index: i }]));
	for (const name of new Set(moduleOf.values()))
		if (!byName.has(name)) violations.push(`unknown module "${name}"`);
	violations.push(...moduleRules(model, moduleOf));

	// Modules with code evaluate in a chain; type-only modules never load.
	// A module with `chain: false` loads only where profile-guarded code imports
	// it, so no order may depend on it.
	const offChain = new Set(map.modules.filter((m) => m.chain === false).map((m) => m.name));
	const runtimeModules = new Set();
	for (const unit of model.units)
		if (!isTypeOnly(unit) && unit.kind !== 'ambient' && !offChain.has(moduleOf.get(unit.id)))
			runtimeModules.add(moduleOf.get(unit.id));
	const edges = new Map([...runtimeModules].map((m) => [m, new Map()]));
	for (const c of orderConstraints(model, map)) {
		const a = moduleOf.get(c.before.id);
		const b = moduleOf.get(c.after.id);
		if (a === b) continue;
		if (offChain.has(a) || offChain.has(b)) {
			violations.push(
				`order: ${c.after.id} (${b}) reads ${c.name} (${a}) across an off-chain module`,
			);
			continue;
		}
		const list = edges.get(a).get(b) ?? [];
		list.push(c);
		edges.get(a).set(b, list);
	}
	const indegree = new Map([...runtimeModules].map((m) => [m, 0]));
	for (const targets of edges.values())
		for (const b of targets.keys()) indegree.set(b, indegree.get(b) + 1);
	const chain = [];
	const ready = [...runtimeModules].filter((m) => indegree.get(m) === 0);
	const rank = (m) => byName.get(m)?.index ?? Infinity;
	while (ready.length) {
		ready.sort((a, b) => rank(a) - rank(b));
		const next = ready.shift();
		chain.push(next);
		for (const b of edges.get(next).keys()) {
			indegree.set(b, indegree.get(b) - 1);
			if (indegree.get(b) === 0) ready.push(b);
		}
	}
	if (chain.length < runtimeModules.size) {
		const stuck = [...runtimeModules].filter((m) => !chain.includes(m));
		for (const a of stuck)
			for (const [b, list] of edges.get(a))
				if (stuck.includes(b))
					violations.push(
						`order: ${a} must evaluate before ${b}: ` +
							list
								.slice(0, 4)
								.map((c) => `${c.after.id} reads ${c.name}`)
								.join('; ') +
							(list.length > 4 ? ` (+${list.length - 4})` : ''),
					);
	}
	const mapOrder = map.modules.map((m) => m.name).filter((m) => runtimeModules.has(m));
	return { violations, chain, edges, reordered: chain.join() !== mapOrder.join() };
}

/**
 * The rules the concept modules keep once runtime.ts is split, read from the
 * modules themselves: the load, write and pure rules; every module with code
 * on the evaluation chain its order links form; and every order constraint
 * (a driver or uninlined constant above the reads that fold or inline it)
 * satisfied by that chain.
 */
export function checkSplit(src = RUNTIME, rootEntries = ROOT_ENTRIES, baseline = ORDER_BASELINE) {
	const inverted = new Set();
	const { text, modules, chain } = joinClientRuntime(src);
	const model = analyze(src, text);
	const moduleAt = (pos) => modules.find((m) => pos >= m.start && pos < m.end)?.name;
	const moduleOf = new Map(
		model.units.map((u) => [u.id, moduleAt(model.sf.statements[u.statements[0]].getStart())]),
	);
	const violations = moduleRules(model, moduleOf);
	const position = new Map(chain.map((m, i) => [m, i]));
	const offChain = new Set(OFF_CHAIN);
	for (const unit of model.units) {
		const m = moduleOf.get(unit.id);
		if (!isTypeOnly(unit) && unit.kind !== 'ambient' && !position.has(m) && !offChain.has(m)) {
			violations.push(
				`link: ${m} is not on the evaluation chain; its first statement must name the module before it`,
			);
			offChain.add(m);
		}
	}
	for (const c of orderConstraints(model, { rootEntries }, { anyOrder: true })) {
		const [a, b] = [moduleOf.get(c.before.id), moduleOf.get(c.after.id)];
		if (!position.has(a) || !position.has(b)) continue;
		// The joined text holds the chain's modules in order, so a unit's order in
		// it is its evaluation order.
		const key = `${c.after.id} > ${c.name}`;
		if (c.before.order < c.after.order) continue;
		if (baseline.has(key)) inverted.add(key);
		else
			violations.push(
				`order: ${c.after.id} (${b}) reads ${c.name} (${a}), which evaluates after it (${c.rule})`,
			);
	}
	for (const key of baseline)
		if (!inverted.has(key))
			violations.push(`order: ${key} is in order now; remove it from ORDER_BASELINE`);
	return { model, violations, chain };
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const print = (node) => printer.printNode(ts.EmitHint.Unspecified, node, undefined);

/** A comment's text as the printer's synthetic comment API takes it. */
function syntheticComment(node, comment) {
	if (comment.startsWith('//'))
		ts.addSyntheticLeadingComment(node, K.SingleLineCommentTrivia, comment.slice(2), true);
	else ts.addSyntheticLeadingComment(node, K.MultiLineCommentTrivia, comment.slice(2, -2), true);
}

function importDeclaration(from, specifiers, typeOnly = false) {
	const elements = specifiers.map(({ name, imported, type, comment }) => {
		const specifier = ts.factory.createImportSpecifier(
			!typeOnly && type,
			imported && imported !== name ? ts.factory.createIdentifier(imported) : undefined,
			ts.factory.createIdentifier(name),
		);
		for (const c of comment ? comment.split('\n') : []) syntheticComment(specifier, c);
		return specifier;
	});
	return print(
		ts.factory.createImportDeclaration(
			undefined,
			ts.factory.createImportClause(typeOnly, undefined, ts.factory.createNamedImports(elements)),
			ts.factory.createStringLiteral(from),
		),
	);
}

function exportDeclaration(from, names, typeOnly) {
	return print(
		ts.factory.createExportDeclaration(
			undefined,
			typeOnly,
			ts.factory.createNamedExports(
				names.map(({ name, local }) =>
					ts.factory.createExportSpecifier(
						false,
						local && local !== name ? ts.factory.createIdentifier(local) : undefined,
						ts.factory.createIdentifier(name),
					),
				),
			),
			from ? ts.factory.createStringLiteral(from) : undefined,
		),
	);
}

const sideEffectImport = (from) =>
	print(
		ts.factory.createImportDeclaration(undefined, undefined, ts.factory.createStringLiteral(from)),
	);

// A link that only orders evaluation: an empty re-export. A bare import of a
// side-effect-free module draws an esbuild warning, a named one is an unused
// import, and an ESTree printer rewrites `import {} from` as a bare import.
// verbatimModuleSyntax keeps it through every transpile.
const orderLink = (from) => exportDeclaration(from, [], false);

function wrap(text, width = 77) {
	const lines = [];
	for (const paragraph of text.split('\n')) {
		let line = '';
		for (const word of paragraph.split(/\s+/).filter(Boolean)) {
			if (line && line.length + 1 + word.length > width) {
				lines.push(line);
				line = word;
			} else line = line ? `${line} ${word}` : word;
		}
		lines.push(line);
	}
	return lines.map((l) => (l ? `// ${l}` : '//')).join('\n');
}

/** A path from `fromDir` to `spec` (resolved against runtime.ts's directory). */
function respecify(spec, fromDir, baseDir) {
	if (!spec.startsWith('.')) return spec;
	let relative = path.relative(fromDir, path.join(baseDir, spec)).split(path.sep).join('/');
	if (!relative.startsWith('.')) relative = `./${relative}`;
	return relative;
}

/** Module specifiers inside a statement: `import('./x')` types and dynamic imports. */
function innerSpecifiers(st) {
	const found = [];
	const visit = (node) => {
		if (
			ts.isImportTypeNode(node) &&
			ts.isLiteralTypeNode(node.argument) &&
			ts.isStringLiteral(node.argument.literal)
		)
			found.push(node.argument.literal);
		else if (
			ts.isCallExpression(node) &&
			node.expression.kind === K.ImportKeyword &&
			node.arguments[0] &&
			ts.isStringLiteralLike(node.arguments[0])
		)
			found.push(node.arguments[0]);
		ts.forEachChild(node, visit);
	};
	visit(st);
	return found;
}

/**
 * Where a statement's detached leading comments end: the comments before its
 * last blank line, such as a section header. Returns null when there are none.
 */
function detachedEnd(model, index) {
	const { start } = model.ranges[index];
	const st = model.sf.statements[index];
	const comments = ts.getLeadingCommentRanges(model.text, start) ?? [];
	let end = null;
	comments.forEach((c, k) => {
		const gap = model.text.slice(c.end, comments[k + 1]?.pos ?? st.getStart(model.sf));
		if (gap.split('\n').length > 2) end = c.end;
	});
	return end;
}

/**
 * Statement text with its leading comments (from `from` when given), `export`
 * inserted when `exported` asks for it, and relative specifiers re-resolved
 * through `relocate`.
 */
function statementText(model, index, exported, relocate, from) {
	const st = model.sf.statements[index];
	let { start, end } = model.ranges[index];
	if (index === 0 && model.header) start = model.header.length;
	if (from !== undefined) start = from;
	const edits = [];
	if (exported && !hasModifier(st, K.ExportKeyword))
		edits.push({ at: st.getStart(model.sf), end: st.getStart(model.sf), text: 'export ' });
	if (relocate)
		for (const literal of innerSpecifiers(st)) {
			const spec = relocate(literal.text);
			if (spec !== literal.text)
				edits.push({ at: literal.getStart(model.sf) + 1, end: literal.end - 1, text: spec });
		}
	let text = '';
	let cursor = start;
	for (const edit of edits.sort((a, b) => a.at - b.at)) {
		text += model.text.slice(cursor, edit.at) + edit.text;
		cursor = edit.end;
	}
	return text + model.text.slice(cursor, end);
}

/**
 * Builds the facade and module texts (unformatted). Every name another module
 * references is exported from its module, and every name runtime.ts exported
 * is re-exported from the facade.
 */
export function emit(model, map, moduleOf, chain) {
	const srcDir = path.dirname(model.file);
	const dir = path.join(srcDir, map.directory);
	const info = new Map(map.modules.map((m) => [m.name, m]));
	const unitsOf = new Map(map.modules.map((m) => [m.name, []]));
	for (const unit of model.units)
		if (unit.kind !== 'ambient') unitsOf.get(moduleOf.get(unit.id)).push(unit);

	// Names referenced from another module, per target unit.
	const needsExport = new Set();
	const crossRefs = new Map(map.modules.map((m) => [m.name, new Map()])); // module -> name -> {value,type}
	for (const unit of model.units) {
		if (unit.kind === 'ambient') continue;
		const home = moduleOf.get(unit.id);
		for (const [name, r] of unit.refs) {
			const target = model.unitByName.get(name);
			if (moduleOf.get(target.id) === home) continue;
			needsExport.add(target.id);
			const entry = crossRefs.get(home).get(name) ?? { value: 0, type: 0 };
			entry.value += r.read + r.write;
			entry.type += r.type;
			crossRefs.get(home).set(name, entry);
		}
	}
	for (const unit of model.units) if (unit.exported) needsExport.add(unit.id);

	const ambient = new Map(
		model.units
			.filter((u) => u.kind === 'ambient')
			.map((u) => [u.names[0], statementText(model, u.statements[0], false).trimStart()]),
	);
	// A section header leads its section's first declaration. When that one
	// lives elsewhere, the map sends the header to its section's module, ahead
	// of that module's next declaration.
	const sections = new Map();
	const incoming = new Map();
	for (const [id, target] of Object.entries(map.sectionComments ?? {})) {
		const unit = model.units.find((u) => u.id === id);
		if (!unit) throw new Error(`sectionComments names ${id}, which is not declared`);
		const index = unit.statements[0];
		const end = detachedEnd(model, index);
		if (end === null) throw new Error(`${id} has no detached leading comment`);
		const before = unitsOf
			.get(target)
			.flatMap((u) => u.statements)
			.sort((a, b) => a - b)
			.find((i) => i > index);
		if (before === undefined) throw new Error(`${target} declares nothing after ${id}`);
		sections.set(index, { end });
		const list = incoming.get(target) ?? [];
		list.push({ before, text: model.text.slice(model.ranges[index].start, end) });
		incoming.set(target, list);
	}
	const chainPos = new Map(chain.map((m, i) => [m, i]));
	const files = new Map();
	const base = (m) => `./${path.basename(info.get(m).file, '.ts')}.js`;

	for (const m of map.modules) {
		const units = unitsOf.get(m.name);
		if (!units.length) continue;
		const file = path.join(dir, m.file);
		const parts = [wrap(`${m.title}\n\n${m.summary}`)];
		const imports = [];
		const position = chainPos.get(m.name);
		const previous = position > 0 ? chain[position - 1] : null;

		// External imports, grouped by source in runtime.ts's import order.
		const external = new Map();
		const ambientUsed = new Set();
		for (const unit of units) {
			for (const [local, r] of unit.importRefs) {
				const imp = model.imports.get(local);
				const list = external.get(imp.from) ?? new Map();
				const prior = list.get(local) ?? { value: 0, type: 0 };
				list.set(local, { value: prior.value + r.value, type: prior.type + r.type });
				external.set(imp.from, list);
			}
			for (const a of unit.ambientRefs) ambientUsed.add(a);
		}
		const sources = [...new Set([...model.imports.values()].map((i) => i.from))];
		for (const from of sources) {
			const used = external.get(from);
			if (!used) continue;
			const specifiers = [...used].map(([local, r]) => {
				const imp = model.imports.get(local);
				return {
					name: local,
					imported: imp.imported,
					type: imp.typeOnly || r.value === 0,
					comment: imp.comment,
				};
			});
			const spec = respecify(from, path.dirname(file), srcDir);
			const namespace = specifiers.find((s) => s.imported === '*' || s.imported === 'default');
			if (namespace) throw new Error(`default or namespace import of ${from} is not supported`);
			imports.push(
				importDeclaration(
					spec,
					specifiers,
					specifiers.every((s) => s.type),
				),
			);
		}

		// Runtime imports from other concept modules, in chain order. The first
		// imports the module that evaluates before this one, so it evaluates first.
		const fromModules = new Map();
		for (const [name, r] of crossRefs.get(m.name)) {
			const target = moduleOf.get(model.unitByName.get(name).id);
			const list = fromModules.get(target) ?? [];
			list.push({ name, type: r.value === 0, order: model.unitByName.get(name).order });
			fromModules.set(target, list);
		}
		const link =
			previous && !fromModules.get(previous)?.some((s) => !s.type)
				? `// Evaluates after the module it names; runtime.ts explains the chain.\n${orderLink(base(previous))}`
				: null;
		const moduleOrder = [...fromModules.keys()].sort(
			(a, b) =>
				(a === previous ? -2 : (chainPos.get(a) ?? -1)) -
					(b === previous ? -2 : (chainPos.get(b) ?? -1)) || a.localeCompare(b),
		);
		const runtimeImports = moduleOrder.map((target) => {
			const list = fromModules.get(target).sort((a, b) => a.order - b.order);
			return importDeclaration(
				base(target),
				list,
				list.every((s) => s.type),
			);
		});
		if (link) imports.unshift(link);
		else if (previous) imports.unshift(runtimeImports.shift());
		imports.push(...runtimeImports);
		parts.push(imports.join('\n'));
		for (const a of AMBIENT) if (ambientUsed.has(a)) parts.push(ambient.get(a).trimEnd());
		const relocate = (spec) => respecify(spec, path.dirname(file), srcDir);
		const body = units
			.flatMap((u) => u.statements.map((i) => ({ i, unit: u })))
			.sort((a, b) => a.i - b.i)
			.map(({ i, unit }) => {
				const moved = sections.get(i);
				const own = moved
					? statementText(model, i, needsExport.has(unit.id), relocate, moved.end)
					: null;
				const text = own ?? statementText(model, i, needsExport.has(unit.id), relocate);
				const arriving = (incoming.get(m.name) ?? []).filter((s) => s.before === i);
				return arriving.map((s) => `\n${s.text.trim()}\n\n`).join('') + text;
			})
			.join('');
		parts.push(body.trimStart());
		files.set(file, parts.join('\n\n'));
	}

	// The facade: header, dependency order, chain tail, then every export.
	const facade = [model.header.trimEnd(), wrap(map.facade)];
	const pins = [];
	const unpinned = new Set(map.unpinned ?? []);
	for (const { from, index } of model.dependencies) {
		if (unpinned.has(from)) continue;
		const st = model.sf.statements[index];
		const comments = (ts.getLeadingCommentRanges(model.text, model.ranges[index].start) ?? [])
			.concat(ts.getLeadingCommentRanges(model.text, st.pos) ?? [])
			.map((c) => model.text.slice(c.pos, c.end))
			.filter((c, i, all) => all.indexOf(c) === i && !model.header.includes(c));
		// A bare import in runtime.ts stays bare; any other is only an order pin here.
		const pin =
			ts.isImportDeclaration(st) && !st.importClause ? sideEffectImport(from) : orderLink(from);
		pins.push([...comments, pin].join('\n'));
	}
	const tail = chain.at(-1);
	pins.push(orderLink(`./${map.directory}/${path.basename(info.get(tail).file, '.ts')}.js`));
	facade.push(pins.join('\n'));
	const exportsByModule = new Map();
	for (const unit of model.units)
		if (unit.exported) {
			const m = moduleOf.get(unit.id);
			const list = exportsByModule.get(m) ?? [];
			list.push(unit);
			exportsByModule.set(m, list);
		}
	const reexports = [];
	for (const m of map.modules) {
		const list = exportsByModule.get(m.name);
		if (!list) continue;
		const from = `./${map.directory}/${path.basename(m.file, '.ts')}.js`;
		const values = list
			.filter((u) => !isTypeOnly(u))
			.flatMap((u) => u.names.map((name) => ({ name })));
		const types = list
			.filter((u) => isTypeOnly(u))
			.flatMap((u) => u.names.map((name) => ({ name })));
		if (values.length) reexports.push(exportDeclaration(from, values, false));
		if (types.length) reexports.push(exportDeclaration(from, types, true));
	}
	for (const { index, node } of model.reexports) {
		const comments = (ts.getLeadingCommentRanges(model.text, node.pos) ?? [])
			.map((c) => model.text.slice(c.pos, c.end))
			.filter((c) => !model.header.includes(c));
		let text;
		if (node.moduleSpecifier)
			text = model.text.slice(node.getStart(model.sf), model.ranges[index].end).trimEnd();
		else {
			// `export { local }` of an imported binding re-exports from its source.
			const bySource = new Map();
			for (const el of node.exportClause.elements) {
				const local = (el.propertyName ?? el.name).text;
				const imp = model.imports.get(local);
				if (!imp) throw new Error(`export { ${local} } names no import`);
				const list = bySource.get(imp.from) ?? [];
				list.push({ name: el.name.text, local: imp.imported });
				bySource.set(imp.from, list);
			}
			text = [...bySource]
				.map(([from, names]) => exportDeclaration(from, names, node.isTypeOnly))
				.join('\n');
		}
		reexports.push([...comments, text].join('\n'));
	}
	facade.push(reexports.join('\n'));
	files.set(model.file, facade.join('\n\n') + '\n');
	return files;
}

/** The single-file runtime with its statements reordered into module order. */
export function emitSorted(model, map, moduleOf, chain) {
	const rank = new Map(chain.map((m, i) => [m, i]));
	const typeModules = map.modules.filter((m) => !rank.has(m.name)).map((m) => m.name);
	typeModules.forEach((m, i) => rank.set(m, chain.length + i));
	const prologue = [];
	const body = [];
	model.sf.statements.forEach((st, index) => {
		if (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) prologue.push(index);
	});
	for (const unit of model.units)
		for (const i of unit.statements)
			body.push({ i, rank: unit.kind === 'ambient' ? -1 : rank.get(moduleOf.get(unit.id)) });
	body.sort((a, b) => a.rank - b.rank || a.i - b.i);
	return (
		model.header +
		prologue.map((i) => statementText(model, i, false)).join('') +
		body.map(({ i }) => statementText(model, i, false)).join('') +
		model.tail
	);
}

/** Formats with the repository's Prettier options for runtime.ts. */
async function format(file, text) {
	// A file written outside the repository (--out) takes the runtime's config.
	const options = (await prettier.resolveConfig(file.startsWith(ROOT) ? file : RUNTIME)) ?? {};
	return prettier.format(text, { ...options, filepath: file });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function moduleTable(model, map, moduleOf, chain) {
	const rows = [];
	for (const m of map.modules) {
		const units = model.units.filter((u) => moduleOf.get(u.id) === m.name);
		if (!units.length) continue;
		const kinds = {};
		for (const u of units) kinds[u.kind] = (kinds[u.kind] ?? 0) + 1;
		rows.push({
			module: m.file,
			chain: chain.indexOf(m.name) + 1 || '-',
			title: m.title,
			declarations: units.length,
			lines: units.reduce((s, u) => s + u.lines, 0),
			kinds,
		});
	}
	return rows;
}

export function stateTable(model, moduleOf) {
	const writers = writerIndex(model);
	const rows = [];
	for (const unit of model.units.filter(isMutable)) {
		const readers = model.units.filter((u) => u.refs.get(unit.names[0])?.read);
		const home = moduleOf.get(unit.id);
		rows.push({
			name: unit.id,
			module: home,
			line: unit.line,
			writers: (writers.get(unit.id) ?? []).map((w) => w.id),
			readers: readers.length,
			foreignReaders: [
				...new Set(readers.map((r) => moduleOf.get(r.id)).filter((m) => m !== home)),
			],
		});
	}
	return rows;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
	const options = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--suggest') options.suggest = true;
		else if (arg.startsWith('--')) options[arg.slice(2)] = argv[++i];
		else options._.push(arg);
	}
	return options;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const [command = 'check', target] = options._;
	const src = path.resolve(options.src ?? RUNTIME);
	const mapFile = path.resolve(options.map ?? MAP);
	const model = analyze(src);
	if (!ROOT_ENTRIES.some((name) => model.unitByName.has(name))) {
		// runtime.ts is the facade: the concept modules are the source of truth,
		// and only `check` applies to them.
		if (command !== 'check') {
			console.error(
				`${path.relative(process.cwd(), src)} is already split; \`${command}\` is migration-only ` +
					'and runs on an unsplit runtime.ts (--src <file>).',
			);
			process.exitCode = 1;
			return;
		}
		const { violations, chain } = checkSplit(src);
		for (const v of violations) console.error(v);
		console.error(`${chain.length} modules in the chain, ${violations.length} violations`);
		process.exitCode = violations.length ? 1 : 0;
		return;
	}
	const map = readMap(mapFile);
	const { moduleOf, unmapped, stale } = place(model, map);
	const { violations, chain, reordered } = validate(model, map, moduleOf);

	for (const u of unmapped)
		console.error(`unmapped: ${u.id} (line ${u.line}, ${u.kind}) -> ${u.suggestion}: ${u.reason}`);
	for (const s of stale) console.error(`stale: ${s.id} is mapped to ${s.module} but not declared`);
	for (const v of violations) console.error(v);
	if (reordered)
		console.error(`note: evaluation chain differs from the map order: ${chain.join(' > ')}`);

	if (options.suggest && (unmapped.length || stale.length)) {
		const staleIds = new Set(stale.map((s) => s.id));
		for (const m of map.modules) m.units = m.units.filter((id) => !staleIds.has(id));
		for (const u of unmapped) map.modules.find((m) => m.name === u.suggestion).units.push(u.id);
		const order = new Map(model.units.map((u, i) => [u.id, i]));
		for (const m of map.modules) m.units.sort((a, b) => order.get(a) - order.get(b));
		fs.writeFileSync(mapFile, await format(mapFile, JSON.stringify(map)));
		console.error(`wrote ${unmapped.length} suggestions and dropped ${stale.length} stale entries`);
	}
	const blocked = violations.length > 0 || ((unmapped.length || stale.length) && !options.suggest);

	if (command === 'check') {
		console.error(
			`${model.units.length} declarations, ${chain.length} modules in the chain, ` +
				`${unmapped.length} unmapped, ${stale.length} stale, ${violations.length} violations`,
		);
		process.exitCode = blocked ? 1 : 0;
		return;
	}
	if (command === 'where') {
		// The module each named declaration moves to, for tooling that names files.
		for (const name of options._.slice(1)) {
			const unit = model.unitByName.get(name);
			const file = unit && map.modules.find((m) => m.name === moduleOf.get(unit.id))?.file;
			console.log(`${name}\t${file ? `${map.directory}/${file}` : 'not declared'}`);
		}
		return;
	}
	if (command === 'report') {
		const json = {
			modules: moduleTable(model, map, moduleOf, chain),
			state: stateTable(model, moduleOf),
			chain,
		};
		console.log(JSON.stringify(json, null, '\t'));
		return;
	}
	if (blocked) {
		console.error('refusing to write: fix the map first');
		process.exitCode = 1;
		return;
	}
	if (command === 'sorted') {
		const out = path.resolve(target ?? src);
		fs.writeFileSync(out, await format(out, emitSorted(model, map, moduleOf, chain)));
		console.error(`wrote ${path.relative(process.cwd(), out)}`);
		return;
	}
	if (command === 'order') {
		// The search measures the split itself, so it writes it in place while it
		// builds and then restores the single-file runtime.ts.
		const { buildChunks, searchOrder } = await import('./split-runtime-order.mjs');
		let chunks;
		try {
			for (const [file, text] of emit(model, map, moduleOf, chain)) {
				fs.mkdirSync(path.dirname(file), { recursive: true });
				fs.writeFileSync(file, await format(file, text));
			}
			chunks = await buildChunks();
		} finally {
			fs.rmSync(path.join(path.dirname(src), map.directory), { recursive: true, force: true });
			fs.writeFileSync(src, model.text);
		}
		const before = new Map(chain.map((m) => [m, new Set()]));
		for (const c of orderConstraints(model, map)) {
			const [a, b] = [moduleOf.get(c.before.id), moduleOf.get(c.after.id)];
			if (a !== b && before.has(a) && before.has(b)) before.get(b).add(a);
		}
		const result = searchOrder({
			chain,
			before,
			chunks,
			evals: Number(options.evals ?? 40000),
			seeds: Number(options.seeds ?? 4),
		});
		const rank = new Map(result.order.map((m, i) => [m, i]));
		const ordered = map.modules
			.filter((m) => rank.has(m.name))
			.sort((a, b) => rank.get(a.name) - rank.get(b.name));
		let next = 0;
		map.modules = map.modules.map((m) => (rank.has(m.name) ? ordered[next++] : m));
		fs.writeFileSync(mapFile, await format(mapFile, JSON.stringify(map)));
		const sum = (sizes, minimal) =>
			Object.entries(sizes)
				.filter(([name]) => name.startsWith('minimal/') === minimal)
				.reduce((total, [, bytes]) => total + bytes, 0);
		for (const name of ['shell', 'full'])
			console.error(`${name}: gzip ${result.before[name]} -> ${result.after[name]}`);
		console.error(
			`run-minimal Rolldown scenarios: gzip ${sum(result.before, true)} -> ${sum(result.after, true)}`,
		);
		console.error(`order: ${result.order.join(' > ')}`);
		return;
	}
	if (command === 'split') {
		const outDir = path.resolve(options.out ?? path.dirname(src));
		const files = emit(model, map, moduleOf, chain);
		fs.rmSync(path.join(outDir, map.directory), { recursive: true, force: true });
		for (const [file, text] of files) {
			const out = path.join(outDir, path.relative(path.dirname(src), file));
			fs.mkdirSync(path.dirname(out), { recursive: true });
			fs.writeFileSync(out, await format(file, text));
		}
		console.error(
			`wrote ${path.relative(process.cwd(), path.join(outDir, path.basename(src)))} and ` +
				`${files.size - 1} modules in ${path.relative(process.cwd(), path.join(outDir, map.directory))}`,
		);
		return;
	}
	throw new Error(`unknown command ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
