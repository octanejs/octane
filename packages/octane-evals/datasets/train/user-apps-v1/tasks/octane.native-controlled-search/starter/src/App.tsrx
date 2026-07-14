import { useState } from 'octane';

export function SearchField(props: {
	id: string;
	value: string;
	onQueryInput: (value: string, event: Event) => void;
}) @{
	<>
		<label htmlFor={props.id}>Search</label>
		<input
			id={props.id}
			type="search"
			defaultValue={props.value}
			onChange={(event) => props.onQueryInput((event.target as HTMLInputElement).value, event)}
		/>
	</>
}

export function App(props: { onQueryInput: (value: string, event: Event) => void }) @{
	const [query, setQuery] = useState('');
	const updateQuery = (value: string, event: Event) => {
		setQuery(value);
		props.onQueryInput(value, event);
	};

	<section>
		<SearchField id="search-query" value={query} onQueryInput={updateQuery} />
		<p role="status">
			{query ? 'Searching for: ' + query : 'Type to search'}
		</p>
		<button type="button" disabled={query.length === 0} onClick={() => setQuery('')}>
			Clear search
		</button>
	</section>
}
