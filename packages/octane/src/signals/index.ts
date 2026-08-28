/** Experimental scoped signals. This entry does not import a renderer. */
export { createScope } from './engine.js';
export { query } from './requests.js';
export {
	ScopeDisposedError,
	SignalCycleError,
	SignalFrameError,
	SignalSerializationError,
	SignalWriteError,
} from './errors.js';
export type {
	SIGNAL_HANDLE,
	QUERY_REQUEST,
	AdoptionFrame,
	ConnectionState,
	DerivedSignal,
	EncodedSignalValue,
	Query,
	QueryContext,
	QueryRequest,
	Resource,
	Scope,
	ScopeInspection,
	ScopeOptions,
	ScopeSeed,
	SignalHandle,
	SignalSeedEntry,
	SignalSnapshot,
	SignalTraceEvent,
	WritableSignal,
} from './types.js';
