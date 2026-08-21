import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyReactResizablePanelsUpstream } from '../../../scripts/react-parity/react-resizable-panels-upstream-lib.mjs';
import { verifyReactResizablePanelsTestClassifications } from '../../../scripts/react-parity/react-resizable-panels-classifications-lib.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');
const expectedRuntime = [
	'Group',
	'Panel',
	'Separator',
	'isCoarsePointer',
	'useDefaultLayout',
	'useGroupCallbackRef',
	'useGroupRef',
	'usePanelCallbackRef',
	'usePanelRef',
].sort();
const expectedTypes = [
	'GroupImperativeHandle',
	'GroupProps',
	'Layout',
	'LayoutChangedMeta',
	'LayoutStorage',
	'OnGroupLayoutChange',
	'OnPanelResize',
	'Orientation',
	'PanelImperativeHandle',
	'PanelProps',
	'PanelSize',
	'SeparatorProps',
	'SizeUnit',
].sort();

function fail(message) {
	throw new Error(message);
}

function verifyApi(
	api = JSON.parse(readFileSync(join(packageRoot, 'audit/public-api.json'), 'utf8')),
) {
	if (JSON.stringify([...api.runtime].sort()) !== JSON.stringify(expectedRuntime))
		fail('Runtime export inventory drift');
	if (JSON.stringify([...api.types].sort()) !== JSON.stringify(expectedTypes))
		fail('Public type inventory drift');
	const sourceIndex = readFileSync(join(packageRoot, 'upstream/lib/index.ts'), 'utf8');
	for (const name of [...expectedRuntime, ...expectedTypes]) {
		if (!new RegExp(`\\b${name}\\b`).test(sourceIndex))
			fail(`Upstream index no longer exports ${name}`);
	}
	const declaration = readFileSync(
		join(packageRoot, 'upstream-artifact/dist/react-resizable-panels.d.ts'),
		'utf8',
	);
	for (const name of [...expectedRuntime, ...expectedTypes]) {
		if (!new RegExp(`export declare (?:function|interface|type) ${name}\\b`).test(declaration)) {
			fail(`Published declaration no longer exports ${name}`);
		}
	}
}

function expectFailure(label, callback) {
	try {
		callback();
	} catch {
		return;
	}
	fail(`Negative control did not fail: ${label}`);
}

verifyApi();
const upstream = verifyReactResizablePanelsUpstream(repoRoot);
const classifications = verifyReactResizablePanelsTestClassifications(repoRoot);

if (process.argv.includes('--negative-controls')) {
	const api = JSON.parse(readFileSync(join(packageRoot, 'audit/public-api.json'), 'utf8'));
	expectFailure('missing runtime export', function missingRuntime() {
		verifyApi({ ...api, runtime: api.runtime.slice(1) });
	});
	expectFailure('extra public type', function extraType() {
		verifyApi({ ...api, types: [...api.types, 'WeakenedType'] });
	});
	const adaptedFile = join(packageRoot, 'tests/upstream/hooks/useId.test.ts');
	const originalAdapted = readFileSync(adaptedFile);
	const weakenedAdapted = `${originalAdapted.toString('utf8').replace(/\n\s*expect\([^;]+;/, '\n')}`;
	try {
		writeFileSync(adaptedFile, weakenedAdapted);
		expectFailure('deleted adapted assertion body', function deletedAssertion() {
			verifyReactResizablePanelsUpstream(repoRoot);
		});
	} finally {
		writeFileSync(adaptedFile, originalAdapted);
	}
	const extraAdaptedPath = join(packageRoot, 'tests/upstream/extra-unlisted.test.ts');
	writeFileSync(extraAdaptedPath, "test('unlisted', () => {})\n");
	try {
		expectFailure('extra adapted upstream file', function extraAdaptedFile() {
			verifyReactResizablePanelsTestClassifications(repoRoot);
		});
	} finally {
		unlinkSync(extraAdaptedPath);
	}
}

console.log(
	`Verified ${JSON.parse(readFileSync(join(packageRoot, 'audit/upstream.lock.json'), 'utf8')).files.length} lock-pinned files, ${expectedRuntime.length} runtime exports, ${expectedTypes.length} public types, ${upstream.upstreamCases} upstream registrations, ${upstream.portedCases} adapted registrations (${upstream.assertionGroups} assertion groups after ${upstream.permittedTransformations} permitted transforms), and ${classifications.tests} classified port tests.`,
);
