#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

import { inspectShippedSources } from '../../../scripts/react-port/evidence-lib.mjs';

const root = resolve(import.meta.dirname, '../../..');
const packageDir = resolve(root, 'packages/grab');
const batchManifest = JSON.parse(
	readFileSync(resolve(root, '.react-port-work/react-grab-20260916/manifest.json'), 'utf8'),
);
const node = batchManifest.nodes['pkg:react-grab'];
const inventory = node.upstreamTestInventory;
if (!Array.isArray(inventory) || inventory.length === 0)
	throw new Error('Batch manifest has no upstream test inventory for pkg:react-grab');

const sha256 = (file) =>
	createHash('sha256')
		.update(readFileSync(resolve(root, file)))
		.digest('hex');
const writeJson = async (relativePath, value) => {
	const destination = resolve(root, relativePath);
	writeFileSync(
		destination,
		await format(JSON.stringify(value), {
			...(await resolveConfig(destination, { editorconfig: true })),
			filepath: destination,
		}),
	);
	console.log(`${relativePath} written`);
};

// ---------------------------------------------------------------------------
// registrations.json — the immutable upstream registration inventory, flattened.
// ---------------------------------------------------------------------------
const registrations = inventory
	.flatMap((entry) => entry.registrations)
	.sort((left, right) => left.id.localeCompare(right.id));

// ---------------------------------------------------------------------------
// crosswalk.json — every upstream registration classified against local evidence.
//
// The pinned upstream runtime suite is two populations:
//  - packages/react-grab/tests (48 Vitest unit files, 356 registrations):
//    materialized byte-exact under tests/upstream with mechanical import
//    rewrites and executed by the adapted Octane lane. Each registration is
//    `implemented` with its adapted test file as local evidence.
//  - packages/react-grab/e2e (62 Playwright/expect-sdk specs, 1169
//    registrations): they bind to fixture applications under upstream
//    apps/e2e-app-*, which live outside the pinned package subtree, so the
//    specs cannot execute here. Files whose contract is verified by a
//    package-local lane are `conformance` with that evidence; specs asserting
//    mechanisms outside this binding's public surface are `inapplicable`;
//    the remainder are `unsupported` with the fixture-app rationale.
// ---------------------------------------------------------------------------
const E2E_RATIONALE =
	'Upstream Playwright scenario requires the apps/e2e-app-* fixture applications and expect-sdk harness that live outside the pinned packages/react-grab subtree; no package-local lane reproduces this scenario.';
const conformance = (paths) => ({ classification: 'conformance', localEvidence: paths });
const unsupported = (extra) => ({
	classification: 'unsupported',
	rationale: extra ? `${E2E_RATIONALE} ${extra}` : E2E_RATIONALE,
});
const inapplicable = (reason) => ({ classification: 'inapplicable', rationale: reason });

