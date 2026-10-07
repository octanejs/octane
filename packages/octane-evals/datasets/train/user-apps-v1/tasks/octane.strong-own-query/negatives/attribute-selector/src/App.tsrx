'use strong';
// Workaround: query by attribute instead of by the literal id.

function SearchPanel({ title }: { title: string }) @{
	<section>
		<h2>{title as string}</h2>
		<input type="search" aria-label={`Search ${title}`} />
		<button
			onClick={() => document.querySelector<HTMLInputElement>('input[type="search"]')!.focus()}
		>
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
