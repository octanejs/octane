// Light/dark theme toggle: flips the `dark` class on <body> (every color on
// the page is a shadcn token, so the whole app re-themes), persists the choice
// (read back by the pre-paint script in index.html).
import { useEffect, useState } from 'octane';
import { Button } from '@/components/ui/button.tsrx';
import { MoonIcon, SunIcon } from '@octanejs/lucide';

const STORAGE_KEY = 'octane-playground-theme';

export function ThemeToggle() @{
	const [theme, setTheme] = useState<'dark' | 'light'>(
		() => document.body.classList.contains('dark') ? 'dark' : 'light',
	);

	useEffect(() => {
		document.body.classList.toggle('dark', theme === 'dark');
		try {
			localStorage.setItem(STORAGE_KEY, theme);
		} catch {
			// Storage may be unavailable (private mode); the toggle still works.
		}
	});

	<Button
		variant="ghost"
		size="icon"
		data-testid="theme-toggle"
		aria-label={'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode'}
		onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
	>
		@if (theme === 'dark') {
			<SunIcon />
		} @else {
			<MoonIcon />
		}
	</Button>
}
