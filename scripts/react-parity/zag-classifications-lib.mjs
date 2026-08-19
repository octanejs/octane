import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const CONFIG = 'packages/zag/audit/test-classifications.json';

const ALLOWED = new Set([
	'adapted-upstream-suite',
	'octane-only-framework-contract',
	'unmodified-upstream-suite-wrapper',
	'react-octane-differential',
	'not-applicable',
]);

/**
 * Verifies every package-authored Zag test file has exactly one classification
 * and that adapted/pristine ownership matches the React parity roots.
 */
export function verifyZagTestClassifications(root) {
	const testsRoot = resolve(root, 'packages/zag/tests');
	const discovered = readdirSync(testsRoot, { recursive: true, withFileTypes: true })
		.filter(function keepTestFiles(entry) {
			return entry.isFile() && /\.test\.(?:ts|tsx|tsrx)$/u.test(entry.name);
		})
		.map(function toPortablePath(entry) {
			return relative(root, resolve(entry.parentPath ?? entry.path, entry.name))
				.split(sep)
				.join('/');
		})
		.filter(function excludeTempCopies(path) {
			return !path.includes('/.pristine-upstream-');
		})
		.sort();

	const path = resolve(root, CONFIG);
	if (!existsSync(path)) throw new Error(`missing port-test classifications: ${CONFIG}`);
	const config = JSON.parse(readFileSync(path, 'utf8'));
	if (config.schemaVersion !== 1) throw new Error(`${CONFIG}: schemaVersion must be 1`);
	if (!Array.isArray(config.tests) || config.tests.length === 0)
		throw new Error(`${CONFIG}: tests must be a non-empty array`);

	const seen = new Set();
	for (const entry of config.tests) {
		if (typeof entry.path !== 'string' || !entry.path.startsWith('packages/zag/'))
			throw new Error(`${CONFIG}: path must be under packages/zag/`);
		if (seen.has(entry.path)) throw new Error(`${CONFIG}: duplicate path ${entry.path}`);
		seen.add(entry.path);
		if (!ALLOWED.has(entry.disposition))
			throw new Error(`${CONFIG}: unsupported disposition ${entry.disposition}`);
		if (
			entry.disposition === 'adapted-upstream-suite' ||
			entry.disposition === 'unmodified-upstream-suite-wrapper'
		) {
			if (typeof entry.oracle !== 'string' || entry.oracle.length === 0)
				throw new Error(`${CONFIG}: ${entry.path} requires oracle`);
		} else if (typeof entry.reason !== 'string' || entry.reason.length === 0) {
			throw new Error(`${CONFIG}: ${entry.path} requires reason`);
		}
	}

	const declared = [...seen].sort();
	if (JSON.stringify(discovered) !== JSON.stringify(declared)) {
		throw new Error('every port-authored zag test must have exactly one classification');
	}

	return { files: discovered.length };
}
