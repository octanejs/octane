import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { build } from 'esbuild';

import { instrumentLynxStageSources } from './instrument-source.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const sourceFiles = [
	'packages/lynx/src/core/profiling.ts',
	'packages/lynx/src/core/papi.ts',
	'packages/lynx/src/core/transport.ts',
	'packages/lynx/src/main-renderer.ts',
	'packages/lynx/src/main-thread.ts',
];

test('instruments an isolated Lynx source copy and restores every byte', () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-stage-source-'));
	try {
		for (const relative of sourceFiles) {
			const target = path.join(temporary, relative);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.copyFileSync(path.join(repositoryRoot, relative), target);
		}
		const before = new Map(
			sourceFiles.map((relative) => [
				relative,
				fs.readFileSync(path.join(temporary, relative), 'utf8'),
			]),
		);
		const restore = instrumentLynxStageSources(temporary);
		assert.match(
			fs.readFileSync(path.join(temporary, 'packages/lynx/src/core/transport.ts'), 'utf8'),
			/bgReplayMs/,
		);
		assert.match(
			fs.readFileSync(path.join(temporary, 'packages/lynx/src/main-thread.ts'), 'utf8'),
			/mtExpandMs/,
		);
		assert.match(
			fs.readFileSync(path.join(temporary, 'packages/lynx/src/main-renderer.ts'), 'utf8'),
			/firstScreenPlanMs/,
		);
		assert.match(
			fs.readFileSync(path.join(temporary, 'packages/lynx/src/core/papi.ts'), 'utf8'),
			/papiCreateMs/,
		);
		restore();
		for (const relative of sourceFiles) {
			assert.equal(fs.readFileSync(path.join(temporary, relative), 'utf8'), before.get(relative));
		}
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true });
	}
});

test('profiled first-screen rendering works without a stage-harness slice hook', async () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-stage-profile-'));
	try {
		for (const relative of [...sourceFiles, 'packages/lynx/src/resource.ts']) {
			const target = path.join(temporary, relative);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.copyFileSync(path.join(repositoryRoot, relative), target);
		}
		instrumentLynxStageSources(temporary);

		const entry = path.join(temporary, 'profile-first-screen.ts');
		const output = path.join(temporary, 'profile-first-screen.mjs');
		fs.writeFileSync(
			entry,
			[
				"import { defineUniversalComponent, renderLynxFirstScreen, universalPlan, universalValue } from './packages/lynx/src/main-renderer.ts';",
				"const plan = universalPlan('lynx', { kind: 'host', type: 'view' });",
				"const App = defineUniversalComponent('lynx', () => universalValue(plan));",
				'export function run() {',
				'\tdelete globalThis.__OCTANE_LYNX_PROF;',
				'\tconst result = renderLynxFirstScreen(App, {});',
				'\treturn { profile: globalThis.__OCTANE_LYNX_PROF, result };',
				'}',
			].join('\n'),
		);
		await build({
			entryPoints: [entry],
			bundle: true,
			format: 'esm',
			logLevel: 'silent',
			outfile: output,
			platform: 'node',
		});

		const { run } = await import(`${pathToFileURL(output).href}?profile-first-screen`);
		const { profile, result } = run();
		assert.equal(result.hostCount, 1);
		assert.ok(Number.isFinite(profile.firstScreenPlanMs));
		for (const name of [
			'commits',
			'commands',
			'bytes',
			'selfcheckMs',
			'dispatchMs',
			'validateMs',
			'prepareMs',
			'prepareCheckMs',
			'applyMs',
			'ackMs',
		]) {
			assert.equal(profile[name], 0);
		}
	} finally {
		delete globalThis.__OCTANE_LYNX_PROF;
		fs.rmSync(temporary, { recursive: true, force: true });
	}
});
