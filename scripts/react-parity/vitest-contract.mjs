import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

function portablePath(value) {
	return value.replaceAll('\\', '/');
}

function positivePatterns(patterns = []) {
	return patterns.filter((pattern) => typeof pattern === 'string' && !pattern.startsWith('!'));
}

function negativePatterns(patterns = []) {
	return patterns
		.filter((pattern) => typeof pattern === 'string' && pattern.startsWith('!'))
		.map((pattern) => pattern.slice(1));
}

function matches(file, pattern) {
	return path.matchesGlob(portablePath(file), portablePath(pattern));
}

export function projectSelectionFailure(project, file) {
	const include = project.test?.include ?? [];
	const positives = positivePatterns(include);
	if (!positives.some((pattern) => matches(file, pattern))) {
		return `no positive test.include pattern selects it (${positives.join(', ') || 'none'})`;
	}
	const negative = negativePatterns(include).find((pattern) => matches(file, pattern));
	if (negative)
		return `negative test.include pattern ${JSON.stringify(`!${negative}`)} excludes it`;
	const excluded = (project.test?.exclude ?? []).find((pattern) => matches(file, pattern));
	if (excluded) return `test.exclude pattern ${JSON.stringify(excluded)} excludes it`;
	return null;
}

export function projectSelects(project, file) {
	return projectSelectionFailure(project, file) === null;
}

function literalGlobRoot(pattern) {
	const normalized = portablePath(pattern.startsWith('!') ? pattern.slice(1) : pattern);
	if (path.posix.isAbsolute(normalized)) {
		throw new Error(`Vitest include pattern must be repository-relative: ${pattern}`);
	}
	const magicIndex = normalized.search(/[*?\[\]{}()!+@]/);
	if (magicIndex === -1) return normalized;
	const prefix = normalized.slice(0, magicIndex);
	const slash = prefix.endsWith('/') ? prefix.length - 1 : prefix.lastIndexOf('/');
	if (slash <= 0) {
		throw new Error(`Vitest include pattern has no bounded literal root: ${pattern}`);
	}
	return prefix.slice(0, slash);
}

async function walkFiles(target, root, found) {
	let metadata;
	try {
		metadata = await stat(target);
	} catch (error) {
		if (error.code === 'ENOENT') return;
		throw error;
	}
	if (metadata.isFile()) {
		found.add(portablePath(path.relative(root, target)));
		return;
	}
	if (!metadata.isDirectory()) return;
	for (const entry of await readdir(target, { withFileTypes: true })) {
		if (entry.isSymbolicLink()) continue;
		await walkFiles(path.join(target, entry.name), root, found);
	}
}

export async function discoverProjectFiles(project, root) {
	const files = new Set();
	const roots = new Set(
		positivePatterns(project.test?.include).map((pattern) => literalGlobRoot(pattern)),
	);
	for (const declaredRoot of roots) {
		await walkFiles(path.resolve(root, declaredRoot), root, files);
	}
	return new Set([...files].filter((file) => projectSelects(project, file)).sort());
}

function runnerKind(lane) {
	return lane.execution?.kind ?? 'vitest-cases';
}

function isRequiredAvailable(lane) {
	return lane.oracle === 'required' && lane.available !== false;
}

function isVitestLane(lane) {
	return lane.execution === undefined || lane.execution.kind === 'vitest-full';
}

async function loadInventory(lane, root, inventories) {
	let inventory = inventories.get(lane.execution.inventory);
	if (!inventory) {
		inventory = JSON.parse(await readFile(path.resolve(root, lane.execution.inventory), 'utf8'));
		inventories.set(lane.execution.inventory, inventory);
	}
	return inventory;
}

async function laneClaimedFiles(lane, project, root, inventories) {
	switch (runnerKind(lane)) {
		case 'vitest-cases':
			return lane.files.filter((file) => file.role === 'test').map((file) => file.path);
		case 'vitest-full':
			return (await loadInventory(lane, root, inventories)).files;
		case 'typescript':
			return [];
		case 'jest-full':
		case 'playwright-full':
		case 'node-full':
			return project
				? lane.files.map((file) => file.path).filter((file) => projectSelects(project, file))
				: [];
		default:
			throw new Error(`lane ${lane.id} has unsupported execution kind ${runnerKind(lane)}`);
	}
}

async function laneExpectedIdentities(lane, root, inventories) {
	if (lane.execution?.kind === 'vitest-full') {
		return (await loadInventory(lane, root, inventories)).tests.map(({ file, fullName }) => ({
			file,
			fullName,
		}));
	}
	return lane.files.flatMap((file) =>
		file.role === 'test' ? file.cases.map(({ fullName }) => ({ file: file.path, fullName })) : [],
	);
}

function projectMap(projects, label, errors) {
	const result = new Map();
	for (const project of projects) {
		const name = project.test?.name;
		if (typeof name !== 'string' || name.length === 0) {
			errors.push(`${label} contains a project without test.name`);
			continue;
		}
		if (result.has(name)) errors.push(`${label} contains duplicate project name ${name}`);
		else result.set(name, project);
	}
	return result;
}

function laneLabel(entry, lane) {
	return `${entry.path} lane ${lane.id}`;
}

