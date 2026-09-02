// The pure docs-search engine: sectionizing raw MDX into records and ranking
// them against a query. No imports and no module state, so it runs anywhere —
// the website's search dialog builds its index lazily on top of this (see
// docs-search.ts), and the remote MCP server (mcp/) builds the same index at
// build time from the same sources.
//
// One record per `<h2 id="…">` section — the docs author those anchors by hand
// (see src/content/docs/*.mdx), which is exactly what a result needs to deep
// link to `/docs/<slug>#<id>`. Prose ahead of the first heading becomes the
// document's lede record (no hash). Each record keeps its paragraphs and code
// lines as separate blocks so a result can list the individual matching lines
// under its section heading, rather than one flattened blob.
export interface SearchBlock {
	text: string;
	/** Came from a ``` fence — rendered monospace. */
	code: boolean;
}

export interface DocumentSearchRecord {
	kind: 'doc';
	slug: string;
	docTitle: string;
	/** Anchor id of the `<h2>` this section opens with; '' for the lede. */
	id: string;
	/** Heading text, or the doc title for the lede. */
	title: string;
	blocks: SearchBlock[];
	text: string;
	haystack: string;
	/** Position of the owning doc in the curated registry — the tie-breaker. */
	order: number;
}

export interface PackageSearchRecord {
	kind: 'package';
	/** Canonical project identifier, independent of which authored name matched. */
	key: string;
	/** Canonical first-party package name or community project title. */
	title: string;
	/** Authored package names, aliases, and public entry points, in display order. */
	names: readonly string[];
	purpose: string;
	owner: string;
	url: string;
	normalizedTitle: string;
	normalizedNames: readonly string[];
	normalizedPurpose: string;
	/** Searchable fields only; owner is deliberately excluded. */
	haystack: string;
}

export type SearchRecord = DocumentSearchRecord | PackageSearchRecord;

export interface PackageRecordInput {
	key: string;
	title: string;
	names: readonly string[];
	purpose: string;
	owner: string;
	url: string;
}

export interface DocHeading {
	id: string;
	title: string;
	level: 2 | 3;
}

/** One section of one document, with the lines inside it that matched. */
export interface DocumentSearchResult {
	kind: 'doc';
	key: string;
	slug: string;
	id: string;
	docTitle: string;
	title: string;
	score: number;
	lines: SearchLine[];
}

/** One canonical package/project, regardless of which authored name matched. */
export interface PackageSearchResult {
	kind: 'package';
	key: string;
	title: string;
	matchedName: string;
	purpose: string;
	owner: string;
	url: string;
	score: number;
}

export type SearchResult = DocumentSearchResult | PackageSearchResult;
/** Existing exported name retained while consumers migrate to the discriminant. */
export type SearchGroup = SearchResult;

export interface SearchLine {
	key: string;
	code: boolean;
	/** The line, split so the matched runs can be marked. */
	parts: SnippetPart[];
}

export interface SnippetPart {
	text: string;
	hit: boolean;
	/** Stable key for the `@for` that renders the parts. */
	i: number;
}

