import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import ts from 'typescript';

export const TYPE_PARITY_CONFIG = 'packages/tanstack-store/audit/type-parity.json';

const PRISTINE_ONLY_TESTS = new Set([
	'_useStore returns actions for stores with actions',
	'_useStore returns setState for plain stores',
]);

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function posix(value) {
	return value.split(sep).join('/');
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
		groups.push(
			`expect-error:${match[1].trim()}:${match[2].replace(/\s+/g, ' ').trim().replace(/;$/, '')}`,
		);
	}
	for (const match of source.matchAll(
		/expectTypeOf\(([^)]+)\)\.not\.toHaveProperty\((['"])([^'"]+)\2\)/g,
	)) {
		groups.push(`expect-type-of-not-property:${match[1].replace(/\s+/g, ' ').trim()}:${match[3]}`);
	}
	for (const match of source.matchAll(/test\((['"])((?:\\.|[^\\])*?)\1/g)) {
		groups.push(`test:${match[2]}`);
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

function evidenceInventoryEntry(root, evidencePath) {
	const absolute = resolve(root, evidencePath);
	if (!existsSync(absolute)) {
		throw new Error(`missing adaptedEvidence file: ${evidencePath}`);
	}
	const source = readFileSync(absolute, 'utf8');
	const groups = assertionGroups(source, evidencePath);
	const omissionAssertions = groups.filter(function keepOmission(group) {
		return /^expect-type-of-not-property:.+:_useStore$/.test(group);
	});
	if (omissionAssertions.length === 0) {
		throw new Error(
			`adaptedEvidence ${evidencePath} must assert expectTypeOf(...).not.toHaveProperty('_useStore') (titles/docs alone are not enough)`,
		);
	}
	return {
		path: posix(evidencePath),
		role: 'divergence-evidence',
		sha256: sha256(source),
		assertionGroups: groups.map(sha256),
	};
}

function normalizeSpecifier(specifier) {
	if (
		specifier === '../src' ||
		specifier === '../src/index' ||
		specifier === '@octanejs/tanstack-store'
	) {
		return '#tanstack-store-public';
	}
	return specifier;
}

function pristineOnlyTestPattern(title) {
	return new RegExp(
		`test\\('${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]*?\\n\\}\\)\\n`,
	);
}

function inventoryPristineOnlyCases(source, fileName) {
	const entries = [];
	for (const title of PRISTINE_ONLY_TESTS) {
		const match = source.match(pristineOnlyTestPattern(title));
		if (!match) {
			throw new Error(`upstream type suite missing required pristine-only test: ${title}`);
		}
		const block = match[0];
		entries.push({
			path: fileName,
			title,
			role: 'pristine-only',
			sha256: sha256(block),
			assertionGroups: assertionGroups(block, fileName).map(sha256),
		});
	}
	return entries;
}

function stripPristineOnlyTests(source) {
	let transformed = source;
	for (const title of PRISTINE_ONLY_TESTS) {
		transformed = transformed.replace(pristineOnlyTestPattern(title), '');
	}
	transformed = transformed.replace(/\n  _useStore,\n/, '\n');
	transformed = transformed.replace(
		/import type \{ Atom, ReadonlyStore, Store \} from '@tanstack\/store'/,
		"import type { Atom, ReadonlyStore } from '@tanstack/store'",
	);
	return transformed;
}

function structuralSource(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const importStatements = [];
	const otherStatements = [];
	for (const statement of sourceFile.statements) {
		if (ts.isImportDeclaration(statement)) importStatements.push(statement);
		else otherStatements.push(statement);
	}
	const replacements = [];
	for (const statement of importStatements) {
		if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
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
	const printer = ts.createPrinter({ removeComments: true });
	const sortedImports = normalizedFile.statements
		.filter(function keepImports(statement) {
			return ts.isImportDeclaration(statement);
		})
		.map(function printImport(statement) {
			return printer
				.printNode(ts.EmitHint.Unspecified, statement, normalizedFile)
				.replace(/\s+/g, ' ')
				.trim();
		})
		.sort();
	const body = normalizedFile.statements
		.filter(function keepBody(statement) {
			return !ts.isImportDeclaration(statement);
		})
		.map(function printStatement(statement) {
			return printer
				.printNode(ts.EmitHint.Unspecified, statement, normalizedFile)
				.replace(/\s+/g, ' ')
				.trim();
		})
		.join(' ');
	return `${sortedImports.join(' ')} ${body}`.replace(/\s+/g, ' ').trim();
}

export function readTypeParityConfig(root, configPath = TYPE_PARITY_CONFIG) {
	const absoluteConfig = resolve(root, configPath);
	if (!existsSync(absoluteConfig)) throw new Error(`missing type parity config: ${configPath}`);
	const config = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
	if (!config.upstreamRoot || !config.adaptedRoot || !config.inventories) {
		throw new Error('type-parity.json must define upstreamRoot, adaptedRoot, and inventories');
	}
	for (const evidence of config.adaptedEvidence ?? []) {
		if (!existsSync(resolve(root, evidence))) {
			throw new Error(`missing adaptedEvidence file: ${evidence}`);
		}
	}
	return config;
}

export function buildTypeInventory(root, config) {
	const upstreamRoot = resolve(root, config.upstreamRoot);
	const adaptedRoot = resolve(root, config.adaptedRoot);
	const file = config.file;
	const upstreamSource = readFileSync(resolve(upstreamRoot, file), 'utf8');
	const adaptedSource = readFileSync(resolve(adaptedRoot, file), 'utf8');
	// Inventory and require each pristine-only `_useStore` case before stripping so
	// deleting those blocks cannot keep the comparison green after a hash refresh.
	const pristineOnly = inventoryPristineOnlyCases(upstreamSource, file);
	const comparableUpstreamSource = stripPristineOnlyTests(upstreamSource);
	const upstreamGroups = assertionGroups(comparableUpstreamSource, file);
	const adaptedGroups = assertionGroups(adaptedSource, file);
	if (JSON.stringify(upstreamGroups) !== JSON.stringify(adaptedGroups)) {
		throw new Error(`${file}: assertion groups differ between pristine and adapted type suites`);
	}
	const normalizedUpstream = structuralSource(comparableUpstreamSource, file);
	const normalizedAdapted = structuralSource(adaptedSource, file);
	if (normalizedUpstream !== normalizedAdapted) {
		throw new Error(
			`${file}: adapted type test contains a change outside the permitted transformations`,
		);
	}
	const upstream = [
		{
			path: file,
			sha256: sha256(upstreamSource),
			assertionGroups: upstreamGroups.map(sha256),
		},
		...pristineOnly,
	];
	const adapted = [
		{
			path: file,
			sha256: sha256(adaptedSource),
			assertionGroups: adaptedGroups.map(sha256),
		},
	];
	// adaptedEvidence is paired divergence evidence: inventory its assertions so
	// an empty/mutated module cannot keep the structural audit green after hash refresh.
	for (const evidence of config.adaptedEvidence ?? []) {
		adapted.push(evidenceInventoryEntry(root, evidence));
	}
	return { upstream, adapted };
}

export function verifyTanstackStoreTypes(root, { configPath = TYPE_PARITY_CONFIG } = {}) {
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
		files: inventory.upstream.filter(function isPrimaryFile(entry) {
			return entry.role === undefined;
		}).length,
		assertions: inventory.upstream
			.filter(function isPrimaryFile(entry) {
				return entry.role === undefined;
			})
			.reduce(function sumAssertions(sum, entry) {
				return sum + entry.assertionGroups.length;
			}, 0),
	};
}

export function renderTypeInventories(root, configPath = TYPE_PARITY_CONFIG) {
	const config = readTypeParityConfig(root, configPath);
	const inventory = buildTypeInventory(root, config);
	return { config, inventory };
}
