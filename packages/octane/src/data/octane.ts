/** The data store's Octane binding for the client runtime. See octane-binding.ts. */
// Relative, like the package's other entries, so the built entry resolves the
// same runtime module rather than the package's own source export.
import { createContext, createElement, use, useCallback, useSyncExternalStore } from '../index.js';
import { createOctaneDataBinding } from './octane-binding.js';

export const { DataProvider, useDataStore, useRead, useReadState, useWrite } =
	createOctaneDataBinding({ createContext, createElement, use, useCallback, useSyncExternalStore });
