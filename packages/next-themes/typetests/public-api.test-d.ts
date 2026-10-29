import type { OctaneNode } from 'octane';
import type { Assert, Equal } from '../../../scripts/react-port/type-assertions';
import {
	ThemeProvider,
	useTheme,
	type Attribute,
	type ThemeProviderProps,
	type UseThemeProps,
} from '@octanejs/next-themes';

type ThemeSetter = UseThemeProps['setTheme'];

export type Checks = [
	Assert<Equal<Attribute, `data-${string}` | 'class'>>,
	Assert<Equal<ReturnType<typeof useTheme>, UseThemeProps>>,
	Assert<Equal<Parameters<typeof ThemeProvider>[0], ThemeProviderProps>>,
	Assert<Equal<ReturnType<typeof ThemeProvider>, OctaneNode>>,
	Assert<Equal<Parameters<ThemeSetter>[0], string | ((previous: string) => string)>>,
	Assert<Equal<UseThemeProps['systemTheme'], 'dark' | 'light' | undefined>>,
	Assert<Equal<ThemeProviderProps['attribute'], Attribute | Attribute[] | undefined>>,
	Assert<Equal<ThemeProviderProps['value'], { [themeName: string]: string } | undefined>>,
];

const theme = useTheme();
theme.setTheme('dark');
theme.setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'));

export const everyProp: ThemeProviderProps = {
	attribute: ['class', 'data-mode'],
	children: null,
	defaultTheme: 'system',
	disableTransitionOnChange: true,
	enableColorScheme: false,
	enableSystem: true,
	forcedTheme: 'dark',
	nonce: 'n0nce',
	scriptProps: { id: 'theme-script', 'data-cfasync': 'false' },
	storageKey: 'theme',
	themes: ['light', 'dark', 'pink'],
	value: { pink: 'theme-pink' },
};

// @ts-expect-error attribute is `class` or a `data-*` attribute
export const unknownAttribute: ThemeProviderProps = { attribute: 'aria-theme' };

// @ts-expect-error a theme name is a string
theme.setTheme(1);
