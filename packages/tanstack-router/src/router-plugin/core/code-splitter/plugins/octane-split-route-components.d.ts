import { ReferenceRouteCompilerPlugin } from '../plugins.js';
/**
 * Octane emits component metadata as adjacent top-level statements. Once the
 * component binding moves to a virtual route module, those statements must
 * move with it instead of evaluating against a missing binding in the
 * reference module.
 */
export declare function createOctaneSplitRouteComponentsPlugin(): ReferenceRouteCompilerPlugin;
