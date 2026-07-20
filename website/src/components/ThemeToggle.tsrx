// Light/dark theme toggle. The source of truth is the `data-theme` attribute on
// <html>, set before paint by the inline script in __root.tsrx; this button
// flips it, persists the choice, and keeps the address-bar theme-color in sync.
// State starts at the server default ('dark') so the first client render matches
// the SSR markup, then a mount effect reconciles it to whatever the pre-paint
// script actually applied (e.g. the OS preference).
import { useEffect, useState } from 'octane';

type Theme = 'dark' | 'light';

export function ThemeToggle() @{
	const [theme, setTheme] = useState<Theme>('dark');

	useEffect(() => {
		const current = document.documentElement.getAttribute('data-theme');
		if (current === 'light' || current === 'dark') setTheme(current);
	}, []);

	function toggle() {
		// The applied `data-theme` is the source of truth (the pre-paint script may
		// have set light before the mount effect synced local state), so flip from
		// it — not from `theme` — to avoid a dead first click.
		const current: Theme =
			document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
		const next: Theme =
			current === 'dark' ? 'light' : 'dark';
		setTheme(next);
		document.documentElement.setAttribute('data-theme', next);
		try {
			localStorage.setItem('octane-theme', next);
		} catch {
			// Private mode / disabled storage: the choice just won't persist.
		}
		const meta = document.querySelector('meta[name="theme-color"]');
		if (meta !== null) meta.setAttribute('content', next === 'light' ? '#ffffff' : '#23272f');
	}

	<button
		type="button"
		class="theme-toggle"
		onClick={toggle}
		aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
		title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
	>
		@if (theme === 'dark') {
			<svg
				viewBox="0 0 24 24"
				width="20"
				height="20"
				aria-hidden="true"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="12" cy="12" r="4" />
				<path
					d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
				/>
			</svg>
		} @else {
			<svg
				viewBox="0 0 24 24"
				width="20"
				height="20"
				aria-hidden="true"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
			</svg>
		}
		<style>
			.theme-toggle {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 36px;
				height: 36px;
				border: none;
				border-radius: 9999px;
				background: transparent;
				color: var(--text-secondary);
				cursor: pointer;
				transition:
					background 0.15s,
					color 0.15s;
			}
			.theme-toggle:hover {
				color: var(--text);
				background: var(--surface);
			}
		</style>
	</button>
}
