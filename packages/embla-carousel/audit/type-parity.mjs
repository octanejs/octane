import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const PUBLIC_IMPORT = '#embla-public';

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function posix(value) {
	return value.split(sep).join('/');
}

function resolveFromRoot(baseRoot, pathValue) {
	return isAbsolute(pathValue) ? pathValue : resolve(baseRoot, pathValue);
}

function normalizeImportRoot(source) {
	return source
		.replace(/from ['"]embla-carousel-react['"]/g, `from '${PUBLIC_IMPORT}'`)
		.replace(/from ['"]@octanejs\/embla-carousel['"]/g, `from '${PUBLIC_IMPORT}'`);
}

function structuralSource(source) {
	return normalizeImportRoot(source).replace(/\s+/g, ' ').trim();
}

export function assertionGroups(source) {
	const normalized = normalizeImportRoot(source);
	const markerPattern = /^\/\/ @type-parity ([^\n]+)$/gm;
	const markers = [...normalized.matchAll(markerPattern)];
	if (markers.length === 0) {
		throw new Error('type suite has no @type-parity assertion groups');
	}
	return markers.map(function toGroup(marker, index) {
		const id = marker[1].trim();
		const bodyStart = marker.index + marker[0].length;
		const bodyEnd = index + 1 < markers.length ? markers[index + 1].index : normalized.length;
		const body = normalized.slice(bodyStart, bodyEnd).replace(/\s+/g, ' ').trim();
		return { id, hash: sha256(`${id}\n${body}`) };
	});
}

export function typeProjectFileNames(baseRoot, projectPath) {
	const absoluteProject = resolveFromRoot(baseRoot, projectPath);
	const readResult = ts.readConfigFile(absoluteProject, ts.sys.readFile);
	if (readResult.error) {
		throw new Error(
			`failed to read type project ${projectPath}: ${ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n')}`,
		);
	}
	const parsed = ts.parseJsonConfigFileContent(
		readResult.config,
		ts.sys,
		resolve(absoluteProject, '..'),
		undefined,
		absoluteProject,
	);
	return parsed.fileNames
		.map(function toPortable(fileName) {
			return posix(relative(baseRoot, fileName));
		})
		.sort();
}

export function verifyTypeProjectMembership(baseRoot, ledger) {
	if (!ledger.projects?.pristine || !ledger.projects?.adapted) {
		throw new Error('type-parity.json must declare pristine and adapted compiler projects');
	}
	for (const [side, projectPath] of [
		['pristine', ledger.projects.pristine],
		['adapted', ledger.projects.adapted],
	]) {
		const expected = ledger[side];
		const included = typeProjectFileNames(baseRoot, projectPath);
		if (!included.includes(expected)) {
			throw new Error(
				`${side} type-test file ${expected} is not included by compiler project ${projectPath}`,
			);
		}
	}
}

export function verifyTypeParity(ledger, pristine, adapted) {
	if (structuralSource(pristine) !== structuralSource(adapted)) {
		throw new Error(
			'adapted type suite differs from pristine outside the declared import-root transformation',
		);
	}

	const pristineGroups = assertionGroups(pristine);
	const adaptedGroups = assertionGroups(adapted);
	const pristineIds = pristineGroups.map(function idOf(group) {
		return group.id;
	});
	const adaptedIds = adaptedGroups.map(function idOf(group) {
		return group.id;
	});
	if (JSON.stringify(pristineIds) !== JSON.stringify(ledger.assertions)) {
		throw new Error('pristine assertion group inventory drifted from type-parity ledger');
	}
	if (JSON.stringify(adaptedIds) !== JSON.stringify(ledger.assertions)) {
		throw new Error('adapted assertion group inventory drifted from type-parity ledger');
	}
	if (JSON.stringify(pristineGroups) !== JSON.stringify(adaptedGroups)) {
		throw new Error('assertion group hashes differ between pristine and adapted type suites');
	}
	if (
		JSON.stringify(
			pristineGroups.map(function hashOf(group) {
				return group.hash;
			}),
		) !== JSON.stringify(ledger.assertionGroups)
	) {
		throw new Error('committed assertion group hashes drifted; regenerate type-parity.json');
	}

	for (const [label, source] of [
		['pristine', pristine],
		['adapted', adapted],
	]) {
		const negativeMarkers = [...source.matchAll(/^\/\/ @type-parity negative:/gm)].length;
		const expectedErrors = [...source.matchAll(/^\/\/ @ts-expect-error /gm)].length;
		if (negativeMarkers !== expectedErrors) {
			throw new Error(`${label} negative assertions lost an @ts-expect-error`);
		}
	}
}

export async function verifyCommittedTypeParity() {
	const ledger = JSON.parse(
		await readFile(resolve(root, 'packages/embla-carousel/audit/type-parity.json')),
	);
	verifyTypeProjectMembership(root, ledger);
	const [pristine, adapted] = await Promise.all([
		readFile(resolve(root, ledger.pristine), 'utf8'),
		readFile(resolve(root, ledger.adapted), 'utf8'),
	]);
	verifyTypeParity(ledger, pristine, adapted);
	return {
		assertions: ledger.assertions.length,
		assertionGroups: ledger.assertionGroups.length,
	};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const summary = await verifyCommittedTypeParity();
	console.log(
		`embla type parity ok: ${summary.assertions} assertions / ${summary.assertionGroups} hashed groups`,
	);
}
