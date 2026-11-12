// Migration guidance for Strong diagnostics: where each code is documented,
// which React idioms have a dedicated replacement, and the source edits that
// apply one mechanically.
//
// An edit is offered only where applying it verbatim cannot change what the
// module means beyond the replacement the message names: adjacent statements,
// no interleaved comments, and an existing `octane` import to extend. Anything
// else keeps the message and leaves the rewrite to the author.

import {
	createLexicalAnalysis,
	isIdentifierReference,
	isJsxBindingReference,
} from './compile-universal.js';

/** The website page whose per-code anchors document every Strong diagnostic. */
export const STRONG_DOCS_URL = 'https://octanejs.dev/docs/strong-mode';

/**
 * @param {string} code e.g. `OCTANE_STRONG_RENDER_REF_READ`
 * @returns {string}
 */
export function strongDocsUrl(code) {
	return `${STRONG_DOCS_URL}#${code.toLowerCase().replaceAll('_', '-')}`;
}

const AST_SKIP_KEYS = new Set([
	'type',
	'start',
	'end',
	'loc',
	'range',
	'parent',
	'metadata',
	'comments',
	'tokens',
]);

const WALK_SKIP_KEYS = new Set([
	...AST_SKIP_KEYS,
	'typeAnnotation',
	'returnType',
	'typeParameters',
	'typeArguments',
]);

function walk(node, visit, skip = WALK_SKIP_KEYS, parent = null, key = null) {
	if (node == null || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) walk(child, visit, skip, parent, key);
		return;
	}
	if (typeof node.type !== 'string') return;
	visit(node, parent, key);
	for (const key in node) {
		if (!skip.has(key) && !key.startsWith('_octane')) walk(node[key], visit, skip, node, key);
	}
}

function unwrap(node) {
	while (
		node?.type === 'ParenthesizedExpression' ||
		node?.type === 'TSAsExpression' ||
		node?.type === 'TSNonNullExpression' ||
		node?.type === 'TSSatisfiesExpression'
	) {
		node = node.expression;
	}
	return node;
}

/** `name.current`, read or written. */
function currentOf(node) {
	node = unwrap(node);
	if (
		node?.type !== 'MemberExpression' ||
		node.computed === true ||
		node.optional === true ||
		node.property?.type !== 'Identifier' ||
		node.property.name !== 'current'
	) {
		return null;
	}
	const object = unwrap(node.object);
	return object?.type === 'Identifier' ? { member: node, name: object.name } : null;
}

function isNullish(node) {
	node = unwrap(node);
	return (
		(node?.type === 'Literal' && node.value === null && node.raw === 'null') ||
		(node?.type === 'Identifier' && node.name === 'undefined') ||
		(node?.type === 'UnaryExpression' && node.operator === 'void')
	);
}

/** `!r.current`, `r.current == null`, `null === r.current`, `r.current === undefined`. */
function emptyRefTest(test) {
	test = unwrap(test);
	if (test?.type === 'UnaryExpression' && test.operator === '!') return currentOf(test.argument);
	if (test?.type !== 'BinaryExpression' || (test.operator !== '==' && test.operator !== '===')) {
		return null;
	}
	if (isNullish(test.right)) return currentOf(test.left);
	if (isNullish(test.left)) return currentOf(test.right);
	return null;
}

/** The single `r.current = value` statement of an `if` consequent. */
function lazyAssignment(consequent, name) {
	let statement = consequent;
	if (statement?.type === 'BlockStatement') {
		if (statement.body?.length !== 1) return null;
		statement = statement.body[0];
	}
	const expression = statement?.type === 'ExpressionStatement' ? statement.expression : null;
	if (expression?.type !== 'AssignmentExpression' || expression.operator !== '=') return null;
	const target = currentOf(expression.left);
	return target?.name === name ? { target: target.member, init: expression.right } : null;
}

/**
 * Find React's lazy ref initialization idioms:
 *
 *   if (ref.current === null) ref.current = create();
 *   ref.current ??= create();
 *
 * The result maps each `ref.current` member the Strong ref checks report to
 * the idiom it belongs to, so both the read in the test and the write in the
 * consequent name `useLazyRef` instead of generic ref guidance.
 *
 * @param {any} ast
 * @returns {Map<any, { name: string, statement: any, init: any, previous: any }>}
 */
