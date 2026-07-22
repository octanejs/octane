import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RSPEEDY_DEPENDENCY_REQUESTS = Object.freeze({
	'@lynx-js/cache-events-webpack-plugin': '^0.2.0',
	'@lynx-js/chunk-loading-webpack-plugin': '^0.4.1',
	'@lynx-js/debug-metadata-rsbuild-plugin': '^0.2.0',
	'@lynx-js/web-rsbuild-server-middleware': '0.22.2',
	'@lynx-js/webpack-dev-transport': '^0.3.0',
	'@lynx-js/websocket': '^0.0.4',
	'@rsbuild/core': '2.1.4',
	'@rsbuild/plugin-css-minimizer': '2.0.0',
	'@rsdoctor/rspack-plugin': '~1.5.6',
});

function readPackage(request, packageName) {
	let filename;
	try {
		filename = request.resolve(`${packageName}/package.json`);
	} catch {
		for (const searchPath of request.resolve.paths(packageName) ?? []) {
			const candidate = join(searchPath, ...packageName.split('/'), 'package.json');
			if (existsSync(candidate)) {
				filename = candidate;
				break;
			}
		}
		if (filename === undefined) {
			let directory = dirname(request.resolve(packageName));
			while (true) {
				const candidate = join(directory, 'package.json');
				try {
					const manifest = JSON.parse(readFileSync(candidate, 'utf8'));
					if (manifest.name === packageName) {
						filename = candidate;
						break;
					}
				} catch {
					// Keep walking from a package-internal entry to its manifest.
				}
				const parent = dirname(directory);
				if (parent === directory) break;
				directory = parent;
			}
		}
	}
	assert.notEqual(filename, undefined, `cannot find ${packageName}'s installed manifest`);
	return {
		filename: realpathSync(filename),
		manifest: JSON.parse(readFileSync(filename, 'utf8')),
	};
}

function nativeScriptText(script) {
	if (typeof script === 'string') return script;
	if (Array.isArray(script)) {
		if (script.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
			return Buffer.from(script).toString('latin1');
		}
		return script.map(nativeScriptText).join('\n');
	}
	if (script !== null && typeof script === 'object') {
		return Object.values(script).map(nativeScriptText).join('\n');
	}
	return '';
}

async function importPackage(request, packageName) {
	const { filename, manifest } = readPackage(request, packageName);
	let entry = manifest.exports?.['.'] ?? manifest.exports;
	if (entry !== null && typeof entry === 'object') {
		entry = entry.import ?? entry.default;
	}
	entry = entry ?? manifest.module ?? manifest.main;
	assert.equal(typeof entry, 'string', `${packageName} has no importable package entry`);
	return await import(pathToFileURL(resolve(dirname(filename), entry)));
}

function digest(value) {
	return createHash('sha256').update(value).digest('hex');
}

