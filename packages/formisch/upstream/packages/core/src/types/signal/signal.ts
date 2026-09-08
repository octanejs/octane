/**
 * Signal interface.
 */
export interface Signal<T> {
  /**
   * The value of the signal.
   */
  value: T;
}

/**
 * Batch interface.
 */
export interface Batch {
  <T>(fn: () => T): T;
}

/**
 * Untrack interface.
 */
export interface Untrack {
  <T>(fn: () => T): T;
}