const E2E_CLASSIFICATIONS = {
	'activation-edge-cases.spec.ts': unsupported(
		'The activation edge timing matrix is not replayed locally; activation lifecycle coverage is in tests/browser/overlay.browser.test.ts.',
	),
	'activation-key-config.spec.ts': conformance([
		'tests/upstream/parse-activation-key.test.ts',
		'tests/browser/overlay.browser.test.ts',
	]),
	'activation.spec.ts': conformance([
		'tests/browser/overlay.browser.test.ts',
		'tests/differential/parity.test.ts',
	]),
	'api-methods.spec.ts': conformance([
		'tests/browser/overlay.browser.test.ts',
		'tests/differential/parity.test.ts',
		'tests/ssr/isomorphic-import.test.ts',
	]),
	'app-theme-detection.spec.ts': unsupported(
		'Theme detection is ported in src/utils/detect-app-theme.ts; the fixture-app color-scheme matrix has no package-local equivalent.',
	),
	'combinatorial-interactions.spec.ts': unsupported(
		'The cross-feature interaction matrix needs the e2e fixture application.',
	),
	'context-menu.spec.ts': conformance([
		'tests/upstream/execute-context-menu-action.test.ts',
		'tests/upstream/label-controller.test.ts',
	]),
	'copy-failure.spec.ts': conformance([
		'tests/upstream/copy-flow.test.ts',
		'tests/upstream/copy-content.test.ts',
	]),
	'copy-feedback.spec.ts': conformance([
		'tests/upstream/copy-flow.test.ts',
		'tests/upstream/copy-payload.test.ts',
		'tests/browser/overlay.browser.test.ts',
	]),
	'disabled-elements.spec.ts': conformance(['tests/browser/overlay.browser.test.ts']),
	'drag-selection.spec.ts': conformance([
		'tests/upstream/get-elements-in-drag.test.ts',
		'tests/upstream/create-toolbar-drag.test.ts',
	]),
	'drag-targeting-regressions.spec.ts': conformance([
		'tests/upstream/get-elements-in-drag.test.ts',
	]),
	'edge-cases.spec.ts': unsupported(
		'The removal/rapid-action/visibility edge matrix needs the e2e fixture application; dispose and reinitialization are covered in tests/browser/overlay.browser.test.ts.',
	),
	'element-context.spec.ts': conformance([
		'tests/upstream/context.test.ts',
		'tests/differential/parity.test.ts',
	]),
	'event-callbacks.spec.ts': unsupported(
		'Callback ordering/arguments are asserted through the Playwright fixture application; no package-local test captures the callback stream.',
	),
	'fiber-relink.spec.ts': conformance(['tests/upstream/create-fiber-revision.test.ts']),
	'focus-trap.spec.ts': unsupported(
		'Focus-trap resistance scenarios need the e2e fixture application.',
	),
	'framework/contract.spec.ts': unsupported(
		'The shared framework contract spec drives per-framework fixture applications (React, Next.js, TanStack) outside the pinned subtree; the binding runtime-mode contract is covered by tests/upstream/runtime-mode.test.ts.',
	),
	'framework/list-keys.spec.ts': conformance(['tests/upstream/format-list-item-key.test.ts']),
	'framework/navigation.spec.ts': inapplicable(
		'Route-transition invalidation is asserted against host-framework routers in the e2e fixture applications; the binding has no router-specific public surface.',
	),
	'framework/owner-semantics.spec.ts': inapplicable(
		'These cases assert React owner-chain semantics (React owners, Suspense reveals, Next.js link owners) which have no Octane counterpart; Octane scope ancestry is covered by tests/upstream/context.test.ts and tests/upstream/create-nearest-semantic-element-selector-details.test.ts.',
	),
	'framework/production.spec.ts': inapplicable(
		'Production-build assertions target optimized React builds of the fixture applications; the binding ships authored source, not framework build artifacts.',
	),
	'framework-production.spec.ts': inapplicable(
		'Production-build degradation cases assert optimized builds of the fixture applications (source maps, asset optimization); the binding ships authored source and has no production-build fixture surface.',
	),
	'framework/recovery.spec.ts': inapplicable(
		'Recovery cases exercise React Server Component owners and TanStack router loaders in the fixture applications, which are outside this binding’s surface.',
	),
	'freeze-animations.spec.ts': conformance([
		'tests/upstream/freeze-renderers.test.ts',
		'tests/upstream/primitives-freeze.test.ts',
	]),
	'freeze-pseudo-states.spec.ts': conformance([
		'tests/upstream/primitives-freeze.test.ts',
		'tests/upstream/freeze-renderers.test.ts',
	]),
	'freeze-updates.spec.ts': conformance([
		'tests/upstream/freeze-renderers.test.ts',
		'tests/upstream/primitives-freeze.test.ts',
	]),
	'heavy-ui.spec.ts': unsupported(
		'Heavy-DOM stress scenarios need the e2e fixture application under Playwright.',
	),
	'hold-activation.spec.ts': conformance([
		'tests/upstream/parse-activation-key.test.ts',
		'tests/browser/overlay.browser.test.ts',
	]),
	'host-interaction-cleanup.spec.ts': unsupported(
		'Host style restoration after drag deactivation is asserted only through the e2e fixture application.',
	),
	'hover-reveal.spec.ts': unsupported(
		'Hover-reveal timing scenarios need the e2e fixture application.',
	),
	'iframe.spec.ts': unsupported(
		'Cross-frame selection, event forwarding, and freeze propagation are asserted against iframe fixture pages; iframe candidate mechanics are covered by tests/upstream/get-elements-in-drag.test.ts and tests/upstream/convert-top-window-position-to-client.test.ts.',
	),
	'interference-ui.spec.ts': unsupported(
		'Third-party overlay interference scenarios need the e2e fixture application.',
	),
	'keyboard-navigation.spec.ts': unsupported(
		'Arrow-key traversal flows are exercised through the e2e fixture application; no package-local test drives the navigation state machine.',
	),
	'keyboard-shortcuts.spec.ts': conformance([
		'tests/upstream/parse-activation-key.test.ts',
		'tests/browser/overlay.browser.test.ts',
	]),
	'malformed-events.spec.ts': unsupported(
		'Malformed input-event robustness is asserted through the e2e fixture application.',
	),
	'next-symbolication-blocking.spec.ts': conformance([
		'tests/upstream/next-server-frames.test.ts',
		'tests/upstream/is-next-project-runtime.test.ts',
		'tests/upstream/is-shared-ui-source-path.test.ts',
		'tests/upstream/is-generated-bundle-source-path.test.ts',
	]),
	'open-file.spec.ts': conformance([
		'tests/upstream/open-file.test.ts',
		'tests/upstream/open-file-action.test.ts',
	]),
	'overlay-filtering.spec.ts': conformance([
		'tests/upstream/should-include-element-selector.test.ts',
		'tests/upstream/get-element-at-position.test.ts',
		'tests/upstream/primitives-hit-testing.test.ts',
	]),
	'owner-stack.spec.ts': inapplicable(
		'Owner-stack cases assert React fiber ownership resolution; the binding resolves component ancestry through Octane scopes instead, covered by tests/upstream/context.test.ts.',
	),
	'perf-bench.spec.ts': unsupported(
		'Benchmark thresholds are asserted against the e2e fixture applications and hardware profiles outside the pinned subtree.',
	),
	'perf-heavy.spec.ts': unsupported(
		'Benchmark thresholds are asserted against the e2e fixture applications and hardware profiles outside the pinned subtree.',
	),
	'perf-interference.spec.ts': unsupported(
		'Performance-under-interference scenarios need the e2e fixture applications.',
	),
	'prompt-mode.spec.ts': unsupported(
		'Prompt-mode flows are exercised through the e2e fixture application.',
	),
	'react-grab.expect.ts': unsupported(
		'These registrations are expect-sdk AI-evaluated scenarios that require a live dev server and model evaluation outside the pinned package subtree.',
	),
	'selection.spec.ts': conformance([
		'tests/browser/overlay.browser.test.ts',
		'tests/upstream/get-element-at-position.test.ts',
	]),
	'shadow-dom.spec.ts': conformance([
		'tests/renderer-mount.test.ts',
		'tests/browser/overlay.browser.test.ts',
		'tests/upstream/get-elements-in-drag.test.ts',
	]),
	'shift-multi-select.spec.ts': unsupported(
		'Shift-click accumulation semantics are asserted through the e2e fixture application; drag multi-select mechanics are covered by tests/upstream/get-elements-in-drag.test.ts.',
	),
	'solid-source-location.spec.ts': unsupported(
		'Solid host-app source locations are asserted against a Solid fixture application; the ported resolver in src/utils/resolve-solid-source-location.ts has no package-local driver.',
	),
	'ssr.spec.ts': conformance(['tests/ssr/isomorphic-import.test.ts']),
	'theme-customization.spec.ts': unsupported(
		'Option-driven overlay theming is asserted through the e2e fixture application; the theme contract itself is pinned by tests/differential/parity.test.ts.',
	),
	'three-fiber-selection.spec.ts': conformance(['tests/upstream/three-selection.test.ts']),
	'three-js-rendering.spec.ts': unsupported(
		'Real WebGL/three.js render targeting needs the e2e fixture application; selection logic is covered by tests/upstream/three-selection.test.ts.',
	),
	'toolbar-actions.spec.ts': conformance([
		'tests/upstream/execute-context-menu-action.test.ts',
		'tests/upstream/label-controller.test.ts',
	]),
	'toolbar-menu.spec.ts': conformance([
		'tests/upstream/execute-context-menu-action.test.ts',
		'tests/upstream/label-controller.test.ts',
	]),
	'toolbar-selection-hover.spec.ts': conformance([
		'tests/upstream/label-controller.test.ts',
		'tests/upstream/notify-toolbar-state-change-subscribers.test.ts',
	]),
	'toolbar.spec.ts': conformance([
		'tests/upstream/label-controller.test.ts',
		'tests/upstream/notify-toolbar-state-change-subscribers.test.ts',
		'tests/upstream/execute-context-menu-action.test.ts',
		'tests/upstream/create-toolbar-drag.test.ts',
	]),
	'touch-mode.spec.ts': unsupported(
		'Touch-input flows are exercised through the e2e fixture application.',
	),
	'viewport.spec.ts': conformance([
		'tests/upstream/convert-top-window-position-to-client.test.ts',
		'tests/upstream/auto-scroll.test.ts',
	]),
	'visual-feedback.spec.ts': unsupported(
		'Visual feedback timing/animation assertions need the e2e fixture application.',
	),
	'web-extension.spec.ts': unsupported(
		'Extension-context hydration of plugin defaults needs the bundled extension fixture.',
	),
	'zoom-canvas.spec.ts': unsupported(
		'Scaled-canvas coordinate scenarios need the e2e fixture application.',
	),
};

