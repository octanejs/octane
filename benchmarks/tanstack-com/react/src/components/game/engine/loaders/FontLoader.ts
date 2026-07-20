// @ts-expect-error - troika-three-text has no types
import { preloadFont } from 'troika-three-text';

// Font URL - using Inter from Google Fonts CDN for reliability
export const GAME_FONT_URL =
	'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2';

// Common characters used in the game
const COMMON_CHARS =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?-+/()&@#$%*:;\'"';

export function preloadGameFonts(): Promise<void> {
	return new Promise((resolve) => {
		// Set a timeout in case font loading hangs
		const timeout = setTimeout(() => {
			console.warn('[FontLoader] Font preload timed out, continuing anyway');
			resolve();
		}, 5000);

		try {
			preloadFont(
				{
					font: GAME_FONT_URL,
					characters: COMMON_CHARS,
				},
				() => {
					clearTimeout(timeout);
					resolve();
				},
			);
		} catch (err) {
			console.error('[FontLoader] preloadFont error:', err);
			clearTimeout(timeout);
			resolve();
		}
	});
}
