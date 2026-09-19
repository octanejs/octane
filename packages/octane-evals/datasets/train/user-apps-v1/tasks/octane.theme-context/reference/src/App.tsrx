import { createContext, use, useState } from 'octane';

export type Theme = 'system' | 'light' | 'dark' | 'sepia';

export const ThemeContext = createContext<Theme>('system');

export function ThemeLabel(props: { id: string }) @{
	const theme = use(ThemeContext);

	<output
		id={props.id}
		data-theme={theme}
		class={['theme-label', 'theme-' + theme]}
	>{theme as string}</output>
}

export function App() @{
	const [theme, setTheme] = useState<Theme>('light');

	<ThemeContext value={theme}>
		<main id="settings" data-theme={theme}>
			<button
				id="toggle-theme"
				type="button"
				onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
			>
				Toggle theme
			</button>
			<ThemeLabel id="current-theme" />
			<ThemeContext value="sepia">
				<ThemeLabel id="nested-preview" />
			</ThemeContext>
		</main>
	</ThemeContext>
}
