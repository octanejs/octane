import { CompilationContext, RewriteCandidate } from './types.js';
/**
 * Handles createServerFn transformations for a batch of candidates.
 *
 * This function performs extraction and replacement of server functions
 *
 * For caller files (non-provider):
 * - Replaces the server function with an RPC stub
 * - Does not include the handler function body
 *
 * For provider files:
 * - Creates an extractedFn that calls __executeServer
 * - Modifies .handler() to pass (extractedFn, serverFn) - two arguments
 *
 * @param candidates - All ServerFn candidates to process
 * @param context - The compilation context with helpers and mutable state
 * @returns Result containing runtime code to add, or null if no candidates processed
 */
export declare function handleCreateServerFn(candidates: Array<RewriteCandidate>, context: CompilationContext): void;
