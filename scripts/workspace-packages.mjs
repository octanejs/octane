import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PACKAGES_ROOT = path.join(REPO_ROOT, 'packages');
export const INVENTORY_PATH = path.join(REPO_ROOT, 'docs/packages.md');

const SPECIAL_ROLES = new Map([
	['octane', 'core runtime + compiler'],
	['@octanejs/app-core', 'metaframework core'],
	['@octanejs/rspack-plugin', 'compiler integration'],
	['@octanejs/rspeedy-plugin', 'native compiler integration'],
	['@octanejs/rsbuild-plugin', 'metaframework'],
	['@octanejs/vite-plugin', 'metaframework'],
	// TanStack Start is a metaframework integration rather than a library
	// binding, so it stays outside the binding status/catalog contract.
	['@octanejs/tanstack-start', 'metaframework'],
	['@octanejs/mcp-server', 'agent tooling'],
	['@octanejs/evals', 'evaluation tooling'],
	['octane-vscode', 'editor tooling'],
]);

const OCTANE_SINGLETON_CONSUMERS = new Set([
	'@octanejs/app-core',
	'@octanejs/rspack-plugin',
	'@octanejs/rspeedy-plugin',
	'@octanejs/rsbuild-plugin',
	'@octanejs/tanstack-start',
	'@octanejs/vite-plugin',
]);

function readJson(file) {
	return JSON.parse(readFileSync(file, 'utf8'));
}

function roleFor(manifest) {
	const special = SPECIAL_ROLES.get(manifest.name);
	if (special) return special;
	if (manifest.name?.startsWith('@octanejs/adapter-')) return 'deployment adapter';
	if (manifest.name?.startsWith('@octanejs/')) return 'framework binding';
	return 'other package';
}

/**
 * Return every direct package under packages/, ordered by package name. This is
 * the canonical repository-package discovery path used by inventory, status,
 * parity, and pack checks; callers must not keep a second directory list.
 */
