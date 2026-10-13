import assert from 'node:assert/strict';
import {
	createLexicalAnalysis,
	forEachRuntimeAstChild,
	isIdentifierReference,
} from '../../packages/octane/src/compiler/compile-universal.js';
import { mappedSourcePositions } from './hydration-free-gates.mjs';

// Positional arguments name minimal-import scenarios by id (every bundler's
// build of it) or by name (one build). No argument selects every scenario.
export function selectMinimalScenarios(args, scenarios) {
	for (const argument of args) {
		assert.equal(
			scenarios.some(({ id, name }) => argument === id || argument === name),
			true,
			`Unknown minimal-import scenario: ${argument}`,
		);
	}
	const selectedScenarios = args.length
		? scenarios.filter(({ id, name }) => args.includes(id) || args.includes(name))
		: scenarios;
	assert.notEqual(selectedScenarios.length, 0, 'At least one minimal-import scenario must run');
	return selectedScenarios;
}

// Oxc can finish flag-folding after its final unused declaration pass. Only
// credit that narrow case: every mapped instruction of a retained marker
// parser must belong to a named declaration made entirely from the named pure
// parser sources, and the resulting declarations must have NO references from
// outside that set. This rejects inlining, callback/returned-value escapes,
// calls and aliases just like an ordinary use. Direct eval/with defeats lexical
// proof, so those reject the credit altogether. This does not remove any bytes
// from the measured production JS.
export function unreferencedMarkerDeclarations(code, map, parse, ranges) {
	const ast = parse(code);
	const lexical = createLexicalAnalysis(ast);
	const functions = [];
	const references = [];
	let dynamicScope = false;
	function visit(node, parent, key, owner) {
		if (node === null || typeof node !== 'object' || typeof node.type !== 'string') return;
		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			owner = {
				node,
				scope: lexical.nodeScopes.get(node),
				mapped: new Set(),
				otherSource: false,
			};
			functions.push(owner);
		}
		if (
			node.type === 'WithStatement' ||
			(node.type === 'CallExpression' &&
				node.callee.type === 'Identifier' &&
				node.callee.name === 'eval')
		)
			dynamicScope = true;
		if (node.type === 'Identifier' && isIdentifierReference(node, parent, key, lexical)) {
			references.push({
				name: node.name,
				scope: lexical.resolveBinding(lexical.nodeScopes.get(node), node.name)?.scope,
				owner,
			});
		}
		forEachRuntimeAstChild(node, (child, childKey) => visit(child, node, childKey, owner));
	}
	visit(ast, null, null, null);
	if (dynamicScope) return new Set();
	const lineStarts = [0];
	for (let index = 0; index < code.length; index++)
		if (code.charCodeAt(index) === 10) lineStarts.push(index + 1);
	const mappedOutside = new Set();
	const sourceRanges = map.sources.map((source) => {
		const normalized = String(source).replace(/\\/g, '/');
		const at = normalized.lastIndexOf('/packages/octane/src/');
		return at === -1
			? []
			: ranges.filter(
					({ source }) => source === normalized.slice(at + '/packages/octane/src/'.length),
				);
	});
	for (const [source, line, column, generatedLine, generatedColumn] of mappedSourcePositions(
		map.mappings,
		true,
	)) {
		const mapped = sourceRanges[source].filter(
			(range) =>
				(line > range.startLine || (line === range.startLine && column >= range.startColumn)) &&
				(line < range.endLine || (line === range.endLine && column < range.endColumn)),
		);
		const offset = lineStarts[generatedLine] + generatedColumn;
		// A nested anonymous function cannot disguise inlined marker code as a
		// declaration of its named parent. Use the smallest enclosing function.
		let owner;
		for (const fn of functions) {
			if (
				offset >= fn.node.start &&
				offset < fn.node.end &&
				(owner === undefined || fn.node.end - fn.node.start < owner.node.end - owner.node.start)
			)
				owner = fn;
		}
		if (owner === undefined) {
			for (const { name } of mapped) mappedOutside.add(name);
		} else if (
			mapped.length === 0 &&
			!(
				offset === owner.node.start &&
				sourceRanges[source].some((range) => line === range.startLine && column < range.startColumn)
			)
		) {
			// Maps may point the generated "function" at the original "export"
			// immediately before its declaration. Do not credit any body code
			// outside the declaration; this applies only at its exact start.
			owner.otherSource = true;
		} else {
			for (const { name } of mapped) owner.mapped.add(name);
		}
	}
	const parsers = functions.filter(
		({ node, mapped, otherSource }) =>
			node.type === 'FunctionDeclaration' && node.id !== null && mapped.size > 0 && !otherSource,
	);
	const parserSet = new Set(parsers);
	for (const ref of references) {
		if (parserSet.has(ref.owner)) continue;
		if (parsers.some(({ node, scope }) => node.id.name === ref.name && scope === ref.scope)) {
			// Conservatively reject the entire parser group if even one escapes.
			return new Set();
		}
	}
	const proven = new Set(parsers.flatMap(({ mapped }) => [...mapped]));
	for (const fn of functions) {
		if (!parserSet.has(fn)) for (const name of fn.mapped) proven.delete(name);
	}
	for (const name of mappedOutside) proven.delete(name);
	return proven;
}
