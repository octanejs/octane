import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
	discoverReactDropzoneAuthoredTests,
	verifyReactDropzoneEvidence,
} from './react-dropzone-evidence-lib.mjs';

const repository = resolve(import.meta.dirname, '../..');
const fixture = () => {
	const root = mkdtempSync(resolve(tmpdir(), 'react-dropzone-evidence-'));
	cpSync(resolve(repository, 'packages/dropzone'), resolve(root, 'packages/dropzone'), {
		recursive: true,
	});
	return root;
};

test('react-dropzone evidence accepts the committed exhaustive ledgers', () => {
	assert.equal(verifyReactDropzoneEvidence(repository), true);
});

test('react-dropzone evidence discovers every authored test root, not only adapted-dom', () => {
	const discovered = discoverReactDropzoneAuthoredTests(repository);
	assert.ok(
		discovered.includes('packages/dropzone/tests/adapted/index-u3.spec.ts'),
		'adapted suite',
	);
	assert.ok(
		discovered.includes('packages/dropzone/tests/differential/root-u3.test.ts'),
		'differential',
	);
	assert.ok(
		discovered.includes('packages/dropzone/tests/pristine/upstream-runtime.test.ts'),
		'pristine wrapper',
	);
	assert.ok(
		discovered.includes('packages/dropzone/tests/probes/architecture.test.ts'),
		'architecture probe',
	);
	assert.ok(discovered.includes('packages/dropzone/tests/probes/server.test.ts'), 'server probe');
	assert.ok(
		discovered.includes('packages/dropzone/tests/probes/browser/browser.test.ts'),
		'browser probe',
	);
	assert.ok(
		discovered.includes('packages/dropzone/tests/adoption/package-contract.test.mjs'),
		'adoption',
	);
	assert.ok(
		discovered.includes('packages/dropzone/tests/probes/packed-exports.test.mjs'),
		'packed',
	);
	assert.ok(discovered.includes('packages/dropzone/typetests/accept.tsx'), 'adapted type program');
	assert.ok(
		discovered.includes('packages/dropzone/typetests/pristine/accept.tsx'),
		'pristine type copy',
	);
	assert.ok(discovered.length > 3, `expected more than adapted-dom trio, got ${discovered.length}`);
});

test('react-dropzone evidence rejects a removed upstream classification', () => {
	const root = fixture();
	const path = resolve(root, 'packages/dropzone/audit/test-classifications.json');
	const value = JSON.parse(readFileSync(path, 'utf8'));
	value.upstreamCases.pop();
	writeFileSync(path, JSON.stringify(value));
	assert.throws(() => verifyReactDropzoneEvidence(root), /every upstream runtime identity/);
});

test('react-dropzone evidence rejects a duplicated authored classification', () => {
	const root = fixture();
	const path = resolve(root, 'packages/dropzone/audit/test-classifications.json');
	const value = JSON.parse(readFileSync(path, 'utf8'));
	value.portAuthored.push(value.portAuthored[0]);
	writeFileSync(path, JSON.stringify(value));
	assert.throws(() => verifyReactDropzoneEvidence(root), /port-authored runtime\/type test/);
});

test('react-dropzone evidence rejects omitting a discovered authored root', () => {
	const root = fixture();
	const path = resolve(root, 'packages/dropzone/audit/test-classifications.json');
	const value = JSON.parse(readFileSync(path, 'utf8'));
	value.portAuthored = value.portAuthored.filter((entry) =>
		entry.path.startsWith('packages/dropzone/tests/adapted/'),
	);
	writeFileSync(path, JSON.stringify(value));
	assert.throws(() => verifyReactDropzoneEvidence(root), /discovered all test roots/);
});
