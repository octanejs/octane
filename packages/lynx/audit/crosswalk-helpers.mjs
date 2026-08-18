import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export function globToRegExp(glob) {
	let expression = '^';
	for (let index = 0; index < glob.length; index++) {
		const character = glob[index];
		if (character === '*' && glob[index + 1] === '*') {
			if (glob[index + 2] === '/') {
				expression += '(?:.*/)?';
				index += 2;
			} else {
				expression += '.*';
				index++;
			}
		} else if (character === '*') {
			expression += '[^/]*';
		} else {
			expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
		}
	}
	return new RegExp(`${expression}$`);
}

export function compareCodeUnits(first, second) {
	return first < second ? -1 : first > second ? 1 : 0;
}

export function normalizeCrosswalkPath(file) {
	return file.replaceAll(path.win32.sep, path.posix.sep);
}

export async function walkFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((entry) => {
			const entryPath = path.join(directory, entry.name);
			return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
		}),
	);
	return nested.flat();
}

export function expectedRustSources(crosswalk) {
	const sources = crosswalk.testInventory.rustSources;
	assert(Array.isArray(sources), 'Rust test source metadata must be an array');
	assert.equal(
		new Set(sources.map((entry) => entry.source)).size,
		sources.length,
		'Rust test source metadata contains duplicates',
	);
	for (const entry of sources) {
		assert.equal(typeof entry.source, 'string', 'Rust test source path must be a string');
		assert(Number.isInteger(entry.caseCount) && entry.caseCount > 0, `${entry.source} case count`);
	}
	assert.deepEqual(
		sources,
		[...sources].sort((a, b) => compareCodeUnits(a.source, b.source)),
		'Rust test source metadata must be canonically sorted',
	);
	assert.equal(sources.length, crosswalk.testInventory.rustSourceFileCount);
	assert.equal(
		sources.reduce((total, entry) => total + entry.caseCount, 0),
		crosswalk.testInventory.rustCaseCount,
	);
	return sources;
}

export function summarizeRustSources(cases) {
	const counts = new Map();
	for (const entry of cases) {
		counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
	}
	return [...counts]
		.map(([source, caseCount]) => ({ source, caseCount }))
		.sort((a, b) => compareCodeUnits(a.source, b.source));
}

export async function discoverRustTestCases(upstreamRoot, crosswalk) {
	const files = await walkFiles(path.join(upstreamRoot, 'packages/react/transform'));
	const cases = [];
	for (const file of files) {
		if (!file.endsWith('.rs')) continue;
		const lines = (await readFile(file, 'utf8')).split(/\r?\n/u);
		const source = normalizeCrosswalkPath(path.relative(upstreamRoot, file));
		for (let index = 0; index < lines.length; index++) {
			if (/^\s*#\[\s*test\s*\]\s*$/u.test(lines[index])) {
				let declarationIndex = index + 1;
				while (
					declarationIndex < lines.length &&
					(/^\s*$/u.test(lines[declarationIndex]) ||
						/^\s*#\[[^\]]+\]\s*$/u.test(lines[declarationIndex]))
				) {
					declarationIndex++;
				}
				const declaration = lines[declarationIndex] ?? '';
				const functionMatch = declaration.match(
					/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u,
				);
				if (functionMatch !== null) {
					cases.push({
						source,
						line: declarationIndex + 1,
						name: functionMatch[1],
						locationKind: 'definition',
						classification: crosswalk.testInventory.rustClassification,
					});
					continue;
				}
				// A #[test] inside a macro definition is a template, not itself a
				// runnable case. The concrete invocation names are recorded below.
				assert.match(
					declaration,
					/^\s*fn\s+\$name\s*\(/u,
					`${source}:${index + 1} has an unsupported Rust test declaration`,
				);
			}

			if (/^\s*et_snapshot_test!\s*\(\s*$/u.test(lines[index])) {
				let nameIndex = index + 1;
				while (nameIndex < lines.length && /^\s*$/u.test(lines[nameIndex])) nameIndex++;
				const nameMatch = (lines[nameIndex] ?? '').match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*$/u);
				assert(nameMatch, `${source}:${index + 1} has an unsupported Rust test macro invocation`);
				cases.push({
					source,
					line: nameIndex + 1,
					name: nameMatch[1],
					locationKind: 'macro-invocation',
					classification: crosswalk.testInventory.rustClassification,
				});
			}
		}
	}
	cases.sort(
		(a, b) =>
			compareCodeUnits(a.source, b.source) || a.line - b.line || compareCodeUnits(a.name, b.name),
	);
	assert.equal(
		new Set(cases.map((entry) => `${entry.source}\0${entry.line}\0${entry.name}`)).size,
		cases.length,
		'Rust test source identities contain duplicates',
	);
	return cases;
}
