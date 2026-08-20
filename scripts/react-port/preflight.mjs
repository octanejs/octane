#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRemoteInput, runPreflight, sanitizeForReport } from './preflight-lib.mjs';
import { planPortGraph, readRepositoryCapabilityInventory } from './graph-lib.mjs';
import {
	acquireBatchLock,
	captureWorktreeBaseline,
	createBatchManifest,
	reconcileBatchManifest,
	releaseBatchLock,
	writeManifestAtomically,
} from './state-lib.mjs';

function usage() {
	return `Usage: node scripts/react-port/preflight.mjs [options] <package-or-url> [...]

Resolve one or more public npm/GitHub inputs, verify immutable provenance, and
enforce Octane's approved-license policy (MIT, Unlicense, BSD-3-Clause,
Apache-2.0) before binding writes.

Options:
  --prerequisite <input>     Add a discovered prerequisite without marking it requested
  --classify <package=kind>  Classify a dependency as framework-neutral,
                             react-coupled, reimplemented, or unsupported (repeatable)
  --adopt-binding <package>  Adopt matching partial binding work after provenance review
  --batch <id>               Use a stable batch identifier (derived by default)
  --work-root <directory>    Store state below this directory (default: .react-port-work)
  --recover-stale-lock       Explicitly recover a lock older than 30 minutes
  --no-state                 Print a report without writing resumable state
  -h, --help                 Show this help
`;
}

function parseArguments(arguments_) {
	if (arguments_[0] === '--') arguments_ = arguments_.slice(1);
	const inputs = [];
	const prerequisiteInputs = [];
	let batchId = null;
	let workRoot = path.join(process.cwd(), '.react-port-work');
	let noState = false;
	let recoverStaleLock = false;
	const dependencyClassifications = {};
	const adoptedBindings = [];
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument === '-h' || argument === '--help') {
			return {
				help: true,
				inputs,
				prerequisiteInputs,
				batchId,
				workRoot,
				noState,
				recoverStaleLock,
				dependencyClassifications,
			};
		}
		if (argument === '--prerequisite') {
			const prerequisite = arguments_[index + 1];
			if (!prerequisite) throw new Error('--prerequisite requires a package input');
			prerequisiteInputs.push(prerequisite);
			index += 1;
			continue;
		}
		if (argument === '--classify') {
			const classification = arguments_[index + 1];
			const separator = classification?.lastIndexOf('=') ?? -1;
			const packageName = separator > 0 ? classification.slice(0, separator) : '';
			const kind = separator > 0 ? classification.slice(separator + 1) : '';
			if (
				!packageName ||
				!['framework-neutral', 'react-coupled', 'reimplemented', 'unsupported'].includes(kind)
			) {
				throw new Error(
					'--classify requires package=framework-neutral|react-coupled|reimplemented|unsupported',
				);
			}
			dependencyClassifications[packageName] = kind;
			index += 1;
			continue;
		}
		if (argument === '--adopt-binding') {
			const packageName = arguments_[index + 1];
			if (!packageName) throw new Error('--adopt-binding requires a package name');
			adoptedBindings.push(packageName);
			index += 1;
			continue;
		}
		if (argument === '--batch') {
			batchId = arguments_[index + 1];
			if (!batchId || !/^[a-z0-9][a-z0-9._-]*$/i.test(batchId)) {
				throw new Error('--batch requires a path-safe identifier');
			}
			index += 1;
			continue;
		}
		if (argument === '--work-root') {
			if (!arguments_[index + 1]) throw new Error('--work-root requires a directory');
			workRoot = path.resolve(arguments_[index + 1]);
			index += 1;
			continue;
		}
		if (argument === '--recover-stale-lock') {
			recoverStaleLock = true;
			continue;
		}
		if (argument === '--no-state') {
			noState = true;
			continue;
		}
		if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
		inputs.push(argument);
	}
	return {
		help: false,
		inputs,
		prerequisiteInputs,
		batchId,
		workRoot,
		noState,
		recoverStaleLock,
		dependencyClassifications,
		adoptedBindings,
	};
}

