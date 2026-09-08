import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export const TYPE_PARITY_CONFIG = 'packages/alien-signals/audit/type-parity.json';

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

function listProbeFiles(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter(function keepProbeFiles(entry) {
			if (!entry.isFile()) return false;
			const relativePath = posix(
				relative(root, resolve(entry.parentPath ?? entry.path, entry.name)),
			);
			return relativePath.endsWith('.test-d.ts');
		})
		.map(function toRelative(entry) {
			return posix(relative(root, resolve(entry.parentPath ?? entry.path, entry.name)));
		})
		.sort();
}

const PUBLIC_API_CALLEES = new Set([
	'createSignal',
	'createComputed',
	'createEffect',
	'createSignalScope',
	'useSignal',
	'useSignalValue',
	'useSetSignal',
	'useSignalEffect',
	'useSignalScope',
	'useComputed',
]);

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
	for (const match of source.matchAll(/\/\/\s*@ts-expect-error([^\n]*)\n\s*([^\n]+)/g)) {
		groups.push(`expect-error:${match[1].trim()}:${match[2].replace(/\s+/g, ' ').trim()}`);
	}
	function visit(node) {
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

/**
 * Public-API call sites that must typecheck (not covered by @ts-expect-error).
 * Pins the positive type surface of the upstream typecheck suite one-for-one as
 * a multiset: repeated accepted shapes in distinct scenarios stay distinct, so
 * dropping one duplicate while another remains is rejected.
 */
export function acceptedApiCalls(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const printer = ts.createPrinter({ removeComments: true });
	const expectErrorLines = new Set();
	for (const match of source.matchAll(/\/\/\s*@ts-expect-error[^\n]*\n/g)) {
		const nextLine = source.slice(0, match.index + match[0].length).split('\n').length;
		expectErrorLines.add(nextLine);
	}
	const calls = [];
	function visit(node) {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			PUBLIC_API_CALLEES.has(node.expression.text)
		) {
			const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
			if (!expectErrorLines.has(line)) {
				calls.push(
					printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).replace(/\s+/g, ' ').trim(),
				);
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return calls.sort();
}

function normalizeSpecifier(specifier) {
	if (
		specifier === '../../upstream/src/index.ts' ||
		specifier === '../src/index.ts' ||
		specifier === '@octanejs/alien-signals'
	) {
		return '#alien-signals-public';
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

function readTypeParityConfig(root, configPath) {
	const absoluteConfig = resolve(root, configPath);
	if (!existsSync(absoluteConfig)) throw new Error(`missing type parity config: ${configPath}`);
	return JSON.parse(readFileSync(absoluteConfig, 'utf8'));
}

function verifyUpstreamTypecheckConfig(root, config) {
	const typecheck = config.upstreamTypecheck;
	if (!typecheck || typeof typecheck !== 'object') {
		throw new Error('type-parity.json must declare upstreamTypecheck for present upstream types');
	}
	if (typeof typecheck.project !== 'string' || !existsSync(resolve(root, typecheck.project))) {
		throw new Error(`missing upstream typecheck project: ${typecheck?.project}`);
	}
	if (typeof typecheck.root !== 'string' || !existsSync(resolve(root, typecheck.root))) {
		throw new Error(`missing upstream typecheck root: ${typecheck?.root}`);
	}
	if (!Array.isArray(typecheck.files) || typecheck.files.length === 0) {
		throw new Error('upstreamTypecheck.files must list every upstream typecheck assertion file');
	}
	for (const entry of typecheck.files) {
		if (!entry || typeof entry.upstream !== 'string' || typeof entry.adapted !== 'string') {
			throw new Error(`invalid upstreamTypecheck file entry: ${JSON.stringify(entry)}`);
		}
		if (entry.compare !== 'assertion-groups' && entry.compare !== 'structural') {
			throw new Error(`${entry.upstream}: compare must be assertion-groups or structural`);
		}
		const upstreamPath = resolve(root, typecheck.root, entry.upstream);
		const adaptedPath = resolve(root, config.adaptedRoot, entry.adapted);
		if (!existsSync(upstreamPath)) {
			throw new Error(`missing upstream typecheck assertion file: ${entry.upstream}`);
		}
		if (!existsSync(adaptedPath)) {
			throw new Error(
				`type-test file inventories differ; every upstream type artifact needs one adapted counterpart (missing ${entry.adapted})`,
			);
		}
	}
}

function inventoryTypecheckPairs(root, config) {
	const upstream = [];
	const adapted = [];
	for (const entry of config.upstreamTypecheck.files) {
		const upstreamSource = readFileSync(
			resolve(root, config.upstreamTypecheck.root, entry.upstream),
			'utf8',
		);
		const adaptedSource = readFileSync(resolve(root, config.adaptedRoot, entry.adapted), 'utf8');
		const upstreamGroups = assertionGroups(upstreamSource, entry.upstream);
		const adaptedGroups = assertionGroups(adaptedSource, entry.adapted);
		if (upstreamGroups.length === 0) {
			throw new Error(`${entry.upstream}: upstream typecheck file has no assertion groups`);
		}
		if (JSON.stringify(upstreamGroups) !== JSON.stringify(adaptedGroups)) {
			throw new Error(
				`${entry.adapted}: assertion groups differ between pristine and adapted type suites`,
			);
		}
		const upstreamAccepted = acceptedApiCalls(upstreamSource, entry.upstream);
		const adaptedAccepted = acceptedApiCalls(adaptedSource, entry.adapted);
		if (upstreamAccepted.length === 0) {
			throw new Error(`${entry.upstream}: upstream typecheck file has no accepted API calls`);
		}
		if (JSON.stringify(upstreamAccepted) !== JSON.stringify(adaptedAccepted)) {
			throw new Error(
				`${entry.adapted}: accepted API call inventory differs between pristine and adapted type suites`,
			);
		}
		if (entry.compare === 'structural') {
			if (
				structuralSource(upstreamSource, entry.upstream) !==
				structuralSource(adaptedSource, entry.adapted)
			) {
				throw new Error(
					`${entry.adapted}: adapted type test contains a change outside the permitted transformations`,
				);
			}
		}
		upstream.push({
			path: entry.upstream,
			sha256: sha256(upstreamSource),
			assertionGroups: upstreamGroups.map(sha256),
			acceptedApiCalls: upstreamAccepted.map(sha256),
			origin: 'upstream-typecheck',
		});
		adapted.push({
			path: entry.adapted,
			sha256: sha256(adaptedSource),
			assertionGroups: adaptedGroups.map(sha256),
			acceptedApiCalls: adaptedAccepted.map(sha256),
			origin: 'upstream-typecheck',
		});
	}
	return { upstream, adapted };
}

function inventoryProbePairs(root, config) {
	const upstreamRoot = resolve(root, config.upstreamRoot);
	const adaptedRoot = resolve(root, config.adaptedRoot);
	const upstreamFiles = listProbeFiles(upstreamRoot);
	const adaptedFiles = new Set(listProbeFiles(adaptedRoot));
	const typecheckAdapted = new Set(
		(config.upstreamTypecheck?.files ?? []).map(function adaptedPath(entry) {
			return entry.adapted;
		}),
	);
	for (const file of upstreamFiles) {
		if (!adaptedFiles.has(file)) {
			throw new Error(
				`type-test file inventories differ; every upstream type artifact needs one adapted counterpart (missing ${file})`,
			);
		}
	}
	const upstream = [];
	const adapted = [];
	for (const file of upstreamFiles) {
		if (typecheckAdapted.has(file)) {
			throw new Error(`${file}: probe file collides with an upstreamTypecheck adapted path`);
		}
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
			origin: 'repo-authored-probe',
		});
		adapted.push({
			path: file,
			sha256: sha256(adaptedSource),
			assertionGroups: adaptedGroups.map(sha256),
			origin: 'repo-authored-probe',
		});
	}
	return { upstream, adapted };
}

function verifyInventoriedFilesBelongToPrograms(root, config, probes) {
	const typecheckProject = config.upstreamTypecheck.project;
	const probeProject = config.lanes?.pristineProbes?.project ?? config.probeProject ?? null;
	const adaptedProject = config.lanes?.adapted?.project ?? null;
	assertFilesBelongToProgram(
		root,
		config.upstreamTypecheck.files.map(function toRepoPath(entry) {
			return posix(`${config.upstreamTypecheck.root}/${entry.upstream}`);
		}),
		typecheckProject,
		'upstream typecheck',
	);
	if (probeProject !== null) {
		assertFilesBelongToProgram(
			root,
			probes.upstream.map(function toRepoPath(entry) {
				return posix(`${config.upstreamRoot}/${entry.path}`);
			}),
			probeProject,
			'pristine type probes',
		);
	}
	if (adaptedProject !== null) {
		assertFilesBelongToProgram(
			root,
			[
				...config.upstreamTypecheck.files.map(function toRepoPath(entry) {
					return posix(`${config.adaptedRoot}/${entry.adapted}`);
				}),
				...probes.adapted.map(function toRepoPath(entry) {
					return posix(`${config.adaptedRoot}/${entry.path}`);
				}),
			],
			adaptedProject,
			'adapted type suite',
		);
	}
}

export function buildTypeInventory(root, config) {
	verifyUpstreamTypecheckConfig(root, config);
	const typecheck = inventoryTypecheckPairs(root, config);
	const probes = inventoryProbePairs(root, config);
	verifyInventoriedFilesBelongToPrograms(root, config, probes);
	return {
		upstream: [...typecheck.upstream, ...probes.upstream],
		adapted: [...typecheck.adapted, ...probes.adapted],
	};
}

export function verifyAlienSignalsTypes(root, { configPath = TYPE_PARITY_CONFIG } = {}) {
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
