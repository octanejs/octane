import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TARGETS } from './contract.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = path.resolve(HERE, '../..');
const requireFromNews = createRequire(new URL('../news/package.json', import.meta.url));
const requireFromReact = createRequire(new URL('../news/react/package.json', import.meta.url));
const requireFromRepo = createRequire(new URL('../../package.json', import.meta.url));
const workingPackage = path.join(REPO, 'packages/octane');

function git(args) {
	return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
}

function hashFile(file) {
	return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function packageVersion(resolver, name) {
	let directory = path.dirname(resolver.resolve(name));
	while (directory !== path.dirname(directory)) {
		const file = path.join(directory, 'package.json');
		if (fs.existsSync(file)) {
			const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
			if (metadata.name === name) return metadata.version;
		}
		directory = path.dirname(directory);
	}
	throw new Error(`Cannot find package metadata for ${name}`);
}

function hashFixture(scenario) {
	const hash = createHash('sha256');
	const files =
		scenario === 'caught-reveal'
			? [
					'HiddenCaughtReveal.tsrx',
					'caught-reveal-browser.ts',
					'caught-reveal-contract.mjs',
					'caught-reveal-model.ts',
					'contract.mjs',
					'model.ts',
					'octane-caught-reveal.html',
					'octane-caught-reveal.ts',
				]
			: scenario === 'refs'
				? [
						'RefControl.tsrx',
						'ref-browser.ts',
						'ref-contract.mjs',
						'ref-model.ts',
						'contract.mjs',
						'model.ts',
						'octane-refs.ts',
						'react-refs.ts',
					]
				: ['App.tsrx', 'browser.ts', 'contract.mjs', 'model.ts', 'octane.ts', 'react.ts'];
	for (const file of files) {
		hash
			.update(file)
			.update('\0')
			.update(fs.readFileSync(path.join(HERE, file)))
			.update('\0');
	}
	return hash.digest('hex');
}

function builtAssets(outDir) {
	const hash = createHash('sha256');
	let javascriptBytes = 0;
	function visit(directory) {
		for (const entry of fs
			.readdirSync(directory, { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name))) {
			const file = path.join(directory, entry.name);
			if (entry.isDirectory()) visit(file);
			else if (entry.isFile() && entry.name.endsWith('.js')) {
				const contents = fs.readFileSync(file);
				javascriptBytes += contents.byteLength;
				hash.update(path.relative(outDir, file)).update('\0').update(contents).update('\0');
			}
		}
	}
	visit(outDir);
	return { javascriptBytes, assetsSha256: hash.digest('hex') };
}

export function hashOctaneSources(packageRoot) {
	const hash = createHash('sha256');
	function visit(relative) {
		const file = path.join(packageRoot, relative);
		const stat = fs.statSync(file);
		if (stat.isDirectory()) {
			for (const entry of fs.readdirSync(file).sort()) visit(path.join(relative, entry));
		} else if (stat.isFile()) {
			hash.update(relative).update('\0').update(fs.readFileSync(file)).update('\0');
		}
	}
	visit('package.json');
	visit('src');
	return hash.digest('hex');
}

export function octanePackageAt(revision) {
	if (!revision) return { packageRoot: workingPackage, revision: git(['rev-parse', 'HEAD']) };
	if (!/^[a-f\d]{7,40}$/i.test(revision)) {
		throw new Error('--octane-revision must be a hexadecimal Git commit');
	}
	const commit = git(['rev-parse', '--verify', `${revision}^{commit}`]);
	const snapshot = path.join(HERE, 'dist/revisions', commit);
	const packageRoot = path.join(snapshot, 'packages/octane');
	const complete = path.join(snapshot, '.complete');
	if (!fs.existsSync(complete)) {
		fs.mkdirSync(snapshot, { recursive: true });
		const archive = execFileSync('git', ['archive', '--format=tar', commit, 'packages/octane'], {
			cwd: REPO,
			maxBuffer: 128 * 1024 * 1024,
		});
		execFileSync('tar', ['-x', '-C', snapshot], { input: archive });
		fs.writeFileSync(complete, `${commit}\n`);
	}
	const dependencies = path.join(packageRoot, 'node_modules');
	if (!fs.lstatSync(dependencies, { throwIfNoEntry: false })) {
		fs.symlinkSync(path.join(workingPackage, 'node_modules'), dependencies, 'dir');
	}
	return { packageRoot, revision: commit };
}

export function parseOptions(argv, { iterations = false } = {}) {
	const options = {
		noBuild: false,
		revision: process.env.OCTANE_ACTIVITY_REVISION || undefined,
		targets: TARGETS,
		iterations: 8,
	};
	let positional = false;
	for (const arg of argv) {
		if (arg === '--no-build') options.noBuild = true;
		else if (arg.startsWith('--octane-revision=')) {
			options.revision = arg.split('=')[1];
			if (!options.revision) throw new Error('--octane-revision requires a Git commit');
		} else if (arg.startsWith('--target=')) options.targets = [arg.split('=')[1]];
		else if (iterations && !arg.startsWith('--') && !positional) {
			options.iterations = Number(arg);
			positional = true;
		} else throw new Error(`Unknown Activity benchmark argument: ${arg}`);
	}
	if (!Number.isSafeInteger(options.iterations) || options.iterations < 1) {
		throw new Error('Activity benchmark iterations must be a positive integer');
	}
	for (const target of options.targets) {
		if (!TARGETS.includes(target)) throw new Error(`Unknown Activity target: ${target}`);
	}
	return options;
}

export function chromium() {
	return requireFromNews('playwright').chromium;
}

export function environmentFor(browser, extra = {}) {
	return {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		osRelease: os.release(),
		cpu: os.cpus()[0]?.model ?? 'unknown',
		chromium: browser.version(),
		...extra,
	};
}

export async function startFixture({
	target,
	work = false,
	noBuild = false,
	revision,
	scenario = 'activity',
} = {}) {
	if (!TARGETS.includes(target)) throw new Error(`Unknown Activity target: ${target}`);
	if (scenario !== 'activity' && scenario !== 'refs' && scenario !== 'caught-reveal') {
		throw new Error(`Unknown Activity fixture scenario: ${scenario}`);
	}
	if (scenario === 'caught-reveal' && target !== 'octane-tsrx') {
		throw new Error('The caught-reveal Activity fixture is Octane-only');
	}
	process.env.NODE_ENV = 'production';
	const source = octanePackageAt(revision);
	const requireFromOctane = createRequire(path.join(source.packageRoot, 'package.json'));
	const { build, preview } = await import(pathToFileURL(requireFromNews.resolve('vite')).href);
	const octaneEntry = requireFromOctane.resolve('octane');
	if (octaneEntry !== path.join(source.packageRoot, 'src/index.ts')) {
		throw new Error(`Octane source resolver escaped the selected package: ${octaneEntry}`);
	}
	const publicImports = {
		name: 'activity-workspace-public-imports',
		enforce: 'pre',
		resolveId(request) {
			if (target === 'react' && request === 'octane') return requireFromReact.resolve('react');
			if (target === 'octane-tsrx' && (request === 'octane' || request.startsWith('octane/'))) {
				return requireFromOctane.resolve(request);
			}
			if (
				request === 'react' ||
				request.startsWith('react/') ||
				request === 'react-dom' ||
				request.startsWith('react-dom/') ||
				request === '@tsrx/react' ||
				request.startsWith('@tsrx/react/')
			) {
				return requireFromReact.resolve(request);
			}
			return null;
		},
	};
	let compilerPlugins;
	if (target === 'octane-tsrx') {
		const { octane } = await import(
			pathToFileURL(requireFromOctane.resolve('octane/compiler/vite')).href
		);
		compilerPlugins = [octane({ hmr: false, profile: false })];
	} else {
		const { default: tsrxReact } = await import(
			pathToFileURL(requireFromReact.resolve('@tsrx/vite-plugin-react')).href
		);
		const { reactCompiler } = await import('../react-compiler.mjs');
		compilerPlugins = [tsrxReact(), reactCompiler()];
	}
	const scenarioSuffix =
		scenario === 'refs' ? '-refs' : scenario === 'caught-reveal' ? '-caught-reveal' : '';
	const entry = `${target === 'octane-tsrx' ? 'octane' : 'react'}${scenarioSuffix}.html`;
	const buildIdentity = revision ? source.revision : 'working';
	const buildKind = `${work ? 'work' : 'timing'}${scenarioSuffix}`;
	const outDir = path.join(HERE, 'dist/builds', buildIdentity, target, buildKind);
	const inputs = {
		octaneRevision: source.revision,
		octaneSource: source.packageRoot,
		octaneSourceSha256: hashOctaneSources(source.packageRoot),
		fixtureSourceSha256: hashFixture(scenario),
		lockfileSha256: hashFile(path.join(REPO, 'pnpm-lock.yaml')),
		parser: process.env.OCTANE_ACTIVITY_PARSER ?? 'package-default',
		tsrxCore: packageVersion(requireFromOctane, '@tsrx/core'),
		tsrxReact: packageVersion(requireFromReact, '@tsrx/react'),
		react: requireFromReact('react/package.json').version,
		reactCompilerVersion: packageVersion(requireFromRepo, 'babel-plugin-react-compiler'),
		vite: requireFromNews('vite/package.json').version,
		esbuild: packageVersion(createRequire(requireFromNews.resolve('vite')), 'esbuild'),
		playwright: requireFromNews('playwright/package.json').version,
		production: true,
		reactCompiler: target === 'react',
	};
	const inputsFile = path.join(outDir, 'activity-build.json');
	if (!noBuild) {
		await build({
			configFile: false,
			root: HERE,
			logLevel: 'warn',
			plugins: [publicImports, ...compilerPlugins],
			define: {
				'process.env.NODE_ENV': JSON.stringify('production'),
				__OCTANE_PROFILE_ENABLED__: 'false',
			},
			build: {
				outDir,
				emptyOutDir: true,
				target: 'esnext',
				minify: work ? false : 'esbuild',
				rollupOptions: {
					input: path.join(HERE, entry),
					output: {
						entryFileNames: 'assets/[name]-[hash].js',
						chunkFileNames: 'assets/[name]-[hash].js',
					},
				},
			},
		});
		if (inputs.octaneSourceSha256 !== hashOctaneSources(source.packageRoot)) {
			throw new Error('Octane source changed during the Activity build; rerun after edits finish');
		}
		if (inputs.fixtureSourceSha256 !== hashFixture(scenario)) {
			throw new Error('Activity fixture changed during its build; rerun after edits finish');
		}
		fs.writeFileSync(inputsFile, `${JSON.stringify(inputs, null, '\t')}\n`);
	} else if (
		!fs.existsSync(inputsFile) ||
		JSON.stringify(JSON.parse(fs.readFileSync(inputsFile, 'utf8'))) !== JSON.stringify(inputs)
	) {
		throw new Error('Activity --no-build inputs are stale; rebuild the selected target');
	}
	if (!fs.existsSync(path.join(outDir, entry))) {
		throw new Error(`Missing production Activity fixture: ${outDir}`);
	}
	const server = await preview({
		configFile: false,
		root: HERE,
		logLevel: 'error',
		build: { outDir },
		preview: { host: '127.0.0.1', port: 0, strictPort: true },
	});
	const address = server.httpServer.address();
	if (address === null || typeof address === 'string') {
		await server.close();
		throw new Error('The Activity preview did not expose a TCP port');
	}
	return {
		url: `http://127.0.0.1:${address.port}/${entry}`,
		meta: {
			...inputs,
			...builtAssets(outDir),
			build: outDir,
		},
		close: () => server.close(),
	};
}

export async function openCase(browser, url) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	try {
		await page.goto(url, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
		return { context, page, errors };
	} catch (error) {
		await context.close();
		throw new Error(`Activity production fixture failed to start: ${errors.join('; ')}`, {
			cause: error,
		});
	}
}

export function checkBrowserErrors(target, errors) {
	if (errors.length !== 0) throw new Error(`${target}: browser errors: ${errors.join('; ')}`);
}

export async function closeResources(...resources) {
	const errors = [];
	for (const resource of resources) {
		if (!resource) continue;
		try {
			await resource.close();
		} catch (error) {
			errors.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
		}
	}
	return errors;
}

export function writePayload(payload) {
	if (process.env.BENCH_JSON) {
		fs.mkdirSync(path.dirname(path.resolve(process.env.BENCH_JSON)), { recursive: true });
		fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
	}
}

export function countStat(value) {
	if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid work count: ${value}`);
	return { score: value, median: value, min: value, samples: 1 };
}
