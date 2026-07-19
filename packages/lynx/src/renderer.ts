/**
 * Compiler-facing Lynx renderer ABI.
 *
 * Components compile against Octane's host-neutral universal component core;
 * the background root connects that output to the Milestone 3 async host.
 */
export * from 'octane/universal/native';

export type {
	LynxCustomIntrinsicElements,
	LynxElements,
	LynxIntrinsicElements,
} from './intrinsics.js';
