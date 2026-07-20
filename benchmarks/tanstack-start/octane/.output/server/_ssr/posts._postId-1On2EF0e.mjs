import { I as warmChild, L as withSlot, _ as ssrChildText, o as hookSlots, u as puBatch, y as ssrComponent } from "./runtime.server-w393t-7O.mjs";
import { a as ErrorComponent } from "./ssr.mjs";
import { t as Route } from "./posts._postId-CxfE0ez-.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/posts._postId-1On2EF0e.js
var _h$0 = /* @__PURE__ */ Symbol(/* @__PURE__ */ hookSlots(1));
function PostErrorComponent(props, __s, __extra) {
	puBatch([], () => {
		warmChild(ErrorComponent, { error: props.error });
	});
	return ssrComponent(__s, ErrorComponent, { "error": props.error }, true);
}
typeof PostErrorComponent === "function" && (PostErrorComponent.__warm = (__wp) => {
	warmChild(ErrorComponent, { error: __wp.error });
});
function PostComponent(__props, __s, __extra) {
	const post = withSlot(_h$0, () => Route.useLoaderData(_h$0));
	return "<div class=\"space-y-2\"><h4 class=\"text-xl font-bold underline\">" + ssrChildText(post.title, __s) + "</h4><div class=\"text-sm\">" + ssrChildText(post.body, __s) + "</div></div>";
}
//#endregion
export { PostComponent as component };
