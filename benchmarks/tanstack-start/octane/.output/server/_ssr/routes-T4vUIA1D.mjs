import { I as warmChild, u as puBatch, y as ssrComponent } from "./runtime.server-w393t-7O.mjs";
import { t as CustomMessage } from "./CustomMessage-CGt94cqn.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-T4vUIA1D.js
function Home(__props, __s, __extra) {
	puBatch([], () => {
		warmChild(CustomMessage, { message: "Hello from a custom component!" });
	});
	return "<div class=\"p-2\"><h3>Welcome Home!!!</h3>" + ssrComponent(__s, CustomMessage, { "message": "Hello from a custom component!" }) + "</div>";
}
typeof Home === "function" && (Home.__warm = (__wp) => {
	warmChild(CustomMessage, { message: "Hello from a custom component!" });
});
//#endregion
export { Home as component };
