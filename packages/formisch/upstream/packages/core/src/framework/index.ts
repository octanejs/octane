/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable jsdoc/require-returns-check */
import type { Signal } from '../types/index.ts';

/**
 * Framework type.
 */
export type Framework =
  | 'angular'
  | 'preact'
  | 'qwik'
  | 'react'
  | 'solid'
  | 'svelte'
  | 'vue';

/**
 * The current framework being used.
 */
export const framework: Framework = '' as Framework;

/**
 * Creates a unique identifier string.
 *
 * @returns The unique identifier.
 */
// @__NO_SIDE_EFFECTS__
export function createId(): string {
  throw new Error('No framework selected');
}

/**
 * Creates a reactive signal without an initial value.
 *
 * @returns The created signal.
 */
export function createSignal<T>(): Signal<T | undefined>;

/**
 * Creates a reactive signal with an initial value.
 *
 * @param value The initial value.
 *
 * @returns The created signal.
 */
export function createSignal<T>(value: T): Signal<T>;

// @__NO_SIDE_EFFECTS__
export function createSignal(value?: unknown): Signal<unknown> {
  throw new Error('No framework selected');
}

/**
 * Batches multiple signal updates into a single update cycle.
 *
 * @param fn The function to execute in batch.
 *
 * @returns The return value of the function.
 */
export function batch<T>(fn: () => T): T {
  throw new Error('No framework selected');
}

/**
 * Executes a function without tracking reactive dependencies.
 *
 * @param fn The function to execute without tracking.
 *
 * @returns The return value of the function.
 */
export function untrack<T>(fn: () => T): T {
  throw new Error('No framework selected');
}
