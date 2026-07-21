import { useTheme } from './ThemeProvider.tsrx';
import { Moon, Sun, SunMoon } from '@octanejs/lucide';
import { Button } from '~/ui';

export function ThemeToggle() {
	const { themeMode, resolvedTheme, toggleMode } = useTheme();

	const handleToggleMode = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		toggleMode();
	};

	const label =
		themeMode === 'auto'
			? 'Auto'
			: themeMode === 'light'
				? 'Light'
				: 'Dark';

	const nextLabel =
		themeMode === 'auto'
			? 'light'
			: themeMode === 'light'
				? 'dark'
				: 'auto';

	const activeIcon =
		themeMode === 'auto' ? 'auto' : resolvedTheme;

	const getIconClassName = (icon: typeof activeIcon) => [
		'col-start-1 row-start-1 h-3.5 w-3.5 shrink-0 transition-opacity motion-reduce:transition-none',
		activeIcon === icon ? 'opacity-100' : 'opacity-0',
	].join(' ');

	return <Button
		type="button"
		variant="icon"
		color="gray"
		size="icon-sm"
		onClick={handleToggleMode}
		aria-label={`Theme: ${label}. Switch to ${nextLabel} mode.`}
		title={`Theme: ${label}. Switch to ${nextLabel} mode.`}
		className="h-7 w-7 shrink-0 rounded-md p-0 leading-none"
	>
		<span aria-hidden="true" class="grid h-3.5 w-3.5 shrink-0 place-items-center">
			<SunMoon className={getIconClassName('auto')} />
			<Sun className={getIconClassName('light')} />
			<Moon className={getIconClassName('dark')} />
		</span>
	</Button>;
}
