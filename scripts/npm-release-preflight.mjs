import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { getPublishablePackages } from './workspace-packages.mjs';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';
const DEFAULT_CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 15_000;

function parseSemver(version) {
	const match =
		/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
			version,
		);
	if (!match) throw new Error(`invalid semantic version ${JSON.stringify(version)}`);
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4]?.split('.') ?? [],
	};
}

function comparePrerelease(left, right) {
	if (left.length === 0 || right.length === 0) {
		if (left.length === right.length) return 0;
		return left.length === 0 ? 1 : -1;
	}
	const length = Math.max(left.length, right.length);
	for (let index = 0; index < length; index++) {
		const leftPart = left[index];
		const rightPart = right[index];
		if (leftPart === undefined) return -1;
		if (rightPart === undefined) return 1;
		if (leftPart === rightPart) continue;

		const leftNumeric = /^(?:0|[1-9]\d*)$/.test(leftPart);
		const rightNumeric = /^(?:0|[1-9]\d*)$/.test(rightPart);
		if (leftNumeric && rightNumeric) return Number(leftPart) < Number(rightPart) ? -1 : 1;
		if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
		return leftPart < rightPart ? -1 : 1;
	}
	return 0;
}

export function compareSemver(leftVersion, rightVersion) {
	const left = parseSemver(leftVersion);
	const right = parseSemver(rightVersion);
	for (const field of ['major', 'minor', 'patch']) {
		if (left[field] !== right[field]) return left[field] < right[field] ? -1 : 1;
	}
	return comparePrerelease(left.prerelease, right.prerelease);
}

function registryPackageUrl(registry, packageName) {
	return new URL(encodeURIComponent(packageName), registry).href;
}

async function inspectPackage(pkg, fetchImpl, registry) {
	let response;
	try {
		response = await fetchImpl(registryPackageUrl(registry, pkg.name), {
			headers: { accept: 'application/vnd.npm.install-v1+json' },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	} catch (error) {
		return {
			...pkg,
			state: 'unreachable',
			reason: error instanceof Error ? error.message : String(error),
		};
	}

	if (response.status === 404) return { ...pkg, state: 'unbootstrapped' };
	if (!response.ok) {
		return {
			...pkg,
			state: 'unreachable',
			reason: `registry returned HTTP ${response.status}`,
		};
	}

	let metadata;
	try {
		metadata = await response.json();
	} catch (error) {
		return {
			...pkg,
			state: 'unreachable',
			reason: `registry returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	if (Object.hasOwn(metadata.versions ?? {}, pkg.version)) {
		return { ...pkg, state: 'published' };
	}

	const latest = metadata['dist-tags']?.latest;
	if (typeof latest !== 'string') {
		return { ...pkg, state: 'invalid', reason: 'registry metadata has no latest dist-tag' };
	}

	let comparison;
	try {
		comparison = compareSemver(pkg.version, latest);
	} catch (error) {
		return {
			...pkg,
			state: 'invalid',
			reason: error instanceof Error ? error.message : String(error),
		};
	}
	if (comparison <= 0) {
		return {
			...pkg,
			state: 'invalid',
			reason: `local version is absent while npm latest is ${latest}`,
		};
	}
	return { ...pkg, state: 'pending', latest };
}

async function mapWithConcurrency(values, concurrency, callback) {
	const results = new Array(values.length);
	let nextIndex = 0;
	async function worker() {
		while (nextIndex < values.length) {
			const index = nextIndex++;
			results[index] = await callback(values[index]);
		}
	}
	const workerCount = Math.min(concurrency, values.length);
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

export async function inspectNpmReleaseState(
	packages,
	{ concurrency = DEFAULT_CONCURRENCY, fetchImpl = fetch, registry = DEFAULT_REGISTRY } = {},
) {
	if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
		throw new Error(`concurrency must be a positive integer, received ${concurrency}`);
	}
	const normalizedRegistry = registry.endsWith('/') ? registry : `${registry}/`;
	const identities = packages
		.map(({ name, version }) => ({ name, version }))
		.sort((left, right) => left.name.localeCompare(right.name));
	const results = await mapWithConcurrency(identities, concurrency, (pkg) =>
		inspectPackage(pkg, fetchImpl, normalizedRegistry),
	);

	return {
		published: results.filter((entry) => entry.state === 'published'),
		pending: results.filter((entry) => entry.state === 'pending'),
		unbootstrapped: results.filter((entry) => entry.state === 'unbootstrapped'),
		invalid: results.filter((entry) => entry.state === 'invalid'),
		unreachable: results.filter((entry) => entry.state === 'unreachable'),
	};
}

function identity(pkg) {
	return `${pkg.name}@${pkg.version}`;
}

export function releaseStateErrors(state) {
	const errors = [];
	if (state.unbootstrapped.length > 0) {
		errors.push(
			`npm packages require one-time bootstrap before trusted publishing:\n${state.unbootstrapped
				.map((pkg) => `  - ${identity(pkg)}`)
				.join('\n')}\nFollow docs/releases.md, then rerun this workflow.`,
		);
	}
	for (const pkg of state.invalid) {
		errors.push(`${identity(pkg)} cannot be published safely: ${pkg.reason}`);
	}
	for (const pkg of state.unreachable) {
		errors.push(`${identity(pkg)} could not be checked: ${pkg.reason}`);
	}
	return errors;
}

export function renderReleaseSummary(state) {
	const lines = [
		'## npm release preflight',
		'',
		`- Already published: ${state.published.length}`,
		`- Ready to publish: ${state.pending.length}`,
		`- Require bootstrap: ${state.unbootstrapped.length}`,
		`- Invalid release state: ${state.invalid.length}`,
		`- Registry errors: ${state.unreachable.length}`,
	];
	for (const [label, packages] of [
		['Ready to publish', state.pending],
		['Require bootstrap', state.unbootstrapped],
	]) {
		if (packages.length === 0) continue;
		lines.push('', `### ${label}`, '', ...packages.map((pkg) => `- \`${identity(pkg)}\``));
	}
	return `${lines.join('\n')}\n`;
}

async function runCli() {
	const state = await inspectNpmReleaseState(getPublishablePackages());
	const errors = releaseStateErrors(state);
	const needsPublish = errors.length === 0 && state.pending.length > 0;
	const summary = renderReleaseSummary(state);

	process.stdout.write(summary);
	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(process.env.GITHUB_OUTPUT, `needs_publish=${needsPublish}\n`);
	}
	if (process.env.GITHUB_STEP_SUMMARY) {
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
	}
	if (errors.length > 0) {
		for (const error of errors) console.error(`\n${error}`);
		process.exitCode = 1;
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
