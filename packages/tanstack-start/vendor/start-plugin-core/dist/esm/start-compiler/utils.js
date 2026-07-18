import * as t from "@babel/types";
import { codeFrameColumns } from "@babel/code-frame";
//#region src/start-compiler/utils.ts
function codeFrameError(code, loc, message) {
	const frame = codeFrameColumns(code, {
		start: loc.start,
		end: loc.end
	}, {
		highlightCode: true,
		message
	});
	return new Error(frame);
}
function cleanId(id) {
	if (id.startsWith("\0")) id = id.slice(1);
	const queryIndex = id.indexOf("?");
	return queryIndex === -1 ? id : id.substring(0, queryIndex);
}
/**
* Strips a method call by replacing it with its callee object.
* E.g., `foo().bar()` -> `foo()`
*
* This is a common pattern used when removing method calls from chains
* (e.g., removing .server() from middleware on client, or .validator() on client).
*
* @param callPath - The path to the CallExpression to strip
*/
function stripMethodCall(callPath) {
	if (t.isMemberExpression(callPath.node.callee)) callPath.replaceWith(callPath.node.callee.object);
}
//#endregion
export { cleanId, codeFrameError, stripMethodCall };

//# sourceMappingURL=utils.js.map