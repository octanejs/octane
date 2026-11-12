import type { Context } from '@octanejs/app-core';
import type { ClientBuildManifest, ServerManifest } from '@octanejs/app-core/production';

/** Request-local inputs to the script-safe dev/production hydration payload. */
export interface RouteHydrationData {
	entry: string | undefined;
	exportName?: string | null;
	layout?: string | null;
	routeIndex?: number;
	params: Record<string, string>;
	url: string;
	preHydrate?: string | null;
	/** The config's `data` module, which the client entry opens the page's store with. */
	data?: string | null;
	rootBoundary?: ServerManifest['rootBoundaryEntries'];
	clientBuild?: ClientBuildManifest;
	streamedSignals?: { buildId: string; documentId: string };
}

export function serializeRouteData(data: RouteHydrationData): string;

export const HYDRATION_NONCE_PLACEHOLDER: '__OCTANE_REQUEST_NONCE__';
export function composeHtmlStream(
	prefix: string,
	renderStream: ReadableStream<Uint8Array>,
	suffix: string,
	afterShell?: string,
	ending?: RouteEnding,
): ReadableStream<Uint8Array>;
/** Computes a stream's suffix once its render has finished, and runs `end` however it ends. */
export interface RouteEnding {
	tail(suffix: string): Promise<string>;
	end(): void;
	/** Handed the composed stream, so a failed request can cancel it. */
	hold?(stream: ReadableStream<Uint8Array>): void;
}
/** A route's seeds go before `</body>`, and the route ends with the stream. */
export function routeEnding(context: object, nonceAttribute: string): RouteEnding;
/** End a route whose response failed before streaming: release what it opened. */
export function endRoute(context: object): void;
export function validateSsrTemplate(html: string): void;
export function injectHydrationEntry(html: string, source: string, nonce?: string | null): string;
export function splitSsrTemplate(html: string): [prefix: string, suffix: string];
export function prepareStreamingHydrationTemplate(html: string): {
	html: string;
	afterShell: string;
};
export function applyHydrationNonce(html: string, nonce?: string | null): string;
export function nonceAttribute(nonce?: string | null): string;
export function getContextNonce(context: Context): string | null;
