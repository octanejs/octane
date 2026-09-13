import '../frameworkTypes';

export { RouterClient } from './RouterClient.tsrx';
export { hydrate, json, mergeHeaders } from './core-client.js';
export type {
	JsonResponse,
	TsrSsrGlobal,
	DehydratedRouter,
	DehydratedMatch,
} from './core-client.js';
