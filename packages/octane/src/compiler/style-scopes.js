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
 * assignment runs after `let x` (no TDZ) and before the template reads `x`.
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
	const otherRefs = [];
	for (let i = 0; i < refs.length; i++) {
		const expression = getRefAttributeExpression(refs[i]);
		if (expression && expression.type === 'Identifier') identifierRefs.push(expression);
		else otherRefs.push(refs[i]);
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

/**
 * Append onto a `@{ … }` setup list; insert before the first top-level
 * `return` of a React-style function. Both placements run after `let x` and
 * before the template that reads `x`.
 *
 * @param {any} componentNode
 * @param {any[]} statements
 * @returns {any}
 */
function graftSetupStatements(componentNode, statements) {
	const body = componentNode.body;
	if (!body) return componentNode;
	if (body.type === 'JSXCodeBlock') {
		return {
			...componentNode,
			body: {
				...body,
				body: [...(body.body || []), ...statements],
			},
		};
	}
	if (body.type === 'BlockStatement') {
		return {
			...componentNode,
			body: {
				...body,
				body: insertBeforeFirstReturn(body.body || [], statements),
			},
		};
	}
	return componentNode;
}

/** @param {any[]} list @param {any[]} statements @returns {any[]} */
function insertBeforeFirstReturn(list, statements) {
	let index = -1;
	for (let i = 0; i < list.length; i++) {
		if (list[i] && list[i].type === 'ReturnStatement') {
			index = i;
			break;
		}
	}
	if (index === -1) return [...list, ...statements];
	return [...list.slice(0, index), ...statements, ...list.slice(index)];
}
