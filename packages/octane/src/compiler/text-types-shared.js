/**
 * The parts of Octane's text type facts that do not depend on which TypeScript
 * API produced the program: which authored children are eligible, how an
 * authored child maps to its generated TSX container, which types prove
 * primitive text, and the frozen facts. The classic and TypeScript 7 backends
 * share them so both produce the same facts for the same program.
 */

import nodePath from 'node:path';
import { TEXT_TYPE_FACTS_VERSION, normalizeTextTypeFilename } from './text-type-facts.js';

/** @typedef {{ start: number, end: number, containerStart: number, containerEnd: number }} AuthoredChild */

/**
 * The TypeScript vocabulary the shared analysis reads.
 * @typedef {object} TextTypeHost
 * @property {any} is Node predicates, named as in the classic API.
 * @property {any} TypeFlags
 * @property {(node: any, visit: (node: any) => void) => void} forEachChild
 * @property {(type: any) => readonly any[] | undefined} unionMembersOf
 * @property {(type: any) => readonly any[] | undefined} intersectionMembersOf
 */

const WALK_SKIP = new Set(['metadata', 'loc', 'parent', 'css']);

/**
 * @param {{ tsconfig: string, root?: string }} options
 * @returns {{ configFilename: string, directory: string, rendererRoot: string }}
 */
export function textTypeProjectPaths(options) {
	if (!options || typeof options.tsconfig !== 'string' || options.tsconfig.length === 0) {
		throw new TypeError('createTextTypeProject requires a tsconfig filename.');
	}
	const configFilename = absoluteFilename(options.tsconfig, process.cwd());
	const directory = nodePath.dirname(configFilename);
	// TypeScript resolves relative files from its tsconfig; renderer rules use
	// bundler module IDs, which may be relative to a different project root.
	const rendererRoot =
		options.root === undefined ? directory : absoluteFilename(options.root, process.cwd());
	return { configFilename, directory, rendererRoot };
}

export function absoluteFilename(filename, directory) {
	if (typeof filename !== 'string' || filename.length === 0) {
		throw new TypeError('Octane text type projects require a non-empty filename.');
	}
	return normalizeTextTypeFilename(
		nodePath.resolve(directory, normalizeTextTypeFilename(filename)),
	);
}

export function rendererFilename(filename, directory) {
	const relative = nodePath.relative(directory, filename);
	return relative !== '..' &&
		!relative.startsWith('..' + nodePath.sep) &&
		!nodePath.isAbsolute(relative)
		? '/' + normalizeTextTypeFilename(relative)
		: filename;
}

/** The argument checks every backend's `snapshot` applies before reading anything. */
export function assertSnapshotArguments(file, source) {
	if (!file.endsWith('.tsrx') && !file.endsWith('.tsx')) {
		throw new TypeError('Octane text type snapshots require a .tsrx or .tsx filename.');
	}
	if (source !== undefined && typeof source !== 'string') {
		throw new TypeError('Octane text type snapshot source must be a string.');
	}
}

/** Stable JSON for TypeScript's data-only compiler options, excluding its AST. */
export function stableJson(value) {
	return JSON.stringify(value, (key, entry) => {
		if (key === 'configFile') return undefined;
		if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
			return Object.fromEntries(
				Object.keys(entry)
					.sort()
					.map((name) => [name, entry[name]]),
			);
		}
		return entry;
	});
}

export function validRange(start, end, length) {
	return (
		Number.isSafeInteger(start) &&
		Number.isSafeInteger(end) &&
		start >= 0 &&
		start < end &&
		end <= length
	);
}

/**
 * Select actual authored children, not attributes, dynamic tag names, or an
 * arbitrary expression elsewhere in the module. ESTree offsets and TS offsets
 * are both half-open UTF-16 code-unit ranges.
 * @param {unknown} ast
 * @param {string} source
 * @returns {AuthoredChild[]}
 */
export function authoredChildren(ast, source) {
	const children = [];
	const seen = new WeakSet();
	const visit = (node, parent, key) => {
		if (!node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child, parent, key);
			return;
		}
		// The type-only parser preserves grouping parentheses for editor mappings;
		// the runtime parser intentionally does not. Facts name the expression the
		// runtime compiler will actually adopt, while the full container still owns
		// the exact mapping used below.
		let expression = node.expression;
		while (expression?.type === 'ParenthesizedExpression') expression = expression.expression;
		if (
			node.type === 'JSXExpressionContainer' &&
			(key === 'children' || (parent?.type === 'JSXCodeBlock' && key === 'render')) &&
			expression?.type !== 'JSXEmptyExpression' &&
			validRange(expression?.start, expression?.end, source.length) &&
			validRange(node.start, node.end, source.length) &&
			source[node.start] === '{' &&
			source[node.end - 1] === '}'
		) {
			children.push({
				start: expression.start,
				end: expression.end,
				containerStart: node.start,
				containerEnd: node.end,
			});
		}
		for (const property in node) {
			if (!WALK_SKIP.has(property)) visit(node[property], node, property);
		}
	};
	visit(ast, null, null);
	return children;
}

