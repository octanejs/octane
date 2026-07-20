import { b as ssrControl, c as markChildrenBlock, f as ssrArm, g as ssrChild, h as ssrBlock, y as ssrComponent } from "./runtime.server-w393t-7O.mjs";
import { t as Link } from "./Link-D-hvCIHY.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/NotFound-BeYZdRm2.js
var NotFound = function NotFound(props, __s, __extra) {
	function __sif$0(__props, __s, __extra) {
		return ssrChild(props.children, __s);
	}
	function __selse$1(__props, __s, __extra) {
		return "<p>The page you are looking for does not exist.</p>";
	}
	function __schildren$2(__props, __s, __extra) {
		return "\n				Start Over\n			";
	}
	return "<div class=\"space-y-2 p-2\" data-testid=\"default-not-found-component\"><div class=\"text-gray-600 dark:text-gray-400\">" + ssrBlock(ssrControl("i15bsep", () => props.children ? ssrArm("then", () => ssrBlock(__sif$0(void 0, __s))) : ssrArm("else", () => ssrBlock(__selse$1(void 0, __s))))) + "</div><p class=\"flex items-center gap-2 flex-wrap\"><button class=\"bg-emerald-500 text-white px-2 py-1 rounded-sm uppercase font-black text-sm\">\n				Go back\n			</button>" + ssrComponent(__s, Link, {
		"to": "/",
		"class": "bg-cyan-600 text-white px-2 py-1 rounded-sm uppercase font-black text-sm",
		"children": markChildrenBlock(__schildren$2)
	}) + "</p></div>";
};
//#endregion
export { NotFound as t };
