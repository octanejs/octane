/**
 * Adapted divergence: the Octane binding uses native useSyncExternalStore and
 * publishes neither React nor use-sync-external-store. Dedicated file so mixed
 * public-surface conformance stays in ordinary shards.
 */
import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

describe('@octanejs/tiptap public module surface', function () {
	// Octane divergence: native external store (framework contract; not parity-owned).
	it('does not publish React or use-sync-external-store dependencies', function () {
		expect(packageJson.dependencies).not.toHaveProperty('react');
		expect(packageJson.dependencies).not.toHaveProperty('use-sync-external-store');
	});
});
