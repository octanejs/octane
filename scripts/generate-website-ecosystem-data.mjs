import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import {
	ecosystemSlug,
	getWorkspacePackages,
	readEcosystemCatalogs,
	REPO_ROOT,
} from './workspace-packages.mjs';

export { ecosystemSlug } from './workspace-packages.mjs';

export const WEBSITE_ECOSYSTEM_INDEX_PATH = path.join(
	REPO_ROOT,
	'website/src/content/ecosystem-index.json',
);

function readJson(file) {
	return JSON.parse(readFileSync(file, 'utf8'));
}

export function loadWebsiteEcosystemInputs() {
	const packages = getWorkspacePackages();
	const catalogs = readEcosystemCatalogs(packages);
	return {
		...catalogs,
		packages: packages.map((pkg) => {
			let status;
			if (pkg.role === 'framework binding') {
				try {
					status = readJson(pkg.statusPath);
				} catch (error) {
					if (error.code === 'ENOENT') {
						throw new Error(`packages/${pkg.dir}/status.json is missing`);
					}
					throw new Error(`packages/${pkg.dir}/status.json is not valid JSON: ${error.message}`);
				}
			}
			return {
				name: pkg.name,
				dir: pkg.dir,
				private: pkg.private,
				role: pkg.role,
				manifest: pkg.manifest,
				status,
			};
		}),
	};
}

function requirePackage(packagesByName, packageName, role) {
	const pkg = packagesByName.get(packageName);
	if (!pkg) throw new Error(`website ecosystem: missing workspace package ${packageName}`);
	if (pkg.private || pkg.role !== role) {
		throw new Error(
			`website ecosystem: ${packageName} must be a publishable ${role}, received ${pkg.role}`,
		);
	}
	if (pkg.manifest?.name !== packageName) {
		throw new Error(`website ecosystem: ${packageName} has inconsistent manifest identity`);
	}
	return pkg;
}

export function assembleWebsiteEcosystemData({
	bindingCategories,
	frameworkIntegrations,
	packages,
}) {
	const packagesByName = new Map(packages.map((pkg) => [pkg.name, pkg]));
	const records = [];
	let order = 0;

	for (const integration of frameworkIntegrations) {
		requirePackage(packagesByName, integration.packageName, 'framework integration');
		records.push({
			kind: 'framework-integration',
			id: `integration-${ecosystemSlug(integration.guideAnchor)}`,
			title: integration.title,
			packageName: integration.packageName,
			model: integration.model,
			description: integration.description,
			searchTerms: integration.searchTerms ?? [],
			guideAnchor: integration.guideAnchor,
			order: order++,
		});
	}

	for (const category of bindingCategories) {
		const categoryId = ecosystemSlug(category.title);
		for (const binding of category.packages) {
			const pkg = requirePackage(packagesByName, binding.packageName, 'framework binding');
			if (!pkg.status) {
				throw new Error(`website ecosystem: ${binding.packageName} is missing website status data`);
			}
			if (typeof pkg.status.upstream?.package !== 'string' || !pkg.status.upstream.package.trim()) {
				throw new Error(
					`website ecosystem: packages/${pkg.dir}/status.json needs upstream.package`,
				);
			}
			records.push({
				kind: 'library-binding',
				id: `binding-${pkg.dir}`,
				title: binding.title,
				packageName: binding.packageName,
				upstreamPackage: pkg.status.upstream.package,
				category: category.title,
				categoryId,
				description: `Use ${pkg.status.upstream.package} with Octane.`,
				searchTerms: binding.searchTerms ?? [],
				tags: binding.tags ?? [],
				order: order++,
			});
		}
	}

	return records;
}

async function serializeWebsiteEcosystemData(records) {
	return format(JSON.stringify(records), {
		...(await resolveConfig(WEBSITE_ECOSYSTEM_INDEX_PATH)),
		filepath: WEBSITE_ECOSYSTEM_INDEX_PATH,
	});
}

export async function writeWebsiteEcosystemData({
	input = loadWebsiteEcosystemInputs(),
	outputPath = WEBSITE_ECOSYSTEM_INDEX_PATH,
	check = false,
} = {}) {
	const records = assembleWebsiteEcosystemData(input);
	const serialized = await serializeWebsiteEcosystemData(records);
	let current = '';
	try {
		current = readFileSync(outputPath, 'utf8');
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
	const changed = current !== serialized;
	if (check && changed) {
		throw new Error(
			`${path.basename(outputPath)} is stale — run \`pnpm website:ecosystem-data\` and commit the result.`,
		);
	}
	if (!check && changed) writeFileSync(outputPath, serialized);
	return {
		changed,
		bindings: records.filter((record) => record.kind === 'library-binding').length,
		integrations: records.filter((record) => record.kind === 'framework-integration').length,
	};
}

async function runCli() {
	const check = process.argv.includes('--check');
	try {
		const result = await writeWebsiteEcosystemData({ check });
		const action = check ? 'is current' : result.changed ? 'wrote' : 'is already current';
		console.log(
			`website ecosystem index ${action} (${result.bindings} binding(s), ${result.integrations} integration(s)).`,
		);
	} catch (error) {
		console.error(error.message);
		process.exit(1);
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