export function getWorkspacePackages() {
	return readdirSync(PACKAGES_ROOT, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.flatMap((entry) => {
			const directory = path.join(PACKAGES_ROOT, entry.name);
			const manifestPath = path.join(directory, 'package.json');
			if (!existsSync(manifestPath)) return [];
			const manifest = readJson(manifestPath);
			return [
				{
					dir: entry.name,
					directory,
					manifestPath,
					statusPath: path.join(directory, 'status.json'),
					manifest,
					name: manifest.name,
					version: manifest.version,
					private: manifest.private === true,
					role: roleFor(manifest),
				},
			];
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function getPublishablePackages() {
	return getWorkspacePackages().filter((pkg) => !pkg.private);
}

export function getBindingPackages() {
	return getPublishablePackages().filter((pkg) => pkg.role === 'framework binding');
}

export function validateWorkspacePackages(packages = getWorkspacePackages()) {
	const errors = [];
	const names = new Set();
	const rootManifest = readJson(path.join(REPO_ROOT, 'package.json'));
	if (rootManifest.engines?.node !== '>=22') {
		errors.push('root package.json must declare engines.node ">=22"');
	}

	for (const pkg of packages) {
		const label = `packages/${pkg.dir}`;
		if (!pkg.name) errors.push(`${label}/package.json has no name`);
		else if (names.has(pkg.name)) errors.push(`duplicate package name: ${pkg.name}`);
		else names.add(pkg.name);

		if (!pkg.private) {
			if (!pkg.version) errors.push(`${label} is publishable but has no version`);
			if (pkg.manifest.engines?.node !== '>=22') {
				errors.push(`${label} must declare engines.node ">=22"`);
			}
			if (pkg.manifest.publishConfig?.access !== 'public') {
				errors.push(`${label} is publishable but publishConfig.access is not "public"`);
			}

			if (pkg.manifest.repository?.directory !== `packages/${pkg.dir}`) {
				errors.push(
					`${label} repository.directory must be "packages/${pkg.dir}" (received ${JSON.stringify(pkg.manifest.repository?.directory)})`,
				);
			}
		}

		if (pkg.role === 'framework binding' && !existsSync(pkg.statusPath)) {
			errors.push(`${label} (${pkg.name}) is a binding but has no status.json`);
		}

		// Hook state is module-global within one Octane runtime instance. Bindings
		// and the metaframework must therefore consume the application's singleton
		// runtime as an exact 0.x peer, while retaining a workspace dev dependency
		// for this monorepo's source tests.
		if (pkg.role === 'framework binding' || OCTANE_SINGLETON_CONSUMERS.has(pkg.name)) {
			if (pkg.manifest.dependencies?.octane !== undefined) {
				errors.push(`${label} must not install octane as a regular dependency`);
			}
			if (pkg.manifest.peerDependencies?.octane !== 'workspace:*') {
				errors.push(`${label} must declare exact peer octane "workspace:*"`);
			}
			if (pkg.manifest.devDependencies?.octane !== 'workspace:*') {
				errors.push(`${label} must keep octane "workspace:*" as a dev dependency`);
			}
			if (
				pkg.name === '@octanejs/vite-plugin' &&
				typeof pkg.manifest.peerDependencies?.vite !== 'string'
			) {
				errors.push(`${label} must declare its supported Vite range as a peer dependency`);
			}
			if (
				pkg.name === '@octanejs/rspack-plugin' &&
				typeof pkg.manifest.peerDependencies?.['@rspack/core'] !== 'string'
			) {
				errors.push(`${label} must declare its supported Rspack range as a peer dependency`);
			}
			if (
				pkg.name === '@octanejs/rsbuild-plugin' &&
				typeof pkg.manifest.peerDependencies?.['@rsbuild/core'] !== 'string'
			) {
				errors.push(`${label} must declare its supported Rsbuild range as a peer dependency`);
			}
		}

		if (pkg.role === 'deployment adapter') {
			if (pkg.manifest.peerDependencies?.['@octanejs/app-core'] !== 'workspace:*') {
				errors.push(`${label} must peer on the exact workspace app core`);
			}
			if (pkg.manifest.devDependencies?.['@octanejs/app-core'] !== 'workspace:*') {
				errors.push(`${label} must keep the workspace app core as a dev dependency`);
			}
		}
	}

	return errors;
}

function exportCount(manifest) {
	if (!manifest.exports || typeof manifest.exports === 'string') return manifest.exports ? 1 : 0;
	const keys = Object.keys(manifest.exports);
	return keys.some((key) => key.startsWith('.')) ? keys.length : 1;
}

export function renderWorkspaceInventory(packages = getWorkspacePackages()) {
	const publishable = packages.filter((pkg) => !pkg.private);
	const bindings = publishable.filter((pkg) => pkg.role === 'framework binding');
	let md = `# Package inventory (generated)

<!-- GENERATED FILE — do not edit. Regenerate with \`pnpm packages:inventory\`. -->

This inventory is derived from the manifests directly under \`packages/\`.
Repository tooling imports the same discovery helper, so adding, renaming, or
privatizing a package updates every package-wide check together.

**${publishable.length} publishable package(s), including ${bindings.length} framework binding(s).**

All publishable packages share the enforced Node.js engine baseline \`>=22\`.

| Package | Directory | Role | Version | Exported entry points |
| --- | --- | --- | --- | --- |
`;

	for (const pkg of publishable) {
		md += `| \`${pkg.name}\` | [\`packages/${pkg.dir}\`](../packages/${pkg.dir}) | ${pkg.role} | \`${pkg.version}\` | ${exportCount(pkg.manifest)} |\n`;
	}

	const privatePackages = packages.filter((pkg) => pkg.private);
	if (privatePackages.length) {
		md += `\n## Private packages\n\n`;
		for (const pkg of privatePackages) {
			md += `- \`${pkg.name}\` ([\`packages/${pkg.dir}\`](../packages/${pkg.dir}))\n`;
		}
	}

	return md;
}

function runCli() {
	const packages = getWorkspacePackages();
	const errors = validateWorkspacePackages(packages);
	if (errors.length) {
		console.error(`package inventory is invalid:\n  - ${errors.join('\n  - ')}`);
		process.exit(1);
	}

	const expected = renderWorkspaceInventory(packages);
	if (process.argv.includes('--check')) {
		const current = existsSync(INVENTORY_PATH) ? readFileSync(INVENTORY_PATH, 'utf8') : '';
		if (current !== expected) {
			console.error(
				'docs/packages.md is stale — run `pnpm packages:inventory` and commit the result.',
			);
			process.exit(1);
		}
		console.log(
			`package inventory is current (${packages.filter((pkg) => !pkg.private).length} publishable package(s)).`,
		);
		return;
	}

	writeFileSync(INVENTORY_PATH, expected);
	console.log(`wrote ${path.relative(REPO_ROOT, INVENTORY_PATH)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) runCli();
