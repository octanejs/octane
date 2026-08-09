/**
 * Octane-only unpaired framework-contract tests for the public adapter surface.
 * Outside react-parity ownership — see packages/inertia/UPSTREAM.md.
 */
import { describe, expect, it } from 'vitest';
import * as core from '@inertiajs/core';
import * as binding from '@octanejs/inertia';

describe('@octanejs/inertia framework-neutral exports', () => {
	it('preserves the upstream core singleton identities', () => {
		expect(binding.router).toBe(core.router);
		expect(binding.http).toBe(core.http);
		expect(binding.progress).toBe(core.progress);
	});

	it('does not expose an accidental partial adapter surface', () => {
		expect(Object.keys(binding).sort()).toEqual([
			'config',
			'http',
			'progress',
			'resetLayoutProps',
			'router',
			'setLayoutProps',
			'useForm',
			'useHttp',
			'usePage',
			'usePoll',
			'usePrefetch',
			'useRemember',
		]);
	});
});
