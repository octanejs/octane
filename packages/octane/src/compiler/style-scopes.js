/**
 * Style-block `ref` lowering.
 *
 * `@tsrx/core` JSX targets write a `<style>` block's class-map object
 * (`{ card: "tsrx-… card", … }`) to `ref={x}` — assignment, callback, or a
 * `current`/`value` ref — through `createStyleRefSetupStatements`. Octane's
 * scope pass used to strip the block and never emit that write.
 *
 * The class map is already produced from the prepared sheets (same hash the
 * scoping pass stamps on elements). This module turns each authored `ref`
 * into setup statements and grafts them onto the component body so the
 * assignment runs after `let x` (no TDZ) and before every template that
 * reads `x`, including nested `if`/`switch` returns.
 *
 * Identifier refs get a small hybrid of the core helper's two paths: a
 * function is called, a `current`/`value` object is written, and anything
 * else (the issue's `let classes`) is assigned. Other shapes go through
 * `createStyleRefSetupStatements` unchanged.
 */

import {
	builders as b,
	clone_ast_node as cloneAstNode,
	collectStyleRefAttributes,
	createStyleClassMap,
	createStyleClassMapFromStylesheet,
	createStyleRefSetupStatements,
} from '@tsrx/core';

/**
 * Collect `ref` attributes from the style blocks the scope pass already
 * gathered, emit setup that writes the class map, and graft those statements
 * onto the component. No-op when no block carries `ref`. Copy-on-write: the
 * input component node is never modified.
 *
 * @param {any} componentNode
 * @param {{ node: any }[]} styles
 * @param {any[]} preparedSheets
 * @param {{
 *   inheritOriginLoc: (root: any, origin: any) => any,
 *   createTempIdentifier: () => any,
 * }} options
 * @returns {any}
 */
export function applyStyleRefs(componentNode, styles, preparedSheets, options) {
	const refs = [];
	for (let i = 0; i < styles.length; i++) {
		collectStyleRefAttributes(styles[i].node, refs);
	}
	if (refs.length === 0) return componentNode;

	const origin = refs[0];
	const inheritOriginLoc = options.inheritOriginLoc;
	const styleMapName = options.createTempIdentifier();
	const styleMap = inheritOriginLoc(createScopeClassMap(componentNode, preparedSheets), origin);
	const styleMapId = function () {
		return cloneAstNode(styleMapName, false);
	};

	const identifierRefs = [];
	const seenIdentifiers = new Set();
	const otherRefs = [];
	for (let i = 0; i < refs.length; i++) {
		const expression = unwrapExpression(getRefAttributeExpression(refs[i]));
		if (expression && expression.type === 'Identifier') {
			if (seenIdentifiers.has(expression.name)) continue;
			seenIdentifiers.add(expression.name);
			identifierRefs.push(expression);
		} else otherRefs.push(refs[i]);
	}

	const statements = [inheritOriginLoc(b.const(styleMapName, styleMap), origin)];
	for (let i = 0; i < identifierRefs.length; i++) {
		const generated = createIdentifierStyleRefStatements(identifierRefs[i], styleMapId());
		for (let j = 0; j < generated.length; j++) {
			statements.push(inheritOriginLoc(generated[j], origin));
		}
	}
	if (otherRefs.length > 0) {
		const generated = createStyleRefSetupStatements(otherRefs, styleMapId(), {
			allowMutableRefTarget: true,
			createTempIdentifier: options.createTempIdentifier,
		});
		for (let i = 0; i < generated.length; i++) {
			statements.push(inheritOriginLoc(generated[i], origin));
		}
	}
	return graftSetupStatements(componentNode, statements);
}

/**
 * One object for every class the prepared sheets expose. A single sheet that
 * already carries `topScopedClasses` (sibling-scope metadata) reuses the
 * core helper that reads that table; otherwise each sheet is lowered with
 * `createStyleClassMapFromStylesheet` and the properties are merged.
 *
 * @param {any} componentNode
 * @param {any[]} preparedSheets
 * @returns {any}
 */
function createScopeClassMap(componentNode, preparedSheets) {
	if (
		preparedSheets.length === 1 &&
		componentNode.metadata &&
		componentNode.metadata.topScopedClasses
	) {
		return createStyleClassMap(componentNode, preparedSheets[0]);
	}
	if (preparedSheets.length === 1) {
		return createStyleClassMapFromStylesheet(preparedSheets[0]);
	}
	const seen = new Set();
	const properties = [];
	for (let i = 0; i < preparedSheets.length; i++) {
		const map = createStyleClassMapFromStylesheet(preparedSheets[i]);
		const props = map.properties || [];
		for (let j = 0; j < props.length; j++) {
			const key = classMapPropertyKey(props[j]);
			if (key === null || seen.has(key)) continue;
			seen.add(key);
			properties.push(props[j]);
		}
	}
	return b.object(properties);
}

