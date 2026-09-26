import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest, experiment, inputs, repo, tree } from './evidence.mjs';
import { start } from './server.mjs';

const output = path.resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Pass the build output directory');
assert.ok(process.env.PLAYWRIGHT_EXECUTABLE_PATH, 'Set the authorized Chromium executable');
const buildFile = path.join(output, 'build-report.json');
const report = JSON.parse(fs.readFileSync(buildFile, 'utf8'));
assert.ok(report.eligible, 'Build did not meet the fixed fixture and emitted-output pins');
assert.deepEqual(inputs(), report.inputs, 'Source or toolchain changed');
assert.deepEqual(experiment(), report.experiment, 'Benchmark changed after the build');
assert.deepEqual(tree(path.join(report.project, '.vercel/output'), new Set()), report.vercelFiles);
assert.deepEqual(
	tree(path.join(output, 'original-function'), new Set()),
	report.originalFunctionFiles,
);
const { server, origin, diagnostics } = await start(report);
const extraServers = [];
let browser;
try {
	async function html(url) {
		const response = await fetch(origin + url);
		const reader = response.body.getReader();
		const chunks = [];
		for (;;) {
			const part = await reader.read();
			if (part.done) break;
			chunks.push(Buffer.from(part.value));
		}
		const bytes = Buffer.concat(chunks);
		return {
			status: response.status,
			selection: response.headers.get('x-static-document-lab'),
			chunks: chunks.map((x) => x.length),
			html: bytes.toString(),
			sha256: digest(bytes),
			bytes: bytes.length,
		};
	}
	const plain = await html('/');
	const selected = await html('/?__staticDocument=1');
	const declined = await html('/?__staticDocument=1&__reject=1');
	assert.equal(plain.status, 200);
	assert.equal(selected.status, 200);
	assert.equal(declined.status, 200);
	assert.equal(plain.selection, 'ordinary');
	assert.equal(selected.selection, 'selected');
	assert.equal(declined.selection, 'fallback');
	for (const value of [plain, declined]) {
		assert.ok(value.html.includes(report.preload));
		assert.ok(value.html.includes(report.hydrationTag));
	}
	assert.ok(!selected.html.includes(report.preload));
	assert.ok(!selected.html.includes(report.hydrationTag));
	function scriptInventory(value) {
		const scripts = [...value.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(
			(match) => ({
				attributes: match[1],
				bytes: Buffer.byteLength(match[2]),
			}),
		);
		const executableInline = scripts.filter(
			(script) =>
				!/\bsrc=/.test(script.attributes) && !/type="application\/json"/.test(script.attributes),
		);
		assert.deepEqual(executableInline, [], 'Unexpected inline executable stream script');
		assert.equal(
			scripts.filter((script) => /type="application\/json"/.test(script.attributes)).length,
			1,
		);
		return scripts;
	}
	const scriptInventories = {
		ordinary: scriptInventory(plain),
		selected: scriptInventory(selected),
		declined: scriptInventory(declined),
	};
	function stable(html) {
		return html
			.replace(report.preload, '')
			.replace(report.hydrationTag, '')
			.replace(/<script id="__octane_data" type="application\/json">[\s\S]*?<\/script>/, '');
	}
	assert.equal(
		stable(plain.html),
		stable(selected.html),
		'All non-bootstrap streamed HTML must match',
	);
	const data = (value) =>
		JSON.parse(
			value.html.match(
				/<script id="__octane_data" type="application\/json">([\s\S]*?)<\/script>/,
			)[1],
		);
	const ordinaryData = data(plain);
	const candidateData = data(selected);
	assert.equal(ordinaryData.entry, '/src/app/Landing.tsrx');
	assert.equal(candidateData.clientBuild.buildId, report.build.buildId);
	for (const value of [ordinaryData, candidateData]) {
		delete value.url;
		delete value.streamedSignals.documentId;
	}
	assert.deepEqual(
		candidateData,
		ordinaryData,
		'Retained route data differs beyond request/document IDs',
	);
	const config = path.join(report.project, '.vercel/output/config.json');
	const saved = fs.readFileSync(config);
	let artifactFallback;
	try {
		fs.appendFileSync(config, '\n');
		artifactFallback = await html('/?__staticDocument=1');
		assert.equal(artifactFallback.selection, 'artifact-fallback');
		assert.ok(artifactFallback.html.includes(report.preload));
		assert.ok(artifactFallback.html.includes(report.hydrationTag));
	} finally {
		fs.writeFileSync(config, saved);
	}
	assert.deepEqual(
		tree(path.join(report.project, '.vercel/output'), new Set()),
		report.vercelFiles,
	);
	const otherRoutes = {};
	for (const route of ['/v1/docs', '/v1/bindings', '/llms.txt', '/not-a-route']) {
		const a = await fetch(origin + route);
		const b = await fetch(origin + route + '?__staticDocument=1');
		const first = Buffer.from(await a.arrayBuffer());
		const second = Buffer.from(await b.arrayBuffer());
		assert.equal(a.status, b.status, route);
		assert.deepEqual(first, second, route);
		otherRoutes[route] = { status: a.status, bytes: first.length, sha256: digest(first) };
	}
	const variants = {};
	for (const variation of ['comment', 'handler', 'text']) {
		const build = spawnSync(process.execPath, [path.join(import.meta.dirname, 'build.mjs')], {
			cwd: repo,
			env: { ...process.env, STATIC_DOCUMENT_VARIANT: variation },
			encoding: 'utf8',
			maxBuffer: 20 * 1024 * 1024,
		});
		assert.equal(build.status, 0, `${variation}: ${build.stderr}`);
		const variantOutput = build.stdout.trim();
		const variantFile = path.join(variantOutput, 'build-report.json');
		const variant = JSON.parse(fs.readFileSync(variantFile, 'utf8'));
		assert.equal(variant.variation, variation);
		assert.deepEqual(variant.inputs, report.inputs);
		assert.deepEqual(variant.experiment, report.experiment);
		const { ['src/app/Landing.tsrx']: changedSource, ...rest } = variant.projectSource;
		const { ['src/app/Landing.tsrx']: baselineSource, ...baselineRest } = report.projectSource;
		assert.notEqual(changedSource, baselineSource);
		assert.deepEqual(rest, baselineRest, 'Only the disposable Landing source may differ');
		assert.equal(variant.sourceAnalysis.accepted, variation !== 'handler');
		assert.equal(variant.eligible, variation === 'comment');
		if (variation === 'comment') {
			assert.deepEqual(variant.fixedPins, report.fixedPins, 'Comment must retain emitted pins');
			assert.notEqual(variant.originalServerSha256, variant.patchedServerSha256);
		} else {
			assert.notDeepEqual(variant.fixedPins, report.fixedPins, 'Changed output must miss pins');
			assert.equal(variant.originalServerSha256, variant.patchedServerSha256);
		}
		if (variation === 'text') {
			assert.notEqual(
				variant.fixedPins.serverWithBuildIdNormalized,
				report.fixedPins.serverWithBuildIdNormalized,
			);
			assert.notEqual(variant.fixedPins.landingClient, report.fixedPins.landingClient);
		}
		assert.deepEqual(
			tree(path.join(variant.project, '.vercel/output'), new Set()),
			variant.vercelFiles,
		);
		assert.deepEqual(
			tree(path.join(variantOutput, 'original-function'), new Set()),
			variant.originalFunctionFiles,
		);
		const wrapper = (
			await import(
				pathToFileURL(path.join(variant.project, '.vercel/output/functions/index.func/index.js'))
					.href
			)
		).default;
		const response = await wrapper.fetch(new Request('http://localhost/?__staticDocument=1'));
		const html = await response.text();
		assert.equal(response.status, 200);
		if (variation === 'text') assert.ok(html.includes('Octane MCP Explorer'));
		assert.equal(
			response.headers.get('x-static-document-lab'),
			variation === 'comment' ? 'selected' : null,
		);
		assert.equal(html.includes(variant.preload), variation !== 'comment');
		assert.equal(html.includes(variant.hydrationTag), variation !== 'comment');
		variants[variation] = {
			output: variantOutput,
			buildReportSha256: digest(fs.readFileSync(variantFile)),
			responseSha256: digest(html),
			bytes: Buffer.byteLength(html),
			status: response.status,
			selection: response.headers.get('x-static-document-lab'),
			changedHeadingObserved: variation === 'text' ? html.includes('Octane MCP Explorer') : null,
		};
	}
	const require = createRequire(path.join(repo, 'packages/octane/package.json'));
	const { chromium } = require('playwright');
	browser = await chromium.launch({
		executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
		headless: true,
	});
	async function sample(mode, javascriptEnabled = true, sampleOrigin = origin) {
		const context = await browser.newContext({
			javaScriptEnabled: javascriptEnabled,
			serviceWorkers: 'block',
		});
		const page = await context.newPage();
		const requests = [];
		const problems = [];
		page.on('request', (request) => requests.push(request));
		page.on('requestfailed', (request) =>
			problems.push(`${request.url()} ${request.failure()?.errorText}`),
		);
		page.on('pageerror', (error) => problems.push(String(error)));
		page.on('console', (message) => {
			if (message.type() === 'error') problems.push(message.text());
		});
		const target =
			mode === 'ordinary'
				? '/'
				: mode === 'selected' || mode === 'unpatched'
					? '/?__staticDocument=1'
					: '/?__staticDocument=1&__reject=1';
		const response = await page.goto(sampleOrigin + target, { waitUntil: 'networkidle' });
		assert.equal(response.status(), 200);
		assert.equal(
			response.headers()['x-static-document-lab'],
			mode === 'declined' ? 'fallback' : mode === 'unpatched' ? undefined : mode,
		);
		const view = await page.evaluate(() => ({
			text: document.querySelector('main').innerText,
			links: [...document.querySelectorAll('main a')].map((a) => ({
				text: a.innerText,
				href: a.href,
				target: a.target,
			})),
			styles: [...document.querySelectorAll('style')].map((s) => s.textContent),
			color: getComputedStyle(document.querySelector('main a')).color,
			scripts: [...document.scripts].map((s) => ({
				type: s.type,
				src: s.getAttribute('src'),
				inlineBytes: new TextEncoder().encode(s.textContent).length,
			})),
		}));
		assert.ok(view.text.includes('Octane MCP'));
		assert.ok(view.links.some((x) => x.href === 'https://octanejs.dev/docs'));
		assert.ok(view.styles.length >= 2, 'Document and scoped styles must both exist');
		const network = await Promise.all(
			requests.map(async (request) => {
				const response = await request.response();
				assert.ok(response, `Missing response ${request.url()}`);
				return {
					path: new URL(request.url()).pathname,
					type: request.resourceType(),
					status: response.status(),
					encoding: response.headers()['content-encoding'] ?? null,
					...(await request.sizes()),
				};
			}),
		);
		const js = network.filter((x) => x.path.endsWith('.js'));
		assert.equal(
			js.length === 0,
			mode === 'selected' || !javascriptEnabled,
			'Unexpected JS requests',
		);
		const executableInline = view.scripts
			.filter((x) => !x.src && (!x.type || x.type === 'module' || x.type === 'text/javascript'))
			.reduce((n, x) => n + x.inlineBytes, 0);
		assert.equal(executableInline, 0, 'This fixture must not emit inline executable script');
		if (mode === 'unpatched') {
			await page.locator('h1').click();
			assert.equal(
				await page.evaluate(() => globalThis.__staticDocumentClicked),
				true,
				'Ordinary event handler did not run',
			);
		}
		await page.route('https://octanejs.dev/docs', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: '<title>External destination control</title>',
			}),
		);
		await Promise.all([
			page.waitForURL('https://octanejs.dev/docs'),
			page.getByRole('link', { name: 'Documentation' }).click(),
		]);
		assert.equal(await page.title(), 'External destination control');
		assert.deepEqual(problems, []);
		await context.close();
		return {
			mode,
			javascriptEnabled,
			ordinaryClickObserved: mode === 'unpatched',
			view,
			network,
			executableInline,
			navigation: 'fulfilled external destination',
		};
	}
	const samples = [];
	for (const [mode, enabled] of [
		['ordinary', true],
		['selected', true],
		['declined', true],
		['selected', false],
	])
		samples.push(await sample(mode, enabled));
	const variationSamples = {};
	for (const variation of ['comment', 'handler']) {
		const variant = JSON.parse(
			fs.readFileSync(path.join(variants[variation].output, 'build-report.json'), 'utf8'),
		);
		const transport = await start(variant);
		extraServers.push(transport.server);
		variationSamples[variation] = await sample(
			variation === 'comment' ? 'selected' : 'unpatched',
			true,
			transport.origin,
		);
		assert.deepEqual(transport.diagnostics(), { errors: [], disconnected: 0 });
		assert.deepEqual(
			tree(path.join(variant.project, '.vercel/output'), new Set()),
			variant.vercelFiles,
		);
		assert.deepEqual(
			tree(path.join(variant.output, 'original-function'), new Set()),
			variant.originalFunctionFiles,
		);
	}
	for (const sample of samples.slice(1)) {
		for (const key of ['text', 'links', 'styles', 'color'])
			assert.deepEqual(sample.view[key], samples[0].view[key], `${sample.mode} ${key}`);
	}
	for (const sample of Object.values(variationSamples)) {
		for (const key of ['text', 'links', 'styles', 'color'])
			assert.deepEqual(sample.view[key], samples[0].view[key], `variation ${key}`);
	}
	assert.deepEqual(inputs(), report.inputs);
	assert.deepEqual(experiment(), report.experiment);
	assert.deepEqual(
		tree(path.join(output, 'original-function'), new Set()),
		report.originalFunctionFiles,
	);
	assert.deepEqual(
		tree(path.join(report.project, '.vercel/output'), new Set()),
		report.vercelFiles,
	);
	assert.deepEqual(diagnostics(), { errors: [], disconnected: 0 });
	const result = {
		buildReportSha256: digest(fs.readFileSync(buildFile)),
		browser: browser.version(),
		http: { ordinary: plain, selected, declined, artifactFallback },
		scriptInventories,
		otherRoutes,
		variants,
		variationSamples,
		samples,
		server: diagnostics(),
	};
	const resultFile = path.join(output, 'verification.json');
	assert.ok(!fs.existsSync(resultFile), 'Do not overwrite previous evidence');
	fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
	console.log(resultFile);
} finally {
	if (browser) await browser.close();
	for (const extra of extraServers) await new Promise((resolve) => extra.close(resolve));
	await new Promise((resolve) => server.close(resolve));
}
