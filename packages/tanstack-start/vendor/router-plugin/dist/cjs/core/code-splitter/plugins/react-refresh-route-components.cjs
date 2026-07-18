const require_runtime = require("../../../_virtual/_rolldown/runtime.cjs");
const require_utils = require("../../utils.cjs");
let _babel_types = require("@babel/types");
_babel_types = require_runtime.__toESM(_babel_types, 1);
//#region src/core/code-splitter/plugins/react-refresh-route-components.ts
var REACT_REFRESH_ROUTE_COMPONENT_IDENTS = new Set([
	"component",
	"shellComponent",
	"pendingComponent",
	"errorComponent",
	"notFoundComponent"
]);
function hoistInlineRouteComponents(ctx) {
	const hoistedDeclarations = [];
	ctx.routeOptions.properties.forEach((prop) => {
		if (!_babel_types.isObjectProperty(prop)) return;
		const key = require_utils.getObjectPropertyKeyName(prop);
		if (!key || !REACT_REFRESH_ROUTE_COMPONENT_IDENTS.has(key)) return;
		if (!_babel_types.isArrowFunctionExpression(prop.value) && !_babel_types.isFunctionExpression(prop.value)) return;
		const hoistedIdentifier = require_utils.getUniqueProgramIdentifier(ctx.programPath, `TSR${key[0].toUpperCase()}${key.slice(1)}`);
		hoistedDeclarations.push(_babel_types.variableDeclaration("const", [_babel_types.variableDeclarator(hoistedIdentifier, _babel_types.cloneNode(prop.value, true))]));
		prop.value = _babel_types.cloneNode(hoistedIdentifier);
	});
	if (hoistedDeclarations.length === 0) return false;
	ctx.insertionPath.insertBefore(hoistedDeclarations);
	return true;
}
function createReactRefreshRouteComponentsPlugin() {
	return {
		name: "react-refresh-route-components",
		getStableRouteOptionKeys() {
			return [...REACT_REFRESH_ROUTE_COMPONENT_IDENTS];
		},
		onUnsplittableRoute(ctx) {
			if (!ctx.opts.addHmr) return;
			if (hoistInlineRouteComponents(ctx)) return { modified: true };
		},
		onAddHmr(ctx) {
			if (!ctx.opts.addHmr) return;
			if (hoistInlineRouteComponents(ctx)) return { modified: true };
		}
	};
}
//#endregion
exports.createReactRefreshRouteComponentsPlugin = createReactRefreshRouteComponentsPlugin;

//# sourceMappingURL=react-refresh-route-components.cjs.map