/** @param {any} property @returns {string | null} */
function classMapPropertyKey(property) {
	const key = property && property.key;
	if (!key) return null;
	if (key.type === 'Literal' || key.type === 'StringLiteral') {
		return typeof key.value === 'string' ? key.value : null;
	}
	if (key.type === 'Identifier') return key.name;
	return null;
}

/**
 * `ref={x}` where `x` is a binding: call a function, write `current`/`value`
 * on a ref object, otherwise assign the map (the `let classes` form).
 *
 * @param {any} source
 * @param {any} styleMap
 * @returns {any[]}
 */
function createIdentifierStyleRefStatements(source, styleMap) {
	const name = source.name;
	const id = function () {
		return b.id(name);
	};
	const map = function () {
		return cloneAstNode(styleMap, false);
	};
	return [
		b.if(
			b.binary('===', b.unary('typeof', id()), b.literal('function')),
			b.block([b.stmt(b.call(id(), map()))]),
			b.if(
				b.logical('&&', id(), b.binary('===', b.unary('typeof', id()), b.literal('object'))),
				b.block([
					b.if(
						b.binary('in', b.literal('current'), id()),
						b.block([b.stmt(b.assignment('=', b.member(id(), 'current'), map()))]),
						b.if(
							b.binary('in', b.literal('value'), id()),
							b.block([b.stmt(b.assignment('=', b.member(id(), 'value'), map()))]),
							b.block([b.stmt(b.assignment('=', id(), map()))]),
						),
					),
				]),
				b.block([b.stmt(b.assignment('=', id(), map()))]),
			),
		),
	];
}

/** @param {any} attr @returns {any | null} */
function getRefAttributeExpression(attr) {
	const value = attr && attr.value;
	if (!value) return null;
	if (value.type === 'JSXExpressionContainer') {
		return value.expression && value.expression.type === 'JSXEmptyExpression'
			? null
			: value.expression;
	}
	return value;
}

/** @param {any} node @returns {any} */
function unwrapExpression(node) {
	let current = node;
	while (
		current &&
		(current.type === 'TSAsExpression' ||
			current.type === 'TSTypeAssertion' ||
			current.type === 'TSNonNullExpression' ||
			current.type === 'TSSatisfiesExpression' ||
			current.type === 'ParenthesizedExpression')
	) {
		current = current.expression;
	}
	return current;
}

/**
 * Clone the setup template for one insertion site. `inheritOriginLoc` mutates
 * nodes in place, so each graft must own its own statement copies.
 *
 * @param {any[]} statements
 * @returns {any[]}
 */
function cloneSetupStatements(statements) {
	const cloned = [];
	for (let i = 0; i < statements.length; i++) {
		cloned.push(cloneAstNode(statements[i], false));
	}
	return cloned;
}

function isNestedFunctionType(type) {
	return (
		type === 'FunctionDeclaration' ||
		type === 'FunctionExpression' ||
		type === 'ArrowFunctionExpression'
	);
}

/**
 * Each graft owns a block so `const __styleMap` is not redeclared in a
 * shared scope (unbraced `switch` cases, or a `@{ }` return plus the
 * fall-through append). The `return` stays a sibling so later return-JSX
 * / SSR passes can still see a top-level `ReturnStatement`.
 *
 * @param {any[]} statements
 * @param {any[]} [extra]
 * @returns {any}
 */
function wrapSetupBlock(statements, extra) {
	const body = cloneSetupStatements(statements);
	if (extra) {
		for (let i = 0; i < extra.length; i++) body.push(extra[i]);
	}
	return b.block(body);
}

/**
 * Insert a cloned setup copy immediately before every owned `return`
 * (if/else/switch/try/loops). Nested function bodies are left alone — those
 * are compiled as their own components. Each write is a block so the
 * `const __styleMap` binding stays local to that site.
 *
 * @param {any} stmt
 * @param {any[]} statements
 * @returns {{ node: any, foundReturn: boolean }}
 */
