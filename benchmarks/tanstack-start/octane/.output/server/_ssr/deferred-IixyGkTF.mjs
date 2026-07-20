import { t as createServerFn } from "./ssr.mjs";
import { i as lazyRouteComponent, r as createSsrRpc, t as createFileRoute } from "./createSsrRpc-BTuhnJRJ.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/deferred-IixyGkTF.js
var $$splitComponentImporter = () => import("./deferred-B1-jalQk.mjs");
var DEFER_MS = Number(process.env.BENCH_DEFER_MS || 200);
var personServerFn = createServerFn({ method: "GET" }).validator((data) => data).handler(createSsrRpc("15528a745cf75a63f417148078b800bdd1b0d4ca82119b6c7f7556d53aa74295"));
var slowServerFn = createServerFn({ method: "GET" }).validator((data) => data).handler(createSsrRpc("c06b2f4894614ff402d8671d839c55a573e813c6c035bcf2be34918becfa41bd"));
var Route = createFileRoute("/deferred")({
	loader: async () => {
		return {
			deferredStuff: new Promise((r) => setTimeout(() => r("Hello deferred!"), DEFER_MS * 2)),
			deferredPerson: slowServerFn({ data: { name: "Tanner Linsley" } }),
			person: await personServerFn({ data: { name: "John Doe" } })
		};
	},
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
//#endregion
export { Route as t };
