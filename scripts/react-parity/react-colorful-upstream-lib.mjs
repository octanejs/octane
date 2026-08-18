import { resolve } from 'node:path';
import {
	buildInventory,
	compareInventories,
	validate,
} from '../../packages/colorful/audit/upstream-inventory.mjs';

const PACKAGE_ROOT = 'packages/colorful';

export async function verifyReactColorfulUpstream(repoRoot) {
	const root = resolve(repoRoot, PACKAGE_ROOT);
	const inventory = await validate(root);
	return {
		artifacts: inventory.artifacts.length,
		upstreamCases: inventory.upstreamCases.length,
	};
}

export { buildInventory, compareInventories, validate };
