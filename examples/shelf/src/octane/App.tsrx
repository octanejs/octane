import { useState, useSyncExternalStore } from 'octane';
import type { OctaneNode } from 'octane';
import { DataProvider, useRead } from 'octane/data/octane';
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
function Stats() @{
	const counts = useRead(stats);
	<p class="stats" aria-live="polite">{`${counts.total} books · ${counts.read} read`}</p>
}

function BookList(props: { session: Session }) @{
	const list = useRead(books);
	const session = props.session;
	@if (list.length === 0) {
		<p class="empty">The shelf is empty.</p>
	} @else {
		<ul class="books" aria-label="Books">
			@for (const book of list; key book.id) {
				<li>
					<label>
						<input
							type="checkbox"
							checked={book.read}
							onChange={() =>
								submit(session, (store) => store.write(setRead, { id: book.id, read: !book.read }))
							}
						/>
						<span>{book.title as string}</span>
					</label>
					<button
						type="button"
						aria-label={`Remove ${book.title}`}
						onClick={() => submit(session, (store) => store.write(removeBook, { id: book.id }))}
					>
						Remove
					</button>
				</li>
			}
		</ul>
	}
}

/** Marking a book read moves it here before the server replies. */
function FinishedList() @{
	const list = useRead(finished);
	<section class="finished" aria-label="Finished">
		<h2>Finished</h2>
		@if (list.length === 0) {
			<p class="empty">Nothing finished yet.</p>
		} @else {
			<ol>
				@for (const book of list; key book.id) {
					<li>{book.title as string}</li>
				}
			</ol>
		}
	</section>
}

function AddForm(props: { session: Session }) @{
	const [title, setTitle] = useState('');
	<form
		class="add"
		onSubmit={(event: SubmitEvent) => {
			event.preventDefault();
			setTitle('');
			submit(props.session, (store) => store.write(addBook, { title }));
		}}
	>
		<input
			aria-label="Book title"
			placeholder="Add a book"
			value={title}
			onInput={(event: InputEvent) => setTitle((event.currentTarget as HTMLInputElement).value)}
		/>
		<button type="submit">Add</button>
	</form>
}

function Outcome(props: { session: Session }) @{
	const outcome = useExternal(props.session.outcome);
	<p class="outcome" role="status">
		{outcomeText(outcome) as string}
		@if (outcome.kind === 'unknown') {
			<button type="button" onClick={() => checkSaved(props.session, outcome.operationId)}>
				Check saved result
			</button>
		}
	</p>
}

function Faults(props: { session: Session }) @{
	const faults = props.session.faults;
	<fieldset class="faults">
		<legend>Network faults</legend>
		<label>
			<input
				type="checkbox"
				defaultChecked={faults.dropNextReply}
				onChange={(event: Event) => {
					faults.dropNextReply = (event.currentTarget as HTMLInputElement).checked;
				}}
			/>
			Lose the next reply
		</label>
		<label>
			<input
				type="checkbox"
				defaultChecked={faults.offline}
				onChange={(event: Event) => {
					faults.offline = (event.currentTarget as HTMLInputElement).checked;
				}}
			/>
			Offline
		</label>
	</fieldset>
}

function Network(props: { session: Session }) @{
	const entries = useExternal(props.session.network);
	<section class="network" aria-label="Network">
		<h2>Network</h2>
		<ol>
			@for (const entry of entries; key entry.id) {
				<li>{entry.label as string}</li>
			}
		</ol>
	</section>
}

/** One account's shelf. A new account gets a new store, so nothing carries over. */
export function ShelfBody(props: { session: Session; children?: OctaneNode }) @{
	const session = props.session;
	<DataProvider store={session.store}>
		@try {
			<Stats />
		} @pending {
			<p class="stats">Counting…</p>
		}
		<AddForm session={session} />
		<Outcome session={session} />
		@try {
			<BookList session={session} />
		} @pending {
			<p class="loading">Loading the shelf…</p>
		} @catch (error) {
			<p class="error" role="alert">
				{`Could not load the shelf: ${(error as Error).message}` as string}
			</p>
		}
		@try {
			<FinishedList />
		} @pending {
			<p class="loading">Loading finished books…</p>
		}
		<div class="tools">
			<Faults session={session} />
			<Network session={session} />
		</div>
		{props.children}
	</DataProvider>
}

export function App(props: {
	title: string;
	/** The first account's session; a server render passes one around its own store. */
	session: Session;
	Island?: (props: { session: Session }) => OctaneNode;
}) @{
	const Island = props.Island;
	const [session, setSession] = useState(props.session);
	<main class="shelf">
		<header>
			<h1>{props.title as string}</h1>
			<nav aria-label="Account">
				@for (const account of ACCOUNTS; key account) {
					<button
						type="button"
						aria-pressed={session.account === account}
						onClick={() => {
							if (session.account === account) return;
							// The old account's store is retired: its values clear and late replies are ignored.
							setSession(openSession(account, namespaceFrom(location.search)));
							session.store.retire();
						}}
					>
						{account as string}
					</button>
				}
			</nav>
		</header>
		<ShelfBody key={session.account} session={session}>
			@if (Island) {
				<Island session={session} />
			}
		</ShelfBody>
	</main>
}
