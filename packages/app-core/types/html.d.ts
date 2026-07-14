import type { Context } from '@octanejs/app-core';

export const HYDRATION_NONCE_PLACEHOLDER: '__OCTANE_REQUEST_NONCE__';
export function composeHtmlStream(
	prefix: string,
	renderStream: ReadableStream<Uint8Array>,
	suffix: string,
): ReadableStream<Uint8Array>;
export function validateSsrTemplate(html: string): void;
export function injectHydrationEntry(html: string, source: string, nonce?: string | null): string;
export function splitSsrTemplate(html: string): [prefix: string, suffix: string];
export function applyHydrationNonce(html: string, nonce?: string | null): string;
export function nonceAttribute(nonce?: string | null): string;
export function getContextNonce(context: Context): string | null;
