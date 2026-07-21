import { createGunzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import extract from 'tar-stream';
import { fetchWithTimeout } from './outbound-fetch.server';

// ---------------------------------------------------------------------------
// NPM Registry API types
// ---------------------------------------------------------------------------

export interface NpmSearchResult {
	objects: Array<{
		package: {
			name: string;
			version: string;
			description: string;
			keywords?: Array<string>;
			date: string;
			links: {
				npm?: string;
				homepage?: string;
				repository?: string;
				bugs?: string;
			};
			publisher?: { username: string; email: string };
			maintainers: Array<{ username: string; email: string }>;
		};
		score: {
			final: number;
			detail: { quality: number; popularity: number; maintenance: number };
		};
		downloads?: { monthly: number; weekly: number };
	}>;
	total: number;
	time: string;
}

export interface NpmPackument {
	name: string;
	description?: string;
	'dist-tags': Record<string, string>;
	versions: Record<
		string,
		{
			name: string;
			version: string;
			description?: string;
			keywords?: Array<string>;
			homepage?: string;
			repository?: { type: string; url: string } | string;
			bin?: Record<string, string>;
			dist: {
				tarball: string;
				shasum: string;
				integrity?: string;
				fileCount?: number;
				unpackedSize?: number;
			};
			time?: string;
		}
	>;
	time: Record<string, string>;
}

export interface ParsedSkill {
	name: string;
	description: string;
	type?: string;
	framework?: string;
	requires?: Array<string>;
	contentHash: string;
	content: string;
	lineCount: number;
	skillPath: string;
}

// ---------------------------------------------------------------------------
// NPM Registry fetch helpers
// ---------------------------------------------------------------------------

const NPM_REGISTRY = 'https://registry.npmjs.org';
const NPM_FETCH_TIMEOUT_MS = 10_000;
const MAX_TARBALL_BYTES = 20 * 1024 * 1024;
const MAX_SKILL_FILE_BYTES = 256 * 1024;
const MAX_SKILLS_PER_TARBALL = 100;
const MAX_INTENT_SEARCH_RESULTS = 1_000;
const ALLOWED_TARBALL_HOSTS = new Set(['registry.npmjs.org', 'registry.npmjs.com']);

async function cancelUnusedResponseBody(response: Response): Promise<void> {
	if (!response.body) return;

	try {
		await response.body.cancel();
	} catch {
		// Best effort cleanup for responses we intentionally do not read.
	}
}

async function parseJsonIfOk<T>(response: Response): Promise<T | null> {
	if (!response.ok) {
		await cancelUnusedResponseBody(response);
		return null;
	}

	return response.json();
}

async function fetchNpmSearch(url: string): Promise<NpmSearchResult> {
	const res = await fetchWithTimeout(url, {
		headers: { Accept: 'application/json' },
		timeoutMs: NPM_FETCH_TIMEOUT_MS,
	});

	if (!res.ok) {
		await cancelUnusedResponseBody(res);
		throw new Error(`NPM search failed: ${res.status} ${res.statusText}`);
	}

	const data: NpmSearchResult = await res.json();
	return data;
}

function validateNpmTarballUrl(tarballUrl: string) {
	try {
		const url = new URL(tarballUrl);
		return (
			url.protocol === 'https:' &&
			ALLOWED_TARBALL_HOSTS.has(url.hostname.toLowerCase()) &&
			!url.pathname.includes('..')
		);
	} catch {
		return false;
	}
}

function createByteLimitStream(maxBytes: number, label: string) {
	let totalBytes = 0;

	return new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			totalBytes += chunk.byteLength;
			if (totalBytes > maxBytes) {
				callback(new Error(`${label} exceeds ${maxBytes} bytes`));
				return;
			}

			callback(null, chunk);
		},
	});
}

function isSafeSkillPath(skillPath: string) {
	return (
		skillPath.length > 0 &&
		skillPath.length <= 240 &&
		!skillPath.includes('\\') &&
		skillPath
			.split('/')
			.every(
				(segment) =>
					segment && segment !== '.' && segment !== '..' && /^[a-z0-9._-]+$/i.test(segment),
			)
	);
}

