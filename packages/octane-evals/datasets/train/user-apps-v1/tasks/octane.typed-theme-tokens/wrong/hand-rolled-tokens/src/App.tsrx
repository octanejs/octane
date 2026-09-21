// Hand-rolled lookalike: identical runtime values without defineThemeTokens.
const rawTokens = {
	colors: { surface: '#ffffff', ink: '#1b1b23', accent: '#4353ff' },
	space: { cardPad: '1.25rem' },
};

export const tokens = {
	colors: {
		surface: 'var(--colors-surface, #ffffff)',
		ink: 'var(--colors-ink, #1b1b23)',
		accent: 'var(--colors-accent, #4353ff)',
	},
	space: { cardPad: 'var(--space-cardPad, 1.25rem)' },
	vars: {
		colors: {
			surface: '--colors-surface',
			ink: '--colors-ink',
			accent: '--colors-accent',
		},
		space: { cardPad: '--space-cardPad' },
	},
	raw: rawTokens,
	css: ':root {\n\t--colors-surface: #ffffff;\n\t--colors-ink: #1b1b23;\n\t--colors-accent: #4353ff;\n\t--space-cardPad: 1.25rem;\n}\n' +
		'.theme-dark {\n\t--colors-surface: #16161e;\n\t--colors-ink: #f2f2f7;\n}\n',
};

export function App() @{
	<main id="app">
		<style>{tokens.css}</style>
		<style>
			.card {
				background: var(--colors-surface);
				color: var(--colors-ink);
				padding: var(--space-cardPad);
			}
			.card-title {
				color: var(--colors-ink);
			}
		</style>
		<article class="card">
			<h2 class="card-title">Pro plan</h2>
			<p class="card-price">$12 / month</p>
			<a class="card-cta" href="#upgrade" style={{ color: tokens.colors.accent }}>Upgrade</a>
		</article>
	</main>
}
