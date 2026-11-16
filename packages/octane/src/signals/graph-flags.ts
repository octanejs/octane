export const REACTIVE_NONE = 0;
export const REACTIVE_MUTABLE = 1;
export const REACTIVE_WATCHING = 2;
export const REACTIVE_RECURSED_CHECK = 4;
export const REACTIVE_RECURSED = 8;
export const REACTIVE_DIRTY = 16;
export const REACTIVE_PENDING = 32;
/**
 * Octane's own: every read and write of the node takes the general path,
 * because its owner traces or is retiring, or it is a declaration view or probe.
 * Assignments of a node's whole flags word keep it.
 */
export const REACTIVE_SLOW = 64;
/** Octane's own: a keyless cell (PlainCell) has a revision and native channel to keep. */
export const REACTIVE_TRACKED_CELL = 128;
/** Octane's own: a keyless derived value (PlainComputed) holds the error its computation threw. */
export const REACTIVE_FAILED = 256;
/** Octane's own: an effect waiting in the batch's queue. */
export const REACTIVE_QUEUED = 512;
/** Octane's own: a keyless cell its owner holds so retirement reaches its readers. */
export const REACTIVE_HELD = 1024;
/** Octane's own: a keyless cell with an entry in its owner's held list. */
export const REACTIVE_LISTED = 2048;
