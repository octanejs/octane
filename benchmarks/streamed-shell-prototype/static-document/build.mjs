import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { analyze } from '../static-document-analysis/analyze.mjs';
import { digest, experiment, inputs, repo, tree } from './evidence.mjs';

const expectedSource = {
	'index.html': '60907c7e9ee9371a4aa8f93404b709e846531e8a76f28bc1cf5723853a6f306c',
	'vite.config.ts': '811195a896dcde53d97ee2046eae66aca9d1a8595f559d7fad4d0cefedf34f20',
	'octane.config.ts': '09f84df2592a1628aa2744bb94fed6b9f61b9ce299c9bcfc8dabc8723f55f7ce',
	'src/server/routes.ts': '9dbc03f2ab8784c525d354c809e0add359b5c65edc5ebf6c3d819804f4f78070',
	'src/app/Landing.tsrx': 'b9db6fb31d513f5777bd48a1437de02931b390af986a3d22b97a880cae7cbdc2',
};
const before = inputs();
const experimentBefore = experiment();
const output = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'octane-static-document-')));
const project = path.join(output, 'website-mcp');
fs.cpSync(path.join(repo, 'website-mcp'), project, {
	recursive: true,
	filter: (file) =>
		!new Set(['node_modules', 'dist', '.vercel', '.vite', '.octane']).has(path.basename(file)),
});
assert.deepEqual(tree(project), before.trees['website-mcp']);
const variation = process.env.STATIC_DOCUMENT_VARIANT ?? 'baseline';
assert.ok(
	['baseline', 'comment', 'handler', 'text'].includes(variation),
	'Unknown source variation',
);
const landingFile = path.join(project, 'src/app/Landing.tsrx');
let landingSource = fs.readFileSync(landingFile, 'utf8');
if (variation === 'comment') landingSource += '\n// Harmless source drift.\n';
if (variation === 'handler' || variation === 'text') {
	const originalHeading = '<h1>Octane MCP</h1>';
	assert.equal(landingSource.split(originalHeading).length, 2, 'Unexpected fixture heading');
	const replacementHeading =
		variation === 'handler'
			? '<h1 onClick={() => { globalThis.__staticDocumentClicked = true; }}>Octane MCP</h1>'
			: '<h1>Octane MCP Explorer</h1>';
	landingSource = landingSource.replace(originalHeading, replacementHeading);
}
if (variation !== 'baseline') fs.writeFileSync(landingFile, landingSource);
const projectSource = tree(project);
const sourceAnalysis = analyze(landingSource, landingFile);
const sourcePinned =
	sourceAnalysis.accepted &&
	Object.entries(expectedSource)
		.filter(([file]) => file !== 'src/app/Landing.tsrx')
		.every(([file, hash]) => projectSource[file] === hash);
for (const name of ['website', 'docs', 'packages'])
	fs.symlinkSync(path.join(repo, name), path.join(output, name), 'dir');
const links = {
	vite: 'node_modules/vite',
	octane: 'packages/octane',
	'@octanejs/vite-plugin': 'packages/vite-plugin-octane',
	'@octanejs/adapter-vercel': 'packages/adapter-vercel',
	'@octanejs/mcp-server': 'packages/octane-mcp-server',
	'@modelcontextprotocol/sdk':
		'node_modules/.pnpm/@modelcontextprotocol+sdk@1.29.0_supports-color@10.2.2_zod@4.4.3/node_modules/@modelcontextprotocol/sdk',
	zod: 'node_modules/.pnpm/zod@4.4.3/node_modules/zod',
	'@tsrx/oxc-darwin-arm64':
		'node_modules/.pnpm/@tsrx+oxc-darwin-arm64@0.16.0/node_modules/@tsrx/oxc-darwin-arm64',
};
for (const [name, source] of Object.entries(links)) {
	const target = path.join(project, 'node_modules', name);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.symlinkSync(fs.realpathSync(path.join(repo, source)), target, 'dir');
}
const build = spawnSync(
	process.execPath,
	[path.join(repo, 'node_modules/vite/bin/vite.js'), 'build'],
	{
		cwd: project,
		encoding: 'utf8',
		maxBuffer: 20 * 1024 * 1024,
	},
);
fs.writeFileSync(path.join(output, 'build.log'), build.stdout + build.stderr);
assert.equal(build.status, 0, `Vite build failed; see ${path.join(output, 'build.log')}`);
assert.deepEqual(inputs(), before, 'Inputs changed during the build');
assert.deepEqual(experiment(), experimentBefore, 'Benchmark scripts changed during the build');
assert.deepEqual(tree(project), projectSource, 'Copied app changed during build');

