import { getClientOutputDirectory } from "./output-directory.js";
import { postBuild } from "../post-build.js";
import { prerenderWithVite } from "./prerender.js";
//#region src/vite/post-server-build.ts
async function postServerBuild({ builder, startConfig }) {
	await postBuild({
		startConfig,
		adapter: {
			getClientOutputDirectory() {
				return getClientOutputDirectory(builder.config);
			},
			prerender(startConfig) {
				return prerenderWithVite({
					startConfig,
					builder
				});
			}
		}
	});
}
//#endregion
export { postServerBuild };

//# sourceMappingURL=post-server-build.js.map