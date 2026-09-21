import { defineThemeTokens } from 'octane/theme-tokens';

export const tokens = defineThemeTokens(
	{
		colors: { surface: '#ffffff', ink: '#1b1b23', accent: '#4353ff' },
		space: { cardPad: '1.25rem' },
	},
	{
		variants: {
			dark: {
				selector: '.theme-dark',
				values: { colors: { surface: '#16161e', ink: '#f2f2f7' } },
			},
		},
	},
);

export function App() @{
	<main id="app">
		<style>{tokens.css}</style>
		<style>
			.card {
				background: #ffffff;
				color: #1b1b23;
				padding: 1.25rem;
			}
			.card-title {
				color: #1b1b23;
			}
		</style>
		<article class="card">
			<h2 class="card-title">Pro plan</h2>
			<p class="card-price">$12 / month</p>
			<a class="card-cta" href="#upgrade" style={{ color: tokens.colors.accent }}>Upgrade</a>
		</article>
	</main>
}
