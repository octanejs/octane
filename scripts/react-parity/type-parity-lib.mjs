import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { is, parseSourceFile, ScriptKind } from '../octane-tsc/native-syntax.mjs';
import { printFileWithoutComments, printNodeWithoutComments } from './native-typescript-lib.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const posix = (value) => value.split(sep).join('/');

function listFiles(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.test-d.ts'))
		.map((entry) => posix(relative(root, resolve(entry.parentPath ?? entry.path, entry.name))))
		.sort();
}

function text(node) {
	return printNodeWithoutComments(node).replace(/\s+/g, ' ').trim();
}

// The classic `isStatement`: TypeScript 7's also accepts the block that is a
// function body or a try, catch or finally clause.
function isStatement(node) {
	if (!is.isBlock(node)) return is.isStatement(node);
	return (
		!is.isTryStatement(node.parent) &&
		!is.isCatchClause(node.parent) &&
		!is.isSignatureDeclaration(node.parent)
	);
}

function literalName(node) {
	return node && (is.isStringLiteral(node) || is.isNoSubstitutionTemplateLiteral(node))
		? node.text
		: undefined;
}

function calleeName(call) {
	if (is.isIdentifier(call.expression)) return call.expression.text;
	if (is.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
	return undefined;
}

function isRootedAtExpectTypeOf(node) {
	if (is.isCallExpression(node)) {
		if (is.isIdentifier(node.expression) && node.expression.text === 'expectTypeOf') return true;
		return isRootedAtExpectTypeOf(node.expression);
	}
	if (is.isPropertyAccessExpression(node)) return isRootedAtExpectTypeOf(node.expression);
	return false;
}

function outerExpectTypeOfCalls(node) {
	const calls = [];
	function visit(current) {
		if (is.isCallExpression(current) && isRootedAtExpectTypeOf(current)) {
			const parent = current.parent;
			if (
				!(is.isPropertyAccessExpression(parent) && parent.expression === current) &&
				!(is.isCallExpression(parent) && parent.expression === current)
			)
				calls.push(current);
			return;
		}
		current.forEachChild(visit);
	}
	visit(node);
	return calls;
}

function assertionGroups(source, fileName) {
	const sourceFile = parseSourceFile(fileName, source, ScriptKind.TS);
	const groups = [];
	const describeStack = [];
	function visit(node) {
		if (is.isCallExpression(node) && calleeName(node) === 'describe') {
			const name = literalName(node.arguments[0]);
			const body = node.arguments[1];
			if (name && body && (is.isArrowFunction(body) || is.isFunctionExpression(body))) {
				describeStack.push(name);
				body.body.forEachChild(visit);
				describeStack.pop();
				return;
			}
		}
		if (is.isCallExpression(node) && ['test', 'it'].includes(calleeName(node))) {
			const name = literalName(node.arguments[0]);
			const body = node.arguments[1];
			if (name && body && (is.isArrowFunction(body) || is.isFunctionExpression(body))) {
				const identity = [...describeStack, name].join(' > ');
				const assertions = outerExpectTypeOfCalls(body.body).map(
					(call) => `expectTypeOf:${text(call)}`,
				);
				const bodyStart = body.body.getStart(sourceFile);
				const bodyEnd = body.body.getEnd();
				const bodySource = source.slice(bodyStart, bodyEnd);
				for (const match of bodySource.matchAll(/\/\/\s*@ts-expect-error([^\n]*)/g)) {
					const directiveEnd = bodyStart + match.index + match[0].length;
					let followingStatement;
					function findFollowingStatement(current) {
						if (isStatement(current) && current.getStart(sourceFile) >= directiveEnd) {
							if (
								!followingStatement ||
								current.getStart(sourceFile) < followingStatement.getStart(sourceFile)
							)
								followingStatement = current;
						}
						current.forEachChild(findFollowingStatement);
					}
					findFollowingStatement(body.body);
					assertions.push(
						`expect-error:${match[1].trim()}:${followingStatement ? text(followingStatement) : '<missing-statement>'}`,
					);
				}
				groups.push(`group:${identity}`);
				for (const [index, assertion] of assertions.entries())
					groups.push(`assert:${identity}:${index}:${assertion}`);
				return;
			}
		}
		node.forEachChild(visit);
	}
	visit(sourceFile);
	return groups;
}

function mappingsFor(config, fileName) {
	return (config.permittedTransformations ?? []).filter(
		(rule) => rule.kind === 'import-map' && (rule.file === fileName || rule.file === '*'),
	);
}

function structuralSource(source, fileName, side, config) {
	const sourceFile = parseSourceFile(fileName, source, ScriptKind.TS);
	const rules = mappingsFor(config, fileName);
	const replacements = [];
	for (const statement of sourceFile.statements) {
		if (
			(!is.isImportDeclaration(statement) && !is.isExportDeclaration(statement)) ||
			!statement.moduleSpecifier ||
			!is.isStringLiteral(statement.moduleSpecifier)
		)
			continue;
		const specifier = statement.moduleSpecifier.text;
		const rule = rules.find((candidate) =>
			side === 'upstream' ? candidate.from === specifier : candidate.to === specifier,
		);
		if (!rule) continue;
		replacements.push({
			start: statement.moduleSpecifier.getStart(sourceFile) + 1,
			end: statement.moduleSpecifier.getEnd() - 1,
			value: side === 'upstream' ? rule.to : specifier,
		});
	}
	let transformed = source;
	for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
		transformed = `${transformed.slice(0, replacement.start)}${replacement.value}${transformed.slice(replacement.end)}`;
	}
	return printFileWithoutComments(parseSourceFile(fileName, transformed, ScriptKind.TS))
		.replace(/\s+/g, ' ')
		.trim();
}

