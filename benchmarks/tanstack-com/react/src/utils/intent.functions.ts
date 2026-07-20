import { createServerFn } from '@tanstack/react-start';
import * as v from 'valibot';
import {
	getAllVerifiedPackages,
	getPackageByName,
	getPackageVersions,
	getSkillsForVersion,
	getSkillFingerprintsForVersion,
	getIntentRegistryStats,
	getLatestIntentVersionSkillSummaries,
	searchPackagesByName,
	searchSkills,
	touchPackageSyncTime,
	upsertIntentPackage,
	getKnownVersions,
	enqueuePackageVersion,
	markVersionSynced,
	markVersionFailed,
	replaceSkillsForVersion,
} from './intent-db.server';
import {
	searchIntentPackages,
	fetchPackument,
	selectVersionsToSync,
	extractSkillsFromTarball,
	fetchBulkDownloads,
	searchIntentPackagesByText,
} from './intent.server';
import { fetchCached } from './cache.server';
import type { IntentPackage, IntentPackageVersion, SkillSearchResult } from './intent-db.server';
import type { NpmSearchResult } from './intent.server';
import { npmPackageNameSchema } from './schemas';
import { normalizePublicHttpUrl } from './url-boundary';

// Re-export types used by routes
export type { IntentPackage, IntentPackageVersion, SkillSearchResult };

const emptyNpmSearchResult: NpmSearchResult = {
	objects: [],
	total: 0,
	time: '',
};

const intentVersionSchema = v.pipe(
	v.string(),
	v.minLength(1),
	v.maxLength(120),
	v.regex(/^[a-z0-9.+_-]+$/i),
);
const intentSkillNameSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(160));
const intentSearchSchema = v.pipe(v.string(), v.maxLength(120));
const intentFrameworkSchema = v.pipe(v.string(), v.maxLength(80));
const intentPageSchema = v.pipe(v.number(), v.integer(), v.minValue(0));
const intentPageSizeSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(48));
const intentLimitSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50));

function normalizeRepositoryUrl(value: string | undefined | null) {
	if (!value) return null;

	const withoutGitPrefix = value.replace(/^git\+/, '').replace(/\.git$/, '');
	return normalizePublicHttpUrl(withoutGitPrefix);
}

function normalizeOptionalPublicHttpUrl(value: string | undefined | null) {
	return normalizePublicHttpUrl(value) ?? undefined;
}

function normalizeOptionalRepositoryUrl(value: string | undefined | null) {
	return normalizeRepositoryUrl(value) ?? undefined;
}

// ---------------------------------------------------------------------------
// Enriched types (DB rows + live NPM metadata merged)
// ---------------------------------------------------------------------------

export interface EnrichedIntentPackage {
	name: string;
	description: string;
	homepage?: string;
	repositoryUrl?: string;
	npmUrl: string;
	latestVersion: string;
	publishedAt: string | null;
	monthlyDownloads: number;
	weeklyDownloads: number;
	npmScore: number;
	skillNames: Array<string>;
	frameworks: Array<string>;
	firstSeenAt: Date;
	lastSyncedAt: Date;
}

export interface IntentSkillSummary {
	id: number;
	name: string;
	description: string | null;
	type: string | null;
	framework: string | null;
	requires: Array<string> | null;
	skillPath: string | null;
	contentHash: string;
	lineCount: number;
}

export interface PackageVersionSummary {
	id: number;
	version: string;
	skillCount: number;
	publishedAt: Date | null;
}

export interface SkillHistoryEntry {
	version: string;
	total: number;
	added: number;
	removed: number;
	modified: number;
}

// ---------------------------------------------------------------------------
// Registry stats (for hero banner)
// ---------------------------------------------------------------------------

export const getIntentStats = createServerFn({ method: 'GET' }).handler(async () => {
	return fetchCached({
		key: 'intent:registry:stats',
		ttl: 5 * 60 * 1000, // 5 minutes
		fn: () => getIntentRegistryStats(),
	});
});

