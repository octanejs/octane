import { createClientOnlyFn, createIsomorphicFn } from '@tanstack/react-start';
import * as React from 'react';
import { createContext, ReactNode, useEffect, useState } from 'react';
import * as v from 'valibot';
import { THEME_COLORS } from '~/utils/utils';

const themeModeSchema = v.picklist(['light', 'dark', 'auto']);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used for type inference
const resolvedThemeSchema = v.picklist(['light', 'dark']);
const themeKey = 'theme';

type ThemeMode = v.InferOutput<typeof themeModeSchema>;
type ResolvedTheme = v.InferOutput<typeof resolvedThemeSchema>;

const getStoredThemeMode = createIsomorphicFn()
	.server((): ThemeMode => 'auto')
	.client((): ThemeMode => {
		try {
			const storedTheme = localStorage.getItem(themeKey);
			return v.parse(themeModeSchema, storedTheme);
		} catch {
			return 'auto';
		}
	});

const setStoredThemeMode = createClientOnlyFn((theme: ThemeMode) => {
	try {
		const parsedTheme = v.parse(themeModeSchema, theme);
		localStorage.setItem(themeKey, parsedTheme);
	} catch {}
});

const getSystemTheme = createIsomorphicFn()
	.server((): ResolvedTheme => 'light')
	.client((): ResolvedTheme => {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	});

const updateThemeClass = createClientOnlyFn((themeMode: ThemeMode) => {
	const root = document.documentElement;
	root.classList.add('theme-switching');

	root.classList.remove('light', 'dark', 'auto');
	const newTheme = themeMode === 'auto' ? getSystemTheme() : themeMode;
	root.classList.add(newTheme);

	if (themeMode === 'auto') {
		root.classList.add('auto');
	}

	const metaThemeColor = document.querySelector('meta[name="theme-color"]');
	if (metaThemeColor) {
		metaThemeColor.setAttribute(
			'content',
			newTheme === 'dark' ? THEME_COLORS.dark : THEME_COLORS.light,
		);
	}

	// Force reflow so the no-transition styles apply to the theme change,
	// then remove the class on the next frame so subsequent interactions animate.
	void root.offsetHeight;
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			root.classList.remove('theme-switching');
		});
	});
});

const getNextTheme = createClientOnlyFn((current: ThemeMode): ThemeMode => {
	const themes: ThemeMode[] =
		getSystemTheme() === 'dark' ? ['auto', 'light', 'dark'] : ['auto', 'dark', 'light'];
	return themes[(themes.indexOf(current) + 1) % themes.length];
});

type ThemeContextProps = {
	themeMode: ThemeMode;
	resolvedTheme: ResolvedTheme;
	setTheme: (theme: ThemeMode) => void;
	toggleMode: () => void;
};
const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

type ThemeProviderProps = {
	children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
	const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
	const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

	useEffect(() => {
		const storedThemeMode = getStoredThemeMode();
		setThemeMode(storedThemeMode);
		updateThemeClass(storedThemeMode);
		setResolvedTheme(storedThemeMode === 'auto' ? getSystemTheme() : storedThemeMode);
	}, []);

	// Listen for system theme changes when in auto mode
	useEffect(() => {
		if (themeMode !== 'auto') return;
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handler = () => {
			updateThemeClass('auto');
			setResolvedTheme(getSystemTheme());
		};
		mediaQuery.addEventListener('change', handler);
		return () => mediaQuery.removeEventListener('change', handler);
	}, [themeMode]);

	const setTheme = (newTheme: ThemeMode) => {
		setThemeMode(newTheme);
		setStoredThemeMode(newTheme);
		updateThemeClass(newTheme);
		setResolvedTheme(newTheme === 'auto' ? getSystemTheme() : newTheme);
	};

	const toggleMode = () => {
		setTheme(getNextTheme(themeMode));
	};

	return (
		<ThemeContext.Provider value={{ themeMode, resolvedTheme, setTheme, toggleMode }}>
			{children}
		</ThemeContext.Provider>
	);
}

export const useTheme = () => {
	const context = React.useContext(ThemeContext);
	if (!context) {
		throw new Error('useTheme must be used within a ThemeProvider');
	}
	return context;
};

// Returns the class string for <html> element
// Reads from DOM on client (matches what head script set), empty on server
const getHtmlClass = createIsomorphicFn()
	.server(() => '')
	.client(() => document.documentElement.className);

export function useHtmlClass(): string {
	return getHtmlClass();
}
