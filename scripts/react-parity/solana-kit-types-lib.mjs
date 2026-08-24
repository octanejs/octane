import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export const TYPE_PARITY_CONFIG = 'packages/solana-kit/audit/type-parity.json';

const DISPOSITIONS = new Set(['adapted', 'pristine-only', 'out-of-scope']);

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function posix(value) {
	return value.split(sep).join('/');
}

export function listVendoredTypetestFiles(upstreamRoot) {
	return readdirSync(upstreamRoot, { recursive: true, withFileTypes: true })
		.filter(function keepTypetests(entry) {
			if (!entry.isFile()) return false;
			const relativePath = posix(
				relative(upstreamRoot, resolve(entry.parentPath ?? entry.path, entry.name)),
			);
			return /__typetests__\//.test(relativePath) && /-typetest\.ts$/.test(relativePath);
		})
		.map(function toRelative(entry) {
			return posix(relative(upstreamRoot, resolve(entry.parentPath ?? entry.path, entry.name)));
		})
		.sort();
}

export function readTypeParityConfig(root, configPath = TYPE_PARITY_CONFIG) {
	const absoluteConfig = resolve(root, configPath);
	if (!existsSync(absoluteConfig)) throw new Error(`missing type parity config: ${configPath}`);
	const config = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
	if (!Array.isArray(config.fileDispositions) || config.fileDispositions.length === 0) {
		throw new Error('type-parity.json must list fileDispositions for every vendored typetest');
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
		if (entry.disposition === 'pristine-only' && !Array.isArray(entry.adaptedEvidence)) {
			throw new Error(`${entry.path}: pristine-only dispositions require adaptedEvidence array`);
		}
		if (entry.disposition === 'pristine-only') {
			for (const evidence of entry.adaptedEvidence) {
				if (!existsSync(resolve(root, evidence))) {
					throw new Error(`${entry.path}: missing adaptedEvidence ${evidence}`);
				}
			}
		}
	}
	return config;
}

export function assertDispositionsCoverVendored(root, config) {
	const upstreamRoot = resolve(root, config.upstreamRoot);
	const vendored = listVendoredTypetestFiles(upstreamRoot);
	const disposed = new Set(
		config.fileDispositions.map(function path(entry) {
			return entry.path;
		}),
	);
	for (const file of vendored) {
		if (!disposed.has(file)) {
			throw new Error(`missing type disposition for vendored typetest ${file}`);
		}
	}
	for (const entry of config.fileDispositions) {
		if (!vendored.includes(entry.path)) {
			throw new Error(`type disposition references missing vendored file ${entry.path}`);
		}
	}
	return vendored;
}

export function adaptedTypeSuiteFiles(config) {
	return config.fileDispositions
		.filter(function keepAdapted(entry) {
			return entry.disposition === 'adapted';
		})
		.map(function path(entry) {
			return entry.path;
		})
		.sort();
}

export function pristineTypeSuiteFiles(config) {
	return config.fileDispositions
		.filter(function keepRunnable(entry) {
			return entry.disposition === 'adapted' || entry.disposition === 'pristine-only';
		})
		.map(function path(entry) {
			return entry.path;
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
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return groups;
}

function normalizeSpecifier(specifier) {
	if (
		specifier === '../useClient' ||
		specifier === '../useClientCapability' ||
		specifier === '../../src/hooks/useClient'
	) {
		return '#solana-kit-client-hooks';
	}
	if (specifier === '../useRequestQuery' || specifier === '../../../src/query') {
		return '#solana-kit-query';
	}
	if (specifier === '@tanstack/react-query' || specifier === '@octanejs/tanstack-query') {
		return '#query-result-types';
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

function listAdaptedPresent(adaptedRoot, suiteFiles) {
	const present = new Set(
		readdirSync(adaptedRoot, { recursive: true, withFileTypes: true })
			.filter(function keepFiles(entry) {
				return entry.isFile();
			})
			.map(function toRelative(entry) {
				return posix(relative(adaptedRoot, resolve(entry.parentPath ?? entry.path, entry.name)));
			}),
	);
	const missing = suiteFiles.filter(function absent(file) {
		return !present.has(file);
	});
	if (missing.length) {
		throw new Error(`type-test file inventories differ; missing: ${missing.join(', ')}`);
	}
	return suiteFiles;
}

export function buildTypeInventory(root, config) {
	assertDispositionsCoverVendored(root, config);
	const adaptedFiles = adaptedTypeSuiteFiles(config);
	const pristineFiles = pristineTypeSuiteFiles(config);
	const upstreamRoot = resolve(root, config.upstreamRoot);
	const adaptedRoot = resolve(root, config.adaptedRoot);
	listAdaptedPresent(adaptedRoot, adaptedFiles);
	const upstream = [];
	const adapted = [];
	for (const file of pristineFiles) {
		const upstreamSource = readFileSync(resolve(upstreamRoot, file), 'utf8');
		const upstreamGroups = assertionGroups(upstreamSource, file);
		upstream.push({
			path: file,
			sha256: sha256(upstreamSource),
			assertionGroups: upstreamGroups.map(sha256),
		});
	}
	for (const file of adaptedFiles) {
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
		adapted.push({
			path: file,
			sha256: sha256(adaptedSource),
			assertionGroups: adaptedGroups.map(sha256),
		});
	}
	return { upstream, adapted, pristineSuite: pristineFiles };
}

export function verifySolanaReactTypes(root, { configPath = TYPE_PARITY_CONFIG } = {}) {
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
		pristineFiles: inventory.pristineSuite.length,
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
