// Budget raises land alone. A pull request that raises any committed byte
// budget may change only budget files and prose, so a raise is reviewed on its
// own with the bytes and the reason in its description and never rides along
// with the change that needed it (CONTRIBUTING.md, "Size budgets").
//
//   node benchmarks/bundle-size/budget-raises.mjs --base <sha> [--head <sha>]
//
// Budgets are compared at the merge base, so main moving after the branch point
// is not this change's raise. Lowering a budget, or adding one for a new
// scenario, is allowed in any pull request.

import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUDGET_FILES = [
	'benchmarks/bundle-size/minimal-budgets.json',
	'benchmarks/bundle-size/app-budgets.json',
	'benchmarks/bundle-size/jsx-budgets.json',
];
const PROSE = /\.mdx?$/;

// Every numeric leaf that exists on both sides and grew, as `file: a.b.c`.
export function findBudgetRaises(file, before, after) {
	const raises = [];
	const walk = (left, right, trail) => {
		if (typeof right === 'number') {
			if (typeof left === 'number' && right > left) {
				raises.push({ budget: `${file}: ${trail.join('.')}`, before: left, after: right });
			}
			return;
		}
		if (right && typeof right === 'object' && left && typeof left === 'object') {
			for (const key of Object.keys(right)) walk(left[key], right[key], [...trail, key]);
		}
	};
	walk(before, after, []);
	return raises;
}

export function checkBudgetRaises({ raises, changedFiles }) {
	if (raises.length === 0) return [];
	const unrelated = changedFiles.filter(
		(file) => !BUDGET_FILES.includes(file) && !PROSE.test(file),
	);
	if (unrelated.length === 0) return [];
	return [
		`This change raises ${raises.length} committed byte budget(s) and also changes ${unrelated.length} other file(s).`,
		'A budget raise lands in its own pull request that names the bytes and the reason;',
		'reduce the growth here or split the raise out (CONTRIBUTING.md, "Size budgets").',
		'Raised:',
		...raises.map(({ budget, before, after }) => `  ${budget} ${before} -> ${after}`),
		'Other changed files:',
		...unrelated.slice(0, 20).map((file) => `  ${file}`),
		...(unrelated.length > 20 ? [`  … ${unrelated.length - 20} more`] : []),
	];
}

function git(args, cwd) {
	return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function readAt(revision, file, cwd) {
	try {
		return JSON.parse(git(['show', `${revision}:${file}`], cwd));
	} catch {
		return null;
	}
}

export function inspectBudgetChange(
	base,
	head = 'HEAD',
	repository = path.resolve(import.meta.dirname, '../..'),
) {
	assert(
		base && !/^0+$/.test(base),
		'budget ratchet requires a comparable --base commit (BUDGET_BASE)',
	);
	const mergeBase = git(['merge-base', base, head], repository).trim();
	const changedFiles = git(['diff', '--name-only', mergeBase, head], repository)
		.split('\n')
		.filter(Boolean);
	const raises = BUDGET_FILES.flatMap((file) =>
		findBudgetRaises(file, readAt(mergeBase, file, repository), readAt(head, file, repository)),
	);
	return { raises, changedFiles };
}

// The CI mode keeps separately reviewed budget raises viable before the
// consuming feature lands. It never disables the absolute ceiling.
export function requireBudgetRatchet(args) {
	if (!args.includes('--ratchet')) return false;
	assert(args.includes('--budgets'), '--ratchet requires --budgets');
	const change = inspectBudgetChange(process.env.BUDGET_BASE);
	return change.raises.length === 0 || checkBudgetRaises(change).length > 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const argument = (name) => {
		const index = process.argv.indexOf(name);
		return index === -1 ? undefined : process.argv[index + 1];
	};
	const base = argument('--base');
	const head = argument('--head') ?? 'HEAD';
	if (!base || /^0+$/.test(base)) {
		console.log('budget raises: no comparable base commit; nothing to check');
		process.exit(0);
	}
	const change = inspectBudgetChange(base, head);
	const { raises } = change;
	const problems = checkBudgetRaises(change);
	if (problems.length) {
		console.error(problems.join('\n'));
		process.exit(1);
	}
	console.log(
		raises.length
			? `budget raises: ${raises.length} raise(s) in a budget-only change`
			: 'budget raises: no committed byte budget was raised',
	);
}
