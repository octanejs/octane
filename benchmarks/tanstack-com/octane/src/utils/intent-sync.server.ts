import { z } from 'zod';
import { getCurrentHostRuntimeEnv } from '~/server/runtime/host.server';
import {
	extractSkillsFromTarball,
	fetchPackument,
	isIntentCompatible,
	searchIntentPackages,
	selectVersionsToSync,
} from '~/utils/intent.server';
import {
	enqueuePackageVersion,
	getKnownVersions,
	getPendingVersions,
	getVersionForProcessing,
	markPackageVerified,
	markVersionFailed,
	markVersionSynced,
	replaceSkillsForVersion,
	upsertIntentPackage,
} from '~/utils/intent-db.server';

const githubSearchResponseSchema = z.object({
	items: z.array(
		z.object({
			path: z.string(),
			repository: z.object({ full_name: z.string() }),
		}),
	),
});

const githubContentResponseSchema = z.object({
	content: z.string().optional(),
});

const packageJsonSchema = z.object({
	name: z.string().optional(),
	private: z.boolean().optional(),
});

const npmLatestSchema = z.object({
	version: z.string().optional(),
	dist: z.object({ tarball: z.string().optional() }).optional(),
});

export const intentDiscoveryResultSchema = z.object({
	packagesDiscovered: z.number().int().nonnegative(),
	githubCandidates: z.number().int().nonnegative(),
	packagesVerified: z.number().int().nonnegative(),
	versionsEnqueued: z.number().int().nonnegative(),
	errors: z.array(z.string()),
});

export const intentVersionProcessResultSchema = z.object({
	packageName: z.string(),
	version: z.string(),
	status: z.enum(['synced', 'failed']),
	skillCount: z.number().int().nonnegative().optional(),
	error: z.string().optional(),
});

export const intentProcessResultSchema = z.object({
	processed: z.number().int().nonnegative(),
	failed: z.number().int().nonnegative(),
	deferred: z.number().int().nonnegative(),
	results: z.array(intentVersionProcessResultSchema),
});

export type IntentDiscoveryResult = z.infer<typeof intentDiscoveryResultSchema>;
export type IntentVersionProcessResult = z.infer<typeof intentVersionProcessResultSchema>;
export type IntentProcessResult = z.infer<typeof intentProcessResultSchema>;

export interface IntentVersionToProcess {
	id: number;
	packageName: string;
	version: string;
}

export interface IntentSyncOperations {
	discoverIntentPackages: () => Promise<IntentDiscoveryResult>;
	selectPendingIntentVersions: (options: {
		limit: number;
		excludeIds?: Array<number>;
	}) => Promise<Array<IntentVersionToProcess>>;
	processIntentVersion: (versionId: number) => Promise<IntentVersionProcessResult>;
}

export const defaultIntentSyncOperations: IntentSyncOperations = {
	discoverIntentPackages,
	selectPendingIntentVersions,
	processIntentVersion,
};

export async function discoverIntentPackages(): Promise<IntentDiscoveryResult> {
	const errors: Array<string> = [];
	let packagesDiscovered = 0;
	let githubCandidates = 0;
	let packagesVerified = 0;
	let versionsEnqueued = 0;

	try {
		const searchResults = await searchIntentPackages();
		const packageNames = dedupe(searchResults.objects.map((item) => item.package.name));
		packagesDiscovered = packageNames.length;

		for (const packageName of packageNames) {
			try {
				const enqueued = await discoverNpmPackage(packageName);
				if (enqueued !== null) {
					packagesVerified++;
					versionsEnqueued += enqueued;
				}
			} catch (error) {
				errors.push(`npm/${packageName}: ${getErrorMessage(error)}`);
			}
		}
	} catch (error) {
		errors.push(`npm-search: ${getErrorMessage(error)}`);
	}

	const githubToken =
		getCurrentHostRuntimeEnv()?.GITHUB_AUTH_TOKEN ?? process.env.GITHUB_AUTH_TOKEN;
	if (githubToken) {
		try {
			const githubResult = await discoverGitHubPackages(githubToken);
			githubCandidates = githubResult.githubCandidates;
			packagesVerified += githubResult.packagesVerified;
			versionsEnqueued += githubResult.versionsEnqueued;
			errors.push(...githubResult.errors);
		} catch (error) {
			errors.push(`github-search: ${getErrorMessage(error)}`);
		}
	}

	return {
		packagesDiscovered,
		githubCandidates,
		packagesVerified,
		versionsEnqueued,
		errors,
	};
}

export async function selectPendingIntentVersions(options: {
	limit: number;
	excludeIds?: Array<number>;
}): Promise<Array<IntentVersionToProcess>> {
	const versions = await getPendingVersions(options.limit, {
		excludeIds: options.excludeIds,
	});

	return versions.map((version) => ({
		id: version.id,
		packageName: version.packageName,
		version: version.version,
	}));
}

export function summarizeIntentProcessResults(
	results: Array<IntentVersionProcessResult>,
	options?: { deferred?: number },
): IntentProcessResult {
	return {
		processed: results.filter((result) => result.status === 'synced').length,
		failed: results.filter((result) => result.status === 'failed').length,
		deferred: options?.deferred ?? 0,
		results,
	};
}

