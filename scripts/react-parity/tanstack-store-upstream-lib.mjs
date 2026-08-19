import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

import { extractTestCases } from './inventory-lib.mjs';
import { verifyTanstackStoreUpstream } from '../../packages/tanstack-store/scripts/verify-upstream.mjs';

export const RUNTIME_PARITY_CONFIG = 'packages/tanstack-store/audit/runtime-parity.json';

function readJson(repoRoot, relativePath) {
	return JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf8'));
}

function registrationCount(source, file) {
	return extractTestCases(source, { file }).length;
}

function stripPristineOnlyUseStore(source) {
	return source
		.replace(/\n\s*_useStore,\n/, '\n')
		.replace(/\ndescribe\('_useStore'[\s\S]*?\n\}\)\n/, '\n');
}

function normalizeJsxTextHoles(source) {
	return source.replace(
		/<(p|span|div|button|h\d)([^>]*)>\s*([A-Za-z][^<{]*?):\s*\{([^}]+)\}\s*<\/\1>/g,
		function replaceTextHole(_match, tag, attrs, label, expr) {
			return `<${tag}${attrs}>{'${label}: ' + ${expr.trim()}}</${tag}>`;
		},
	);
}

function normalizeImports(source) {
	let transformed = source;
	transformed = transformed.replace(/from '@testing-library\/react'/g, "from '#testing-library'");
	transformed = transformed.replace(
		/from '@octanejs\/testing-library'/g,
		"from '#testing-library'",
	);
	transformed = transformed.replace(
		/from '\.\.\/src(?:\/index)?'/g,
		"from '#tanstack-store-public'",
	);
	transformed = transformed.replace(
		/from '@octanejs\/tanstack-store'/g,
		"from '#tanstack-store-public'",
	);
	const storeImport = transformed.match(/import \{([^}]+)\} from '@tanstack\/store'/);
	if (storeImport) {
		const names = storeImport[1]
			.split(',')
			.map(function trimName(name) {
				return name.trim();
			})
			.filter(Boolean);
		transformed = transformed.replace(/import \{[^}]+\} from '@tanstack\/store'\n?/, '');
		transformed = transformed.replace(
			/import \{([^}]+)\} from '#tanstack-store-public'/,
			function mergePublicImport(_match, existing) {
				const set = new Set(
					existing
						.split(',')
						.map(function trimExisting(name) {
							return name.trim();
						})
						.filter(Boolean),
				);
				for (const name of names) set.add(name);
				return `import {\n\t${[...set].sort().join(',\n\t')},\n} from '#tanstack-store-public'`;
			},
		);
	}
	transformed = transformed.replace(/return\s*\(\s*(<[\s\S]*?>)\s*\)/g, 'return $1');
	return transformed;
}

function comparableRuntimeSource(source, side) {
	const withoutOmission = side === 'upstream' ? stripPristineOnlyUseStore(source) : source;
	return normalizeJsxTextHoles(normalizeImports(withoutOmission));
}

