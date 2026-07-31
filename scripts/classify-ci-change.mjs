import { isDeepStrictEqual } from 'node:util';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LIGHTWEIGHT_PATHS = [
	/^\.changeset\/(?:README\.md|config\.json|[^/]+\.md)$/,
	/^docs\/.*\.mdx?$/,
	/^benchmarks\/baselines\/local\/.*\.json$/,
	/^\.agents\//,
	/^\.claude\//,
	/^\.codex\//,
	/^\.cursor\//,
	/^\.gemini\//,
	/^\.rulesync\//,
	/^\.vscode\//,
	/^\.github\//,
	/^scripts\/(?:classify-ci-change(?:\.test)?|ci-workflow\.test|file-selection|format-files(?:\.test)?|typecheck-files(?:\.test)?)\.mjs$/,
	/^(?:AGENTS|CLAUDE|GEMINI)\.md$/,
	/^(?:CODE_OF_CONDUCT|CONTRIBUTING|LICENSE|README|SECURITY)(?:\.md)?$/,
];

function rootPackageChangeIsLightweight(before, after) {
	if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
		return false;
	}

	const beforeWithoutScripts = { ...before };
	const afterWithoutScripts = { ...after };
	delete beforeWithoutScripts.scripts;
	delete afterWithoutScripts.scripts;
	if (!isDeepStrictEqual(beforeWithoutScripts, afterWithoutScripts)) {
		return false;
	}

	const beforeScripts = before.scripts ?? {};
	const afterScripts = after.scripts ?? {};
	const changedScripts = new Set([...Object.keys(beforeScripts), ...Object.keys(afterScripts)]);

	for (const script of changedScripts) {
		if (beforeScripts[script] === afterScripts[script]) continue;

		// These commands are exercised by the universal lint job and cannot
		// affect shipped code. Other existing commands remain conservative
		// because changing one may alter a product CI entry point.
		if (script === 'ci:workflow:test') continue;
		if (script === 'format' || script.startsWith('format:')) continue;
		if (script === 'typecheck:files') continue;
		return false;
	}

	return true;
}

function pathIsLightweight(file, beforeRootPackage, afterRootPackage) {
	if (file === 'package.json') {
		return rootPackageChangeIsLightweight(beforeRootPackage, afterRootPackage);
	}
	return LIGHTWEIGHT_PATHS.some((pattern) => pattern.test(file));
}

export function classifyCiChange({
	files,
	beforeRootPackage = undefined,
	afterRootPackage = undefined,
}) {
	if (!Array.isArray(files) || files.length === 0) {
		return {
			fullCi: true,
			reason: 'No changed files could be identified safely.',
		};
	}

	const fullCiFile = files.find(
		(file) => !pathIsLightweight(file, beforeRootPackage, afterRootPackage),
	);
	if (fullCiFile) {
		return {
			fullCi: true,
			reason: `${fullCiFile} can affect shipped or executable behavior.`,
		};
	}

	return {
		fullCi: false,
		reason: 'Every change is documentation, metadata, or an isolated developer helper.',
	};
}

export function parseChangedPaths(nameStatusOutput) {
	const fields = nameStatusOutput.split('\0');
	if (fields.at(-1) === '') fields.pop();

	const files = [];
	for (let index = 0; index < fields.length;) {
		const status = fields[index++];
		if (!/^[ACDMRTUXB]\d*$/.test(status)) {
			throw new Error(`Unexpected git diff status: ${status || '<empty>'}`);
		}

		const pathCount = status[0] === 'R' || status[0] === 'C' ? 2 : 1;
		if (index + pathCount > fields.length) {
			throw new Error(`Incomplete git diff record for status ${status}`);
		}
		for (let pathIndex = 0; pathIndex < pathCount; pathIndex++) {
			files.push(fields[index++]);
		}
	}

	return [...new Set(files)];
}

function argument(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

function readJsonAtRevision(revision, file) {
	return JSON.parse(execFileSync('git', ['show', `${revision}:${file}`], { encoding: 'utf8' }));
}

function classifyRevisions(base, head) {
	if (!base || !head || /^0+$/.test(base)) {
		return {
			fullCi: true,
			reason: 'The event did not provide a comparable base revision.',
		};
	}

	const files = parseChangedPaths(
		execFileSync(
			'git',
			[
				'diff',
				'--name-status',
				'--find-renames',
				'--find-copies',
				'--diff-filter=ACDMRTUXB',
				'-z',
				`${base}..${head}`,
			],
			{ encoding: 'utf8' },
		),
	);
	const packageChanged = files.includes('package.json');

	return classifyCiChange({
		files,
		beforeRootPackage: packageChanged ? readJsonAtRevision(base, 'package.json') : undefined,
		afterRootPackage: packageChanged ? readJsonAtRevision(head, 'package.json') : undefined,
	});
}

const isEntryPoint =
	process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntryPoint) {
	const result = classifyRevisions(argument('--base'), argument('--head'));
	const output = argument('--github-output');
	if (output) {
		appendFileSync(output, `full_ci=${result.fullCi}\n`);
	}
	console.log(`full_ci=${result.fullCi}: ${result.reason}`);
}
