import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
	createPackedExampleManifest,
	isWithinDirectory,
	renderPackedExampleWorkspace,
} from './package-pack-canaries.mjs';

describe('createPackedExampleManifest', () => {
	test('rewrites a real example for packed dependencies without mutating its source manifest', () => {
		const source = {
			name: 'example-app',
			dependencies: {
				'@octanejs/example-binding': 'workspace:*',
				external: '^1.0.0',
				octane: 'workspace:*',
			},
			devDependencies: {
				typescript: 'catalog:default',
				vite: 'catalog:default',
			},
			pnpm: { onlyBuiltDependencies: ['external'] },
		};
		const archiveSpecs = {
			'@octanejs/example-binding': 'file:/tmp/example-binding.tgz',
			octane: 'file:/tmp/octane.tgz',
		};

		const packed = createPackedExampleManifest(source, archiveSpecs, '8.0.16', 'Example');

		assert.deepEqual(packed.dependencies, {
			'@octanejs/example-binding': 'file:/tmp/example-binding.tgz',
			external: '^1.0.0',
			octane: 'file:/tmp/octane.tgz',
		});
		assert.deepEqual(packed.devDependencies, { vite: '8.0.16' });
		assert.equal(packed.pnpm, undefined);
		assert.equal(source.dependencies.octane, 'workspace:*');
		assert.equal(source.devDependencies.vite, 'catalog:default');
		assert.deepEqual(source.pnpm, { onlyBuiltDependencies: ['external'] });
	});

	test('rejects a workspace dependency omitted from the packed archive set', () => {
		assert.throws(
			() =>
				createPackedExampleManifest(
					{ dependencies: { octane: 'workspace:*' } },
					{},
					'8.0.16',
					'Example',
				),
			/package\.json\.dependencies\.octane: workspace:\*/,
		);
	});
});

describe('renderPackedExampleWorkspace', () => {
	test('pins transitive internal dependencies to the produced archives', () => {
		assert.equal(
			renderPackedExampleWorkspace({
				'@octanejs/app-core': 'file:/tmp/app-core.tgz',
				octane: 'file:/tmp/octane.tgz',
			}),
			`overrides:
  "@octanejs/app-core": "file:/tmp/app-core.tgz"
  "octane": "file:/tmp/octane.tgz"
`,
		);
	});
});

describe('isWithinDirectory', () => {
	test('distinguishes workspace entries from similarly prefixed external paths', () => {
		const workspace = path.join(path.sep, 'repo', 'octane');
		assert.equal(isWithinDirectory(workspace, path.join(workspace, 'packages', 'octane')), true);
		assert.equal(isWithinDirectory(workspace, path.join(path.sep, 'repo', 'octane-copy')), false);
	});
});
