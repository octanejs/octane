import { postBuild } from "../post-build.js";
import { prerender } from "../prerender.js";
import { join } from "pathe";
//#region src/rsbuild/post-build.ts
async function postBuildWithRsbuild({ startConfig, clientOutputDirectory, serverOutputDirectory }) {
	await postBuild({
		startConfig,
		adapter: {
			getClientOutputDirectory() {
				return clientOutputDirectory;
			},
			prerender(startConfig) {
				return prerender({
					startConfig,
					handler: createRsbuildPrerenderHandler({
						clientOutputDirectory,
						serverOutputDirectory
					})
				});
			}
		}
	});
}
function createRsbuildPrerenderHandler({ clientOutputDirectory, serverOutputDirectory }) {
	process.env.TSS_PRERENDERING = "true";
	process.env.TSS_CLIENT_OUTPUT_DIR = clientOutputDirectory;
	let requestHandlerPromise;
	return {
		getClientOutputDirectory() {
			return clientOutputDirectory;
		},
		async request(path, options) {
			const requestHandler = await getRequestHandler();
			const url = new URL(path, "http://localhost");
			return requestHandler(new Request(url, {
				...options,
				redirect: "manual"
			}));
		}
	};
	function getRequestHandler() {
		if (!requestHandlerPromise) requestHandlerPromise = loadRequestHandler(serverOutputDirectory);
		return requestHandlerPromise;
	}
}
async function loadRequestHandler(serverOutputDirectory) {
	const { pathToFileURL } = await import("node:url");
	const serverEntryUrl = pathToFileURL(join(serverOutputDirectory, "index.js")).toString();
	const handler = (await import(serverEntryUrl)).default;
	if (typeof handler === "function") return handler;
	if (handler && typeof handler.fetch === "function") return (request) => handler.fetch(request);
	throw new Error(`Unable to resolve a request handler from Rsbuild server bundle at ${serverEntryUrl}`);
}
//#endregion
export { postBuildWithRsbuild };

//# sourceMappingURL=post-build.js.map