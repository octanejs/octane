// Migration guidance for Strong diagnostics: where each code is documented,
// which React idioms have a dedicated replacement, and the source edits that
// apply one mechanically.
//
// An edit is offered only where applying it verbatim cannot change what the
// module means beyond the replacement the message names: adjacent statements,
// no interleaved comments, and an existing `octane` import to extend. Anything
// else keeps the message and leaves the rewrite to the author.

/** The website page whose per-code anchors document every Strong diagnostic. */
export const STRONG_DOCS_URL = 'https://octanejs.dev/docs/strong-mode';

/**
 * @param {string} code e.g. `OCTANE_STRONG_RENDER_REF_READ`
 * @returns {string}
 */
export function strongDocsUrl(code) {
	return `${STRONG_DOCS_URL}#${code.toLowerCase().replaceAll('_', '-')}`;
}

const WALK_SKIP_KEYS = new Set([
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
	'typeArguments',
]);

function walk(node, visit) {
	if (node == null || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) walk(child, visit);
		return;
	}
	if (typeof node.type !== 'string') return;
	visit(node);
	for (const key in node) {
		if (!WALK_SKIP_KEYS.has(key) && !key.startsWith('_octane')) walk(node[key], visit);
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

const PRIMARY_EXPRESSIONS = new Set([
	'ArrayExpression',
	'CallExpression',
	'Identifier',
	'JSXElement',
	'JSXFragment',
	'Literal',
	'MemberExpression',
	'ParenthesizedExpression',
	'TaggedTemplateExpression',
	'TemplateLiteral',
]);

/**
 * Replace `useMemo(() => value, deps)` with `value` and
 * `useCallback(fn, deps)` with `fn`. A block-bodied memo factory other than a
 * single `return` keeps its message only.
 *
 * @param {any} call
 * @param {'useMemo' | 'useCallback'} name
 * @param {string} source
 */
export function manualMemoSuggestion(call, name, source) {
	const callback = unwrap(call.arguments?.[0]);
	const message =
		name === 'useMemo'
			? 'Write the calculation as a plain expression; Strong compilation caches it.'
			: 'Pass the function directly; Strong compilation keeps its identity stable.';
	if (callback == null || call.arguments.some((argument) => argument.type === 'SpreadElement')) {
		return { message };
	}
	if (name === 'useCallback') {
		return {
			message,
			edits: [
				{ start: call.start, end: call.end, text: source.slice(callback.start, callback.end) },
			],
		};
	}
	if (
		callback.type !== 'ArrowFunctionExpression' ||
		callback.async === true ||
		callback.params.length > 0
	) {
		return { message };
	}
	let body = callback.body;
	if (body?.type === 'BlockStatement') {
		const only = body.body?.length === 1 ? body.body[0] : null;
		if (only?.type !== 'ReturnStatement' || only.argument == null) return { message };
		body = only.argument;
	}
	const text = source.slice(body.start, body.end);
	if (FUNCTION_SCOPE_WORDS.test(text)) return { message };
	// The call was a primary expression, so anything that binds less tightly
	// keeps that grouping in parentheses: `useMemo(() => !a, []).b` is `(!a).b`.
	const parenthesize = !PRIMARY_EXPRESSIONS.has(body.type);
	return {
		message,
		edits: [{ start: call.start, end: call.end, text: parenthesize ? `(${text})` : text }],
	};
}

// Properties and calls that read the committed layout. A state update in an
// effect that reads one of these is a measurement, which useLayoutSnapshot owns.
const LAYOUT_PROPERTIES = new Set([
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
const LAYOUT_METHODS = new Set(['getBoundingClientRect', 'getClientRects', 'getComputedStyle']);

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
