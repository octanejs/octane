import { I as warmChild } from "./runtime.server-w393t-7O.mjs";
import { o as Outlet } from "./ssr.mjs";
import { i as lazyRouteComponent, t as createFileRoute } from "./createSsrRpc-BTuhnJRJ.mjs";
import { n as fetchPosts } from "./posts--xvU4SvW.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/posts-DLafmRVu.js
var $$splitComponentImporter = () => import("./posts-BuqYC7DB.mjs");
var Route = createFileRoute("/posts")({
	head: () => ({ meta: [{ title: "Posts page" }] }),
	loader: async () => fetchPosts(),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
typeof PostsComponent === "function" && (PostsComponent.__warm = (__wp) => {
	warmChild(Outlet, {});
});
//#endregion
export { Route as t };
