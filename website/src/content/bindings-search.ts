// Search-only package metadata. The website imports this module from inside
// loadSearchIndex(), so package/status JSON stays behind the existing lazy
// search boundary instead of joining the ordinary bindings content bundle.
import { packageRecordFor, type PackageSearchRecord } from '../lib/docs-search-core.ts';
import { BINDING_CATEGORIES, bindingRepositoryHref } from './bindings.ts';
import { COMMUNITY_BINDING_GROUPS, type CommunityBindingGroup } from './community-bindings.ts';

interface PackageMetadata {
	description?: string;
	exports?: unknown;
}

interface BindingStatusMetadata {
	upstream?: { package?: string };
}

export interface FirstPartyPackageSearchMetadata {
	packageName: string;
	purpose: string;
	upstreamPackage?: string;
	exportSubpaths?: readonly string[];
}

const packageMetadataModules = import.meta.glob('../../../packages/*/package.json', {
	import: 'default',
}) as Record<string, () => Promise<PackageMetadata>>;

const statusMetadataModules = import.meta.glob('../../../packages/*/status.json', {
	import: 'default',
}) as Record<string, () => Promise<BindingStatusMetadata>>;

const catalogPackages = BINDING_CATEGORIES.flatMap((category) => category.packages);

function moduleFor<T>(
	modules: Readonly<Record<string, () => Promise<T>>>,
	directory: string,
	fileName: string,
): (() => Promise<T>) | undefined {
	return Object.entries(modules).find(([path]) =>
		path.endsWith(`/packages/${directory}/${fileName}`),
	)?.[1];
}

function publicExportSubpaths(exportsField: unknown): string[] {
	if (typeof exportsField !== 'object' || exportsField === null || Array.isArray(exportsField)) {
		return [];
	}
	return Object.keys(exportsField)
		.filter(
			(subpath) =>
				subpath.startsWith('./') && subpath !== './package.json' && !subpath.includes('*'),
		)
		.map((subpath) => subpath.slice(1));
}

/** Pure first-party projection, shared by lazy and eager consumers. */
export function firstPartyPackageRecord(
	metadata: FirstPartyPackageSearchMetadata,
): PackageSearchRecord {
	const purpose =
		metadata.purpose.trim() || `First-party Octane binding published as ${metadata.packageName}.`;
	const names = [
		metadata.packageName,
		metadata.upstreamPackage,
		...(metadata.exportSubpaths ?? []).map((subpath) => metadata.packageName + subpath),
	].filter((name): name is string => typeof name === 'string' && name.length > 0);

	return packageRecordFor({
		key: metadata.packageName,
		title: metadata.packageName,
		names,
		purpose,
		owner: 'Octane',
		source: 'first-party',
		url: bindingRepositoryHref(metadata.packageName),
	});
}

/** Pure community projection over the single validated editorial catalog. */
export function communityPackageRecords(
	groups: readonly CommunityBindingGroup[] = COMMUNITY_BINDING_GROUPS,
): PackageSearchRecord[] {
	return groups.flatMap((group) =>
		group.entries.map((entry) =>
			packageRecordFor({
				key: entry.id,
				title: entry.name,
				names: entry.searchNames,
				purpose: entry.purpose,
				owner: entry.owner,
				source: 'community',
				url: entry.destination,
			}),
		),
	);
}

async function loadFirstPartyPackageRecord(packageName: string): Promise<PackageSearchRecord> {
	const directory = packageName.slice('@octanejs/'.length);
	const packageLoader = moduleFor(packageMetadataModules, directory, 'package.json');
	const statusLoader = moduleFor(statusMetadataModules, directory, 'status.json');
	const [packageMetadata, statusMetadata] = await Promise.all([
		packageLoader?.(),
		statusLoader?.(),
	]);
	return firstPartyPackageRecord({
		packageName,
		purpose: packageMetadata?.description ?? '',
		upstreamPackage: statusMetadata?.upstream?.package,
		exportSubpaths: publicExportSubpaths(packageMetadata?.exports),
	});
}

/** Build the package half of the website's lazy combined search index. */
export async function loadPackageSearchRecords(): Promise<PackageSearchRecord[]> {
	const firstParty = await Promise.all(catalogPackages.map(loadFirstPartyPackageRecord));
	return [...firstParty, ...communityPackageRecords()];
}
