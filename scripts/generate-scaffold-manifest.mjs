// Snapshot the files each `octane create` template writes, so documentation can
// render that list instead of restating it.
//
// The list is captured by running the real command under `--dry-run --json`,
// never by re-reading templates.js. Anything that re-derives it is a second
// implementation of `plan()`, and the second implementation is the one that
// drifts — which is the whole reason this file exists. `--dry-run` writes
// nothing and removes the directory it probed.
//
// packages/create-octane/README.md ships to npm, so it cannot import the
// manifest at render time and its trees stay hand-written. It is checked
// against the snapshot here instead, in both modes: regenerating the JSON
// while leaving the README describing the old file set would defeat the point.
//
// Regenerate with `pnpm scaffold:manifest`; CI runs `pnpm scaffold:manifest:check`.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { MODES } from '../packages/cli/src/commands/init/templates.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(REPO, 'packages/cli/data/scaffold-manifest.json');
const README = path.join(REPO, 'packages/create-octane/README.md');
const CLI = path.join(REPO, 'packages/cli/src/bin/octane.js');

/**
 * Order paths the way a directory listing reads: at every level, files before
 * directories, each alphabetically.
 *
 * Sorted rather than left in `plan()`'s push order, because reordering a
 * `changes.push` is invisible to a user and must not silently reshuffle a
 * published file tree. Compared by code point rather than through
 * `localeCompare`, so a generated baseline cannot depend on the ICU data of the
 * machine that produced it.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
export function comparePaths(left, right) {
	const from = left.split('/');
	const to = right.split('/');
	for (let index = 0; index < Math.min(from.length, to.length); index += 1) {
		// A segment that ends its path names a file; one with more behind it names
		// a directory the path passes through.
		const fromIsFile = index === from.length - 1;
		const toIsFile = index === to.length - 1;
		if (fromIsFile !== toIsFile) return fromIsFile ? -1 : 1;
		if (from[index] !== to[index]) return from[index] < to[index] ? -1 : 1;
	}
	return 0;
}

/**
 * Every path `octane create --template <mode>` would write, from the command
 * itself.
 *
 * @param {string} mode
 * @returns {string[]}
 */
function filesFor(mode) {
	const probe = mkdtempSync(path.join(os.tmpdir(), 'octane-scaffold-'));
	try {
		const stdout = execFileSync(
			process.execPath,
			[CLI, 'create', 'app', '--template', mode, '--dry-run', '--json', '--no-install'],
			{ cwd: probe, encoding: 'utf8' },
		);
		const result = JSON.parse(stdout);
		if (!Array.isArray(result.changes) || result.changes.length === 0) {
			throw new Error(`\`octane create --template ${mode} --dry-run\` reported no files.`);
		}
		return [...result.changes].sort(comparePaths);
	} finally {
		// `--dry-run` already cleans up after itself. This is about the directory
		// that wrapped it, and it also covers the throwing paths above.
		rmSync(probe, { recursive: true, force: true });
	}
}

/**
 * The paths drawn in one of the README's file trees.
 *
 * Indentation is the nesting, and a trailing slash is what makes a line a
 * directory rather than a file, so this is `FileTree.buildTree` run backwards.
 * Only the first token of a line is a path; everything after it is the note.
 *
 * @param {string} text
 * @param {string} mode
 * @returns {string[]}
 */
export function readmePaths(text, mode) {
	const region = new RegExp(`<!-- scaffold:${mode} -->([\\s\\S]*?)<!-- /scaffold:${mode} -->`).exec(
		text,
	);
	if (region === null) {
		throw new Error(`README has no <!-- scaffold:${mode} --> region.`);
	}
	const fence = /```\n([\s\S]*?)```/.exec(region[1]);
	if (fence === null) {
		throw new Error(`The <!-- scaffold:${mode} --> region holds no fenced tree.`);
	}

	/** @type {string[]} */
	const paths = [];
	/** @type {{ indent: number, name: string }[]} */
	const open = [];
	for (const line of fence[1].split('\n')) {
		if (line.trim() === '') continue;
		const indent = line.length - line.trimStart().length;
		while (open.length > 0 && open[open.length - 1].indent >= indent) open.pop();
		const name = line.trim().split(/\s+/)[0];
		if (name.endsWith('/')) open.push({ indent, name: name.slice(0, -1) });
		else paths.push([...open.map((entry) => entry.name), name].join('/'));
	}
	return paths;
}

/**
 * What the README describes, against what the CLI writes.
 *
 * The set of paths is checked, never their order or their notes: a file
 * appearing or disappearing is a fact about the product, and how that README
 * arranges and explains them is editorial.
 *
 * @param {Record<string, string[]>} templates
 * @param {string} text
 * @returns {string[]} one line per disagreement, empty when they agree
 */
export function readmeDisagreements(templates, text) {
	/** @type {string[]} */
	const problems = [];
	for (const [mode, files] of Object.entries(templates)) {
		/** @type {Set<string>} */
		let documented;
		try {
			documented = new Set(readmePaths(text, mode));
		} catch (error) {
			// A template added to MODES with no region written for it yet. Reported
			// as a disagreement rather than thrown, so the run still names every
			// other problem instead of stopping at the first one.
			problems.push(`${mode}: ${/** @type {Error} */ (error).message}`);
			continue;
		}
		const written = new Set(files);
		for (const file of files) {
			if (!documented.has(file)) problems.push(`${mode}: ${file} is written but not documented`);
		}
		for (const file of documented) {
			if (!written.has(file)) problems.push(`${mode}: ${file} is documented but not written`);
		}
	}
	return problems;
}

async function main() {
	const templates = Object.fromEntries(Object.keys(MODES).map((mode) => [mode, filesFor(mode)]));

	// Formatted through prettier, because generated baselines share the repo-wide
	// `pnpm format:check` gate. Emitting hand-chosen indentation here would make
	// the two gates contradict each other.
	const serialized = await format(JSON.stringify({ templates }), {
		...(await resolveConfig(OUTPUT)),
		filepath: OUTPUT,
	});
	const relative = path.relative(REPO, OUTPUT);

	if (process.argv.includes('--check')) {
		let current = '';
		try {
			current = readFileSync(OUTPUT, 'utf8');
		} catch {
			// Treated as a mismatch below.
		}
		if (current !== serialized) {
			console.error(`${relative} is out of date. Run \`pnpm scaffold:manifest\`.`);
			process.exitCode = 1;
		} else {
			console.log(`${relative} is up to date.`);
		}
		// Deliberately not an early return: the README is compared against the
		// freshly computed list either way, so one run names everything that has
		// to change rather than one problem per CI attempt.
	} else {
		mkdirSync(path.dirname(OUTPUT), { recursive: true });
		writeFileSync(OUTPUT, serialized);
		console.log(
			`Wrote ${relative}: ` +
				Object.entries(templates)
					.map(([mode, files]) => `${mode} ${files.length} files`)
					.join(', '),
		);
	}

	const problems = readmeDisagreements(templates, readFileSync(README, 'utf8'));
	if (problems.length > 0) {
		console.error(
			`${path.relative(REPO, README)} does not match what the templates write:\n` +
				problems.map((problem) => `  ${problem}`).join('\n'),
		);
		process.exitCode = 1;
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	await main();
}