/** Strip JSX/HTML tags and markdown syntax off a run of prose. */
function cleanProse(raw: string): string {
	return (
		raw
			// MDX callouts use a string expression when plain Markdown would create a
			// nested paragraph inside an authored <p>. Keep the authored sentence in
			// search results without exposing the expression braces or quotes.
			.replace(/\{\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1\s*\}/g, (_match, _quote, value: string) =>
				value.replace(/\\(['"`\\])/g, '$1'),
			)
			.replace(/<[^>]+>/g, ' ')
			.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
			.replace(/[`*_>#|]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

/**
 * Split a section's MDX into the lines a result can show: prose paragraphs
 * (blank-line separated) and, inside ``` fences, each code line on its own —
 * matching a code line is often the most useful answer ("what's the import?").
 */
function blocksFor(raw: string): SearchBlock[] {
	const blocks: SearchBlock[] = [];
	let paragraph: string[] = [];
	let inFence = false;

	const flushParagraph = () => {
		const text = cleanProse(paragraph.join(' '));
		paragraph = [];
		if (text.length > 2) blocks.push({ text, code: false });
	};

	for (const line of raw.split('\n')) {
		if (line.trimStart().startsWith('```')) {
			flushParagraph();
			inFence = !inFence;
			continue;
		}
		if (inFence) {
			const text = line.trim();
			if (text) blocks.push({ text, code: true });
			continue;
		}
		if (line.trim() === '') flushParagraph();
		else paragraph.push(line);
	}
	flushParagraph();
	return blocks;
}

const HEADING = /<h2\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g;
const DOC_HEADING = /<h([23])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;

/** Read the authored section anchors and their rendered titles from raw MDX. */
export function headingsFor(source: string): DocHeading[] {
	const body = source.replace(/^---[\s\S]*?---/, '');
	DOC_HEADING.lastIndex = 0;
	return Array.from(body.matchAll(DOC_HEADING), (match) => ({
		level: Number(match[1]) as 2 | 3,
		id: match[2],
		title: cleanProse(match[3]),
	}));
}

export function recordsFor(
	slug: string,
	docTitle: string,
	order: number,
	source: string,
): DocumentSearchRecord[] {
	const body = source.replace(/^---[\s\S]*?---/, '');
	const records: DocumentSearchRecord[] = [];
	const push = (id: string, title: string, raw: string) => {
		const blocks = blocksFor(raw);
		const text = blocks.map((b) => b.text).join(' ');
		if (!text) return;
		records.push({
			kind: 'doc',
			slug,
			docTitle,
			id,
			title,
			blocks,
			text,
			haystack: (docTitle + ' ' + title + ' ' + text).toLowerCase(),
			order,
		});
	};

	// Walk the h2 anchors; each section runs to the next one (or to the end).
	HEADING.lastIndex = 0;
	let match = HEADING.exec(body);
	push('', docTitle, body.slice(0, match ? match.index : body.length));
	while (match) {
		const id = match[1];
		const title = cleanProse(match[2]);
		const start = match.index + match[0].length;
		match = HEADING.exec(body);
		push(id, title, body.slice(start, match ? match.index : body.length));
	}
	return records;
}

/** Add metadata-only aliases to one section without putting them in rendered prose. */
export function addSearchTerms(
	record: DocumentSearchRecord | undefined,
	terms: readonly string[] | undefined,
): void {
	if (!record || !terms?.length) return;
	const block = { text: terms.join(' · '), code: false };
	record.blocks.push(block);
	record.text += ' ' + block.text;
	record.haystack += ' ' + block.text.toLowerCase();
}

function normalize(value: string): string {
	return value.normalize('NFKC').trim().toLowerCase();
}

function authoredNameMatches(name: string, value: string): boolean {
	if (name.includes(value)) return true;
	const wildcardAt = name.indexOf('*');
	if (wildcardAt === -1) return false;
	const prefix = name.slice(0, wildcardAt);
	return value.length > prefix.length && value.startsWith(prefix);
}

/** Build one canonical package record from consumer-owned package metadata. */
export function packageRecordFor(input: PackageRecordInput): PackageSearchRecord {
	const names: string[] = [];
	const seen = new Set<string>();
	for (const name of input.names) {
		const normalized = normalize(name);
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		names.push(name);
	}
	if (names.length === 0) names.push(input.title);
	const normalizedTitle = normalize(input.title);
	const normalizedNames = names.map(normalize);
	const normalizedPurpose = normalize(input.purpose);

	return {
		kind: 'package',
		key: input.key,
		title: input.title,
		names,
		purpose: input.purpose,
		owner: input.owner,
		url: input.url,
		normalizedTitle,
		normalizedNames,
		normalizedPurpose,
		haystack: [normalizedTitle, ...normalizedNames, normalizedPurpose].join(' '),
	};
}

function escapeRegExp(term: string): string {
	return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** How many times `needle` appears in `haystack` (both already lowercased). */
function occurrences(haystack: string, needle: string): number {
	let count = 0;
	for (
		let at = haystack.indexOf(needle);
		at !== -1;
		at = haystack.indexOf(needle, at + needle.length)
	) {
		count++;
	}
	return count;
}

/** Split one line on every query term so the caller can mark the matched runs. */
function markLine(text: string, pattern: RegExp): SnippetPart[] {
	// A long prose line is trimmed to a window around its first match.
	pattern.lastIndex = 0;
	const first = pattern.exec(text);
	const start = first && first.index > 90 ? first.index - 60 : 0;
	const body =
		(start > 0 ? '…' : '') +
		text.slice(start, start + 220) +
		(text.length > start + 220 ? '…' : '');

	const parts: SnippetPart[] = [];
	const push = (t: string, hit: boolean) => parts.push({ text: t, hit, i: parts.length });
	pattern.lastIndex = 0;
	let cursor = 0;
	for (let m = pattern.exec(body); m; m = pattern.exec(body)) {
		if (m.index > cursor) push(body.slice(cursor, m.index), false);
		push(m[0], true);
		cursor = m.index + m[0].length;
	}
	if (cursor < body.length) push(body.slice(cursor), false);
	return parts;
}

/**
 * Rank document sections and canonical packages against a query. Every term
 * must appear somewhere in one record (AND). Document scoring is unchanged;
 * package scoring considers only canonical/authored names and purpose, never
 * ownership or catalog source.
 */
export function searchDocs(
	index: readonly DocumentSearchRecord[],
	query: string,
	limit?: number,
	linesPerGroup?: number,
): DocumentSearchResult[];
export function searchDocs(
	index: readonly PackageSearchRecord[],
	query: string,
	limit?: number,
	linesPerGroup?: number,
): PackageSearchResult[];
export function searchDocs(
	index: readonly SearchRecord[],
	query: string,
	limit?: number,
	linesPerGroup?: number,
): SearchResult[];
export function searchDocs(
	index: readonly SearchRecord[],
	query: string,
	limit = 6,
	linesPerGroup = 4,
): SearchResult[] {
	const q = normalize(query);
	if (q.length < 2) return [];
	const terms = q.split(/\s+/);
	const pattern = new RegExp('(' + terms.map(escapeRegExp).join('|') + ')', 'ig');
	const phrasePattern = new RegExp('\\b' + escapeRegExp(q) + '\\b');

	const groups: SearchResult[] = [];
	for (const record of index) {
		if (record.kind === 'package') {
			const title = record.normalizedTitle;
			const names = record.normalizedNames;
			const purpose = record.normalizedPurpose;
			if (
				!terms.every(
					(term) =>
						title.includes(term) ||
						purpose.includes(term) ||
						names.some((name) => authoredNameMatches(name, term)),
				)
			) {
				continue;
			}
			let score = 0;
			for (const term of terms) {
				if (title.includes(term)) score += 8;
				if (names.some((name) => authoredNameMatches(name, term))) score += 8;
				if (purpose.includes(term)) score += 2;
			}
			const exact = names.findIndex((name) => name === q);
			const wildcard = names.findIndex((name) => {
				const wildcardAt = name.indexOf('*');
				return (
					wildcardAt !== -1 && q.length > wildcardAt && q.startsWith(name.slice(0, wildcardAt))
				);
			});
			const containing = names.findIndex((name) => name.includes(q));
			if (exact >= 0 || wildcard >= 0) score += 28;
			else if (containing >= 0) score += 16;
			if (title.includes(q)) score += 12;
			if (purpose.includes(q)) score += 6;
			if (phrasePattern.test(purpose)) score += 4;
			score += Math.min(occurrences(purpose, q), 6) * 2;

			const matchedName =
				record.names[
					exact >= 0 ? exact : wildcard >= 0 ? wildcard : containing >= 0 ? containing : 0
				];
			groups.push({
				kind: 'package',
				key: 'package:' + record.key,
				title: record.title,
				matchedName,
				purpose: record.purpose,
				owner: record.owner,
				url: record.url,
				score,
			});
			continue;
		}

		if (!terms.every((term) => record.haystack.includes(term))) continue;

		const title = record.title.toLowerCase();
		const text = record.text.toLowerCase();
		let score = 0;
		for (const term of terms) {
			if (title.includes(term)) score += 8;
			if (record.docTitle.toLowerCase().includes(term)) score += 4;
			if (text.includes(term)) score += 2;
		}
		if (title.includes(q)) score += 12;
		if (text.includes(q)) score += 6;
		// A whole-word prose hit beats an incidental substring ("state" in "stateful").
		if (new RegExp('\\b' + escapeRegExp(q) + '\\b').test(text)) score += 4;
		// Term frequency: the section that keeps returning to a term is the one
		// that documents it, rather than one that merely uses it in an example.
		score += Math.min(occurrences(text, q), 6) * 2;

		// Prefer lines carrying the whole query, then any single term. A section
		// that only matched through its heading still shows its opening lines.
		const scoreLine = (block: SearchBlock) => {
			const lower = block.text.toLowerCase();
			if (lower.includes(q)) return 2;
			return terms.every((term) => lower.includes(term)) ? 1 : 0;
		};
		const matched = record.blocks.filter((block) => scoreLine(block) > 0);
		const shown = (matched.length > 0 ? matched : record.blocks)
			.slice(0, linesPerGroup)
			.map((block, i) => ({
				key: record.slug + '#' + record.id + ':' + i,
				code: block.code,
				parts: markLine(block.text, pattern),
			}));

		groups.push({
			kind: 'doc',
			key: record.slug + '#' + record.id,
			slug: record.slug,
			id: record.id,
			docTitle: record.docTitle,
			title: record.title,
			score,
			lines: shown,
		});
	}

	// Document ties retain curated registry order. Package ties use their
	// normalized canonical key, never ownership or catalog source.
	const rank = new Map(
		index
			.filter((record): record is DocumentSearchRecord => record.kind === 'doc')
			.map((record) => [record.slug + '#' + record.id, record.order]),
	);
	return groups
		.sort((a, b) => {
			const score = b.score - a.score;
			if (score !== 0) return score;
			if (a.kind === 'doc' && b.kind === 'doc') {
				return (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0);
			}
			if (a.kind === 'package' && b.kind === 'package') {
				const aKey = normalize(a.key);
				const bKey = normalize(b.key);
				return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
			}
			return a.kind === 'package' ? -1 : 1;
		})
		.slice(0, limit);
}