export async function main({
	argumentsList = process.argv.slice(2),
	resolve = (parsedInput, rawInput) =>
		resolveRemoteInput(parsedInput, rawInput, {
			githubToken: process.env.GITHUB_TOKEN,
			npmToken: process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN,
		}),
} = {}) {
	let parsedArguments;
	try {
		parsedArguments = parseArguments(argumentsList);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
		process.exitCode = 2;
		return;
	}
	if (parsedArguments.help) {
		process.stdout.write(usage());
		return;
	}
	if (parsedArguments.inputs.length === 0) {
		process.stderr.write(usage());
		process.exitCode = 2;
		return;
	}

	const report = await runPreflight({
		inputs: [...parsedArguments.inputs, ...parsedArguments.prerequisiteInputs],
		resolve,
	});
	for (const [index, target] of report.targets.entries()) {
		target.requested = index < parsedArguments.inputs.length;
	}
	const inventory = readRepositoryCapabilityInventory();
	const graph = planPortGraph({
		targets: report.targets,
		inventory,
		dependencyClassifications: parsedArguments.dependencyClassifications,
		adoptedBindings: parsedArguments.adoptedBindings,
	});
	report.capabilityInventory = {
		fingerprint: inventory.fingerprint,
		bindingCount: Object.keys(inventory.bindings).length,
		knownReactPackageCount: Object.keys(inventory.sourceBindings).length,
		knownVanillaCoreCount: Object.keys(inventory.vanillaCores).length,
		reactApiCount: Object.keys(inventory.reactApis).length,
	};
	report.graph = graph;
	report.preflightStatus = report.status;
	const { actionable, hardBlocked, pendingIntake, satisfied } = graph.requestedSummary;
	const requestedCount =
		actionable.length + hardBlocked.length + pendingIntake.length + satisfied.length;
	report.status =
		hardBlocked.length === requestedCount
			? 'blocked'
			: pendingIntake.length === requestedCount
				? 'pending-intake'
				: hardBlocked.length > 0 || pendingIntake.length > 0
					? 'partial'
					: 'passed';

	if (!parsedArguments.noState) {
		const batchId = parsedArguments.batchId ?? `port-${graph.fingerprint.slice(0, 12)}`;
		const batchDirectory = path.join(parsedArguments.workRoot, batchId);
		let lock;
		try {
			lock = await acquireBatchLock(batchDirectory, {
				owner: `preflight-${process.pid}`,
				allowStaleRecovery: parsedArguments.recoverStaleLock,
			});
			const nextManifest = createBatchManifest({
				batchId,
				workspaceRoot: process.cwd(),
				inventoryFingerprint: inventory.fingerprint,
				graphFingerprint: graph.fingerprint,
				nodes: graph.nodes,
				executionUnits: graph.executionUnits,
				actionableExecutionUnits: graph.actionableExecutionUnits,
				executionOrder: graph.executionOrder,
				baseline: captureWorktreeBaseline(
					process.cwd(),
					Object.values(graph.nodes)
						.map((node) => node.bindingDirectory)
						.filter(Boolean),
				),
			});
			const manifestPath = path.join(batchDirectory, 'manifest.json');
			const manifest = existsSync(manifestPath)
				? reconcileBatchManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), nextManifest)
				: nextManifest;
			await writeManifestAtomically(batchDirectory, manifest, { owner: lock.owner });
			report.batch = {
				batchId,
				resume: manifest.resume ?? { invalidated: [], preserved: [] },
			};
		} catch (error) {
			report.batch = {
				batchId,
				status: 'blocked',
				blockers: [sanitizeForReport(error instanceof Error ? error.message : String(error))],
				repair: 'Resolve the state-directory or one-writer lock problem, then rerun preflight.',
			};
			process.exitCode = 2;
		} finally {
			if (lock) await releaseBatchLock(lock);
		}
	}

	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	if (report.status === 'blocked') process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await main();
}
