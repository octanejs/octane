// Ported from next-themes 0.4.6
// (https://github.com/pacocoursey/next-themes/blob/3a43743798db3008a0fc59e8bcc9d6e1bb5d4752/next-themes/src/script.ts).
//
// Octane adaptation: parameter types only, for strict TypeScript. The body is
// upstream's, and it must stay self-contained: ThemeScript serializes it with
// `toString()` into the inline script that runs before the page paints.
import type { Attribute } from './types';

export const script = (
	attribute: Attribute | Attribute[],
	storageKey: string,
	defaultTheme: string,
	forcedTheme: string | undefined,
	themes: string[],
	value: Record<string, string> | undefined,
	enableSystem: boolean,
	enableColorScheme: boolean,
) => {
	const el = document.documentElement;
	const systemThemes = ['light', 'dark'];

	function updateDOM(theme: string) {
		const attributes = Array.isArray(attribute) ? attribute : [attribute];

		attributes.forEach((attr) => {
			const isClass = attr === 'class';
			const classes = isClass && value ? themes.map((t) => value[t] || t) : themes;
			if (isClass) {
				el.classList.remove(...classes);
				el.classList.add(value && value[theme] ? value[theme] : theme);
			} else {
				el.setAttribute(attr, theme);
			}
		});

		setColorScheme(theme);
	}

	function setColorScheme(theme: string) {
		if (enableColorScheme && systemThemes.includes(theme)) {
			el.style.colorScheme = theme;
		}
	}

	function getSystemTheme() {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}

	if (forcedTheme) {
		updateDOM(forcedTheme);
	} else {
		try {
			const themeName = localStorage.getItem(storageKey) || defaultTheme;
			const isSystem = enableSystem && themeName === 'system';
			const theme = isSystem ? getSystemTheme() : themeName;
			updateDOM(theme);
		} catch (e) {
			//
		}
	}
};
