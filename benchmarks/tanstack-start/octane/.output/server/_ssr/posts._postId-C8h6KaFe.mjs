import { I as warmChild, c as markChildrenBlock, u as puBatch, y as ssrComponent } from "./runtime.server-w393t-7O.mjs";
import { a as ErrorComponent } from "./ssr.mjs";
import { t as NotFound } from "./NotFound-BeYZdRm2.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/posts._postId-C8h6KaFe.js
function PostErrorComponent(props, __s, __extra) {
	puBatch([], () => {
		warmChild(ErrorComponent, { error: props.error });
	});
	return ssrComponent(__s, ErrorComponent, { "error": props.error }, true);
}
typeof PostErrorComponent === "function" && (PostErrorComponent.__warm = (__wp) => {
	warmChild(ErrorComponent, { error: __wp.error });
});
function PostNotFound(__props, __s, __extra) {
	function __schildren$0(__props, __s, __extra) {
		return "Post not found";
	}
	return ssrComponent(__s, NotFound, { "children": markChildrenBlock(__schildren$0) }, true);
}
//#endregion
export { PostNotFound as notFoundComponent };
