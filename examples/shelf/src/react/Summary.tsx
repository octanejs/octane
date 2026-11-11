/** @jsxImportSource react */
import type { DataStore } from 'octane/data';
import { DataProvider, useReadState, useWrite } from 'octane/data/react';
import { setRead, unread } from '../shared/contracts.ts';

function Unread() {
	const list = useReadState(unread).value ?? [];
	const save = useWrite(setRead);
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
								onClick={() => void save({ id: book.id, read: true }).catch(() => {})}
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
