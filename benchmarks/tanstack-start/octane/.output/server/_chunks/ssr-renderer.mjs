import { n as HTTPError, o as toRequest } from "../_libs/h3+rou3+srvx.mjs";
//#region ../../../node_modules/.pnpm/nitro@3.0.260311-beta_chokidar@5.0.0_dotenv@8.6.0_jiti@2.7.0_lru-cache@11.5.1_vite@8.0._d4a7806e8dd469c884a23b33a5d0bd0a/node_modules/nitro/dist/runtime/vite.mjs
function fetchViteEnv(viteEnvName, input, init) {
	const viteEnv = (globalThis.__nitro_vite_envs__ || {})[viteEnvName];
	if (!viteEnv) throw HTTPError.status(404);
	return Promise.resolve(viteEnv.fetch(toRequest(input, init)));
}
//#endregion
//#region ../../../node_modules/.pnpm/nitro@3.0.260311-beta_chokidar@5.0.0_dotenv@8.6.0_jiti@2.7.0_lru-cache@11.5.1_vite@8.0._d4a7806e8dd469c884a23b33a5d0bd0a/node_modules/nitro/dist/runtime/internal/vite/ssr-renderer.mjs
/** @param {{ req: Request }} HTTPEvent */
function ssrRenderer({ req }) {
	return fetchViteEnv("ssr", req);
}
//#endregion
export { ssrRenderer as default };