function isWithin(directory, target) {
	const path = relative(directory, target);
	return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function assertPackageRelations(request, versions) {
	const rspeedy = readPackage(request, '@lynx-js/rspeedy').manifest;
	for (const [packageName, expectedRequest] of Object.entries(RSPEEDY_DEPENDENCY_REQUESTS)) {
		assert.equal(rspeedy.dependencies?.[packageName], expectedRequest);
	}
	assert.equal(rspeedy.peerDependencies?.typescript, '5.1.6 - 5.9.x');

	const rsbuild = readPackage(request, '@rsbuild/core').manifest;
	assert.equal(rsbuild.dependencies?.['@rspack/core'], '~2.1.2');

	const template = readPackage(request, '@lynx-js/template-webpack-plugin').manifest;
	assert.equal(template.dependencies?.['@lynx-js/tasm'], versions['@lynx-js/tasm']);
	assert.equal(template.dependencies?.['@lynx-js/web-core'], versions['@lynx-js/web-core']);
	assert.equal(template.dependencies?.['@lynx-js/webpack-runtime-globals'], '^0.0.7');

	const css = readPackage(request, '@lynx-js/css-extract-webpack-plugin').manifest;
	assert.equal(css.peerDependencies?.['@lynx-js/template-webpack-plugin'], '^0.13.0');

	const wrapper = readPackage(request, '@lynx-js/runtime-wrapper-webpack-plugin').manifest;
	assert.equal(
		wrapper.dependencies?.['@lynx-js/webpack-runtime-globals'],
		versions['@lynx-js/webpack-runtime-globals'],
	);

	for (const packageName of [
		'@lynx-js/cache-events-webpack-plugin',
		'@lynx-js/chunk-loading-webpack-plugin',
	]) {
		const manifest = readPackage(request, packageName).manifest;
		assert.match(manifest.dependencies?.['@lynx-js/webpack-runtime-globals'], /^\^?0\.0\.7$/);
	}

	const debugMetadata = readPackage(request, '@lynx-js/debug-metadata-rsbuild-plugin').manifest;
	assert.equal(debugMetadata.dependencies?.['@lynx-js/debug-metadata'], '^0.1.0');

	const minimizer = readPackage(request, '@rsbuild/plugin-css-minimizer').manifest;
	assert.equal(minimizer.peerDependencies?.['@rsbuild/core'], '^1.0.0 || ^2.0.0-0');
}

async function buildAndInspect({ consumerRoot, createRspeedy, outputRoot, tasm, targetSdk }) {
	const rspeedy = await createRspeedy({
		cwd: consumerRoot,
		loadEnv: false,
		environment: ['lynx'],
		rspeedyConfig: {
			mode: 'production',
			environments: { lynx: {} },
			dev: { hmr: false, liveReload: false },
			output: {
				cleanDistPath: true,
				dataUriLimit: 0,
				distPath: { root: outputRoot },
				filenameHash: false,
				sourceMap: false,
			},
			source: { entry: { main: './src/background.ts' } },
			splitChunks: false,
			plugins: [tasm.pluginOctane({ hmr: false, dev: false })],
		},
	});
	let result;
	try {
		result = await rspeedy.build();
	} finally {
		await result?.close();
	}

	const bundlePath = join(outputRoot, 'main.lynx.bundle');
	assert.equal(existsSync(bundlePath), true, 'Rspeedy emitted no main.lynx.bundle');
	const bundle = readFileSync(bundlePath);
	const decoded = tasm.supportNapi() ? tasm.decode_napi(bundle) : await tasm.decode_wasm(bundle);
	assert.equal(decoded['engine-version'], targetSdk);
	const mainThread = nativeScriptText(decoded['main-thread-script']);
	const background = nativeScriptText(decoded['background-thread-script']);
	const completeBundle = nativeScriptText(decoded);
	// The receiver's diagnostic describes its one-shot render phase. It is not
	// a reference to the browser global and is the only allowed `window` token.
	const executableBundle = completeBundle.replaceAll(
		'render window has closed',
		'render phase has closed',
	);
	assert.match(mainThread, /getJSContext/);
	assert.doesNotMatch(mainThread, /getCoreContext/);
	assert.match(background, /getCoreContext/);
	assert.doesNotMatch(background, /getJSContext/);
	assert.match(mainThread, /milestone-five/);
	assert.match(background, /milestone-five/);
	assert.doesNotMatch(
		executableBundle,
		/\b(?:document|window|HTMLElement|MutationObserver)\b/,
		'decoded native programs contain a DOM runtime global',
	);
	assert.doesNotMatch(
		completeBundle,
		/(?:^|[^$\w])(?:react|react-dom|preact|ReactLynx)(?:[^$\w]|$)/i,
		'decoded native programs contain a React-family runtime reference',
	);
	assert.equal(existsSync(join(outputRoot, 'static/svg/badge.svg')), true);

	const semantics = JSON.stringify({
		assets: ['static/svg/badge.svg'],
		backgroundContext: 'getCoreContext',
		engineVersion: decoded['engine-version'],
		mainContext: 'getJSContext',
		marker: 'milestone-five',
	});
	return {
		bundleBytes: bundle.byteLength,
		bundleChecksum: digest(bundle),
		semanticChecksum: digest(semantics),
	};
}

export async function verifyCompatibilityConsumer({ consumerRoot, laneName, workspaceRoot }) {
	const request = createRequire(join(consumerRoot, 'package.json'));
	const plugin = await importPackage(request, '@octanejs/rspeedy-plugin');
	const rspeedy = await importPackage(request, '@lynx-js/rspeedy');
	const tasm = await importPackage(request, '@lynx-js/tasm');
	const lane = plugin.LYNX_TOOLCHAIN_LANES[laneName];
	assert.notEqual(lane, undefined, `packed plugin does not expose the ${laneName} lane`);

	for (const [packageName, version] of Object.entries(lane.packages)) {
		assert.equal(
			readPackage(request, packageName).manifest.version,
			version,
			`${packageName} drifted outside the ${laneName} lane`,
		);
	}
	assertPackageRelations(request, lane.packages);

	const toolchain = plugin.assertLynxToolchain(consumerRoot, laneName);
	for (const [packageName, value] of Object.entries(toolchain)) {
		assert.equal(value.version, lane.packages[packageName]);
		assert.equal(
			value.path,
			readPackage(request, packageName).filename,
			`${packageName} resolved to more than one physical package instance`,
		);
	}

	const localPackages = [
		'octane',
		'@octanejs/lynx',
		'@octanejs/rspack-plugin',
		'@octanejs/rspeedy-plugin',
	];
	for (const packageName of localPackages) {
		const entry = realpathSync(request.resolve(packageName));
		assert.equal(
			isWithin(workspaceRoot, entry),
			false,
			`${packageName} resolved to workspace source instead of its packed archive`,
		);
	}

	const directOctane = realpathSync(request.resolve('octane'));
	for (const packageName of localPackages.slice(1)) {
		const entry = realpathSync(request.resolve(packageName));
		const peerOctane = realpathSync(createRequire(entry).resolve('octane'));
		assert.equal(peerOctane, directOctane, `${packageName} resolved a second Octane runtime`);
	}

	const virtualStore = join(consumerRoot, 'node_modules/.pnpm');
	const forbidden = readdirSync(virtualStore).filter((entry) =>
		/^(?:react|react-dom|preact)@|^@lynx-js\+react@/.test(entry),
	);
	assert.deepEqual(forbidden, [], `installed forbidden renderer runtimes: ${forbidden.join(', ')}`);

	const outputRoot = join(consumerRoot, 'dist');
	const buildOptions = {
		consumerRoot,
		createRspeedy: rspeedy.createRspeedy,
		outputRoot,
		targetSdk: lane.targetSdk,
		tasm: { ...tasm, pluginOctane: plugin.pluginOctane },
	};
	const first = await buildAndInspect(buildOptions);
	const second = await buildAndInspect(buildOptions);
	assert.deepEqual(
		second,
		first,
		'two clean builds of the exact compatibility graph must be byte-for-byte deterministic',
	);

	return { lane: laneName, ...first, versions: lane.packages };
}
