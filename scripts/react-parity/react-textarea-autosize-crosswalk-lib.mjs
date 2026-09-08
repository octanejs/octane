import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CROSSWALK = 'packages/textarea-autosize/audit/upstream-crosswalk.json';
const PRISTINE = 'packages/textarea-autosize/audit/pristine-runtime.json';
const ADAPTED = 'packages/textarea-autosize/audit/adapted-runtime.json';

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function readJson(root, relativePath) {
	const absolute = resolve(root, relativePath);
	if (!existsSync(absolute)) throw new Error(`missing ${relativePath}`);
	return JSON.parse(readFileSync(absolute, 'utf8'));
}

function findMatchingParen(source, openIndex) {
	let depth = 0;
	let index = openIndex;
	while (index < source.length) {
		const char = source[index];
		if (char === '(') depth++;
		else if (char === ')') {
			depth--;
			if (depth === 0) return index;
		} else if (char === "'" || char === '"' || char === '`') {
			const quote = char;
			index++;
			while (index < source.length) {
				if (source[index] === '\\') {
					index += 2;
					continue;
				}
				if (source[index] === quote) break;
				index++;
			}
		}
		index++;
	}
	return -1;
}

function findMatchingBrace(source, openIndex) {
	let depth = 0;
	let index = openIndex;
	while (index < source.length) {
		const char = source[index];
		if (char === '{') depth++;
		else if (char === '}') {
			depth--;
			if (depth === 0) return index;
		} else if (char === "'" || char === '"' || char === '`') {
			const quote = char;
			index++;
			while (index < source.length) {
				if (source[index] === '\\') {
					index += 2;
					continue;
				}
				if (source[index] === quote) break;
				index++;
			}
		}
		index++;
	}
	return -1;
}