// ---------------------------------------------------------------------------
// Directory listing
// ---------------------------------------------------------------------------

export const getIntentDirectory = createServerFn({ method: 'GET' })
	.validator(
		v.object({
			search: v.optional(intentSearchSchema),
			framework: v.optional(intentFrameworkSchema),
			sort: v.optional(v.picklist(['downloads', 'name', 'skills', 'newest'])),
			page: v.optional(intentPageSchema),
			pageSize: v.optional(intentPageSizeSchema),
		}),
	)
	.handler(async ({ data }) => {
		const { search, framework, sort = 'downloads', page = 0, pageSize = 24 } = data;

		const npmSearchPromise = fetchCached<NpmSearchResult>({
			key: `intent:npm-search:${search ?? ''}`,
			ttl: 5 * 60 * 1000,
			fn: () => (search ? searchIntentPackagesByText(search) : searchIntentPackages()),
		}).catch(() => emptyNpmSearchResult);

		const [npmData, verifiedPackages, dbSearchMatches, latestVersionSkillSummaries] =
			await Promise.all([
				npmSearchPromise,
				getAllVerifiedPackages(),
				search ? searchPackagesByName(search) : Promise.resolve([]),
				fetchCached({
					key: 'intent:latest-version-skill-summaries:v2',
					ttl: 10 * 60 * 1000,
					fn: () => getLatestIntentVersionSkillSummaries(),
				}),
			]);

		// Fetch real download counts from the npm downloads API (cached 5 min)
		const downloadCounts = await fetchCached({
			key: 'intent:download-counts',
			ttl: 5 * 60 * 1000,
			fn: () => fetchBulkDownloads(verifiedPackages.map((p) => p.name)),
		});

		// Build the set of packages to show: union of NPM results + DB name matches
		const npmByName = new Map(npmData.objects.map((obj) => [obj.package.name, obj]));
		const dbMatchNames = new Set(dbSearchMatches.map((p) => p.name));
		const summaryByPackageName = new Map(
			latestVersionSkillSummaries.map((summary) => [summary.packageName, summary]),
		);

		// Merge: DB record + NPM metadata. Only show verified packages.
		const packages: Array<EnrichedIntentPackage> = [];
		for (const pkg of verifiedPackages) {
			const npmObj = npmByName.get(pkg.name);
			// Include if: matches NPM search, matches DB name search, or no search (show all)
			if (search && !npmObj && !dbMatchNames.has(pkg.name)) continue;

			const npmPkg = npmObj?.package;
			const summary = summaryByPackageName.get(pkg.name);
			const skillNames = summary?.skillNames ?? [];
			const frameworks = summary?.frameworks ?? [];

			// Filter by framework if requested
			if (framework && !frameworks.includes(framework)) continue;

			packages.push({
				name: pkg.name,
				description: npmPkg?.description ?? '',
				homepage: normalizeOptionalPublicHttpUrl(npmPkg?.links.homepage),
				repositoryUrl: normalizeOptionalRepositoryUrl(npmPkg?.links.repository),
				npmUrl:
					normalizePublicHttpUrl(npmPkg?.links.npm) ?? `https://www.npmjs.com/package/${pkg.name}`,
				latestVersion: summary?.latestVersion ?? 'unknown',
				publishedAt: summary?.publishedAt?.toISOString() ?? null,
				monthlyDownloads: downloadCounts.get(pkg.name) ?? 0,
				weeklyDownloads: 0,
				npmScore: npmObj?.score.final ?? 0,
				skillNames,
				frameworks,
				firstSeenAt: pkg.firstSeenAt,
				lastSyncedAt: pkg.lastSyncedAt,
			});
		}

		// Sort
		switch (sort) {
			case 'downloads':
				packages.sort((a, b) => b.monthlyDownloads - a.monthlyDownloads);
				break;
			case 'name':
				packages.sort((a, b) => a.name.localeCompare(b.name));
				break;
			case 'skills':
				packages.sort((a, b) => b.skillNames.length - a.skillNames.length);
				break;
			case 'newest':
				packages.sort((a, b) => {
					const aDate = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
					const bDate = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
					return bDate - aDate;
				});
				break;
		}

		const total = packages.length;
		const paginated = packages.slice(page * pageSize, (page + 1) * pageSize);

		return { packages: paginated, total, page, pageSize };
	});

