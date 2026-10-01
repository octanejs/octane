'use strong';
import { useRef } from 'octane';

function SearchPanel({ title }: { title: string }) @{
	const input = useRef<HTMLInputElement | null>(null);

	<section>
		<h2>{title as string}</h2>
		<input ref={input} type="search" aria-label={`Search ${title}`} />
		<button onClick={() => input.current!.focus()}>{'Focus search'}</button>
	</section>
}

export function App() @{
	<main>
		<SearchPanel title="Docs" />
		<SearchPanel title="Blog" />
	</main>
}
