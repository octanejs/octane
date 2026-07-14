import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '..', '..');
const corpusRoot = join(packageRoot, 'datasets', 'train', 'user-apps-v1');
const catalog = JSON.parse(readFileSync(join(corpusRoot, 'catalog.json'), 'utf8'));
const baseCommit = '4d7f96230df3c5af5df4f733135a08beeec00737';
const lockfileHash = sha256(
	execFileSync('git', ['show', `${baseCommit}:pnpm-lock.yaml`], {
		cwd: repositoryRoot,
		timeout: 10_000,
		killSignal: 'SIGKILL',
	}),
);
const overlayLockfileHash = sha256(readFileSync(join(repositoryRoot, 'pnpm-lock.yaml')));
const image = 'node@sha256:752ea8a2f758c34002a0461bd9f1cee4f9a3c36d48494586f60ffce1fc708e0e';
const trainingSystemPrompt =
	'Build the requested feature as a standalone Octane application. Return only the complete contents of src/App.tsrx.';

const packageVersions = {
	octane: packageVersion('packages/octane/package.json'),
	'@octanejs/testing-library': packageVersion('packages/testing-library/package.json'),
	'@octanejs/zustand': packageVersion('packages/zustand/package.json'),
	'@octanejs/hook-form': packageVersion('packages/hook-form/package.json'),
	'@octanejs/i18next': packageVersion('packages/i18next/package.json'),
	i18next: packageVersion('packages/i18next/node_modules/i18next/package.json'),
	'@octanejs/tanstack-query': packageVersion('packages/tanstack-query/package.json'),
	'@tanstack/query-core': packageVersion(
		'packages/tanstack-query/node_modules/@tanstack/query-core/package.json',
	),
};

function packageVersion(path) {
	return JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8')).version;
}

function sha256(value) {
	return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalJson(value) {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') {
		return JSON.stringify(value);
	}
	if (typeof value === 'number') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	const entries = Object.entries(value).sort(([left], [right]) =>
		left < right ? -1 : left > right ? 1 : 0,
	);
	return `{${entries
		.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
		.join(',')}}`;
}

function workspaceFiles(directory, root = directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory()
			? workspaceFiles(path, root)
			: [{ path: relative(root, path).replaceAll('\\', '/'), digest: sha256(readFileSync(path)) }];
	});
}

function workspaceDigest(directory) {
	const files = workspaceFiles(directory).sort((left, right) =>
		left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
	);
	return sha256(canonicalJson(files));
}

function graderDigest(graderPath) {
	const files = [
		{ path: 'task/grader.test.ts', digest: sha256(readFileSync(graderPath)) },
		{
			path: 'shared/source-contracts.test.ts',
			digest: sha256(readFileSync(join(corpusRoot, 'source-contracts.test.ts'))),
		},
		{
			path: 'harness/grade-user-app.mjs',
			digest: sha256(readFileSync(join(packageRoot, 'scripts', 'grade-user-app.mjs'))),
		},
		{
			path: 'harness/vitest.config.js',
			digest: sha256(readFileSync(join(repositoryRoot, 'vitest.config.js'))),
		},
	].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
	return sha256(canonicalJson(files));
}

