/** The data store's Octane binding for server rendering. See octane-binding.ts. */
import {
	createContext,
	createElement,
	use,
	useCallback,
	useSyncExternalStore,
} from '../server/index.js';
import { createOctaneDataBinding } from './octane-binding.js';

// The server runtime mirrors the client's public signatures over its own scope types.
const runtime = { createContext, createElement, use, useCallback, useSyncExternalStore };

export const { DataProvider, useDataStore, useRead, useReadState, useWrite } =
	createOctaneDataBinding(runtime as unknown as Parameters<typeof createOctaneDataBinding>[0]);
