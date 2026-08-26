import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const expectedFailures = JSON.parse(
	readFileSync(resolve(repoRoot, 'packages/floating-ui/audit/expected-failures.json'), 'utf8'),
) as {
	tests: Array<{ id: string; file: string; fullName: string; divergenceId: string }>;
};
const runtimeCrosswalk = JSON.parse(
	readFileSync(resolve(repoRoot, 'packages/floating-ui/audit/runtime-crosswalk.json'), 'utf8'),
) as {
	tests: Array<{
		divergenceCaseId?: string;
		divergenceId?: string;
		disposition: string;
		fullName: string;
	}>;
};

// OCTANE DIVERGENCE[floating-ui-ref-as-prop][types:floating-ui-adapted-react]
// OCTANE DIVERGENCE[floating-ui-ref-scheduling][divergence:ref-scheduling:01]
// OCTANE DIVERGENCE[floating-ui-focus-scheduling][divergence:focus-scheduling:01]
// OCTANE DIVERGENCE[floating-ui-effect-scheduling][divergence:effect-scheduling:01]
// OCTANE DIVERGENCE[floating-ui-iframe-realm][divergence:iframe-realm:01]
// OCTANE DIVERGENCE[floating-ui-dynamic-children][divergence:dynamic-children:01]
// OCTANE DIVERGENCE[floating-ui-react-context-fixture][divergence:react-context-fixture:01]
// OCTANE DIVERGENCE[floating-ui-render-count][divergence:render-count:01]
// OCTANE DIVERGENCE[floating-ui-list-registration][divergence:list-registration:01]
// OCTANE DIVERGENCE[floating-ui-type-entrypoint][types:floating-ui-adapted-react-dom]

function assertExecutableNegativeControl(id: string): void {
	const expected = expectedFailures.tests.find((entry) => entry.id === id);
	expect(expected, `missing expected-failure ledger entry ${id}`).toBeDefined();
	const source = readFileSync(resolve(repoRoot, expected!.file), 'utf8');
	expect(source).toMatch(/\b(?:it|test)\.fails\s*\(/u);

	const crosswalk = runtimeCrosswalk.tests.find((entry) => entry.divergenceCaseId === id);
	expect(crosswalk, `missing runtime crosswalk entry ${id}`).toEqual(
		expect.objectContaining({
			divergenceId: expected!.divergenceId,
			disposition: 'expected-failure-negative-control',
			fullName: expected!.fullName,
		}),
	);
}

// @parity-case divergence:ref-scheduling:01
it('locks divergence:ref-scheduling:01', () =>
	assertExecutableNegativeControl('divergence:ref-scheduling:01'));

// @parity-case divergence:ref-scheduling:02
it('locks divergence:ref-scheduling:02', () =>
	assertExecutableNegativeControl('divergence:ref-scheduling:02'));

// @parity-case divergence:ref-scheduling:03
it('locks divergence:ref-scheduling:03', () =>
	assertExecutableNegativeControl('divergence:ref-scheduling:03'));

// @parity-case divergence:focus-scheduling:01
it('locks divergence:focus-scheduling:01', () =>
	assertExecutableNegativeControl('divergence:focus-scheduling:01'));

// @parity-case divergence:iframe-realm:01
it('locks divergence:iframe-realm:01', () =>
	assertExecutableNegativeControl('divergence:iframe-realm:01'));

// @parity-case divergence:iframe-realm:02
it('locks divergence:iframe-realm:02', () =>
	assertExecutableNegativeControl('divergence:iframe-realm:02'));

// @parity-case divergence:dynamic-children:01
it('locks divergence:dynamic-children:01', () =>
	assertExecutableNegativeControl('divergence:dynamic-children:01'));

// @parity-case divergence:dynamic-children:02
it('locks divergence:dynamic-children:02', () =>
	assertExecutableNegativeControl('divergence:dynamic-children:02'));

// @parity-case divergence:dynamic-children:03
it('locks divergence:dynamic-children:03', () =>
	assertExecutableNegativeControl('divergence:dynamic-children:03'));

// @parity-case divergence:dynamic-children:04
it('locks divergence:dynamic-children:04', () =>
	assertExecutableNegativeControl('divergence:dynamic-children:04'));

// @parity-case divergence:dynamic-children:05
it('locks divergence:dynamic-children:05', () =>
	assertExecutableNegativeControl('divergence:dynamic-children:05'));

// @parity-case divergence:react-context-fixture:01
it('locks divergence:react-context-fixture:01', () =>
	assertExecutableNegativeControl('divergence:react-context-fixture:01'));

// @parity-case divergence:react-context-fixture:02
it('locks divergence:react-context-fixture:02', () =>
	assertExecutableNegativeControl('divergence:react-context-fixture:02'));

// @parity-case divergence:react-context-fixture:03
it('locks divergence:react-context-fixture:03', () =>
	assertExecutableNegativeControl('divergence:react-context-fixture:03'));

// @parity-case divergence:focus-scheduling:02
it('locks divergence:focus-scheduling:02', () =>
	assertExecutableNegativeControl('divergence:focus-scheduling:02'));

// @parity-case divergence:render-count:01
it('locks divergence:render-count:01', () =>
	assertExecutableNegativeControl('divergence:render-count:01'));

// @parity-case divergence:effect-scheduling:01
it('locks divergence:effect-scheduling:01', () =>
	assertExecutableNegativeControl('divergence:effect-scheduling:01'));

// @parity-case divergence:ref-scheduling:04
it('locks divergence:ref-scheduling:04', () =>
	assertExecutableNegativeControl('divergence:ref-scheduling:04'));

// @parity-case divergence:ref-scheduling:05
it('locks divergence:ref-scheduling:05', () =>
	assertExecutableNegativeControl('divergence:ref-scheduling:05'));

// @parity-case divergence:effect-scheduling:02
it('locks divergence:effect-scheduling:02', () =>
	assertExecutableNegativeControl('divergence:effect-scheduling:02'));

// @parity-case divergence:list-registration:01
it('locks divergence:list-registration:01', () =>
	assertExecutableNegativeControl('divergence:list-registration:01'));

// @parity-case divergence:list-registration:02
it('locks divergence:list-registration:02', () =>
	assertExecutableNegativeControl('divergence:list-registration:02'));

// @parity-case divergence:dynamic-children:06
it('locks divergence:dynamic-children:06', () =>
	assertExecutableNegativeControl('divergence:dynamic-children:06'));

// @parity-case divergence:dynamic-children:07
it('locks divergence:dynamic-children:07', () =>
	assertExecutableNegativeControl('divergence:dynamic-children:07'));

// @parity-case divergence:dynamic-children:08
it('locks divergence:dynamic-children:08', () =>
	assertExecutableNegativeControl('divergence:dynamic-children:08'));

// @parity-case divergence:dynamic-children:09
it('locks divergence:dynamic-children:09', () =>
	assertExecutableNegativeControl('divergence:dynamic-children:09'));

// @parity-case divergence:dynamic-children:10
it('locks divergence:dynamic-children:10', () =>
	assertExecutableNegativeControl('divergence:dynamic-children:10'));

// @parity-case divergence:dynamic-children:11
it('locks divergence:dynamic-children:11', () =>
	assertExecutableNegativeControl('divergence:dynamic-children:11'));

// @parity-case divergence:dynamic-children:12
it('locks divergence:dynamic-children:12', () =>
	assertExecutableNegativeControl('divergence:dynamic-children:12'));