/** @param {TextTypeHost} host */
function isJsxChild(host, node) {
	const { is } = host;
	return (
		is.isJsxExpression(node) &&
		!!node.expression &&
		!node.dotDotDotToken &&
		!!node.parent &&
		(is.isJsxElement(node.parent) || is.isJsxFragment(node.parent))
	);
}

/** @param {TextTypeHost} host */
export function unparenthesizedExpression(host, expression) {
	while (host.is.isParenthesizedExpression(expression)) expression = expression.expression;
	return expression;
}

/**
 * Every JSX child container of a generated TSX file, keyed by its exact range.
 * @param {TextTypeHost} host
 */
export function indexJsxChildren(host, sourceFile) {
	const children = new Map();
	const visit = (node) => {
		if (isJsxChild(host, node)) {
			children.set(`${node.getStart(sourceFile)}:${node.end}`, node);
		}
		host.forEachChild(node, visit);
	};
	visit(sourceFile);
	return children;
}

/**
 * A container's exact mapping carries its full generated length, even when the
 * printer reformats a multiline expression. Translating an interior offset
 * linearly would be unsafe in that case. Match the complete generated TS JSX
 * container, then ask about its complete inner expression. Multiple distinct
 * matches are ambiguous and deliberately yield no evidence.
 */
export function mappedChild(child, sourceMap, generatedChildren, generatedLength) {
	const matches = new Map();
	for (const [, mapping] of sourceMap.toGeneratedLocation(child.containerStart)) {
		for (let index = 0; index < mapping.sourceOffsets.length; index++) {
			if (
				mapping.sourceOffsets[index] !== child.containerStart ||
				mapping.sourceOffsets[index] + mapping.lengths[index] !== child.containerEnd
			) {
				continue;
			}
			const start = mapping.generatedOffsets[index];
			const end = start + (mapping.generatedLengths?.[index] ?? mapping.lengths[index]);
			if (!validRange(start, end, generatedLength)) continue;
			const key = `${start}:${end}`;
			const node = generatedChildren.get(key);
			if (node !== undefined) matches.set(key, node.expression);
		}
	}
	return matches.size === 1 ? matches.values().next().value : null;
}

/**
 * TypeScript assignability alone is insufficient: `any` and `never` are both
 * assignable to string. A direct child can use the text binding when every
 * possible value is a primitive string, number, or bigint. Keep a distinct
 * string result for the compiler's string-only proofs; a mixed union is text,
 * but it is not evidence for string concatenation. Branded intersections and
 * bounded generic constraints retain their primitive domain. Boxed values,
 * nullish/boolean unions, and unresolved/error types do not.
 *
 * This is a typed-program contract, not runtime validation of inaccurate
 * declarations or values smuggled through `any`.
 * @param {TextTypeHost} host
 */
export function primitiveTextKind(host, type, checker, seen = new Set()) {
	if (!type || seen.has(type)) return 0;
	const { TypeFlags } = host;
	const flags = type.flags;
	if (
		flags &
		(TypeFlags.Any |
			TypeFlags.Unknown |
			TypeFlags.Never |
			TypeFlags.Void |
			TypeFlags.Undefined |
			TypeFlags.Null)
	) {
		return 0;
	}
	if (flags & TypeFlags.StringLike) return 1;
	if (flags & (TypeFlags.NumberLike | TypeFlags.BigIntLike)) return 2;
	if (seen.size >= 64) return 0;
	seen.add(type);
	let result = 0;
	const union = host.unionMembersOf(type);
	const intersection = union === undefined ? host.intersectionMembersOf(type) : undefined;
	if (union !== undefined) {
		if (union.length > 0) {
			result = 1;
			for (const part of union) {
				const kind = primitiveTextKind(host, part, checker, seen);
				if (kind === 0) {
					result = 0;
					break;
				}
				if (kind === 2) result = 2;
			}
		}
	} else if (intersection !== undefined) {
		for (const part of intersection) {
			result = primitiveTextKind(host, part, checker, seen);
			if (result !== 0) break;
		}
	} else {
		const constraint = checker.getBaseConstraintOfType(type);
		if (constraint && constraint !== type)
			result = primitiveTextKind(host, constraint, checker, seen);
	}
	seen.delete(type);
	return result;
}

/** Whether a diagnostic's half-open range `[start, start + length)` touches `[start, end)`. */
export function overlapsDiagnostic(diagnostic, start, end) {
	if (diagnostic.start === undefined || diagnostic.length === undefined) return true;
	if (diagnostic.length === 0) return diagnostic.start >= start && diagnostic.start <= end;
	return diagnostic.start < end && diagnostic.start + diagnostic.length > start;
}

function freezeRanges(ranges) {
	const unique = new Map();
	for (const [start, end] of ranges) unique.set(`${start}:${end}`, [start, end]);
	const sorted = [...unique.values()].sort(
		(left, right) => left[0] - right[0] || left[1] - right[1],
	);
	return Object.freeze(sorted.map((range) => Object.freeze(range)));
}

export function freezeFacts(filename, record, projectVersion, stringRanges, primitiveRanges) {
	return Object.freeze({
		version: TEXT_TYPE_FACTS_VERSION,
		filename,
		sourceVersion: record.version,
		projectVersion,
		stringChildRanges: freezeRanges(stringRanges),
		primitiveTextChildRanges: freezeRanges(primitiveRanges),
	});
}
