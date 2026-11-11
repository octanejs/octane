/** @jsxImportSource react */
import { Suspense, useState, useSyncExternalStore, Component, type ReactNode } from 'react';
import { DataProvider, useRead } from 'octane/data/react';
import { addBook, books, finished, removeBook, setRead, stats } from '../shared/contracts.ts';
import {
	ACCOUNTS,
	checkSaved,
	namespaceFrom,
	openSession,
	outcomeText,
	submit,
	type ExternalValue,
	type Session,
} from '../shared/session.ts';

function useExternal<T>(value: ExternalValue<T>): T {
	return useSyncExternalStore(value.subscribe, value.get, value.get);
}

/** Suspends, so a server render waits for the counts and the page arrives with them. */
function Stats() {
	const counts = useRead(stats);
	return (
		<p className="stats" aria-live="polite">
			{`${counts.total} books · ${counts.read} read`}
		</p>
	);
}

function BookList({ session }: { session: Session }) {
	const list = useRead(books);
	if (list.length === 0) return <p className="empty">The shelf is empty.</p>;
	return (
		<ul className="books" aria-label="Books">
			{list.map((book) => (
				<li key={book.id}>
					<label>
						<input
							type="checkbox"
							checked={book.read}
							onChange={() =>
								submit(session, (store) => store.write(setRead, { id: book.id, read: !book.read }))
							}
						/>
						<span>{book.title}</span>
					</label>
					<button
						type="button"
						aria-label={`Remove ${book.title}`}
						onClick={() => submit(session, (store) => store.write(removeBook, { id: book.id }))}
					>
						Remove
					</button>
				</li>
			))}
		</ul>
	);
}

/** Marking a book read moves it here before the server replies. */
function FinishedList() {
	const list = useRead(finished);
	return (
		<section className="finished" aria-label="Finished">
			<h2>Finished</h2>
			{list.length === 0 ? (
				<p className="empty">Nothing finished yet.</p>
			) : (
				<ol>
					{list.map((book) => (
						<li key={book.id}>{book.title}</li>
					))}
				</ol>
			)}
		</section>
	);
}

function AddForm({ session }: { session: Session }) {
	const [title, setTitle] = useState('');
	return (
		<form
			className="add"
			onSubmit={(event) => {
				event.preventDefault();
				setTitle('');
				void submit(session, (store) => store.write(addBook, { title }));
			}}
		>
			<input
				aria-label="Book title"
				placeholder="Add a book"
				value={title}
				onChange={(event) => setTitle(event.currentTarget.value)}
			/>
			<button type="submit">Add</button>
		</form>
	);
}

function Outcome({ session }: { session: Session }) {
	const outcome = useExternal(session.outcome);
	return (
		<p className="outcome" role="status">
			{outcomeText(outcome)}
			{outcome.kind === 'unknown' && (
				<button type="button" onClick={() => checkSaved(session, outcome.operationId)}>
					Check saved result
				</button>
			)}
		</p>
	);
}

function Faults({ session }: { session: Session }) {
	const { faults } = session;
	return (
		<fieldset className="faults">
			<legend>Network faults</legend>
			<label>
				<input
					type="checkbox"
					defaultChecked={faults.dropNextReply}
					onChange={(event) => {
						faults.dropNextReply = event.currentTarget.checked;
					}}
				/>
				Lose the next reply
			</label>
			<label>
				<input
					type="checkbox"
					defaultChecked={faults.offline}
					onChange={(event) => {
						faults.offline = event.currentTarget.checked;
					}}
				/>
				Offline
			</label>
		</fieldset>
	);
}

function Network({ session }: { session: Session }) {
	const entries = useExternal(session.network);
	return (
		<section className="network" aria-label="Network">
			<h2>Network</h2>
			<ol>
				{entries.map((entry) => (
					<li key={entry.id}>{entry.label}</li>
				))}
			</ol>
		</section>
	);
}

class LoadError extends Component<{ children: ReactNode }, { error: Error | null }> {
	override state = { error: null as Error | null };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	override render() {
		return this.state.error ? (
			<p className="error" role="alert">
				{`Could not load the shelf: ${this.state.error.message}`}
			</p>
		) : (
			this.props.children
		);
	}
}

function ShelfBody({ session }: { session: Session }) {
	return (
		<DataProvider store={session.store}>
			<Suspense fallback={<p className="stats">Counting…</p>}>
				<Stats />
			</Suspense>
			<AddForm session={session} />
			<Outcome session={session} />
			<LoadError>
				<Suspense fallback={<p className="loading">Loading the shelf…</p>}>
					<BookList session={session} />
				</Suspense>
			</LoadError>
			<Suspense fallback={<p className="loading">Loading finished books…</p>}>
				<FinishedList />
			</Suspense>
			<div className="tools">
				<Faults session={session} />
				<Network session={session} />
			</div>
		</DataProvider>
	);
}

/** `session` is the first account's; a server render passes one around its own store. */
export function App(props: { session: Session }) {
	const [session, setSession] = useState(props.session);
	return (
		<main className="shelf">
			<header>
				<h1>Shelf — React</h1>
				<nav aria-label="Account">
					{ACCOUNTS.map((account) => (
						<button
							key={account}
							type="button"
							aria-pressed={session.account === account}
							onClick={() => {
								if (session.account === account) return;
								// The old account's store is retired: its values clear and late replies are ignored.
								setSession(openSession(account, namespaceFrom(location.search)));
								session.store.retire();
							}}
						>
							{account}
						</button>
					))}
				</nav>
			</header>
			<ShelfBody key={session.account} session={session} />
		</main>
	);
}
