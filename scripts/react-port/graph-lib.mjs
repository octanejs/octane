import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { getWorkspacePackages, REPO_ROOT } from '../workspace-packages.mjs';
import { parseInput } from './input-lib.mjs';
import { hasObservablePackageTests } from './package-tests-lib.mjs';
import { fingerprint } from './report-lib.mjs';
import { rangesOverlap, satisfiesRange } from './version-lib.mjs';

export { satisfiesRange } from './version-lib.mjs';

const OCTANE_RUNTIME_PACKAGES = new Set([
	'react',
	'react-dom',
	'react-dom/client',
	'react-dom/server',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
]);

function sortedRecord(record) {
	return Object.fromEntries(
		Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
	);
}

export function manifestExports(manifest) {
	if (!manifest.exports) return manifest.main || manifest.module ? ['.'] : [];
	if (typeof manifest.exports === 'string') return ['.'];
	const keys = Object.keys(manifest.exports);
	return (keys.some((key) => key.startsWith('.')) ? keys : ['.']).sort();
}

export function buildCapabilityInventory({
	bindings,
	workspacePackages = bindings,
	knownBindings,
	knownNativeBindings = [],
	knownVanillaCores,
	reactApiMap,
	octanePublicSourceSha256,
	differencesSha256,
}) {
	const bindingRecord = Object.fromEntries(
		bindings
			.map((binding) => [
				binding.name,
				{
					name: binding.name,
					version: binding.version,
					exports: [...(binding.exports ?? [])].sort(),
					tested: binding.tested === true,
					status: binding.status,
					...(binding.metadataErrors ? { metadataErrors: binding.metadataErrors } : {}),
				},
			])
			.sort(([left], [right]) => left.localeCompare(right)),
	);
	const inventory = {
		schemaVersion: 1,
		workspacePackages: [
			...new Set(workspacePackages.map((workspacePackage) => workspacePackage.name)),
		].sort(),
		workspaceDirectories: [
			...new Set(
				workspacePackages.flatMap((workspacePackage) =>
					workspacePackage.dir ? [`packages/${workspacePackage.dir}`] : [],
				),
			),
		].sort(),
		sourceBindings: sortedRecord(knownBindings),
		nativeBindings: [...knownNativeBindings].sort(),
		vanillaCores: sortedRecord(knownVanillaCores),
		reactApis: sortedRecord(reactApiMap),
		bindings: bindingRecord,
		octanePublicSourceSha256,
		differencesSha256,
	};
	return { ...inventory, fingerprint: fingerprint(inventory) };
}

function hashFile(filePath) {
	return fingerprint(readFileSync(filePath, 'utf8'));
}

