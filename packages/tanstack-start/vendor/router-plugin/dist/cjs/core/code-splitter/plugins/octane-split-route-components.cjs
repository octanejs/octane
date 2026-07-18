const require_runtime = require("../../../_virtual/_rolldown/runtime.cjs");
let _babel_types = require("@babel/types");
_babel_types = require_runtime.__toESM(_babel_types, 1);
//#region src/core/code-splitter/plugins/octane-split-route-components.ts
function isStaticMember(node, objectName, propertyName) {
	return _babel_types.isMemberExpression(node) && !node.computed && _babel_types.isIdentifier(node.object, { name: objectName }) && _babel_types.isIdentifier(node.property, { name: propertyName });
}
function isOctaneSingleRootStamp(statement, componentName) {
	if (!_babel_types.isExpressionStatement(statement)) return false;
	const expression = statement.expression;
	return _babel_types.isAssignmentExpression(expression, { operator: "=" }) && isStaticMember(expression.left, componentName, "$$singleRoot") && _babel_types.isBooleanLiteral(expression.right, { value: true });
}
function isOctaneWarmPlan(statement, componentName) {
	if (!_babel_types.isExpressionStatement(statement)) return false;
	const expression = statement.expression;
	return _babel_types.isAssignmentExpression(expression, { operator: "=" }) && isStaticMember(expression.left, componentName, "__warm") && _babel_types.isArrowFunctionExpression(expression.right) && !expression.right.async && expression.right.params.length === 1 && _babel_types.isIdentifier(expression.right.params[0], { name: "__wp" });
}
function isOctaneLocationStamp(statement, componentName) {
	if (!_babel_types.isTryStatement(statement) || statement.finalizer || !statement.handler || statement.handler.param || statement.block.body.length !== 1 || statement.handler.body.body.length !== 0 || !statement.handler.body.innerComments?.some((comment) => comment.value.trim() === "frozen component")) return false;
	const [bodyStatement] = statement.block.body;
	if (!_babel_types.isExpressionStatement(bodyStatement)) return false;
	const expression = bodyStatement.expression;
	if (!_babel_types.isAssignmentExpression(expression, { operator: "=" }) || !isStaticMember(expression.left, componentName, "__oct_loc")) return false;
	return _babel_types.isStringLiteral(expression.right) && /:\d+:\d+$/.test(expression.right.value) || _babel_types.isMemberExpression(expression.right) && !expression.right.computed && _babel_types.isIdentifier(expression.right.property, { name: "__oct_loc" });
}
function isOctaneCompilerCompanion(statement, componentName) {
	return isOctaneSingleRootStamp(statement, componentName) || isOctaneWarmPlan(statement, componentName) || isOctaneLocationStamp(statement, componentName);
}
/**
* Octane emits component metadata as adjacent top-level statements. Once the
* component binding moves to a virtual route module, those statements must
* move with it instead of evaluating against a missing binding in the
* reference module.
*/
function createOctaneSplitRouteComponentsPlugin() {
	return {
		name: "octane-split-route-components",
		onSplitRouteProperty(ctx) {
			if (!_babel_types.isIdentifier(ctx.prop.value)) return;
			const componentName = ctx.prop.value.name;
			for (const statementPath of ctx.programPath.get("body")) if (isOctaneCompilerCompanion(statementPath.node, componentName)) statementPath.remove();
		}
	};
}
//#endregion
exports.createOctaneSplitRouteComponentsPlugin = createOctaneSplitRouteComponentsPlugin;

//# sourceMappingURL=octane-split-route-components.cjs.map