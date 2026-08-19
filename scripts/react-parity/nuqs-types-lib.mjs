import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export const TYPE_PARITY_CONFIG = 'packages/nuqs/audit/type-parity.json';

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function posix(value) {
	return value.split(sep).join('/');
}

function listProbeFiles(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter(function keepProbeFiles(entry) {
			if (!entry.isFile()) return false;
			const relativePath = posix(
				relative(root, resolve(entry.parentPath ?? entry.path, entry.name)),
			);
			if (relativePath.includes(`${sep}pristine${sep}`) || relativePath.startsWith('pristine/'))
				return false;
			return relativePath.endsWith('.test-d.ts');
		})
		.map(function toRelative(entry) {
			return posix(relative(root, resolve(entry.parentPath ?? entry.path, entry.name)));
		})
		.sort();
}

export function typeProjectFileNames(baseRoot, projectPath) {
	const absoluteProject = resolve(baseRoot, projectPath);
	const readResult = ts.readConfigFile(absoluteProject, ts.sys.readFile);
	if (readResult.error) {
		throw new Error(
			`failed to read type project ${projectPath}: ${ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n')}`,
		);
	}
	const parsed = ts.parseJsonConfigFileContent(
		readResult.config,
		ts.sys,
		resolve(absoluteProject, '..'),
		undefined,
		absoluteProject,
	);
	return parsed.fileNames
		.map(function toPortable(fileName) {
			return posix(relative(baseRoot, fileName));
		})
		.sort();
}

export function verifyTypeProjectMembership(baseRoot, config, inventory) {
	const lanes = config.lanes;
	if (!lanes?.pristine?.project || !lanes?.adapted?.project) {
		throw new Error('type-parity.json must declare pristine and adapted compiler projects');
	}
	for (const [side, laneKey, rootKey] of [
		['upstream', 'pristine', 'upstreamRoot'],
		['adapted', 'adapted', 'adaptedRoot'],
	]) {
		const projectPath = lanes[laneKey].project;
		const suiteRoot = posix(config[rootKey]);
		const included = typeProjectFileNames(baseRoot, projectPath);
		const expected = inventory[side]
			.map(function toRepoPath(entry) {
				return posix(`${suiteRoot}/${entry.path}`);
			})
			.sort();
		const selectedProbes = included
			.filter(function keepProbe(fileName) {
				return fileName.startsWith(`${suiteRoot}/`) && fileName.endsWith('.test-d.ts');
			})
			.sort();
		if (JSON.stringify(selectedProbes) !== JSON.stringify(expected)) {
			throw new Error(
				`${side} type-test program membership drifted for ${projectPath}; expected exact probe set ${JSON.stringify(expected)} but compiler selected ${JSON.stringify(selectedProbes)}`,
			);
		}
		for (const file of expected) {
			if (!included.includes(file)) {
				throw new Error(
					`${side} type-test file ${file} is not included by compiler project ${projectPath}`,
				);
			}
		}
	}
}

function normalizeComment(comment) {
	return comment
		.replace(/^\/\*\*|\*\/$/g, '')
		.replace(/^\s*\*\s?/gm, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function containsAssert(node) {
	if (ts.isIdentifier(node) && node.text === 'Assert') return true;
	return node.getChildren().some(containsAssert);
}

function assertionGroups(source, fileName) {
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
		if (ts.isTypeAliasDeclaration(node) && node.type && containsAssert(node.type)) {
			groups.push(
				`assert:${node.name.text}:${printer.printNode(ts.EmitHint.Unspecified, node.type, sourceFile).replace(/\s+/g, ' ').trim()}`,
			);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return groups;
}

function normalizeSpecifier(specifier) {
	if (specifier === 'nuqs' || specifier === '@octanejs/nuqs') return '#nuqs-public';
	return specifier;
}

function structuralSource(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const replacements = [];
	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
			continue;
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

export function buildTypeInventory(root, config) {
	const upstreamRoot = resolve(root, config.upstreamRoot);
	const adaptedRoot = resolve(root, config.adaptedRoot);
	const upstreamFiles = listProbeFiles(upstreamRoot);
	const adaptedFiles = listProbeFiles(adaptedRoot);
	if (JSON.stringify(upstreamFiles) !== JSON.stringify(adaptedFiles)) {
		throw new Error(
			'type-test file inventories differ; every pristine type artifact needs one adapted counterpart',
		);
	}
	const upstream = [];
	const adapted = [];
	for (const file of upstreamFiles) {
		const upstreamSource = readFileSync(resolve(upstreamRoot, file), 'utf8');
		const adaptedSource = readFileSync(resolve(adaptedRoot, file), 'utf8');
		const upstreamGroups = assertionGroups(upstreamSource, file);
		const adaptedGroups = assertionGroups(adaptedSource, file);
		if (JSON.stringify(upstreamGroups) !== JSON.stringify(adaptedGroups)) {
			throw new Error(`${file}: assertion groups differ between pristine and adapted type suites`);
		}
		if (structuralSource(upstreamSource, file) !== structuralSource(adaptedSource, file)) {
			throw new Error(
				`${file}: adapted type test contains a change outside the permitted transformations`,
			);
		}
		upstream.push({
			path: file,
			sha256: sha256(upstreamSource),
			assertionGroups: upstreamGroups.map(sha256),
		});
		adapted.push({
			path: file,
			sha256: sha256(adaptedSource),
			assertionGroups: adaptedGroups.map(sha256),
		});
	}
	return { upstream, adapted };
}

export function verifyNuqsTypes(root, { configPath = TYPE_PARITY_CONFIG } = {}) {
	const absoluteConfig = resolve(root, configPath);
	if (!existsSync(absoluteConfig)) throw new Error(`missing type parity config: ${configPath}`);
	const config = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
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
	verifyTypeProjectMembership(root, config, inventory);
	const assertions = inventory.upstream.reduce(function sumAssertions(sum, file) {
		return sum + file.assertionGroups.length;
	}, 0);
	if (inventory.upstream.length === 0 || assertions === 0) {
		throw new Error('type parity inventory compiled zero assertions; fail closed');
	}
	return {
		files: inventory.upstream.length,
		assertions,
	};
}

export function renderTypeInventories(root, configPath = TYPE_PARITY_CONFIG) {
	const config = JSON.parse(readFileSync(resolve(root, configPath), 'utf8'));
	const inventory = buildTypeInventory(root, config);
	return { config, inventory };
}
