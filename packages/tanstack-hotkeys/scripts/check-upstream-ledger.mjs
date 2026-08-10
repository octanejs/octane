import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = resolve(packageRoot, 'upstream');

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.name === 'node_modules' || entry.name === '.vite') return [];
		return entry.isDirectory()
			? walk(path)
			: entry.isFile() && entry.name !== 'SHA256SUMS'
				? [path]
				: [];
	});
}

const checksums = new Map(
	readFileSync(resolve(upstreamRoot, 'SHA256SUMS'), 'utf8')
		.trim()
		.split('\n')
		.map((line) => {
			const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
			if (!match) throw new Error(`invalid checksum line: ${line}`);
			return [match[2], match[1]];
		}),
);
const files = walk(upstreamRoot)
	.map((path) => relative(upstreamRoot, path).split(sep).join('/'))
	.sort();
if (
	files.length !== 26 ||
	checksums.size !== files.length ||
	files.some((path) => !checksums.has(path))
)
	throw new Error('vendored TanStack React Hotkeys file inventory drifted');
for (const path of files) {
	const digest = createHash('sha256')
		.update(readFileSync(resolve(upstreamRoot, path)))
		.digest('hex');
	if (digest !== checksums.get(path)) throw new Error(`vendored upstream bytes drifted: ${path}`);
}

const metadata = JSON.parse(readFileSync(resolve(upstreamRoot, 'package/package.json'), 'utf8'));
if (
	metadata.name !== '@tanstack/react-hotkeys' ||
	metadata.version !== '0.10.0' ||
	metadata.dependencies['@tanstack/hotkeys'] !== 'workspace:*' ||
	JSON.stringify(Object.keys(metadata.exports).sort()) !== JSON.stringify(['.', './package.json'])
)
	throw new Error('upstream package metadata drifted');

const sourceFiles = files.filter((path) => path.startsWith('package/src/'));
const testFiles = files.filter((path) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path));
const caseCount = testFiles.reduce((total, path) => {
	const source = readFileSync(resolve(upstreamRoot, path), 'utf8');
	return total + [...source.matchAll(/^\s*(?:it|test)\(/gm)].length;
}, 0);
if (sourceFiles.length !== 13 || testFiles.length !== 4 || caseCount !== 41)
	throw new Error('upstream source or runtime suite inventory drifted');

const crosswalk = JSON.parse(
	readFileSync(resolve(packageRoot, 'audit/upstream-crosswalk.json'), 'utf8'),
);
const expectedNames = [
	'HotkeysProvider',
	'HotkeysProviderOptions',
	'HotkeysProviderProps',
	'HotkeyRegistrationsResult',
	'ReactHotkeyRecorder',
	'ReactHotkeySequenceRecorder',
	'UseHotkeyDefinition',
	'UseHotkeyOptions',
	'UseHotkeySequenceDefinition',
	'UseHotkeySequenceOptions',
	'useDefaultHotkeysOptions',
	'useHeldKeyCodes',
	'useHeldKeys',
	'useHotkey',
	'useHotkeyRecorder',
	'useHotkeyRegistrations',
	'useHotkeySequence',
	'useHotkeySequenceRecorder',
	'useHotkeySequences',
	'useHotkeys',
	'useHotkeysContext',
	'useKeyHold',
];
const exportNames = crosswalk.adapterExports.map((entry) => entry.name);
const repoRoot = resolve(packageRoot, '../..');
const missingEvidence = crosswalk.adapterExports.filter((entry) => {
	if (typeof entry !== 'object' || !entry?.evidenceTarget || !entry?.name) return true;
	// Behavioral exports must land on evidence that literally names the symbol.
	// Type-package rows are authenticated by the type suite path itself.
	if (entry.classification !== 'behavioral') return false;
	const absolute = resolve(repoRoot, entry.evidenceTarget);
	try {
		const source = readFileSync(absolute, 'utf8');
		const escaped = entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		// Require an import or a call/JSX use — a title mention alone is not evidence.
		const imported = new RegExp(`\\bimport\\b[^;]*\\b${escaped}\\b`).test(source);
		const called = new RegExp(`\\b${escaped}\\s*[<(]`).test(source);
		return !(imported || called);
	} catch {
		return true;
	}
});
if (missingEvidence.length > 0) {
	throw new Error(
		`upstream crosswalk evidenceTarget missing export symbol: ${missingEvidence
			.map((entry) => `${entry.name} -> ${entry.evidenceTarget}`)
			.join(', ')}`,
	);
}
if (
	crosswalk.publicEntrypoints.length !== 2 ||
	!Array.isArray(crosswalk.adapterExports) ||
	exportNames.length !== 22 ||
	JSON.stringify([...exportNames].sort()) !== JSON.stringify([...expectedNames].sort()) ||
	crosswalk.adapterExports.some(
		(entry) =>
			typeof entry !== 'object' ||
			!entry.name ||
			!entry.kind ||
			!entry.classification ||
			!entry.reason ||
			!entry.evidenceTarget ||
			!entry.source?.path,
	) ||
	crosswalk.upstreamTests.length !== 4 ||
	crosswalk.upstreamTests.reduce((sum, entry) => sum + entry.cases, 0) !== 41 ||
	crosswalk.upstreamTests.some((entry) => entry.disposition !== 'adapted') ||
	crosswalk.typeSuite?.disposition !== 'present'
)
	throw new Error('upstream crosswalk drifted');

console.log(
	'TanStack React Hotkeys upstream ledger is current (26 files, 13 source files, 4 runtime test files, 41 cases, 22 named exports).',
);