export function buildTypeInventory(root, config) {
	const upstreamRoot = resolve(root, config.upstreamRoot);
	const adaptedRoot = resolve(root, config.adaptedRoot);
	const upstreamFiles = listFiles(upstreamRoot);
	const adaptedFiles = listFiles(adaptedRoot);
	if (JSON.stringify(upstreamFiles) !== JSON.stringify(adaptedFiles)) {
		throw new Error(
			'type-test file inventories differ; every upstream type artifact needs one adapted counterpart',
		);
	}
	const inventory = { upstream: [], adapted: [] };
	for (const file of upstreamFiles) {
		const upstreamSource = readFileSync(resolve(upstreamRoot, file), 'utf8');
		const adaptedSource = readFileSync(resolve(adaptedRoot, file), 'utf8');
		const upstreamGroups = assertionGroups(upstreamSource, file);
		const adaptedGroups = assertionGroups(adaptedSource, file);
		if (JSON.stringify(upstreamGroups, null, 2) !== JSON.stringify(adaptedGroups, null, 2)) {
			throw new Error(`${file}: assertion groups differ between pristine and adapted type suites`);
		}
		if (
			structuralSource(upstreamSource, file, 'upstream', config) !==
			structuralSource(adaptedSource, file, 'adapted', config)
		) {
			throw new Error(
				`${file}: adapted type test contains a change outside the permitted transformations`,
			);
		}
		inventory.upstream.push({
			path: file,
			sha256: sha256(upstreamSource),
			assertionGroups: upstreamGroups.map(sha256),
		});
		inventory.adapted.push({
			path: file,
			sha256: sha256(adaptedSource),
			assertionGroups: adaptedGroups.map(sha256),
		});
	}
	return inventory;
}

export function verifyPristineOverlays(root, config) {
	for (const pair of config.pristineOverlays ?? []) {
		const upstream = readFileSync(resolve(root, pair.upstream));
		const overlay = readFileSync(resolve(root, pair.overlay));
		if (!upstream.equals(overlay)) {
			throw new Error(`${pair.overlay}: pristine overlay drifted from ${pair.upstream}`);
		}
	}
	return { files: (config.pristineOverlays ?? []).length };
}

export function verifyTypeParity(root, { configPath } = {}) {
	if (!configPath) throw new Error('configPath is required');
	const absoluteConfig = resolve(root, configPath);
	let config;
	try {
		config = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT') throw new Error(`missing type parity config: ${configPath}`);
		throw error;
	}
	verifyPristineOverlays(root, config);
	const inventory = buildTypeInventory(root, config);
	for (const side of ['upstream', 'adapted']) {
		const inventoryPath = resolve(root, config.inventories[side]);
		let recorded;
		try {
			recorded = JSON.parse(readFileSync(inventoryPath, 'utf8'));
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
		if (JSON.stringify(recorded) !== JSON.stringify(inventory[side])) {
			throw new Error(
				`${side} type inventory drifted; review the change and regenerate its inventory`,
			);
		}
	}
	return {
		files: inventory.upstream.length,
		groups: inventory.upstream.reduce((sum, file) => sum + file.assertionGroups.length, 0),
	};
}

export function renderTypeInventories(root, configPath) {
	const config = JSON.parse(readFileSync(resolve(root, configPath), 'utf8'));
	return { config, inventory: buildTypeInventory(root, config) };
}