async function discoverNpmPackage(packageName: string): Promise<number | null> {
	await upsertIntentPackage({ name: packageName, verified: false });

	const packument = await fetchPackument(packageName);
	const latestVersion = packument['dist-tags'].latest;
	const latestMeta = latestVersion ? packument.versions[latestVersion] : null;
	if (!latestVersion || !latestMeta || !isIntentCompatible(latestMeta)) {
		return null;
	}

	await markPackageVerified(packageName);
	return enqueueVersionsFromPackument(packageName, packument);
}

async function discoverGitHubPackages(githubToken: string): Promise<{
	githubCandidates: number;
	packagesVerified: number;
	versionsEnqueued: number;
	errors: Array<string>;
}> {
	const ghHeaders = {
		Authorization: `Bearer ${githubToken}`,
		Accept: 'application/vnd.github.v3+json',
	};
	const searchRes = await fetch(
		'https://api.github.com/search/code?q=%22%40tanstack%2Fintent%22+filename%3Apackage.json&per_page=100',
		{ headers: ghHeaders },
	);
	if (!searchRes.ok) throw new Error(`GitHub search ${searchRes.status}`);

	const searchData = githubSearchResponseSchema.parse(await searchRes.json());
	const candidates = dedupeBy(
		searchData.items.map((item) => ({
			repo: item.repository.full_name,
			path: item.path,
		})),
		(item) => `${item.repo}|${item.path}`,
	);
	let packagesVerified = 0;
	let versionsEnqueued = 0;
	const errors: Array<string> = [];

	for (const candidate of candidates) {
		try {
			const enqueued = await discoverGitHubPackage(candidate, ghHeaders);
			if (enqueued !== null) {
				packagesVerified++;
				versionsEnqueued += enqueued;
			}
		} catch (error) {
			errors.push(`github/${candidate.repo}/${candidate.path}: ${getErrorMessage(error)}`);
		}
	}

	return {
		githubCandidates: candidates.length,
		packagesVerified,
		versionsEnqueued,
		errors,
	};
}

async function discoverGitHubPackage(
	candidate: { repo: string; path: string },
	headers: HeadersInit,
): Promise<number | null> {
	const contentRes = await fetch(
		`https://api.github.com/repos/${candidate.repo}/contents/${candidate.path}`,
		{ headers },
	);
	if (!contentRes.ok) return null;

	const contentData = githubContentResponseSchema.parse(await contentRes.json());
	if (!contentData.content) return null;

	const packageJson = packageJsonSchema.parse(
		JSON.parse(Buffer.from(contentData.content, 'base64').toString('utf-8')),
	);
	if (!packageJson.name || packageJson.private) return null;

	const npmRes = await fetch(
		`https://registry.npmjs.org/${encodeURIComponent(packageJson.name)}/latest`,
	);
	if (!npmRes.ok) return null;

	const npmMeta = npmLatestSchema.parse(await npmRes.json());
	if (!npmMeta.dist?.tarball) return null;

	const skills = await extractSkillsFromTarball(npmMeta.dist.tarball);
	if (skills.length === 0) return null;

	await upsertIntentPackage({ name: packageJson.name, verified: true });
	await markPackageVerified(packageJson.name);

	const packument = await fetchPackument(packageJson.name);
	return enqueueVersionsFromPackument(packageJson.name, packument);
}

async function enqueueVersionsFromPackument(
	packageName: string,
	packument: Awaited<ReturnType<typeof fetchPackument>>,
): Promise<number> {
	const knownVersions = await getKnownVersions(packageName);
	const versionsToEnqueue = selectVersionsToSync(packument, knownVersions);

	for (const version of versionsToEnqueue) {
		await enqueuePackageVersion({
			packageName,
			version: version.version,
			tarballUrl: version.tarball,
			publishedAt: version.publishedAt,
		});
	}

	return versionsToEnqueue.length;
}

export async function processIntentVersion(versionId: number): Promise<IntentVersionProcessResult> {
	const version = await getVersionForProcessing(versionId);
	if (!version) {
		throw new Error(`Intent package version ${versionId} not found`);
	}

	if (version.syncStatus === 'synced') {
		return {
			packageName: version.packageName,
			version: version.version,
			status: 'synced',
			skillCount: version.skillCount,
		};
	}

	if (!version.tarballUrl) {
		const reason = 'No tarball URL recorded';
		await markVersionFailed(version.id, reason);
		return {
			packageName: version.packageName,
			version: version.version,
			status: 'failed',
			error: reason,
		};
	}

	try {
		const skills = await extractSkillsFromTarball(version.tarballUrl);
		await replaceSkillsForVersion(version.id, skills);
		await markVersionSynced(version.id, skills.length);
		return {
			packageName: version.packageName,
			version: version.version,
			status: 'synced',
			skillCount: skills.length,
		};
	} catch (error) {
		const reason = getErrorMessage(error);
		await markVersionFailed(version.id, reason);
		return {
			packageName: version.packageName,
			version: version.version,
			status: 'failed',
			error: reason,
		};
	}
}

function dedupe(values: Array<string>): Array<string> {
	return dedupeBy(values, (value) => value);
}

function dedupeBy<T>(values: Array<T>, getKey: (value: T) => string): Array<T> {
	const seen = new Set<string>();
	const result: Array<T> = [];
	for (const value of values) {
		const key = getKey(value);
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(value);
	}
	return result;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
