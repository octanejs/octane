import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export const TYPE_PARITY_CONFIG = 'packages/visx/audit/type-parity.json';

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
			return /\.test-d\.ts$/.test(relativePath);
		})
		.map(function toRelative(entry) {
			return posix(relative(root, resolve(entry.parentPath ?? entry.path, entry.name)));
		})
		.sort();
}

function assertionGroups(source) {
	const groups = [];
	for (const match of source.matchAll(/\/\/\s*(\d+)\.\s+([^\n]+)/g)) {
		groups.push(`group:${match[1]}:${match[2].trim().replace(/\s+/g, ' ')}`);
	}
	for (const match of source.matchAll(/\/\/\s*@ts-expect-error([^\n]*)\n\s*([^\n]+)/g)) {
		groups.push(`expect-error:${match[1].trim()}:${match[2].replace(/\s+/g, ' ').trim()}`);
	}
	for (const match of source.matchAll(/^\s*(accept(?:Children|Centroid)Return\([^\n]+);/gm)) {
		groups.push(`call:${match[1].replace(/\s+/g, ' ').trim()}`);
	}
	return groups;
}

function normalizeSpecifier(specifier) {
	if (specifier === '@visx/visx') return '#visx-public';
	if (specifier.endsWith('/shape/shapes/Pie.tsrx')) return '#visx-public';
	return specifier;
}

function stripExpectError(source) {
	return source.replace(/^\s*\/\/\s*@ts-expect-error[^\n]*\n/gm, '');
}

function structuralSource(source, fileName) {
	const withoutPolarityComments = stripExpectError(source)
		.replace(
			/\/\/\s*\d+\.\s+Pie children render-prop return (?:rejects|accepts) an Octane renderable\./g,
			'// 1. Pie children render-prop return polarity.',
		)
		.replace(
			/\/\/\s*\d+\.\s+Pie centroid return (?:rejects|accepts) an Octane renderable\./g,
			'// 2. Pie centroid return polarity.',
		);
	const sourceFile = ts.createSourceFile(
		fileName,
		withoutPolarityComments,
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
	let transformed = withoutPolarityComments;
	for (const replacement of replacements.sort(function byStartDesc(a, b) {
		return b.start - a.start;
	})) {
		transformed = `${transformed.slice(0, replacement.start)}${replacement.value}${transformed.slice(replacement.end)}`;
	}
	transformed = transformed
		.replace(/\bimport\s+type\s+/g, 'import ')
		.replace(/type ComponentProps<C> = C extends \(props: infer P\) => any \? P : never;\s*/g, '')
		.replace(
			/type PiePropsUnderTest = ComponentProps<typeof Shape\.Pie>;/g,
			'type PiePropsUnderTest = PiePropsUnderTestAlias;',
		)
		.replace(
			/type PiePropsUnderTest = PieProps<number>;/g,
			'type PiePropsUnderTest = PiePropsUnderTestAlias;',
		)
		.replace(/\bShape\b/g, 'VisxSurface')
		.replace(/\bPieProps\b/g, 'VisxSurface');
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
		.replace(/\bimport type\b/g, 'import')
		.replace(/\s+/g, ' ')
		.trim();
}

function pairedAssertionGroups(upstreamSource, adaptedSource) {
	const upstream = assertionGroups(upstreamSource);
	const adapted = assertionGroups(adaptedSource);
	const upstreamCalls = upstream.filter(function keepCalls(entry) {
		return entry.startsWith('call:');
	});
	const adaptedCalls = adapted.filter(function keepCalls(entry) {
		return entry.startsWith('call:');
	});
	if (JSON.stringify(upstreamCalls) !== JSON.stringify(adaptedCalls)) {
		throw new Error(
			'types.test-d.ts: assertion call shapes differ between pristine and adapted type suites',
		);
	}
	const upstreamGroups = upstream.filter(function keepGroups(entry) {
		return entry.startsWith('group:');
	});
	const adaptedGroups = adapted.filter(function keepGroups(entry) {
		return entry.startsWith('group:');
	});
	if (upstreamGroups.length !== adaptedGroups.length) {
		throw new Error(
			'types.test-d.ts: assertion groups differ between pristine and adapted type suites',
		);
	}
	for (let index = 0; index < upstreamGroups.length; index += 1) {
		const upstreamGroup = upstreamGroups[index].replace(/ (?:rejects|accepts) /g, ' polarity ');
		const adaptedGroup = adaptedGroups[index].replace(/ (?:rejects|accepts) /g, ' polarity ');
		if (upstreamGroup !== adaptedGroup) {
			throw new Error(
				'types.test-d.ts: assertion groups differ between pristine and adapted type suites',
			);
		}
	}
	const upstreamErrors = upstream.filter(function keepErrors(entry) {
		return entry.startsWith('expect-error:');
	});
	if (upstreamErrors.length !== upstreamCalls.length) {
		throw new Error(
			'types.test-d.ts: pristine suite must keep one @ts-expect-error per paired reject call',
		);
	}
	const adaptedErrors = adapted.filter(function keepErrors(entry) {
		return entry.startsWith('expect-error:');
	});
	if (adaptedErrors.length !== 0) {
		throw new Error(
			'types.test-d.ts: adapted suite must not keep pristine @ts-expect-error polarity markers',
		);
	}
	return { upstream, adapted };
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
		const groups = pairedAssertionGroups(upstreamSource, adaptedSource);
		if (structuralSource(upstreamSource, file) !== structuralSource(adaptedSource, file)) {
			throw new Error(
				`${file}: adapted type test contains a change outside the permitted transformations`,
			);
		}
		upstream.push({
			path: file,
			sha256: sha256(upstreamSource),
			assertionGroups: groups.upstream.map(sha256),
		});
		adapted.push({
			path: file,
			sha256: sha256(adaptedSource),
			assertionGroups: groups.adapted.map(sha256),
		});
	}
	return { upstream, adapted };
}

export function verifyVisxTypes(root, { configPath = TYPE_PARITY_CONFIG } = {}) {
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
