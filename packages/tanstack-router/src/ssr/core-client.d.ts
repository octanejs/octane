import type { AnyRouter } from '@tanstack/router-core';

// The neutral client runtime exports mergeHeaders through a declaration that
// imports node:http2. Keep its exact header shape local so browser hydration
// needs no Node ambient types. Header fields are from @types/node@24.13.3,
// copyright Microsoft Corporation, MIT; see LICENSE.node-types.
interface OutgoingHttpHeaders {
	[header: string]: number | string | string[] | undefined;
	accept?: string | string[] | undefined;
	'accept-charset'?: string | string[] | undefined;
	'accept-encoding'?: string | string[] | undefined;
	'accept-language'?: string | string[] | undefined;
	'accept-ranges'?: string | undefined;
	'access-control-allow-credentials'?: string | undefined;
	'access-control-allow-headers'?: string | undefined;
	'access-control-allow-methods'?: string | undefined;
	'access-control-allow-origin'?: string | undefined;
	'access-control-expose-headers'?: string | undefined;
	'access-control-max-age'?: string | undefined;
	'access-control-request-headers'?: string | undefined;
	'access-control-request-method'?: string | undefined;
	age?: string | undefined;
	allow?: string | undefined;
	authorization?: string | undefined;
	'cache-control'?: string | undefined;
	'cdn-cache-control'?: string | undefined;
	connection?: string | string[] | undefined;
	'content-disposition'?: string | undefined;
	'content-encoding'?: string | undefined;
	'content-language'?: string | undefined;
	'content-length'?: string | number | undefined;
	'content-location'?: string | undefined;
	'content-range'?: string | undefined;
	'content-security-policy'?: string | undefined;
	'content-security-policy-report-only'?: string | undefined;
	'content-type'?: string | undefined;
	cookie?: string | string[] | undefined;
	dav?: string | string[] | undefined;
	dnt?: string | undefined;
	date?: string | undefined;
	etag?: string | undefined;
	expect?: string | undefined;
	expires?: string | undefined;
	forwarded?: string | undefined;
	from?: string | undefined;
	host?: string | undefined;
	'if-match'?: string | undefined;
	'if-modified-since'?: string | undefined;
	'if-none-match'?: string | undefined;
	'if-range'?: string | undefined;
	'if-unmodified-since'?: string | undefined;
	'last-modified'?: string | undefined;
	link?: string | string[] | undefined;
	location?: string | undefined;
	'max-forwards'?: string | undefined;
	origin?: string | undefined;
	pragma?: string | string[] | undefined;
	'proxy-authenticate'?: string | string[] | undefined;
	'proxy-authorization'?: string | undefined;
	'public-key-pins'?: string | undefined;
	'public-key-pins-report-only'?: string | undefined;
	range?: string | undefined;
	referer?: string | undefined;
	'referrer-policy'?: string | undefined;
	refresh?: string | undefined;
	'retry-after'?: string | undefined;
	'sec-websocket-accept'?: string | undefined;
	'sec-websocket-extensions'?: string | string[] | undefined;
	'sec-websocket-key'?: string | undefined;
	'sec-websocket-protocol'?: string | string[] | undefined;
	'sec-websocket-version'?: string | undefined;
	server?: string | undefined;
	'set-cookie'?: string | string[] | undefined;
	'strict-transport-security'?: string | undefined;
	te?: string | undefined;
	trailer?: string | undefined;
	'transfer-encoding'?: string | undefined;
	'user-agent'?: string | undefined;
	upgrade?: string | undefined;
	'upgrade-insecure-requests'?: string | undefined;
	vary?: string | undefined;
	via?: string | string[] | undefined;
	warning?: string | undefined;
	'www-authenticate'?: string | string[] | undefined;
	'x-content-type-options'?: string | undefined;
	'x-dns-prefetch-control'?: string | undefined;
	'x-frame-options'?: string | undefined;
	'x-xss-protection'?: string | undefined;
}

type AnyHeaders =
	| Headers
	| HeadersInit
	| Record<string, string>
	| Array<[string, string]>
	| OutgoingHttpHeaders
	| undefined;

export declare function mergeHeaders(...headers: Array<AnyHeaders>): Headers;
export declare function hydrate(router: AnyRouter): Promise<void>;

/** @deprecated Use Response.json from the standard Web API. */
export interface JsonResponse<TData> extends Response {
	json: () => Promise<TData>;
}
/** @deprecated Use Response.json from the standard Web API. */
export declare function json<TData>(payload: TData, init?: ResponseInit): JsonResponse<TData>;

export type TsrSsrGlobal = NonNullable<Window['$_TSR']>;
export type DehydratedRouter = NonNullable<TsrSsrGlobal['router']>;
export type DehydratedMatch = DehydratedRouter['matches'][number];
