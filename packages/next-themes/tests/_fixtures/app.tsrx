import { useEffect, useState } from 'octane';
import { ThemeProvider, useTheme } from '../../src/index.tsrx';
import type { ThemeProviderProps, UseThemeProps } from '../../src/index.tsrx';

export interface ThemedAppProps extends ThemeProviderProps {
	onTheme?: (value: UseThemeProps) => void;
}

// The README's mounted guard: the server cannot know the stored theme, so
// theme-dependent text waits for the client.
function ThemeToggle({ onTheme }: { onTheme?: (value: UseThemeProps) => void }) @{
	const value = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);
	useEffect(() => {
		onTheme?.(value);
	}, [onTheme, value]);
	<button onClick={() => value.setTheme(value.resolvedTheme === 'dark' ? 'light' : 'dark')}>
		{mounted ? (value.theme ?? 'none') : 'loading'}
	</button>
}

export function ThemedApp({ onTheme, ...props }: ThemedAppProps) @{
	<ThemeProvider {...props}>
		<ThemeToggle onTheme={onTheme} />
	</ThemeProvider>
}
