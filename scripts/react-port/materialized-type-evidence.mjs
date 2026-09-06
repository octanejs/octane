import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { planAdaptedFiles, validateUpstreamLock, verifyPristineTree } from './materialize-lib.mjs';

function assertionCounts(source, file) {
	if (/@ts-(?:nocheck|ignore)\b/.test(source))
		throw new Error(`Type evidence suppresses checking: ${file}`);
	const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const counts = {
		checks: 0,
		negative: [...source.matchAll(/@ts-expect-error\b/g)].length,
		any: 0,
		statements: ast.statements.filter((statement) => !ts.isImportDeclaration(statement)).length,
	};
	const visit = (node) => {
		if (node.kind === ts.SyntaxKind.AnyKeyword) counts.any++;
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			['expectType', 'expectTypeOf'].includes(node.expression.text)
		)
			counts.checks++;
		ts.forEachChild(node, visit);
	};
	visit(ast);
	return counts;
}

// A materialized suite is itself the assertion authority. Compile the exact
// pinned files (including their setup declarations) or the checked adaptations;
// wrapping every statement in an extra invented assertion would change that
// authority and exclude libraries that publish only subpath entry points.
export function assertMaterializedTypeEvidence({ gateId, node, packageDirectory, programFiles }) {
	const lock = validateUpstreamLock(
		JSON.parse(readFileSync(path.join(packageDirectory, 'audit/upstream.lock.json'), 'utf8')),
	);
	for (const key of ['packageName', 'version', 'commit']) {
		if (lock.identity[key] !== node.identity?.[key]) {
			throw new Error(`Materialized type evidence has a different pinned ${key}`);
		}
	}
	const integrity = verifyPristineTree(lock, path.join(packageDirectory, 'upstream'));
	if (Object.values(integrity).some((files) => files.length > 0)) {
		throw new Error(
			`Materialized type evidence has invalid pristine bytes: ${JSON.stringify(integrity)}`,
		);
	}
	const inventory = (node.upstreamTestInventory ?? []).filter(({ kind }) => kind === 'type');
	if (inventory.length === 0)
		throw new Error('Materialized type evidence requires a pinned type inventory');
	const prefix = lock.identity.repository.subdirectory
		? `${lock.identity.repository.subdirectory}/`
		: '';
	const lockedFiles = new Map(lock.files.map((file) => [file.path, file]));
	const adaptedFiles = new Map(
		planAdaptedFiles(lock).map((file) => [file.sourcePath, file.targetPath]),
	);
	const selected = new Set(programFiles.map((file) => path.resolve(file)));
	for (const entry of inventory) {
		if (!entry.path.startsWith(prefix))
			throw new Error(`Type inventory escapes the pinned subtree: ${entry.path}`);
		const sourcePath = entry.path.slice(prefix.length);
		const pinned = lockedFiles.get(sourcePath);
		if (!pinned || pinned.gitBlob !== entry.gitBlob || pinned.size !== entry.size) {
			throw new Error(`Type inventory differs from the immutable file: ${entry.path}`);
		}
		const target =
			gateId === 'upstream-types-pristine'
				? `upstream/${sourcePath}`
				: adaptedFiles.get(sourcePath);
		if (!target) throw new Error(`Type inventory has no adapted mapping: ${entry.path}`);
		const absolute = path.resolve(packageDirectory, target);
		if (!selected.has(absolute)) throw new Error(`Type project omits pinned type file: ${target}`);
		if (realpathSync(absolute) !== absolute)
			throw new Error(`Type project redirects a pinned type file: ${target}`);
		const original = readFileSync(path.join(packageDirectory, 'upstream', sourcePath), 'utf8');
		const expected = assertionCounts(original, sourcePath);
		if (gateId === 'upstream-types-adapted') {
			const actual = assertionCounts(readFileSync(absolute, 'utf8'), target);
			for (const key of ['checks', 'negative', 'statements']) {
				if (actual[key] < expected[key])
					throw new Error(`Adapted type evidence removed ${key}: ${target}`);
			}
			if (actual.any > expected.any) throw new Error(`Adapted type evidence added any: ${target}`);
		}
	}
	if (gateId === 'upstream-types-adapted') {
		execFileSync(
			process.execPath,
			[
				fileURLToPath(new URL('./materialize.mjs', import.meta.url)),
				'run',
				'--check',
				'--package-dir',
				packageDirectory,
			],
			{ encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 },
		);
	}
}