// ---------------------------------------------------------------------------
// Single package detail
// ---------------------------------------------------------------------------

// In-memory cache of package names that have no skills on NPM.
// Prevents hammering the NPM registry for packages that will never have skills.
// Maps name -> expiry timestamp (10 min TTL).
const rejectedPackages = new Map<string, number>();
const REJECTION_TTL = 10 * 60 * 1000;

function isRejected(name: string): boolean {
	const expiry = rejectedPackages.get(name);
	if (expiry === undefined) return false;
	if (Date.now() > expiry) {
		rejectedPackages.delete(name);
		return false;
	}
	return true;
}

// Build the standard return shape from a packument + DB versions
async function buildPackageDetail(
	name: string,
	packument: Awaited<ReturnType<typeof fetchPackument>>,
	versions: Awaited<ReturnType<typeof getPackageVersions>>,
	pkg: IntentPackage,
) {
	const latestVersion = packument['dist-tags'].latest ?? '';
	const latestMeta = latestVersion ? packument.versions[latestVersion] : null;

	const repoUrl = latestMeta?.repository
		? typeof latestMeta.repository === 'string'
			? normalizeRepositoryUrl(latestMeta.repository)
			: normalizeRepositoryUrl(latestMeta.repository.url)
		: undefined;

	return {
		name,
		description: latestMeta?.description ?? '',
		homepage: normalizePublicHttpUrl(latestMeta?.homepage) ?? null,
		repositoryUrl: repoUrl ?? null,
		npmUrl: `https://www.npmjs.com/package/${name}`,
		latestVersion,
		versions: versions.map(
			(ver): PackageVersionSummary => ({
				id: ver.id,
				version: ver.version,
				skillCount: ver.skillCount,
				publishedAt: ver.publishedAt,
			}),
		),
		firstSeenAt: pkg.firstSeenAt,
		lastSyncedAt: pkg.lastSyncedAt,
	};
}

export type IntentPackageDetail = Awaited<ReturnType<typeof buildPackageDetail>>;

// Inline-seed a package that's not yet in the DB.
// Fetches packument, downloads latest tarball, extracts skills, seeds DB.
// Returns the package detail shape or null if the package has no skills / doesn't exist.
async function inlineSeedPackage(name: string) {
	// Fetch packument to verify the package exists on NPM
	let packument: Awaited<ReturnType<typeof fetchPackument>>;
	try {
		packument = await fetchPackument(name);
	} catch {
		// Package doesn't exist on NPM
		return null;
	}

	const latestVersion = packument['dist-tags'].latest;
	if (!latestVersion) return null;

	const latestMeta = packument.versions[latestVersion];
	if (!latestMeta) return null;

	const tarballUrl = latestMeta.dist.tarball;

	// Extract skills from the tarball inline
	let skills: Awaited<ReturnType<typeof extractSkillsFromTarball>>;
	try {
		skills = await extractSkillsFromTarball(tarballUrl);
	} catch {
		return null;
	}

	if (skills.length === 0) {
		// Remember that this package has no skills so we don't re-check it
		rejectedPackages.set(name, Date.now() + REJECTION_TTL);
		return null;
	}

	// Seed DB: upsert package as verified, enqueue and immediately process the latest version
	await upsertIntentPackage({ name, verified: true });

	const publishedAt = packument.time[latestVersion]
		? new Date(packument.time[latestVersion])
		: null;

	await enqueuePackageVersion({
		packageName: name,
		version: latestVersion,
		tarballUrl,
		publishedAt,
	});

	// Version row might still be pending (we just inserted), so fetch it directly
	// instead of using getPackageVersions which only returns synced rows
	const { db } = await import('~/db/client');
	const { intentPackageVersions } = await import('~/db/schema');
	const { eq, and } = await import('drizzle-orm');
	const versionRow = await db.query.intentPackageVersions.findFirst({
		where: and(
			eq(intentPackageVersions.packageName, name),
			eq(intentPackageVersions.version, latestVersion),
		),
	});

	if (versionRow) {
		try {
			await replaceSkillsForVersion(versionRow.id, skills);
			await markVersionSynced(versionRow.id, skills.length);
		} catch (err) {
			await markVersionFailed(versionRow.id, err instanceof Error ? err.message : String(err));
		}
	}

	// Enqueue additional older versions in the background (don't block)
	void (async () => {
		try {
			const knownVersions = await getKnownVersions(name);
			const toEnqueue = selectVersionsToSync(packument, knownVersions);
			for (const { version, tarball, publishedAt: pAt } of toEnqueue) {
				await enqueuePackageVersion({
					packageName: name,
					version,
					tarballUrl: tarball,
					publishedAt: pAt,
				});
			}
		} catch {
			// best-effort
		}
	})();

	const pkg = await getPackageByName(name);
	if (!pkg) return null;

	const syncedVersions = await getPackageVersions(name);
	return buildPackageDetail(name, packument, syncedVersions, pkg);
}

