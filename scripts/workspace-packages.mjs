import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PACKAGES_ROOT = path.join(REPO_ROOT, 'packages');
export const INVENTORY_PATH = path.join(REPO_ROOT, 'docs/packages.md');
export const BINDINGS_CATALOG_PATH = path.join(REPO_ROOT, 'website/src/content/bindings.json');
export const FRAMEWORK_INTEGRATIONS_PATH = path.join(
	REPO_ROOT,
	'website/src/content/framework-integrations.json',
);

const SPECIAL_ROLES = new Map([
	['octane', 'core runtime + compiler'],
	['@octanejs/app-core', 'metaframework core'],
	// Host frameworks own application routing/content orchestration. These
	// packages adopt that boundary rather than binding a React library API.
	['@octanejs/docusaurus', 'framework integration'],
	['@octanejs/rspack-plugin', 'compiler integration'],
	['@octanejs/rspeedy-plugin', 'native compiler integration'],
	['@octanejs/astro', 'framework integration'],
	['@octanejs/rsbuild-plugin', 'metaframework'],
	['@octanejs/vite-plugin', 'metaframework'],
	// TanStack Start is a framework integration rather than a library
	// binding, so it stays outside the binding status/catalog contract.
	['@octanejs/tanstack-start', 'framework integration'],
	['@octanejs/mcp-server', 'agent tooling'],
	// The CLI inspects and configures other people's projects, including ones
	// that have no Octane installed yet, which is exactly what `octane init`
	// exists to fix. Coupling it to the runtime singleton would make it
	// uninstallable in the case it is meant to solve.
	['@octanejs/cli', 'developer tooling'],
	['@octanejs/evals', 'evaluation tooling'],
	// The one package people type by name rather than install. It is a thin entry
	// point onto `octane create`, so it carries no scope and would otherwise fall
	// through the `@octanejs/` test below into "other package".
	['create-octane', 'project scaffolder'],
	// Original Octane API rather than a port of an upstream library, so it has no
	// binding status.json / parity contract to satisfy.
	['@octanejs/seo', 'document metadata'],
]);

const OCTANE_SINGLETON_CONSUMERS = new Set([
	'@octanejs/app-core',
	'@octanejs/astro',
	'@octanejs/docusaurus',
	'@octanejs/rspack-plugin',
	'@octanejs/rspeedy-plugin',
	'@octanejs/rsbuild-plugin',
	'@octanejs/tanstack-start',
	'@octanejs/vite-plugin',
]);

function readJson(file) {
	return JSON.parse(readFileSync(file, 'utf8'));
}

function bindingInstallCommandPackages(readme, command, packageName) {
	for (const line of readme.split(/\r?\n/)) {
		const tokens = line.trim().split(/\s+/);
		const packages = tokens.slice(2);
		if (`${tokens[0]} ${tokens[1]}` === command && commandIncludesPackage(packages, packageName)) {
			return packages;
		}
	}
	return [];
}

