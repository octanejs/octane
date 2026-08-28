import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export const TYPE_PARITY_CONFIG = 'packages/resizable-panels/audit/type-parity.json';

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function posix(value) {
	return value.split(sep).join('/');
}

function listFiles(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter(function keepProbeFiles(entry) {
			if (!entry.isFile()) return false;
			const relativePath = posix(
				relative(root, resolve(entry.parentPath ?? entry.path, entry.name)),
			);
			return /(?:\.test-d\.ts|\.ts)$/.test(relativePath) && !relativePath.endsWith('tsconfig.json');
		})
		.map(function toRelative(entry) {
			return posix(relative(root, resolve(entry.parentPath ?? entry.path, entry.name)));
		})
		.filter(function excludeConfigs(path) {
			return (
				!path.includes('tsconfig') &&
				path !== 'pristine.ts' &&
				path !== 'expressibility.ts' &&
				path !== 'proposed-public-types.ts'
			);
		})
		.sort();
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
		if (ts.isTypeAliasDeclaration(node) && node.type && containsExpect(node.type)) {
			groups.push(
				`expect:${node.name.text}:${printer.printNode(ts.EmitHint.Unspecified, node.type, sourceFile).replace(/\s+/g, ' ').trim()}`,
			);
		}
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'expectType'
		) {
			groups.push(
				`expectType:${printer
					.printNode(ts.EmitHint.Unspecified, node, sourceFile)
					.replace(/\s+/g, ' ')
					.trim()}`,
			);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return groups;
}

function normalizeSpecifier(specifier) {
	if (
		specifier === '../../upstream-artifact/dist/react-resizable-panels.js' ||
		specifier === '../src/index.tsrx' ||
		specifier === '@octanejs/resizable-panels'
	) {
		return '#rrp-public';
	}
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

/**
 * Resolve a lane's declared tsconfig project and return inventoried probe paths
 * that the TypeScript program actually includes (relative to probeRoot).
 */
export function projectIncludedProbes(repoRoot, projectPath, probeRoot) {
	const absoluteProject = resolve(repoRoot, projectPath);
	if (!existsSync(absoluteProject)) {
		throw new Error(`missing TypeScript project: ${projectPath}`);
	}
	const configFile = ts.readConfigFile(absoluteProject, function read(path) {
		return ts.sys.readFile(path);
	});
	if (configFile.error) {
		throw new Error(
			`failed to read TypeScript project ${projectPath}: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`,
		);
	}
	const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(absoluteProject));
	// TS6053 / 18003: empty include is a valid "includes nothing" outcome for this check.
	const fatalErrors = parsed.errors.filter(function keepFatal(error) {
		return error.code !== 18003;
	});
	if (fatalErrors.length > 0) {
		throw new Error(
			`failed to parse TypeScript project ${projectPath}: ${ts.flattenDiagnosticMessageText(fatalErrors[0].messageText, '\n')}`,
		);
	}
	const absoluteProbeRoot = resolve(repoRoot, probeRoot);
	const included = [];
	for (const fileName of parsed.fileNames) {
		const relativePath = posix(relative(absoluteProbeRoot, fileName));
		if (relativePath.startsWith('..') || relativePath.includes('node_modules')) continue;
		if (!/(?:\.test-d\.ts|\.ts)$/.test(relativePath) || relativePath.endsWith('tsconfig.json')) {
			continue;
		}
		if (
			relativePath.includes('tsconfig') ||
			relativePath === 'pristine.ts' ||
			relativePath === 'expressibility.ts' ||
			relativePath === 'proposed-public-types.ts'
		) {
			continue;
		}
		included.push(relativePath);
	}
	return included.sort();
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

export function verifyLaneProjectsIncludeProbes(root, config, inventory) {
	const laneRoots = {
		pristine: config.upstreamRoot,
		adapted: config.adaptedRoot,
	};
	const laneInventories = {
		pristine: inventory.upstream,
		adapted: inventory.adapted,
	};
	for (const [laneName, lane] of Object.entries(config.lanes ?? {})) {
		if (!lane.project) {
			throw new Error(`type-parity lane ${laneName} is missing a compiler project`);
		}
		const probeRoot = laneRoots[laneName];
		if (!probeRoot) {
			throw new Error(`type-parity lane ${laneName} has no mapped probe root`);
		}
		const included = projectIncludedProbes(root, lane.project, probeRoot);
		const inventoried = laneInventories[laneName].map(function pathOf(entry) {
			return entry.path;
		});
		if (JSON.stringify(included) !== JSON.stringify(inventoried)) {
			throw new Error(
				`${laneName} TypeScript project must include exactly the inventoried probes (and no unintended probe); included=[${included.join(', ')}] inventoried=[${inventoried.join(', ')}]`,
			);
		}
	}
}

export function verifyReactResizablePanelsTypes(root, { configPath = TYPE_PARITY_CONFIG } = {}) {
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
	verifyLaneProjectsIncludeProbes(root, config, inventory);
	return {
		files: inventory.upstream.length,
		assertions: inventory.upstream.reduce(function sumAssertions(sum, file) {
			return sum + file.assertionGroups.length;
		}, 0),
	};
}

export function renderTypeInventories(root, configPath = TYPE_PARITY_CONFIG) {
	const config = JSON.parse(readFileSync(resolve(root, configPath), 'utf8'));
	const inventory = buildTypeInventory(root, config);
	return { config, inventory };
}