// Fire-and-forget background refresh: fetches the latest packument and enqueues
// any new versions, then touches lastSyncedAt to reset the staleness clock.
function refreshPackageInBackground(name: string): void {
	void (async () => {
		try {
			await touchPackageSyncTime(name);
			const packument = await fetchPackument(name);
			const knownVersions = await getKnownVersions(name);
			const toEnqueue = selectVersionsToSync(packument, knownVersions);
			for (const { version, tarball, publishedAt } of toEnqueue) {
				await enqueuePackageVersion({
					packageName: name,
					version,
					tarballUrl: tarball,
					publishedAt,
				});
			}
		} catch {
			// best-effort
		}
	})();
}

export const getIntentPackageDetail = createServerFn({ method: 'GET' })
	.validator(v.object({ name: npmPackageNameSchema }))
	.handler(async ({ data }) => {
		const { name } = data;

		// Quick rejection cache check (packages confirmed to have no skills)
		if (isRejected(name)) return null;

		const pkg = await getPackageByName(name);

		if (!pkg) {
			// Cold path: package not in DB at all — inline seed from NPM
			return inlineSeedPackage(name);
		}

		// Package is in DB. Fetch packument + versions in parallel.
		const [packument, versions] = await Promise.all([
			fetchCached({
				key: `intent:packument:${name}`,
				ttl: 10 * 60 * 1000,
				fn: () => fetchPackument(name),
			}),
			getPackageVersions(name),
		]);

		const FRESH_TTL = 5 * 60 * 1000;
		const fresh = Date.now() - pkg.lastSyncedAt.getTime() < FRESH_TTL;
		if (!fresh) {
			// Stale path: return data immediately, refresh in background
			refreshPackageInBackground(name);
		}
		// Fast path: return data immediately (no background work needed)

		return buildPackageDetail(name, packument, versions, pkg);
	});

// ---------------------------------------------------------------------------
// Skills for a specific synced version
// ---------------------------------------------------------------------------

export const getIntentVersionSkills = createServerFn({ method: 'GET' })
	.validator(
		v.object({
			packageName: npmPackageNameSchema,
			version: intentVersionSchema,
		}),
	)
	.handler(async ({ data }) => {
		const versions = await getPackageVersions(data.packageName);
		const versionRecord = versions.find((v) => v.version === data.version);
		if (!versionRecord) return null;

		const skills = await fetchCached({
			key: `intent:skills:${versionRecord.id}`,
			ttl: 30 * 60 * 1000,
			fn: () => getSkillsForVersion(versionRecord.id),
		});

		return {
			packageName: data.packageName,
			version: data.version,
			versionId: versionRecord.id,
			skills: skills.map(
				(s): IntentSkillSummary => ({
					id: s.id,
					name: s.name,
					description: s.description,
					type: s.type,
					framework: s.framework,
					requires: s.requires,
					skillPath: s.skillPath,
					contentHash: s.contentHash,
					lineCount: s.lineCount,
				}),
			),
		};
	});

