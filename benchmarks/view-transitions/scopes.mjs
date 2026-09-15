// Count scoped native work using the public browser regression fixture.
// The pre-scope baseline can only supply bytes, since it ignores scope="element".
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { launchBrowser } from '../../test-utils/playwright-browser.ts';
import {
	hashOctaneSources,
	octanePackageAt,
	packageVersion,
	parseOptions,
} from '../activity/harness.mjs';

async function within(promise, label, milliseconds = 30000) {
	let timer;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error(label + ' timed out')), milliseconds);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

const repo = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const source = octanePackageAt(parseOptions(process.argv.slice(2)).revision);
const sourceHash = hashOctaneSources(source.packageRoot);
const require = createRequire(path.join(repo, 'package.json'));
const selected = createRequire(path.join(source.packageRoot, 'package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')));
const { octane } = await import(pathToFileURL(selected.resolve('octane/compiler/vite')));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const fixture = path.join(repo, 'packages/octane/tests/browser/view-transition-scopes');
const fixtureHash = () =>
	hash(
		['App.tsrx', 'main.ts', 'index.html']
			.map((file) => file + '\0' + fs.readFileSync(path.join(fixture, file), 'utf8'))
			.join('\0'),
	);
const fixtureSourceHash = fixtureHash();
const bytesOnly = process.env.VT_SCOPES_BYTES_ONLY === '1';
process.env.NODE_ENV = 'production';
const built = await build({
	configFile: false,
	root: fixture,
	mode: 'production',
	logLevel: 'error',
	plugins: [
		{
			name: 'selected-octane',
			enforce: 'pre',
			resolveId(id) {
				if (id === 'octane' || id.startsWith('octane/')) return selected.resolve(id);
			},
		},
		octane({ hmr: false, profile: false }),
	],
	define: { __OCTANE_PROFILE_ENABLED__: 'false', 'process.env.NODE_ENV': '"production"' },
	build: { write: false, minify: false, target: 'esnext' },
});
const assets = new Map(
	built.output.map((asset) => [
		'/' + asset.fileName,
		asset.type === 'chunk' ? asset.code : asset.source,
	]),
);
const chunks = built.output.filter((asset) => asset.type === 'chunk');
assert.equal(chunks.length, 1);
const code = chunks[0].code;
const minified = selected('esbuild').transformSync(code, { minify: true, target: 'esnext' }).code;
const output = {
	suite: 'view-transition-scopes',
	bytesOnly,
	metadata: {
		revision: source.revision,
		sourceSha256: sourceHash,
		fixtureSha256: fixtureSourceHash,
		lockfileSha256: hash(fs.readFileSync(path.join(repo, 'pnpm-lock.yaml'))),
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		toolchain: {
			vite: packageVersion(require, 'vite'),
			esbuild: packageVersion(selected, 'esbuild'),
			tsrxCore: packageVersion(selected, '@tsrx/core'),
			playwright: packageVersion(require, 'playwright'),
		},
	},
	bundle: {
		rawBytes: Buffer.byteLength(minified),
		gzipBytes: gzipSync(minified, { level: 9 }).length,
		sha256: hash(minified),
		driverReachable: Number(/\bfunction vtFlush\s*\(/.test(code)),
		stagingReachable: Number(/\bDOMStage\b/.test(code)),
	},
	cases: {},
};
assert.equal(output.bundle.driverReachable, 1);
if (!bytesOnly) {
	const server = createServer((request, response) => {
		const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
		const asset = assets.get(pathname === '/' ? '/index.html' : pathname);
		if (asset === undefined) {
			response.writeHead(404).end();
			return;
		}
		response.setHeader(
			'Content-Type',
			pathname.endsWith('.js')
				? 'text/javascript'
				: pathname.endsWith('.css')
					? 'text/css'
					: 'text/html',
		);
		response.end(asset);
	});
	let browser;
	try {
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		browser = await launchBrowser({ headless: true });
		output.metadata.chromium = browser.version();
		for (const mode of ['single', 'siblings', 'nested', 'mixed']) {
			const variants = [];
			for (const observed of [false, true]) {
				assets.set('/' + chunks[0].fileName, observed ? code : minified);
				const page = await browser.newPage();
				const errors = [];
				page.on('pageerror', (error) => errors.push(error.message));
				try {
					await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
					await page.waitForFunction(() => Boolean(window.__viewTransitionScopes));
					const result = await within(
						page.evaluate(async (observe) => {
							const counts = {
								rectReads: 0,
								styleReads: 0,
								elementCaptures: 0,
								documentCaptures: 0,
							};
							const rect = Element.prototype.getBoundingClientRect;
							const style = window.getComputedStyle;
							const elementStart = Element.prototype.startViewTransition;
							const documentStart = document.startViewTransition;
							if (observe) {
								Element.prototype.getBoundingClientRect = function (...args) {
									counts.rectReads++;
									return Reflect.apply(rect, this, args);
								};
								window.getComputedStyle = function (...args) {
									counts.styleReads++;
									return Reflect.apply(style, this, args);
								};
								Element.prototype.startViewTransition = function (...args) {
									counts.elementCaptures++;
									return Reflect.apply(elementStart, this, args);
								};
								document.startViewTransition = function (...args) {
									counts.documentCaptures++;
									return Reflect.apply(documentStart, this, args);
								};
							}
							const hosts = [...document.querySelectorAll('section')];
							try {
								const api = window.__viewTransitionScopes;
								const mark = api.render(
									{
										left: 'left-after',
										right: 'right-after',
										inner: 'inner-after',
										page: 'page-after',
									},
									['first'],
								);
								while (document.querySelector('[data-content="left"]').textContent !== 'left-after')
									await new Promise(requestAnimationFrame);
								const snapshot = await api.ready(mark);
								const measured = { ...counts };
								const finished = await api.finish();
								return {
									counts: measured,
									semantic: {
										owners: snapshot.calls.map((call) => call.owner).sort(),
										ready: snapshot.calls.map((call) => [call.ready, call.update, call.error]),
										finished: finished.calls.map((call) => call.finished),
										hostsRetained: hosts.every((host) => document.getElementById(host.id) === host),
										roots: snapshot.roots.map((root) => ({ id: root.id, scope: root.scope })),
										text: [...document.querySelectorAll('[data-content]')].map((node) => [
											node.getAttribute('data-content'),
											node.textContent,
										]),
										events: snapshot.events.map((event) => ({
											id: event.id,
											targets: event.targets,
											animatedTarget: event.animatedTarget,
											styleOwner: event.styleOwner,
										})),
									},
								};
							} finally {
								Element.prototype.getBoundingClientRect = rect;
								window.getComputedStyle = style;
								Element.prototype.startViewTransition = elementStart;
								document.startViewTransition = documentStart;
							}
						}, observed),
						mode + ' scoped capture',
					);
					assert.deepEqual(errors, []);
					const owners =
						mode === 'single'
							? ['left']
							: mode === 'siblings'
								? ['left', 'right']
								: mode === 'nested'
									? ['inner', 'left']
									: ['document', 'inner', 'left', 'right'];
					assert.deepEqual(result.semantic.owners, owners);
					if (observed) {
						assert.equal(
							result.counts.elementCaptures,
							owners.filter((owner) => owner !== 'document').length,
						);
						assert.equal(result.counts.documentCaptures, owners.includes('document') ? 1 : 0);
					}
					assert.deepEqual(
						result.semantic.ready,
						owners.map(() => ['fulfilled', 'fulfilled', null]),
					);
					assert.deepEqual(
						result.semantic.finished,
						owners.map(() => 'fulfilled'),
					);
					assert.equal(result.semantic.hostsRetained, true);
					for (const root of result.semantic.roots) assert.equal(root.scope, 'all');
					for (const [id, text] of result.semantic.text) assert.equal(text, id + '-after');
					const expectedEvents = owners
						.flatMap((owner) => (owner === 'document' ? ['page'] : [owner, owner + '-root']))
						.sort();
					assert.deepEqual(
						result.semantic.events.map((event) => event.id).sort(),
						expectedEvents,
						'Every changed scope root and named child must report its callback',
					);
					for (const event of result.semantic.events) {
						const owner = event.id === 'page' ? 'document' : event.id.replace(/-root$/, '');
						assert.equal(event.animatedTarget, owner);
						assert.equal(event.styleOwner, owner);
						assert.ok(event.targets.length > 0);
						assert.ok(event.targets.every((target) => target === owner));
					}
					variants.push(result);
				} finally {
					await within(page.close(), 'scoped page cleanup', 5000);
				}
			}
			assert.deepEqual(
				variants[0].semantic,
				variants[1].semantic,
				'Instrumentation must preserve scoped observations',
			);
			output.cases[mode] = variants[1];
		}
	} finally {
		try {
			if (browser) await within(browser.close(), 'scoped browser cleanup', 5000);
		} finally {
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
		}
	}
}
assert.equal(
	hashOctaneSources(source.packageRoot),
	sourceHash,
	'Source changed during measurements',
);
assert.equal(fixtureHash(), fixtureSourceHash, 'Fixture changed during measurements');
if (process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
