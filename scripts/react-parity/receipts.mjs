#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCiLanes, verifyAllReceipts } from './receipts-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const [action = 'verify', ...args] = process.argv.slice(2);

const parsed = { manifests: [], lanesJson: [], json: false };
for (let index = 0; index < args.length; index++) {
	const flag = args[index];
	if (flag === '--json') {
		parsed[flag.slice(2)] = true;
		continue;
	}
	if (flag === '--manifest' || flag === '--lanes-json') {
		if (!args[index + 1] || args[index + 1].startsWith('--'))
			throw new Error(`Missing ${flag} value`);
		parsed[flag === '--manifest' ? 'manifests' : 'lanesJson'].push(args[++index]);
		continue;
	}
	throw new Error(`Unknown flag: ${flag}`);
}

const { manifests, lanesJson, json } = parsed;

if (!['verify', 'run'].includes(action)) {
	throw new Error(
		'Usage: receipts.mjs <verify|run> [--manifest PATH] [--lanes-json JSON] [--json]',
	);
}

if (action === 'verify') {
	if (lanesJson.length > 0 || manifests.length > 0)
		throw new Error('verify does not accept manifest or lane flags');
	const plan = await verifyAllReceipts(root);
	if (json) process.stdout.write(`${JSON.stringify(plan)}\n`);
	else console.log(`React parity receipts are current (${plan.entries.length} pristine lanes).`);
} else {
	if (json || manifests.length !== 1 || lanesJson.length !== 1)
		throw new Error('run requires exactly one --manifest and one --lanes-json');
	const laneIds = JSON.parse(lanesJson[0]);
	if (!Array.isArray(laneIds) || laneIds.some((lane) => typeof lane !== 'string'))
		throw new Error('--lanes-json must be a JSON string array');
	await runCiLanes({ root, manifestPath: manifests[0], laneIds });
}
