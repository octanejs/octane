import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const manifest = JSON.parse(
	readFileSync(resolve(root, 'packages/dnd-kit/audit/react-parity.json'), 'utf8'),
);
const status = JSON.parse(readFileSync(resolve(root, 'packages/dnd-kit/status.json'), 'utf8'));

describe('@octanejs/dnd-kit parity audit contracts', () => {
	it('authenticates the pinned upstream source and absent upstream suites', () => {
		expect(manifest.provenance).toMatchObject({
			version: '0.5.0',
			commit: 'cc98bdd52c06e55221e8cf77aaa0c2ec0f55b86f',
			verification: 'recorded-unverified',
		});
		expect(() =>
			execFileSync(
				process.execPath,
				[
					'scripts/react-port/materialize.mjs',
					'run',
					'--check',
					'--package-dir',
					'packages/dnd-kit',
				],
				{
					cwd: root,
					stdio: 'pipe',
				},
			),
		).not.toThrow();
	});

	it('keeps DragOverlay compiled-child handling explicit', () => {
		const divergence = manifest.divergences.find(function (entry: { id: string }) {
			return entry.id === 'dnd-kit-drag-overlay-compiled-children';
		});
		expect(divergence).toMatchObject({
			id: 'dnd-kit-drag-overlay-compiled-children',
			caseIds: ['differential:dnd-kit-drag-overlay-compiled-children'],
		});
		expect(status.divergences.join(' ')).toContain('compiled children');
	});

	it('keeps OptimisticSortingPlugin omission explicit', () => {
		const divergence = manifest.divergences.find(function (entry: { id: string }) {
			return entry.id === 'dnd-kit-sortable-omit-optimistic-sorting';
		});
		expect(divergence).toMatchObject({
			id: 'dnd-kit-sortable-omit-optimistic-sorting',
			caseIds: ['differential:dnd-kit-sortable-omit-optimistic-sorting'],
		});
		expect(status.divergences.join(' ')).toContain('OptimisticSortingPlugin');
	});
});