function commandIncludesPackage(packages, packageName) {
	return packages.some((token) => {
		return token === packageName || token.startsWith(`${packageName}@`);
	});
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

export function getFrameworkIntegrationPackages() {
	return getPublishablePackages().filter((pkg) => pkg.role === 'framework integration');
}

function validateSearchTerms(value, label, errors) {
	if (value === undefined) return;
	if (!Array.isArray(value)) {
		errors.push(`${label} "searchTerms" must be an array of non-empty strings`);
		return;
	}
	for (const [index, term] of value.entries()) {
		if (typeof term !== 'string' || !term.trim()) {
			errors.push(`${label} searchTerms entry ${index + 1} must be a non-empty string`);
		}
	}
}

function validateBindingTags(value, label, errors) {
	if (!Array.isArray(value) || value.length === 0) {
		errors.push(`${label} "tags" must be a non-empty array of lowercase strings`);
		return;
	}
	const tags = new Set();
	for (const [index, tag] of value.entries()) {
		if (typeof tag !== 'string' || !tag.trim() || tag !== tag.trim() || tag !== tag.toLowerCase()) {
			errors.push(`${label} tags entry ${index + 1} must be a trimmed lowercase string`);
			continue;
		}
		if (tags.has(tag)) errors.push(`${label} lists tag "${tag}" more than once`);
		tags.add(tag);
	}
}

function identity(value) {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function ecosystemSlug(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export function validateBindingCatalogData(catalog, packages = getWorkspacePackages()) {
	const errors = [];
	if (!Array.isArray(catalog)) {
		return ['website/src/content/bindings.json must be an array of binding categories'];
	}

	const expected = packages.filter((pkg) => !pkg.private && pkg.role === 'framework binding');
	const expectedNames = new Set(expected.map((pkg) => pkg.name));
	const directories = new Map(expected.map((pkg) => [pkg.name, pkg.dir]));
	const categoryTitles = new Set();
	const categoryIds = new Set();
	const packageNames = new Set();
	const displayTitles = new Set();

	for (const [categoryIndex, category] of catalog.entries()) {
		const label = `website/src/content/bindings.json category ${categoryIndex + 1}`;
		if (!category || typeof category !== 'object' || Array.isArray(category)) {
			errors.push(`${label} must be an object`);
			continue;
		}
		if (typeof category.title !== 'string' || !category.title.trim()) {
			errors.push(`${label} needs a non-empty "title"`);
		} else if (category.title.includes(',') || /\band\b/i.test(category.title)) {
			errors.push(`${label} title must not contain commas or the word "and"`);
		} else if (categoryTitles.has(identity(category.title))) {
			errors.push(`${label} duplicates category title "${category.title}"`);
		} else {
			categoryTitles.add(identity(category.title));
			const categoryId = ecosystemSlug(category.title);
			if (!categoryId) {
				errors.push(`${label} title "${category.title}" does not produce a stable category id`);
			} else if (categoryIds.has(categoryId)) {
				errors.push(`${label} duplicates derived category id "${categoryId}"`);
			} else {
				categoryIds.add(categoryId);
			}
		}
		if (typeof category.description !== 'string' || !category.description.trim()) {
			errors.push(`${label} needs a non-empty "description"`);
		}
		if (!Array.isArray(category.packages) || category.packages.length === 0) {
			errors.push(`${label} needs a non-empty "packages" array`);
			continue;
		}

		for (const [bindingIndex, binding] of category.packages.entries()) {
			const entryLabel = `${label} binding ${bindingIndex + 1}`;
			if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
				errors.push(`${entryLabel} must be an object`);
				continue;
			}
			for (const field of ['packageName', 'title']) {
				if (typeof binding[field] !== 'string' || !binding[field].trim()) {
					errors.push(`${entryLabel} needs a non-empty "${field}"`);
				}
			}
			validateSearchTerms(binding.searchTerms, entryLabel, errors);
			validateBindingTags(binding.tags, entryLabel, errors);

			if (typeof binding.packageName === 'string' && binding.packageName.trim()) {
				if (packageNames.has(binding.packageName)) {
					errors.push(`${entryLabel} lists ${binding.packageName} more than once`);
				}
				packageNames.add(binding.packageName);
				if (!expectedNames.has(binding.packageName)) {
					errors.push(`${entryLabel} lists unknown binding ${binding.packageName}`);
				} else {
					const derivedDirectory = binding.packageName.slice('@octanejs/'.length);
					const workspaceDirectory = directories.get(binding.packageName);
					if (derivedDirectory !== workspaceDirectory) {
						errors.push(
							`${entryLabel} derives directory "${derivedDirectory}" from ${binding.packageName}, but its workspace directory is "${workspaceDirectory}"`,
						);
					}
				}
			}

			const displayIdentity = identity(binding.title);
			if (displayIdentity) {
				if (displayTitles.has(displayIdentity)) {
					errors.push(`${entryLabel} duplicates binding title "${binding.title}"`);
				}
				displayTitles.add(displayIdentity);
			}
		}
	}

	for (const pkg of expected) {
		if (!packageNames.has(pkg.name)) {
			errors.push(`website/src/content/bindings.json is missing ${pkg.name}`);
		}
	}

	return errors;
}

export function validateFrameworkIntegrationCatalogData(
	catalog,
	packages = getWorkspacePackages(),
) {
	const errors = [];

	if (!Array.isArray(catalog)) {
		return ['website/src/content/framework-integrations.json must be an array'];
	}

	const catalogPackages = new Set();
	const displayTitles = new Set();
	const guideAnchors = new Set();
	for (const [index, integration] of catalog.entries()) {
		const label = `website/src/content/framework-integrations.json entry ${index + 1}`;
		if (!integration || typeof integration !== 'object' || Array.isArray(integration)) {
			errors.push(`${label} must be an object`);
			continue;
		}
		for (const field of ['title', 'packageName', 'model', 'description', 'guideAnchor']) {
			if (typeof integration[field] !== 'string' || !integration[field].trim()) {
				errors.push(`${label} needs a non-empty "${field}"`);
			}
		}
		validateSearchTerms(integration.searchTerms, label, errors);
		if (
			typeof integration.guideAnchor === 'string' &&
			integration.guideAnchor.trim() &&
			!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(integration.guideAnchor)
		) {
			errors.push(`${label} has invalid guide anchor "${integration.guideAnchor}"`);
		}
		if (typeof integration.packageName !== 'string') continue;
		if (catalogPackages.has(integration.packageName)) {
			errors.push(`${label} lists ${integration.packageName} more than once`);
		}
		catalogPackages.add(integration.packageName);
		const displayIdentity = identity(integration.title);
		if (displayIdentity) {
			if (displayTitles.has(displayIdentity)) {
				errors.push(`${label} duplicates integration title "${integration.title}"`);
			}
			displayTitles.add(displayIdentity);
		}
		if (typeof integration.guideAnchor === 'string' && integration.guideAnchor.trim()) {
			if (guideAnchors.has(integration.guideAnchor)) {
				errors.push(`${label} duplicates guide anchor "${integration.guideAnchor}"`);
			}
			guideAnchors.add(integration.guideAnchor);
		}
	}

	const integrations = packages.filter(
		(pkg) => !pkg.private && pkg.role === 'framework integration',
	);
	const integrationNames = new Set(integrations.map((pkg) => pkg.name));
	for (const integration of integrations) {
		if (!catalogPackages.has(integration.name)) {
			errors.push(`website/src/content/framework-integrations.json is missing ${integration.name}`);
		}
	}
	for (const packageName of catalogPackages) {
		if (!integrationNames.has(packageName)) {
			errors.push(
				`website/src/content/framework-integrations.json lists unknown framework integration ${packageName}`,
			);
		}
	}

	return errors;
}

function readCatalog(file, label) {
	try {
		return { value: readJson(file), errors: [] };
	} catch (error) {
		return { value: undefined, errors: [`${label} is not valid JSON: ${error.message}`] };
	}
}

export function validateBindingCatalog(packages = getWorkspacePackages()) {
	const result = readCatalog(BINDINGS_CATALOG_PATH, 'website/src/content/bindings.json');
	return result.errors.length ? result.errors : validateBindingCatalogData(result.value, packages);
}

export function validateFrameworkIntegrationCatalog(packages = getWorkspacePackages()) {
	const result = readCatalog(
		FRAMEWORK_INTEGRATIONS_PATH,
		'website/src/content/framework-integrations.json',
	);
	return result.errors.length
		? result.errors
		: validateFrameworkIntegrationCatalogData(result.value, packages);
}

export function readEcosystemCatalogs(packages = getWorkspacePackages()) {
	const bindings = readCatalog(BINDINGS_CATALOG_PATH, 'website/src/content/bindings.json');
	const integrations = readCatalog(
		FRAMEWORK_INTEGRATIONS_PATH,
		'website/src/content/framework-integrations.json',
	);
	const errors = [
		...bindings.errors,
		...integrations.errors,
		...(bindings.value !== undefined ? validateBindingCatalogData(bindings.value, packages) : []),
		...(integrations.value !== undefined
			? validateFrameworkIntegrationCatalogData(integrations.value, packages)
			: []),
	];
	if (errors.length) {
		throw new Error(`ecosystem catalogs are invalid:\n  - ${errors.join('\n  - ')}`);
	}
	return {
		bindingCategories: bindings.value,
		frameworkIntegrations: integrations.value,
	};
}

export function validateWorkspacePackages(packages = getWorkspacePackages()) {
	const errors = [];
	const names = new Set();
	const workspaceNames = new Set(packages.map((pkg) => pkg.name).filter(Boolean));
	const rootManifest = readJson(path.join(REPO_ROOT, 'package.json'));
	if (rootManifest.engines?.node !== '>=22.22.2') {
		errors.push('root package.json must declare engines.node ">=22.22.2"');
	}

	for (const pkg of packages) {
		const label = `packages/${pkg.dir}`;
		if (!pkg.name) errors.push(`${label}/package.json has no name`);
		else if (names.has(pkg.name)) errors.push(`duplicate package name: ${pkg.name}`);
		else names.add(pkg.name);

		if (!pkg.private) {
			if (!pkg.version) errors.push(`${label} is publishable but has no version`);
			if (pkg.manifest.engines?.node !== '>=22.22.2') {
				errors.push(`${label} must declare engines.node ">=22.22.2"`);
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
		if (!pkg.private && pkg.role === 'framework binding') {
			const readmePath = path.join(pkg.directory, 'README.md');
			if (!existsSync(readmePath)) {
				errors.push(`${label} (${pkg.name}) is a binding but has no README.md`);
			} else {
				const readme = readFileSync(readmePath, 'utf8');
				const optionalPeers = pkg.manifest.peerDependenciesMeta ?? {};
				const requiredPeers = Object.keys(pkg.manifest.peerDependencies ?? {}).filter((name) => {
					return name !== 'octane' && optionalPeers[name]?.optional !== true;
				});
				for (const command of ['npm install', 'pnpm add']) {
					const commandPackages = bindingInstallCommandPackages(readme, command, pkg.name);
					if (!commandIncludesPackage(commandPackages, pkg.name)) {
						errors.push(
							`${label}/README.md must include a copy-paste \`${command} ${pkg.name}\` command`,
						);
						continue;
					}
					for (const peer of requiredPeers) {
						if (!commandIncludesPackage(commandPackages, peer)) {
							errors.push(
								`${label}/README.md \`${command}\` command must include required peer ${peer}`,
							);
						}
					}
				}
			}
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

		// Every sibling edge resolves through the workspace. A published range
		// instead installs the sibling from npm, so the package builds against a
		// stale copy of source that lives in this checkout, and `changeset version`
		// rewrites the range on release, desyncing pnpm-lock.yaml and failing the
		// release job's frozen install.
		for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
			for (const [dependency, range] of Object.entries(pkg.manifest[section] ?? {})) {
				if (!workspaceNames.has(dependency) || range === 'workspace:*') continue;
				errors.push(
					`${label} ${section}.${dependency} must be "workspace:*" (received ${JSON.stringify(range)})`,
				);
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
	const frameworkIntegrations = publishable.filter((pkg) => pkg.role === 'framework integration');
	let md = `# Package inventory (generated)

<!-- GENERATED FILE — do not edit. Regenerate with \`pnpm packages:inventory\`. -->

This inventory is derived from the manifests directly under \`packages/\`.
Repository tooling imports the same discovery helper, so adding, renaming, or
privatizing a package updates every package-wide check together.

**${publishable.length} publishable package(s), including ${bindings.length} framework binding(s) and ${frameworkIntegrations.length} framework integration(s).**

All publishable packages share the enforced Node.js engine baseline \`>=22.22.2\`.

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
	const errors = [
		...validateWorkspacePackages(packages),
		...validateBindingCatalog(packages),
		...validateFrameworkIntegrationCatalog(packages),
	];
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
