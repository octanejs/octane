import { E as ssrText, I as warmChild, L as withSlot, P as useState, _ as ssrChildText, b as ssrControl, c as markChildrenBlock, f as ssrArm, o as hookSlots, u as puBatch, x as ssrForBlock, y as ssrComponent } from "./runtime.server-w393t-7O.mjs";
import { o as Outlet } from "./ssr.mjs";
import { t as Link } from "./Link-D-hvCIHY.mjs";
import { t as Route } from "./posts-DLafmRVu.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/posts-BuqYC7DB.js
var _h$0 = /* @__PURE__ */ Symbol(/* @__PURE__ */ hookSlots(2));
function PostsComponent(__props, __s, __extra) {
	const posts = withSlot(_h$0, () => Route.useLoaderData(_h$0));
	const [hydrationCount, setHydrationCount] = useState(0, 1);
	puBatch([], () => {
		warmChild(Outlet, {});
	});
	function __sitem$0(post, __s, __extra) {
		function __schildren$1(__props, __s, __extra) {
			return "<div>" + ssrChildText(post.title.substring(0, 20), __s) + "</div>";
		}
		return "<li class=\"whitespace-nowrap\">" + ssrComponent(__s, Link, {
			"to": "/posts/$postId",
			"params": { postId: post.id },
			"class": "block py-1 text-blue-800 hover:text-blue-600",
			"activeProps": { class: "text-black font-bold" },
			"children": markChildrenBlock(__schildren$1)
		}) + "</li>";
	}
	return "<div class=\"p-2 flex gap-2\"><button data-testid=\"posts-parent-hydration-counter\">" + ssrText("Parent hydration count: " + hydrationCount) + "</button><ul class=\"list-disc pl-4\">" + ssrControl("f3hhzru", () => {
		const __items = Array.from([...posts, {
			id: "i-do-not-exist",
			title: "Non-existent Post"
		}]);
		if (__items.length === 0) return ssrForBlock("", false);
		let __html = "";
		for (let __i = 0; __i < __items.length; __i++) {
			const __it = __items[__i];
			__html += ssrArm(((post) => post.id)(__it), () => __sitem$0(__it, __s));
		}
		return ssrForBlock(__html, true);
	}) + "</ul><hr/>" + ssrComponent(__s, Outlet, {}) + "</div>";
}
typeof PostsComponent === "function" && (PostsComponent.__warm = (__wp) => {
	warmChild(Outlet, {});
});
//#endregion
export { PostsComponent as component };
