import type { Signal } from '../types/index.ts';

let idCounter = 0;

/**
 * Creates a mock signal that behaves like a reactive signal.
 *
 * @returns The mock signal.
 */
function createSignal<T>(): Signal<T | undefined>;

/**
 * Creates a mock signal that behaves like a reactive signal.
 *
 * @param value The initial value.
 *
 * @returns The mock signal.
 */
function createSignal<T>(value: T): Signal<T>;
function createSignal(value?: unknown): Signal<unknown> {
  return { value };
}

/**
 * Mock batch function that executes immediately.
 *
 * @param fn The function to execute.
 *
 * @returns The function result.
 */
function batch<T>(fn: () => T): T {
  return fn();
}

/**
 * Mock untrack function that executes immediately.
 *
 * @param fn The function to execute.
 *
 * @returns The function result.
 */
function untrack<T>(fn: () => T): T {
  return fn();
}

/**
 * Mock createId function that returns unique IDs.
 *
 * @returns The unique ID.
 */
function createId(): string {
  return `id-${idCounter++}`;
}

/**
 * Resets the ID counter for tests.
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Framework mock implementations interface.
 */
interface FrameworkMocks {
  framework: 'react';
  createSignal: typeof createSignal;
  batch: typeof batch;
  untrack: typeof untrack;
  createId: typeof createId;
}

/**
 * Mock implementations for the framework module.
 */
export const frameworkMocks: FrameworkMocks = {
  framework: 'react',
  createSignal: createSignal,
  batch: batch,
  untrack: untrack,
  createId: createId,
};
