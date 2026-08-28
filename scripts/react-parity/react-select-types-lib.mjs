import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export const TYPE_PARITY_CONFIG = 'packages/select/audit/type-parity.json';

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function posix(value) {
	return value.split(sep).join('/');
}

function compilerProgramFiles(root, projectPath) {
	const configPath = resolve(root, projectPath);
	if (!existsSync(configPath)) {
		throw new Error(`missing compiler project: ${projectPath}`);
	}
	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
	if (configFile.error) {
		throw new Error(
			`failed to read ${projectPath}: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`,
		);
	}
	const parsed = ts.parseJsonConfigFileContent(
		configFile.config,
		ts.sys,
		dirname(configPath),
		undefined,
		configPath,
	);
	if (parsed.errors.length > 0) {
		throw new Error(
			`failed to parse ${projectPath}: ${ts.flattenDiagnosticMessageText(parsed.errors[0].messageText, '\n')}`,
		);
	}
	return new Set(
		parsed.fileNames.map(function toRepoPath(fileName) {
			return posix(relative(root, fileName));
		}),
	);
}

function assertFilesBelongToProgram(root, relativeFiles, projectPath, label) {
	const programFiles = compilerProgramFiles(root, projectPath);
	for (const relativeFile of relativeFiles) {
		const repoPath = posix(relativeFile);
		if (!programFiles.has(repoPath)) {
			throw new Error(
				`${label}: inventoried file ${repoPath} is not included in compiler program ${projectPath}`,
			);
		}
	}
}

function verifyInventoriedFilesBelongToPrograms(root, config, inventory) {
	const pristineProject = config.lanes?.pristine?.project;
	const adaptedProject = config.lanes?.adapted?.project;
	if (typeof pristineProject !== 'string' || typeof adaptedProject !== 'string') {
		throw new Error(
			'type-parity.json must declare lanes.pristine.project and lanes.adapted.project',
		);
	}
	assertFilesBelongToProgram(
		root,
		inventory.upstream.map(function toPath(entry) {
			return entry.path;
		}),
		pristineProject,
		'pristine type suite',
	);
	assertFilesBelongToProgram(
		root,
		inventory.adapted.map(function toPath(entry) {
			return entry.path;
		}),
		adaptedProject,
		'adapted type suite',
	);
}

