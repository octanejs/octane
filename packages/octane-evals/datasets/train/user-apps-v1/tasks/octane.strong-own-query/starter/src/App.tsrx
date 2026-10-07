'use strong';

function SearchPanel({ title }: { title: string }) @{
	<section>
		<h2>{title as string}</h2>
		<input id="search-input" type="search" aria-label={`Search ${title}`} />
		<button onClick={() => document.getElementById('search-input')!.focus()}>
			{'Focus search'}
		</button>
	</section>
}

export function App() @{
	<main>
		<SearchPanel title="Docs" />
		<SearchPanel title="Blog" />
	</main>
}
