// Client-side docs search. The index is built from the RAW .mdx sources (the
// compiled documents are components, so their prose is not readable at runtime)
// and is code-split behind a dynamic import: nothing here loads until the user
// actually opens the search dialog.
//
// One record per `<h2 id="…">` section — the docs author those anchors by hand
// (see src/content/docs/*.mdx), which is exactly what a result needs to deep
// link to `/docs/<slug>#<id>`. Prose ahead of the first heading becomes the
// document's lede record (no hash). Each record keeps its paragraphs and code
// lines as separate blocks so a result can list the individual matching lines
// under its section heading, rather than one flattened blob.
import { docs } from '../content/docs.ts';

export interface SearchBlock {
	text: string;
	/** Came from a ``` fence — rendered monospace. */
	code: boolean;
}

export interface SearchRecord {
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

/** One section of one document, with the lines inside it that matched. */
export interface SearchGroup {
	key: string;
	slug: string;
	id: string;
	docTitle: string;
	title: string;
	score: number;
	lines: SearchLine[];
}

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

const rawDocs = import.meta.glob('../content/docs/*.mdx', {
	query: '?raw',
	import: 'default',
}) as Record<string, () => Promise<string>>;

/** `../content/docs/quick-start.mdx` → `quick-start`. */
function slugOf(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1).replace(/\.mdx$/, '');
}

/** Strip JSX/HTML tags and markdown syntax off a run of prose. */
function cleanProse(raw: string): string {
	return raw
		.replace(/<[^>]+>/g, ' ')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[`*_>#|]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
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

function recordsFor(slug: string, docTitle: string, order: number, source: string): SearchRecord[] {
	const body = source.replace(/^---[\s\S]*?---/, '');
	const records: SearchRecord[] = [];
	const push = (id: string, title: string, raw: string) => {
		const blocks = blocksFor(raw);
		const text = blocks.map((b) => b.text).join(' ');
		if (!text) return;
		records.push({
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

let indexPromise: Promise<SearchRecord[]> | null = null;

/** Build (once) and return the flat section index. Safe to call repeatedly. */
export function loadSearchIndex(): Promise<SearchRecord[]> {
	if (!indexPromise) {
		indexPromise = Promise.all(
			Object.entries(rawDocs).map(async ([path, load]) => {
				const slug = slugOf(path);
				const order = docs.findIndex((d) => d.slug === slug);
				const doc = order === -1 ? undefined : docs[order];
				const rank = order === -1 ? docs.length : order;
				return recordsFor(slug, doc?.title ?? slug, rank, await load());
			}),
		).then((groups) => groups.flat());
	}
	return indexPromise;
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
 * Rank sections against a query. Every term must appear somewhere in the
 * section (AND); title matches outrank prose matches, a contiguous phrase
 * outranks scattered terms, and a section that keeps returning to a term
 * outranks one that merely mentions it. Each result carries the individual
 * lines that matched (up to `linesPerGroup`), so the dialog can show them.
 */
export function searchDocs(
	index: readonly SearchRecord[],
	query: string,
	limit = 6,
	linesPerGroup = 4,
): SearchGroup[] {
	const q = query.trim().toLowerCase();
	if (q.length < 2) return [];
	const terms = q.split(/\s+/);
	const pattern = new RegExp('(' + terms.map(escapeRegExp).join('|') + ')', 'ig');

	const groups: SearchGroup[] = [];
	for (const record of index) {
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
			key: record.slug + '#' + record.id,
			slug: record.slug,
			id: record.id,
			docTitle: record.docTitle,
			title: record.title,
			score,
			lines: shown,
		});
	}

	// Ties are common (two docs can both title a section "Install …"), so fall
	// back to the curated registry order — earlier docs are the friendlier answer.
	const rank = new Map(index.map((r) => [r.slug + '#' + r.id, r.order]));
	return groups
		.sort((a, b) => b.score - a.score || (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0))
		.slice(0, limit);
}
