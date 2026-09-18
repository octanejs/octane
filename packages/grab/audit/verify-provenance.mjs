import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { verifyProvenanceManifest } from '../../../scripts/react-parity/provenance-manifest-lib.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamSrc = join(packageRoot, 'upstream/packages/react-grab/src');

function fail(message) {
	throw new Error(message);
}

function exportedNames(file) {
	const source = ts.createSourceFile(
		file,
		readFileSync(file, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
	);
	const names = [];
	for (const statement of source.statements) {
		if (ts.isExportDeclaration(statement)) {
			if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
				for (const element of statement.exportClause.elements)
					names.push(`${statement.isTypeOnly ? 'type ' : ''}${element.name.text}`);
			} else if (!statement.exportClause) {
				names.push(`export * from ${statement.moduleSpecifier.text}`);
			}
			continue;
		}
		const exported = statement.modifiers?.some(
			(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
		);
		if (!exported) continue;
		if (statement.name?.text) names.push(`decl:${statement.name.text}`);
		else if (ts.isVariableStatement(statement))
			for (const declaration of statement.declarationList.declarations)
				names.push(`decl:${declaration.name.getText(source)}`);
	}
	return names.sort();
}

function verifyPublicSurface() {
	for (const [upstreamFile, bindingFile] of [
		['index.ts', 'src/index.ts'],
		['core/index.tsx', 'src/core/index.ts'],
		['primitives.ts', 'src/primitives.ts'],
	]) {
		const upstream = exportedNames(join(upstreamSrc, upstreamFile));
		const binding = exportedNames(join(packageRoot, bindingFile));
		if (JSON.stringify(upstream) !== JSON.stringify(binding))
			fail(
				`Public export drift at ${bindingFile}: upstream ${upstream.join(', ')} vs binding ${binding.join(', ')}`,
			);
	}
}

function verifyAdaptedSuite(
	upstreamTests = join(packageRoot, 'upstream/packages/react-grab/tests'),
) {
	const missing = readdirSync(upstreamTests, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
		.map((entry) => relative(upstreamTests, join(entry.parentPath, entry.name)))
		.filter((name) => !existsSync(join(packageRoot, 'tests/upstream', name)));
	if (missing.length)
		fail(`Upstream test files without a materialized adapted counterpart: ${missing.join(', ')}`);
}

function verifyRegistrationIntegrity(
	registrations = JSON.parse(readFileSync(join(packageRoot, 'audit/registrations.json'), 'utf8')),
	crosswalk = JSON.parse(readFileSync(join(packageRoot, 'audit/crosswalk.json'), 'utf8')),
) {
	const ids = new Set(registrations.map((entry) => entry.id));
	if (ids.size !== registrations.length || registrations.length === 0)
		fail('Registration inventory is empty or contains duplicate ids');
	if (crosswalk.length !== registrations.length)
		fail('Crosswalk does not cover every upstream registration');
	for (const entry of crosswalk)
		if (!ids.has(entry.id)) fail(`Crosswalk references unknown registration ${entry.id}`);
}

function expectFailure(label, callback) {
	try {
		callback();
	} catch {
		return;
	}
	fail(`Negative control did not fail: ${label}`);
}

verifyProvenanceManifest(packageRoot);
verifyPublicSurface();
verifyAdaptedSuite();
verifyRegistrationIntegrity();

if (process.argv.includes('--negative-controls')) {
	// Export-surface drift: an added upstream export must be detected.
	const upstreamIndex = join(upstreamSrc, 'index.ts');
	const original = readFileSync(upstreamIndex);
	try {
		writeFileSync(upstreamIndex, `${original}\nexport const __DRIFTED__ = true;\n`);
		expectFailure('added upstream export', () => verifyPublicSurface());
	} finally {
		writeFileSync(upstreamIndex, original);
	}

	// A missing materialized test file must fail the adapted-suite check.
	const adaptedProbe = join(packageRoot, 'tests/upstream/auto-scroll.test.ts');
	const probeAside = `${adaptedProbe}.aside`;
	renameSync(adaptedProbe, probeAside);
	try {
		expectFailure('missing adapted test file', () => verifyAdaptedSuite());
	} finally {
		renameSync(probeAside, adaptedProbe);
	}

	// An unlisted upstream test file must fail the adapted-suite check.
	const extraUpstreamDir = mkdtempSync(join(tmpdir(), 'grab-upstream-extra-'));
	writeFileSync(join(extraUpstreamDir, 'extra.test.ts'), 'test("x", () => {});\n');
	expectFailure('unlisted upstream test file', () => verifyAdaptedSuite(extraUpstreamDir));

	// Registration/crosswalk drift must fail integrity checks.
	const registrations = JSON.parse(
		readFileSync(join(packageRoot, 'audit/registrations.json'), 'utf8'),
	);
	const crosswalk = JSON.parse(readFileSync(join(packageRoot, 'audit/crosswalk.json'), 'utf8'));
	expectFailure('crosswalk missing a registration', () =>
		verifyRegistrationIntegrity(registrations, crosswalk.slice(1)),
	);
	expectFailure('crosswalk references unknown registration', () =>
		verifyRegistrationIntegrity(registrations, [
			{ id: 'unknown-registration-id', classification: 'implemented' },
			...crosswalk.slice(1),
		]),
	);
	expectFailure('duplicate registration ids', () =>
		verifyRegistrationIntegrity([registrations[0], ...registrations], crosswalk),
	);
}

console.log(
	'@octanejs/grab provenance verified (lock-pinned tree, artifact digests, export surface, adapted suite, registration integrity).',
);
