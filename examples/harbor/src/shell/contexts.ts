// The shared React contexts. This is ONE module imported by both the React
// shell (.tsx, compiled by plugin-react) and the Octane islands (.tsrx,
// compiled by Octane) — the islands read these real React context objects with
// plain use(), which is exactly the boundary behavior Harbor exists to prove.
import { createContext } from 'react';

export type HarborLocale = 'en-US' | 'de-DE';
export type HarborTheme = 'light' | 'dark';

export const LocaleContext = createContext<HarborLocale>('en-US');
export const ThemeContext = createContext<HarborTheme>('light');
