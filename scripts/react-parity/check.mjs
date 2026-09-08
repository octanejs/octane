#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPristineOracleEnvironment } from './alien-signals-pristine-runtime.mjs';
import { verifyAlienSignalsTestClassifications } from './alien-signals-classifications-lib.mjs';
import { verifyAlienSignalsRuntimeStructure } from './alien-signals-runtime-lib.mjs';
import { verifyAlienSignalsTypes } from './alien-signals-types-lib.mjs';
import { verifyBetterAuthRuntimeInventory } from './better-auth-runtime-lib.mjs';
import { verifyBetterAuthTypes } from './better-auth-types-lib.mjs';
import { verifyPortTestClassifications } from './binding-classifications-lib.mjs';
import {
	createRequiredNonVitestManifestShardPlan,
	runRequiredNonVitestBindingLanes,
	runRequiredVitestLanes,
} from './check-lib.mjs';
import { verifyDreiReactParity } from './drei-parity-lib.mjs';
import { verifyDreiTypes } from './drei-types-lib.mjs';
import { verifyEmblaCarouselTestClassifications } from './embla-carousel-classifications-lib.mjs';
import { verifyFormischTestClassifications } from './formisch-classifications-lib.mjs';
import { verifyFormischUpstream } from './formisch-upstream-lib.mjs';
import {
	isVitestLane,
	loadManifest,
	requiredExecutableLanes,
	verifyLaneEnvironment,
	verifyManifestFiles,
} from './harness-lib.mjs';
import { verifyHookFormTypes } from './hook-form-types-lib.mjs';
import { verifyHookFormUpstream } from './hook-form-upstream-lib.mjs';
import { verifyIntersectionObserverTestClassifications } from './intersection-observer-classifications-lib.mjs';
import { verifyIntersectionObserverTypes } from './intersection-observer-types-lib.mjs';
import { verifyIntersectionObserverUpstream } from './intersection-observer-upstream-lib.mjs';
import {
	renderCoverageReport,
	validateInventory,
	validateLedger,
	validateUpstreams,
} from './inventory-lib.mjs';
import { verifyLivestoreTestClassifications } from './livestore-classifications-lib.mjs';
import { verifyLivestoreTypes } from './livestore-types-lib.mjs';
import { verifyMotionTypes } from './motion-types-lib.mjs';
import { verifyNuqsTypes } from './nuqs-types-lib.mjs';
import { verifyPdfTestClassifications } from './pdf-classifications-lib.mjs';
import { verifyPopperTestClassifications } from './popper-classifications-lib.mjs';
import { verifyPopperTypes } from './popper-types-lib.mjs';
import { verifyReactColorfulTestClassifications } from './react-colorful-classifications-lib.mjs';
import { verifyReactColorfulTypes } from './react-colorful-types-lib.mjs';
import { verifyReactColorfulUpstream } from './react-colorful-upstream-lib.mjs';
import { verifyReactDraggableTestClassifications } from './react-draggable-classifications-lib.mjs';
import { verifyReactDraggableTypes } from './react-draggable-types-lib.mjs';
import { verifyReactDropzoneEvidence } from './react-dropzone-evidence-lib.mjs';
import { verifyReactMarkdownTestClassifications } from './react-markdown-classifications-lib.mjs';
import { verifyReactMarkdownTypes } from './react-markdown-types-lib.mjs';
import { verifyReactResizablePanelsTestClassifications } from './react-resizable-panels-classifications-lib.mjs';
import { verifyReactResizablePanelsTypes } from './react-resizable-panels-types-lib.mjs';
import { verifyReactResizablePanelsUpstream } from './react-resizable-panels-upstream-lib.mjs';
import { verifyReactSelectTestClassifications } from './react-select-classifications-lib.mjs';
import { verifyReactSpringUpstream } from './react-spring-upstream-lib.mjs';
import { verifyReactTextareaAutosizeTestClassifications } from './react-textarea-autosize-classifications-lib.mjs';
import { verifyReactTextareaAutosizeCrosswalk } from './react-textarea-autosize-crosswalk-lib.mjs';
import { verifyReactTextareaAutosizeTypes } from './react-textarea-autosize-types-lib.mjs';
import { verifyReactTransitionGroupTestClassifications } from './react-transition-group-classifications-lib.mjs';
import { verifyReactTransitionGroupTypes } from './react-transition-group-types-lib.mjs';
import { verifyReactTransitionGroupUpstream } from './react-transition-group-upstream-lib.mjs';
import { verifySolanaReactTypes } from './solana-kit-types-lib.mjs';
import { verifyTanstackDevtoolsTestClassifications } from './tanstack-devtools-classifications-lib.mjs';
import { verifyTanstackHotkeysTestClassifications } from './tanstack-hotkeys-classifications-lib.mjs';
import { verifyTanstackPacerTypes } from './tanstack-pacer-types-lib.mjs';
import { verifyTanstackStoreTypes } from './tanstack-store-types-lib.mjs';
import { verifyTanstackStoreUpstreamEvidence } from './tanstack-store-upstream-lib.mjs';
import { verifyTanstackTableTestClassifications } from './tanstack-table-classifications-lib.mjs';
import { verifyTanstackTableTypes } from './tanstack-table-types-lib.mjs';
import { verifyTiptapTestClassifications } from './tiptap-classifications-lib.mjs';
import { verifyTiptapRuntimeCrosswalk } from './tiptap-runtime-lib.mjs';
import { verifyTiptapTypes } from './tiptap-types-lib.mjs';
import { verifyTypeParity } from './type-parity-lib.mjs';
import { verifyVaulTestClassifications } from './vaul-classifications-lib.mjs';
import { verifyVaulAdaptedRuntimeStructure } from './vaul-runtime-lib.mjs';
import { verifyVaulUpstream } from './vaul-upstream-lib.mjs';
import { verifyVisxTestClassifications } from './visx-classifications-lib.mjs';
import { verifyVisxTypes } from './visx-types-lib.mjs';
import { verifyXstateStoreTypes, verifyXstateTypes } from './xstate-types-lib.mjs';
import { verifyZagTestClassifications } from './zag-classifications-lib.mjs';
import { verifyZagRuntimeCrosswalk } from './zag-runtime-crosswalk.mjs';
import { verifyZagTypes } from './zag-types-lib.mjs';
import { parseShard } from './shard-lib.mjs';
import { loadRequiredVitestLanes } from './vitest-batch-lib.mjs';
import { validateVitestContracts } from './vitest-contract.mjs';
import {
	discoverMaterializedUpstreamPackages,
	materializeUpstreamEvidence,
	verifyMaterializedUpstreamEvidence,
} from './materialized-upstream-lib.mjs';
import baseVitestConfig from '../../vitest.config.js';
import shardedVitestConfig from '../../vitest.ci-sharded.config.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUDIT = path.join(REPO, 'packages/octane/audit');
const UPSTREAMS_PATH = path.join(AUDIT, 'react-upstreams.json');
const LEDGER_PATH = path.join(AUDIT, 'react-conformance-ledger.json');
const REPORT_PATH = path.join(REPO, 'docs/react-parity-coverage.md');
const args = process.argv.slice(2);
let validateOnly = false;
let shardValue = '1/1';
for (let index = 0; index < args.length; index++) {
	const argument = args[index];
	if (argument === '--validate-only') {
		validateOnly = true;
	} else if (argument === '--shard') {
		shardValue = args[++index];
	} else if (argument.startsWith('--shard=')) {
		shardValue = argument.slice('--shard='.length);
	} else {
		throw new Error('Usage: check.mjs [--validate-only] [--shard <index>/<total>]');
	}
}
const parityShard = parseShard(shardValue);
if (validateOnly && parityShard.value !== '1/1') {
	throw new Error('--validate-only cannot be combined with --shard');
}
const BINDING_MANIFESTS = readdirSync(path.join(REPO, 'packages'), { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => `packages/${entry.name}/audit/react-parity.json`)
	.filter((manifest) => existsSync(path.join(REPO, manifest)))
	.sort();
// Lock-pinned packages regenerate their pristine/adapted upstream trees from
// audit/upstream.lock.json instead of committing the bytes. Materialize them
// before any verifier, contract walk, or lane reads those paths; an already
// verified tree is reused offline.
materializeUpstreamEvidence(REPO);
const HARNESS_PATH = path.join(REPO, 'scripts/react-parity/harness.mjs');
// Vitest owns the runner until its parity-wide batch exits. The remaining
// runners are internally single-process: TypeScript/Node use one process, Jest
// is runInBand, and Playwright uses one worker. One manifest per available CPU
// therefore uses the released runner capacity without competing schedulers.
const NON_VITEST_MANIFEST_CONCURRENCY = availableParallelism();
const NON_VITEST_BINDING_MANIFESTS = [];
const LOADED_BINDING_MANIFESTS = [];
const SPECIALIZED_CLASSIFICATION_BINDINGS = new Set([
	'alien-signals',
	'colorful',
	'draggable',
	'dropzone',
	'drei',
	'embla-carousel',
	'formisch',
	'intersection-observer',
	'livestore',
	'markdown',
	'pdf',
	'popper',
	'resizable-panels',
	'select',
	'transition-group',
	'tanstack-devtools',
	'tanstack-hotkeys',
	'tanstack-table',
	'textarea-autosize',
	'tiptap',
	'vaul',
	'visx',
	'zag',
]);
const errors = [];

async function capture(label, check) {
	try {
		await check();
	} catch (error) {
		errors.push(`${label} is invalid: ${error.message}`);
	}
}

await capture('react-hook-form upstream evidence', () => verifyHookFormUpstream(REPO));
await capture('react-hook-form type evidence', () => verifyHookFormTypes(REPO));
await capture('formisch upstream evidence', () =>
	verifyFormischUpstream(REPO, {
		integrity: '3f9c1c6da89473296033cc2701405080b2cb11478724bc7f045063ee618aaf57',
	}),
);
await capture('formisch type evidence', () =>
	verifyTypeParity(REPO, { configPath: 'packages/formisch/audit/type-parity.json' }),
);
await capture('formisch test classifications', () => verifyFormischTestClassifications(REPO));
await capture('react-intersection-observer upstream evidence', () =>
	verifyIntersectionObserverUpstream(REPO),
);
await capture('intersection-observer type evidence', () => verifyIntersectionObserverTypes(REPO));
await capture('intersection-observer test classifications', () =>
	verifyIntersectionObserverTestClassifications(REPO),
);
await capture('react-dropzone evidence', () => verifyReactDropzoneEvidence(REPO));
await capture('react-resizable-panels upstream evidence', () =>
	verifyReactResizablePanelsUpstream(REPO),
);
await capture('react-resizable-panels type evidence', () => verifyReactResizablePanelsTypes(REPO));
await capture('react-resizable-panels test classifications', () =>
	verifyReactResizablePanelsTestClassifications(REPO),
);
await capture('react-select test classifications', () =>
	verifyReactSelectTestClassifications(REPO),
);
await capture('livestore type evidence', () => verifyLivestoreTypes(REPO));
await capture('livestore test classifications', () => verifyLivestoreTestClassifications(REPO));
await capture('alien-signals type evidence', () => verifyAlienSignalsTypes(REPO));
await capture('alien-signals runtime structure evidence', () =>
	verifyAlienSignalsRuntimeStructure(REPO),
);
await capture('better-auth type evidence', () => verifyBetterAuthTypes(REPO));
await capture('better-auth runtime inventory', () => verifyBetterAuthRuntimeInventory(REPO));
await capture('alien-signals pristine oracle environment', () =>
	assertPristineOracleEnvironment({
		environmentPath: path.join(
			REPO,
			'packages/alien-signals/audit/pristine-oracle-environment.json',
		),
		fromPath: path.join(REPO, 'packages/alien-signals'),
	}),
);
await capture('alien-signals test classifications', () =>
	verifyAlienSignalsTestClassifications(REPO),
);
await capture('@octanejs/tanstack-store type evidence', () => verifyTanstackStoreTypes(REPO));
await capture('@octanejs/tanstack-store upstream evidence', () =>
	verifyTanstackStoreUpstreamEvidence(REPO),
);
await capture('react-markdown type evidence', () => verifyReactMarkdownTypes(REPO));
await capture('react-markdown test classifications', () =>
	verifyReactMarkdownTestClassifications(REPO),
);
await capture('@octanejs/solana-kit type evidence', () => verifySolanaReactTypes(REPO));
await capture('react-spring upstream evidence', () => verifyReactSpringUpstream(REPO));
await capture('@octanejs/tanstack-table type evidence', () => verifyTanstackTableTypes(REPO));
await capture('tanstack-table test classifications', () =>
	verifyTanstackTableTestClassifications(REPO),
);
await capture('@octanejs/tiptap type evidence', () => verifyTiptapTypes(REPO));
await capture('@octanejs/tiptap runtime crosswalk', () => verifyTiptapRuntimeCrosswalk(REPO));
await capture('@octanejs/tiptap test classifications', () => verifyTiptapTestClassifications(REPO));
await capture('@octanejs/motion type evidence', () => verifyMotionTypes(REPO));
await capture('@octanejs/nuqs type evidence', () => verifyNuqsTypes(REPO));
await capture('@octanejs/tanstack-pacer type evidence', () => verifyTanstackPacerTypes(REPO));
await capture('@octanejs/colorful upstream evidence', () => verifyReactColorfulUpstream(REPO));
await capture('@octanejs/colorful type evidence', () => verifyReactColorfulTypes(REPO));
await capture('@octanejs/colorful test classifications', () =>
	verifyReactColorfulTestClassifications(REPO),
);
for (const materializedPackage of discoverMaterializedUpstreamPackages(REPO)) {
	await capture(`${materializedPackage} materialized upstream evidence`, () =>
		verifyMaterializedUpstreamEvidence(REPO, materializedPackage),
	);
}
await capture('zag type evidence', () => verifyZagTypes(REPO));
await capture('zag test classifications', () => verifyZagTestClassifications(REPO));
await capture('zag runtime inventory crosswalk', () => verifyZagRuntimeCrosswalk(REPO));
await capture('embla-carousel test classifications', () =>
	verifyEmblaCarouselTestClassifications(REPO),
);
await capture('embla-carousel type parity', async () => {
	const { verifyCommittedTypeParity } = await import(
		path.join(REPO, 'packages/embla-carousel/audit/type-parity.mjs')
	);
	await verifyCommittedTypeParity();
});
if (!validateOnly) {
	await capture('embla-carousel parity negative controls', () =>
		execFileSync(
			process.execPath,
			[
				'node_modules/vitest/vitest.mjs',
				'run',
				'--project',
				'embla-carousel-audit',
				'packages/embla-carousel/tests/audit/parity-negative-controls.test.ts',
			],
			{ cwd: REPO, stdio: 'inherit' },
		),
	);
}
await capture('react-transition-group upstream evidence', () =>
	verifyReactTransitionGroupUpstream(REPO),
);
await capture('react-transition-group type evidence', () => verifyReactTransitionGroupTypes(REPO));
await capture('react-transition-group test classifications', () =>
	verifyReactTransitionGroupTestClassifications(REPO),
);
await capture('vaul upstream evidence', () => verifyVaulUpstream(REPO));
await capture('vaul test classifications', () => verifyVaulTestClassifications(REPO));
await capture('vaul adapted runtime structural evidence', () =>
	verifyVaulAdaptedRuntimeStructure(REPO),
);
await capture('drei React-parity evidence', () => verifyDreiReactParity(REPO));
await capture('drei type evidence', () => verifyDreiTypes(REPO));
await capture('tanstack-hotkeys test classifications', () =>
	verifyTanstackHotkeysTestClassifications(REPO),
);
await capture('tanstack-devtools test classifications', () =>
	verifyTanstackDevtoolsTestClassifications(REPO),
);
await capture('@octanejs/visx type evidence', () => verifyVisxTypes(REPO));
await capture('visx test classifications', () => verifyVisxTestClassifications(REPO));
await capture('react-textarea-autosize test classifications', () =>
	verifyReactTextareaAutosizeTestClassifications(REPO),
);
await capture('react-textarea-autosize upstream crosswalk', () =>
	verifyReactTextareaAutosizeCrosswalk(REPO),
);
await capture('react-textarea-autosize type evidence', () =>
	verifyReactTextareaAutosizeTypes(REPO),
);
await capture('react-draggable type evidence', () => verifyReactDraggableTypes(REPO));
await capture('react-draggable test classifications', () =>
	verifyReactDraggableTestClassifications(REPO),
);
await capture('@octanejs/popper type evidence', () => verifyPopperTypes(REPO));
await capture('@octanejs/popper test classifications', () => verifyPopperTestClassifications(REPO));
await capture('pdf test classifications', () => verifyPdfTestClassifications(REPO));
await capture('@octanejs/xstate type evidence', () => verifyXstateTypes(REPO));
await capture('@octanejs/xstate-store type evidence', () => verifyXstateStoreTypes(REPO));

// The home marketing surface was split from a single Home.tsrx into per-section
// .tsrx files, and its benchmark/marketing copy also moved into shared components.
function listTsrxFiles(relativeDir) {
	const absoluteDir = path.join(REPO, relativeDir);
	if (!existsSync(absoluteDir)) return [];
	return readdirSync(absoluteDir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.tsrx'))
		.map((entry) => path.relative(REPO, path.join(entry.parentPath ?? entry.path, entry.name)))
		.sort();
}

const CLAIM_FILES = [
	'README.md',
	'docs/differences-from-react.md',
	'website/public/llms.txt',
	...listTsrxFiles('website/src/pages/home'),
	...listTsrxFiles('website/src/components'),
];
const MISLEADING_CLAIMS = [
	/2[,.]?200\+[\s\S]{0,120}React conformance/i,
	/\b[\d,~+]+\s+conformance\s+tests?\s+(?:ported|lifted straight)\s+from\s+(?:facebook\/)?react/i,
	/\b[\d,~+]+\s+React\s+conformance\s+cases?\b/i,
];

function readJson(file, label) {
	if (!existsSync(file)) {
		errors.push(`${label} is missing: ${path.relative(REPO, file)}.`);
		return null;
	}
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch (error) {
		errors.push(`${label} is invalid JSON: ${error.message}`);
		return null;
	}
}

const upstreams = readJson(UPSTREAMS_PATH, 'React upstream metadata');
const ledger = readJson(LEDGER_PATH, 'React conformance ledger');
const inventories = ['stable', 'canary'].map((baseline) => ({
	baseline,
	inventory: readJson(
		path.join(AUDIT, `react-test-inventory.${baseline}.json`),
		`React ${baseline} inventory`,
	),
}));

if (upstreams) errors.push(...validateUpstreams(upstreams));
const loadedInventories = inventories.flatMap(({ baseline, inventory }) => {
	if (!inventory || !upstreams) return [];
	errors.push(...validateInventory(inventory, upstreams, baseline));
	return [inventory];
});
if (ledger && loadedInventories.length === 2) {
	errors.push(...validateLedger(ledger, loadedInventories, REPO, upstreams));
	const expectedReport = renderCoverageReport({
		upstreams,
		inventories: loadedInventories,
		ledger,
	});
	if (!existsSync(REPORT_PATH)) errors.push('Generated React parity coverage report is missing.');
	else if (readFileSync(REPORT_PATH, 'utf8') !== expectedReport)
		errors.push('docs/react-parity-coverage.md is stale; run react-parity:generate.');
}
for (const relativeFile of CLAIM_FILES) {
	const source = readFileSync(path.join(REPO, relativeFile), 'utf8');
	for (const pattern of MISLEADING_CLAIMS) {
		if (pattern.test(source))
			errors.push(`${relativeFile} contains a misleading React-port count claim (${pattern}).`);
	}
}

const pnpmVersion = execFileSync('pnpm', ['--version'], { encoding: 'utf8' });
for (const relativeFile of BINDING_MANIFESTS) {
	try {
		const manifest = await loadManifest(path.join(REPO, relativeFile));
		LOADED_BINDING_MANIFESTS.push({ path: relativeFile, manifest });
		if (requiredExecutableLanes(manifest).some((lane) => !isVitestLane(lane))) {
			NON_VITEST_BINDING_MANIFESTS.push({ relativeFile, manifest });
		}
		const binding = relativeFile.split('/')[1];
		if (
			!SPECIALIZED_CLASSIFICATION_BINDINGS.has(binding) &&
			existsSync(path.join(REPO, `packages/${binding}/audit/test-classifications.json`))
		) {
			verifyPortTestClassifications(REPO, binding);
		}
		await verifyManifestFiles(manifest, REPO);
		for (const lane of manifest.lanes) {
			await verifyLaneEnvironment(manifest, lane, REPO, pnpmVersion);
		}
	} catch (error) {
		errors.push(`${relativeFile} is invalid: ${error.message}`);
	}
}

if (LOADED_BINDING_MANIFESTS.length === BINDING_MANIFESTS.length) {
	await capture('Vitest React parity execution contract', () =>
		validateVitestContracts({
			manifestEntries: LOADED_BINDING_MANIFESTS,
			baseProjects: baseVitestConfig.test.projects,
			shardedProjects: shardedVitestConfig.test.projects,
			root: REPO,
		}),
	);
}

if (!validateOnly && errors.length === 0) {
	const vitestLanes = loadRequiredVitestLanes(REPO);
	console.log(
		`planned native Vitest file shard ${parityShard.value} across ${vitestLanes.length} required lanes`,
	);
	await capture('required Vitest React parity lanes', () =>
		runRequiredVitestLanes({
			lanes: vitestLanes,
			repo: REPO,
			shard: parityShard.value,
			reportPath: process.env.REACT_PARITY_VITEST_REPORT,
		}),
	);
	if (errors.length === 0) {
		const nonVitestShard = createRequiredNonVitestManifestShardPlan(
			NON_VITEST_BINDING_MANIFESTS,
			REPO,
			parityShard.total,
		)[parityShard.index - 1];
		console.log(
			`planned non-Vitest shard ${parityShard.value}: ${nonVitestShard.items.length} manifests, estimated weight ${nonVitestShard.estimatedWeight}`,
		);
		await capture('required non-Vitest React parity lanes', () =>
			runRequiredNonVitestBindingLanes({
				relativeFiles: nonVitestShard.items.map((item) => item.relativeFile),
				harnessPath: HARNESS_PATH,
				repo: REPO,
				concurrency: NON_VITEST_MANIFEST_CONCURRENCY,
			}),
		);
	}
}

if (errors.length) {
	console.error(`React parity audit failed:\n  - ${errors.join('\n  - ')}`);
	process.exit(1);
}

console.log(
	`React parity ${validateOnly ? 'metadata' : parityShard.total === 1 ? 'audit' : `audit shard ${parityShard.value}`} is current (${loadedInventories
		.map((inventory) => `${inventory.baseline}: ${inventory.summary.concreteCases} cases`)
		.join(', ')}).`,
);
