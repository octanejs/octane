//#region node_modules/.nitro/vite/services/ssr/assets/_tanstack-start-manifest_v-DhaYpKf0.js
var tsrStartManifest = () => ({ routes: {
	__root__: {
		filePath: "/Users/trueadm/Projects/octane-tanstack-bench/benchmarks/tanstack-start/octane/src/routes/__root.tsrx",
		children: [
			"/",
			"/deferred",
			"/posts"
		],
		css: ["/assets/index-Ch9eZn3x.css"],
		preloads: [
			"/assets/index-DqLkhGSk.js",
			"/assets/createServerFn-BeN-8zPR.js",
			"/assets/runtime-Cd_kM1Y5.js"
		],
		scripts: [{ attrs: {
			type: "module",
			async: !0,
			src: "/assets/index-DqLkhGSk.js"
		} }]
	},
	"/": {
		filePath: "/Users/trueadm/Projects/octane-tanstack-bench/benchmarks/tanstack-start/octane/src/routes/index.tsrx",
		children: void 0,
		preloads: ["/assets/routes-hfZh2q96.js"]
	},
	"/deferred": {
		filePath: "/Users/trueadm/Projects/octane-tanstack-bench/benchmarks/tanstack-start/octane/src/routes/deferred.tsrx",
		children: void 0,
		preloads: ["/assets/deferred-CvwqzKvQ.js"]
	},
	"/posts": {
		filePath: "/Users/trueadm/Projects/octane-tanstack-bench/benchmarks/tanstack-start/octane/src/routes/posts.tsrx",
		children: ["/posts/$postId", "/posts/"],
		preloads: ["/assets/posts-C4tCPMwZ.js"]
	},
	"/posts/$postId": {
		filePath: "/Users/trueadm/Projects/octane-tanstack-bench/benchmarks/tanstack-start/octane/src/routes/posts.$postId.tsrx",
		children: void 0,
		preloads: [
			"/assets/posts._postId-BRQEYO5w.js",
			"/assets/posts._postId-C0lWKS80.js",
			"/assets/posts._postId-C8diJ8_r.js"
		]
	},
	"/posts/": {
		filePath: "/Users/trueadm/Projects/octane-tanstack-bench/benchmarks/tanstack-start/octane/src/routes/posts.index.tsrx",
		children: void 0,
		preloads: ["/assets/posts.index-BoZBgtwK.js"]
	}
} });
//#endregion
export { tsrStartManifest };