// Registrations belong to the inspected checkout. Parse their literal data;
// importing the bridge would execute that checkout's code in the audit process.
function readBridgeRegistrations(repoRoot) {
	const filePath = path.join(repoRoot, 'packages/octane-mcp-server/src/bridge.js');
	const source = ts.createSourceFile(
		filePath,
		readFileSync(filePath, 'utf8'),
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.JS,
	);
	if (source.parseDiagnostics.length) throw new Error(`Cannot parse registrations in ${filePath}`);
	const declarations = new Map();
	for (const statement of source.statements) {
		if (
			!ts.isVariableStatement(statement) ||
			!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
		)
			continue;
		for (const declaration of statement.declarationList.declarations) {
			if (ts.isIdentifier(declaration.name)) {
				declarations.set(declaration.name.text, declaration.initializer);
			}
		}
	}
	function literal(node, name) {
		if (node && ts.isStringLiteral(node)) return node.text;
		if (node?.kind === ts.SyntaxKind.NullKeyword) return null;
		if (node && ts.isArrayLiteralExpression(node)) {
			return node.elements.map((element) => literal(element, name));
		}
		if (node && ts.isObjectLiteralExpression(node)) {
			const entries = node.properties.map((property) => {
				if (
					!ts.isPropertyAssignment(property) ||
					(!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))
				)
					throw new Error(`Expected static registration data for ${name}`);
				return [property.name.text, literal(property.initializer, name)];
			});
			if (new Set(entries.map(([key]) => key)).size !== entries.length) {
				throw new Error(`Duplicate registration in ${name}`);
			}
			return Object.fromEntries(entries);
		}
		throw new Error(`Expected static registration data for ${name}`);
	}
	const result = {};
	for (const name of [
		'KNOWN_BINDINGS',
		'KNOWN_NATIVE_BINDINGS',
		'KNOWN_VANILLA_CORES',
		'REACT_API_MAP',
	]) {
		let initializer = declarations.get(name);
		if (name === 'KNOWN_NATIVE_BINDINGS') {
			if (
				!initializer ||
				!ts.isNewExpression(initializer) ||
				!ts.isIdentifier(initializer.expression) ||
				initializer.expression.text !== 'Set' ||
				initializer.arguments?.length !== 1
			)
				throw new Error(`Expected static Set registration data for ${name}`);
			initializer = initializer.arguments[0];
		}
		result[name] = literal(initializer, name);
	}
	for (const name of ['KNOWN_BINDINGS', 'KNOWN_VANILLA_CORES', 'REACT_API_MAP']) {
		if (!result[name] || Array.isArray(result[name]) || typeof result[name] !== 'object') {
			throw new Error(`Expected registration object for ${name}`);
		}
	}
	if (
		!Array.isArray(result.KNOWN_NATIVE_BINDINGS) ||
		result.KNOWN_NATIVE_BINDINGS.some((value) => typeof value !== 'string')
	) {
		throw new Error('Expected string registrations for KNOWN_NATIVE_BINDINGS');
	}
	for (const name of ['KNOWN_BINDINGS', 'KNOWN_VANILLA_CORES']) {
		if (
			Object.values(result[name]).some(
				(value) => typeof value !== 'string' && !(name === 'KNOWN_VANILLA_CORES' && value === null),
			)
		) {
			throw new Error(`Expected package names in ${name}`);
		}
	}
	return result;
}

export function readRepositoryCapabilityInventory(repoRoot = REPO_ROOT) {
	const workspacePackages = getWorkspacePackages(repoRoot);
	const registrations = readBridgeRegistrations(repoRoot);
	const bindings = workspacePackages
		.filter(
			(workspacePackage) =>
				!workspacePackage.private && workspacePackage.role === 'framework binding',
		)
		.map((binding) => {
			let status = null;
			const metadataErrors = [];
			try {
				status = JSON.parse(readFileSync(binding.statusPath, 'utf8'));
				if (!status || typeof status !== 'object' || Array.isArray(status)) {
					throw new Error('status.json must contain an object');
				}
			} catch (error) {
				status = null;
				metadataErrors.push({
					code: error.code === 'ENOENT' ? 'missing-status' : 'invalid-status',
					path: `packages/${binding.dir}/status.json`,
					message:
						error.code === 'ENOENT' ? `Binding ${binding.name} has no status.json` : error.message,
				});
			}
			return {
				name: binding.name,
				version: binding.version,
				exports: manifestExports(binding.manifest),
				tested:
					typeof binding.manifest.scripts?.test === 'string' &&
					hasObservablePackageTests(binding.directory),
				status,
				...(metadataErrors.length ? { metadataErrors } : {}),
			};
		});
	return buildCapabilityInventory({
		bindings,
		workspacePackages,
		knownBindings: registrations.KNOWN_BINDINGS,
		knownNativeBindings: registrations.KNOWN_NATIVE_BINDINGS,
		knownVanillaCores: registrations.KNOWN_VANILLA_CORES,
		reactApiMap: registrations.REACT_API_MAP,
		octanePublicSourceSha256: hashFile(path.join(repoRoot, 'packages/octane/src/index.ts')),
		differencesSha256: hashFile(path.join(repoRoot, 'docs/differences-from-react.md')),
	});
}