function stripFrontmatter(content: string) {
	const lines = content.split('\n');

	if (lines[0]?.trim() !== '---') {
		return content;
	}

	const closing = lines.findIndex((line, index) => index > 0 && line.trim() === '---');

	if (closing === -1) {
		return content;
	}

	return lines
		.slice(closing + 1)
		.join('\n')
		.trimStart();
}

export const getIntentSkillPage = createServerFn({ method: 'GET' })
	.validator(
		v.object({
			packageName: npmPackageNameSchema,
			skillName: intentSkillNameSchema,
			version: intentVersionSchema,
		}),
	)
	.handler(async ({ data }) => {
		const versions = await getPackageVersions(data.packageName);
		const versionRecord = versions.find((version) => version.version === data.version);

		if (!versionRecord) {
			return null;
		}

		const skills = await fetchCached({
			key: `intent:skills:${versionRecord.id}`,
			ttl: 30 * 60 * 1000,
			fn: () => getSkillsForVersion(versionRecord.id),
		});
		const skill = skills.find((candidate) => candidate.name === data.skillName);

		if (!skill) {
			return null;
		}

		return {
			content: stripFrontmatter(skill.content),
		};
	});

export const getIntentSkillMarkdown = createServerFn({ method: 'GET' })
	.validator(
		v.object({
			packageName: npmPackageNameSchema,
			skillName: intentSkillNameSchema,
			version: intentVersionSchema,
		}),
	)
	.handler(async ({ data }) => {
		const versions = await getPackageVersions(data.packageName);
		const versionRecord = versions.find((version) => version.version === data.version);

		if (!versionRecord) {
			return null;
		}

		const skills = await fetchCached({
			key: `intent:skills:${versionRecord.id}`,
			ttl: 30 * 60 * 1000,
			fn: () => getSkillsForVersion(versionRecord.id),
		});
		const skill = skills.find((candidate) => candidate.name === data.skillName);

		if (!skill) {
			return null;
		}

		return stripFrontmatter(skill.content);
	});

// ---------------------------------------------------------------------------
// Diff: compare skills between two versions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Skill search across all packages
// ---------------------------------------------------------------------------

export const searchIntentSkills = createServerFn({ method: 'GET' })
	.validator(
		v.object({
			query: intentSearchSchema,
			limit: v.optional(intentLimitSchema),
		}),
	)
	.handler(async ({ data }) => {
		const { query, limit = 50 } = data;
		if (!query.trim()) {
			const empty: Array<SkillSearchResult> = [];
			return empty;
		}
		return searchSkills(query.trim(), limit);
	});

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export interface SkillDiff {
	added: Array<IntentSkillSummary>;
	removed: Array<IntentSkillSummary>;
	modified: Array<{ from: IntentSkillSummary; to: IntentSkillSummary }>;
	unchanged: Array<IntentSkillSummary>;
}