const functionDir = path.join(project, '.vercel/output/functions/index.func');
const originalFunctionDir = path.join(output, 'original-function');
fs.cpSync(functionDir, originalFunctionDir, { recursive: true });
const staticDir = path.join(project, '.vercel/output/static');
const serverFile = path.join(functionDir, 'entry.js');
const original = fs.readFileSync(serverFile, 'utf8');
const template = fs.readFileSync(path.join(functionDir, 'index.html'), 'utf8');
const hydration = template.match(
	/<script type="module" data-octane-hydrate src="\/(assets\/[^" ]+\.js)" nonce="__OCTANE_REQUEST_NONCE__"><\/script>/g,
);
const hydrationTag = hydration?.[0]?.replace(' nonce="__OCTANE_REQUEST_NONCE__"', '') ?? '';
const page = original.match(/"\/src\/app\/Landing\.tsrx":\s*\{\s*"js":\s*"([^"]+)"/);
const pageFile = page?.[1] ?? '';
const preload = `<link rel="modulepreload" href="/${pageFile}">`;
const clientBuild = JSON.parse(
	fs.readFileSync(path.join(functionDir, 'octane-client-build.json'), 'utf8'),
);
const hydrateFile = hydrationTag.match(/src="\/(assets\/[^" ]+\.js)"/)?.[1] ?? '';
const hydrateBytes =
	hydrateFile && fs.existsSync(path.join(staticDir, hydrateFile))
		? fs.readFileSync(path.join(staticDir, hydrateFile), 'utf8')
		: '';
const buildIdentityMatches =
	!!clientBuild.buildId &&
	original.split(clientBuild.buildId).length === 2 &&
	hydrateBytes.split(clientBuild.buildId).length === 2;
const marker =
	'\t\tconst [prefix, suffix, afterShell] = splitAroundBody(hoistedHead, earlyHydration);';
