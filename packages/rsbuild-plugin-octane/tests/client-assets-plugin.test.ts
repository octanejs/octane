import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OctaneClientAssetsPlugin } from '../src/client-assets-plugin.js';

describe('OctaneClientAssetsPlugin', () => {
	it('selects the route entry JavaScript instead of an earlier-sorting associated chunk', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-rsbuild-client-assets-'));
		try {
			const clientEntry = join(root, 'node_modules/.cache/octane/rsbuild-client-entry.js');
			const clientEntryModule = { resource: clientEntry };
			const routeModule = { resource: join(root, 'src/Page.tsrx') };
			const vendorChunk = {
				files: new Set(['static/js/a-vendor.js', 'static/css/vendor.css']),
				auxiliaryFiles: new Set(['static/js/a-vendor.js.map']),
				groupsIterable: new Set(),
			};
			const routeChunk = {
				files: new Set(['static/js/z-route.js', 'static/css/route.css']),
				auxiliaryFiles: new Set(['static/js/z-route.js.map']),
				groupsIterable: new Set(),
			};
			const routeGroup = {
				origins: [{ module: clientEntryModule, request: routeModule.resource }],
				isInitial: () => false,
				chunks: [vendorChunk, routeChunk],
			};

			let thisCompilationHook: ((compilation: any) => void) | undefined;
			const compiler = {
				hooks: {
					thisCompilation: {
						tap(_name: string, callback: (compilation: any) => void) {
							thisCompilationHook = callback;
						},
					},
				},
			};
			new OctaneClientAssetsPlugin({
				root,
				clientEntry,
				entries: ['/src/Page.tsrx'],
			}).apply(compiler as any);

			let processAssetsHook: (() => void) | undefined;
			let emittedSource = '';
			thisCompilationHook?.({
				hooks: {
					processAssets: {
						tap(_options: unknown, callback: () => void) {
							processAssetsHook = callback;
						},
					},
				},
				modules: [routeModule],
				chunkGroups: [routeGroup],
				chunkGraph: {
					getModuleChunksIterable: (module: unknown) =>
						module === routeModule ? [vendorChunk, routeChunk] : [],
				},
				emitAsset(_filename: string, source: { source(): string | Uint8Array }) {
					emittedSource = String(source.source());
				},
			});
			processAssetsHook?.();

			expect(JSON.parse(emittedSource)).toEqual({
				'/src/Page.tsrx': {
					js: 'static/js/z-route.js',
					css: ['static/css/route.css', 'static/css/vendor.css'],
				},
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
