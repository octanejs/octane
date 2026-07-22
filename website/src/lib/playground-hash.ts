import type { PlaygroundLang } from './playground.ts';
import type { PlaygroundFile } from './playground-modules.ts';

/** Total source budget across ALL files in a workspace. */
export const MAX_PLAYGROUND_SOURCE_LENGTH = 20_000;

export const MAX_PLAYGROUND_FILES = 10;

// JSON can escape one UTF-16 code unit as six ASCII bytes (`\u0000`), then
// base64 expands by 4/3. Bound the encoded input before `atob` so a hostile URL
// cannot force an unbounded allocation merely by opening the playground. The
// constant term covers the v2 envelope and per-file name/JSON overhead.
export const MAX_PLAYGROUND_HASH_LENGTH = Math.ceil(
	((MAX_PLAYGROUND_SOURCE_LENGTH * 6 + 2048) * 4) / 3,
);

export const PLAYGROUND_SOURCE_LIMIT_ERROR = `Source is limited to ${MAX_PLAYGROUND_SOURCE_LENGTH} characters in the playground.`;

// One optional interior `.react` segment marks React-host files (see
// playground-modules.ts); everything else is a single-extension name.
const FILE_NAME_PATTERN = /^[A-Za-z0-9_-]+(\.react)?\.(tsrx|tsx)$/;

export type PlaygroundHashPayload = {
	lang: PlaygroundLang;
	entry: string;
	files: PlaygroundFile[];
};
export type PlaygroundHashResult =
	{ ok: true; value: PlaygroundHashPayload | null } | { ok: false; error: string };

function totalLength(files: PlaygroundFile[]): number {
	return files.reduce((sum, file) => sum + file.source.length, 0);
}

/** Encode the active workspace as a v2 share hash ('' when over budget). */
export function encodePlaygroundHash(payload: PlaygroundHashPayload): string {
	if (totalLength(payload.files) > MAX_PLAYGROUND_SOURCE_LENGTH) return '';
	try {
		const json = JSON.stringify({
			v: 2,
			l: payload.lang,
			e: payload.entry,
			f: payload.files.map((file) => ({ n: file.name, s: file.source })),
		});
		const bytes = new TextEncoder().encode(json);
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

		if (parsed?.v === 2) {
			if (parsed.l !== 'tsrx' && parsed.l !== 'tsx') return { ok: true, value: null };
			if (
				!Array.isArray(parsed.f) ||
				parsed.f.length < 1 ||
				parsed.f.length > MAX_PLAYGROUND_FILES
			) {
				return { ok: true, value: null };
			}
			const files: PlaygroundFile[] = [];
			const names = new Set<string>();
			for (const entry of parsed.f) {
				if (
					typeof entry?.n !== 'string' ||
					typeof entry?.s !== 'string' ||
					!FILE_NAME_PATTERN.test(entry.n) ||
					names.has(entry.n)
				) {
					return { ok: true, value: null };
				}
				names.add(entry.n);
				files.push({ name: entry.n, source: entry.s });
			}
			if (typeof parsed.e !== 'string' || !names.has(parsed.e)) {
				return { ok: true, value: null };
			}
			if (totalLength(files) > MAX_PLAYGROUND_SOURCE_LENGTH) {
				return { ok: false, error: PLAYGROUND_SOURCE_LIMIT_ERROR };
			}
			return { ok: true, value: { lang: parsed.l, entry: parsed.e, files } };
		}

		// Legacy single-file payloads (`{ s, l }`) keep working: normalize to a
		// one-file workspace named after the shared dialect.
		if (typeof parsed?.s !== 'string' || (parsed?.l !== 'tsrx' && parsed?.l !== 'tsx')) {
			return { ok: true, value: null };
		}
		if (parsed.s.length > MAX_PLAYGROUND_SOURCE_LENGTH) {
			return { ok: false, error: PLAYGROUND_SOURCE_LIMIT_ERROR };
		}
		const name = `App.${parsed.l}`;
		return {
			ok: true,
			value: { lang: parsed.l, entry: name, files: [{ name, source: parsed.s }] },
		};
	} catch {
		// A malformed unrelated fragment is not a playground payload.
		return { ok: true, value: null };
	}
}