export async function searchIntentPackages(): Promise<NpmSearchResult> {
	const results: NpmSearchResult = { objects: [], total: 0, time: '' };
	let from = 0;
	const size = 250;

	while (true) {
		const url = `${NPM_REGISTRY}/-/v1/search?text=keywords:tanstack-intent&size=${size}&from=${from}`;
		const page = await fetchNpmSearch(url);

		results.objects.push(...page.objects);
		results.total = page.total;
		results.time = page.time;

		from += size;
		if (
			from >= page.total ||
			page.objects.length === 0 ||
			results.objects.length >= MAX_INTENT_SEARCH_RESULTS
		) {
			results.objects = results.objects.slice(0, MAX_INTENT_SEARCH_RESULTS);
			results.total = Math.min(results.total, MAX_INTENT_SEARCH_RESULTS);
			break;
		}
	}

	return results;
}

export async function searchIntentPackagesByText(search: string): Promise<NpmSearchResult> {
	return fetchNpmSearch(
		`${NPM_REGISTRY}/-/v1/search?text=${encodeURIComponent(search)}+keywords:tanstack-intent&size=250`,
	);
}

// ---------------------------------------------------------------------------
// NPM download counts (separate API from the registry)
// ---------------------------------------------------------------------------

const NPM_DOWNLOADS_API = 'https://api.npmjs.org';

export interface NpmDownloadCounts {
	[packageName: string]: { downloads: number; start: string; end: string };
}

// Fetch last-month download counts for a list of package names.
// Scoped packages (@org/pkg) must be fetched individually; unscoped can be
// bulk-fetched in a single comma-separated request.
export async function fetchBulkDownloads(names: Array<string>): Promise<Map<string, number>> {
	const result = new Map<string, number>();
	if (names.length === 0) return result;

	const scoped = names.filter((n) => n.startsWith('@'));
	const unscoped = names.filter((n) => !n.startsWith('@'));

	// Bulk fetch unscoped (npm supports comma-separated bulk endpoint)
	// Chunk into batches of 128 to stay under URL length limits
	const CHUNK = 128;
	const unscopedFetches: Array<Promise<void>> = [];
	for (let i = 0; i < unscoped.length; i += CHUNK) {
		const batch = unscoped.slice(i, i + CHUNK);
		unscopedFetches.push(
			fetchWithTimeout(`${NPM_DOWNLOADS_API}/downloads/point/last-month/${batch.join(',')}`, {
				timeoutMs: NPM_FETCH_TIMEOUT_MS,
			})
				.then((r) => parseJsonIfOk<NpmDownloadCounts>(r))
				.then((data) => {
					if (!data) return;
					for (const [name, info] of Object.entries(data)) {
						if (info?.downloads != null) {
							result.set(name, info.downloads);
						}
					}
				})
				.catch(() => {}),
		);
	}

	// Scoped packages: individual fetches in parallel
	const SCOPED_CONCURRENCY = 8;
	await Promise.all(unscopedFetches);

	for (let i = 0; i < scoped.length; i += SCOPED_CONCURRENCY) {
		await Promise.all(
			scoped.slice(i, i + SCOPED_CONCURRENCY).map((name) =>
				fetchWithTimeout(`${NPM_DOWNLOADS_API}/downloads/point/last-month/${name}`, {
					timeoutMs: NPM_FETCH_TIMEOUT_MS,
				})
					.then((r) => parseJsonIfOk<{ downloads: number; package: string }>(r))
					.then((data) => {
						if (data?.downloads != null) {
							result.set(name, data.downloads);
						}
					})
					.catch(() => {}),
			),
		);
	}

	return result;
}

export async function fetchPackument(name: string): Promise<NpmPackument> {
	const encoded = name.startsWith('@')
		? `@${encodeURIComponent(name.slice(1))}`
		: encodeURIComponent(name);
	const url = `${NPM_REGISTRY}/${encoded}`;
	const res = await fetchWithTimeout(url, {
		headers: { Accept: 'application/json' },
		timeoutMs: NPM_FETCH_TIMEOUT_MS,
	});
	if (!res.ok) {
		await cancelUnusedResponseBody(res);
		throw new Error(`Failed to fetch packument for ${name}: ${res.status} ${res.statusText}`);
	}
	return (await res.json()) as NpmPackument;
}

// ---------------------------------------------------------------------------
// Intent compatibility check
// ---------------------------------------------------------------------------

export function isIntentCompatible(versionMeta: NpmPackument['versions'][string]): boolean {
	return versionMeta.keywords?.includes('tanstack-intent') ?? false;
}

// ---------------------------------------------------------------------------
// Version selection: latest + up to 4 others published today (total max 5)
// ---------------------------------------------------------------------------

