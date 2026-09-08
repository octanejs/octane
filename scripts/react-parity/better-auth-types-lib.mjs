import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const TYPE_PARITY_CONFIG = 'packages/better-auth/audit/type-parity.json';

function readJson(root, path) {
	return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function normalizedProbe(source) {
	return source
		.replace("from 'better-auth/react'", "from '#better-auth-framework-client'")
		.replace("from '../../src/index'", "from '#better-auth-framework-client'")
		.replace(/\r\n/g, '\n');
}

function expectErrorGroups(source) {
	return [...source.matchAll(/\/\/\s*@ts-expect-error([^\n]*)\n\s*([^\n]+)/g)].map(
		([, reason, statement]) => `${reason.trim()}:${statement.replace(/\s+/g, ' ').trim()}`,
	);
}

function expectTypeGroups(source) {
	return [...source.matchAll(/expectType(?:<[^;\n]+>)?\([^;\n]+\);/g)].map(([group]) =>
		group.replace(/\s+/g, ' ').trim(),
	);
}

function assertProgramIncludes(root, projectPath, expectedFile) {
	const config = readJson(root, projectPath);
	const include = config.include ?? [];
	if (!include.includes(expectedFile)) {
		throw new Error(`${projectPath} does not include ${expectedFile}`);
	}
}

export function verifyBetterAuthTypes(root = process.cwd()) {
	const config = readJson(root, TYPE_PARITY_CONFIG);
	const pristinePath = `${config.upstreamRoot}/public-api.test-d.ts`;
	const adaptedPath = `${config.adaptedRoot}/public-api.test-d.ts`;
	const pristine = readFileSync(resolve(root, pristinePath), 'utf8');
	const adapted = readFileSync(resolve(root, adaptedPath), 'utf8');
	if (!pristine.includes("from 'better-auth/react'")) {
		throw new Error('pristine Better Auth probe must import better-auth/react');
	}
	if (!adapted.includes("from '../../src/index'")) {
		throw new Error('adapted Better Auth probe must import ../../src/index');
	}

	if (normalizedProbe(pristine) !== normalizedProbe(adapted)) {
		throw new Error('paired Better Auth type probes differ outside the permitted import root');
	}
	const pristineRejects = expectErrorGroups(pristine);
	const adaptedRejects = expectErrorGroups(adapted);
	if (
		pristineRejects.length === 0 ||
		JSON.stringify(pristineRejects) !== JSON.stringify(adaptedRejects)
	) {
		throw new Error('paired Better Auth @ts-expect-error controls differ');
	}
	const pristineAccepts = expectTypeGroups(pristine);
	const adaptedAccepts = expectTypeGroups(adapted);
	if (
		pristineAccepts.length === 0 ||
		JSON.stringify(pristineAccepts) !== JSON.stringify(adaptedAccepts)
	) {
		throw new Error('paired Better Auth expectType assertions differ');
	}

	const pristineInventory = readJson(root, config.inventories.upstream);
	const adaptedInventory = readJson(root, config.inventories.adapted);
	if (
		JSON.stringify(pristineInventory.assertionGroups) !==
		JSON.stringify(adaptedInventory.assertionGroups)
	) {
		throw new Error('Better Auth type assertion-group inventories differ');
	}
	if (!pristineInventory.files.includes(pristinePath)) {
		throw new Error(`pristine inventory omits ${pristinePath}`);
	}
	if (!adaptedInventory.files.includes(adaptedPath)) {
		throw new Error(`adapted inventory omits ${adaptedPath}`);
	}

	assertProgramIncludes(root, config.lanes.pristine.project, 'public-api.test-d.ts');
	assertProgramIncludes(root, config.lanes.adapted.project, 'public-api.test-d.ts');
	return { pristinePath, adaptedPath, accepts: pristineAccepts, rejects: pristineRejects };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
	verifyBetterAuthTypes();
	console.log('Better Auth paired type evidence verified.');
}
