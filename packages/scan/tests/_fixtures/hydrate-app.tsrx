// A tiny SSR-hydration fixture for the naming resolver: an App wrapping a Card
// wrapping a titled span. Server-compiled and client-compiled forms of this
// same file drive the hydrate-resolve test.
export function Card(props) @{
	<article id="card">
		<span id="title">
			{props.title as string}
		</span>
	</article>
}

export function App(props) @{
	<main id="app">
		<Card title={props.title} />
	</main>
}