function packageNameFromBlockedTarget(target) {
	if (target.identity?.packageName) return target.identity.packageName;
	const input = String(target.input ?? 'unknown');
	try {
		const parsedInput = parseInput(input);
		if (parsedInput.kind === 'npm') return parsedInput.packageName;
	} catch {
		// Preserve the raw input below when immutable intake failed before parsing completed.
	}
	if (input.startsWith('@')) {
		const separator = input.indexOf('@', input.indexOf('/'));
		return separator === -1 ? input : input.slice(0, separator);
	}
	const separator = input.lastIndexOf('@');
	return separator > 0 ? input.slice(0, separator) : input;
}

function proposedBindingName(packageName) {
	// Keep the classifier's purpose explicit while naming the package for the
	// Octane descriptors it actually inspects.
	if (packageName === 'react-is') return '@octanejs/octane-is';
	const slash = packageName.startsWith('@') ? packageName.indexOf('/') : -1;
	const scope = slash === -1 ? null : packageName.slice(1, slash);
	const unscopedName = slash === -1 ? packageName : packageName.slice(slash + 1);
	const frameworkName = unscopedName.startsWith('react-')
		? unscopedName.slice('react-'.length)
		: unscopedName;
	return `@octanejs/${scope ? `${scope}-` : ''}${frameworkName}`;
}

function assignBinding(node, bindingName) {
	node.binding = bindingName;
	node.bindingDirectory = `packages/${node.binding.slice('@octanejs/'.length)}`;
}

function assignProposedBinding(node) {
	assignBinding(node, proposedBindingName(node.packageName));
}

function blockBindingName(node, reason) {
	node.state = 'blocked';
	node.action = 'binding-name-conflict';
	node.blockers.push(reason);
	node.repair =
		'Resolve the binding name or package-directory ownership collision explicitly, then rerun the union graph.';
}

function applyCleanRoomReimplementation(node) {
	node.state = 'verified';
	node.action = 'reimplement-in-parent';
	node.copyPermission = 'denied-or-unproven';
	node.reimplementation = {
		copySource: false,
		copyTests: false,
		requirement:
			'Re-author only the public behavior used by each dependent and prove it with independently authored differential parity evidence.',
	};
	delete node.feasibility;
	node.blockers = [];
	node.repair = null;
}

function matchingAdoptionEvidence(node, occupiedBinding) {
	const upstream = occupiedBinding?.status?.upstream;
	const approvedSpdx = node.license?.published?.spdx;
	return Boolean(
		upstream?.package === node.packageName &&
		upstream.version === node.version &&
		upstream.commit === node.identity?.commit &&
		upstream.license === approvedSpdx &&
		approvedSpdx &&
		node.license?.source?.spdx === approvedSpdx,
	);
}

const PENDING_INTAKE_ACTIONS = new Set([
	'audit-dependency',
	'preflight-prerequisite',
	'extend-binding',
]);

function isRetryableRemoteFailure(blocker) {
	if (/^Remote request timed out after \d+ms$/.test(blocker)) return true;
	const status = /^Remote request failed with HTTP (\d{3})$/.exec(blocker)?.[1];
	if (!status) return false;
	const statusCode = Number(status);
	return statusCode === 403 || statusCode === 429 || (statusCode >= 500 && statusCode <= 599);
}

function isLicensePolicyBlocker(blocker) {
	return (
		/^(?:Published artifact|Immutable source): (?:The package manifest |The referenced license file |No license file |License evidence )/.test(
			blocker,
		) ||
		/^Published artifact license \S+ does not match immutable source license \S+\.$/.test(blocker)
	);
}

