import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { graphApplicability } from './analyzer.mjs';

const repo = path.resolve(import.meta.dirname, '../../..');
const fixture = path.join(import.meta.dirname, 'fixtures');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')).href);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function files(directory) {
	return Object.fromEntries(
		fs
			.readdirSync(directory, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => {
				const name = path.relative(directory, path.join(entry.parentPath, entry.name));
				return [name, hash(fs.readFileSync(path.join(directory, name)))];
			})
			.sort(([left], [right]) => left.localeCompare(right)),
	);
}

test('report-only graph keeps production output intact and distinguishes unknown paths', async () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-graph-test-'));
	try {
		const baselineDir = path.join(tmp, 'baseline');
		const instrumentedDir = path.join(tmp, 'instrumented');
		const reportFile = path.join(tmp, 'graph.json');
		async function compile(outDir, plugins = []) {
			await build({
				root: fixture,
				configFile: path.join(fixture, 'vite.config.mjs'),
				mode: 'production',
				logLevel: 'silent',
				plugins,
				build: { outDir, emptyOutDir: false, reportCompressedSize: false },
			});
		}
		await assert.rejects(
			compile(path.join(tmp, 'unexpected-output'), [
				graphApplicability({
					sourceRoots: [fixture],
					reportFile,
					expectedOutDir: path.join(tmp, 'expected-output'),
				}),
			]),
			/not the requested/,
		);
		assert.ok(!fs.existsSync(path.join(tmp, 'unexpected-output')));
		await compile(baselineDir);
		await compile(instrumentedDir, [graphApplicability({ sourceRoots: [fixture], reportFile })]);
		assert.deepEqual(
			files(instrumentedDir),
			files(baselineDir),
			'observing the graph must not change emitted assets',
		);
		const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
		assert.equal(report.mode, 'report-only');
		assert.equal(report.roots.length, 2, 'the lexically shadowed hydrate function is not a root');
		const directRoot = report.roots.find((root) => root.target.name === 'Shell');
		const dynamicRoot = report.roots.find((root) => root.target.name === 'selected');
		assert.ok(directRoot.resolvedComponent.endsWith('/shell.tsrx#Shell'));
		assert.equal(dynamicRoot.resolvedComponent, null);
		assert.equal(dynamicRoot.resolution, 'unknown-target');
		const shell = report.components.find((component) => component.name === 'Shell');
		const heading = report.components.find((component) => component.name === 'StaticHeading');
		const uncalled = report.components.find((component) => component.name === 'Uncalled');
		const containing = report.components.find((component) => component.name === 'ContainsUncalled');
		const live = report.components.find((component) => component.name === 'Live');
		assert.ok(shell.traits.includes('template-control-flow'));
		assert.ok(shell.syntacticPathsFromRoots.includes(directRoot.id));
		assert.ok(heading.syntacticPathsFromRoots.includes(directRoot.id));
		assert.ok(
			uncalled.syntacticPathsFromRoots.includes(directRoot.id),
			'syntactic paths include uncalled nested JSX',
		);
		const shadowedSite = containing.sites.find((site) => site.tag === 'StaticHeading');
		assert.equal(shadowedSite.resolvedComponent, null);
		assert.equal(shadowedSite.target.reason, 'local-shadow-or-dynamic-binding');
		assert.equal(heading.classification, 'static-markup-lead');
		assert.ok(
			heading.reasons.includes('no-absence-proof-for-updates-remount-effects-or-reactivity'),
		);
		assert.equal(live.classification, 'observed-client-activity');
		assert.ok(live.traits.includes('native-event-handler'));
		assert.ok(live.traits.includes('octane-hook-or-use'));
		for (const tag of ['Named', 'Widgets.Widget', 'MemoWidget', 'Reassigned']) {
			const site = shell.sites.find((item) => item.tag === tag);
			assert.equal(site.resolvedComponent, null, `${tag} must stay unknown`);
			assert.equal(site.resolution, 'unknown-target');
		}
		assert.equal(
			shell.sites.find((site) => site.tag === 'Reassigned').target.reason,
			'mutable-or-reassigned-component-binding',
		);
		assert.ok(
			report.limitations.some((value) =>
				value.includes('conditional and uncalled nested functions'),
			),
		);
		const shared = report.modules.find((module) => module.id.endsWith('/shared.ts'));
		const effect = report.modules.find((module) => module.id.endsWith('/shell-effect.ts'));
		const rawWidget = report.modules.find((module) => module.id.endsWith('/widgets.tsrx?raw'));
		const widget = report.modules.find((module) => module.id.endsWith('/widgets.tsrx'));
		assert.ok(shared.importers.some((id) => id.endsWith('/shell.tsrx')));
		assert.ok(shared.importers.some((id) => id.endsWith('/live.tsrx')));
		assert.ok(shared.emittedIn.length && effect.emittedIn.length);
		assert.ok(effect.sourceTopLevelExecution.includes('top-level-expression'));
		assert.ok(rawWidget.emittedIn.length && widget.emittedIn.length);
		assert.notEqual(rawWidget.id, widget.id, 'query-qualified modules are distinct');
		assert.equal(
			report.sources.find((source) => source.id === rawWidget.id).parseError,
			'query-qualified module not analyzed',
		);
		assert.ok(report.chunks.some((chunk) => chunk.dynamicImports.length));
		assert.ok(report.chunks.some((chunk) => chunk.css.length));
		assert.ok(report.assets.some((asset) => asset.css));
		for (const source of report.sources.filter((entry) => !entry.id.includes('?'))) {
			assert.equal(
				source.sourceSha256,
				hash(fs.readFileSync(source.id)),
				`${source.id} must be inspected before compilation`,
			);
		}
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
});
