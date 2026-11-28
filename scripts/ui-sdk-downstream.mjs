#!/usr/bin/env node

// Builds the downstream @ui-sdk/octane adapter against this checkout's octane
// and runs a slice of UI SDK's own specs on it, so an Octane change that breaks
// the adapter fails here before it ships. CI runs it as "UI SDK downstream".
//
//   node scripts/ui-sdk-downstream.mjs --port 5390 [--dir <work-dir>]
//
// The work directory keeps the UI SDK checkout and its install, so a rerun
// repacks octane and reinstalls only what changed.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { renderPackedExampleWorkspace } from './package-pack-canaries.mjs';

// The adapter lives on a fork until UI SDK takes it (vercel-labs/ui#955). When
// it lands there, point this at vercel-labs/ui and a commit on its main. Pin a
// pushed commit, never a branch, so a run tests only the Octane change.
const UPSTREAM = {
	repository: 'jonkwheeler/ui',
	revision: '5a319171f220acd999e8e3a92a7067da344bf53b',
};

// The base spec of five components, the keyboard, pointer, focus and dismissal
// behavior of each pattern, plus the adapter's own checks, on both Octane
// projects: the .tsx fixtures and the same fixtures as .tsrx templates. The
// drawer's enhancements animate a backdrop the .tsrx fixture renders in @if,
// which a store update must commit in tree order (#3124).
const SPECS = [
	'specs/menu.spec.ts',
	'specs/select.spec.ts',
	'specs/combobox.spec.ts',
	'specs/tree.spec.ts',
	'specs/dialog.spec.ts',
	'specs/drawer.enhancements.spec.ts',
	'specs/octane.spike.spec.ts',
];
const PROJECTS = ['octane', 'octane-tsrx'];
// The leak specs on the same projects: each popup and panel opened, closed,
// mounted and unmounted hundreds of times, which must leave no part, listener
// or frame behind. The .tsrx fixtures' @if and @for items reach the parts as
// descriptors (#3123), which a scoped children resolver must not pin (#3116).
const LEAK_SPEC = 'specs/leaks.spec.ts';

const OCTANE_ROOT = path.resolve(import.meta.dirname, '..');
const OCTANE_PACKAGE = path.join(OCTANE_ROOT, 'packages/octane');

const { values: options } = parseArgs({
	options: {
		dir: { type: 'string', default: path.join(tmpdir(), 'octane-ui-sdk-downstream') },
		port: { type: 'string', default: process.env.PLAYGROUND_PORT ?? '5300' },
	},
});
const work = path.resolve(options.dir);
const checkout = path.join(work, 'ui');
const relative = path.relative(OCTANE_ROOT, work);
assert.ok(
	relative.startsWith('..') || path.isAbsolute(relative),
	'Keep --dir outside the Octane checkout.',
);

function run(command, args, { cwd = OCTANE_ROOT, env = process.env } = {}) {
	console.log(`\n$ ${[command, ...args].join(' ')}\n  in ${cwd}`);
	const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? result.signal}`);
	}
}

function output(command, args, cwd) {
	return spawnSync(command, args, { cwd, encoding: 'utf8' }).stdout?.trim();
}

const version = (packageDirectory) =>
	JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8')).version;

function fetchUpstream() {
	if (output('git', ['rev-parse', 'HEAD'], checkout) === UPSTREAM.revision) {
		// Keep the last run's install. Undo its overrides and lockfile.
		run('git', ['reset', '--hard', '--quiet'], { cwd: checkout });
		return;
	}
	rmSync(checkout, { recursive: true, force: true });
	mkdirSync(checkout, { recursive: true });
	const url = `https://github.com/${UPSTREAM.repository}.git`;
	run('git', ['init', '--quiet'], { cwd: checkout });
	run('git', ['fetch', '--quiet', '--depth=1', url, UPSTREAM.revision], { cwd: checkout });
	run('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], { cwd: checkout });
	assert.equal(output('git', ['rev-parse', 'HEAD'], checkout), UPSTREAM.revision);
}

// The tarball is what an app installs: dist only, catalog ranges resolved. Its
// name carries its hash: pnpm keys a file: package by path, so a rerun with a
// rebuilt octane at the same path would keep the old install.
function packOctane() {
	const archives = path.join(work, 'archives');
	rmSync(archives, { recursive: true, force: true });
	mkdirSync(archives, { recursive: true });
	run('pnpm', ['--dir', OCTANE_PACKAGE, 'pack', '--pack-destination', archives]);
	const tarballs = readdirSync(archives).filter((entry) => entry.endsWith('.tgz'));
	assert.equal(tarballs.length, 1, 'octane should pack into exactly one archive');
	const packed = path.join(archives, tarballs[0]);
	const hash = createHash('sha256').update(readFileSync(packed)).digest('hex').slice(0, 12);
	const archive = packed.replace(/\.tgz$/, `-${hash}.tgz`);
	renameSync(packed, archive);
	run('tar', ['-xzf', archive, '-C', archives]);
	return archive;
}