function blockedDisposition(nodeId, nodes, visiting = new Set()) {
	const node = nodes[nodeId];
	if (!node || node.state !== 'blocked') return null;
	if (node.action === 'repair-preflight' && node.blockers.some(isRetryableRemoteFailure)) {
		return 'pending-intake';
	}
	if (
		[
			'binding-name-conflict',
			'feasibility-blocker',
			'repair-preflight',
			'resolve-version-conflict',
		].includes(node.action)
	) {
		return 'hard-blocked';
	}
	if (visiting.has(nodeId)) return null;
	const nextVisiting = new Set(visiting).add(nodeId);
	const dependencyDispositions = node.dependsOn
		.filter((dependencyId) => nodes[dependencyId]?.state === 'blocked')
		.map((dependencyId) => blockedDisposition(dependencyId, nodes, nextVisiting))
		.filter(Boolean);
	if (dependencyDispositions.includes('hard-blocked')) return 'hard-blocked';
	if (
		dependencyDispositions.length > 0 &&
		dependencyDispositions.every((disposition) => disposition === 'pending-intake')
	) {
		return 'pending-intake';
	}
	if (PENDING_INTAKE_ACTIONS.has(node.action)) return 'pending-intake';
	return 'hard-blocked';
}

function requiredSubpathsForDependency(imports, dependencyName) {
	return imports.flatMap((specifier) => {
		if (specifier === dependencyName) return ['.'];
		if (specifier.startsWith(`${dependencyName}/`)) {
			return [`.${specifier.slice(dependencyName.length)}`];
		}
		return [];
	});
}

function existingBindingAssessment(node, inventory) {
	const bindingName = inventory.sourceBindings[node.packageName];
	if (!bindingName) return null;
	const binding = inventory.bindings[bindingName];
	if (!binding) {
		return {
			adequate: false,
			reason: `${bindingName} is registered but missing from the workspace inventory.`,
		};
	}
	if (binding.status?.upstream?.package !== node.packageName) {
		return {
			adequate: false,
			reason: `${bindingName} status targets ${binding.status?.upstream?.package ?? 'no upstream package'}.`,
		};
	}
	// The status date records an audit of the stated scope, not blanket parity.
	if (
		!binding.status.verified ||
		binding.status.verified === 'partial' ||
		binding.status.provenance?.verification === 'recorded-unverified'
	) {
		return { adequate: false, reason: `${bindingName} has not recorded complete verification.` };
	}
	if (!binding.tested) {
		return {
			adequate: false,
			reason: `${bindingName} has no executable observable test evidence.`,
		};
	}
	if (
		!node.constraints.every((constraint) =>
			satisfiesRange(binding.status.upstream.version, constraint.range),
		)
	) {
		return {
			adequate: false,
			reason: `${bindingName} covers ${binding.status.upstream.version}, outside a required version lane.`,
		};
	}
	if (!(node.requiredSubpaths ?? []).every((subpath) => binding.exports.includes(subpath))) {
		return { adequate: false, reason: `${bindingName} does not publish every required subpath.` };
	}
	return { adequate: true, binding };
}

function stronglyConnectedComponents(nodes) {
	let nextIndex = 0;
	const stack = [];
	const indexes = new Map();
	const lowLinks = new Map();
	const onStack = new Set();
	const components = [];

	function visit(id) {
		indexes.set(id, nextIndex);
		lowLinks.set(id, nextIndex);
		nextIndex += 1;
		stack.push(id);
		onStack.add(id);
		for (const dependency of nodes[id].dependsOn) {
			if (!nodes[dependency] || nodes[dependency].state === 'blocked') continue;
			if (!indexes.has(dependency)) {
				visit(dependency);
				lowLinks.set(id, Math.min(lowLinks.get(id), lowLinks.get(dependency)));
			} else if (onStack.has(dependency)) {
				lowLinks.set(id, Math.min(lowLinks.get(id), indexes.get(dependency)));
			}
		}
		if (lowLinks.get(id) !== indexes.get(id)) return;
		const component = [];
		let member;
		do {
			member = stack.pop();
			onStack.delete(member);
			component.push(member);
		} while (member !== id);
		components.push(component.sort());
	}

	for (const id of Object.keys(nodes).sort()) {
		if (nodes[id].state !== 'blocked' && !indexes.has(id)) visit(id);
	}
	return components;
}

