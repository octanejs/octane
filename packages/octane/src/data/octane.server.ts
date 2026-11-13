/** The data store's Octane binding for server rendering. See octane-binding.ts. */
import { createContext, createElement, use, useSyncExternalStore } from '../server/index.js';
import { createOctaneDataBinding } from './octane-binding.js';

// The server runtime mirrors the client's public signatures over its own scope types.
const runtime = { createContext, createElement, use, useSyncExternalStore };

export const { DataProvider, useDataStore, useFeed, useForm, usePages, useRead } =
	createOctaneDataBinding(runtime as unknown as Parameters<typeof createOctaneDataBinding>[0]);
