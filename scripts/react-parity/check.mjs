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
import { verifyPortTestClassifications } from './hook-form-classifications-lib.mjs';
import { verifyLivestoreTestClassifications } from './livestore-classifications-lib.mjs';
import { verifyLivestoreTypes } from './livestore-types-lib.mjs';
import { verifySolanaReactTypes } from './solana-react-types-lib.mjs';
import { loadManifest, verifyLaneEnvironment, verifyManifestFiles } from './harness-lib.mjs';

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
	verifySolanaReactTypes(REPO);
} catch (error) {
	errors.push(`@octanejs/solana-react type evidence is invalid: ${error.message}`);
}
try {
	verifyLivestoreTestClassifications(REPO);
} catch (error) {
	errors.push(`livestore test classifications are invalid: ${error.message}`);
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
		// hook-form and livestore use dedicated classification verifiers above;
		// the generic disposition set rejects livestore's adapted-upstream-suite.
		if (
			binding !== 'hook-form' &&
			binding !== 'livestore' &&
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
			// Execute every available required lane regardless of verification
			// status. recorded-unverified means incomplete upstream evidence, not
			// "skip registered oracles" — otherwise a failing required lane is inert.
			execFileSync(process.execPath, [HARNESS_PATH, 'run-required', '--manifest', relativeFile], {
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