export function extractExpectAssertions(body) {
	const assertions = [];
	let index = 0;
	while (index < body.length) {
		const start = body.indexOf('expect(', index);
		if (start < 0) break;
		if (start > 0 && /[\w$]/.test(body[start - 1])) {
			index = start + 6;
			continue;
		}
		const open = start + 'expect'.length;
		const close = findMatchingParen(body, open);
		if (close < 0) break;
		let end = close + 1;
		while (body[end] === '.') {
			const rest = body.slice(end);
			const notMatch = rest.match(/^\.not\b/);
			if (notMatch) {
				end += notMatch[0].length;
				continue;
			}
			const match = rest.match(/^\.[\w$]+\s*\(/);
			if (!match) break;
			const chainOpen = end + match[0].length - 1;
			const chainClose = findMatchingParen(body, chainOpen);
			if (chainClose < 0) break;
			end = chainClose + 1;
		}
		assertions.push(body.slice(start, end).replace(/\s+/g, ' ').trim());
		index = end;
	}
	return assertions;
}

export function extractItCases(source) {
	const cases = [];
	const pattern = /\bit\(\s*(['"`])([\s\S]*?)\1\s*,/g;
	let match;
	while ((match = pattern.exec(source)) !== null) {
		const title = match[2];
		const afterComma = match.index + match[0].length;
		const brace = source.indexOf('{', afterComma);
		if (brace < 0) continue;
		const close = findMatchingBrace(source, brace);
		if (close < 0) continue;
		cases.push({
			title,
			body: source.slice(brace, close + 1),
		});
	}
	return cases;
}

function caseForFullName(cases, fullName) {
	const matches = cases.filter(function matchTitle(entry) {
		return fullName === entry.title || fullName.endsWith(` ${entry.title}`);
	});
	if (matches.length === 0) {
		throw new Error(`adapted source missing it() case for ${fullName}`);
	}
	if (matches.length > 1) {
		throw new Error(`adapted source has ambiguous it() cases for ${fullName}`);
	}
	return matches[0];
}

export function adaptedAssertionsForCase(source, adaptedFullName) {
	const matched = caseForFullName(extractItCases(source), adaptedFullName);
	const assertions = extractExpectAssertions(matched.body);
	if (assertions.length === 0) {
		throw new Error(`${adaptedFullName}: adapted case has no expect() assertions`);
	}
	return assertions.map(sha256);
}

export function verifyReactTextareaAutosizeCrosswalk(
	root,
	{
		crosswalkPath = CROSSWALK,
		pristinePath = PRISTINE,
		adaptedPath = ADAPTED,
		crosswalk: crosswalkOverride,
		pristine: pristineOverride,
		adapted: adaptedOverride,
		adaptedSources: adaptedSourcesOverride,
	} = {},
) {
	const crosswalk = crosswalkOverride ?? readJson(root, crosswalkPath);
	const pristine = pristineOverride ?? readJson(root, pristinePath);
	const adapted = adaptedOverride ?? readJson(root, adaptedPath);
	if (!Array.isArray(crosswalk.cases) || crosswalk.cases.length === 0) {
		throw new Error('upstream crosswalk must declare at least one case mapping');
	}
	if (crosswalk.cases.length !== pristine.tests.length) {
		throw new Error('upstream crosswalk case count must match pristine inventory');
	}
	if (crosswalk.cases.length !== adapted.tests.length) {
		throw new Error('upstream crosswalk case count must match adapted inventory');
	}
	const pristineNames = new Set(
		pristine.tests.map(function name(entry) {
			return entry.fullName;
		}),
	);
	const adaptedNames = new Set(
		adapted.tests.map(function name(entry) {
			return entry.fullName;
		}),
	);
	const adaptedFiles = new Set(adapted.files ?? []);
	const seenUpstream = new Set();
	const seenAdapted = new Set();
	const sourceCache = new Map();
	for (const entry of crosswalk.cases) {
		if (!entry.upstreamFullName || !entry.adaptedFullName || !entry.adaptedFile) {
			throw new Error(
				'each crosswalk case requires upstreamFullName, adaptedFullName, and adaptedFile',
			);
		}
		if (entry.status !== 'ported') {
			throw new Error(`${entry.upstreamFullName}: crosswalk status must be ported`);
		}
		if (entry.upstreamFullName === entry.adaptedFullName) {
			throw new Error(`${entry.upstreamFullName}: adapted name must differ from pristine`);
		}
		if (!pristineNames.has(entry.upstreamFullName)) {
			throw new Error(
				`crosswalk upstream identity missing from pristine inventory: ${entry.upstreamFullName}`,
			);
		}
		if (!adaptedNames.has(entry.adaptedFullName)) {
			throw new Error(
				`crosswalk adapted identity missing from adapted inventory: ${entry.adaptedFullName}`,
			);
		}
		if (!adaptedFiles.has(entry.adaptedFile)) {
			throw new Error(
				`crosswalk adaptedFile missing from adapted inventory files: ${entry.adaptedFile}`,
			);
		}
		if (!Array.isArray(entry.adaptedAssertions) || entry.adaptedAssertions.length === 0) {
			throw new Error(`${entry.adaptedFullName}: crosswalk must integrity-lock adaptedAssertions`);
		}
		let source = adaptedSourcesOverride?.[entry.adaptedFile];
		if (source === undefined) {
			if (!sourceCache.has(entry.adaptedFile)) {
				const absolute = resolve(root, entry.adaptedFile);
				if (!existsSync(absolute)) {
					throw new Error(`missing adapted source: ${entry.adaptedFile}`);
				}
				sourceCache.set(entry.adaptedFile, readFileSync(absolute, 'utf8'));
			}
			source = sourceCache.get(entry.adaptedFile);
		}
		const liveAssertions = adaptedAssertionsForCase(source, entry.adaptedFullName);
		if (JSON.stringify(liveAssertions) !== JSON.stringify(entry.adaptedAssertions)) {
			throw new Error(
				`${entry.adaptedFullName}: adapted assertion source drifted from crosswalk lock`,
			);
		}
		if (seenUpstream.has(entry.upstreamFullName)) {
			throw new Error(`duplicate crosswalk upstream identity: ${entry.upstreamFullName}`);
		}
		if (seenAdapted.has(entry.adaptedFullName)) {
			throw new Error(`duplicate crosswalk adapted identity: ${entry.adaptedFullName}`);
		}
		seenUpstream.add(entry.upstreamFullName);
		seenAdapted.add(entry.adaptedFullName);
	}
	for (const name of pristineNames) {
		if (!seenUpstream.has(name)) {
			throw new Error(`pristine identity has no crosswalk mapping: ${name}`);
		}
	}
	for (const name of adaptedNames) {
		if (!seenAdapted.has(name)) {
			throw new Error(`adapted identity has no crosswalk mapping: ${name}`);
		}
	}
	return { cases: crosswalk.cases.length };
}
