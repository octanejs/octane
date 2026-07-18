import { VITE_ENVIRONMENT_NAMES } from "../../constants.js";
import { getBundlerOptions } from "../../utils.js";
import { getServerOutputDirectory } from "../output-directory.js";
import { basename, extname, join } from "pathe";
import { NodeRequest, sendNodeResponse } from "srvx/node";
import { pathToFileURL } from "node:url";
import { joinURL } from "ufo";
//#region src/vite/preview-server-plugin/plugin.ts
function previewServerPlugin() {
	return {
		name: "tanstack-start-core:preview-server",
		configurePreviewServer: {
			order: "post",
			handler(server) {
				return () => {
					let serverBuild = null;
					server.middlewares.use(async (req, res, next) => {
						try {
							if (!serverBuild) {
								const serverEnv = server.config.environments[VITE_ENVIRONMENT_NAMES.server];
								const serverInput = getBundlerOptions(serverEnv?.build)?.input ?? "server";
								if (typeof serverInput !== "string") throw new Error("Invalid server input. Expected a string.");
								const outputFilename = `${basename(serverInput, extname(serverInput))}.js`;
								serverBuild = (await import(pathToFileURL(join(getServerOutputDirectory(server.config), outputFilename)).toString())).default;
							}
							req.url = joinURL(server.config.base, req.url ?? "/");
							const webReq = new NodeRequest({
								req,
								res
							});
							const webRes = await serverBuild.fetch(webReq);
							if (webRes.headers.get("content-type")?.startsWith("text/html")) res.setHeader("content-encoding", "identity");
							res.setHeaders(webRes.headers);
							res.writeHead(webRes.status, webRes.statusText);
							return sendNodeResponse(res, webRes);
						} catch (error) {
							next(error);
						}
					});
				};
			}
		}
	};
}
//#endregion
export { previewServerPlugin };

//# sourceMappingURL=plugin.js.map