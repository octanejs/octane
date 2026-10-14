/**
 * Run the ViewTransition test files with DOM staging off (#2043). A drain then
 * writes whatever still writes at render straight to committed DOM, so each
 * remaining render-time writer fails the tests that pin the old snapshot.
 * Writers moving to commit use this as their acceptance check; DOMStage is
 * deleted once it passes. Extra arguments go to vitest (e.g. `-t <name>`).
 */
import { spawnSync } from 'node:child_process';

const FILES = [
	'auto-memo.test.ts',
	'behavior-root.test.ts',
	'conformance/effect-event.test.ts',
	'conformance/lazy-components.test.ts',
	'conformance/view-transition.test.ts',
	'event-signal-owner.test.ts',
	'hydration/deferred-controlled-editor.test.ts',
	'hydration/deferred-hydration-contract.test.ts',
	'hydration/signal-declaration-owner.test.ts',
	'lazy-output.test.ts',
	'native-resume-staged-publication.test.ts',
	'non-jsx-return.test.ts',
	'optional-driver-bundle.test.ts',
	'private-context.test.ts',
	'stable-event-authority.test.ts',
	'streaming-ssr-injection.test.ts',
	'style-transaction-rollback.test.ts',
	'transition-flush-task.test.ts',
	'transition-task.test.ts',
	'view-transition-host-state.test.ts',
	'view-transition-lifecycle.test.ts',
	'view-transition-matching.test.ts',
	'view-transition-resume-errors.test.ts',
	'view-transition-scoped-effects.test.ts',
	'view-transition-ssr.test.ts',
	'view-transition-staging.test.ts',
	'view-transition.test.ts',
].map((file) => `packages/octane/tests/${file}`);

const result = spawnSync(
	'pnpm',
	['vitest', 'run', '--project', 'octane', '--maxWorkers=4', ...FILES, ...process.argv.slice(2)],
	{
		stdio: 'inherit',
		env: { ...process.env, OCTANE_VT_STAGING_OFF: '1' },
		shell: process.platform === 'win32',
	},
);
process.exit(result.status ?? 1);