export const diffIntentVersions = createServerFn({ method: 'GET' })
	.validator(
		v.object({
			packageName: npmPackageNameSchema,
			fromVersion: intentVersionSchema,
			toVersion: intentVersionSchema,
		}),
	)
	.handler(async ({ data }) => {
		const versions = await getPackageVersions(data.packageName);

		const fromRecord = versions.find((v) => v.version === data.fromVersion);
		const toRecord = versions.find((v) => v.version === data.toVersion);

		if (!fromRecord || !toRecord) return null;

		const [fromSkills, toSkills] = await Promise.all([
			fetchCached({
				key: `intent:skills:${fromRecord.id}`,
				ttl: 30 * 60 * 1000,
				fn: () => getSkillsForVersion(fromRecord.id),
			}),
			fetchCached({
				key: `intent:skills:${toRecord.id}`,
				ttl: 30 * 60 * 1000,
				fn: () => getSkillsForVersion(toRecord.id),
			}),
		]);

		const fromMap = new Map(fromSkills.map((s) => [s.name, s]));
		const toMap = new Map(toSkills.map((s) => [s.name, s]));

		const toSummary = (s: (typeof fromSkills)[number]): IntentSkillSummary => ({
			id: s.id,
			name: s.name,
			description: s.description,
			type: s.type,
			framework: s.framework,
			requires: s.requires,
			skillPath: s.skillPath,
			contentHash: s.contentHash,
			lineCount: s.lineCount,
		});

		const diff: SkillDiff = {
			added: [],
			removed: [],
			modified: [],
			unchanged: [],
		};

		for (const [name, toSkill] of toMap) {
			const fromSkill = fromMap.get(name);
			if (!fromSkill) {
				diff.added.push(toSummary(toSkill));
			} else if (fromSkill.contentHash !== toSkill.contentHash) {
				diff.modified.push({
					from: toSummary(fromSkill),
					to: toSummary(toSkill),
				});
			} else {
				diff.unchanged.push(toSummary(toSkill));
			}
		}

		for (const [name, fromSkill] of fromMap) {
			if (!toMap.has(name)) {
				diff.removed.push(toSummary(fromSkill));
			}
		}

		return {
			packageName: data.packageName,
			fromVersion: data.fromVersion,
			toVersion: data.toVersion,
			diff,
		};
	});

// ---------------------------------------------------------------------------
// Skill history sparkline data (last N versions per package, batch)
// ---------------------------------------------------------------------------

export const getIntentSkillHistory = createServerFn({ method: 'GET' })
	.validator(
		v.object({
			packageNames: v.pipe(v.array(npmPackageNameSchema), v.maxLength(12)),
			limit: v.optional(intentLimitSchema),
		}),
	)
	.handler(async ({ data }): Promise<Record<string, Array<SkillHistoryEntry>>> => {
		const { packageNames, limit = 10 } = data;
		const result: Record<string, Array<SkillHistoryEntry>> = {};

		await Promise.all(
			packageNames.map(async (name) => {
				const allVersions = await fetchCached({
					key: `intent:versions:${name}`,
					ttl: 10 * 60 * 1000,
					fn: () => getPackageVersions(name),
				});

				// getPackageVersions returns newest-first; reverse to chronological,
				// then take the last N
				const versions = allVersions.slice().reverse().slice(-limit);
				if (versions.length === 0) {
					result[name] = [];
					return;
				}

				// Fetch fingerprints for all versions in parallel
				const fingerprints = await Promise.all(
					versions.map((ver) =>
						fetchCached({
							key: `intent:fingerprints:${ver.id}`,
							ttl: 30 * 60 * 1000,
							fn: () => getSkillFingerprintsForVersion(ver.id),
						}),
					),
				);

				const entries: Array<SkillHistoryEntry> = [];

				for (let i = 0; i < versions.length; i++) {
					const ver = versions[i];
					const current = fingerprints[i];
					const currentMap = new Map(current.map((s) => [s.name, s.contentHash]));

					if (i === 0) {
						entries.push({
							version: ver.version,
							total: current.length,
							added: current.length,
							removed: 0,
							modified: 0,
						});
					} else {
						const prev = fingerprints[i - 1];
						const prevMap = new Map(prev.map((s) => [s.name, s.contentHash]));

						let added = 0;
						let modified = 0;
						for (const [name, hash] of currentMap) {
							const prevHash = prevMap.get(name);
							if (prevHash === undefined) added++;
							else if (prevHash !== hash) modified++;
						}

						let removed = 0;
						for (const name of prevMap.keys()) {
							if (!currentMap.has(name)) removed++;
						}

						entries.push({
							version: ver.version,
							total: current.length,
							added,
							removed,
							modified,
						});
					}
				}

				result[name] = entries;
			}),
		);

		return result;
	});

// ---------------------------------------------------------------------------
// Package changelog (named skill diffs per consecutive version pair)
// ---------------------------------------------------------------------------