export function collectLazyRefIdioms(ast) {
	/** @type {Map<any, { name: string, statement: any, init: any, previous: any }>} */
	const idioms = new Map();
	walk(ast, (node) => {
		for (const key in node) {
			const list = node[key];
			if (!Array.isArray(list) || WALK_SKIP_KEYS.has(key)) continue;
			for (let index = 0; index < list.length; index++) {
				const statement = list[index];
				const previous = index > 0 ? list[index - 1] : null;
				if (statement?.type === 'IfStatement' && statement.alternate == null) {
					const test = emptyRefTest(statement.test);
					const assignment = test && lazyAssignment(statement.consequent, test.name);
					if (!assignment) continue;
					const idiom = { name: test.name, statement, init: assignment.init, previous };
					idioms.set(test.member, idiom);
					idioms.set(assignment.target, idiom);
				} else if (
					statement?.type === 'ExpressionStatement' &&
					statement.expression?.type === 'AssignmentExpression' &&
					(statement.expression.operator === '??=' || statement.expression.operator === '||=')
				) {
					const target = currentOf(statement.expression.left);
					if (!target) continue;
					idioms.set(target.member, {
						name: target.name,
						statement,
						init: statement.expression.right,
						previous,
					});
				}
			}
		}
	});
	return idioms;
}

function octaneImport(ast) {
	for (const statement of ast?.body ?? []) {
		if (
			statement.type === 'ImportDeclaration' &&
			statement.source?.value === 'octane' &&
			statement.importKind !== 'type'
		) {
			const named = statement.specifiers?.filter(
				(specifier) => specifier.type === 'ImportSpecifier',
			);
			if (named?.length) return { declaration: statement, named };
		}
	}
	return null;
}

/** An edit that adds `name` to the module's `import { … } from 'octane'`. */
function importEdit(ast, name) {
	const found = octaneImport(ast);
	if (found === null) return undefined;
	if (
		found.named.some(
			(specifier) =>
				specifier.importKind !== 'type' &&
				(specifier.imported?.name ?? specifier.imported?.value) === name &&
				specifier.local?.name === name,
		)
	) {
		return null;
	}
	const last = found.named[found.named.length - 1];
	return { start: last.end, end: last.end, text: `, ${name}` };
}

/** A factory body for `text`, parenthesized where an arrow would misread it. */
function arrowBody(node, source) {
	const value = unwrap(node);
	const text = source.slice(node.start, node.end);
	return value?.type === 'ObjectExpression' || value?.type === 'SequenceExpression'
		? `(${text})`
		: text;
}

const FUNCTION_SCOPE_WORDS = /\b(?:this|arguments|await|yield)\b/;

/**
 * @param {{ name: string, statement: any, init: any, previous: any }} idiom
 * @param {any} ast
 * @param {string} source
 */
export function lazyRefSuggestion(idiom, ast, source) {
	const init = source.slice(idiom.init.start, idiom.init.end);
	const factory = `useLazyRef(() => ${arrowBody(idiom.init, source)})`;
	const suggestion = {
		message: `Create the value once with \`const ${idiom.name} = ${factory}\`.`,
	};
	const declaration = idiom.previous;
	const declarators = declaration?.type === 'VariableDeclaration' ? declaration.declarations : null;
	const call = declarators?.length === 1 ? unwrap(declarators[0].init) : null;
	if (
		call?.type !== 'CallExpression' ||
		declaration.kind !== 'const' ||
		declarators[0].id?.type !== 'Identifier' ||
		declarators[0].id.name !== idiom.name ||
		call.callee?.type !== 'Identifier' ||
		call.callee.name !== 'useRef' ||
		call.arguments.length > 1 ||
		(call.arguments.length === 1 && !isNullish(call.arguments[0])) ||
		// Moving the initializer into a factory changes these, and a comment
		// between the two statements would be deleted with the `if`.
		FUNCTION_SCOPE_WORDS.test(init) ||
		source.slice(declaration.end, idiom.statement.start).trim() !== ''
	) {
		return suggestion;
	}
	const addImport = importEdit(ast, 'useLazyRef');
	if (addImport === undefined) return suggestion;
	const edits = [
		{ start: call.start, end: call.end, text: factory },
		{ start: declaration.end, end: idiom.statement.end, text: '' },
	];
	if (addImport !== null) edits.unshift(addImport);
	return { ...suggestion, edits };
}

