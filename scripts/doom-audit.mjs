#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const classifications = new Set(['unchanged', 'mechanically-transformed', 'owned-divergence']);
const evidenceKinds = new Set(['browser', 'unit', 'manual', 'divergence']);
const scenarioLinkedKinds = new Set(['browser', 'unit']);
const scenarioFiles = [
	'playground/octane/tests/doom/doom-production.test.ts',
	'playground/octane/src/demos/doom/model.test.ts',
];

function requireText(value, label) {
	if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
}

function uniqueIds(entries, label) {
	const ids = new Set();
	for (const entry of entries) {
		requireText(entry.id, `${label} id`);
		if (ids.has(entry.id)) throw new Error(`duplicate ${label} id ${entry.id}`);
		ids.add(entry.id);
	}
}

export function loadDoomScenarioNames(root) {
	const names = new Set();
	const pattern = /\bit\(\s*(['"`])([\s\S]*?)\1/g;
	for (const relativePath of scenarioFiles) {
		const filePath = resolve(root, relativePath);
		if (!existsSync(filePath)) {
			throw new Error(`missing Doom scenario suite ${relativePath}`);
		}
		const source = readFileSync(filePath, 'utf8');
		pattern.lastIndex = 0;
		let match;
		while ((match = pattern.exec(source)) !== null) {
			names.add(match[2]);
		}
	}
	if (names.size === 0) throw new Error('Doom scenario suites expose no it(...) titles');
	return names;
}

export function validateDoomAudit(audit, options = {}) {
	if (!audit || typeof audit !== 'object') throw new Error('audit must be an object');
	requireText(audit.provenance?.repository, 'provenance repository');
	if (!/^[a-f0-9]{40}$/.test(audit.provenance?.commit ?? '')) {
		throw new Error('provenance commit must be a full SHA');
	}
	if (audit.provenance.license !== 'NOASSERTION' || audit.provenance.vendored !== false) {
		throw new Error('unlicensed oracle must remain external and unvendored');
	}
	const roles = audit.attestations ?? {};
	for (const role of ['oracleResearcher', 'migrationImplementer', 'reviewer']) {
		requireText(roles[role], `attestation ${role}`);
	}
	if (roles.oracleResearcher === roles.migrationImplementer) {
		throw new Error('oracle researcher and migration implementer must be isolated');
	}
	if (!Array.isArray(audit.behaviors) || audit.behaviors.length === 0) {
		throw new Error('audit needs at least one behavior');
	}
	uniqueIds(audit.behaviors, 'behavior');
	const scenarioNames =
		options.scenarioNames instanceof Set
			? options.scenarioNames
			: options.root
				? loadDoomScenarioNames(options.root)
				: null;
	for (const behavior of audit.behaviors) {
		requireText(behavior.observation, `behavior ${behavior.id} observation`);
		if (!Array.isArray(behavior.evidence))
			throw new Error(`behavior ${behavior.id} evidence must be an array`);
		if (behavior.required && behavior.evidence.length === 0) {
			throw new Error(`required behavior ${behavior.id} has no evidence`);
		}
		for (const evidence of behavior.evidence) {
			if (!evidenceKinds.has(evidence.kind)) {
				throw new Error(`behavior ${behavior.id} has invalid evidence kind`);
			}
			requireText(evidence.target, `behavior ${behavior.id} evidence target`);
			if (
				scenarioNames &&
				scenarioLinkedKinds.has(evidence.kind) &&
				!scenarioNames.has(evidence.target)
			) {
				throw new Error(
					`behavior ${behavior.id} evidence target ${JSON.stringify(evidence.target)} is not an exact Doom suite scenario`,
				);
			}
		}
	}
	if (!Array.isArray(audit.constructs) || audit.constructs.length === 0) {
		throw new Error('audit needs at least one construct mapping');
	}
	uniqueIds(audit.constructs, 'construct');
	for (const construct of audit.constructs) {
		requireText(construct.family, `construct ${construct.id} family`);
		if (!classifications.has(construct.classification)) {
			throw new Error(`construct ${construct.id} has invalid classification`);
		}
		requireText(construct.evidence, `construct ${construct.id} evidence`);
	}
	if (!Array.isArray(audit.assets) || audit.assets.length === 0) {
		throw new Error('audit needs at least one asset mapping');
	}
	uniqueIds(audit.assets, 'asset');
	for (const asset of audit.assets) {
		for (const key of ['path', 'sha256', 'kind', 'license', 'creator', 'role']) {
			requireText(asset[key], `asset ${asset.id} ${key}`);
		}
		if (!/^[a-f0-9]{64}$/.test(asset.sha256)) {
			throw new Error(`asset ${asset.id} sha256 must be a full digest`);
		}
		if (asset.license === 'NOASSERTION') {
			throw new Error(`asset ${asset.id} lacks redistribution permission`);
		}
		if (options.root) {
			const assetPath = resolve(options.root, asset.path);
			if (!existsSync(assetPath))
				throw new Error(`asset ${asset.id} is missing from ${asset.path}`);
			const digest = createHash('sha256').update(readFileSync(assetPath)).digest('hex');
			if (digest !== asset.sha256) throw new Error(`asset ${asset.id} checksum does not match`);
		}
	}
	return audit;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
	const auditPath = resolve(root, 'playground/octane/doom-audit/audit.json');
	validateDoomAudit(JSON.parse(readFileSync(auditPath, 'utf8')), { root });
	console.log('Doom clean-room completeness audit is valid.');
}
