import { I as warmChild } from "./runtime.server-w393t-7O.mjs";
import { a as ErrorComponent } from "./ssr.mjs";
import { i as lazyRouteComponent, t as createFileRoute } from "./createSsrRpc-BTuhnJRJ.mjs";
import { t as fetchPost } from "./posts--xvU4SvW.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/posts._postId-CxfE0ez-.js
var $$splitNotFoundComponentImporter = () => import("./posts._postId-C8h6KaFe.mjs");
var $$splitComponentImporter = () => import("./posts._postId-1On2EF0e.mjs");
var $$splitErrorComponentImporter = () => import("./posts._postId-CKCieqAi.mjs");
var Route = createFileRoute("/posts/$postId")({
	loader: async ({ params: { postId } }) => fetchPost({ data: postId }),
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter, "errorComponent"),
	component: lazyRouteComponent($$splitComponentImporter, "component"),
	notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, "notFoundComponent")
});
typeof PostErrorComponent === "function" && (PostErrorComponent.__warm = (__wp) => {
	warmChild(ErrorComponent, { error: __wp.error });
});
//#endregion
export { Route as t };
