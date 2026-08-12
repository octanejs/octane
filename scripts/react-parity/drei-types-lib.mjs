import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

export const TYPE_PARITY_CONFIG = 'packages/drei/audit/type-parity.json';

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
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
	for (const match of source.matchAll(/\/\/\s*@ts-expect-error([^\n]*)\n\s*([^\n]+)/g)) {
		groups.push(`expect-error:${match[1].trim()}:${match[2].replace(/\s+/g, ' ').trim()}`);
	}
	function visit(node) {
		if (
			ts.isVariableStatement(node) &&
			node.declarationList.declarations.some(function hasType(declaration) {
				return declaration.type !== undefined;
			})
		) {
			groups.push(
				`typed:${printer
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

function normalizePackageRoot(specifier) {
	if (specifier === '@react-three/drei' || specifier === '@octanejs/drei') return '#drei-public';
	return specifier;
}

function structuralSource(source) {
	const sourceFile = ts.createSourceFile(
		'public-api.test-d.ts',
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const replacements = [];
	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
			continue;
		replacements.push({
			start: statement.moduleSpecifier.getStart(sourceFile) + 1,
			end: statement.moduleSpecifier.getEnd() - 1,
			value: normalizePackageRoot(statement.moduleSpecifier.text),
		});
	}
	let transformed = source;
	for (const replacement of replacements.sort(function byStart(a, b) {
		return b.start - a.start;
	})) {
		transformed = `${transformed.slice(0, replacement.start)}${replacement.value}${transformed.slice(replacement.end)}`;
	}
	const normalizedFile = ts.createSourceFile(
		'public-api.test-d.ts',
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

export function buildDreiTypeInventory(root, config) {
	const pristinePath = resolve(root, config.pristineFile);
	const adaptedPath = resolve(root, config.adaptedFile);
	const pristineSource = readFileSync(pristinePath, 'utf8');
	const adaptedSource = readFileSync(adaptedPath, 'utf8');
	const pristineGroups = assertionGroups(pristineSource, config.pristineFile);
	const adaptedGroups = assertionGroups(adaptedSource, config.adaptedFile);
	if (JSON.stringify(pristineGroups) !== JSON.stringify(adaptedGroups)) {
		throw new Error(
			'drei type assertion groups differ between pristine and adapted public-api probes',
		);
	}
	if (structuralSource(pristineSource) !== structuralSource(adaptedSource)) {
		throw new Error(
			'drei adapted type probe contains a change outside the permitted import-root transformation',
		);
	}
	return {
		pristine: {
			path: config.pristineFile,
			sha256: sha256(pristineSource),
			assertionGroups: pristineGroups.map(sha256),
		},
		adapted: {
			path: config.adaptedFile,
			sha256: sha256(adaptedSource),
			assertionGroups: adaptedGroups.map(sha256),
		},
		groups: pristineGroups,
	};
}

export function verifyDreiTypes(root, options = {}) {
	const configPath = options.configPath ?? TYPE_PARITY_CONFIG;
	const absoluteConfig = resolve(root, configPath);
	if (!existsSync(absoluteConfig)) throw new Error(`missing type parity config: ${configPath}`);
	const config = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
	const inventory = buildDreiTypeInventory(root, config);
	for (const side of ['pristine', 'adapted']) {
		const inventoryPath = resolve(root, config.inventories[side]);
		const recorded = existsSync(inventoryPath)
			? JSON.parse(readFileSync(inventoryPath, 'utf8'))
			: undefined;
		const expected = {
			path: inventory[side].path,
			sha256: inventory[side].sha256,
			assertionGroups: inventory[side].assertionGroups,
		};
		if (JSON.stringify(recorded) !== JSON.stringify(expected)) {
			throw new Error(
				`${side} drei type inventory drifted; review the change and regenerate its inventory`,
			);
		}
	}
	return {
		files: 2,
		assertions: inventory.groups.length,
	};
}

export function renderDreiTypeInventories(root, configPath = TYPE_PARITY_CONFIG) {
	const config = JSON.parse(readFileSync(resolve(root, configPath), 'utf8'));
	const inventory = buildDreiTypeInventory(root, config);
	return { config, inventory };
}
