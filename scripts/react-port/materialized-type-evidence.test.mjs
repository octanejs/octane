import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertMaterializedTypeEvidence } from './materialized-type-evidence.mjs';
import { buildUpstreamLock, gitBlobSha1 } from './materialize-lib.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'materialized-type-evidence-')));
	roots.push(root);
	execFileSync('git', ['init', '--quiet', root]);
	const packageDirectory = path.join(root, 'packages/widget');
	const source = `import { api } from 'widget/subpath';\nexpectType<string>(api());\n// @ts-expect-error wrong argument\napi(12);\n`;
	const identity = {
		packageName: 'widget',
		integrity: 'sha512-fixture',
		version: '1.0.0',
		commit: 'a'.repeat(40),
		repository: { owner: 'fixture', repo: 'widget', subdirectory: 'packages/widget' },
	};
	const files = {
		'src/api.spec.ts': source,
		'package.json': '{"name":"widget","version":"1.0.0"}\n',
	};
	const lock = buildUpstreamLock({
		identity,
		license: { spdx: 'MIT' },
		treeEntries: Object.entries(files).map(([file, content]) => ({
			type: 'blob',
			path: `packages/widget/${file}`,
			sha: gitBlobSha1(Buffer.from(content)),
			size: Buffer.byteLength(content),
		})),
		adaptedMappings: [{ fromRoot: 'src', toRoot: 'tests/upstream' }],
		adaptedRewrites: [{ find: 'widget/subpath', replace: '@octanejs/widget/subpath' }],
	});
	for (const [file, content] of Object.entries(files)) {
		const target = path.join(packageDirectory, 'upstream', file);
		mkdirSync(path.dirname(target), { recursive: true });
		writeFileSync(target, content);
	}
	mkdirSync(path.join(packageDirectory, 'audit'), { recursive: true });
	writeFileSync(path.join(packageDirectory, 'audit/upstream.lock.json'), JSON.stringify(lock));
	writeFileSync(
		path.join(packageDirectory, 'upstream/.octane-materialize.json'),
		JSON.stringify({ schemaVersion: 1, lockFingerprint: lock.fingerprint }),
	);
	execFileSync(
		process.execPath,
		[
			fileURLToPath(new URL('./materialize.mjs', import.meta.url)),
			'run',
			'--package-dir',
			packageDirectory,
		],
		{ encoding: 'utf8' },
	);
	const node = {
		identity,
		upstreamTestInventory: [
			{
				kind: 'type',
				path: 'packages/widget/src/api.spec.ts',
				gitBlob: gitBlobSha1(Buffer.from(source)),
				size: Buffer.byteLength(source),
			},
		],
	};
	const inputs = (lane) => ({
		gateId: `upstream-types-${lane}`,
		node,
		packageDirectory,
		programFiles: [
			path.join(
				packageDirectory,
				lane === 'pristine' ? 'upstream/src/api.spec.ts' : 'tests/upstream/api.spec.ts',
			),
		],
	});
	return { node, inputs, packageDirectory };
}

test('accepts complete pinned and regenerated suites with subpath-only imports', () => {
	const { inputs } = fixture();
	for (const lane of ['pristine', 'adapted'])
		assert.doesNotThrow(() => assertMaterializedTypeEvidence(inputs(lane)));
});
test('rejects missing and unexpected adapted files without rewriting either tree', () => {
	const { inputs, packageDirectory } = fixture();
	const input = inputs('adapted');
	const source = readFileSync(input.programFiles[0], 'utf8');
	const unexpected = path.join(packageDirectory, 'tests/upstream/extra.spec.ts');
	writeFileSync(unexpected, 'export {};');
	assert.throws(() => assertMaterializedTypeEvidence(input), /Command failed/);
	assert.equal(readFileSync(input.programFiles[0], 'utf8'), source);
	assert.equal(readFileSync(unexpected, 'utf8'), 'export {};');
	rmSync(unexpected);
	rmSync(input.programFiles[0]);
	assert.throws(() => assertMaterializedTypeEvidence(input), /ENOENT/);
});

test('rejects an omitted type file', () => {
	const { inputs } = fixture();
	assert.throws(
		() => assertMaterializedTypeEvidence({ ...inputs('pristine'), programFiles: [] }),
		/omits pinned type file/,
	);
});
test('rejects mismatched immutable identity and inventory hashes', () => {
	const { inputs, node } = fixture();
	assert.throws(
		() =>
			assertMaterializedTypeEvidence({
				...inputs('pristine'),
				node: { ...node, identity: { ...node.identity, version: '2.0.0' } },
			}),
		/different pinned version/,
	);
	node.upstreamTestInventory[0].gitBlob = 'b'.repeat(40);
	assert.throws(
		() => assertMaterializedTypeEvidence(inputs('pristine')),
		/differs from the immutable file/,
	);
});
test('rejects pristine byte drift', () => {
	const { inputs } = fixture();
	const input = inputs('pristine');
	writeFileSync(input.programFiles[0], 'export {};');
	assert.throws(() => assertMaterializedTypeEvidence(input), /invalid pristine bytes/);
});
for (const [name, change, reason] of [
	[
		'removed positive assertion',
		(s) => s.replace('expectType<string>(api());', ''),
		/removed checks/,
	],
	[
		'removed negative assertion',
		(s) => s.replace('// @ts-expect-error wrong argument\napi(12);', ''),
		/removed negative/,
	],
	['added any cast', (s) => s.replace('api()', '(api as any)()'), /added any/],
	['disabled checking', (s) => '// @ts-nocheck\n' + s, /suppresses checking/],
	[
		'unrecorded type change',
		(s) => s.replace('expectType<string>', 'expectType<number>'),
		/Command failed/,
	],
]) {
	test(`rejects adapted ${name}`, () => {
		const { inputs } = fixture();
		const input = inputs('adapted');
		writeFileSync(input.programFiles[0], change(readFileSync(input.programFiles[0], 'utf8')));
		assert.throws(() => assertMaterializedTypeEvidence(input), reason);
	});
}
