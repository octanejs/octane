#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import ts from 'typescript';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sourceOverridePath = process.env.OCTANE_REACT_MARKDOWN_SOURCE_OVERRIDE_PATH;
const sourceOverrideFile = process.env.OCTANE_REACT_MARKDOWN_SOURCE_OVERRIDE_FILE;
const parameterMapOverrideFile = process.env.OCTANE_REACT_MARKDOWN_PARAMETER_MAP_OVERRIDE_FILE;
if (Boolean(sourceOverridePath) !== Boolean(sourceOverrideFile))
	throw new Error('Both React Markdown source override variables are required');
const sourceOverride = sourceOverrideFile ? readFileSync(sourceOverrideFile) : null;
const readSource = (path) =>
	path === sourceOverridePath && sourceOverride
		? sourceOverride
		: readFileSync(resolve(root, path));
const readJson = (path) =>
	JSON.parse(
		readFileSync(
			path === 'packages/markdown/audit/parameter-row-map.json' && parameterMapOverrideFile
				? parameterMapOverrideFile
				: resolve(root, path),
			'utf8',
		),
	);
const upstream = readJson('packages/markdown/audit/test-inventory.json');
const adapted = readJson('packages/markdown/audit/adapted-runtime.json');
const stableMap = readJson('packages/markdown/audit/adapted-case-map.json');
const parameterRows = readJson('packages/markdown/audit/parameter-row-map.json');
const expectedParameterRowBindings = 54;
if (Object.keys(parameterRows).length !== expectedParameterRowBindings)
	throw new Error(
		`Parameter-row map has ${Object.keys(parameterRows).length} entries, expected ${expectedParameterRowBindings}`,
	);
const requiredTokens = {
	'test.jsx:809:should support plugins (`remark-toc`)': [
		'remarkToc',
		'# a\\n## Contents\\n## b\\n### c\\n## d',
		'href="#c"',
	],
	'test.jsx:1080:should support `MarkdownAsync` (1)': [
		'renderToStaticMarkup',
		'suspended while responding to synchronous input',
		"children: 'a'",
	],
	'test.jsx:1086:should support `MarkdownAsync` (2)': [
		'renderToPipeableStream',
		"children: 'a'",
		"toBe('<p>a</p>')",
	],
	'test.jsx:1099:should support async plugins w/ `MarkdownAsync` (`rehype-starry-night`)': [
		'rehypeStarryNight',
		'console.log(3.14)',
		'class="pl-en"',
	],
};
const requiredDeclarations = {
	'test.jsx:66:should throw w/ non-string children (boolean)':
		'rejects boolean true children with the exact pinned diagnostic',
	'test.jsx:424:should support `allowedElements` (drop unlisted nodes)':
		'matches the exact upstream allowedElements drop fixture',
	'test.jsx:476:should support `unwrapDisallowed` w/ `allowedElements`':
		'matches the exact upstream unwrapDisallowed with allowedElements fixture',
	'test.jsx:760:should pass `node` to components':
		'passes the complete upstream HAST node including child and source positions',
	'test.jsx:809:should support plugins (`remark-toc`)':
		'matches pristine remark-toc output for the upstream fixture',
	'test.jsx:970:should support SVG elements': 'matches the exact upstream SVG projection fixture',
	'test.jsx:1015:should support comments (ignore them)':
		'ignores the exact upstream root comment while preserving the paragraph',
	'test.jsx:1061:should not fail on a plugin replacing `root`':
		'matches the exact upstream root-replaced-by-comment empty output',
	'test.jsx:1080:should support `MarkdownAsync` (1)':
		'documents the synchronous-render framework divergence with the upstream fixture',
	'test.jsx:1086:should support `MarkdownAsync` (2)':
		'matches the upstream pipeable-stream output fixture',
	'test.jsx:1099:should support async plugins w/ `MarkdownAsync` (`rehype-starry-night`)':
		'matches exact starry-night highlighted HTML for the upstream fixture',
};

function uniqueMap(values, key, label) {
	const result = new Map();
	for (const value of values) {
		const identity = value[key];
		if (result.has(identity)) throw new Error(`Duplicate ${label}: ${identity}`);
		result.set(identity, value);
	}
	return result;
}

const upstreamById = uniqueMap(upstream.cases, 'id', 'upstream source-line id');
const adaptedById = uniqueMap(adapted.tests, 'id', 'adapted runtime id');
uniqueMap(adapted.tests, 'fullName', 'adapted full name');
for (const adaptedId of Object.keys(parameterRows))
	if (!adaptedById.has(adaptedId))
		throw new Error(`Parameter-row map owns an unknown adapted runtime id: ${adaptedId}`);
if (Object.keys(stableMap).length !== upstreamById.size) {
	throw new Error(
		`Stable map has ${Object.keys(stableMap).length} entries, expected ${upstreamById.size}`,
	);
}

