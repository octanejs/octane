import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const posix = (value) => value.split(sep).join('/');
const printer = ts.createPrinter({ removeComments: true });

function listFiles(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.test-d.ts'))
		.map((entry) => posix(relative(root, resolve(entry.parentPath ?? entry.path, entry.name))))
		.sort();
}

function text(node, sourceFile) {
	return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).replace(/\s+/g, ' ').trim();
}

function literalName(node) {
	return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
		? node.text
		: undefined;
}

function calleeName(call) {
	if (ts.isIdentifier(call.expression)) return call.expression.text;
	if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
	return undefined;
}

function isRootedAtExpectTypeOf(node) {
	if (ts.isCallExpression(node)) {
		if (ts.isIdentifier(node.expression) && node.expression.text === 'expectTypeOf') return true;
		return isRootedAtExpectTypeOf(node.expression);
	}
	if (ts.isPropertyAccessExpression(node)) return isRootedAtExpectTypeOf(node.expression);
	return false;
}

function outerExpectTypeOfCalls(node) {
	const calls = [];
	function visit(current) {
		if (ts.isCallExpression(current) && isRootedAtExpectTypeOf(current)) {
			const parent = current.parent;
			if (
				!(ts.isPropertyAccessExpression(parent) && parent.expression === current) &&
				!(ts.isCallExpression(parent) && parent.expression === current)
			)
				calls.push(current);
			return;
		}
		ts.forEachChild(current, visit);
	}
	visit(node);
	return calls;
}

function assertionGroups(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const groups = [];
	const describeStack = [];
	function visit(node) {
		if (ts.isCallExpression(node) && calleeName(node) === 'describe') {
			const name = literalName(node.arguments[0]);
			const body = node.arguments[1];
			if (name && body && (ts.isArrowFunction(body) || ts.isFunctionExpression(body))) {
				describeStack.push(name);
				ts.forEachChild(body.body, visit);
				describeStack.pop();
				return;
			}
		}
		if (ts.isCallExpression(node) && ['test', 'it'].includes(calleeName(node))) {
			const name = literalName(node.arguments[0]);
			const body = node.arguments[1];
			if (name && body && (ts.isArrowFunction(body) || ts.isFunctionExpression(body))) {
				const identity = [...describeStack, name].join(' > ');
				const assertions = outerExpectTypeOfCalls(body.body).map(
					(call) => `expectTypeOf:${text(call, sourceFile)}`,
				);
				const bodyStart = body.body.getStart(sourceFile);
				const bodyEnd = body.body.getEnd();
				const bodySource = source.slice(bodyStart, bodyEnd);
				for (const match of bodySource.matchAll(/\/\/\s*@ts-expect-error([^\n]*)/g)) {
					const directiveEnd = bodyStart + match.index + match[0].length;
					let followingStatement;
					function findFollowingStatement(current) {
						if (ts.isStatement(current) && current.getStart(sourceFile) >= directiveEnd) {
							if (
								!followingStatement ||
								current.getStart(sourceFile) < followingStatement.getStart(sourceFile)
							)
								followingStatement = current;
						}
						ts.forEachChild(current, findFollowingStatement);
					}
					findFollowingStatement(body.body);
					assertions.push(
						`expect-error:${match[1].trim()}:${followingStatement ? text(followingStatement, sourceFile) : '<missing-statement>'}`,
					);
				}
				groups.push(`group:${identity}`);
				for (const [index, assertion] of assertions.entries())
					groups.push(`assert:${identity}:${index}:${assertion}`);
				return;
			}
		}
		ts.forEachChild(node, visit);
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
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const rules = mappingsFor(config, fileName);
	const replacements = [];
	for (const statement of sourceFile.statements) {
		if (
			(!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) ||
			!statement.moduleSpecifier ||
			!ts.isStringLiteral(statement.moduleSpecifier)
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
	return printer
		.printFile(
			ts.createSourceFile(fileName, transformed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
		)
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
