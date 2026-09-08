import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export const TYPE_PARITY_CONFIG = 'packages/colorful/audit/type-parity.json';

const DISPOSITIONS = new Set(['adapted', 'pristine-only', 'out-of-scope']);
const TSRX_EXTENSION = {
	extension: '.tsrx',
	isMixedContent: false,
	scriptKind: ts.ScriptKind.TSX,
};

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function posix(value) {
	return value.split(sep).join('/');
}

function listFiles(root, predicate) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter(function keepFiles(entry) {
			if (!entry.isFile()) return false;
			const relativePath = posix(
				relative(root, resolve(entry.parentPath ?? entry.path, entry.name)),
			);
			return predicate(relativePath);
		})
		.map(function toRelative(entry) {
			return posix(relative(root, resolve(entry.parentPath ?? entry.path, entry.name)));
		})
		.sort();
}

function listProbeFiles(root) {
	return listFiles(root, function keepProbe(path) {
		return /\.test\.ts$/.test(path);
	});
}

function tsrxReadDirectory(path, extensions, excludes, includes, depth) {
	const withTsrx = extensions ? [...extensions, '.tsrx'] : ['.ts', '.tsx', '.d.ts', '.tsrx'];
	return ts.sys.readDirectory(path, withTsrx, excludes, includes, depth);
}

export function listCompilerProgramFiles(root, projectPath, sourceRoot) {
	const configPath = resolve(root, projectPath);
	if (!existsSync(configPath)) {
		throw new Error(`missing compiler project for program membership: ${projectPath}`);
	}
	const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
	if (readResult.error) {
		throw new Error(
			`failed to read ${projectPath}: ${ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n')}`,
		);
	}
	const host = {
		...ts.sys,
		readDirectory: tsrxReadDirectory,
	};
	const parsed = ts.parseJsonConfigFileContent(
		readResult.config,
		host,
		dirname(configPath),
		undefined,
		configPath,
		undefined,
		[TSRX_EXTENSION],
	);
	if (parsed.errors.length > 0) {
		throw new Error(
			`${projectPath}: ${ts.flattenDiagnosticMessageText(parsed.errors[0].messageText, '\n')}`,
		);
	}
	const sourceAbs = resolve(root, sourceRoot);
	return parsed.fileNames
		.filter(function underSourceRoot(filePath) {
			const rel = relative(sourceAbs, filePath);
			return (
				rel &&
				!rel.startsWith('..') &&
				!rel.includes(`..${sep}`) &&
				/\.(?:ts|tsx|tsrx|d\.ts)$/.test(filePath)
			);
		})
		.map(function toRelative(filePath) {
			return posix(relative(sourceAbs, filePath));
		})
		.sort();
}

