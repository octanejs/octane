import { VITE_ENVIRONMENT_NAMES } from "../constants.js";
import { prerender } from "../prerender.js";
//#region src/vite/prerender.ts
async function prerenderWithVite({ startConfig, builder }) {
	const serverEnv = builder.environments[VITE_ENVIRONMENT_NAMES.server];
	if (!serverEnv) throw new Error(`Vite's "${VITE_ENVIRONMENT_NAMES.server}" environment not found`);
	const clientEnv = builder.environments[VITE_ENVIRONMENT_NAMES.client];
	if (!clientEnv) throw new Error(`Vite's "${VITE_ENVIRONMENT_NAMES.client}" environment not found`);
	const outputDir = clientEnv.config.build.outDir;
	process.env.TSS_PRERENDERING = "true";
	process.env.TSS_CLIENT_OUTPUT_DIR = outputDir;
	const previewServer = await startPreviewServer(serverEnv.config);
	const baseUrl = getResolvedUrl(previewServer);
	return prerender({
		startConfig,
		handler: {
			getClientOutputDirectory() {
				return outputDir;
			},
			request(path, options) {
				const url = new URL(path, baseUrl);
				return fetch(new Request(url, options));
			},
			close() {
				return previewServer.close();
			}
		}
	});
}
async function startPreviewServer(viteConfig) {
	const vite = await import("vite");
	try {
		return await vite.preview({
			configFile: viteConfig.configFile,
			preview: {
				port: 0,
				open: false
			}
		});
	} catch (error) {
		throw new Error("Failed to start the Vite preview server for prerendering", { cause: error });
	}
}
function getResolvedUrl(previewServer) {
	const baseUrl = previewServer.resolvedUrls?.local[0];
	if (!baseUrl) throw new Error("No resolved URL is available from the Vite preview server");
	return new URL(baseUrl);
}
//#endregion
export { prerenderWithVite };

//# sourceMappingURL=prerender.js.map