// Properties and calls that read the committed layout. A state update in an
// effect that reads one of these is a measurement, which useLayoutSnapshot owns.
export const LAYOUT_PROPERTIES = new Set([
	'clientHeight',
	'clientLeft',
	'clientTop',
	'clientWidth',
	'offsetHeight',
	'offsetLeft',
	'offsetTop',
	'offsetWidth',
	'scrollHeight',
	'scrollLeft',
	'scrollTop',
	'scrollWidth',
]);
const LAYOUT_METHODS = new Set([
	'getBoundingClientRect',
	'getClientRects',
	'getComputedStyle',
	'closest',
]);

// A layout snapshot measures after every commit. Only an explicit null list
// establishes that schedule in Octane. A removed [] or an inferred list does not.
function scalarMeasurement(value, initial) {
	const chain = (node) => (node?.type === 'ChainExpression' ? node.expression : node);
	const kind =
		initial?.type === 'UnaryExpression' && ['+', '-'].includes(initial.operator)
			? typeof initial.argument.value
			: initial?.type === 'Literal'
				? typeof initial.value
				: null;
	const nullInitial = initial?.type === 'Literal' && initial.value === null;
	let read = chain(value);
	if (read?.type === 'BinaryExpression') {
		if (
			(!nullInitial && kind !== 'boolean') ||
			!['==', '!='].includes(read.operator) ||
			read.right.type !== 'Literal' ||
			read.right.value !== null
		)
			return null;
		read = chain(read.left);
		if (
			read?.type !== 'CallExpression' ||
			read.callee.property?.name !== 'closest' ||
			read.arguments.length !== 1 ||
			typeof read.arguments[0].value !== 'string'
		)
			return null;
	} else {
		if (kind !== 'number' && !nullInitial) return null;
		if (
			read?.type === 'LogicalExpression' &&
			read.operator === '??' &&
			read.right.type === 'Literal' &&
			typeof read.right.value === 'number'
		)
			read = chain(read.left);
		if (read?.type !== 'MemberExpression' || read.computed) return null;
		if (LAYOUT_PROPERTIES.has(read.property.name)) return currentOf(read.object);
		if (
			!['height', 'width', 'top', 'bottom', 'left', 'right', 'x', 'y'].includes(read.property.name)
		)
			return null;
		read = read.object;
		if (
			read?.type !== 'CallExpression' ||
			read.arguments.length ||
			read.callee.property?.name !== 'getBoundingClientRect'
		)
			return null;
	}
	return read.callee.type === 'MemberExpression' && !read.callee.computed
		? currentOf(read.callee.object)
		: null;
}

