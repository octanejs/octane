// Ported from next-themes 0.4.6
// (https://github.com/pacocoursey/next-themes/blob/3a43743798db3008a0fc59e8bcc9d6e1bb5d4752/next-themes/src/types.ts).
//
// Octane adaptation: the React type namespace is Octane's, which exports the
// same names.
import type * as Octane from 'octane';

interface ValueObject {
	[themeName: string]: string;
}

type DataAttribute = `data-${string}`;

interface ScriptProps extends Octane.DetailedHTMLProps<
	Octane.ScriptHTMLAttributes<HTMLScriptElement>,
	HTMLScriptElement
> {
	[dataAttribute: DataAttribute]: any;
}

export interface UseThemeProps {
	/** List of all available theme names */
	themes: string[];
	/** Forced theme name for the current page */
	forcedTheme?: string | undefined;
	/** Update the theme */
	setTheme: Octane.Dispatch<Octane.SetStateAction<string>>;
	/** Active theme name */
	theme?: string | undefined;
	/** If `enableSystem` is true and the active theme is "system", this returns whether the system preference resolved to "dark" or "light". Otherwise, identical to `theme` */
	resolvedTheme?: string | undefined;
	/** If enableSystem is true, returns the System theme preference ("dark" or "light"), regardless what the active theme is */
	systemTheme?: 'dark' | 'light' | undefined;
}

export type Attribute = DataAttribute | 'class';

export interface ThemeProviderProps extends Octane.PropsWithChildren {
	/** List of all available theme names */
	themes?: string[] | undefined;
	/** Forced theme name for the current page */
	forcedTheme?: string | undefined;
	/** Whether to switch between dark and light themes based on prefers-color-scheme */
	enableSystem?: boolean | undefined;
	/** Disable all CSS transitions when switching themes */
	disableTransitionOnChange?: boolean | undefined;
	/** Whether to indicate to browsers which color scheme is used (dark or light) for built-in UI like inputs and buttons */
	enableColorScheme?: boolean | undefined;
	/** Key used to store theme setting in localStorage */
	storageKey?: string | undefined;
	/** Default theme name (for v0.0.12 and lower the default was light). If `enableSystem` is false, the default theme is light */
	defaultTheme?: string | undefined;
	/** HTML attribute modified based on the active theme. Accepts `class`, `data-*` (meaning any data attribute, `data-mode`, `data-color`, etc.), or an array which could include both */
	attribute?: Attribute | Attribute[] | undefined;
	/** Mapping of theme name to HTML attribute value. Object where key is the theme name and value is the attribute value */
	value?: ValueObject | undefined;
	/** Nonce string to pass to the inline script and style elements for CSP headers */
	nonce?: string;
	/** Props to pass the inline script */
	scriptProps?: ScriptProps;
}
