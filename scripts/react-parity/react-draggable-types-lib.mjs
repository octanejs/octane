import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

export const TYPE_PARITY_CONFIG = 'packages/draggable/audit/type-parity.json';

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function packageRootFrom(rootOrPackage, options = {}) {
	if (options.packageRoot) return resolve(options.packageRoot);
	const candidate = resolve(rootOrPackage, 'packages/draggable');
	if (existsSync(resolve(candidate, 'audit/type-parity.json'))) return candidate;
	return resolve(rootOrPackage);
}

function toPackageRelative(path, packageRoot, repoRoot) {
	if (path.startsWith('packages/draggable/')) {
		return path.slice('packages/draggable/'.length);
	}
	if (path.startsWith(packageRoot)) {
		return path.slice(packageRoot.length + 1);
	}
	if (repoRoot && path.startsWith(repoRoot)) {
		const relative = path.slice(repoRoot.length + 1);
		if (relative.startsWith('packages/draggable/')) {
			return relative.slice('packages/draggable/'.length);
		}
	}
	return path;
}

function normalizeText(source) {
	return source.replace(/\s+/g, ' ').trim();
}

function assertionGroups(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		fileName.endsWith('.tsx') || fileName.endsWith('.tsrx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
	const printer = ts.createPrinter({ removeComments: true });
	const groups = [];
	for (const match of source.matchAll(/\/\/\s*@ts-expect-error([^\n]*)\n\s*([^\n]+)/g)) {
		groups.push(`expect-error:${match[1].trim()}:${normalizeText(match[2])}`);
	}
	function visit(node) {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'expectType' &&
			node.typeArguments &&
			node.typeArguments.length === 1
		) {
			const typeText = normalizeText(
				printer.printNode(ts.EmitHint.Unspecified, node.typeArguments[0], sourceFile),
			);
			const argText =
				node.arguments.length > 0
					? normalizeText(printer.printNode(ts.EmitHint.Unspecified, node.arguments[0], sourceFile))
					: '';
			groups.push(`expectType:${typeText}:${argText}`);
		}
		if (ts.isVariableDeclaration(node) && node.type && node.initializer) {
			const typeText = normalizeText(
				printer.printNode(ts.EmitHint.Unspecified, node.type, sourceFile),
			);
			const initText = normalizeText(
				printer.printNode(ts.EmitHint.Unspecified, node.initializer, sourceFile),
			);
			if (/\[.children.\]/.test(typeText) || /\['children'\]/.test(typeText)) {
				groups.push(`children-probe:${typeText}:${initText}`);
			} else if (
				typeText === 'DraggableProps' ||
				typeText === 'DraggableCoreProps' ||
				typeText === 'ControlPosition' ||
				typeText === 'DraggableBounds' ||
				typeText === 'DraggableData' ||
				typeText === 'PositionOffsetControlPosition'
			) {
				groups.push(`prop-probe:${node.name.getText(sourceFile)}:${typeText}:${initText}`);
			}
		}
		if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
			const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
			if (ts.isIdentifier(tag) && (tag.text === 'Draggable' || tag.text === 'DraggableCore')) {
				groups.push(
					`jsx-probe:${normalizeText(printer.printNode(ts.EmitHint.Unspecified, node, sourceFile))}`,
				);
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return groups;
}

function buildFileInventory(relativePath, source) {
	const groups = assertionGroups(source, relativePath);
	return {
		path: relativePath,
		assertionGroups: groups,
		assertionGroupCount: groups.length,
		sha256: sha256(JSON.stringify(groups)),
	};
}

export function readTypeParityConfig(rootOrPackage, options = {}) {
	const packageRoot = packageRootFrom(rootOrPackage, options);
	const absolute = resolve(packageRoot, 'audit/type-parity.json');
	if (!existsSync(absolute)) throw new Error(`missing type parity config: ${absolute}`);
	return JSON.parse(readFileSync(absolute, 'utf8'));
}

export function buildReactDraggableTypeInventories(rootOrPackage, config, options = {}) {
	const packageRoot = packageRootFrom(rootOrPackage, options);
	const resolvedConfig = config ?? readTypeParityConfig(packageRoot, { packageRoot });
	const upstream = [];
	const adapted = [];
	for (const entry of resolvedConfig.fileDispositions) {
		if (entry.disposition === 'out-of-scope') continue;
		const upstreamRelative = toPackageRelative(resolvedConfig.upstreamRoot, packageRoot);
		const upstreamPath = resolve(packageRoot, upstreamRelative, entry.path);
		if (!existsSync(upstreamPath)) {
			throw new Error(`missing upstream type artifact ${entry.path}`);
		}
		const upstreamSource = readFileSync(upstreamPath, 'utf8');
		upstream.push(buildFileInventory(entry.path, upstreamSource));
		if (entry.disposition === 'adapted') {
			const adaptedRelative = toPackageRelative(entry.adaptedPath, packageRoot);
			if (!adaptedRelative) {
				throw new Error(`${entry.path}: adapted disposition requires adaptedPath`);
			}
			const adaptedPath = resolve(packageRoot, adaptedRelative);
			if (!existsSync(adaptedPath)) {
				throw new Error(`${entry.path}: missing adapted type artifact ${adaptedRelative}`);
			}
			const adaptedSource = readFileSync(adaptedPath, 'utf8');
			const inventory = buildFileInventory(
				entry.adaptedPath.startsWith('packages/') ? entry.adaptedPath : adaptedRelative,
				adaptedSource,
			);
			const upstreamGroups = assertionGroups(upstreamSource, entry.path);
			for (const dropped of entry.upstreamOnlyAssertionGroups ?? []) {
				if (!upstreamGroups.includes(dropped)) {
					throw new Error(
						`${entry.path}: upstreamOnlyAssertionGroups entry is not present upstream: ${dropped}`,
					);
				}
				if (inventory.assertionGroups.includes(dropped)) {
					throw new Error(
						`${adaptedRelative}: upstream-only group unexpectedly present in adapted suite: ${dropped}`,
					);
				}
			}
			for (const required of entry.requiredAdaptedAssertionGroups ?? inventory.assertionGroups) {
				if (!inventory.assertionGroups.includes(required)) {
					throw new Error(
						`${adaptedRelative}: missing required adapted assertion group ${required}`,
					);
				}
			}
			const expectErrors = inventory.assertionGroups.filter(function keep(group) {
				return group.startsWith('expect-error:');
			});
			if ((entry.minExpectErrors ?? 0) > expectErrors.length) {
				throw new Error(
					`${adaptedRelative}: expected at least ${entry.minExpectErrors} @ts-expect-error controls`,
				);
			}
			adapted.push(inventory);
		} else if (entry.disposition === 'pristine-only') {
			if (!Array.isArray(entry.adaptedEvidence)) {
				throw new Error(`${entry.path}: pristine-only requires adaptedEvidence`);
			}
			for (const evidence of entry.adaptedEvidence) {
				const evidencePath = resolve(packageRoot, toPackageRelative(evidence, packageRoot));
				if (!existsSync(evidencePath)) {
					throw new Error(`${entry.path}: missing adaptedEvidence ${evidence}`);
				}
			}
		}
	}
	return { upstream, adapted };
}

export function verifyReactDraggableTypes(rootOrPackage, options = {}) {
	const packageRoot = packageRootFrom(rootOrPackage, options);
	const config = readTypeParityConfig(packageRoot, { packageRoot });
	const { upstream, adapted } = buildReactDraggableTypeInventories(packageRoot, config, {
		packageRoot,
	});
	const expectedUpstream = JSON.parse(
		readFileSync(
			resolve(packageRoot, toPackageRelative(config.inventories.upstream, packageRoot)),
			'utf8',
		),
	);
	const expectedAdapted = JSON.parse(
		readFileSync(
			resolve(packageRoot, toPackageRelative(config.inventories.adapted, packageRoot)),
			'utf8',
		),
	);
	if (JSON.stringify(upstream) !== JSON.stringify(expectedUpstream)) {
		throw new Error('react-draggable pristine type inventory drifted');
	}
	if (JSON.stringify(adapted) !== JSON.stringify(expectedAdapted)) {
		throw new Error('react-draggable adapted type inventory drifted');
	}
	for (const transform of config.permittedTransformations ?? []) {
		if (!transform.kind || !transform.rule) {
			throw new Error('type-parity permittedTransformations require kind and rule');
		}
	}
	return {
		upstreamFiles: upstream.length,
		adaptedFiles: adapted.length,
		upstreamAssertions: upstream.reduce(function sum(total, file) {
			return total + file.assertionGroupCount;
		}, 0),
		adaptedAssertions: adapted.reduce(function sum(total, file) {
			return total + file.assertionGroupCount;
		}, 0),
	};
}