// Returns versions to enqueue: latest + up to 4 others published today (UTC),
// excluding any already known to the DB (regardless of their sync status --
// don't re-enqueue what's already pending, failed, or synced).
// Versions published before today are skipped to avoid exhausting resources
// crawling thousands of historical versions that predate skills support.
export function selectVersionsToSync(
	packument: NpmPackument,
	knownVersions: Set<string>,
): Array<{ version: string; tarball: string; publishedAt: Date | null }> {
	const latestVersion = packument['dist-tags'].latest;
	if (!latestVersion) return [];

	// Collect all versions sorted newest-first by publish time
	const allVersions = Object.entries(packument.versions)
		.map(([version, meta]) => ({
			version,
			tarball: meta.dist.tarball,
			publishedAt: packument.time[version] ? new Date(packument.time[version]) : null,
		}))
		.sort((a, b) => {
			if (!a.publishedAt || !b.publishedAt) return 0;
			return b.publishedAt.getTime() - a.publishedAt.getTime();
		});

	const toEnqueue: Array<{
		version: string;
		tarball: string;
		publishedAt: Date | null;
	}> = [];

	// Latest first
	const latestMeta = packument.versions[latestVersion];
	if (!knownVersions.has(latestVersion) && latestMeta) {
		toEnqueue.push({
			version: latestVersion,
			tarball: latestMeta.dist.tarball,
			publishedAt: packument.time[latestVersion] ? new Date(packument.time[latestVersion]) : null,
		});
	}

	// Only consider versions published today (UTC) or later.
	const startOfToday = new Date();
	startOfToday.setUTCHours(0, 0, 0, 0);

	// Fill remaining slots (max 4 more) newest-to-oldest, skipping old versions
	for (const v of allVersions) {
		if (toEnqueue.length >= 5) break;
		if (v.version === latestVersion) continue;
		if (knownVersions.has(v.version)) continue;
		if (!v.publishedAt || v.publishedAt < startOfToday) continue;
		toEnqueue.push(v);
	}

	return toEnqueue;
}

// ---------------------------------------------------------------------------
// Tarball extraction + skill parsing
// ---------------------------------------------------------------------------