uniqueMap(
	Object.entries(stableMap).map(([upstreamId, adaptedId]) => ({ upstreamId, adaptedId })),
	'adaptedId',
	'adapted runtime ownership',
);

const hashes = new Map();
function sha256(path) {
	if (!hashes.has(path)) {
		hashes.set(path, createHash('sha256').update(readSource(path)).digest('hex'));
	}
	return hashes.get(path);
}

function deriveUniqueDeclaration(path, fullName) {
	const text = readSource(path).toString();
	const words = fullName.split(/\s+/);
	const fallback = [];
	for (let length = words.length; length > 0; length--) {
		for (let start = 0; start + length <= words.length; start++) {
			const candidate = words.slice(start, start + length).join(' ');
			if (candidate.length < 4) continue;
			const first = text.indexOf(candidate);
			if (first >= 0 && text.indexOf(candidate, first + 1) < 0) {
				const ownerStart = text.lastIndexOf('it.each([', first);
				const arrayEnds =
					ownerStart >= 0
						? [text.indexOf('] as const)(', ownerStart), text.indexOf('])(', ownerStart)].filter(
								(value) => value >= 0,
							)
						: [];
				const arrayEnd = Math.min(...arrayEnds);
				if (ownerStart >= 0 && arrayEnd > first) return candidate;
				fallback.push(candidate);
			}
		}
	}
	if (fallback.length > 0) return fallback[0];
	throw new Error(`No unique declaration material for ${path}: ${fullName}`);
}

function staticParameterValue(node) {
	while (
		node &&
		(ts.isAsExpression(node) ||
			ts.isParenthesizedExpression(node) ||
			ts.isSatisfiesExpression(node))
	)
		node = node.expression;
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
	if (ts.isNumericLiteral(node)) return Number(node.text);
	if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
	if (node.kind === ts.SyntaxKind.NullKeyword) return null;
	if (ts.isIdentifier(node) && node.text === 'undefined') return undefined;
	throw new Error(`Parameterized title uses a non-static value: ${node.getText()}`);
}

function expandParameterizedTitle(template, row) {
	const values = ts.isArrayLiteralExpression(row) ? row.elements : [row];
	let index = 0;
	const expanded = template.replace(/%[sj]/g, (placeholder) => {
		if (index >= values.length) throw new Error(`Missing value for ${placeholder}: ${template}`);
		const value = staticParameterValue(values[index++]);
		if (placeholder === '%j') {
			const json = JSON.stringify(value);
			return json === undefined ? 'undefined' : json;
		}
		return String(value);
	});
	if (index === 0) throw new Error(`Parameterized title has no supported placeholder: ${template}`);
	return expanded;
}

