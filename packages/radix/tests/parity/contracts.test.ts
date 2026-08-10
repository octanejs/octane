import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const manifest = JSON.parse(
	readFileSync(resolve(root, 'packages/radix/audit/react-parity.json'), 'utf8'),
);
const status = JSON.parse(readFileSync(resolve(root, 'packages/radix/status.json'), 'utf8'));
const crosswalk = JSON.parse(
	readFileSync(resolve(root, 'packages/radix/audit/export-crosswalk.json'), 'utf8'),
);

describe('@octanejs/radix parity audit contracts', () => {
	// @parity-case adapted:radix-upstream-ledger
	it('authenticates the complete pinned transitive source and test boundary', () => {
		expect(manifest.provenance).toMatchObject({
			version: '1.6.4',
			commit: 'eb8b851619a655e278c819b959be0d3924b0ada8',
			verification: 'recorded-unverified',
		});
		expect(manifest.upstreamSuites).toMatchObject({
			runtime: 'present',
			types: 'present',
		});
		expect(() =>
			execFileSync(process.execPath, ['packages/radix/scripts/check-upstream-ledger.mjs'], {
				cwd: root,
				stdio: 'pipe',
			}),
		).not.toThrow();
	});

	// @parity-case adapted:radix-export-crosswalk
	it('crosswalks every upstream root export to an Octane mapping', () => {
		expect(crosswalk.exports.length).toBeGreaterThan(0);
		expect(
			crosswalk.exports.some(function (row) {
				return row.upstream === 'unstable_OneTimePasswordField';
			}),
		).toBe(true);
		expect(
			crosswalk.exports.some(function (row) {
				return row.upstream === 'unstable_PasswordToggleField';
			}),
		).toBe(true);
	});

	// OCTANE DIVERGENCE[slot-descriptor-adaptation][adapted:radix-slot-descriptors]
	// @parity-case adapted:radix-slot-descriptors
	it('keeps the Slot descriptor adaptation explicit', () => {
		expect(status.divergences.join(' ')).toContain('element descriptors');
	});

	// OCTANE DIVERGENCE[ref-as-prop][adapted:radix-ref-as-prop]
	// @parity-case adapted:radix-ref-as-prop
	it('keeps the ref-as-prop adaptation explicit', () => {
		expect(status.divergences.join(' ')).toContain('ref-as-prop');
	});
});
