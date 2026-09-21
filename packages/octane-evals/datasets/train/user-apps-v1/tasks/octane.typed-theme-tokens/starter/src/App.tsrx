export const tokens = {
	colors: { surface: '#ffffff', ink: '#1b1b23', accent: '#4353ff' },
	space: { cardPad: '1.25rem' },
};

export function App() @{
	<main id="app">
		<article class="card">
			<h2 class="card-title">Pro plan</h2>
			<p class="card-price">$12 / month</p>
			<a class="card-cta" href="#upgrade">Upgrade</a>
		</article>
	</main>
}
