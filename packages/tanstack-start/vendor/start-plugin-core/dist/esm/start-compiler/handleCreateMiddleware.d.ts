import { CompilationContext, RewriteCandidate } from './types.js';
/**
 * Handles createMiddleware transformations for a batch of candidates.
 *
 * @param candidates - All Middleware candidates to process
 * @param context - The compilation context
 */
export declare function handleCreateMiddleware(candidates: Array<RewriteCandidate>, context: CompilationContext): void;