function ownershipSelects(patterns, file) {
	const positives = positivePatterns(patterns);
	return (
		positives.some((pattern) => matches(file, pattern)) &&
		!negativePatterns(patterns).some((pattern) => matches(file, pattern))
	);
}

/**
 * Validate the repository-wide executable contract formed by parity manifests,
 * the live Vitest projects, and the ordinary-shard projection.
 */
export async function validateVitestContracts({
	manifestEntries,
	baseProjects,
	shardedProjects,
	root,
}) {
	const errors = [];
	const projects = projectMap(baseProjects, 'base Vitest config', errors);
	const shards = projectMap(shardedProjects, 'sharded Vitest config', errors);
	const inventories = new Map();
	const claimsByProject = new Map();
	const identityOwners = new Map();
	let requiredVitestLanes = 0;

	for (const entry of manifestEntries) {
		for (const lane of entry.manifest.lanes.filter(isRequiredAvailable)) {
			const project = projects.get(lane.project);
			if (isVitestLane(lane)) {
				requiredVitestLanes++;
				if (!project) {
					errors.push(`${laneLabel(entry, lane)} references missing project ${lane.project}`);
					continue;
				}
				for (const identity of await laneExpectedIdentities(lane, root, inventories)) {
					const key = `${lane.project}\0${identity.file}\0${identity.fullName}`;
					const previous = identityOwners.get(key);
					const owner = laneLabel(entry, lane);
					if (previous && previous !== owner) {
						errors.push(
							`${owner} duplicates Vitest identity already claimed by ${previous}: ` +
								`${lane.project} :: ${identity.file} :: ${identity.fullName}`,
						);
					} else if (!previous) identityOwners.set(key, owner);
				}
			}

			const claimedFiles = await laneClaimedFiles(lane, project, root, inventories);
			if (claimedFiles.length > 0 && !project) {
				errors.push(
					`${laneLabel(entry, lane)} cannot claim files without live project ${lane.project}`,
				);
				continue;
			}
			for (const file of claimedFiles) {
				const selectionFailure = projectSelectionFailure(project, file);
				if (selectionFailure) {
					errors.push(
						`${laneLabel(entry, lane)} project ${lane.project} does not select ${file}: ${selectionFailure}`,
					);
				}
				let claims = claimsByProject.get(lane.project);
				if (!claims) claimsByProject.set(lane.project, (claims = new Map()));
				let owners = claims.get(file);
				if (!owners) claims.set(file, (owners = []));
				owners.push(laneLabel(entry, lane));
			}
		}
	}

	const ownedProjects = [...projects.values()].filter(
		(project) => project.testExecution?.group === 'react-parity',
	);
	for (const project of ownedProjects) {
		const name = project.test.name;
		const selected = await discoverProjectFiles(project, root);
		const ownershipPatterns = project.testExecution.include;
		const owned = ownershipPatterns?.length
			? new Set([...selected].filter((file) => ownershipSelects(ownershipPatterns, file)))
			: selected;
		const claims = claimsByProject.get(name) ?? new Map();

		for (const [file, owners] of claims) {
			if (!owned.has(file)) {
				errors.push(
					`${owners.join(', ')} claims ${file} in project ${name}, but testExecution does not own it`,
				);
			}
		}
		for (const file of owned) {
			if (!claims.has(file)) {
				errors.push(
					`project ${name} testExecution owns ${file}, but no required available lane claims it`,
				);
			}
		}

		const sharded = shards.get(name);
		if (!ownershipPatterns?.length) {
			if (sharded) errors.push(`fully owned project ${name} remains in the sharded Vitest config`);
		} else if (!sharded) {
			errors.push(`scoped owned project ${name} is missing from the sharded Vitest config`);
		} else {
			for (const pattern of ownershipPatterns) {
				if (!(sharded.test?.exclude ?? []).includes(pattern)) {
					errors.push(
						`sharded project ${name} does not exclude ownership pattern ${JSON.stringify(pattern)}`,
					);
				}
			}
		}

		for (const file of owned) {
			for (const candidate of shardedProjects) {
				if (projectSelects(candidate, file)) {
					errors.push(
						`project ${name} testExecution owns ${file}, but sharded project ${candidate.test?.name ?? '<unnamed>'} still selects it`,
					);
				}
			}
		}
	}

	for (const [name, claims] of claimsByProject) {
		const project = projects.get(name);
		if (project?.testExecution?.group === 'react-parity') continue;
		for (const [file, owners] of claims) {
			errors.push(
				`${owners.join(', ')} claims ${file} in project ${name}, but the project is not react-parity owned`,
			);
		}
	}

	for (const project of shardedProjects) {
		if (Object.hasOwn(project, 'testExecution')) {
			errors.push(
				`sharded project ${project.test?.name ?? '<unnamed>'} retains testExecution metadata`,
			);
		}
	}

	if (errors.length > 0) {
		throw new Error(`Vitest parity execution contract failed:\n  - ${errors.join('\n  - ')}`);
	}
	return {
		requiredVitestLanes,
		ownedProjects: ownedProjects.length,
		claimedFiles: [...claimsByProject.values()].reduce((count, claims) => count + claims.size, 0),
		expectedIdentities: identityOwners.size,
	};
}
