export declare const tsrSplit = "tsr-split";
export declare const tsrShared = "tsr-shared";
export declare const splitRouteIdentNodes: readonly ["loader", "component", "pendingComponent", "errorComponent", "notFoundComponent"];
export type SplitRouteIdentNodes = (typeof splitRouteIdentNodes)[number];
export type CodeSplitGroupings = Array<Array<SplitRouteIdentNodes>>;
export declare const defaultCodeSplitGroupings: CodeSplitGroupings;
