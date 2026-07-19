import { CompilationContext, RewriteCandidate } from './types.js';
/**
 * Handles createIsomorphicFn transformations for a batch of candidates.
 *
 * @param candidates - All IsomorphicFn candidates to process
 * @param context - The compilation context
 */
export declare function handleCreateIsomorphicFn(candidates: Array<RewriteCandidate>, context: CompilationContext): void;
