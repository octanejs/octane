import { createContext } from 'octane';

export type Theme = 'system' | 'light' | 'dark' | 'sepia';

export const ThemeContext = createContext<Theme>('system');

export function ThemeLabel(props: { id: string }) @{
	<output id={props.id}>Not implemented</output>
}

export function App() @{
	<main id="settings" data-theme="unknown">
		<button id="toggle-theme" type="button">Toggle theme</button>
	</main>
}
