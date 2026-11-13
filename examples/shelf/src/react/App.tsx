/** @jsxImportSource react */
import { listen } from 'octane/data';
import { Suspense, useState, useSyncExternalStore, Component, type ReactNode } from 'react';
import { DataProvider, useDataStore, useFeed, useForm, useRead } from 'octane/data/react';
import {
	addBook,
	books,
	finished,
	removeBook,
	setRead,
	shelfChanges,
	stats,
	type Book,
} from '../shared/contracts.ts';
import {
	ACCOUNTS,
	checkSaved,
	formMessage,
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

const LIVE = { connecting: 'Connecting…', live: 'Live', offline: 'Reconnecting…' };

/** Listens to the shelf's changes, so another tab's edit shows here at once. */
function Live() {
	const feed = useFeed(listen(useDataStore(), shelfChanges));
	return (
		<p className="live" data-feed={feed.status}>
			{LIVE[feed.status]}
		</p>
	);
}

/** Suspends, so a server render waits for the counts and the page arrives with them. */
function Stats() {
	const counts = useRead(useDataStore().read(stats));
	return (
		<p className="stats" aria-live="polite">
			{`${counts.total} books · ${counts.read} read`}
		</p>
	);
}

function BookList({ session }: { session: Session }) {
	const list = useRead(useDataStore().read(books));
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
					<RemoveForm session={session} book={book} />
				</li>
			))}
		</ul>
	);
}

/** Marking a book read moves it here before the server replies. */
function FinishedList() {
	const list = useRead(useDataStore().read(finished));
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

/** A native form per row: removing works before hydration and without JavaScript. */
function RemoveForm({ session, book }: { session: Session; book: Book }) {
	const remove = useForm(removeBook, book.id);
	return (
		<form {...remove.attrs} onSubmit={(event) => submit(session, () => remove.submit(event))}>
			{remove.hidden({ id: book.id })}
			<button aria-label={`Remove ${book.title}`}>Remove</button>
		</form>
	);
}

/**
 * Posts natively until hydrated, then through the store. A refused submission
 * keeps what was typed and shows why, after either path.
 */
function AddForm({ session }: { session: Session }) {
	const add = useForm(addBook);
	const message = formMessage(add, 'title');
	return (
		<form
			className="add"
			{...add.attrs}
			onSubmit={(event) => submit(session, () => add.submit(event))}
		>
			{add.hidden()}
			<input
				name="title"
				aria-label="Book title"
				aria-invalid={message ? 'true' : undefined}
				placeholder="Add a book"
				defaultValue={add.values.title ?? ''}
			/>
			<button type="submit">Add</button>
			{message && <p className="field-error">{message}</p>}
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
			<Live />
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
