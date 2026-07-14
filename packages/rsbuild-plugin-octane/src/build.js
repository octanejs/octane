// @ts-check
import fs from 'node:fs';
import path from 'node:path';

/**
 * Put the two Rsbuild environments into the layout consumed by the shared
 * production entry, then hand the complete output to an optional adapter.
 *
 * @param {{
 *   root: string,
 *   config: import('@octanejs/app-core').ResolvedOctaneConfig,
 *   assetMapFilename?: string,
 *   log?: (message: string) => void,
 * }} options
 */
export async function finalizeOctaneRsbuildOutput(options) {
	const root = path.resolve(options.root);
	const outDir = options.config.build.outDir;
	const clientDir = path.resolve(root, outDir, 'client');
	const serverDir = path.resolve(root, outDir, 'server');
	const assetMapFilename = options.assetMapFilename ?? 'octane-client-assets.json';
	const log = options.log ?? (() => {});
	const clientHtml = path.join(clientDir, 'index.html');
	const serverHtml = path.join(serverDir, 'index.html');
	const clientAssetMap = path.join(clientDir, assetMapFilename);
	const serverAssetMap = path.join(serverDir, assetMapFilename);
	const serverEntry = path.join(serverDir, 'entry.js');

	if (!fs.existsSync(clientHtml)) {
		throw new Error(`[@octanejs/rsbuild-plugin] Client HTML was not emitted at ${clientHtml}.`);
	}
	if (!fs.existsSync(clientAssetMap)) {
		throw new Error(
			`[@octanejs/rsbuild-plugin] Client asset metadata was not emitted at ${clientAssetMap}.`,
		);
	}
	if (!fs.existsSync(serverEntry)) {
		throw new Error(`[@octanejs/rsbuild-plugin] Server entry was not emitted at ${serverEntry}.`);
	}

	fs.mkdirSync(serverDir, { recursive: true });
	fs.rmSync(serverHtml, { force: true });
	fs.rmSync(serverAssetMap, { force: true });
	fs.renameSync(clientHtml, serverHtml);
	fs.renameSync(clientAssetMap, serverAssetMap);

	log(`Server build complete: ${path.relative(root, serverEntry)}`);
	log(`Start with: node ${path.relative(root, serverEntry)} (or octane-rsbuild-preview)`);

	if (options.config.adapter?.adapt) {
		const adapterName = options.config.adapter.name ?? 'adapter';
		log(`Running ${adapterName} adapt()…`);
		await options.config.adapter.adapt({ root, outDir, clientDir, serverDir, log });
	}
}