export interface ChangelogEntry {
	version: string;
	publishedAt: Date | null;
	total: number;
	diff: SkillDiff | null;
}

export const getIntentPackageChangelog = createServerFn({ method: 'GET' })
	.validator(
		v.object({
			packageName: npmPackageNameSchema,
			limit: v.optional(intentLimitSchema),
		}),
	)
	.handler(async ({ data }): Promise<Array<ChangelogEntry>> => {
		const { packageName, limit = 20 } = data;

		const allVersions = await fetchCached({
			key: `intent:versions:${packageName}`,
			ttl: 10 * 60 * 1000,
			fn: () => getPackageVersions(packageName),
		});

		// Newest-first from DB; reverse to chronological, take last N
		const versions = allVersions.slice().reverse().slice(-limit);
		if (versions.length === 0) return [];

		// Fetch all skills for each version (uses content-addressed caching)
		const allSkills = await Promise.all(
			versions.map((ver) =>
				fetchCached({
					key: `intent:skills:${ver.id}`,
					ttl: 30 * 60 * 1000,
					fn: () => getSkillsForVersion(ver.id),
				}),
			),
		);

		const toSummary = (s: (typeof allSkills)[number][number]): IntentSkillSummary => ({
			id: s.id,
			name: s.name,
			description: s.description,
			type: s.type,
			framework: s.framework,
			requires: s.requires,
			skillPath: s.skillPath,
			contentHash: s.contentHash,
			lineCount: s.lineCount,
		});

		const entries: Array<ChangelogEntry> = [];

		for (let i = 0; i < versions.length; i++) {
			const ver = versions[i];
			const currentSkills = allSkills[i];

			if (i === 0) {
				// First version in window — all skills are "added", no prior to diff against
				entries.push({
					version: ver.version,
					publishedAt: ver.publishedAt,
					total: currentSkills.length,
					diff: {
						added: currentSkills.map(toSummary),
						removed: [],
						modified: [],
						unchanged: [],
					},
				});
				continue;
			}

			const prevSkills = allSkills[i - 1];
			const prevMap = new Map(prevSkills.map((s) => [s.name, s]));
			const currMap = new Map(currentSkills.map((s) => [s.name, s]));

			const diff: SkillDiff = {
				added: [],
				removed: [],
				modified: [],
				unchanged: [],
			};

			for (const [name, curr] of currMap) {
				const prev = prevMap.get(name);
				if (!prev) {
					diff.added.push(toSummary(curr));
				} else if (prev.contentHash !== curr.contentHash) {
					diff.modified.push({
						from: toSummary(prev),
						to: toSummary(curr),
					});
				} else {
					diff.unchanged.push(toSummary(curr));
				}
			}

			for (const [name, prev] of prevMap) {
				if (!currMap.has(name)) {
					diff.removed.push(toSummary(prev));
				}
			}

			entries.push({
				version: ver.version,
				publishedAt: ver.publishedAt,
				total: currentSkills.length,
				diff,
			});
		}

		// Return newest-first for display
		return entries.reverse();
	});

// ---------------------------------------------------------------------------
// Skill content diff between two versions (for inline diff viewer)
// ---------------------------------------------------------------------------

export const getIntentSkillContentDiff = createServerFn({ method: 'GET' })
	.validator(
		v.object({
			packageName: npmPackageNameSchema,
			skillName: intentSkillNameSchema,
			fromVersion: intentVersionSchema,
			toVersion: intentVersionSchema,
		}),
	)
	.handler(async ({ data }) => {
		const versions = await getPackageVersions(data.packageName);

		const fromRecord = versions.find((ver) => ver.version === data.fromVersion);
		const toRecord = versions.find((ver) => ver.version === data.toVersion);

		if (!fromRecord || !toRecord) return null;

		const [fromSkills, toSkills] = await Promise.all([
			fetchCached({
				key: `intent:skills:${fromRecord.id}`,
				ttl: 30 * 60 * 1000,
				fn: () => getSkillsForVersion(fromRecord.id),
			}),
			fetchCached({
				key: `intent:skills:${toRecord.id}`,
				ttl: 30 * 60 * 1000,
				fn: () => getSkillsForVersion(toRecord.id),
			}),
		]);

		const fromSkill = fromSkills.find((s) => s.name === data.skillName);
		const toSkill = toSkills.find((s) => s.name === data.skillName);

		return {
			fromContent: fromSkill?.content ?? null,
			toContent: toSkill?.content ?? null,
			fromVersion: data.fromVersion,
			toVersion: data.toVersion,
		};
	});

