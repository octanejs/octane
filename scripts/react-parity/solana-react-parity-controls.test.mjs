import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inventoryFromIdentities } from './solana-react-pristine-runtime.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGE = join(REPO, 'packages/solana-react');

function read(relativePath) {
	return readFileSync(join(REPO, relativePath), 'utf8');
}

function listedUpstreamArtifacts(kind) {
	const markdown = read('packages/solana-react/UPSTREAM.md');
	const section = kind === 'runtime' ? '### Runtime files' : '### Type files';
	const start = markdown.indexOf(section);
	assert.notEqual(start, -1, `missing ${section}`);
	const rest = markdown.slice(start);
	const end = rest.indexOf('\n## ');
	const body = end === -1 ? rest : rest.slice(0, end);
	return [...body.matchAll(/`((?:src\/)[^`]+)`/g)].map(function path(match) {
		return match[1];
	});
}

test('UPSTREAM.md dispositions cover every vendored runtime test file', () => {
	const sums = read('packages/solana-react/upstream/SHA256SUMS')
		.split('\n')
		.map(function line(entry) {
			return entry.trim().split(/\s+/).at(-1);
		})
		.filter(function keepTests(path) {
			return path && /\/__tests__\//.test(path) && /-test\./.test(path);
		})
		.map(function toSrc(path) {
			return path.replace(/^src\//, 'src/').replace(/^packages\/solana-react\/upstream\//, '');
		});
	// SHA256SUMS paths are relative to upstream/
	const files = read('packages/solana-react/upstream/SHA256SUMS')
		.split('\n')
		.map(function line(entry) {
			const parts = entry.trim().split(/\s+/);
			return parts.length >= 2 ? parts[parts.length - 1] : '';
		})
		.filter(function keepTests(path) {
			return /__tests__\//.test(path) && /-test\./.test(path);
		})
		.map(function asSrc(path) {
			return path.startsWith('src/') ? path : `src/${path.replace(/^.*?src\//, '')}`;
		});
	const unique = [...new Set(files)].sort();
	const disposed = new Set(listedUpstreamArtifacts('runtime'));
	for (const file of unique) {
		assert.ok(disposed.has(file), `missing runtime disposition for ${file}`);
	}
	void sums;
});

test('UPSTREAM.md dispositions cover every vendored type-test file', () => {
	const files = read('packages/solana-react/upstream/SHA256SUMS')
		.split('\n')
		.map(function line(entry) {
			const parts = entry.trim().split(/\s+/);
			return parts.length >= 2 ? parts[parts.length - 1] : '';
		})
		.filter(function keepTypes(path) {
			return /__typetests__\//.test(path) && /-typetest\.ts$/.test(path);
		})
		.map(function asSrc(path) {
			return path.startsWith('src/') ? path : `src/${path.replace(/^.*?src\//, '')}`;
		});
	const unique = [...new Set(files)].sort();
	const disposed = new Set(listedUpstreamArtifacts('types'));
	for (const file of unique) {
		assert.ok(disposed.has(file), `missing type disposition for ${file}`);
	}
});

test('pristine vitest include matches pristine-run runtime dispositions', () => {
	const config = read('packages/solana-react/tests/upstream-vitest.config.ts');
	const include = [...config.matchAll(/'(src\/[^']+-test\.[^']+)'/g)].map(function path(match) {
		return match[1];
	});
	assert.deepEqual(include.sort(), [
		'src/__tests__/ClientProvider-test.browser.tsx',
		'src/__tests__/useClientCapability-test.browser.tsx',
		'src/query/__tests__/useRequestQuery-test.browser.tsx',
	]);
});

test('omitting an inventoried pristine identity fails exact-match validation', () => {
	const inventory = JSON.parse(read('packages/solana-react/audit/pristine-runtime.json'));
	assert.ok(inventory.tests.length > 1, 'pristine inventory must contain multiple identities');
	const omitted = inventory.tests.slice(1);
	const rebuilt = inventoryFromIdentities(
		omitted.map(function asPassed(testCase) {
			return { ...testCase, status: 'passed' };
		}),
	);
	assert.notDeepEqual(rebuilt.tests, inventory.tests);
});

test('renaming an inventoried pristine identity fails exact-match validation', () => {
	const inventory = JSON.parse(read('packages/solana-react/audit/pristine-runtime.json'));
	const renamed = inventory.tests.map(function renameFirst(testCase, index) {
		if (index !== 0) return { ...testCase, status: 'passed' };
		return { ...testCase, fullName: `${testCase.fullName} (renamed)`, status: 'passed' };
	});
	const rebuilt = inventoryFromIdentities(renamed);
	assert.notDeepEqual(
		rebuilt.tests.map(function name(testCase) {
			return testCase.fullName;
		}),
		inventory.tests.map(function name(testCase) {
			return testCase.fullName;
		}),
	);
});

test('adapted inventory preserves every selected pristine identity one-for-one', () => {
	const pristine = JSON.parse(read('packages/solana-react/audit/pristine-runtime.json'));
	const adapted = JSON.parse(read('packages/solana-react/audit/adapted-runtime.json'));
	assert.equal(pristine.tests.length, 31, 'selected pristine suite must stay at 31 identities');
	const adaptedNames = new Set(
		adapted.tests.map(function name(testCase) {
			return testCase.fullName;
		}),
	);
	const missing = pristine.tests
		.map(function name(testCase) {
			return testCase.fullName;
		})
		.filter(function absent(fullName) {
			return !adaptedNames.has(fullName);
		});
	assert.deepEqual(
		missing,
		[],
		`adapted suite omitted pristine identities:\n${missing.join('\n')}`,
	);
});

test('omitting a selected pristine identity from adapted inventory is rejected', () => {
	const pristine = JSON.parse(read('packages/solana-react/audit/pristine-runtime.json'));
	const adapted = JSON.parse(read('packages/solana-react/audit/adapted-runtime.json'));
	const truncated = {
		...adapted,
		tests: adapted.tests.slice(1),
	};
	const adaptedNames = new Set(
		truncated.tests.map(function name(testCase) {
			return testCase.fullName;
		}),
	);
	const missing = pristine.tests.filter(function absent(testCase) {
		return !adaptedNames.has(testCase.fullName);
	});
	assert.ok(missing.length > 0, 'truncation must surface at least one omitted identity');
});

void PACKAGE;
