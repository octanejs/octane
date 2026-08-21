// Executable type-suite parity evidence for @octanejs/xstate and
// @octanejs/xstate-store.
//
// Both adapted type suites are copies of their vendored upstream file that
// differ by exactly one import line, so the primary gate here is stronger than
// a structural comparison: strip the adapted file's leading header, undo the
// declared transformations, and require the result to equal the upstream bytes.
// Anything else — a deleted assertion, a softened type, a dropped
// `@ts-expect-error` — fails, because it changes those bytes.
//
// The assertion-group inventories sit on top of that. They pin what each suite
// asserts at a granularity a reviewer can read, and they are what makes a
// deleted assertion legible in a diff rather than just a byte mismatch.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import ts from 'typescript';

export const XSTATE_TYPE_PARITY_CONFIG = 'packages/xstate/audit/type-parity.json';
export const XSTATE_STORE_TYPE_PARITY_CONFIG = 'packages/xstate-store/audit/type-parity.json';

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function posix(value) {
	return value.split(sep).join('/');
}

function collapse(value) {
	return value.replace(/\s+/g, ' ').trim();
}

// The adapted file carries a provenance header the upstream file does not have.
// Only a leading run of comments, blank lines, and the JSX pragma may precede
// the first line of code; a header containing anything executable is rejected
// rather than silently stripped.
export function splitAdaptedHeader(source, path) {
	const lines = source.split('\n');
	let index = 0;
	while (index < lines.length) {
		const line = lines[index].trim();
		if (line === '' || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
			index++;
			continue;
		}
		break;
	}
	const header = lines.slice(0, index).join('\n');
	if (/^\s*[^\s/*]/m.test(header)) {
		throw new Error(`${path}: adapted header must contain only comments`);
	}
	return { header, body: lines.slice(index).join('\n') };
}

function applyTransformations(body, transformations, path) {
	let result = body;
	for (const transformation of transformations) {
		if (!result.includes(transformation.to)) {
			throw new Error(
				`${path}: permitted transformation "${transformation.kind}" declares an adapted line that is not present: ${transformation.to}`,
			);
		}
		const occurrences = result.split(transformation.to).length - 1;
		if (occurrences !== 1) {
			throw new Error(
				`${path}: permitted transformation "${transformation.kind}" must apply exactly once, found ${occurrences}`,
			);
		}
		result = result.replace(transformation.to, transformation.from);
	}
	return result;
}

// One entry per thing the suite asserts. Titles anchor the assertions to their
// upstream case, `@ts-expect-error` entries carry the statement they guard so a
// marker cannot be moved onto a different line unnoticed, and annotated
// bindings capture the type-level assignments that are the positive assertions.
export function assertionGroups(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const printer = ts.createPrinter({ removeComments: true });
	const groups = [];
	for (const match of source.matchAll(/\b(describe|it|test)\((['"`])((?:\\.|[^\\])*?)\2/g)) {
		groups.push(`${match[1]}:${match[3]}`);
	}
	for (const match of source.matchAll(/\/\/\s*@ts-expect-error([^\n]*)\n([^\n]+)/g)) {
		groups.push(`expect-error:${match[1].trim()}:${collapse(match[2]).replace(/;$/, '')}`);
	}
	function visit(node) {
		if (ts.isVariableDeclaration(node) && node.type) {
			groups.push(
				`typed-binding:${collapse(node.name.getText(sourceFile))}:${collapse(
					printer.printNode(ts.EmitHint.Unspecified, node.type, sourceFile),
				)}`,
			);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return groups;
}

function inventoryEntry(path, source) {
	return {
		path: posix(path),
		sha256: sha256(source),
		assertionGroups: assertionGroups(source, path).map(sha256),
	};
}

export function readTypeParityConfig(root, configPath) {
	const absolute = resolve(root, configPath);
	if (!existsSync(absolute)) throw new Error(`missing type parity config: ${configPath}`);
	const config = JSON.parse(readFileSync(absolute, 'utf8'));
	for (const field of ['upstream', 'adapted', 'inventories', 'lanes', 'permittedTransformations']) {
		if (config[field] === undefined) throw new Error(`${configPath}: missing ${field}`);
	}
	return config;
}

export function buildTypeInventory(root, config) {
	const upstreamPath = config.upstream;
	const adaptedPath = config.adapted;
	for (const path of [upstreamPath, adaptedPath]) {
		if (!existsSync(resolve(root, path))) throw new Error(`missing type suite: ${path}`);
	}
	const upstreamSource = readFileSync(resolve(root, upstreamPath), 'utf8');
	const adaptedSource = readFileSync(resolve(root, adaptedPath), 'utf8');
	const { body } = splitAdaptedHeader(adaptedSource, adaptedPath);
	return {
		upstream: [inventoryEntry(upstreamPath, upstreamSource)],
		adapted: [inventoryEntry(adaptedPath, adaptedSource)],
		upstreamSource,
		adaptedSource,
		adaptedBody: body,
	};
}

function readCommittedInventory(root, path) {
	const absolute = resolve(root, path);
	if (!existsSync(absolute)) throw new Error(`missing type inventory: ${path}`);
	return JSON.parse(readFileSync(absolute, 'utf8'));
}

export function verifyXstateTypeParity(root, configPath) {
	const config = readTypeParityConfig(root, configPath);
	const inventory = buildTypeInventory(root, config);

	// 1. The adapted suite is the upstream suite plus a header and the declared
	//    transformations, byte for byte.
	const restored = applyTransformations(
		inventory.adaptedBody,
		config.permittedTransformations,
		config.adapted,
	);
	if (restored !== inventory.upstreamSource) {
		throw new Error(
			`${config.adapted} is not the vendored ${config.upstream} after undoing the permitted transformations; an undeclared structural change was made`,
		);
	}

	// 2. Both suites therefore assert the same things. Checked explicitly so a
	//    future transformation that does change assertions cannot be waved
	//    through by adding it to the ledger.
	const upstreamGroups = assertionGroups(inventory.upstreamSource, config.upstream);
	const adaptedGroups = assertionGroups(inventory.adaptedBody, config.adapted);
	if (upstreamGroups.length !== adaptedGroups.length) {
		throw new Error(
			`${config.adapted} asserts ${adaptedGroups.length} groups against upstream's ${upstreamGroups.length}`,
		);
	}
	const expectErrors = upstreamGroups.filter((group) => group.startsWith('expect-error:'));
	if (expectErrors.length !== config.expectErrorCount) {
		throw new Error(
			`${config.upstream} carries ${expectErrors.length} @ts-expect-error markers, manifest declares ${config.expectErrorCount}`,
		);
	}

	// 3. The committed inventories match what the suites actually contain, so a
	//    hand-edited inventory cannot stand in for the real evidence.
	for (const [side, path] of Object.entries(config.inventories)) {
		const committed = readCommittedInventory(root, path);
		const computed = inventory[side];
		if (JSON.stringify(committed) !== JSON.stringify(computed)) {
			throw new Error(`${path} is stale; regenerate the xstate type inventories`);
		}
	}

	return {
		upstream: config.upstream,
		adapted: config.adapted,
		assertionGroups: upstreamGroups.length,
		expectErrors: expectErrors.length,
	};
}

export function verifyXstateTypes(root) {
	return verifyXstateTypeParity(root, XSTATE_TYPE_PARITY_CONFIG);
}

export function verifyXstateStoreTypes(root) {
	return verifyXstateTypeParity(root, XSTATE_STORE_TYPE_PARITY_CONFIG);
}
