// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/i18n/server.tsx).
// NOT React-Server-Components machinery — a portable SSR helper: a component rendered
// during server rendering that injects the locale + localized string tables into the
// initial HTML via an inline <script> (read back on the client through the
// `react-aria.i18n.locale` / `react-aria.i18n.strings` window symbols that
// `useDefaultLocale` and `@internationalized/string` consume). octane adaptations:
// - `.tsx` → `.ts`: JSX → createElement; octane supports `dangerouslySetInnerHTML` and
//   `suppressHydrationWarning` with React semantics.
// - React's `JSX.Element` type → `any` (octane descriptors).
// - The dev-only "should only be rendered on the server" console.log is not ported
//   (repo policy); the client-side `return null` guard is kept.
import type { LocalizedString } from '@internationalized/string';
import { createElement } from 'octane';

type PackageLocalizedStrings = {
	[packageName: string]: Record<string, LocalizedString>;
};

interface PackageLocalizationProviderProps {
	locale: string;
	strings: PackageLocalizedStrings;
	nonce?: string;
}

/**
 * A PackageLocalizationProvider can be rendered on the server to inject the localized strings
 * needed by the client into the initial HTML.
 */
export function PackageLocalizationProvider(props: PackageLocalizationProviderProps): any {
	if (typeof document !== 'undefined') {
		return null;
	}

	let { nonce, locale, strings } = props;
	// suppressHydrationWarning is necessary because the browser
	// remove the nonce parameter from the DOM before hydration
	return createElement('script', {
		nonce: typeof window === 'undefined' ? nonce : '',
		suppressHydrationWarning: true,
		dangerouslySetInnerHTML: { __html: getPackageLocalizationScript(locale, strings) },
	});
}

/**
 * Returns the content for an inline `<script>` tag to inject localized strings into initial HTML.
 */
export function getPackageLocalizationScript(
	locale: string,
	strings: PackageLocalizedStrings,
): string {
	return `window[Symbol.for('react-aria.i18n.locale')]=${JSON.stringify(locale)};{${serialize(strings)}}`;
}

const cache = new WeakMap<PackageLocalizedStrings, string>();

function serialize(strings: PackageLocalizedStrings): string {
	let cached = cache.get(strings);
	if (cached) {
		return cached;
	}

	// Find common strings between packages and hoist them into variables.
	let seen = new Set();
	let common = new Map();
	for (let pkg in strings) {
		for (let key in strings[pkg]) {
			let v = strings[pkg][key];
			let s = typeof v === 'string' ? JSON.stringify(v) : v.toString();
			if (seen.has(s) && !common.has(s)) {
				let name = String.fromCharCode(common.size > 25 ? common.size + 97 : common.size + 65);
				common.set(s, name);
			}
			seen.add(s);
		}
	}

	let res = '';
	if (common.size > 0) {
		res += 'let ';
	}
	for (let [string, name] of common) {
		res += `${name}=${string},`;
	}
	if (common.size > 0) {
		res = res.slice(0, -1) + ';';
	}

	res += "window[Symbol.for('react-aria.i18n.strings')]={";
	for (let pkg in strings) {
		res += `'${pkg}':{`;
		for (let key in strings[pkg]) {
			let v = strings[pkg][key];
			let s = typeof v === 'string' ? JSON.stringify(v) : v.toString();
			if (common.has(s)) {
				s = common.get(s);
			}
			res += `${/[ ()]/.test(key) ? JSON.stringify(key) : key}:${s},`;
		}
		res = res.slice(0, -1) + '},';
	}
	res = res.slice(0, -1) + '};';
	cache.set(strings, res);
	return res;
}
