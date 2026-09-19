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
): ReadableStream<Uint8Array>;
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
