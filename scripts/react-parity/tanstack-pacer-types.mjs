#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTypeScriptCompilerArgv, loadManifest } from './harness-lib.mjs';
import { renderTypeInventories, verifyTanstackPacerTypes } from './tanstack-pacer-types-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
if (process.argv.includes('--write')) {
	const { config, inventory } = renderTypeInventories(root);
	const sides = [
		['upstream', 'pristine'],
		['adapted', 'adapted'],
	];
	for (const [inventoryKey, configKey] of sides) {
		const destination = resolve(root, config.inventories[configKey]);
		mkdirSync(dirname(destination), { recursive: true });
		writeFileSync(destination, `${JSON.stringify(inventory[inventoryKey], null, 2)}\n`);
	}
}
const result = verifyTanstackPacerTypes(root);
const manifest = await loadManifest(
	resolve(root, 'packages/tanstack-pacer/audit/react-parity.json'),
);
const typeLanes = manifest.lanes.filter(function keepTypeLane(lane) {
	return lane.oracle === 'required' && lane.available !== false && lane.type.endsWith('-types');
});
for (const lane of typeLanes) {
	const [command, ...args] = buildTypeScriptCompilerArgv(
		lane.execution.compiler,
		lane.execution.project,
	);
	execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}
console.log(
	`tanstack-pacer type parity verified (${result.files} upstream files, ${result.adaptedFiles} adapted files, ${result.assertions} assertion groups; ${typeLanes
		.map(function describe(lane) {
			return `${lane.id}=${lane.execution.compiler}`;
		})
		.join(', ')}).`,
);
