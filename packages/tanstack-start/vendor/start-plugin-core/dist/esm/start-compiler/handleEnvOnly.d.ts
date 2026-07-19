import { CompilationContext, RewriteCandidate } from './types.js';
import { LookupKind } from './compiler.js';
/**
 * Handles serverOnly/clientOnly function transformations for a batch of candidates.
 *
 * @param candidates - All EnvOnly candidates to process (all same kind)
 * @param context - The compilation context
 * @param kind - The specific kind (ServerOnlyFn or ClientOnlyFn)
 */
export declare function handleEnvOnlyFn(candidates: Array<RewriteCandidate>, context: CompilationContext, kind: LookupKind): void;