function orderComponents(nodes, components) {
	const componentByNode = new Map();
	components.forEach((component, index) =>
		component.forEach((id) => componentByNode.set(id, index)),
	);
	const dependencies = components.map(() => new Set());
	const dependents = components.map(() => new Set());
	components.forEach((component, index) => {
		for (const id of component) {
			for (const dependency of nodes[id].dependsOn) {
				const dependencyComponent = componentByNode.get(dependency);
				if (dependencyComponent === undefined || dependencyComponent === index) continue;
				dependencies[index].add(dependencyComponent);
				dependents[dependencyComponent].add(index);
			}
		}
	});
	const ready = components
		.map((component, index) => ({ component, index }))
		.filter(({ index }) => dependencies[index].size === 0)
		.sort((left, right) => left.component[0].localeCompare(right.component[0]));
	const ordered = [];
	while (ready.length > 0) {
		const current = ready.shift();
		ordered.push(current.component);
		for (const dependent of dependents[current.index]) {
			dependencies[dependent].delete(current.index);
			if (dependencies[dependent].size === 0) {
				ready.push({ component: components[dependent], index: dependent });
				ready.sort((left, right) => left.component[0].localeCompare(right.component[0]));
			}
		}
	}
	return ordered;
}

export function planPortGraph({
	targets,
	inventory,
	dependencyClassifications = {},
	adoptedBindings = [],
}) {
	const nodes = {};
	const targetByPackage = new Map();
	const workspacePackageNames = new Set(
		inventory.workspacePackages ?? Object.keys(inventory.bindings),
	);
	const workspaceDirectories = new Set(inventory.workspaceDirectories ?? []);
	const licensedPackageNames = new Set(
		targets
			.filter((target) => target.status === 'licensed')
			.map((target) => packageNameFromBlockedTarget(target)),
	);

	function ensureNode(packageName) {
		const id = `pkg:${packageName}`;
		if (!nodes[id]) {
			nodes[id] = {
				id,
				packageName,
				constraints: [],
				dependsOn: [],
				requiredSubpaths: [],
				requested: false,
				state: 'classified',
				action: 'audit-dependency',
				blockers: [],
				repair: null,
			};
		}
		return nodes[id];
	}

	for (const target of targets) {
		const packageName = packageNameFromBlockedTarget(target);
		const node = ensureNode(packageName);
		node.requested ||= target.requested !== false;
		const hasLicensedEvidence = licensedPackageNames.has(packageName);
		if (target.status === 'blocked' && target.requested === false && hasLicensedEvidence) {
			continue;
		}
		const providesPrimaryEvidence = target.status === 'licensed' || !hasLicensedEvidence;
		if (providesPrimaryEvidence || !node.input) node.input = target.input;
		if (providesPrimaryEvidence && target.identity?.version) {
			node.constraints.push({ range: target.identity.version, via: packageName });
			node.version = target.identity.version;
			node.identity = target.identity;
			node.license = target.license;
			node.provenance = target.provenance;
			node.upstreamTestInventory = target.upstreamTestInventory ?? [];
			targetByPackage.set(packageName, target);
		}
		if (providesPrimaryEvidence && target.sourceAnalysis) {
			node.feasibility = {
				verdict: target.sourceAnalysis.verdict,
				requiresAdaptation: target.sourceAnalysis.verdict === 'bridgeable-with-rewrites',
				filesScanned: target.sourceAnalysis.filesScanned,
				truncated: target.sourceAnalysis.truncated,
				hazards: target.sourceAnalysis.hazards ?? [],
				classComponents: target.sourceAnalysis.classComponents ?? false,
				apis: target.sourceAnalysis.apis ?? [],
				imports: target.sourceAnalysis.imports ?? [],
				plan: target.sourceAnalysis.plan ?? [],
			};
		}
		if (target.status === 'blocked') {
			node.state = 'blocked';
			node.action = 'repair-preflight';
			node.blockers.push(...(target.blockers ?? ['Target did not pass preflight.']));
			node.repair = target.repair ?? 'Repair identity or approved-license evidence.';
		}
	}

	for (const target of targets) {
		if (target.status !== 'licensed') continue;
		const targetNode = ensureNode(target.identity.packageName);
		for (const [dependencyName, range] of Object.entries(target.runtimeDependencies ?? {}).sort()) {
			if (OCTANE_RUNTIME_PACKAGES.has(dependencyName)) continue;
			const dependencyNode = ensureNode(dependencyName);
			dependencyNode.constraints.push({ range, via: target.identity.packageName });
			dependencyNode.requiredSubpaths.push(
				...requiredSubpathsForDependency(target.sourceAnalysis?.imports ?? [], dependencyName),
			);
			targetNode.dependsOn.push(dependencyNode.id);
		}
	}

	for (const node of Object.values(nodes)) {
		const classification = dependencyClassifications[node.packageName];
		const target = targetByPackage.get(node.packageName);
		node.constraints.sort((left, right) =>
			left.via === right.via
				? left.range.localeCompare(right.range)
				: left.via.localeCompare(right.via),
		);
		node.dependsOn = [...new Set(node.dependsOn)].sort();
		node.requiredSubpaths = [...new Set(node.requiredSubpaths)].sort();
		for (let left = 0; left < node.constraints.length; left += 1) {
			for (let right = left + 1; right < node.constraints.length; right += 1) {
				if (rangesOverlap(node.constraints[left].range, node.constraints[right].range)) continue;
				node.state = 'blocked';
				node.action = 'resolve-version-conflict';
				node.blockers.push(
					`Incompatible version lanes from ${node.constraints[left].via} (${node.constraints[left].range}) and ${node.constraints[right].via} (${node.constraints[right].range}).`,
				);
				node.repair = 'Choose compatible upstream version lanes or split the batch explicitly.';
			}
		}
		if (
			node.state === 'blocked' &&
			!node.requested &&
			node.action === 'repair-preflight' &&
			node.blockers.length > 0 &&
			node.blockers.every(isLicensePolicyBlocker) &&
			['react-coupled', 'reimplemented'].includes(classification)
		) {
			applyCleanRoomReimplementation(node);
		}
		if (node.state === 'blocked') continue;
		if (node.action === 'reimplement-in-parent') continue;

		const reuseNeutralPackage =
			!node.requested &&
			classification === 'framework-neutral' &&
			!node.feasibility?.requiresAdaptation &&
			!node.feasibility?.classComponents &&
			!node.feasibility?.apis?.length &&
			!node.feasibility?.imports?.some((specifier) =>
				/^(?:react|react-dom)(?:\/|$)/.test(specifier),
			);
		const existing = existingBindingAssessment(node, inventory);
		if (existing?.adequate && !reuseNeutralPackage) {
			node.state = 'verified';
			node.action = 'reuse-binding';
			assignBinding(node, existing.binding.name);
			continue;
		}
		if (
			node.feasibility?.truncated ||
			node.feasibility?.verdict === 'needs-rework' ||
			node.feasibility?.hazards.length > 0
		) {
			node.state = 'blocked';
			node.action = 'feasibility-blocker';
			const unsupportedApis = node.feasibility.apis
				.filter((api) => api.status === 'unsupported')
				.map((api) => api.name);
			if (node.feasibility.hazards.length > 0) {
				node.blockers.push(...node.feasibility.hazards);
				node.repair =
					'Route the concrete unsupported React hazard to its owning Octane package before implementation.';
			} else if (node.feasibility.truncated) {
				node.blockers.push('Shipped source exceeded the bounded feasibility scan.');
				node.repair = 'Complete a bounded shipped-source scan before implementation.';
			} else {
				node.blockers.push(
					`Shipped source requires unsupported React API(s): ${unsupportedApis.join(', ') || 'unclassified public surface'}.`,
				);
				node.repair =
					'Route the missing public primitive to its owning Octane package, or add an evidence-backed rewrite classification before implementation.';
			}
			continue;
		}
		// A convenience wrapper does not change the ownership of a proven
		// framework-neutral dependency, including its direct upstream subpaths.
		if (reuseNeutralPackage) {
			node.state = 'verified';
			node.action = 'reuse-package';
			continue;
		}

		if (inventory.sourceBindings[node.packageName]) {
			assignBinding(node, inventory.sourceBindings[node.packageName]);
			node.action =
				adoptedBindings.includes(node.packageName) &&
				matchingAdoptionEvidence(node, inventory.bindings[node.binding])
					? 'adopt-binding'
					: 'extend-binding';
			if (target?.status === 'licensed') {
				node.state = 'ready';
				node.evidenceFingerprint = target.evidenceFingerprint;
			} else {
				node.state = 'blocked';
				node.blockers.push(
					existing?.reason ?? 'Existing binding requires evidence-backed extension.',
				);
				node.repair = `Run approved-license preflight for ${node.packageName}, then extend ${node.binding}.`;
			}
			continue;
		}

		if (!node.requested && classification === 'reimplemented') {
			applyCleanRoomReimplementation(node);
			continue;
		}
		if (classification === 'unsupported') {
			node.state = 'blocked';
			node.action = 'feasibility-blocker';
			node.blockers.push(
				'Dependency requires an unsupported React internal or custom renderer surface.',
			);
			node.repair =
				'Route the missing primitive to its owning Octane package or remove the target.';
			continue;
		}
		if (target?.status === 'licensed') {
			assignProposedBinding(node);
			const occupiedBinding = inventory.bindings[node.binding];
			const occupiedPackageName = workspacePackageNames.has(node.binding);
			const occupiedDirectory = workspaceDirectories.has(node.bindingDirectory);
			const adoptionMatches = matchingAdoptionEvidence(node, occupiedBinding);
			if (adoptionMatches && adoptedBindings.includes(node.packageName)) {
				node.state = 'ready';
				node.action = 'adopt-binding';
				node.evidenceFingerprint = target.evidenceFingerprint;
				continue;
			}
			if (occupiedBinding || occupiedPackageName || occupiedDirectory) {
				blockBindingName(
					node,
					occupiedBinding
						? `${node.binding} already exists for ${occupiedBinding.status?.upstream?.package ?? 'another workspace package'}; ${node.packageName} cannot overwrite it.`
						: occupiedPackageName
							? `${node.binding} already exists as a workspace package; ${node.packageName} cannot overwrite it.`
							: `${node.bindingDirectory} already exists as a workspace package directory; ${node.packageName} cannot overwrite it.`,
				);
				node.collisionKind = adoptionMatches
					? 'adoptable-binding'
					: occupiedBinding
						? 'occupied-binding'
						: 'occupied-workspace-path';
				continue;
			}
			node.state = 'ready';
			node.action = 'create-binding';
			node.evidenceFingerprint = target.evidenceFingerprint;
			node.vanillaCore = inventory.vanillaCores[node.packageName] ?? null;
			continue;
		}
		node.state = 'blocked';
		node.action =
			classification === 'react-coupled' ? 'preflight-prerequisite' : 'audit-dependency';
		node.blockers.push(
			classification === 'react-coupled'
				? 'React-coupled prerequisite has not passed identity and approved-license preflight.'
				: 'Runtime dependency has not been classified from its shipped surface.',
		);
		node.repair =
			classification === 'react-coupled'
				? `Add ${node.packageName} to preflight and rerun the union graph.`
				: 'Inspect effective shipped imports, then classify this dependency as framework-neutral, React-coupled, or unsupported.';
	}

	const createBindings = new Map();
	for (const node of Object.values(nodes)) {
		if (node.state !== 'ready' || node.action !== 'create-binding') continue;
		const owners = createBindings.get(node.binding) ?? [];
		owners.push(node);
		createBindings.set(node.binding, owners);
	}
	for (const [bindingName, owners] of createBindings) {
		if (owners.length < 2) continue;
		const packageNames = owners.map((node) => node.packageName).sort();
		for (const node of owners) {
			blockBindingName(
				node,
				`${bindingName} is the derived binding for multiple upstream packages: ${packageNames.join(', ')}.`,
			);
			node.collisionKind = 'batch-binding-name';
		}
	}

	let changed = true;
	while (changed) {
		changed = false;
		for (const node of Object.values(nodes)) {
			if (node.state === 'blocked') continue;
			const blockedDependencies = node.dependsOn.filter((id) => nodes[id]?.state === 'blocked');
			if (blockedDependencies.length === 0) continue;
			node.state = 'blocked';
			node.blockers.push(`Blocked prerequisite(s): ${blockedDependencies.join(', ')}.`);
			node.repair = 'Repair every named prerequisite, then rebuild the graph.';
			changed = true;
		}
	}

	for (const node of Object.values(nodes)) {
		node.disposition =
			node.state === 'ready'
				? 'actionable'
				: node.state === 'verified'
					? 'satisfied'
					: blockedDisposition(node.id, nodes);
	}

	for (const node of Object.values(nodes)) {
		const bindingCapability = node.binding ? (inventory.bindings[node.binding] ?? null) : null;
		node.nodeFingerprint = fingerprint({
			packageName: node.packageName,
			binding: node.binding ?? null,
			bindingDirectory: node.bindingDirectory ?? null,
			constraints: node.constraints,
			dependsOn: node.dependsOn,
			action: node.action,
			bindingCapability,
			vanillaCore: node.vanillaCore ?? null,
			octanePublicSourceSha256: inventory.octanePublicSourceSha256,
			differencesSha256: inventory.differencesSha256,
			requiredSubpaths: node.requiredSubpaths,
			reactApis: node.action === 'reuse-package' ? null : inventory.reactApis,
			feasibility: node.feasibility ?? null,
			copyPermission: node.copyPermission ?? null,
			reimplementation: node.reimplementation ?? null,
			identity: node.identity ?? null,
			license: node.license ?? null,
			provenance: node.provenance ?? null,
			upstreamTestInventory: node.upstreamTestInventory ?? null,
			blockers: node.blockers,
		});
		node.evidenceFingerprint ??= node.nodeFingerprint;
	}

	const orderedNodes = Object.fromEntries(
		Object.entries(nodes).sort(([left], [right]) => left.localeCompare(right)),
	);
	const executionUnits = orderComponents(orderedNodes, stronglyConnectedComponents(orderedNodes));
	const actionableNodes = Object.fromEntries(
		Object.entries(orderedNodes).filter(([, node]) => node.disposition === 'actionable'),
	);
	const actionableExecutionUnits = orderComponents(
		actionableNodes,
		stronglyConnectedComponents(actionableNodes),
	);
	const requestedSummary = {
		actionable: [],
		pendingIntake: [],
		hardBlocked: [],
		satisfied: [],
	};
	for (const node of Object.values(orderedNodes)) {
		if (!node.requested) continue;
		if (node.disposition === 'actionable') requestedSummary.actionable.push(node.id);
		if (node.disposition === 'pending-intake') requestedSummary.pendingIntake.push(node.id);
		if (node.disposition === 'hard-blocked') requestedSummary.hardBlocked.push(node.id);
		if (node.disposition === 'satisfied') requestedSummary.satisfied.push(node.id);
	}
	return {
		schemaVersion: 1,
		inventoryFingerprint: inventory.fingerprint,
		nodes: orderedNodes,
		executionUnits,
		actionableExecutionUnits,
		executionOrder: executionUnits.flat(),
		requestedSummary,
		fingerprint: fingerprint({
			inventoryFingerprint: inventory.fingerprint,
			nodes: orderedNodes,
			executionUnits,
		}),
	};
}