// Adding a module binding must not capture an existing free reference, including
// a JSX namespace or a TypeScript value query. The caller caches this module scan.
export function hookImportEditor(ast, source, replacement, replaced) {
	const imports = new Map();
	const groups = [];
	let replacementImported = false;
	for (const declaration of ast.body) {
		if (
			declaration.type !== 'ImportDeclaration' ||
			(declaration.source.value !== 'octane' && declaration.source.value !== 'octane/server') ||
			declaration.importKind === 'type'
		)
			continue;
		const named = declaration.specifiers.filter((spec) => spec.type === 'ImportSpecifier');
		replacementImported ||= named.some(
			(spec) =>
				spec.importKind !== 'type' &&
				spec.imported.name === replacement &&
				spec.local.name === replacement,
		);
		if (!named.length || declaration.source.value !== 'octane') continue;
		const group = { declaration, named };
		groups.push(group);
		for (const spec of named) {
			if (spec.importKind !== 'type' && replaced.includes(spec.imported.name)) {
				imports.set(spec.local.name, { spec, sites: new Set(), offered: new Set() });
			}
		}
	}
	const lexical = createLexicalAnalysis(ast);
	let collision = false;
	let dynamic = false;
	for (const statement of ast.body) {
		const declaration = statement.declaration ?? statement;
		const typeQuery =
			declaration.type === 'TSTypeAliasDeclaration' ? declaration.typeAnnotation : null;
		walk(
			statement,
			(node, parent, key) => {
				if (
					node.type === 'WithStatement' ||
					(node.type === 'CallExpression' &&
						node.callee?.type === 'Identifier' &&
						node.callee.name === 'eval')
				)
					dynamic = true;
				if (node.type !== 'Identifier' && node.type !== 'JSXIdentifier') return;
				if (node.name === replacement) collision = true;
				const binding = imports.get(node.name);
				if (!binding) return;
				// A local type export refers to the imported value as a type. Runtime
				// lexical analysis deliberately excludes these export specifiers.
				if (parent?.type === 'ExportSpecifier' && key === 'local' && !statement.source) {
					binding.sites.add(node.start);
					return;
				}
				const reference =
					node.type === 'Identifier'
						? isIdentifierReference(node, parent, key, lexical)
						: isJsxBindingReference(node, parent, key);
				if (!reference) return;
				const scope = lexical.nodeScopes.get(node);
				if (scope) {
					if (lexical.resolveBinding(scope, node.name)?.scope === lexical.rootScope)
						binding.sites.add(node.start);
				} else if (parent === typeQuery && parent?.type === 'TSTypeQuery' && key === 'exprName') {
					binding.sites.add(node.start);
				} else if (!(
					key === 'key' &&
					!parent.computed &&
					(parent.type === 'TSPropertySignature' || parent.type === 'TSMethodSignature')
				)) {
					// Other type positions have no runtime scope. Keep the diagnostic
					// without an import edit when their binding cannot be established.
					binding.uncertain = true;
				}
			},
			AST_SKIP_KEYS,
		);
	}

	return (sites, existing, requireNamedImports = false) => {
		const add = !existing;
		if (dynamic || (add && (collision || !groups.length))) return false;
		const calls = sites
			.map((call) => {
				const binding = imports.get(call.callee.name);
				return binding?.sites.has(call.callee.start) ? binding : undefined;
			})
			.filter(Boolean);
		if (requireNamedImports && (calls.length !== sites.length || (!add && !replacementImported)))
			return false;
		// Leave the last consumer of a shared import for the next fix pass. The
		// last edit can then remove that import, even when a batch applied all
		// its siblings together. Each editor action must also work on its own.
		if (
			calls.some(
				(binding) =>
					binding.uncertain ||
					(binding.sites.size > 1 && binding.offered.size === binding.sites.size - 1),
			)
		)
			return false;
		const drop = new Set(
			calls.filter((binding) => binding.sites.size === 1).map((binding) => binding.spec),
		);
		const edits = [];
		for (const group of groups) {
			const { declaration, named } = group;
			const append = add && group === groups[0];
			const kept = named.filter((spec) => !drop.has(spec));
			const last = named[named.length - 1];
			if (kept.length === named.length) {
				if (append) edits.push({ start: last.end, end: last.end, text: `, ${replacement}` });
				continue;
			}
			// Preserve comments in import lists. A commented declaration can be
			// separated by hand without guessing which specifier owns the comment.
			if (/\/[/*]/.test(source.slice(declaration.start, declaration.end))) return false;
			const names = kept.map((spec) => source.slice(spec.start, spec.end));
			if (append) names.push(replacement);
			if (names.length) {
				edits.push({ start: named[0].start, end: last.end, text: names.join(', ') });
			} else if (named.length === declaration.specifiers.length) {
				edits.push({ start: declaration.start, end: declaration.end, text: '' });
			} else {
				return false;
			}
		}
		for (const call of sites) imports.get(call.callee.name)?.offered.add(call.callee.start);
		return edits;
	};
}

/** A source edit for an adjacent state declaration and its only writer. */
export function layoutSnapshotEdits(effect, source, calls, snapshotImport) {
	const call = effect.node;
	if (
		calls.get(call) !== 'useLayoutEffect' ||
		call.arguments.length !== 2 ||
		call.arguments[1].type !== 'Literal' ||
		call.arguments[1].value !== null
	)
		return;
	const callback = call.arguments[0];
	if (callback.type !== 'ArrowFunctionExpression' || callback.async || callback.params.length)
		return;
	const body = callback.body;
	const update =
		body.type === 'BlockStatement'
			? body.body.length === 1 &&
				body.body[0].type === 'ExpressionStatement' &&
				body.body[0].expression
			: body;
	if (
		update?.type !== 'CallExpression' ||
		update.callee.type !== 'Identifier' ||
		update.arguments.length !== 1
	)
		return;
	const statements = effect.caller?.body?.body;
	if (!Array.isArray(statements)) return;
	const index = statements.findIndex(
		(statement) => statement.type === 'ExpressionStatement' && statement.expression === call,
	);
	const state = statements[index - 1];
	if (state?.kind !== 'const' || state.declarations?.length !== 1) return;
	const { id, init } = state.declarations[0];
	if (
		calls.get(init) !== 'useState' ||
		init.arguments.length !== 1 ||
		id.type !== 'ArrayPattern' ||
		id.typeAnnotation ||
		id.elements.length !== 2
	)
		return;
	const [value, setter] = id.elements;
	if (
		value?.type !== 'Identifier' ||
		setter?.type !== 'Identifier' ||
		setter.name !== update.callee.name
	)
		return;
	const initial = init.arguments[0];
	const measurement = update.arguments[0];
	const ref = scalarMeasurement(measurement, initial);
	if (!ref || /\/[/*]/.test(source.slice(state.start, statements[index].end))) return;

	// Require a locally owned host ref. A user-defined getter could return an
	// updater function, which a state setter would call rather than store.
	const declaration = statements
		.slice(0, index - 1)
		.flatMap((statement) => statement.declarations ?? [])
		.find(
			(decl) =>
				decl.id.type === 'Identifier' &&
				decl.id.name === ref.name &&
				calls.get(decl.init) === 'useRef',
		);
	if (
		!declaration ||
		declaration.init.arguments.length !== 1 ||
		declaration.init.arguments[0].type !== 'Literal' ||
		declaration.init.arguments[0].value !== null
	)
		return;
	let refUses = 0;
	let hosts = 0;
	let setterUses = 0;
	let dynamic = false;
	walk(
		effect.caller,
		(node) => {
			// An intrinsic tag or attribute named "ref" is not an expression. JSX
			// member roots, including lowercase namespaces, do reference bindings.
			const name =
				node.type === 'Identifier' || (node.type === 'JSXIdentifier' && !/^[a-z]/.test(node.name))
					? node.name
					: node.type === 'JSXMemberExpression'
						? node.object.name
						: null;
			if (name === ref.name) refUses++;
			if (name === setter.name) setterUses++;
			if (name === 'eval') dynamic = true;
			if (
				node.type === 'JSXOpeningElement' &&
				node.name.type === 'JSXIdentifier' &&
				/^[a-z]+$/.test(node.name.name) &&
				node.attributes.some(
					(attr) =>
						attr.type === 'JSXAttribute' &&
						attr.name.name === 'ref' &&
						attr.value?.expression?.type === 'Identifier' &&
						attr.value.expression.name === ref.name,
				)
			)
				hosts++;
		},
		AST_SKIP_KEYS,
	);
	if (dynamic || setterUses !== 2 || hosts !== 1 || refUses !== 3) return;
	const importEdits = snapshotImport(effect.callback.scope, init, call);
	if (importEdits === false) return;
	const type = init.typeArguments ?? init.typeParameters;
	const generic = type ? source.slice(type.start, type.end) : '';
	const replacement = `useLayoutSnapshot${generic}(() => ${source.slice(measurement.start, measurement.end)}, { initial: ${source.slice(initial.start, initial.end)} })`;
	return [
		...importEdits,
		{ start: id.start, end: id.end, text: value.name },
		{ start: init.start, end: init.end, text: replacement },
		{ start: state.end, end: statements[index].end, text: '' },
	];
}

const NESTED_FUNCTIONS = new Set([
	'ArrowFunctionExpression',
	'FunctionDeclaration',
	'FunctionExpression',
]);

/**
 * Does the effect's own synchronous setup read the committed layout? Nested
 * functions are skipped: a returned cleanup, a frame callback, or a listener
 * runs at another time, so its reads say nothing about the value setup stores.
 * Writes such as `el.scrollTop = 0` are not measurements either.
 *
 * @param {any} callback an effect callback
 * @returns {boolean}
 */
export function readsLayout(callback) {
	const body = callback?.body;
	if (body == null) return false;
	/** @param {any} node */
	const visit = (node) => {
		if (node == null || typeof node !== 'object') return false;
		if (Array.isArray(node)) return node.some(visit);
		if (typeof node.type !== 'string' || NESTED_FUNCTIONS.has(node.type)) return false;
		if (
			node.type === 'AssignmentExpression' &&
			node.operator === '=' &&
			unwrap(node.left)?.type === 'MemberExpression'
		) {
			// The target is written, not read; its object and the value still run.
			return visit(unwrap(node.left).object) || visit(node.right);
		}
		if (node.type === 'MemberExpression' && node.computed !== true) {
			const name = node.property?.name;
			if (LAYOUT_PROPERTIES.has(name) || LAYOUT_METHODS.has(name)) return true;
		} else if (
			node.type === 'CallExpression' &&
			node.callee?.type === 'Identifier' &&
			LAYOUT_METHODS.has(node.callee.name)
		) {
			return true;
		}
		for (const key in node) {
			if (!WALK_SKIP_KEYS.has(key) && !key.startsWith('_octane') && visit(node[key])) return true;
		}
		return false;
	};
	return visit(body);
}
