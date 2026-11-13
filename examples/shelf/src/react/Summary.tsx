/** @jsxImportSource react */
import type { DataStore } from 'octane/data';
import { DataProvider, useDataStore, useRead } from 'octane/data/react';
import { setRead, unread } from '../shared/contracts.data.ts';

function Unread() {
	const store = useDataStore();
	const list = useRead(store.read(unread), { suspend: false }).value ?? [];
	return (
		<section className="island" aria-label="React island">
			<h2>Up next (React island)</h2>
			{list.length === 0 ? (
				<p>Nothing left to read.</p>
			) : (
				<ul>
					{list.map((book) => (
						<li key={book.id}>
							{book.title}{' '}
							<button
								type="button"
								aria-label={`Mark ${book.title} read from React`}
								onClick={() =>
									void store.write(setRead, { id: book.id, read: true }).catch(() => {})
								}
							>
								Mark read
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

/** A React island given the Octane page's store: both renderers show the same edits. */
export function ReactSummary(props: { store: DataStore }) {
	return (
		<DataProvider store={props.store}>
			<Unread />
		</DataProvider>
	);
}