function declarationEvidence(path, fullName, declaration, explicit, binding) {
	const text = readSource(path).toString();
	if (binding) {
		const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
		const matches = [];
		const unwrap = (node) => {
			while (
				node &&
				(ts.isAsExpression(node) ||
					ts.isParenthesizedExpression(node) ||
					ts.isSatisfiesExpression(node))
			)
				node = node.expression;
			return node;
		};
		const visit = (node) => {
			if (
				ts.isCallExpression(node) &&
				ts.isCallExpression(node.expression) &&
				ts.isPropertyAccessExpression(node.expression.expression) &&
				node.expression.expression.name.text === 'each'
			) {
				const array = unwrap(node.expression.arguments[0]);
				const template = node.arguments[0];
				if (
					array &&
					ts.isArrayLiteralExpression(array) &&
					template &&
					ts.isStringLiteral(template) &&
					template.text === binding.template
				)
					matches.push({ node, array, template });
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
		if (matches.length !== 1)
			throw new Error(`Missing or ambiguous it.each template: ${binding.template}`);
		const match = matches[0];
		const row = match.array.elements[binding.rowIndex];
		if (!row || !match.node.arguments[1])
			throw new Error(`Missing it.each row ${binding.rowIndex}: ${binding.template}`);
		const rowSha256 = createHash('sha256').update(row.getFullText(source)).digest('hex');
		if (rowSha256 !== binding.rowSha256)
			throw new Error(
				`Parameter row ${binding.rowIndex} does not match its independently pinned fixture`,
			);
		const expandedTitle = expandParameterizedTitle(binding.template, row);
		if (!fullName.endsWith(expandedTitle))
			throw new Error(
				`Parameter row ${binding.rowIndex} expands to ${JSON.stringify(expandedTitle)}, not runtime identity ${JSON.stringify(fullName)}`,
			);
		return {
			declaration: binding.template,
			kind: 'parameter-row',
			rowIndex: binding.rowIndex,
			blockSha256: rowSha256,
			templateSha256: createHash('sha256').update(match.template.getFullText(source)).digest('hex'),
			callbackSha256: createHash('sha256')
				.update(match.node.arguments[1].getFullText(source))
				.digest('hex'),
		};
	}
	const start = text.indexOf(declaration);
	if (start < 0) throw new Error(`Missing adapted declaration: ${declaration}`);
	if (text.indexOf(declaration, start + 1) >= 0)
		throw new Error(`Ambiguous adapted declaration: ${declaration}`);
	if (!explicit) {
		const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
		let ownership;
		function unwrap(node) {
			while (
				node &&
				(ts.isAsExpression(node) ||
					ts.isParenthesizedExpression(node) ||
					ts.isSatisfiesExpression(node))
			)
				node = node.expression;
			return node;
		}
		function visit(node) {
			if (
				ts.isCallExpression(node) &&
				ts.isCallExpression(node.expression) &&
				ts.isPropertyAccessExpression(node.expression.expression) &&
				node.expression.expression.name.text === 'each'
			) {
				const array = unwrap(node.expression.arguments[0]);
				if (
					array &&
					ts.isArrayLiteralExpression(array) &&
					start >= array.getStart(source) &&
					start < array.end
				) {
					const rows = array.elements.filter(
						(row) => start >= row.getStart(source) && start < row.end,
					);
					if (rows.length !== 1 || ownership)
						throw new Error(`Ambiguous parameter row: ${declaration}`);
					if (!node.arguments[0] || !node.arguments[1])
						throw new Error(`Missing it.each template/callback: ${declaration}`);
					ownership = {
						row: rows[0].getFullText(source),
						rowIndex: array.elements.indexOf(rows[0]),
						template: node.arguments[0].getFullText(source),
						callback: node.arguments[1].getFullText(source),
					};
				}
			}
			ts.forEachChild(node, visit);
		}
		visit(source);
		const lineStart = text.lastIndexOf('\n', start) + 1;
		const lineEnd = text.indexOf('\n', start);
		const block = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
		return {
			declaration,
			kind: ownership ? 'parameter-row' : 'line',
			blockSha256: createHash('sha256')
				.update(ownership?.row || block)
				.digest('hex'),
			templateSha256: ownership
				? createHash('sha256').update(ownership.template).digest('hex')
				: null,
			callbackSha256: ownership
				? createHash('sha256').update(ownership.callback).digest('hex')
				: null,
			rowIndex: ownership?.rowIndex ?? null,
		};
	}
	const ends = [text.indexOf('\n\t});', start), text.indexOf('\n});', start)].filter(
		(value) => value >= 0,
	);
	const end = Math.min(...ends);
	if (!Number.isFinite(end)) throw new Error(`Unterminated adapted declaration: ${declaration}`);
	const block = text.slice(start, end + 5);
	return {
		declaration,
		kind: 'block',
		blockSha256: createHash('sha256').update(block).digest('hex'),
	};
}

const cases = Object.entries(stableMap).map(([upstreamId, adaptedId]) => {
	const source = upstreamById.get(upstreamId);
	if (!source) throw new Error(`Invented upstream source-line id: ${upstreamId}`);
	const evidence = adaptedById.get(adaptedId);
	if (!evidence) throw new Error(`Missing adapted runtime id for ${upstreamId}: ${adaptedId}`);
	const explicitDeclaration = requiredDeclarations[upstreamId];
	const parameterBinding = parameterRows[adaptedId];
	const declaration =
		parameterBinding?.template ||
		explicitDeclaration ||
		deriveUniqueDeclaration(evidence.file, evidence.fullName);
	const sourceSha256 = sha256(evidence.file);
	const ownershipSha256 = createHash('sha256')
		.update([upstreamId, adaptedId, evidence.file, evidence.fullName, sourceSha256].join('\0'))
		.digest('hex');
	const proof = declarationEvidence(
		evidence.file,
		evidence.fullName,
		declaration,
		Boolean(explicitDeclaration),
		parameterBinding,
	);
	if (proof.kind === 'parameter-row' && !parameterBinding)
		throw new Error(`Unpinned parameter-row runtime identity: ${adaptedId}`);
	return {
		upstreamId,
		upstreamTitle: source.title,
		requiredTokens: requiredTokens[upstreamId] || [],
		declarationEvidence: proof,
		identityEvidence: { runtimeId: adaptedId, ownershipSha256 },
		adapted: [{ ...evidence, sourceSha256 }],
	};
});

const destination = resolve(root, 'packages/markdown/audit/adapted-case-crosswalk.json');
writeFileSync(
	destination,
	await format(JSON.stringify({ schemaVersion: 2, cases }), {
		...(await resolveConfig(destination)),
		filepath: destination,
	}),
);
console.log(`${destination}: ${cases.length} stable upstream-id to runtime-id mappings`);