// UI SDK's own pnpm, from its packageManager, so its workspace settings and
// lockfile mean what they mean in its CI. Playwright's web server calls it too.
function upstreamEnvironment() {
	const { packageManager } = JSON.parse(readFileSync(path.join(checkout, 'package.json'), 'utf8'));
	const pnpmVersion = /^pnpm@(\d+\.\d+\.\d+)/.exec(packageManager ?? '')?.[1];
	assert.ok(pnpmVersion, `UI SDK declares no pnpm version: ${packageManager}`);
	const tools = path.join(work, `pnpm-${pnpmVersion}`);
	if (!existsSync(path.join(tools, 'bin/pnpm'))) {
		run('npm', [
			'install',
			'--global',
			'--prefix',
			tools,
			'--no-audit',
			'--no-fund',
			`pnpm@${pnpmVersion}`,
		]);
	}
	return {
		...process.env,
		PATH: `${path.join(tools, 'bin')}${path.delimiter}${process.env.PATH}`,
		npm_config_manage_package_manager_versions: 'false',
		PLAYGROUND_PORT: options.port,
	};
}

// Overrides swap in the tarball and the @tsrx pair this checkout builds with.
// Every other package still resolves under UI SDK's minimumReleaseAge and
// trustPolicy; a local tarball is not a registry package, so neither applies.
function installUpstream(env, archive, versions) {
	const workspaceFile = path.join(checkout, 'pnpm-workspace.yaml');
	const workspace = readFileSync(workspaceFile, 'utf8');
	assert.doesNotMatch(workspace, /^overrides:/m, 'UI SDK now has overrides; merge into them.');
	const overrides = { octane: `file:${archive}`, ...versions.tsrx };
	writeFileSync(workspaceFile, `${workspace}\n${renderPackedExampleWorkspace(overrides)}`);
	run('pnpm', ['install', '--no-frozen-lockfile'], { cwd: checkout, env });

	const installed = (name) => version(path.join(checkout, 'node_modules', name));
	for (const [name, expected] of Object.entries(versions.tsrx)) {
		assert.equal(installed(name), expected, `UI SDK installed ${name}@${installed(name)}`);
	}
	const packed = path.join(path.dirname(archive), 'package');
	const octane = path.join(checkout, 'node_modules/octane');
	const differing = readdirSync(packed, { recursive: true }).filter((file) => {
		const source = path.join(packed, file);
		if (!statSync(source).isFile()) return false;
		const target = path.join(octane, file);
		return !existsSync(target) || !readFileSync(target).equals(readFileSync(source));
	});
	assert.deepEqual(differing, [], 'UI SDK did not install the octane packed from this checkout.');
}

