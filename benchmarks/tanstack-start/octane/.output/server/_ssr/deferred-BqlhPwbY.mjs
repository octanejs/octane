import { t as createServerFn } from "./ssr.mjs";
import { t as createServerRpc } from "./createServerRpc-Cx3SfneN.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/deferred-BqlhPwbY.js
var DEFER_MS = Number(process.env.BENCH_DEFER_MS || 200);
var personServerFn_createServerFn_handler = createServerRpc({
	id: "15528a745cf75a63f417148078b800bdd1b0d4ca82119b6c7f7556d53aa74295",
	name: "personServerFn",
	filename: "src/routes/deferred.tsrx"
}, (opts) => personServerFn.__executeServer(opts));
var personServerFn = createServerFn({ method: "GET" }).validator((data) => data).handler(personServerFn_createServerFn_handler, ({ data }) => {
	return {
		name: data.name,
		randomNumber: 4
	};
});
var slowServerFn_createServerFn_handler = createServerRpc({
	id: "c06b2f4894614ff402d8671d839c55a573e813c6c035bcf2be34918becfa41bd",
	name: "slowServerFn",
	filename: "src/routes/deferred.tsrx"
}, (opts) => slowServerFn.__executeServer(opts));
var slowServerFn = createServerFn({ method: "GET" }).validator((data) => data).handler(slowServerFn_createServerFn_handler, async ({ data }) => {
	await new Promise((r) => setTimeout(r, DEFER_MS));
	return {
		name: data.name,
		randomNumber: 17
	};
});
//#endregion
export { personServerFn_createServerFn_handler, slowServerFn_createServerFn_handler };
