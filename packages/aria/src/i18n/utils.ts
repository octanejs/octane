// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/i18n/utils.ts).
// Pure locale helpers — verbatim.

// https://en.wikipedia.org/wiki/Right-to-left
const RTL_SCRIPTS = new Set([
	'Arab',
	'Syrc',
	'Samr',
	'Mand',
	'Thaa',
	'Mend',
	'Nkoo',
	'Adlm',
	'Rohg',
	'Hebr',
]);
const RTL_LANGS = new Set([
	'ae',
	'ar',
	'arc',
	'bcc',
	'bqi',
	'ckb',
	'dv',
	'fa',
	'glk',
	'he',
	'ku',
	'mzn',
	'nqo',
	'pnb',
	'ps',
	'sd',
	'ug',
	'ur',
	'yi',
]);

/**
 * Determines if a locale is read right to left using
 * [Intl.Locale]{@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale}.
 */
export function isRTL(localeString: string): boolean {
	// If the Intl.Locale API is available, use it to get the locale's text direction.
	if (Intl.Locale) {
		let locale = new Intl.Locale(localeString).maximize();

		// Use the text info object to get the direction if possible.
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/getTextInfo
		let textInfo =
			// @ts-ignore - this was implemented as a property by some browsers before it was standardized as a function.
			typeof locale.getTextInfo === 'function' ? locale.getTextInfo() : locale.textInfo;
		if (textInfo) {
			return textInfo.direction === 'rtl';
		}

		// Fallback: guess using the script.
		// This is more accurate than guessing by language, since languages can be written in multiple scripts.
		if (locale.script) {
			return RTL_SCRIPTS.has(locale.script);
		}
	}

	// If not, just guess by the language (first part of the locale)
	let lang = localeString.split('-')[0];
	return RTL_LANGS.has(lang);
}
