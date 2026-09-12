/** Stable scoped signals. This entry does not import a renderer. */
export { createScope } from './engine.js';
export { bindSignalControl } from './control-binding.js';
export { enableSignalDocument as __enableSignalDocument } from './document-owner.js';
export { query } from './requests.js';
export { ActionUncertainError, action$, isActionUncertain, optimistic$ } from './actions.js';
export {
	__derivedAt,
	__queryAt,
	__signalAt,
	acceptStreamedSignalResult,
	attachStreamedSignalResult,
	bindStreamedSignalSelection,
	derived$,
	isSignalHandle,
	isWritableSignal,
	query$,
	readSignalBinding,
	failStreamedSignalResult,
	signal$,
} from './facade.js';
export {
	captureSignalOwner,
	currentSignalOwner,
	installSignalOwnerEnvironment,
	retireSignalOwnerIdentity,
	runWithSignalOwner,
} from './owner-context.js';
export {
	ScopeDisposedError,
	SignalCycleError,
	SignalFrameError,
	SignalIdleError,
	SignalSerializationError,
	SignalStreamError,
	SignalWriteError,
} from './errors.js';
export {
	QUERY_REQUEST,
	SIGNAL_BINDING_IDENTITY,
	SIGNAL_BINDING_READ,
	SIGNAL_BINDING_SUBSCRIBE,
	SIGNAL_HANDLE,
	skip,
} from './types.js';
export type {
	AdoptionFrame,
	ActionOperation,
	ActionUncertain,
	ConnectionState,
	DerivedCompute,
	DerivedContext,
	DerivedOptions,
	DerivedSignal,
	EncodedSignalValue,
	Query,
	QueryContext,
	QueryLoadResult,
	QueryOptions,
	QueryRequest,
	QuerySignal,
	Resource,
	OptimisticSignal,
	Scope,
	ScopeInspection,
	ScopeOptions,
	ScopeSeed,
	SignalHandle,
	SignalBindingIdentity,
	SignalAction,
	SignalOwner,
	SignalOwnerEnvironment,
	SignalOwnerIdentity,
	SignalRendererOwnerIdentity,
	SignalSeedEntry,
	SignalSnapshot,
	SignalTraceEvent,
	WritableSignal,
} from './types.js';
