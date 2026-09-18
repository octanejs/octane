import { resolve } from 'node:path';
import { defineConfig, transformWithOxc } from 'vite';
import { transformSync } from '@babel/core';
import reactCompiler from 'babel-plugin-react-compiler';
import { octane } from '../../octane/src/compiler/vite.js';

const packageRoot = resolve(import.meta.dirname, '..');
const mode = process.env.OCTANE_VIRTUAL_BROWSER_MODE ?? 'pristine';
if (!['pristine', 'adapted', 'baseline'].includes(mode)) throw new Error(`Unknown mode: ${mode}`);
const native = mode !== 'pristine';
const appRoot = resolve(packageRoot, native ? 'tests/upstream/browser' : 'upstream/e2e/app');
const pages = [
	'cached-measurements',
	'chat-resize',
	'chat',
	'direct-dom-updates',
	'measure-element',
	'react-compiler',
	'scroll-anchor',
	'scroll',
	'smooth-scroll',
	'stale-index',
];

export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(packageRoot, '.browser-dist/cache', mode),
	plugins: [
		{
			name: 'virtual-fixture-routes',
			configurePreviewServer(server) {
				server.middlewares.use((request, _response, next) => {
					const first = request.url?.split('/')[1]?.split('?')[0];
					if (first === 'prepend' && native) request.url = '/tests/browser-fixtures' + request.url;
					else if (first && pages.includes(first))
						request.url = (native ? '/tests/upstream/browser' : '/upstream/e2e/app') + request.url;
					next();
				});
			},
		},
		...(native
			? [
					{
						name: 'virtual-native-jsx',
						enforce: 'pre',
						transform(code, id) {
							if (id.startsWith(appRoot + '/') && id.endsWith('.tsx'))
								return { code: '/** @jsxImportSource octane */\n' + code, map: null };
						},
					},
					octane(),
				]
			: [
					{
						name: 'virtual-pristine-react-compiler',
						enforce: 'pre',
						transform(code, id) {
							if (!id.startsWith(resolve(packageRoot, 'upstream') + '/') || !/\.tsx?$/.test(id))
								return;
							let transformed = code;
							if (id.endsWith('/react-compiler/main.tsx')) {
								// Preserve the upstream compiler-enabled scenario under Vite 8, whose
								// React plugin no longer carries Babel options.
								const result = transformSync(code, {
									filename: id,
									configFile: false,
									babelrc: false,
									parserOpts: { plugins: ['jsx', 'typescript'] },
									plugins: [[reactCompiler, { target: '19' }]],
									sourceMaps: true,
								});
								if (!result?.code) throw new Error('React compiler produced no fixture');
								transformed = result.code;
							}
							// The pinned monorepo tsconfig extends a root outside this package.
							return transformWithOxc(transformed, id, {
								tsconfig: false,
								jsx: { runtime: 'automatic', importSource: 'react' },
							});
						},
					},
				]),
	],
	build: {
		outDir: resolve(packageRoot, '.browser-dist', mode),
		emptyOutDir: true,
		rolldownOptions: {
			tsconfig: false,
			input: {
				...Object.fromEntries(pages.map((page) => [page, resolve(appRoot, page, 'index.html')])),
				...(native
					? { prepend: resolve(packageRoot, 'tests/browser-fixtures/prepend/index.html') }
					: {}),
			},
		},
	},
	resolve: {
		dedupe: ['react', 'react-dom', 'octane', '@tanstack/virtual-core'],
		alias: [
			{
				find: /^@tanstack\/react-virtual$/,
				replacement: resolve(packageRoot, 'upstream/src/index.tsx'),
			},
			{
				find: /^@octanejs\/tanstack-virtual$/,
				replacement:
					mode === 'baseline'
						? resolve(packageRoot, 'tests/_baseline/index.ts')
						: resolve(packageRoot, 'src/index.ts'),
			},
			{
				find: /^@tanstack\/virtual-core$/,
				replacement: resolve(packageRoot, 'node_modules/@tanstack/virtual-core/dist/esm/index.js'),
			},
		],
	},
	oxc: {
		exclude: native ? undefined : /\/tanstack-virtual\/upstream\//,
		jsx: { runtime: 'automatic', importSource: native ? 'octane' : 'react' },
	},
});