function assertionGroups(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const printer = ts.createPrinter({ removeComments: true });
	const groups = [];

	function isExpectRoot(node) {
		return (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'expect'
		);
	}

	function outermostExpectChain(node) {
		let current = node;
		while (
			current.parent &&
			(ts.isPropertyAccessExpression(current.parent) ||
				(ts.isCallExpression(current.parent) &&
					ts.isPropertyAccessExpression(current.parent.expression)))
		) {
			current = current.parent;
		}
		return current;
	}

	function visit(node) {
		if (isExpectRoot(node)) {
			const chain = outermostExpectChain(node);
			groups.push(
				printer.printNode(ts.EmitHint.Unspecified, chain, sourceFile).replace(/\s+/g, ' ').trim(),
			);
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return groups;
}

function normalizePrinted(printed) {
	return printed
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/ \./g, '.')
		.replace(/\. /g, '.')
		.replace(/ ,/g, ',')
		.replace(/\( /g, '(')
		.replace(/ \)/g, ')')
		.replace(/\[ /g, '[')
		.replace(/ \]/g, ']');
}

function structuralSource(source, fileName) {
	const collapsed = source.replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n');
	const sourceFile = ts.createSourceFile(
		fileName,
		collapsed,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
	const imports = [];
	const body = [];
	for (const statement of sourceFile.statements) {
		const printed = normalizePrinted(
			printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile),
		);
		if (ts.isImportDeclaration(statement)) imports.push(printed);
		else body.push(printed);
	}
	imports.sort();
	return `${imports.join(' ')} ${body.join(' ')}`.replace(/\s+/g, ' ').trim();
}

export function readRuntimeParityConfig(repoRoot, configPath = RUNTIME_PARITY_CONFIG) {
	const config = readJson(repoRoot, configPath);
	if (!config.upstreamTest || !config.adaptedFixture || !config.inventories) {
		throw new Error(
			'runtime-parity.json must define upstreamTest, adaptedFixture, and inventories',
		);
	}
	if (
		!Array.isArray(config.permittedTransformations) ||
		config.permittedTransformations.length === 0
	) {
		throw new Error('runtime-parity.json must declare an allowed-transformation ledger');
	}
	return config;
}

export function compareAdaptedRuntimeAssertions(upstreamSource, adaptedSource) {
	const comparableUpstream = comparableRuntimeSource(upstreamSource, 'upstream');
	const comparableAdapted = comparableRuntimeSource(adaptedSource, 'adapted');
	const upstreamGroups = assertionGroups(comparableUpstream, 'upstream.tsx');
	const adaptedGroups = assertionGroups(comparableAdapted, 'adapted.tsx');
	if (JSON.stringify(upstreamGroups) !== JSON.stringify(adaptedGroups)) {
		throw new Error(
			'tanstack-store adapted runtime assertions drifted from the permitted upstream crosswalk',
		);
	}
	const normalizedUpstream = structuralSource(comparableUpstream, 'upstream.tsx');
	const normalizedAdapted = structuralSource(comparableAdapted, 'adapted.tsx');
	if (normalizedUpstream !== normalizedAdapted) {
		throw new Error(
			'tanstack-store adapted runtime body contains a change outside the permitted transformations',
		);
	}
	return {
		assertionGroups: upstreamGroups.length,
	};
}

export function verifyTanstackStoreUpstreamEvidence(repoRoot) {
	const config = readRuntimeParityConfig(repoRoot);
	verifyTanstackStoreUpstream(resolve(repoRoot, 'packages/tanstack-store'));
	const upstreamSource = readFileSync(resolve(repoRoot, config.upstreamTest), 'utf8');
	const adaptedSource = readFileSync(resolve(repoRoot, config.adaptedFixture), 'utf8');
	const upstreamCount = registrationCount(upstreamSource, config.upstreamTest);
	const adaptedCount = registrationCount(adaptedSource, config.adaptedFixture);
	const expected = config.expectedRegistrations;
	if (upstreamCount !== expected.upstream) {
		throw new Error(
			`tanstack-store upstream suite must register ${expected.upstream} runtime cases, found ${upstreamCount}`,
		);
	}
	if (adaptedCount !== expected.adapted) {
		throw new Error(
			`tanstack-store adapted fixture must register ${expected.adapted} runtime cases, found ${adaptedCount}`,
		);
	}

	const assertionResult = compareAdaptedRuntimeAssertions(upstreamSource, adaptedSource);

	const pristine = readJson(repoRoot, config.inventories.pristine);
	const adaptedInventory = readJson(repoRoot, config.inventories.adapted);
	const omittedPrefix = config.omittedPrefix;
	const pristineNames = new Set(
		pristine.tests.map(function name(testCase) {
			return testCase.fullName;
		}),
	);
	const adaptedNames = new Set(
		adaptedInventory.tests.map(function name(testCase) {
			return testCase.fullName;
		}),
	);
	const omitted = [...pristineNames].filter(function isOmitted(fullName) {
		return fullName.startsWith(omittedPrefix);
	});
	const expectedAdapted = [...pristineNames].filter(function keepAdapted(fullName) {
		return !fullName.startsWith(omittedPrefix);
	});
	if (omitted.length !== expected.omitted) {
		throw new Error(
			`tanstack-store pristine inventory must retain exactly ${expected.omitted} _useStore identities`,
		);
	}
	if (pristine.tests.length !== upstreamCount) {
		throw new Error('tanstack-store pristine inventory must list every upstream runtime identity');
	}
	if (adaptedInventory.tests.length !== adaptedCount) {
		throw new Error('tanstack-store adapted inventory must list every adapted runtime identity');
	}
	for (const fullName of expectedAdapted) {
		if (!adaptedNames.has(fullName)) {
			throw new Error(`tanstack-store adapted inventory omitted paired identity: ${fullName}`);
		}
	}
	for (const fullName of omitted) {
		if (adaptedNames.has(fullName)) {
			throw new Error(`tanstack-store adapted inventory must omit _useStore identity: ${fullName}`);
		}
	}
	if (adaptedNames.size !== expectedAdapted.length) {
		throw new Error('tanstack-store adapted inventory contains unexpected identities');
	}

	return {
		upstreamCases: upstreamCount,
		adaptedCases: adaptedCount,
		omittedCases: omitted.length,
		assertionGroups: assertionResult.assertionGroups,
		permittedTransformations: config.permittedTransformations.length,
	};
}