const fixedPins = {
	serverWithBuildIdNormalized: digest(original.split(clientBuild.buildId).join('BUILD-ID')),
	serverAssets: digest(JSON.stringify(tree(path.join(functionDir, 'assets'), new Set()))),
	templateWithHydrateFilenameNormalized: digest(
		template.replace(/octane-hydrate-[^" ]+\.js/g, 'octane-hydrate-PIN.js'),
	),
	landingClient:
		pageFile && fs.existsSync(path.join(staticDir, pageFile))
			? digest(fs.readFileSync(path.join(staticDir, pageFile)))
			: null,
};
const expectedClientGraph = {
	'Landing-BCRBWZR5.js': 'dd55d9191de0f9409e64f6a3465a8885f8978337d45a8c6991794bd976a1243b',
	'control-capture-CcdYtROe.js': '2f295201f1db70263ea10a8518a650546d67406d35815a8b338a3eeaac217e6f',
	'dom-binding-handoff-BA72rAV8.js':
		'fccf32ad6ed5ae2941b2fcf03b4a517691ed94d368f54af41d840db77bc9ceb8',
	'event-capture-COreLSiY.js': '76728db4fd3fe4e39a0585ebaebb5ce8b0b73e4b814f0c228eff0d05a887a7af',
	'hydration-DZBQZwfS.js': '9a62e3231a0cab55eda7cdc93109e47303271e75f87f6199f7196c41aa049a3c',
	'native-read-seeds-pGwfxpaw.js':
		'df95ba91d2dcb2b41a3888227ff9b5871f376f1fa7d98d8cc3cb5a6644f79448',
	'octane-hydrate-PIN.js': '688b7619ec4242151dcfb1885e9908b6040105a4ede917582aacb5b5578d0a1d',
	'runtime-4ovI85_U.js': 'd6a36c30b3256695d7a74ca0258e12e06c2e8925c0686e2dfafaeb075ad515ba',
	'streamed-signals-DTyNZJHO.js':
		'f6c0be83d0f2bde99a5963b81347fc5bed55d4d3f0c309a0be9283df2c73bbfa',
	'types-DcDqO4n1.js': '0ab75f43c65fb62142d08efe10661de26e447fec4a7a7d7ce5d591fc84b674ae',
};
const clientGraph = Object.fromEntries(
	fs
		.readdirSync(path.join(staticDir, 'assets'))
		.filter((file) => file.endsWith('.js'))
		.sort()
		.map((file) => {
			const contents = fs
				.readFileSync(path.join(staticDir, 'assets', file), 'utf8')
				.split(clientBuild.buildId)
				.join('BUILD-ID')
				.replace(/(octane-hydrate)-[A-Za-z0-9_-]+\.js/g, '$1-PIN.js');
			return [
				file.replace(/^octane-hydrate-[A-Za-z0-9_-]+\.js$/, 'octane-hydrate-PIN.js'),
				digest(contents),
			];
		}),
);
fixedPins.clientGraph = clientGraph;
const eligible =
	sourcePinned &&
	hydration?.length === 1 &&
	!!pageFile &&
	buildIdentityMatches &&
	original.split(marker).length === 2 &&
	clientBuild.capabilities.independentHydration === false &&
	fixedPins.serverWithBuildIdNormalized ===
		'06a849e53d93dcb3f4eeb27a361e3e50229c255688bfe8231f038d642f6710a0' &&
	fixedPins.serverAssets === '957a0f50a0fb25e1df6fa8145e9173f065dfee308874f0974f5e16d6ca8674f9' &&
	fixedPins.templateWithHydrateFilenameNormalized ===
		'056222696398324f2d55a1c4b028d594f704c958ecca978c65947073b5075fda' &&
	fixedPins.landingClient === 'dd55d9191de0f9409e64f6a3465a8885f8978337d45a8c6991794bd976a1243b' &&
	JSON.stringify(clientGraph) === JSON.stringify(expectedClientGraph);
const replacement = `
        let [prefix, suffix, afterShell] = splitAroundBody(hoistedHead, earlyHydration);
        // Benchmark-only, pinned whole-document contract: the original stream is untouched.
        const requested = context.url.searchParams.get('__staticDocument') === '1';
        const preloadTag = ${JSON.stringify(preload)};
        const hydrateTag = ${JSON.stringify(hydrationTag)};
        const count = (s, part) => s.split(part).length - 1;
        const parts = [prefix, suffix, afterShell];
        const exact = (tag) => parts.reduce((n, part) => n + count(part, tag), 0) === 1;
        const ok = requested && context.request.method === 'GET' && context.url.pathname === '/' &&
          !context.url.searchParams.has('__reject') && route.path === '/' && entryPath === '/src/app/Landing.tsrx' &&
          exportName === 'Landing' && !route.layout && !manifest.preHydrate &&
          !manifest.rootBoundary?.pending && !manifest.rootBoundary?.catch &&
          !(route.before?.length) && !(manifest.middlewares?.length) && nonce === null &&
          clientBuild?.buildId === ${JSON.stringify(clientBuild.buildId)} &&
          clientBuild?.capabilities.independentHydration === false && !earlyHydration &&
          htmlTemplate === ${JSON.stringify(template)} &&
          manifest.clientAssets?.[entryPath]?.js === ${JSON.stringify(pageFile)} &&
          (manifest.clientAssets?.[entryPath]?.css?.length ?? 0) === 0 && exact(preloadTag) && exact(hydrateTag);
        if (ok) [prefix, suffix, afterShell] = parts.map(part => part.replace(preloadTag, '').replace(hydrateTag, ''));
        headers['x-static-document-lab'] = ok ? 'selected' : requested ? 'fallback' : 'ordinary';`;
fs.writeFileSync(serverFile, eligible ? original.replace(marker, replacement) : original);
const wrapperFile = path.join(functionDir, 'index.js');
const wrapper = fs.readFileSync(wrapperFile, 'utf8');
assert.equal(wrapper.split("'./entry.js'").length, 2, 'Unexpected Vercel wrapper');
const assets = Object.fromEntries(
	Object.keys(tree(staticDir, new Set())).map((file) => {
		const bytes = fs.readFileSync(path.join(staticDir, file));
		return [
			file,
			{ sha256: digest(bytes), raw: bytes.length, gzip9: gzipSync(bytes, { level: 9 }).length },
		];
	}),
);
const report = {
	output,
	project,
	node: process.version,
	variation,
	expectedSource,
	projectSource,
	sourceAnalysis,
	sourcePinned,
	inputs: before,
	experiment: experimentBefore,
	build: clientBuild,
	pageFile,
	hydrationTag,
	preload,
	fixedPins,
	eligible,
	originalServerSha256: digest(original),
	patchedServerSha256: digest(fs.readFileSync(serverFile)),
	templateSha256: digest(template),
	assets,
	originalFunctionFiles: tree(originalFunctionDir, new Set()),
	vercelFiles: tree(path.join(project, '.vercel/output'), new Set()),
};
fs.writeFileSync(path.join(output, 'build-report.json'), JSON.stringify(report, null, 2));
console.log(output);
