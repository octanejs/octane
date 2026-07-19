/**
 * Compiler-facing Lynx renderer ABI.
 *
 * Milestone 1 intentionally exposes only Octane's host-neutral universal
 * component core. The Lynx root and host driver arrive in Milestone 2.
 */
export * from 'octane/universal/native';

export type {
	LynxCustomIntrinsicElements,
	LynxElements,
	LynxIntrinsicElements,
} from './intrinsics.js';
