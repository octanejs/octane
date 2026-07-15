#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	renderCoverageReport,
	validateInventory,
	validateLedger,
	validateUpstreams,
} from './inventory-lib.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUDIT = path.join(REPO, 'packages/octane/audit');
const UPSTREAMS_PATH = path.join(AUDIT, 'react-upstreams.json');
const LEDGER_PATH = path.join(AUDIT, 'react-conformance-ledger.json');
const REPORT_PATH = path.join(REPO, 'docs/react-parity-coverage.md');
const errors = [];
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

if (errors.length) {
	console.error(`React parity audit failed:\n  - ${errors.join('\n  - ')}`);
	process.exit(1);
}

console.log(
	`React parity audit is current (${loadedInventories
		.map((inventory) => `${inventory.baseline}: ${inventory.summary.concreteCases} cases`)
		.join(', ')}).`,
);