function graftReturnsInStatement(stmt, statements) {
	if (!stmt) return { node: stmt, foundReturn: false };
	const type = stmt.type;
	if (type === 'ReturnStatement') {
		return { node: wrapSetupBlock(statements, [stmt]), foundReturn: true };
	}
	if (isNestedFunctionType(type)) return { node: stmt, foundReturn: false };
	if (type === 'BlockStatement') {
		const grafted = graftReturnsInList(stmt.body || [], statements);
		return {
			node: grafted.foundReturn ? { ...stmt, body: grafted.list } : stmt,
			foundReturn: grafted.foundReturn,
		};
	}
	if (type === 'IfStatement') {
		const consequent = graftReturnsInStatement(stmt.consequent, statements);
		const alternate = graftReturnsInStatement(stmt.alternate, statements);
		if (!consequent.foundReturn && !alternate.foundReturn) {
			return { node: stmt, foundReturn: false };
		}
		return {
			node: {
				...stmt,
				consequent: consequent.node,
				alternate: alternate.node,
			},
			foundReturn: true,
		};
	}
	if (type === 'SwitchStatement') {
		let foundReturn = false;
		const cases = [];
		const authored = stmt.cases || [];
		for (let i = 0; i < authored.length; i++) {
			const switchCase = authored[i];
			const grafted = graftReturnsInList(switchCase.consequent || [], statements);
			if (grafted.foundReturn) foundReturn = true;
			cases.push(grafted.foundReturn ? { ...switchCase, consequent: grafted.list } : switchCase);
		}
		return {
			node: foundReturn ? { ...stmt, cases } : stmt,
			foundReturn,
		};
	}
	if (type === 'TryStatement') {
		const block = graftReturnsInStatement(stmt.block, statements);
		const handlerBody = stmt.handler
			? graftReturnsInStatement(stmt.handler.body, statements)
			: { node: null, foundReturn: false };
		const finalizer = graftReturnsInStatement(stmt.finalizer, statements);
		if (!block.foundReturn && !handlerBody.foundReturn && !finalizer.foundReturn) {
			return { node: stmt, foundReturn: false };
		}
		return {
			node: {
				...stmt,
				block: block.node,
				handler:
					stmt.handler && handlerBody.foundReturn
						? { ...stmt.handler, body: handlerBody.node }
						: stmt.handler,
				finalizer: finalizer.node,
			},
			foundReturn: true,
		};
	}
	if (
		type === 'ForStatement' ||
		type === 'ForInStatement' ||
		type === 'ForOfStatement' ||
		type === 'WhileStatement' ||
		type === 'DoWhileStatement' ||
		type === 'LabeledStatement' ||
		type === 'WithStatement'
	) {
		const body = graftReturnsInStatement(stmt.body, statements);
		if (!body.foundReturn) return { node: stmt, foundReturn: false };
		return { node: { ...stmt, body: body.node }, foundReturn: true };
	}
	return { node: stmt, foundReturn: false };
}

/**
 * @param {any[]} list
 * @param {any[]} statements
 * @returns {{ list: any[], foundReturn: boolean }}
 */
function graftReturnsInList(list, statements) {
	const next = [];
	let foundReturn = false;
	for (let i = 0; i < list.length; i++) {
		const stmt = list[i];
		if (stmt && stmt.type === 'ReturnStatement') {
			next.push(wrapSetupBlock(statements));
			next.push(stmt);
			foundReturn = true;
			continue;
		}
		const grafted = graftReturnsInStatement(stmt, statements);
		next.push(grafted.node);
		if (grafted.foundReturn) foundReturn = true;
	}
	return { list: next, foundReturn };
}

/**
 * `@{ … }` scopes append setup for the fall-through render and also write
 * before any early `return` in that setup list. React-style functions insert
 * a cloned copy before every owned `return`, including nested if/else/switch
 * arms — not only the first top-level one. Both placements run after `let x`
 * and before the template that reads `x`.
 *
 * @param {any} componentNode
 * @param {any[]} statements
 * @returns {any}
 */
function graftSetupStatements(componentNode, statements) {
	const body = componentNode.body;
	if (!body) return componentNode;
	if (body.type === 'JSXCodeBlock') {
		const grafted = graftReturnsInList(body.body || [], statements);
		return {
			...componentNode,
			body: {
				...body,
				body: [...grafted.list, wrapSetupBlock(statements)],
			},
		};
	}
	if (body.type === 'BlockStatement') {
		const grafted = graftReturnsInList(body.body || [], statements);
		return {
			...componentNode,
			body: {
				...body,
				body: grafted.foundReturn ? grafted.list : [...grafted.list, wrapSetupBlock(statements)],
			},
		};
	}
	return componentNode;
}
