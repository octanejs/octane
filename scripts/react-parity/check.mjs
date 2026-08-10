#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	renderCoverageReport,
	validateInventory,
	validateLedger,
	validateUpstreams,
} from './inventory-lib.mjs';
import { verifyHookFormUpstream } from './hook-form-upstream-lib.mjs';
import { verifyHookFormTypes } from './hook-form-types-lib.mjs';
import { verifyPortTestClassifications } from './binding-classifications-lib.mjs';
import { verifyIntersectionObserverTestClassifications } from './intersection-observer-classifications-lib.mjs';
import { verifyIntersectionObserverTypes } from './intersection-observer-types-lib.mjs';
import { verifyIntersectionObserverUpstream } from './intersection-observer-upstream-lib.mjs';
import { verifyLivestoreTestClassifications } from './livestore-classifications-lib.mjs';
import { verifyEmblaCarouselTestClassifications } from './embla-carousel-classifications-lib.mjs';
import { verifyReactTransitionGroupUpstream } from './react-transition-group-upstream-lib.mjs';
import { verifyReactTransitionGroupTypes } from './react-transition-group-types-lib.mjs';
import { verifyReactTransitionGroupTestClassifications } from './react-transition-group-classifications-lib.mjs';
import { verifyLivestoreTypes } from './livestore-types-lib.mjs';
import { verifyZagTestClassifications } from './zag-classifications-lib.mjs';
import { verifyZagTypes } from './zag-types-lib.mjs';
import { verifyZagUpstream } from '../../packages/zag/scripts/verify-upstream.mjs';
import { verifyZagRuntimeCrosswalk } from './zag-runtime-crosswalk.mjs';
import { verifyAlienSignalsTypes } from './alien-signals-types-lib.mjs';
import { verifyAlienSignalsTestClassifications } from './alien-signals-classifications-lib.mjs';
import { verifyAlienSignalsRuntimeStructure } from './alien-signals-runtime-lib.mjs';
import { assertPristineOracleEnvironment } from './alien-signals-pristine-runtime.mjs';
import { verifySolanaReactTypes } from './solana-react-types-lib.mjs';
import { verifyReactSpringUpstream } from './react-spring-upstream-lib.mjs';
import { verifyVaulTestClassifications } from './vaul-classifications-lib.mjs';
import { verifyVaulAdaptedRuntimeStructure } from './vaul-runtime-lib.mjs';
import { verifyVaulUpstream } from './vaul-upstream-lib.mjs';
import { loadManifest, verifyLaneEnvironment, verifyManifestFiles } from './harness-lib.mjs';
import {
	loadManifest,
	requiredExecutableLanes,
	verifyLaneEnvironment,
	verifyManifestFiles,
} from './harness-lib.mjs';
import { verifyDreiTypes } from './drei-types-lib.mjs';
import { loadManifest, verifyLaneEnvironment, verifyManifestFiles } from './harness-lib.mjs';
import { verifyDreiReactParity } from './drei-parity-lib.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUDIT = path.join(REPO, 'packages/octane/audit');
const UPSTREAMS_PATH = path.join(AUDIT, 'react-upstreams.json');
const LEDGER_PATH = path.join(AUDIT, 'react-conformance-ledger.json');
const REPORT_PATH = path.join(REPO, 'docs/react-parity-coverage.md');
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--validate-only')) {
	throw new Error('Usage: check.mjs [--validate-only]');
}
const validateOnly = args[0] === '--validate-only';
const BINDING_MANIFESTS = readdirSync(path.join(REPO, 'packages'), { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => `packages/${entry.name}/audit/react-parity.json`)
	.filter((manifest) => existsSync(path.join(REPO, manifest)))
	.sort();
const HARNESS_PATH = path.join(REPO, 'scripts/react-parity/harness.mjs');
const errors = [];
try {
	verifyHookFormUpstream(REPO);
} catch (error) {
	errors.push(`react-hook-form upstream evidence is invalid: ${error.message}`);
}
try {
	verifyHookFormTypes(REPO);
} catch (error) {
	errors.push(`react-hook-form type evidence is invalid: ${error.message}`);
}
try {
	verifyPortTestClassifications(REPO);
} catch (error) {
	errors.push(`react-hook-form test classifications are invalid: ${error.message}`);
}
try {
	verifyLivestoreTypes(REPO);
} catch (error) {
	errors.push(`livestore type evidence is invalid: ${error.message}`);
}
try {
	verifyAlienSignalsTypes(REPO);
} catch (error) {
	errors.push(`alien-signals type evidence is invalid: ${error.message}`);
}
try {
	verifyAlienSignalsRuntimeStructure(REPO);
} catch (error) {
	errors.push(`alien-signals runtime structure evidence is invalid: ${error.message}`);
}
try {
	assertPristineOracleEnvironment({
		environmentPath: path.join(
			REPO,
			'packages/alien-signals/audit/pristine-oracle-environment.json',
		),
		fromPath: path.join(REPO, 'packages/alien-signals'),
	});
} catch (error) {
	errors.push(`alien-signals pristine oracle environment is invalid: ${error.message}`);
}
try {
	verifyAlienSignalsTestClassifications(REPO);
} catch (error) {
	errors.push(`alien-signals test classifications are invalid: ${error.message}`);
	verifyIntersectionObserverUpstream(REPO);
} catch (error) {
	errors.push(`react-intersection-observer upstream evidence is invalid: ${error.message}`);
}
try {
	verifyIntersectionObserverTypes(REPO);
} catch (error) {
	errors.push(`intersection-observer type evidence is invalid: ${error.message}`);
}
try {
	verifyIntersectionObserverTestClassifications(REPO);
} catch (error) {
	errors.push(`intersection-observer test classifications are invalid: ${error.message}`);
}
try {
	verifySolanaReactTypes(REPO);
} catch (error) {
	errors.push(`@octanejs/solana-react type evidence is invalid: ${error.message}`);
}
try {
	verifyLivestoreTestClassifications(REPO);
} catch (error) {
	errors.push(`livestore test classifications are invalid: ${error.message}`);
}
try {
	verifyReactSpringUpstream(REPO);
} catch (error) {
	errors.push(`react-spring upstream evidence is invalid: ${error.message}`);
}
try {
	verifyZagUpstream(path.join(REPO, 'packages/zag'));
} catch (error) {
	errors.push(`zag upstream evidence is invalid: ${error.message}`);
}
try {
	verifyZagTypes(REPO);
} catch (error) {
	errors.push(`zag type evidence is invalid: ${error.message}`);
}
try {
	verifyZagTestClassifications(REPO);
} catch (error) {
	errors.push(`zag test classifications are invalid: ${error.message}`);
}
try {
	verifyZagRuntimeCrosswalk(REPO);
} catch (error) {
	errors.push(`zag runtime inventory crosswalk is invalid: ${error.message}`);
	verifyEmblaCarouselTestClassifications(REPO);
} catch (error) {
	errors.push(`embla-carousel test classifications are invalid: ${error.message}`);
}
try {
	const { verifyCommittedTypeParity } = await import(
		path.join(REPO, 'packages/embla-carousel/audit/type-parity.mjs')
	);
	await verifyCommittedTypeParity();
} catch (error) {
	errors.push(`embla-carousel type parity is invalid: ${error.message}`);
}
if (!validateOnly) {
	try {
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
		);
	} catch (error) {
		errors.push(`embla-carousel parity negative controls failed: ${error.message}`);
	}
	verifyReactTransitionGroupUpstream(REPO);
} catch (error) {
	errors.push(`react-transition-group upstream evidence is invalid: ${error.message}`);
}
try {
	verifyReactTransitionGroupTypes(REPO);
} catch (error) {
	errors.push(`react-transition-group type evidence is invalid: ${error.message}`);
}
try {
	verifyReactTransitionGroupTestClassifications(REPO);
} catch (error) {
	errors.push(`react-transition-group test classifications are invalid: ${error.message}`);
	verifyVaulUpstream(REPO);
} catch (error) {
	errors.push(`vaul upstream evidence is invalid: ${error.message}`);
}
try {
	verifyVaulTestClassifications(REPO);
} catch (error) {
	errors.push(`vaul test classifications are invalid: ${error.message}`);
}
try {
	verifyVaulAdaptedRuntimeStructure(REPO);
} catch (error) {
	errors.push(`vaul adapted runtime structural evidence is invalid: ${error.message}`);
	verifyDreiReactParity(REPO);
} catch (error) {
	errors.push(`drei React-parity evidence is invalid: ${error.message}`);
}
try {
	verifyDreiTypes(REPO);
} catch (error) {
	errors.push(`drei type evidence is invalid: ${error.message}`);
}
// The home marketing surface was split from a single Home.tsrx into per-section
// .tsrx files, and its benchmark/marketing copy also moved into shared components
// (BenchmarkExplorer, BenchBars, …). Scan both trees so a misleading claim can't
// slip in via a new section or a shared home component.
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
for (const relativeFile of BINDING_MANIFESTS) {
	try {
		const manifest = await loadManifest(path.join(REPO, relativeFile));
		const binding = relativeFile.split('/')[1];
		// Livestore uses adapted-upstream-suite dispositions and its own verifier
		// (verifyLivestoreTestClassifications above). The hook-form helper rejects
		// those ledgers, so never route livestore through verifyPortTestClassifications.
		if (
			binding !== 'livestore' &&
		if (
			binding !== 'hook-form' &&
			existsSync(path.join(REPO, `packages/${binding}/audit/test-classifications.json`))
		) {
			verifyPortTestClassifications(REPO, binding);
		}
		await verifyManifestFiles(manifest, REPO);
		const pnpmVersion = execFileSync('pnpm', ['--version'], { encoding: 'utf8' });
		for (const lane of manifest.lanes) {
			await verifyLaneEnvironment(manifest, lane, REPO, pnpmVersion);
		}
		if (!validateOnly) {
			// Required lanes must execute even when provenance is still
			// recorded-unverified; verification completeness must not suppress them.
			const action = requiredExecutableLanes(manifest).length > 0 ? 'run-required' : 'validate';
			execFileSync(process.execPath, [HARNESS_PATH, action, '--manifest', relativeFile], {
				cwd: REPO,
				stdio: 'inherit',
			});
		}
	} catch (error) {
		errors.push(`${relativeFile} is invalid: ${error.message}`);
	}
}

if (errors.length) {
	console.error(`React parity audit failed:\n  - ${errors.join('\n  - ')}`);
	process.exit(1);
}

console.log(
	`React parity ${validateOnly ? 'metadata' : 'audit'} is current (${loadedInventories
		.map((inventory) => `${inventory.baseline}: ${inventory.summary.concreteCases} cases`)
		.join(', ')}).`,
);