const crosswalk = [];
const missingPolicies = [];
for (const entry of inventory) {
	const isE2e = entry.path.startsWith('packages/react-grab/e2e/');
	const adaptedPath = entry.path.replace(/^packages\/react-grab\/tests\//, 'tests/upstream/');
	if (!isE2e && !entry.path.startsWith('packages/react-grab/tests/')) {
		throw new Error(`Unexpected non-e2e, non-tests upstream path: ${entry.path}`);
	}
	if (isE2e && !E2E_CLASSIFICATIONS[entry.path.slice('packages/react-grab/e2e/'.length)]) {
		missingPolicies.push(entry.path);
		continue;
	}
	for (const registration of entry.registrations) {
		if (isE2e) {
			const policy = E2E_CLASSIFICATIONS[entry.path.slice('packages/react-grab/e2e/'.length)];
			crosswalk.push({ id: registration.id, ...structuredClone(policy) });
		} else {
			crosswalk.push({
				id: registration.id,
				classification: 'implemented',
				localEvidence: adaptedPath,
			});
		}
	}
}
if (missingPolicies.length)
	throw new Error(`E2e files missing a classification: ${missingPolicies.join(', ')}`);
crosswalk.sort((left, right) => left.id.localeCompare(right.id));

// ---------------------------------------------------------------------------
// closure.json — shipped-source ledger + derived runtime/adapted closure.
// ---------------------------------------------------------------------------
const upstreamSourceRoot = join(packageDir, 'upstream/packages/react-grab/src');
const upstreamSourceFiles = new Set(
	readdirSync(upstreamSourceRoot, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => relative(upstreamSourceRoot, join(entry.parentPath, entry.name))),
);
const upstreamNameFor = (shippedPath) => {
	const sourcePath = shippedPath.replace(/^src\//, '');
	const upstreamPath = sourcePath.replace(/\.tsrx$/, '.tsx');
	if (upstreamSourceFiles.has(upstreamPath)) return upstreamPath;
	if (upstreamSourceFiles.has(`${upstreamPath}x`)) return `${upstreamPath}x`;
	return null;
};
const shipped = inspectShippedSources(packageDir);
const sourceLedger = [];
for (const file of shipped.files) {
	const upstreamPath = upstreamNameFor(file);
	sourceLedger.push({
		path: file,
		sha256: sha256(`packages/grab/${file}`),
		origin: upstreamPath ? 'adapted' : 'authored',
		...(upstreamPath ? { packageName: 'react-grab' } : {}),
	});
}
const adaptedPaths = sourceLedger
	.filter((entry) => entry.origin === 'adapted')
	.map((entry) => entry.path)
	.sort();
const closure = {
	runtimeDependencies: shipped.runtimeDependencies,
	sourceLedger,
	adaptedSources: [{ packageName: 'react-grab', paths: adaptedPaths }],
	reimplementedDependencies: [
		{
			packageName: 'bippy',
			publicBehaviors: [
				'resolve the host element/component ancestry for a grabbed element through Octane scopes (upstream uses React fibers via bippy)',
				'resolve the nearest host fiber/scope for a DOM element so selection can relink across DOM swaps',
				'read component display names and, in development, JSX source locations from the host tree instrumentation',
			],
			localEvidence: [
				'tests/upstream/context.test.ts',
				'tests/upstream/create-fiber-revision.test.ts',
				'tests/upstream/three-selection.test.ts',
				'tests/differential/parity.test.ts',
			],
		},
	],
};

// ---------------------------------------------------------------------------
// provenance.json — pure-data provenance contract for verify-provenance.mjs.
// ---------------------------------------------------------------------------
const provenance = {
	schemaVersion: 1,
	artifacts: [
		{ path: 'LICENSE.upstream', sha256: sha256('packages/grab/LICENSE.upstream') },
		{
			path: 'upstream-artifact/react-grab-0.2.0.tgz',
			sha256: sha256('packages/grab/upstream-artifact/react-grab-0.2.0.tgz'),
		},
	],
	requiredFiles: [
		'audit/upstream.lock.json',
		'audit/registrations.json',
		'audit/crosswalk.json',
		'audit/closure.json',
		'audit/react-parity.json',
		'audit/pristine-runtime.json',
		'audit/adapted-runtime.json',
		'audit/differential-runtime.json',
		'audit/browser-runtime.json',
		'tests/types/public.ts',
		'tests/types/published-contract.ts',
		'tests/types/tsconfig.json',
		'typetests/pristine/tsconfig.json',
		'typetests/adapted/tsconfig.json',
	],
	filesEqual: [{ path: 'LICENSE.upstream', equalsPath: 'upstream/packages/react-grab/LICENSE' }],
	packageIdentity: {
		path: 'upstream/packages/react-grab/package.json',
		name: 'react-grab',
		version: '0.2.0',
		license: 'MIT',
	},
	unpublishedDirs: ['audit', 'tests', 'typetests', 'upstream', 'upstream-artifact', 'scripts'],
};

await writeJson('packages/grab/audit/registrations.json', registrations);
await writeJson('packages/grab/audit/crosswalk.json', crosswalk);
await writeJson('packages/grab/audit/closure.json', closure);
await writeJson('packages/grab/audit/provenance.json', provenance);

const counts = crosswalk.reduce((map, entry) => {
	map.set(entry.classification, (map.get(entry.classification) ?? 0) + 1);
	return map;
}, new Map());
console.log(
	`crosswalk: ${crosswalk.length} registrations ${JSON.stringify(Object.fromEntries(counts))}`,
);
console.log(
	`closure: ${sourceLedger.length} shipped sources (${adaptedPaths.length} adapted), runtime deps ${JSON.stringify(shipped.runtimeDependencies)}`,
);
