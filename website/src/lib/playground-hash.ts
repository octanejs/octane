import type { PlaygroundLang } from './playground.ts';

export const MAX_PLAYGROUND_SOURCE_LENGTH = 20_000;

// JSON can escape one UTF-16 code unit as six ASCII bytes (`\u0000`), then
// base64 expands by 4/3. Bound the encoded input before `atob` so a hostile URL
// cannot force an unbounded allocation merely by opening the playground.
export const MAX_PLAYGROUND_HASH_LENGTH = Math.ceil(
	((MAX_PLAYGROUND_SOURCE_LENGTH * 6 + 64) * 4) / 3,
);

export const PLAYGROUND_SOURCE_LIMIT_ERROR = `Source is limited to ${MAX_PLAYGROUND_SOURCE_LENGTH} characters in the playground.`;

export type PlaygroundHashPayload = { source: string; lang: PlaygroundLang };
export type PlaygroundHashResult =
	| { ok: true; value: PlaygroundHashPayload | null }
	| { ok: false; error: string };

export function encodePlaygroundHash(source: string, lang: PlaygroundLang): string {
	if (source.length > MAX_PLAYGROUND_SOURCE_LENGTH) return '';
	try {
		const bytes = new TextEncoder().encode(JSON.stringify({ s: source, l: lang }));
		let binary = '';
		for (let offset = 0; offset < bytes.length; offset += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
		}
		return btoa(binary);
	} catch {
		return '';
	}
}

/** Decode and validate a shared hash before the editor/highlighter stack loads. */
export function decodePlaygroundHash(hash: string): PlaygroundHashResult {
	if (!hash) return { ok: true, value: null };
	if (hash.length > MAX_PLAYGROUND_HASH_LENGTH) {
		return { ok: false, error: PLAYGROUND_SOURCE_LIMIT_ERROR };
	}

	try {
		const json = new TextDecoder().decode(
			Uint8Array.from(atob(hash), (character) => character.charCodeAt(0)),
		);
		const parsed = JSON.parse(json);
		if (typeof parsed?.s !== 'string' || (parsed?.l !== 'tsrx' && parsed?.l !== 'tsx')) {
			return { ok: true, value: null };
		}
		if (parsed.s.length > MAX_PLAYGROUND_SOURCE_LENGTH) {
			return { ok: false, error: PLAYGROUND_SOURCE_LIMIT_ERROR };
		}
		return { ok: true, value: { source: parsed.s, lang: parsed.l } };
	} catch {
		// A malformed unrelated fragment is not a playground payload.
		return { ok: true, value: null };
	}
}