// Serves the built playground, as UI SDK's production smoke does, so Playwright
// reuses it instead of building it under its 60s server timeout. The port must
// be free: a local run would otherwise test another checkout's playground.
async function servePlayground(env) {
	const probe = createServer();
	await new Promise((resolve, reject) => {
		probe.once('error', reject).listen(Number(options.port), resolve);
	}).catch((error) => {
		throw new Error(`Port ${options.port} is taken (${error.code}). Pass a free --port.`);
	});
	await new Promise((resolve) => probe.close(resolve));

	const vite = path.join(checkout, 'node_modules/.bin/vite');
	const server = spawn(vite, ['preview', '--port', options.port, '--strictPort'], {
		cwd: path.join(checkout, 'apps/playground'),
		env,
		stdio: 'inherit',
	});
	const exited = new Promise((resolve) => server.once('exit', resolve).once('error', resolve));
	const stop = async () => {
		server.kill();
		await exited;
	};
	const deadline = Date.now() + 60_000;
	while (server.exitCode === null && Date.now() < deadline) {
		const up = await fetch(`http://localhost:${options.port}`).then(
			(response) => response.ok,
			() => false,
		);
		if (up) return stop;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	await stop();
	throw new Error(`The playground preview did not answer on port ${options.port}.`);
}

const failures = [];
const timings = [];
// Steps that set the check up: their failure says nothing about the adapter.
const harness = new Set();

async function step(title, action, { setup = false } = {}) {
	if (setup) harness.add(title);
	console.log(`\n=== ${title}`);
	const started = performance.now();
	try {
		await action();
		return true;
	} catch (error) {
		console.error(`\n${error.message}`);
		failures.push(title);
		return false;
	} finally {
		const seconds = Math.round((performance.now() - started) / 1000);
		timings.push(`${title}: ${seconds}s`);
	}
}

const versions = {
	octane: version(OCTANE_PACKAGE),
	tsrx: Object.fromEntries(
		['@tsrx/core', '@tsrx/oxc'].map((name) => [
			name,
			version(path.join(OCTANE_PACKAGE, 'node_modules', name)),
		]),
	),
};
const tests = path.join(checkout, 'tests');
let archive;
let env;

const INSTALL = 'Install UI SDK with this octane';
const ready =
	(await step(`Fetch ${UPSTREAM.repository}@${UPSTREAM.revision}`, fetchUpstream, {
		setup: true,
	})) &&
	(await step('Pack octane from this checkout', () => (archive = packOctane()), {
		setup: true,
	})) &&
	(await step(INSTALL, () => {
		env = upstreamEnvironment();
		installUpstream(env, archive, versions);
	})) &&
	(await step('Build @ui-sdk/core and @ui-sdk/octane', () =>
		run('pnpm', ['--filter', '@ui-sdk/core', '--filter', '@ui-sdk/octane', 'build'], {
			cwd: checkout,
			env,
		}),
	));

if (ready) {
	await step('Server-render the .tsrx consumer', () =>
		run('node', ['scripts/package-consumers/octane-tsrx/check.mjs'], { cwd: checkout, env }),
	);
	const built = await step('Build the playground', () =>
		run('pnpm', ['--filter', 'playground', 'build'], { cwd: checkout, env }),
	);
	let stop;
	const served =
		built &&
		(await step(
			'Serve the playground',
			async () => {
				run('npx', ['playwright', 'install', 'chromium'], { cwd: tests, env });
				stop = await servePlayground(env);
			},
			{ setup: true },
		));
	if (served) {
		const playwright = (args) =>
			run('npx', ['playwright', 'test', ...args, '--workers=2'], {
				cwd: tests,
				env: { ...env, PLAYGROUND_SERVED: '1' },
			});
		const projects = PROJECTS.flatMap((project) => ['--project', project]);
		await step(`Run the ${PROJECTS.join(' and ')} specs`, () =>
			playwright([...SPECS, ...projects]),
		);
		await step('Run the leak specs', () => playwright([LEAK_SPEC, ...projects]));
		await stop();
	}
}

const summary = [
	`UI SDK: ${UPSTREAM.repository}@${UPSTREAM.revision}`,
	`octane: ${versions.octane} from ${output('git', ['rev-parse', 'HEAD'], OCTANE_ROOT)}`,
	...Object.entries(versions.tsrx).map(([name, value]) => `${name}: ${value}`),
	...timings,
];
console.log(`\n${summary.join('\n')}`);

if (failures.length) {
	const pin = `${UPSTREAM.repository}@${UPSTREAM.revision.slice(0, 8)}`;
	const [title, headline] = failures.some((failure) => !harness.has(failure))
		? [
				'UI SDK adapter broke',
				`The downstream UI SDK adapter (@ui-sdk/octane, ${pin}) broke against this Octane change. Failed: ${failures.join('; ')}.`,
			]
		: [
				'UI SDK check did not run',
				`The UI SDK downstream check could not run (${failures.join('; ')}), so it says nothing about the adapter yet.`,
			];
	const reproduce = 'node scripts/ui-sdk-downstream.mjs --port 5390';
	if (process.env.GITHUB_ACTIONS) {
		console.log(`::error title=${title}::${headline} Reproduce: ${reproduce}`);
	}
	const lines = [
		'',
		headline,
		'',
		'Reproduce from the Octane checkout, after its pnpm install:',
		`  ${reproduce}`,
	];
	if (failures.includes(INSTALL)) {
		lines.push(
			'UI SDK installs registry packages only once they are a day old (minimumReleaseAge)',
			'and never with weaker provenance (trustPolicy), so a dependency this change',
			'just adopted can fail here until it ages.',
		);
	}
	if (ready) {
		lines.push(
			'Then rerun one spec against the kept UI SDK checkout and its built playground:',
			`  (cd ${checkout}/apps/playground && ../../node_modules/.bin/vite preview --port 5390) &`,
			`  cd ${tests} && PLAYGROUND_PORT=5390 npx playwright test specs/menu.spec.ts --project octane`,
		);
	}
	lines.push(
		'If the adapter must follow an intended Octane change, land that in UI SDK first,',
		'then bump UPSTREAM.revision in scripts/ui-sdk-downstream.mjs.',
	);
	console.error(lines.join('\n'));
}

if (process.env.GITHUB_STEP_SUMMARY) {
	const status = failures.length ? `failed: ${failures.join('; ')}` : 'passed';
	appendFileSync(
		process.env.GITHUB_STEP_SUMMARY,
		`### UI SDK downstream ${status}\n\n${summary.map((line) => `- ${line}`).join('\n')}\n`,
	);
}

process.exit(failures.length ? 1 : 0);