function normalizeComment(comment) {
	return comment
		.replace(/^\/\*\*|\*\/$/g, '')
		.replace(/^\s*\*\s?/gm, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function containsExpect(node) {
	if (ts.isIdentifier(node) && node.text === 'Expect') return true;
	return node.getChildren().some(containsExpect);
}

export function assertionGroups(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const printer = ts.createPrinter({ removeComments: true });
	const groups = [];
	for (const match of source.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
		groups.push(`doc:${normalizeComment(match[0])}`);
	}
	for (const match of source.matchAll(/\/\/\s*@ts-expect-error([^\n]*)\n\s*([^\n]+)/g)) {
		groups.push(`expect-error:${match[1].trim()}:${match[2].replace(/\s+/g, ' ').trim()}`);
	}
	function visit(node) {
		if (ts.isTypeAliasDeclaration(node) && node.type && containsExpect(node.type)) {
			groups.push(
				`expect:${node.name.text}:${printer.printNode(ts.EmitHint.Unspecified, node.type, sourceFile).replace(/\s+/g, ' ').trim()}`,
			);
		}
		if (ts.isVariableStatement(node)) {
			groups.push(
				`var:${printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).replace(/\s+/g, ' ').trim()}`,
			);
		}
		if (ts.isExpressionStatement(node)) {
			groups.push(
				`expr:${printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).replace(/\s+/g, ' ').trim()}`,
			);
		}
		if (ts.isFunctionDeclaration(node) && node.name) {
			groups.push(
				`fn:${printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).replace(/\s+/g, ' ').trim()}`,
			);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return groups;
}

const IMPORT_CANONICAL = new Map([
	['react-select', '#rs-root'],
	['react-select/async', '#rs-async'],
	['react-select/creatable', '#rs-creatable'],
	['react-select/async-creatable', '#rs-async-creatable'],
	['react-select/base', '#rs-base'],
	['react-select/animated', '#rs-animated'],
	['../src/index', '#rs-root'],
	['../src/async.tsrx', '#rs-async'],
	['../src/creatable.tsrx', '#rs-creatable'],
	['../src/async-creatable.tsrx', '#rs-async-creatable'],
	['../src/base', '#rs-base'],
	['../src/animated/index', '#rs-animated'],
]);

function normalizeSpecifier(specifier) {
	return IMPORT_CANONICAL.get(specifier) ?? specifier;
}

export function structuralSource(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const replacements = [];
	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
			continue;
		}
		const specifier = statement.moduleSpecifier.text;
		const normalized = normalizeSpecifier(specifier);
		if (normalized === specifier) continue;
		replacements.push({
			start: statement.moduleSpecifier.getStart(sourceFile) + 1,
			end: statement.moduleSpecifier.getEnd() - 1,
			value: normalized,
		});
	}
	let transformed = source;
	for (const replacement of replacements.sort(function byStartDesc(a, b) {
		return b.start - a.start;
	})) {
		transformed = `${transformed.slice(0, replacement.start)}${replacement.value}${transformed.slice(replacement.end)}`;
	}
	const normalizedFile = ts.createSourceFile(
		fileName,
		transformed,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	return ts
		.createPrinter({ removeComments: true })
		.printFile(normalizedFile)
		.replace(/\s+/g, ' ')
		.trim();
}

export function readTypeParityConfig(root, configPath = TYPE_PARITY_CONFIG) {
	const absoluteConfig = resolve(root, configPath);
	if (!existsSync(absoluteConfig)) throw new Error(`missing type parity config: ${configPath}`);
	const config = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
	if (!Array.isArray(config.pairs) || config.pairs.length === 0) {
		throw new Error('type-parity.json must list at least one upstream/adapted pair');
	}
	for (const pair of config.pairs) {
		if (!pair?.upstream || !pair?.adapted) {
			throw new Error(`invalid type pair: ${JSON.stringify(pair)}`);
		}
		if (!existsSync(resolve(root, pair.upstream))) {
			throw new Error(`missing upstream type fixture ${pair.upstream}`);
		}
		if (!existsSync(resolve(root, pair.adapted))) {
			throw new Error(`missing adapted type fixture ${pair.adapted}`);
		}
	}
	return config;
}

export function buildTypeInventory(root, config) {
	const upstream = [];
	const adapted = [];
	for (const pair of config.pairs) {
		if (!existsSync(resolve(root, pair.upstream))) {
			throw new Error(`missing upstream type fixture ${pair.upstream}`);
		}
		if (!existsSync(resolve(root, pair.adapted))) {
			throw new Error(`missing adapted type fixture ${pair.adapted}`);
		}
		const upstreamSource = readFileSync(resolve(root, pair.upstream), 'utf8');
		const adaptedSource = readFileSync(resolve(root, pair.adapted), 'utf8');
		const upstreamGroups = assertionGroups(upstreamSource, pair.upstream);
		const adaptedGroups = assertionGroups(adaptedSource, pair.adapted);
		if (JSON.stringify(upstreamGroups) !== JSON.stringify(adaptedGroups)) {
			throw new Error(
				`${pair.adapted}: assertion groups differ between pristine and adapted type suites`,
			);
		}
		if (
			structuralSource(upstreamSource, pair.upstream) !==
			structuralSource(adaptedSource, pair.adapted)
		) {
			throw new Error(
				`${pair.adapted}: adapted type test contains a change outside the permitted transformations`,
			);
		}
		upstream.push({
			path: pair.upstream,
			sha256: sha256(upstreamSource),
			assertionGroups: upstreamGroups.map(sha256),
		});
		adapted.push({
			path: pair.adapted,
			sha256: sha256(adaptedSource),
			assertionGroups: adaptedGroups.map(sha256),
		});
	}
	const inventory = { upstream, adapted };
	verifyInventoriedFilesBelongToPrograms(root, config, inventory);
	return inventory;
}

export function verifyReactSelectTypes(root, { configPath = TYPE_PARITY_CONFIG } = {}) {
	const config = readTypeParityConfig(root, configPath);
	const inventory = buildTypeInventory(root, config);
	for (const side of ['upstream', 'adapted']) {
		const inventoryPath = resolve(root, config.inventories[side]);
		const recorded = existsSync(inventoryPath)
			? JSON.parse(readFileSync(inventoryPath, 'utf8'))
			: undefined;
		if (JSON.stringify(recorded) !== JSON.stringify(inventory[side])) {
			throw new Error(
				`${side} type inventory drifted; review the change and regenerate its inventory`,
			);
		}
	}
	return {
		files: inventory.upstream.length,
		assertions: inventory.upstream.reduce(function sumAssertions(sum, file) {
			return sum + file.assertionGroups.length;
		}, 0),
	};
}

export function renderTypeInventories(root, configPath = TYPE_PARITY_CONFIG) {
	const config = readTypeParityConfig(root, configPath);
	const inventory = buildTypeInventory(root, config);
	return { config, inventory };
}
