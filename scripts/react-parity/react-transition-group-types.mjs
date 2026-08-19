#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	renderTypeInventories,
	verifyReactTransitionGroupTypes,
} from './react-transition-group-types-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
if (process.argv.includes('--write')) {
	const { config, inventory } = renderTypeInventories(root);
	for (const side of ['upstream', 'adapted']) {
		const destination = resolve(root, config.inventories[side]);
		mkdirSync(dirname(destination), { recursive: true });
		writeFileSync(destination, `${JSON.stringify(inventory[side], null, 2)}\n`);
	}
}
const result = verifyReactTransitionGroupTypes(root);
console.log(
	`react-transition-group type parity verified (${result.files} files, ${result.assertions} assertion groups).`,
);
