import { I as warmChild, u as puBatch, y as ssrComponent } from "./runtime.server-w393t-7O.mjs";
import { a as ErrorComponent } from "./ssr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/posts._postId-CKCieqAi.js
function PostErrorComponent(props, __s, __extra) {
	puBatch([], () => {
		warmChild(ErrorComponent, { error: props.error });
	});
	return ssrComponent(__s, ErrorComponent, { "error": props.error }, true);
}
typeof PostErrorComponent === "function" && (PostErrorComponent.__warm = (__wp) => {
	warmChild(ErrorComponent, { error: __wp.error });
});
//#endregion
export { PostErrorComponent as errorComponent };
