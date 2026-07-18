import * as t from "@babel/types";
//#region src/start-compiler/handleCreateIsomorphicFn.ts
/**
* Handles createIsomorphicFn transformations for a batch of candidates.
*
* @param candidates - All IsomorphicFn candidates to process
* @param context - The compilation context
*/
function handleCreateIsomorphicFn(candidates, context) {
	for (const candidate of candidates) {
		const { path, methodChain } = candidate;
		const envCallInfo = context.env === "client" ? methodChain.client : methodChain.server;
		if (!envCallInfo) {
			path.replaceWith(t.arrowFunctionExpression([], t.blockStatement([])));
			continue;
		}
		const innerFn = envCallInfo.firstArgPath?.node;
		if (!t.isExpression(innerFn)) throw new Error(`createIsomorphicFn().${context.env}(func) must be called with a function!`);
		path.replaceWith(innerFn);
	}
}
//#endregion
export { handleCreateIsomorphicFn };

//# sourceMappingURL=handleCreateIsomorphicFn.js.map