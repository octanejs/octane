import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeForReport } from './report-lib.mjs';
import { needsBindingEvidenceRepair, validateBatchManifest } from './state-lib.mjs';

const LEGACY_EVIDENCE_REPAIR =
	'Rerun preflight, then initialize and verify binding evidence before requesting a terminal report.';

export function parseArguments(argv) {
	if (argv[0] === '--') argv = argv.slice(1);
	const options = { workRoot: '.react-port-work' };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === '--batch') options.batch = argv[++index];
		else if (argument === '--work-root') options.workRoot = argv[++index];
		else throw new Error(`Unknown argument: ${argument}`);
	}
	if (!options.batch) throw new Error('Missing required --batch <id>');
	if (!/^[a-z0-9][a-z0-9._-]*$/i.test(options.batch)) {
		throw new Error('--batch requires a path-safe identifier');
	}
	return options;
}

function orderedNodeIds(manifest) {
	const nodeIds = Object.keys(manifest.nodes).sort();
	const persistedOrder = Array.isArray(manifest.executionUnits)
		? manifest.executionUnits.flat()
		: (manifest.executionOrder ?? []);
	const configuredOrder = persistedOrder.filter((nodeId) => Object.hasOwn(manifest.nodes, nodeId));
	const configured = new Set(configuredOrder);
	return [...configuredOrder, ...nodeIds.filter((nodeId) => !configured.has(nodeId))];
}

function buildExecutionLookup(manifest, order) {
	const indexByNode = new Map(order.map((nodeId, index) => [nodeId, index]));
	const unitByNode = new Map();
	for (const [unitIndex, unit] of (manifest.executionUnits ?? []).entries()) {
		for (const nodeId of unit) unitByNode.set(nodeId, { unitIndex, unit: [...unit] });
	}
	return { indexByNode, unitByNode };
}

function executionPosition(nodeId, executionLookup) {
	const index = executionLookup.indexByNode.get(nodeId) ?? -1;
	const configuredUnit = executionLookup.unitByNode.get(nodeId);
	return {
		index,
		unitIndex: configuredUnit?.unitIndex ?? index,
		unit: configuredUnit?.unit ?? [nodeId],
	};
}

function dependencyPacket(manifest, nodeId, executionLookup) {
	const node = manifest.nodes[nodeId];
	if (!node) return { nodeId, missing: true };
	return {
		nodeId,
		packageName: node.packageName ?? node.identity?.packageName ?? null,
		state: node.state,
		disposition: node.disposition ?? null,
		action: node.action ?? null,
		binding: node.binding ?? null,
		bindingDirectory: node.bindingDirectory ?? null,
		requiredSubpaths: [...(node.requiredSubpaths ?? [])],
		vanillaCore: node.vanillaCore ?? null,
		copyPermission: node.copyPermission ?? null,
		reimplementation: node.reimplementation ?? null,
		feasibility: node.feasibility ?? null,
		executionIndex: executionLookup.indexByNode.get(nodeId) ?? -1,
	};
}

function implementationPacket(manifest, node, executionLookup) {
	const dependsOn = [...node.dependsOn];
	return {
		packageName: node.packageName ?? node.identity?.packageName ?? null,
		identity: node.identity ?? null,
		binding: node.binding ?? null,
		bindingDirectory: node.bindingDirectory ?? null,
		constraints: [...(node.constraints ?? [])],
		requiredSubpaths: [...(node.requiredSubpaths ?? [])],
		vanillaCore: node.vanillaCore ?? null,
		dependsOn,
		dependencies: dependsOn.map((nodeId) => dependencyPacket(manifest, nodeId, executionLookup)),
		execution: executionPosition(node.id, executionLookup),
		feasibility: node.feasibility ?? null,
		copyPermission: node.copyPermission ?? null,
		reimplementation: node.reimplementation ?? null,
	};
}

export function terminalBatchReport(manifest) {
	validateBatchManifest(manifest);
	const requested = Object.values(manifest.nodes).filter((node) => node.requested);
	if (requested.length === 0) throw new Error('Batch manifest has no requested targets');
	const order = orderedNodeIds(manifest);
	const executionLookup = buildExecutionLookup(manifest, order);
	const unfinished = order
		.map((nodeId) => manifest.nodes[nodeId])
		.filter((node) => {
			if (needsBindingEvidenceRepair(node)) return true;
			if (node.state === 'ready' || node.state === 'implementing') return true;
			return (
				node.requested &&
				node.state !== 'verified' &&
				node.disposition !== 'satisfied' &&
				(node.disposition !== 'hard-blocked' || node.collisionKind === 'adoptable-binding')
			);
		});
	const nextActions = unfinished.map((node) => {
		if (needsBindingEvidenceRepair(node)) {
			return {
				nodeId: node.id,
				kind: 'repair-evidence',
				action: node.action ?? null,
				...implementationPacket(manifest, node, executionLookup),
				repair: LEGACY_EVIDENCE_REPAIR,
			};
		}
		if (node.disposition === 'pending-intake') {
			return {
				nodeId: node.id,
				kind: 'resolve-intake',
				action: node.action ?? null,
				repair: node.repair ?? 'Complete the node intake and rerun preflight.',
			};
		}
		if (node.collisionKind === 'adoptable-binding') {
			return {
				nodeId: node.id,
				kind: 'resolve-collision',
				action: 'verify-provenance-and-adopt',
				repair:
					node.repair ??
					'Prove the existing package matches the pinned upstream, then rerun preflight with --adopt-binding.',
			};
		}
		if (node.state === 'implementing') {
			const gates = Object.entries(node.evidenceMatrix?.gates ?? {})
				.filter(([, gate]) => !['passed', 'inapplicable'].includes(gate.status))
				.map(([gateId]) => gateId)
				.sort();
			return {
				nodeId: node.id,
				kind: 'complete-evidence',
				action: node.action ?? null,
				...implementationPacket(manifest, node, executionLookup),
				gates,
			};
		}
		return {
			nodeId: node.id,
			kind: 'implement',
			action: node.action ?? null,
			...implementationPacket(manifest, node, executionLookup),
		};
	});
	return sanitizeForReport({
		schemaVersion: 1,
		status: unfinished.length === 0 ? 'terminal' : 'unfinished',
		requested: requested.map((node) => ({
			id: node.id,
			state: node.state,
			disposition:
				node.disposition === 'satisfied'
					? 'satisfied'
					: node.state === 'verified'
						? 'verified'
						: node.disposition,
		})),
		unfinished: unfinished.map((node) => node.id),
		nextActions,
	});
}

function main() {
	try {
		const options = parseArguments(process.argv.slice(2));
		const manifestPath = path.join(options.workRoot, options.batch, 'manifest.json');
		if (!existsSync(manifestPath))
			throw new Error(`Batch manifest does not exist: ${manifestPath}`);
		const report = terminalBatchReport(JSON.parse(readFileSync(manifestPath, 'utf8')));
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		if (report.status !== 'terminal') process.exitCode = 2;
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 2;
	}
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
