import { t as createServerFn } from "./ssr.mjs";
import { r as createSsrRpc } from "./createSsrRpc-BTuhnJRJ.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/posts--xvU4SvW.js
var fetchPost = createServerFn({ method: "GET" }).validator((postId) => postId).handler(createSsrRpc("fcc606bc6a4391068ed708ee59e18e7e8c5685d0fa5f2f3f35a0d234c04f679f"));
var fetchPosts = createServerFn({ method: "GET" }).handler(createSsrRpc("9d2d75863ee5cc1769ed0162f4537aed3a4f16255a893cf6e946a857810a32df"));
//#endregion
export { fetchPosts as n, fetchPost as t };
