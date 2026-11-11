/** Contracts and the data store. This entry imports no renderer and no compiler. */
export { DataError, entity, read, view, write } from './contracts.js';
export { createDataStore, DataRetiredError, DataUncertainError } from './store.js';
export { httpTransport } from './transport.js';
export type {
	DataReply,
	DataRequest,
	Entity,
	EntitySelection,
	Read,
	SchemaIssue,
	StandardSchema,
	Transport,
	View,
	ViewInput,
	ViewOrder,
	ViewWindow,
	Write,
} from './contracts.js';
export type { DataStore, DataStoreOptions, ReadHandle, ReadSnapshot } from './store.js';
