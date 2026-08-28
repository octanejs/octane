#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTypeInventories, verifyTypeParity } from './type-parity-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const configPath = 'packages/formisch/audit/type-parity.json';
if (process.argv.includes('--write')) {
	const { config, inventory } = renderTypeInventories(root, configPath);
	for (const side of ['upstream', 'adapted']) {
		const destination = resolve(root, config.inventories[side]);
		mkdirSync(dirname(destination), { recursive: true });
		writeFileSync(destination, `${JSON.stringify(inventory[side], null, 2)}\n`);
	}
}
const result = verifyTypeParity(root, { configPath });
console.log(`Formisch type parity verified (${result.files} files, ${result.groups} groups).`);
