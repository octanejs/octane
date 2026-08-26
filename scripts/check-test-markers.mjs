import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['packages', 'website', 'examples', 'benchmarks', 'playground'];
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]sx?|tsrx)$/;
const FORBIDDEN = [
	{
		pattern: /^\s*(?:it|test|describe)\.(?:skip|skipIf|runIf|todo|fails)\b/,
		label: 'test modifier',
	},
	{ pattern: /\bctx\.skip\s*\(/, label: 'runtime skip' },
];

function isBytePinnedUpstreamSource(file, repo) {
	const relative = path.relative(repo, file);
	const match = /^packages\/([^/]+)\/upstream\/source\/(.+)$/.exec(relative);
	if (!match) return false;
	const sumsPath = path.join(repo, 'packages', match[1], 'upstream', 'SHA256SUMS');
	if (!existsSync(sumsPath)) return false;
	const pinnedPath = `upstream/source/${match[2]}`;
	const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
	return readFileSync(sumsPath, 'utf8')
		.split('\n')
		.some((line) => line === `${digest}  ${pinnedPath}`);
}

function* walk(directory) {
	const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
	for (const entry of entries) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			// Vendored packages/*/upstream trees are byte-exact pins and may carry
			// upstream it.skip markers; adapted suites under tests/upstream stay checked.
			const relative = path.relative(REPO, absolute).replace(/\\/g, '/');
			const isVendoredUpstream = /^packages\/[^/]+\/upstream$/.test(relative);
			if (
				entry.name !== 'node_modules' &&
				entry.name !== 'dist' &&
				entry.name !== 'coverage' &&
				!isVendoredUpstream
			) {
				yield* walk(absolute);
			}
		} else if (TEST_FILE.test(entry.name)) {
			yield absolute;
		}
	}
}

function ignoredTestFiles(repo, files) {
	if (files.length === 0) return new Set();
	const relativePaths = files.map((file) => path.relative(repo, file).replace(/\\/g, '/'));
	const result = spawnSync('git', ['-C', repo, 'check-ignore', '--stdin', '-z'], {
		encoding: 'utf8',
		input: `${relativePaths.join('\0')}\0`,
	});
	// Exit 1 means Git found no ignored paths. A non-repository fixture also falls
	// back to the filesystem walk so the exported checker stays independently testable.
	if (result.status !== 0 || !result.stdout) return new Set();
	return new Set(result.stdout.split('\0').filter(Boolean));
}

export function findTestMarkerViolations(repo = REPO, roots = ROOTS) {
	const violations = [];
	for (const root of roots) {
		const files = [...walk(path.join(repo, root))];
		const ignored = ignoredTestFiles(repo, files);
		for (const file of files) {
			const relative = path.relative(repo, file).replace(/\\/g, '/');
			// Materialized parity suites are deliberately ignored build artifacts.
			// A force-added (therefore committed) file is not reported by check-ignore
			// and remains subject to the no-skip policy.
			if (ignored.has(relative)) continue;
			if (isBytePinnedUpstreamSource(file, repo)) continue;
			const lines = readFileSync(file, 'utf8').split('\n');
			for (let index = 0; index < lines.length; index++) {
				const source = lines[index].trim();
				if (/^(?:\/\/|\/\*|\*)/.test(source)) continue;
				for (const { pattern, label } of FORBIDDEN) {
					if (pattern.test(source)) {
						violations.push({
							file: path.relative(repo, file),
							line: index + 1,
							label,
							text: source,
						});
					}
				}
			}
		}
	}
	return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const violations = findTestMarkerViolations();
	if (violations.length > 0) {
		console.error('Committed tests must execute without skip/todo/expected-failure modifiers:');
		for (const violation of violations) {
			console.error(`  ${violation.file}:${violation.line} (${violation.label}) ${violation.text}`);
		}
		console.error(
			'Fix genuine gaps before landing tests; assert intentional divergences as ordinary passing tests.',
		);
		process.exit(1);
	}

	console.log('test marker check passed (no skipped, todo, or expected-failure tests).');
}
