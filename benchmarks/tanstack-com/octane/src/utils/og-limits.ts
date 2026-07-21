// OG image text limits — shared between the server-side generator
// (src/server/og/generate.server.ts) and the client-side URL helper
// (src/utils/og.ts), so the meta og:image URL stays bounded at the
// same length the renderer would clamp to anyway.
export const MAX_OG_TITLE_LENGTH = 80;
export const MAX_OG_DESCRIPTION_LENGTH = 160;

export function clampOgText(text: string, max: number): string {
	const trimmed = text.trim();
	if (trimmed.length <= max) return trimmed;
	return trimmed.slice(0, max - 1).trimEnd() + '…';
}
