import { CompileCodeSplitReferenceRouteOptions, ReferenceRouteCompilerPlugin, VirtualRouteCompilerPlugin } from './plugins.js';
import { GeneratorResult, ParseAstOptions } from '@tanstack/router-utils';
import { CodeSplitGroupings, SplitRouteIdentNodes } from '../constants.js';
export { buildDeclarationMap, buildDependencyGraph, collectIdentifiersFromNode, collectLocalBindingsFromStatement, collectModuleLevelRefsFromNode, expandDestructuredDeclarations, expandSharedDestructuredDeclarators, expandTransitively, removeBindingsTransitivelyDependingOn, } from '@tanstack/router-utils';
export declare function removeBindingsDependingOnRoute(bindings: Set<string>, dependencyGraph: Map<string, Set<string>>): void;
export declare function addSharedSearchParamToFilename(filename: string): string;
/**
 * Computes module-level bindings that are shared between split and non-split
 * route properties. These bindings need to be extracted into a shared virtual
 * module to avoid double-initialization.
 *
 * A binding is "shared" if it is referenced by at least one split property
 * AND at least one non-split property. Only locally-declared module-level
 * bindings are candidates (not imports — bundlers dedupe those).
 */
export declare function computeSharedBindings(opts: {
    code: string;
    filename?: string;
    codeSplitGroupings: CodeSplitGroupings;
}): Set<string>;
export declare function compileCodeSplitReferenceRoute(opts: ParseAstOptions & CompileCodeSplitReferenceRouteOptions & {
    compilerPlugins?: Array<ReferenceRouteCompilerPlugin>;
}): GeneratorResult | null;
export declare function compileCodeSplitVirtualRoute(opts: ParseAstOptions & {
    splitTargets: Array<SplitRouteIdentNodes>;
    filename: string;
    sharedBindings?: Set<string>;
    compilerPlugins?: Array<VirtualRouteCompilerPlugin>;
}): GeneratorResult;
/**
 * Compile the shared virtual module (`?tsr-shared=1`).
 * Keeps only shared binding declarations, their transitive dependencies,
 * and imports they need. Exports all shared bindings.
 */
export declare function compileCodeSplitSharedRoute(opts: ParseAstOptions & {
    sharedBindings: Set<string>;
    filename: string;
}): GeneratorResult;
/**
 * This function should read get the options from by searching for the key `codeSplitGroupings`
 * on createFileRoute and return it's values if it exists, else return undefined
 */
export declare function detectCodeSplitGroupingsFromRoute(opts: ParseAstOptions): {
    groupings: CodeSplitGroupings | undefined;
};