function listProbeProgramFiles(root, projectPath) {
	const configPath = resolve(root, projectPath);
	if (!existsSync(configPath)) {
		throw new Error(`missing compiler project for probe membership: ${projectPath}`);
	}
	const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
	if (readResult.error) {
		throw new Error(
			`failed to read ${projectPath}: ${ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n')}`,
		);
	}
	const parsed = ts.parseJsonConfigFileContent(
		readResult.config,
		ts.sys,
		dirname(configPath),
		undefined,
		configPath,
	);
	if (parsed.errors.length > 0) {
		throw new Error(
			`${projectPath}: ${ts.flattenDiagnosticMessageText(parsed.errors[0].messageText, '\n')}`,
		);
	}
	const projectDir = dirname(configPath);
	return parsed.fileNames
		.map(function toRelative(filePath) {
			return posix(relative(projectDir, filePath));
		})
		.filter(function keepProbe(path) {
			return /\.test\.ts$/.test(path);
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
	if (specifier === 'react-colorful' || specifier === '@octanejs/colorful') {
		return '#react-colorful-public';
	}
	if (specifier === './host-input-event') {
		return '#host-input-event';
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

export function readTypeParityConfig(root, configPath = TYPE_PARITY_CONFIG) {
	const absoluteConfig = resolve(root, configPath);
	if (!existsSync(absoluteConfig)) throw new Error(`missing type parity config: ${configPath}`);
	const config = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
	if (!config.programRoots?.upstream || !config.programRoots?.adapted) {
		throw new Error('type-parity.json must declare programRoots.upstream and programRoots.adapted');
	}
	if (!config.programInventories?.upstream || !config.programInventories?.adapted) {
		throw new Error('type-parity.json must declare programInventories for both source programs');
	}
	if (!config.lanes?.pristine?.project || !config.lanes?.adapted?.project) {
		throw new Error('type-parity.json lanes must declare pristine and adapted compiler projects');
	}
	if (!config.lanes?.pristine?.probeProject || !config.lanes?.adapted?.probeProject) {
		throw new Error(
			'type-parity.json lanes must declare pristine and adapted probe compiler projects',
		);
	}
	if (!Array.isArray(config.fileDispositions) || config.fileDispositions.length === 0) {
		throw new Error('type-parity.json must list fileDispositions for every upstream program file');
	}
	if (!Array.isArray(config.divergences)) {
		throw new Error('type-parity.json must declare a divergences array');
	}
	const seen = new Set();
	for (const entry of config.fileDispositions) {
		if (!entry || typeof entry.path !== 'string' || !DISPOSITIONS.has(entry.disposition)) {
			throw new Error(`invalid type file disposition: ${JSON.stringify(entry)}`);
		}
		if (typeof entry.rationale !== 'string' || entry.rationale.trim().length < 20) {
			throw new Error(`${entry.path}: disposition rationale must be concrete`);
		}
		if (seen.has(entry.path)) throw new Error(`duplicate type disposition for ${entry.path}`);
		seen.add(entry.path);
		if (entry.disposition === 'adapted') {
			if (typeof entry.adaptedPath !== 'string' || entry.adaptedPath.length === 0) {
				throw new Error(`${entry.path}: adapted dispositions require adaptedPath`);
			}
		}
		if (entry.disposition === 'pristine-only' && !Array.isArray(entry.adaptedEvidence)) {
			throw new Error(`${entry.path}: pristine-only dispositions require adaptedEvidence array`);
		}
		if (entry.disposition === 'pristine-only') {
			for (const evidence of entry.adaptedEvidence) {
				if (!existsSync(resolve(root, config.programRoots.adapted, evidence))) {
					throw new Error(`${entry.path}: missing adaptedEvidence ${evidence}`);
				}
			}
		}
	}
	return config;
}

export function assertProgramDispositions(root, config) {
	const upstreamFiles = listCompilerProgramFiles(
		root,
		config.lanes.pristine.project,
		config.programRoots.upstream,
	);
	const adaptedFiles = listCompilerProgramFiles(
		root,
		config.lanes.adapted.project,
		config.programRoots.adapted,
	);
	const disposed = new Set(
		config.fileDispositions.map(function path(entry) {
			return entry.path;
		}),
	);
	for (const file of upstreamFiles) {
		if (!disposed.has(file)) {
			throw new Error(`missing type disposition for upstream program file ${file}`);
		}
	}
	for (const entry of config.fileDispositions) {
		if (!upstreamFiles.includes(entry.path)) {
			throw new Error(
				`type disposition references ${entry.path} which is not in the pristine compiler program ${config.lanes.pristine.project}`,
			);
		}
	}

	const accountedAdapted = new Set();
	for (const entry of config.fileDispositions) {
		if (entry.disposition === 'adapted') {
			if (!adaptedFiles.includes(entry.adaptedPath)) {
				throw new Error(
					`${entry.path}: adaptedPath ${entry.adaptedPath} is missing from the adapted compiler program ${config.lanes.adapted.project}`,
				);
			}
			accountedAdapted.add(entry.adaptedPath);
		}
		if (entry.disposition === 'pristine-only') {
			for (const evidence of entry.adaptedEvidence) accountedAdapted.add(evidence);
		}
	}
	for (const file of adaptedFiles) {
		if (!accountedAdapted.has(file)) {
			throw new Error(
				`adapted program file ${file} is not covered by any disposition mapping for ${config.lanes.adapted.project}`,
			);
		}
	}
	return { upstreamFiles, adaptedFiles };
}

function assertProbeProgramMembership(root, config, inventory) {
	for (const [side, laneKey] of [
		['upstream', 'pristine'],
		['adapted', 'adapted'],
	]) {
		const projectPath = config.lanes[laneKey].probeProject;
		const programFiles = listProbeProgramFiles(root, projectPath);
		const expected = inventory[side]
			.map(function pathOf(entry) {
				return entry.path;
			})
			.sort();
		if (JSON.stringify(programFiles) !== JSON.stringify(expected)) {
			throw new Error(
				`${projectPath}: compiler program probes must match the ${side} type inventory exactly; expected ${JSON.stringify(expected)} but compiler selected ${JSON.stringify(programFiles)}`,
			);
		}
	}
}

export function buildProgramInventory(root, config) {
	const { upstreamFiles, adaptedFiles } = assertProgramDispositions(root, config);
	const upstreamRoot = resolve(root, config.programRoots.upstream);
	const adaptedRoot = resolve(root, config.programRoots.adapted);
	const upstream = upstreamFiles.map(function entry(path) {
		return { path, sha256: sha256(readFileSync(resolve(upstreamRoot, path))) };
	});
	const adapted = adaptedFiles.map(function entry(path) {
		return { path, sha256: sha256(readFileSync(resolve(adaptedRoot, path))) };
	});
	return { upstream, adapted };
}

export function buildTypeInventory(root, config) {
	const upstreamRoot = resolve(root, config.upstreamRoot);
	const adaptedRoot = resolve(root, config.adaptedRoot);
	const upstreamFiles = listProbeFiles(upstreamRoot);
	const adaptedFiles = listProbeFiles(adaptedRoot);
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

function requireRecordedInventory(root, inventoryPath, actual, label) {
	const absolute = resolve(root, inventoryPath);
	const recorded = existsSync(absolute) ? JSON.parse(readFileSync(absolute, 'utf8')) : undefined;
	if (JSON.stringify(recorded) !== JSON.stringify(actual)) {
		throw new Error(`${label} inventory drifted; review the change and regenerate its inventory`);
	}
}

export function verifyReactColorfulTypes(root, { configPath = TYPE_PARITY_CONFIG } = {}) {
	const config = readTypeParityConfig(root, configPath);
	if (
		!config.divergences.some(function hasEventDivergence(entry) {
			return entry?.id === 'react-colorful-native-event-attributes';
		})
	) {
		throw new Error(
			'type-parity.json must record react-colorful-native-event-attributes as a type divergence',
		);
	}
	const probeInventory = buildTypeInventory(root, config);
	assertProbeProgramMembership(root, config, probeInventory);
	for (const side of ['upstream', 'adapted']) {
		requireRecordedInventory(root, config.inventories[side], probeInventory[side], `${side} type`);
	}
	const programInventory = buildProgramInventory(root, config);
	for (const side of ['upstream', 'adapted']) {
		requireRecordedInventory(
			root,
			config.programInventories[side],
			programInventory[side],
			`${side} program`,
		);
	}
	return {
		files: probeInventory.upstream.length,
		assertions: probeInventory.upstream.reduce(function sumAssertions(sum, file) {
			return sum + file.assertionGroups.length;
		}, 0),
		programFiles: {
			upstream: programInventory.upstream.length,
			adapted: programInventory.adapted.length,
		},
	};
}

export function renderTypeInventories(root, configPath = TYPE_PARITY_CONFIG) {
	const config = readTypeParityConfig(root, configPath);
	const inventory = buildTypeInventory(root, config);
	const programInventory = buildProgramInventory(root, config);
	return { config, inventory, programInventory };
}
