import { C as notFound, t as createServerFn } from "./ssr.mjs";
import { t as createServerRpc } from "./createServerRpc-Cx3SfneN.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/posts-CyWduirb.js
var DELAY_MS = Number(process.env.BENCH_DATA_DELAY_MS || 0);
var POSTS = Array.from({ length: 10 }, (_, index) => ({
	id: String(index + 1),
	title: `Post ${index + 1}: deterministic title ${String.fromCharCode(65 + index)}`,
	body: `Body of post ${index + 1}. The same fixture feeds the React flavor and the Octane flavor, so any difference in the rendered result is the framework, not the data.`
}));
var delay = () => DELAY_MS > 0 ? new Promise((r) => setTimeout(r, DELAY_MS)) : void 0;
async function listPosts() {
	await delay();
	return POSTS;
}
async function getPost(id) {
	await delay();
	return POSTS.find((post) => post.id === id) ?? null;
}
var fetchPost_createServerFn_handler = createServerRpc({
	id: "fcc606bc6a4391068ed708ee59e18e7e8c5685d0fa5f2f3f35a0d234c04f679f",
	name: "fetchPost",
	filename: "src/utils/posts.ts"
}, (opts) => fetchPost.__executeServer(opts));
var fetchPost = createServerFn({ method: "GET" }).validator((postId) => postId).handler(fetchPost_createServerFn_handler, async ({ data: postId }) => {
	const post = await getPost(postId);
	if (!post) throw notFound();
	return post;
});
var fetchPosts_createServerFn_handler = createServerRpc({
	id: "9d2d75863ee5cc1769ed0162f4537aed3a4f16255a893cf6e946a857810a32df",
	name: "fetchPosts",
	filename: "src/utils/posts.ts"
}, (opts) => fetchPosts.__executeServer(opts));
var fetchPosts = createServerFn({ method: "GET" }).handler(fetchPosts_createServerFn_handler, async () => await listPosts());
//#endregion
export { fetchPost_createServerFn_handler, fetchPosts_createServerFn_handler };
