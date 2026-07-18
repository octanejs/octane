import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OctaneClientAssetsPlugin } from '../src/client-assets-plugin.js';

describe('OctaneClientAssetsPlugin', () => {
	it('selects route JavaScript while linking CSS from deferred hydration descendants', () => {
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
			const deferredChunk = {
				files: new Set(['static/js/reviews.js']),
				auxiliaryFiles: new Set(['static/css/reviews.css']),
				groupsIterable: new Set(),
			};
			const nestedDeferredChunk = {
				files: new Set(['static/js/nested.js', 'static/css/nested.css']),
				auxiliaryFiles: new Set(),
				groupsIterable: new Set(),
			};
			const unrelatedChunk = {
				files: new Set(['static/js/unrelated.js', 'static/css/unrelated.css']),
				auxiliaryFiles: new Set(),
				groupsIterable: new Set(),
			};
			const nestedDeferredGroup = {
				origins: [{ request: join(root, 'src/Nested.tsrx') }],
				isInitial: () => false,
				chunks: [nestedDeferredChunk],
				childrenIterable: [],
			};
			const deferredGroup = {
				origins: [{ request: `${join(root, 'src/Reviews.tsrx')}?octane-hydrate=0` }],
				isInitial: () => false,
				chunks: [deferredChunk],
				childrenIterable: [nestedDeferredGroup],
			};
			const unrelatedGroup = {
				origins: [{ request: join(root, 'src/Unrelated.tsrx') }],
				isInitial: () => false,
				chunks: [unrelatedChunk],
				// Shared async groups may have both deferred and ordinary parents.
				childrenIterable: [nestedDeferredGroup],
			};
			const routeGroup = {
				origins: [{ module: clientEntryModule, request: routeModule.resource }],
				isInitial: () => false,
				chunks: [vendorChunk, routeChunk],
				childrenIterable: [unrelatedGroup, deferredGroup],
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
					css: [
						'static/css/nested.css',
						'static/css/reviews.css',
						'static/css/route.css',
						'static/css/vendor.css',
					],
				},
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
