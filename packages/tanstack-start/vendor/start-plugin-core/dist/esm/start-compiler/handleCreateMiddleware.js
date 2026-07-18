import { stripMethodCall } from "./utils.js";
//#region src/start-compiler/handleCreateMiddleware.ts
function warnInputValidatorDeprecation(context, inputValidator) {
	const loc = inputValidator.callPath.node.loc?.start;
	const location = loc ? `${context.id}:${loc.line}:${loc.column + 1} ` : `${context.id} `;
	context.warn?.(`${location}createMiddleware().inputValidator() is deprecated. Use createMiddleware().validator() instead.`);
}
/**
* Handles createMiddleware transformations for a batch of candidates.
*
* @param candidates - All Middleware candidates to process
* @param context - The compilation context
*/
function handleCreateMiddleware(candidates, context) {
	if (context.env === "server") throw new Error("handleCreateMiddleware should not be called on the server");
	for (const candidate of candidates) {
		const { validator, inputValidator, server } = candidate.methodChain;
		if (inputValidator) warnInputValidatorDeprecation(context, inputValidator);
		for (const [methodName, methodCall] of [["validator", validator], ["inputValidator", inputValidator]]) {
			if (!methodCall) continue;
			if (!methodCall.callPath.node.arguments[0]) throw new Error(`createMiddleware().${methodName}() must be called with a validator!`);
			stripMethodCall(methodCall.callPath);
		}
		if (server) stripMethodCall(server.callPath);
	}
}
//#endregion
export { handleCreateMiddleware };

//# sourceMappingURL=handleCreateMiddleware.js.map