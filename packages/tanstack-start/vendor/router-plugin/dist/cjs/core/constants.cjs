//#region src/core/constants.ts
var tsrSplit = "tsr-split";
var tsrShared = "tsr-shared";
var splitRouteIdentNodes = [
	"loader",
	"component",
	"pendingComponent",
	"errorComponent",
	"notFoundComponent"
];
var defaultCodeSplitGroupings = [
	["component"],
	["errorComponent"],
	["notFoundComponent"]
];
//#endregion
exports.defaultCodeSplitGroupings = defaultCodeSplitGroupings;
exports.splitRouteIdentNodes = splitRouteIdentNodes;
exports.tsrShared = tsrShared;
exports.tsrSplit = tsrSplit;

//# sourceMappingURL=constants.cjs.map