// ---------------------------------------------------------------------------
// Single-skill version history (how one skill evolved across versions)
// ---------------------------------------------------------------------------

export interface SkillVersionEntry {
	version: string;
	publishedAt: Date | null;
	status: 'added' | 'modified' | 'unchanged' | 'removed';
	skill: IntentSkillSummary | null;
	lineCountDelta: number | null;
}

export const getIntentSingleSkillHistory = createServerFn({ method: 'GET' })
	.validator(
		v.object({
			packageName: npmPackageNameSchema,
			skillName: intentSkillNameSchema,
		}),
	)
	.handler(async ({ data }): Promise<Array<SkillVersionEntry>> => {
		const allVersions = await fetchCached({
			key: `intent:versions:${data.packageName}`,
			ttl: 10 * 60 * 1000,
			fn: () => getPackageVersions(data.packageName),
		});

		// Newest-first from DB; reverse to chronological
		const versions = allVersions.slice().reverse();
		if (versions.length === 0) return [];

		// Fetch fingerprints for each version (lightweight)
		const allFingerprints = await Promise.all(
			versions.map((ver) =>
				fetchCached({
					key: `intent:fingerprints:${ver.id}`,
					ttl: 30 * 60 * 1000,
					fn: () => getSkillFingerprintsForVersion(ver.id),
				}),
			),
		);

		// For versions where the skill exists, fetch full skill data
		const skillDataByVersion = await Promise.all(
			versions.map(async (ver, i) => {
				const fp = allFingerprints[i].find((s) => s.name === data.skillName);
				if (!fp) return null;
				// Fetch full skills and find the one we want
				const skills = await fetchCached({
					key: `intent:skills:${ver.id}`,
					ttl: 30 * 60 * 1000,
					fn: () => getSkillsForVersion(ver.id),
				});
				return skills.find((s) => s.name === data.skillName) ?? null;
			}),
		);

		const toSummary = (
			s: NonNullable<(typeof skillDataByVersion)[number]>,
		): IntentSkillSummary => ({
			id: s.id,
			name: s.name,
			description: s.description,
			type: s.type,
			framework: s.framework,
			requires: s.requires,
			skillPath: s.skillPath,
			contentHash: s.contentHash,
			lineCount: s.lineCount,
		});

		const entries: Array<SkillVersionEntry> = [];

		for (let i = 0; i < versions.length; i++) {
			const ver = versions[i];
			const current = skillDataByVersion[i];
			const prev = i > 0 ? skillDataByVersion[i - 1] : null;

			if (!current) {
				if (prev) {
					entries.push({
						version: ver.version,
						publishedAt: ver.publishedAt,
						status: 'removed',
						skill: null,
						lineCountDelta: prev ? -prev.lineCount : null,
					});
				}
				continue;
			}

			if (!prev) {
				entries.push({
					version: ver.version,
					publishedAt: ver.publishedAt,
					status: 'added',
					skill: toSummary(current),
					lineCountDelta: current.lineCount,
				});
			} else if (prev.contentHash !== current.contentHash) {
				entries.push({
					version: ver.version,
					publishedAt: ver.publishedAt,
					status: 'modified',
					skill: toSummary(current),
					lineCountDelta: current.lineCount - prev.lineCount,
				});
			} else {
				entries.push({
					version: ver.version,
					publishedAt: ver.publishedAt,
					status: 'unchanged',
					skill: toSummary(current),
					lineCountDelta: 0,
				});
			}
		}

		// Return newest-first for display
		return entries.reverse();
	});
