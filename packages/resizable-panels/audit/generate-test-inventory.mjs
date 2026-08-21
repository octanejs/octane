import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const auditRoot = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(auditRoot, '../upstream/lib');
const packageRoot = resolve(auditRoot, '..');
const adaptedRoot = join(packageRoot, 'tests/upstream');
const paths = readdirSync(sourceRoot, { recursive: true })
	.map((path) => join(sourceRoot, path))
	.filter((path) => statSync(path).isFile())
	.filter((path) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path))
	.sort();
const artifacts = paths.map((path) => {
	const source = readFileSync(path, 'utf8');
	const identities = [...source.matchAll(/\b(?:it|test)\s*\(\s*(["'])(.*?)\1/gs)].map(
		(match) => match[2],
	);
	const upstreamPath = relative(sourceRoot, path);
	const adaptedPath = upstreamPath;
	const adaptedAbsolute = join(adaptedRoot, adaptedPath);
	const isAdapted = statExists(adaptedAbsolute);
	return {
		path: upstreamPath,
		registrationCount: identities.length,
		identities,
		disposition: isAdapted ? 'adapted' : 'accounted-not-adapted',
		...(isAdapted ? { adaptedPath: `tests/upstream/${adaptedPath}` } : {}),
	};
});

function statExists(path) {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

writeFileSync(
	join(auditRoot, 'test-inventory.json'),
	`${JSON.stringify(
		{
			schemaVersion: 1,
			root: 'upstream/lib',
			artifactCount: artifacts.length,
			registrationCount: artifacts.reduce(
				(total, artifact) => total + artifact.registrationCount,
				0,
			),
			artifacts,
		},
		null,
		2,
	)}\n`,
);
// Port-authored files are classified in audit/test-classifications.json
// (react-octane-differential / octane-only-framework-contract / wrapper).
