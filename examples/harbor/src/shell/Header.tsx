// React-owned chrome: the compare-count badge (fed by island events through
// App state) and the locale/theme toggles that flip the shared providers the
// islands subscribe to.
import { use } from 'react';
import { LocaleContext, ThemeContext, type HarborLocale, type HarborTheme } from './contexts.ts';

export interface HeaderProps {
	compareCount: number;
	onToggleLocale: () => void;
	onToggleTheme: () => void;
}

export function Header({ compareCount, onToggleLocale, onToggleTheme }: HeaderProps) {
	const locale: HarborLocale = use(LocaleContext);
	const theme: HarborTheme = use(ThemeContext);
	return (
		<header className="site-header">
			<span className="site-name">Harbor</span>
			{/* A React-rendered label off the SAME context the islands read — the
			    provider-flip journey asserts both move together. */}
			<span className="active-locale" data-locale={locale}>
				{locale}
			</span>
			<button className="toggle-locale" onClick={onToggleLocale}>
				{locale === 'en-US' ? 'Auf Deutsch' : 'In English'}
			</button>
			<button className="toggle-theme" onClick={onToggleTheme}>
				{theme === 'light' ? 'Dark deck' : 'Light deck'}
			</button>
			<span className="compare-badge" aria-label="Plans in comparison">
				{'Compare: '}
				<strong className="compare-count">{compareCount}</strong>
			</span>
		</header>
	);
}
