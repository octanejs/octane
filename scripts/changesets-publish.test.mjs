import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { spawn } from 'node:child_process';

const PUBLISH_SCRIPT = fileURLToPath(new URL('./changesets-publish.mjs', import.meta.url));

function run(command, args, options) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, options);
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.on('error', reject);
		child.on('close', (status, signal) => {
			resolve({ signal, status, stderr, stdout });
		});
	});
}

async function writeExecutable(filePath, source) {
	await writeFile(filePath, `#!/usr/bin/env node\n${source}`);
	await chmod(filePath, 0o755);
}

test('stale registry data does not crash recovery when npm reports an existing version', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'octane-changesets-publish-'));
	const binDirectory = path.join(root, 'bin');
	const packageDirectory = path.join(root, 'packages', 'fixture');
	const markerPath = path.join(root, 'publish-attempted');

	try {
		await Promise.all([
			mkdir(binDirectory, { recursive: true }),
			mkdir(packageDirectory, { recursive: true }),
			mkdir(path.join(root, '.changeset'), { recursive: true }),
		]);
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({
					name: 'changesets-publish-regression',
					packageManager: 'bun@1.4.2',
					private: true,
					workspaces: { packages: ['packages/*'] },
				}),
			),
			writeFile(
				path.join(root, 'bun.lock'),
				JSON.stringify({ lockfileVersion: 2, configVersion: 1, workspaces: { '': {} } }),
			),
			writeFile(
				path.join(packageDirectory, 'package.json'),
				JSON.stringify({
					name: 'changesets-publish-regression-fixture',
					publishConfig: { access: 'public' },
					version: '1.0.0',
				}),
			),
			writeFile(
				path.join(root, '.changeset', 'config.json'),
				JSON.stringify({
					access: 'public',
					baseBranch: 'main',
					changelog: false,
					commit: false,
					fixed: [],
					ignore: [],
					linked: [],
					updateInternalDependencies: 'patch',
				}),
			),
			writeExecutable(
				path.join(binDirectory, 'npm'),
				`
import { appendFileSync } from 'node:fs';
if (process.argv[2] === 'info') {
	console.log(JSON.stringify({ error: { code: 'E404', summary: 'Not Found' } }));
	process.exit(1);
}
if (process.argv[2] === 'publish') {
	appendFileSync(process.env.PUBLISH_MARKER, \`publish \${process.argv[3].split('/').at(-1)}\\n\`);
	console.log(JSON.stringify({
		error: {
			code: 'E403',
			summary: 'You cannot publish over the previously published versions: 1.0.0.',
		},
	}));
	process.exit(1);
}
console.error('unexpected npm command: ' + process.argv.slice(2).join(' '));
process.exit(2);
`,
			),
		]);

		const result = await run(process.execPath, [PUBLISH_SCRIPT], {
			cwd: root,
			env: {
				...process.env,
				CI: 'true',
				PATH: `${binDirectory}${path.delimiter}${process.env.PATH}`,
				PUBLISH_MARKER: markerPath,
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		assert.equal(result.signal, null);
		assert.equal(
			result.status,
			0,
			`changeset publish failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
		assert.equal(
			await readFile(markerPath, 'utf8'),
			'publish changesets-publish-regression-fixture-1.0.0.tgz\n',
		);
		assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /TypeError/);
	} finally {
		await rm(root, { force: true, recursive: true });
	}
});
