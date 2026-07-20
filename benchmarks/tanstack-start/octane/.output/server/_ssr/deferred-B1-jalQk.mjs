import { D as ssrTry, E as ssrText, I as warmChild, L as withSlot, P as useState, g as ssrChild, i as createElement, k as use, o as hookSlots, u as puBatch, y as ssrComponent } from "./runtime.server-w393t-7O.mjs";
import { a as toExternalHydrationThenable } from "./createSsrRpc-BTuhnJRJ.mjs";
import { t as Route } from "./deferred-IixyGkTF.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/deferred-B1-jalQk.js
function AwaitInner(props) {
	const data = use(toExternalHydrationThenable(props.promise));
	return props.render(data);
}
var Await = function Await(props, __s, __extra) {
	puBatch([], () => {
		warmChild(AwaitInner, {
			promise: props.promise,
			render: props.children
		});
	});
	function __stry$0(__props, __s, __extra) {
		return ssrComponent(__s, AwaitInner, {
			"promise": props.promise,
			"render": props.children
		});
	}
	function __spend$1(__props, __s, __extra) {
		return ssrChild(props.fallback, __s);
	}
	return ssrTry(__s, "t1wqm09q", __stry$0, __spend$1, null);
};
Await.__warm = (__wp) => {
	const props = __wp;
	warmChild(AwaitInner, {
		promise: props.promise,
		render: props.children
	});
};
var _h$1 = /* @__PURE__ */ Symbol(/* @__PURE__ */ hookSlots(2) + 1);
function Deferred(__props, __s, __extra) {
	const [count, setCount] = useState(0, 0);
	const data = withSlot(_h$1, () => Route.useLoaderData(_h$1));
	return "<div class=\"p-2\"><div data-testid=\"regular-person\">" + ssrText(data.person.name + " - " + data.person.randomNumber) + "</div>" + ssrComponent(__s, Await, {
		"promise": data.deferredPerson,
		"fallback": createElement("div", {}, "Loading person..."),
		"children": (person) => createElement("div", { "data-testid": "deferred-person" }, person.name + " - " + person.randomNumber)
	}) + ssrComponent(__s, Await, {
		"promise": data.deferredStuff,
		"fallback": createElement("div", {}, "Loading stuff..."),
		"children": (stuff) => createElement("h3", { "data-testid": "deferred-stuff" }, stuff)
	}) + "<div data-testid=\"deferred-count\">" + ssrText("Count: " + count) + "</div><div><button data-testid=\"deferred-increment\">\n				Increment\n			</button></div></div>";
}
//#endregion
export { Deferred as component };