// Extract and parse all SKILL.md files from an npm tarball URL.
// Only files matching `package/skills/**/SKILL.md` are read; the rest
// of the tarball is streamed past without buffering.
export async function extractSkillsFromTarball(tarballUrl: string): Promise<Array<ParsedSkill>> {
	if (!validateNpmTarballUrl(tarballUrl)) {
		throw new Error(`Invalid tarball URL: ${tarballUrl}`);
	}

	const res = await fetchWithTimeout(tarballUrl, {
		headers: { Accept: 'application/octet-stream' },
		timeoutMs: NPM_FETCH_TIMEOUT_MS,
	});
	if (!res.ok) {
		await cancelUnusedResponseBody(res);
		throw new Error(`Failed to download tarball ${tarballUrl}: ${res.status} ${res.statusText}`);
	}
	if (!res.body) {
		throw new Error(`Tarball response body is null: ${tarballUrl}`);
	}

	const contentLength = res.headers.get('content-length');
	if (contentLength) {
		const parsedLength = Number(contentLength);
		if (!Number.isFinite(parsedLength) || parsedLength < 0) {
			throw new Error(`Invalid tarball content-length: ${tarballUrl}`);
		}
		if (parsedLength > MAX_TARBALL_BYTES) {
			throw new Error(`Tarball is too large: ${tarballUrl}`);
		}
	}

	const skills: Array<ParsedSkill> = [];

	await new Promise<void>((resolve, reject) => {
		const extractor = extract.extract();

		extractor.on(
			'entry',
			(header: { name: string }, stream: NodeJS.ReadableStream, next: () => void) => {
				// npm tarballs have paths like `package/skills/core/SKILL.md`
				const isSkillFile = /^package\/skills\/.+\/SKILL\.md$/i.test(header.name);

				if (!isSkillFile) {
					// Drain the stream without buffering
					stream.resume();
					stream.on('end', next);
					return;
				}

				if (skills.length >= MAX_SKILLS_PER_TARBALL) {
					stream.resume();
					stream.on('end', () => {
						reject(new Error('Tarball contains too many skills'));
					});
					stream.on('error', reject);
					return;
				}

				// Extract the skill directory path: `package/skills/foo/bar/SKILL.md` -> `foo/bar`
				const skillPath = header.name
					.replace(/^package\/skills\//i, '')
					.replace(/\/SKILL\.md$/i, '');

				if (!isSafeSkillPath(skillPath)) {
					stream.resume();
					stream.on('end', next);
					stream.on('error', reject);
					return;
				}

				const chunks: Array<Buffer> = [];
				let skillBytes = 0;
				let skillTooLarge = false;
				stream.on('data', (chunk: Buffer) => {
					if (skillTooLarge) return;
					skillBytes += chunk.byteLength;
					if (skillBytes > MAX_SKILL_FILE_BYTES) {
						skillTooLarge = true;
						chunks.length = 0;
						reject(new Error(`Skill file is too large: ${skillPath}`));
						stream.resume();
						return;
					}
					chunks.push(chunk);
				});
				stream.on('end', () => {
					if (skillTooLarge) return;
					const content = Buffer.concat(chunks).toString('utf8');
					const parsed = parseSkillFile(content, skillPath);
					if (parsed) skills.push(parsed);
					next();
				});
				stream.on('error', reject);
			},
		);

		extractor.on('finish', resolve);
		extractor.on('error', reject);

		// Web ReadableStream -> Node Readable -> gunzip -> tar extractor
		const nodeReadable = Readable.fromWeb(res.body as import('stream/web').ReadableStream);
		nodeReadable
			.pipe(createByteLimitStream(MAX_TARBALL_BYTES, 'Tarball'))
			.pipe(createGunzip())
			.pipe(extractor);
	});

	return skills;
}

// ---------------------------------------------------------------------------
// SKILL.md frontmatter parser
// ---------------------------------------------------------------------------

export function parseSkillFile(content: string, skillPath = ''): ParsedSkill | null {
	const lines = content.split('\n');
	const lineCount = lines.length;

	// Frontmatter must start with `---` on line 1
	if (lines[0]?.trim() !== '---') return null;

	const closingIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
	if (closingIdx === -1) return null;

	const frontmatterLines = lines.slice(1, closingIdx);
	const frontmatter = parseFrontmatter(frontmatterLines);

	const name = frontmatter.name;
	const description = frontmatter.description ?? '';

	if (!name || !description) return null;

	const contentHash = createHash('sha256').update(content).digest('hex');

	return {
		name: String(name),
		description: String(description),
		type: frontmatter.type ? String(frontmatter.type) : undefined,
		framework: frontmatter.framework ? String(frontmatter.framework) : undefined,
		requires: Array.isArray(frontmatter.requires) ? frontmatter.requires.map(String) : undefined,
		contentHash,
		content,
		lineCount,
		skillPath,
	};
}

// Minimal YAML frontmatter parser covering the subset used in SKILL.md files.
// Handles: plain scalars, quoted strings, and simple sequence lists (- item).
function parseFrontmatter(lines: Array<string>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	let currentKey: string | null = null;
	let inList = false;
	let inFolded = false; // collecting a `>` or `|` multi-line value

	for (const raw of lines) {
		const line = raw.trimEnd();

		// Skip comments
		if (line.trimStart().startsWith('#')) continue;

		// Continuation line for folded/literal block scalar
		if (inFolded && currentKey !== null && line.match(/^\s+/)) {
			const existing = result[currentKey];
			const chunk = line.trim();
			result[currentKey] = existing ? `${existing} ${chunk}` : chunk;
			continue;
		} else {
			inFolded = false;
		}

		// List item
		if (line.match(/^\s+-\s+/)) {
			if (currentKey && inList) {
				const existing = result[currentKey];
				const item = line
					.replace(/^\s+-\s+/, '')
					.trim()
					.replace(/^["']|["']$/g, '');
				if (Array.isArray(existing)) {
					existing.push(item);
				} else {
					result[currentKey] = [item];
				}
			}
			continue;
		}

		// Key: value
		const kvMatch = line.match(/^(\w[\w_-]*):\s*(.*)$/);
		if (kvMatch) {
			inList = false;
			currentKey = kvMatch[1];
			const rawVal = kvMatch[2].trim();

			if (rawVal === '|' || rawVal === '>') {
				// Multi-line block scalar -- collect indented continuation lines
				result[currentKey] = '';
				inFolded = true;
			} else if (rawVal === '') {
				result[currentKey] = '';
			} else if (rawVal === '[]') {
				result[currentKey] = [];
				inList = true;
			} else {
				result[currentKey] = rawVal.replace(/^["']|["']$/g, '');
			}
			continue;
		}
	}

	return result;
}
