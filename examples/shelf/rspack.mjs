// The same three pages and server as vite.config.ts, built with Rspack.
// `node rspack.mjs` builds into dist-rspack/client and dist-rspack/server, each
// compiler cleaning only its own folder; `--watch` rebuilds on each change
// and restarts the server. Octane owns every .tsrx file; React owns the .tsx
// files, which carry a React JSX pragma.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rspack } from '@rspack/core';
import { OctaneRspackPlugin } from '@octanejs/rspack-plugin';

const root = fileURLToPath(new URL('.', import.meta.url));
const out = `${root}dist-rspack/`;
const watch = process.argv.includes('--watch');
const mode = watch ? 'development' : 'production';

const swc = (react) => ({
	loader: 'builtin:swc-loader',
	options: {
		jsc: {
			parser: { syntax: 'typescript', tsx: react },
			...(react ? { transform: { react: { runtime: 'automatic', importSource: 'react' } } } : {}),
		},
	},
});
const rules = [
	{ test: /\.tsx$/, type: 'javascript/auto', use: [swc(true)] },
	// After Octane compiles .tsrx, and passes plain .ts through.
	{ test: /\.(?:tsrx|ts)$/, type: 'javascript/auto', use: [swc(false)] },
];
// Octane ships its TypeScript source, whose imports name the built `.js` files.
const resolve = { extensionAlias: { '.js': ['.ts', '.js'] } };
const octane = () => new OctaneRspackPlugin({ requireDirective: true, transpile: false });

/** A page's HTML, without the entry script Vite reads: Rspack adds its own bundle. */
const page = (file, chunk) =>
	new rspack.HtmlRspackPlugin({
		filename: file,
		templateContent: readFileSync(root + file, 'utf8').replace(
			/\s*<script type="module" src="[^"]+"><\/script>/,
			'',
		),
		chunks: [chunk],
		scriptLoading: 'module',
		// Keep the server render's <!--ssr-html--> and <!--ssr-seed--> markers.
		minify: false,
	});

/** @type {import('@rspack/core').Configuration[]} */
const configs = [
	{
		name: 'client',
		mode,
		context: root,
		target: 'web',
		resolve,
		entry: {
			octane: './src/octane/main.ts',
			react: './src/react/main.tsx',
			mixed: './src/mixed/main.tsrx',
		},
		output: {
			path: `${out}client/`,
			filename: 'static/[name].[contenthash:8].js',
			publicPath: '/',
			clean: true,
		},
		module: { rules: [...rules, { test: /\.css$/, type: 'css/auto' }] },
		plugins: [
			octane(),
			page('index.html', 'octane'),
			page('react.html', 'react'),
			page('mixed.html', 'mixed'),
		],
		devtool: false,
	},
	{
		name: 'server',
		mode,
		context: root,
		target: 'node',
		resolve,
		entry: { index: './src/server/node.ts' },
		output: {
			path: `${out}server/`,
			filename: '[name].js',
			module: true,
			chunkFormat: 'module',
			clean: true,
		},
		module: {
			rules,
			// The server finds the client build from its own location at run time.
			parser: { javascript: { importMeta: false } },
		},
		plugins: [octane()],
		devtool: false,
	},
];

const compiler = rspack(configs);
let server;
const done = (error, stats) => {
	if (error || stats.hasErrors()) {
		console.error(error ?? stats.toString({ all: false, errors: true }));
		if (!watch) process.exitCode = 1;
		return;
	}
	console.log(stats.toString({ all: false, assets: !watch, colors: true }) || 'built');
	if (!watch) return compiler.close(() => {});
	server?.kill();
	server = spawn(process.execPath, [`${out}server/index.js`], { stdio: 'inherit' });
};
if (watch) compiler.watch({}, done);
else compiler.run(done);
