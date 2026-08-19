import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	buildAdaptedStructureInventory,
	buildUpstreamStructureInventory,
	sameStructureLedgers,
} from '../../../scripts/react-parity/react-draggable-case-structure-lib.mjs';
import { verifyReactDraggableTestClassifications } from '../../../scripts/react-parity/react-draggable-classifications-lib.mjs';
import { verifyReactDraggableTypes } from '../../../scripts/react-parity/react-draggable-types-lib.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inventoryPath = join(packageRoot, 'audit/upstream-inventory.json');
const ORACLE_VERSIONS = {
	react: '19.2.7',
	'react-dom': '19.2.7',
	'@types/react': '19.2.17',
	'@types/react-dom': '19.2.3',
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function filesUnder(root) {
	const result = [];
	async function visit(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) await visit(path);
			else result.push(relative(root, path).replaceAll('\\', '/'));
		}
	}
	await visit(root);
	return result.sort();
}

function staticCalls(source, callees) {
	const pattern = new RegExp(
		`\\b(?:${callees.join('|')})\\s*\\(\\s*(['\"\\x60])((?:\\\\.|(?!\\1)[\\s\\S])*?)\\1`,
		'g',
	);
	return [...source.matchAll(pattern)].map((match) => ({
		line: source.slice(0, match.index).split(/\r?\n/).length,
		name: match[2].replace(/\\(['\"`\\])/g, '$1'),
	}));
}

function expectTypeAssertions(source) {
	return source.split(/\r?\n/).flatMap((line, index) => {
		const trimmed = line.trim();
		return trimmed.startsWith('expectType<')
			? [{ id: `test/typeCompat/fixture.tsx:${index + 1}`, statement: trimmed }]
			: [];
	});
}

function parityMarkers(source, path) {
	return [...source.matchAll(/@parity-case\s+([^\s*]+)/g)].map((match) => ({
		id: match[1],
		path,
	}));
}

function adaptedUnitId(entry) {
	return `adapted-public:${entry.file}::${entry.name}`;
}

function adaptedUnitIdentity(entry) {
	return `${entry.file}::${entry.name}`;
}

function adaptedBrowserIdentity(entry) {
	return `${entry.file}::${entry.name}`;
}

function adaptedBrowserId(entry) {
	return `adapted-browser:${adaptedBrowserIdentity(entry)}`;
}

async function buildInventory(root = packageRoot) {
	const upstreamRoot = join(root, 'upstream');
	const artifactFiles = await filesUnder(upstreamRoot);
	const artifacts = [];
	for (const path of artifactFiles) {
		const bytes = await readFile(join(upstreamRoot, path));
		artifacts.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
	}

	const unitFiles = artifactFiles.filter(
		(path) =>
			path.startsWith('tag/test/') &&
			!path.startsWith('tag/test/browser/') &&
			/\.test\.(?:js|jsx|ts|tsx)$/.test(path),
	);
	const unitCases = [];
	for (const path of unitFiles) {
		const source = await readFile(join(upstreamRoot, path), 'utf8');
		for (const { line, name } of staticCalls(source, ['it', 'test']))
			unitCases.push({ id: `${path}:${line}::${name}`, file: path, line, name });
	}
	const browserPath = 'tag/test/browser/browser.test.js';
	const browserSource = await readFile(join(upstreamRoot, browserPath), 'utf8');
	const browserCases = staticCalls(browserSource, ['it', 'test']).map(({ line, name }) => ({
		id: `${browserPath}:${line}::${name}`,
		file: browserPath,
		line,
		name,
	}));
	const typeSource = await readFile(join(upstreamRoot, 'tag/test/typeCompat/fixture.tsx'), 'utf8');

	const markerPaths = [
		'tests/runtime/draggable.test.ts',
		'tests/runtime/core.test.ts',
		'tests/differential/parity.test.ts',
		'tests/hydration/hydration.test.ts',
		'tests/ssr/server.test.ts',
	];
	const adaptedCases = [];
	for (const path of markerPaths) {
		const source = await readFile(join(root, path), 'utf8');
		adaptedCases.push(...parityMarkers(source, path));
	}
	const publicCasePath = 'tests/upstream/public-root.test.ts';
	const publicCaseSource = await readFile(join(root, publicCasePath), 'utf8');
	const publicCases = staticCalls(publicCaseSource, ['adaptedCase']);
	const publicUnitCases = unitCases.filter(
		(entry) => !entry.file.includes('/utils/') && entry.file !== 'tag/test/typeCompat.test.ts',
	);
	sameIdentities(publicCases, publicUnitCases, 'adapted public unit case', (value) =>
		value.file ? adaptedUnitIdentity(value) : value.name,
	);
	for (const entry of publicUnitCases) {
		const identity = adaptedUnitIdentity(entry);
		const matched = publicCases.find((candidate) => candidate.name === identity);
		adaptedCases.push({
			id: adaptedUnitId(entry),
			path: publicCasePath,
			name: entry.name,
			line: matched.line,
		});
	}
	const browserCasePath = 'tests/browser/parity.browser.test.ts';
	const browserCaseSource = await readFile(join(root, browserCasePath), 'utf8');
	const browserAdapted = staticCalls(browserCaseSource, ['adaptedCase']);
	sameIdentities(browserAdapted, browserCases, 'adapted browser case', (value) =>
		value.file ? adaptedBrowserIdentity(value) : value.name,
	);
	for (const entry of browserCases) {
		const identity = adaptedBrowserIdentity(entry);
		const matched = browserAdapted.find((candidate) => candidate.name === identity);
		adaptedCases.push({
			id: adaptedBrowserId(entry),
			path: browserCasePath,
			name: entry.name,
			line: matched.line,
		});
	}
	adaptedCases.push(
		{ id: 'type-program:adapted-consumer', path: 'typetests/adapted/typings.consumer.ts' },
		{ id: 'type-program:adapted-compatibility', path: 'typetests/adapted/typeCompat.fixture.ts' },
		{ id: 'type-program:pristine', path: 'typetests/tsconfig.pristine.json' },
		{ id: 'type-program:adapted', path: 'typetests/tsconfig.adapted.json' },
	);
	const adaptedStructure = buildAdaptedStructureInventory(root);
	const upstreamStructure = buildUpstreamStructureInventory(root, publicUnitCases, browserCases);
	const adaptedById = new Map(adaptedCases.map((entry) => [entry.id, entry]));
	assert(
		adaptedById.size === adaptedCases.length,
		'adapted parity case identifiers must be unique',
	);
	const structureByIdentity = new Map(
		adaptedStructure.map(function pair(entry) {
			return [entry.identity, entry];
		}),
	);
	for (const entry of publicUnitCases) {
		const identity = adaptedUnitIdentity(entry);
		assert(
			structureByIdentity.has(identity),
			`adapted public unit case structure missing for ${identity}`,
		);
		assert(
			structureByIdentity.get(identity).assertions.length > 0 ||
				structureByIdentity.get(identity).scenarioSteps.length > 0,
			`adapted public unit case ${identity} has an empty callback structure`,
		);
	}
	for (const entry of browserCases) {
		const identity = adaptedBrowserIdentity(entry);
		assert(
			structureByIdentity.has(identity),
			`adapted browser case structure missing for ${identity}`,
		);
		assert(
			structureByIdentity.get(identity).assertions.length > 0 ||
				structureByIdentity.get(identity).scenarioSteps.length > 0,
			`adapted browser case ${identity} has an empty callback structure`,
		);
	}

	const sourceFiles = artifactFiles.filter((path) => path.startsWith('tag/lib/'));
	const runtimeExports = ['default', 'DraggableCore'];
	const typeExports = [
		'ControlPosition',
		'DraggableBounds',
		'DraggableCoreProps',
		'DraggableData',
		'DraggableEvent',
		'DraggableEventHandler',
		'DraggableProps',
		'PositionOffsetControlPosition',
	];
	const fixtures = artifactFiles.filter(
		(path) => path.startsWith('tag/test/') && !/\.test\.(?:js|jsx|ts|tsx)$/.test(path),
	);

	const sourceEvidence = (path) => {
		if (path === 'tag/lib/Draggable.tsx')
			return ['src/Draggable.tsrx', 'tests/runtime/draggable.test.ts'];
		if (path === 'tag/lib/DraggableCore.tsx')
			return ['src/DraggableCore.tsrx', 'tests/runtime/core.test.ts'];
		if (path === 'tag/lib/cjs.ts' || path === 'tag/lib/umd.ts')
			return ['src/index.tsrx', 'tests/runtime/draggable.test.ts'];
		if (path === 'tag/lib/utils/types.ts')
			return ['src/types.ts', 'typetests/adapted/typeCompat.fixture.ts'];
		return [path.replace('tag/lib/', 'src/'), 'tests/upstream/public-root.test.ts'];
	};
	const unitCoverage = (entry) => {
		if (entry.file.includes('/utils/')) return [];
		if (entry.file === 'tag/test/typeCompat.test.ts')
			return ['type-program:adapted-consumer', 'type-program:adapted-compatibility'];
		return [adaptedUnitId(entry)];
	};
	const evidenceFor = (caseIds) => [
		...new Set(
			caseIds.map((id) => {
				const matched = adaptedById.get(id);
				assert(matched, `unknown adapted parity case ${id}`);
				return matched.path;
			}),
		),
	];
	const adapted = (
		entry,
		kind,
		evidence,
		note = 'Adapted to the Octane public/runtime contract.',
		adaptedCases,
	) => ({
		upstream: entry,
		kind,
		disposition: 'adapted-and-executable',
		evidence,
		...(adaptedCases ? { adaptedCases } : {}),
		note,
	});
	return {
		schemaVersion: 1,
		release: {
			package: 'react-draggable',
			version: '4.7.1',
			tag: 'v4.7.1',
			npmIntegrity:
				'sha512-wa3tzfFnYt3yaZLuyU58fl1TNunfWfBekDgWhZA1+gb2jnp42wZ0ymuopR6M5kqDYmm4hKmzGlcKWjZf3Zb6RQ==',
			npmShasum: 'e502c3cfe0cc97d691e12aaa377a975fce097d71',
			tagObject: 'cec7498ff84e91215987636d3edbb6ca132ee9e5',
			commit: 'bcbaa8eb285aea49865ca8870c0b7b441c2fe6a4',
			tree: '7b17a5d02449287945f87dee0cecdadcfb56cdc5',
			license: 'MIT',
			oracleVersions: ORACLE_VERSIONS,
			oracleCatalog: 'react-draggable-react-oracle',
		},
		publicSurface: { runtimeExports, typeExports, subpaths: ['.', './package.json'] },
		artifacts,
		inventories: {
			sourceFiles,
			unitFiles,
			unitCases,
			browserCases,
			fixtures,
			typeAssertions: expectTypeAssertions(typeSource),
			adaptedCases,
			adaptedCaseStructures: adaptedStructure,
			upstreamCaseStructures: upstreamStructure,
		},
		crosswalk: {
			source: sourceFiles.map((value) =>
				adapted(
					value,
					'source',
					sourceEvidence(value),
					'Ported source with executable contract coverage.',
				),
			),
			runtimeExports: runtimeExports.map((value) =>
				adapted(value, 'runtime-export', ['src/index.tsrx', 'tests/runtime/draggable.test.ts']),
			),
			typeExports: typeExports.map((value) =>
				adapted(value, 'type-export', [
					'src/index.tsrx',
					'typetests/adapted/typeCompat.fixture.ts',
				]),
			),
			unitCases: unitCases.map((value) => {
				const caseIds = unitCoverage(value);
				if (value.file.includes('/utils/')) {
					const sourcePath =
						value.file.includes('domFns') || value.file.includes('positionFns')
							? ['src/utils/domFns.ts', 'src/utils/positionFns.ts']
							: value.file.includes('getPrefix')
								? ['src/utils/getPrefix.ts']
								: ['src/utils/shims.ts'];
					return {
						upstream: value.id,
						kind: 'unit-case',
						disposition: 'upstream-internal-implementation',
						evidence: sourcePath,
						note: 'The upstream case targets an unexported helper. Octane preserves the public behavior through component/runtime/browser cases without pinning private implementation seams.',
					};
				}
				return adapted(
					value.id,
					'unit-case',
					evidenceFor(caseIds),
					'Mapped one-to-one to an executable public-root adapted test.',
					caseIds,
				);
			}),
			browserCases: browserCases.map((value) => {
				const caseIds = [adaptedBrowserId(value)];
				return adapted(
					value.id,
					'browser-case',
					evidenceFor(caseIds),
					'Mapped one-to-one to an executable Playwright adaptedCase with the exact upstream browser identity.',
					caseIds,
				);
			}),
			fixtures: fixtures.map((value) =>
				adapted(
					value,
					'fixture',
					['tests/browser/parity.browser.test.ts', 'tests/browser/harness/mount.ts'],
					'Replaced by deterministic Octane real-browser mount fixtures that render each upstream case on demand.',
				),
			),
			typeAssertions: expectTypeAssertions(typeSource).map((value) =>
				adapted(
					value.id,
					'type-assertion',
					[
						'typetests/adapted/typeCompat.fixture.ts',
						'audit/pristine-types.json',
						'audit/adapted-types.json',
						'audit/type-parity.json',
						'typetests/tsconfig.pristine.json',
						'typetests/tsconfig.adapted.json',
					],
					'Inventoried at assertion-group granularity by audit/type-parity.json; pristine and adapted hashes are compared, with explicit droppedAssertionGroups for React-only children/JSX/class probes.',
					['type-program:adapted-compatibility'],
				),
			),
			authoredTests: await authoredTestCrosswalk(root),
		},
		allowedTransforms: [
			{
				id: 'import-root-octanejs',
				description: 'Rewrite react-draggable imports to @octanejs/draggable',
				appliesTo: ['adapted-runtime', 'adapted-types'],
			},
			{
				id: 'native-events',
				description: 'Replace React synthetic MouseEvent/TouchEvent unions with native events',
				appliesTo: ['adapted-types'],
			},
			{
				id: 'function-components',
				description:
					'Replace React.Component class assignability with Octane function-component types',
				appliesTo: ['adapted-types'],
			},
			{
				id: 'nodeRef-prop-surface',
				description:
					'Express consumer refs through Octane nodeRef props rather than class-component refs',
				appliesTo: ['adapted-types', 'adapted-runtime'],
			},
		],
	};
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function sameIdentities(actual, expected, label, getId = (value) => value) {
	const actualIds = actual.map(getId);
	const expectedIds = expected.map(getId);
	const duplicates = actualIds.filter((id, index) => actualIds.indexOf(id) !== index);
	assert(duplicates.length === 0, `${label}: duplicate identity ${duplicates[0]}`);
	for (const id of expectedIds) assert(actualIds.includes(id), `${label}: missing identity ${id}`);
	for (const id of actualIds)
		assert(expectedIds.includes(id), `${label}: unapproved identity ${id}`);
}

async function authoredTestCrosswalk(root) {
	const classifications = JSON.parse(
		await readFile(join(root, 'audit/test-classifications.json'), 'utf8'),
	);
	return classifications.tests.map(function toCrosswalk(entry) {
		const relativePath = entry.path.replace(/^packages\/draggable\//, '');
		return {
			upstream: `authored:${relativePath}`,
			kind: 'authored-test',
			disposition: entry.disposition,
			evidence: [relativePath],
			path: relativePath,
			classification: entry.disposition,
			reason: entry.reason ?? entry.oracle ?? '',
		};
	});
}

export async function validate(root = packageRoot) {
	const expected = JSON.parse(await readFile(join(root, 'audit/upstream-inventory.json'), 'utf8'));
	const actual = await buildInventory(root);
	actual.crosswalk.authoredTests = await authoredTestCrosswalk(root);
	assert(
		JSON.stringify(actual.release) === JSON.stringify(expected.release),
		'immutable release coordinates changed',
	);
	assert(
		JSON.stringify(actual.release.oracleVersions) === JSON.stringify(ORACLE_VERSIONS),
		'immutable React oracle versions changed',
	);
	const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
	for (const [name, version] of Object.entries(ORACLE_VERSIONS)) {
		assert(
			manifest.devDependencies?.[name] === `catalog:react-draggable-react-oracle`,
			`package.json must pin ${name} through catalog:react-draggable-react-oracle (got ${manifest.devDependencies?.[name]})`,
		);
		void version;
	}
	sameIdentities(actual.artifacts, expected.artifacts, 'artifact', (value) => value.path);
	for (const artifact of expected.artifacts) {
		const current = actual.artifacts.find((value) => value.path === artifact.path);
		assert(current.sha256 === artifact.sha256, `artifact: stale hash ${artifact.path}`);
		assert(current.bytes === artifact.bytes, `artifact: byte length changed ${artifact.path}`);
	}
	sameIdentities(
		actual.publicSurface.runtimeExports,
		expected.publicSurface.runtimeExports,
		'runtime export',
	);
	sameIdentities(
		actual.publicSurface.typeExports,
		expected.publicSurface.typeExports,
		'type export',
	);
	sameIdentities(actual.publicSurface.subpaths, expected.publicSurface.subpaths, 'package subpath');
	sameIdentities(
		actual.inventories.unitCases,
		expected.inventories.unitCases,
		'unit case',
		(value) => value.id,
	);
	sameIdentities(
		actual.inventories.browserCases,
		expected.inventories.browserCases,
		'browser case',
		(value) => value.id,
	);
	sameIdentities(
		actual.inventories.typeAssertions,
		expected.inventories.typeAssertions,
		'type assertion',
		(value) => value.id,
	);
	sameIdentities(
		actual.inventories.adaptedCases,
		expected.inventories.adaptedCases,
		'adapted case',
		(value) => value.id,
	);
	sameStructureLedgers(
		actual.inventories.adaptedCaseStructures,
		expected.inventories.adaptedCaseStructures,
		'adapted case structure',
	);
	sameStructureLedgers(
		actual.inventories.upstreamCaseStructures,
		expected.inventories.upstreamCaseStructures,
		'upstream case structure',
	);
	sameIdentities(
		actual.crosswalk.authoredTests,
		expected.crosswalk.authoredTests,
		'authored test',
		(value) => value.upstream,
	);

	verifyReactDraggableTestClassifications(root, { packageRoot: root });
	verifyReactDraggableTypes(root, { packageRoot: root });

	for (const [ledger, inventory] of [
		['source', expected.inventories.sourceFiles],
		['runtimeExports', expected.publicSurface.runtimeExports],
		['typeExports', expected.publicSurface.typeExports],
		['unitCases', expected.inventories.unitCases.map((value) => value.id)],
		['browserCases', expected.inventories.browserCases.map((value) => value.id)],
		['fixtures', expected.inventories.fixtures],
		['typeAssertions', expected.inventories.typeAssertions.map((value) => value.id)],
	]) {
		sameIdentities(
			expected.crosswalk[ledger],
			inventory,
			`${ledger} disposition`,
			(value) => value.upstream ?? value,
		);
	}
	const allDispositions = Object.values(expected.crosswalk).flat();
	assert(
		!allDispositions.some((value) =>
			/\.skip|\.todo|expected.?failure/i.test(value.disposition ?? ''),
		),
		'skip marker is not an approved disposition',
	);
	assert(
		!allDispositions.some(
			(value) => !value.disposition || /pending|unresolved/i.test(value.disposition),
		),
		'every upstream item must have a resolved disposition',
	);
	assert(
		!allDispositions.some((value) => !Array.isArray(value.evidence) || value.evidence.length === 0),
		'every upstream disposition must cite executable or source evidence',
	);
	const availableEvidence = new Set(
		(await filesUnder(root)).filter((path) => !path.startsWith('upstream/')),
	);
	const adaptedCaseIds = new Set(expected.inventories.adaptedCases.map((value) => value.id));
	for (const value of allDispositions) {
		for (const path of value.evidence)
			assert(availableEvidence.has(path), `crosswalk evidence is missing: ${path}`);
		if (
			['unit-case', 'browser-case', 'type-assertion'].includes(value.kind) &&
			value.disposition === 'adapted-and-executable'
		) {
			assert(
				Array.isArray(value.adaptedCases) && value.adaptedCases.length > 0,
				`${value.upstream}: explicit adapted case mapping is missing`,
			);
			for (const id of value.adaptedCases)
				assert(adaptedCaseIds.has(id), `${value.upstream}: adapted case is missing: ${id}`);
		}
	}
	const oneToOneCaseIds = [...expected.crosswalk.unitCases, ...expected.crosswalk.browserCases]
		.filter(
			(value) =>
				['unit-case', 'browser-case'].includes(value.kind) &&
				!value.upstream.startsWith('tag/test/typeCompat.test.ts:') &&
				value.disposition === 'adapted-and-executable',
		)
		.flatMap((value) => value.adaptedCases);
	const reusedCaseId = oneToOneCaseIds.find((id, index) => oneToOneCaseIds.indexOf(id) !== index);
	assert(!reusedCaseId, `adapted case is mapped more than once: ${reusedCaseId}`);

	sameIdentities(Object.keys(manifest.exports), ['.', './package.json'], 'package subpath');
	assert(
		!manifest.files.some((path) => /^(?:upstream|audit|tests\/audit)(?:\/|$)/.test(path)),
		'audit evidence must not be published',
	);
	const license = await readFile(join(root, 'LICENSE'), 'utf8');
	const upstreamLicense = await readFile(join(root, 'upstream/tag/LICENSE'), 'utf8');
	assert(
		license === upstreamLicense && license.includes('MIT License'),
		'MIT license is missing or changed',
	);
	return actual;
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
	const write = process.argv.includes('--write');
	const rootArg = process.argv.indexOf('--root');
	const root = rootArg === -1 ? packageRoot : resolve(process.argv[rootArg + 1]);
	if (write) {
		await writeFile(
			join(root, 'audit/upstream-inventory.json'),
			`${JSON.stringify(await buildInventory(root), null, 2)}\n`,
		);
		console.log('wrote react-draggable upstream inventory');
	} else {
		const result = await validate(root);
		console.log(
			`verified ${result.artifacts.length} artifacts, ${result.inventories.unitCases.length} unit/type cases, ${result.inventories.browserCases.length} browser cases, and ${result.inventories.typeAssertions.length} type assertions`,
		);
	}
}