const scoringPolicyDigest = sha256(readFileSync(join(corpusRoot, 'scoring-policy.md')));
const orderedTasks = [...catalog.tasks].sort((left, right) =>
	left.taskId.localeCompare(right.taskId),
);
const manifests = orderedTasks.map((task) => {
	const taskRoot = join(corpusRoot, 'tasks', task.taskId);
	const prompt = readFileSync(join(taskRoot, 'prompt.md'), 'utf8').trim();
	const graderPath = join(taskRoot, 'grader.test.ts');
	const referencePath = join(taskRoot, 'reference', 'src', 'App.tsrx');
	const selectedVersions = {
		octane: packageVersions.octane,
		'@octanejs/testing-library': packageVersions['@octanejs/testing-library'],
	};
	if (task.packageName) selectedVersions[task.packageName] = packageVersions[task.packageName];
	if (task.packageName === '@octanejs/i18next') {
		selectedVersions.i18next = packageVersions.i18next;
	}
	if (task.packageName === '@octanejs/tanstack-query') {
		selectedVersions['@tanstack/query-core'] = packageVersions['@tanstack/query-core'];
	}

	return {
		schemaVersion: '1.1',
		benchmarkVersion: catalog.benchmarkVersion,
		taskId: task.taskId,
		familyId: task.taskId,
		title: task.title,
		prompt: { statement: prompt, outputType: 'completion', allowedPaths: ['src/App.tsrx'] },
		suite: task.suite,
		split: 'train',
		executionMode: 'instruction',
		capability: task.capability,
		...(task.packageName ? { packageName: task.packageName } : {}),
		...(task.portShape ? { portShape: task.portShape } : {}),
		difficulty: task.difficulty,
		provenance: {
			createdAt: '2026-07-14',
			publishedAt: '2026-07-14',
			authors: ['Octane maintainers'],
			reviewers: [],
			sources: [
				{
					repository: 'https://github.com/octanejs/octane',
					commit: baseCommit,
					path: task.sourcePath,
					license: 'MIT',
					attribution: 'Copyright Octane contributors',
				},
			],
		},
		environment: {
			repository: 'https://github.com/octanejs/octane',
			baseCommit,
			image,
			platform: 'linux/amd64',
			node: '22.18.0',
			pnpm: '11.1.1',
			packageVersions: selectedVersions,
			lockfileHash,
			overlayLockfileHash,
		},
		workspace: {
			kind: 'template',
			templatePath: relative(packageRoot, join(taskRoot, 'starter')).replaceAll('\\', '/'),
			templateDigest: workspaceDigest(join(taskRoot, 'starter')),
		},
		trainingArtifacts: {
			referencePath: relative(packageRoot, referencePath).replaceAll('\\', '/'),
			referenceDigest: sha256(readFileSync(referencePath)),
		},
		context: { mode: 'framework-docs', docsCommit: baseCommit },
		policy: {
			network: 'none',
			timeoutSeconds: 120,
			cpu: 2,
			memoryMb: 2048,
			maxProcesses: 64,
			maxDiskMb: 1024,
			maxOutputBytes: 1048576,
			maxTurns: 30,
			maxTotalTokens: 12000,
			maxToolCalls: 60,
			writablePaths: ['src'],
		},
		grader: {
			graderVersion: catalog.benchmarkVersion,
			graderDigest: graderDigest(graderPath),
			scoringPolicyDigest,
			publicCommands: [
				{
					id: 'behavior',
					command: `pnpm --filter @octanejs/evals grade:user-app -- --task ${task.taskId} --submission .`,
				},
			],
		},
		tags: task.tags,
	};
});

const trainingExamples = orderedTasks.map((task) => {
	const taskRoot = join(corpusRoot, 'tasks', task.taskId);
	const prompt = readFileSync(join(taskRoot, 'prompt.md'), 'utf8').trim();
	const starter = readFileSync(join(taskRoot, 'starter', 'src', 'App.tsrx'), 'utf8').trim();
	const reference = readFileSync(join(taskRoot, 'reference', 'src', 'App.tsrx'), 'utf8').trim();
	return {
		schemaVersion: '1.1',
		taskId: task.taskId,
		messages: [
			{ role: 'system', content: trainingSystemPrompt },
			{
				role: 'user',
				content: `${prompt}\n\nStarter src/App.tsrx:\n\n\`\`\`tsx\n${starter}\n\`\`\``,
			},
			{ role: 'assistant', content: reference },
		],
		metadata: {
			suite: task.suite,
			capability: task.capability,
			difficulty: task.difficulty,
			...(task.packageName ? { packageName: task.packageName } : {}),
			tags: task.tags,
		},
	};
});

const artifacts = [
	{
		path: join(corpusRoot, 'manifest.jsonl'),
		content: `${manifests.map((manifest) => JSON.stringify(manifest)).join('\n')}\n`,
	},
	{
		path: join(corpusRoot, 'training.jsonl'),
		content: `${trainingExamples.map((example) => JSON.stringify(example)).join('\n')}\n`,
	},
];
if (process.argv.includes('--check')) {
	for (const artifact of artifacts) {
		if (readFileSync(artifact.path, 'utf8') !== artifact.content) {
			console.error(`${relative(repositoryRoot, artifact.path)} is stale; run the generator`);
			process.exit(1);
		}
	}
	console.log(`user-app corpus artifacts are current (${manifests.length} tasks)`);
} else {
	for (const artifact of artifacts) {
		writeFileSync(artifact.path, artifact.content);
		console.log(`wrote ${relative(repositoryRoot, artifact.path)} (${manifests.length} tasks)`);
	}
}
