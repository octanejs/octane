#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import {
	buildReactInventory,
	renderCoverageReport,
	stableJson,
	syncLedger,
	validateInventory,
	validateLedger,
	validateUpstreams,
} from './inventory-lib.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUDIT = path.join(REPO, 'packages/octane/audit');
const UPSTREAMS_PATH = path.join(AUDIT, 'react-upstreams.json');
const LEDGER_PATH = path.join(AUDIT, 'react-conformance-ledger.json');
const REPORT_PATH = path.join(REPO, 'docs/react-parity-coverage.md');

async function writeJson(file, value) {
	writeFileSync(
		file,
		await format(stableJson(value), { ...(await resolveConfig(file)), filepath: file }),
	);
}

function option(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? null : process.argv[index + 1];
}

const baseline = option('--baseline');
const reactRoot = option('--react-root');
if (!['stable', 'canary'].includes(baseline) || !reactRoot) {
	console.error(
		'usage: node scripts/react-parity/generate.mjs --baseline <stable|canary> --react-root <react-checkout>',
	);
	process.exit(1);
}

const upstreams = JSON.parse(readFileSync(UPSTREAMS_PATH, 'utf8'));
const upstreamErrors = validateUpstreams(upstreams);
if (upstreamErrors.length) throw new Error(upstreamErrors.join('\n'));

const inventory = buildReactInventory({
	reactRoot: path.resolve(reactRoot),
	baseline,
	upstreams,
});
const inventoryPath = path.join(AUDIT, `react-test-inventory.${baseline}.json`);
await writeJson(inventoryPath, inventory);

const inventories = ['stable', 'canary']
	.map((name) => {
		const file = path.join(AUDIT, `react-test-inventory.${name}.json`);
		return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
	})
	.filter(Boolean);
const ledger = syncLedger(JSON.parse(readFileSync(LEDGER_PATH, 'utf8')), inventories, upstreams);
await writeJson(LEDGER_PATH, ledger);

const currentErrors = validateInventory(inventory, upstreams, baseline);
if (currentErrors.length) throw new Error(currentErrors.join('\n'));
const allInventoryErrors = inventories.flatMap((item) =>
	validateInventory(item, upstreams, item.baseline),
);
const allInventoriesCurrent = inventories.length === 2 && allInventoryErrors.length === 0;
if (allInventoriesCurrent) {
	const ledgerErrors = validateLedger(ledger, inventories, REPO, upstreams);
	if (ledgerErrors.length) throw new Error(ledgerErrors.join('\n'));
}

if (allInventoriesCurrent) {
	writeFileSync(REPORT_PATH, renderCoverageReport({ upstreams, inventories, ledger }));
}

console.log(
	`wrote ${path.relative(REPO, inventoryPath)} (${inventory.summary.suites} suites, ` +
		`${inventory.summary.logicalDeclarations} declarations, minimum ${inventory.summary.minimumRegistrations} registrations)`,
);
if (allInventoriesCurrent) console.log(`wrote ${path.relative(REPO, REPORT_PATH)}`);
else
	console.log(
		'The other baseline inventory is stale or missing; refresh it before checking the ledger/report.',
	);
